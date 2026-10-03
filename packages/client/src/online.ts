import { stateFromSnapshot } from '@pfandraiders/core';
import type {
  ClientMessage,
  ErrorCode,
  GameState,
  Input,
  MapData,
  RosterEntry,
  ServerMessage,
  Snapshot,
} from '@pfandraiders/core';
import { NO_INPUT } from '@pfandraiders/core';
import type { GameConnection } from './connection';
import { interpolateSnapshot } from './interpolate';
import { isValidSnapshot } from './snapshotGuard';

/** Fremde Figuren werden so viel später gezeigt, damit zwischen zwei Snapshots interpoliert werden kann. */
export const INTERP_DELAY_MS = 100;
/** Ungeänderte Eingaben werden trotzdem so oft wiederholt (Lebenszeichen). */
export const HEARTBEAT_MS = 100;
const MAX_BUFFER = 32;
/** Größter Zeitsprung pro update() (wie in LocalConnection). */
const MAX_FRAME_MS = 250;

export interface SocketLike {
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((e: { data: string }) => void) | null;
  onclose: (() => void) | null;
}

export type SocketFactory = (url: string) => SocketLike;

export type ConnStatus = 'idle' | 'connecting' | 'open' | 'closed';

interface Buffered {
  at: number;
  snap: Snapshot;
}

function sameInput(a: Input, b: Input): boolean {
  return (
    a.moveX === b.moveX &&
    a.moveY === b.moveY &&
    a.action === b.action &&
    a.steal === b.steal &&
    a.buy === b.buy
  );
}

export class OnlineConnection implements GameConnection {
  localPlayerIds: string[] = [];
  status: ConnStatus = 'idle';
  room = '';
  you = '';
  token = '';
  host = '';
  roster: RosterEntry[] = [];

  onJoined: (() => void) | null = null;
  onLobby: (() => void) | null = null;
  onStart: (() => void) | null = null;
  onError: ((code: ErrorCode, message: string) => void) | null = null;
  onClosed: (() => void) | null = null;

  private socket: SocketLike | null = null;
  private map: MapData | null = null;
  private buffer: Buffered[] = [];
  private clock = 0;
  private seq = 0;
  private pendingInput: Input = { ...NO_INPUT };
  private pendingBuy: Input['buy'] = null;
  private lastSent: Input | null = null;
  private sinceSent = 0;
  private rendered: GameState | null = null;
  private warned = false;
  private lastName = '';

  constructor(
    private readonly url: string,
    private readonly factory: SocketFactory,
  ) {}

  connect(): void {
    this.status = 'connecting';
    let socket: SocketLike;
    try {
      socket = this.factory(this.url);
    } catch (err) {
      this.status = 'closed';
      throw err;
    }
    this.socket = socket;
    this.attach(socket, undefined);
  }

  /** Name des lokalen Spielers (aus create/join), für die Wiederverbindung. */
  playerName(): string {
    return this.lastName;
  }

  /**
   * Öffnet nach einem Verbindungsabbruch ein neues Socket und tritt mit dem Token wieder bei.
   * Der Spielzustand bleibt erhalten, bis der Server "start" schickt.
   */
  reopen(): void {
    if (!this.room || !this.lastName || !this.token) throw new Error('cannot reopen without room, name and token');
    const old = this.socket;
    this.socket = null;
    if (old) {
      old.onopen = null;
      old.onmessage = null;
      old.onclose = null;
      try {
        old.close();
      } catch {
        // schon geschlossen
      }
    }
    this.status = 'connecting';
    let socket: SocketLike;
    try {
      socket = this.factory(this.url);
    } catch (err) {
      this.status = 'closed';
      throw err;
    }
    this.socket = socket;
    this.attach(socket, () => this.join(this.room, this.lastName, this.token));
  }

  private attach(socket: SocketLike, afterOpen: (() => void) | undefined): void {
    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.status = 'open';
      afterOpen?.();
    };
    socket.onmessage = (e) => {
      if (this.socket === socket) this.handle(e.data);
    };
    socket.onclose = () => {
      if (this.socket !== socket) return; // ersetztes Socket: späte Meldung ignorieren
      this.status = 'closed';
      this.onClosed?.();
    };
  }

  close(): void {
    this.socket?.close();
  }

  private sendMsg(msg: ClientMessage): void {
    this.socket?.send(JSON.stringify(msg));
  }

  create(name: string): void {
    this.lastName = name;
    this.sendMsg({ t: 'create', name });
  }

  join(room: string, name: string, token?: string): void {
    this.lastName = name;
    this.sendMsg(token ? { t: 'join', room, name, token } : { t: 'join', room, name });
  }

  isHost(): boolean {
    return this.you !== '' && this.host === this.you;
  }

  /** Nur der Host darf starten (der Server prüft zusätzlich). */
  requestStart(): void {
    if (this.isHost()) this.sendMsg({ t: 'start' });
  }

  /** Alias für requestStart. */
  startGame(): void {
    this.requestStart();
  }

  private handle(raw: string): void {
    let msg: ServerMessage;
    try {
      msg = JSON.parse(raw) as ServerMessage;
    } catch {
      return;
    }
    switch (msg?.t) {
      case 'joined':
        this.room = msg.room;
        this.you = msg.you;
        this.token = msg.token;
        this.localPlayerIds = [msg.you];
        this.onJoined?.();
        break;
      case 'lobby':
        this.host = msg.host;
        this.roster = msg.players;
        this.onLobby?.();
        break;
      case 'start':
        if (!msg.map || !isValidSnapshot(msg.snap)) break;
        this.map = msg.map;
        this.you = msg.you;
        this.localPlayerIds = [msg.you];
        this.roster = msg.players;
        this.buffer = [{ at: this.clock, snap: msg.snap }];
        this.rendered = stateFromSnapshot(msg.map, msg.snap);
        this.seq = 0;
        this.lastSent = null;
        this.onStart?.();
        break;
      case 'snap':
        if (!this.map || !isValidSnapshot(msg.snap)) break;
        // Doppelte oder rückwärts laufende Snapshots verwerfen.
        if (this.buffer.length > 0 && msg.snap.tick <= this.buffer[this.buffer.length - 1].snap.tick) break;
        this.buffer.push({ at: this.clock, snap: msg.snap });
        if (this.buffer.length > MAX_BUFFER) this.buffer.splice(0, this.buffer.length - MAX_BUFFER);
        break;
      case 'error':
        this.onError?.(msg.code, msg.message);
        break;
      default:
        break;
    }
  }

  setInput(playerId: string, input: Input): void {
    if (playerId !== this.you) return;
    // Ein Kaufbefehl geht nicht verloren, wenn der nächste Frame "nicht gedrückt" meldet.
    if (input.buy !== null) this.pendingBuy = input.buy;
    this.pendingInput = { ...input, buy: null };
  }

  update(deltaMs: number): void {
    const dt = Number.isFinite(deltaMs) && deltaMs > 0 ? Math.min(deltaMs, MAX_FRAME_MS) : 0;
    this.clock += dt;
    this.sinceSent += dt;
    this.sendInputIfNeeded();
    try {
      this.rendered = this.computeRendered();
    } catch {
      // Beschädigter Snapshot im Puffer: neuesten verwerfen, letzten guten Zustand behalten.
      this.buffer.pop();
      if (!this.warned) {
        this.warned = true;
        console.warn('OnlineConnection: dropped a snapshot that could not be rendered');
      }
    }
  }

  private sendInputIfNeeded(): void {
    if (!this.map || this.status !== 'open') return;
    const input: Input = { ...this.pendingInput, buy: this.pendingBuy };
    const changed = this.lastSent === null || !sameInput(this.lastSent, input);
    if (!changed && this.sinceSent < HEARTBEAT_MS) return;
    this.sendMsg({ t: 'input', seq: ++this.seq, input });
    this.lastSent = input;
    this.sinceSent = 0;
    this.pendingBuy = null;
  }

  private computeRendered(): GameState | null {
    if (!this.map || this.buffer.length === 0) return this.rendered;
    const latest = this.buffer[this.buffer.length - 1];
    const renderTime = this.clock - INTERP_DELAY_MS;
    let snap = latest.snap;
    if (this.buffer.length > 1 && renderTime < latest.at) {
      let i = this.buffer.length - 1;
      while (i > 0 && this.buffer[i - 1].at > renderTime) i--;
      const newer = this.buffer[i];
      const older = this.buffer[Math.max(0, i - 1)];
      const span = newer.at - older.at;
      const alpha = span > 0 ? (renderTime - older.at) / span : 1;
      snap = interpolateSnapshot(older.snap, newer.snap, alpha, latest.snap, this.you);
    }
    return stateFromSnapshot(this.map, snap);
  }

  getState(): GameState {
    if (!this.rendered) throw new Error('no game state yet');
    return this.rendered;
  }

  bufferedSnapshots(): number {
    return this.buffer.length;
  }
}
