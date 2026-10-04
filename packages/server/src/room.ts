import {
  createGame,
  DEFAULT_MAP_ID,
  MAP_DEFS,
  MAX_ROOM_PLAYERS,
  MIN_START_PLAYERS,
  NO_INPUT,
  projectSnapshot,
  ROOM_COLORS,
  step,
} from '@pfandraiders/core';
import type {
  ErrorCode,
  GameState,
  Input,
  MapData,
  MapId,
  RoomPhase,
  RosterEntry,
  ServerMessage,
} from '@pfandraiders/core';
import { randomUUID } from 'node:crypto';
import { SERVER_CONFIG } from './config';

/** Übertragungsweg zu einem Spieler. Der Raum kennt keine Sockets. */
export interface Conn {
  send(msg: ServerMessage): void;
  /** Verbindung beenden (optional; der Raum selbst nutzt es nicht) */
  close?(code: number, reason: string): void;
}

export interface Member {
  id: string;
  name: string;
  color: number;
  token: string;
  conn: Conn | null;
  disconnectedAt: number | null;
  /** Token ist nach der Frist ungültig */
  expired: boolean;
  /** Zuletzt gesendete Eingabe (der Kaufbefehl bleibt bis zum nächsten Tick erhalten) */
  input: Input;
  ackSeq: number;
}

export interface RoomOptions {
  /** Kennung der Karte (Standard DEFAULT_MAP_ID); bestimmt die Karte und wird mit start gesendet. */
  mapId?: MapId;
  /** Überschreibt die Kartendaten von mapId (für Tests). */
  map?: MapData;
  stepMs?: number;
  graceMs?: number;
  emptyMs?: number;
  roundMs?: number;
  now?: () => number;
  random?: () => number;
}

export type Result<T> = { ok: true; value: T } | { ok: false; code: ErrorCode; message: string };

function fail<T>(code: ErrorCode, message: string): Result<T> {
  return { ok: false, code, message };
}

export class Room {
  phase: RoomPhase = 'lobby';
  members: Member[] = [];
  state: GameState | null = null;
  private nextId = 1;
  private lastActive: number;
  private readonly mapId: MapId;
  private readonly map: MapData;
  private readonly stepMs: number;
  private readonly graceMs: number;
  private readonly emptyMs: number;
  private readonly roundMs: number | undefined;
  private readonly now: () => number;
  private readonly random: () => number;

  constructor(
    readonly code: string,
    opts: RoomOptions = {},
  ) {
    this.mapId = opts.mapId ?? DEFAULT_MAP_ID;
    this.map = opts.map ?? MAP_DEFS[this.mapId].map;
    this.stepMs = opts.stepMs ?? SERVER_CONFIG.stepMs;
    this.graceMs = opts.graceMs ?? SERVER_CONFIG.graceMs;
    // Ein leerer Raum darf nie vor Ablauf der Rückkehrfrist verschwinden
    this.emptyMs = Math.max(opts.emptyMs ?? SERVER_CONFIG.emptyRoomMs, this.graceMs + 15_000);
    this.roundMs = opts.roundMs;
    this.now = opts.now ?? (() => Date.now());
    this.random = opts.random ?? Math.random;
    this.lastActive = this.now();
  }

  /** Host = erster verbundener Spieler in Beitrittsreihenfolge. */
  hostId(): string {
    return this.members.find((m) => m.conn !== null)?.id ?? '';
  }

  roster(): RosterEntry[] {
    return this.members.map((m) => ({ id: m.id, name: m.name, color: m.color, connected: m.conn !== null }));
  }

  lobbyMessage(): ServerMessage {
    return { t: 'lobby', room: this.code, host: this.hostId(), players: this.roster(), phase: this.phase };
  }

  private broadcastLobby(): void {
    const msg = this.lobbyMessage();
    for (const m of this.members) m.conn?.send(msg);
  }

  private connected(): Member[] {
    return this.members.filter((m) => m.conn !== null);
  }

  /** Markiert Mitglieder nach der Frist als abgelaufen; ausserhalb der Runde fliegen sie raus. */
  private expireMembers(): void {
    const now = this.now();
    for (const m of this.members) {
      if (m.disconnectedAt !== null && now - m.disconnectedAt > this.graceMs) m.expired = true;
    }
    if (this.phase !== 'running') {
      this.members = this.members.filter((m) => !(m.conn === null && m.expired));
    }
  }

  join(name: string, conn: Conn, token?: string): Result<Member> {
    this.lastActive = this.now();
    this.expireMembers();

    // Rückkehr mit Token (nur innerhalb der Frist)
    if (token !== undefined) {
      const back = this.members.find((m) => m.token === token && !m.expired);
      if (back) {
        back.conn = conn;
        back.disconnectedAt = null;
        conn.send({ t: 'joined', room: this.code, you: back.id, token: back.token });
        if (this.phase === 'running' && this.state) this.sendStart(back);
        this.broadcastLobby();
        return { ok: true, value: back };
      }
    }

    if (this.phase === 'running') return fail('already_started', 'Die Runde läuft bereits.');
    if (this.members.length >= MAX_ROOM_PLAYERS) return fail('room_full', 'Der Raum ist voll.');
    if (this.members.some((m) => m.name.toLowerCase() === name.toLowerCase())) {
      return fail('name_taken', 'Der Name ist schon vergeben.');
    }

    const used = new Set(this.members.map((m) => m.color));
    const free = ROOM_COLORS.find((c) => !used.has(c));
    const member: Member = {
      id: `p${this.nextId++}`,
      name,
      color: free ?? ROOM_COLORS[this.members.length % ROOM_COLORS.length],
      token: randomUUID(),
      conn,
      disconnectedAt: null,
      expired: false,
      input: { ...NO_INPUT },
      ackSeq: 0,
    };
    this.members.push(member);
    conn.send({ t: 'joined', room: this.code, you: member.id, token: member.token });
    this.broadcastLobby();
    return { ok: true, value: member };
  }

  /** Verbindung weg. In der Lobby verschwindet der Spieler, im Spiel steht seine Figur still weiter. */
  leave(conn: Conn): void {
    const member = this.members.find((m) => m.conn === conn);
    if (!member) return;
    this.lastActive = this.now();
    member.conn = null;
    member.disconnectedAt = this.now();
    member.input = { ...NO_INPUT };
    if (this.phase !== 'running') {
      this.members = this.members.filter((m) => m !== member);
    }
    this.broadcastLobby();
  }

  /**
   * Absichtliches Verlassen: der Platz wird sofort frei, das Token gilt nicht mehr (keine Frist).
   * In der Lobby und nach Rundenende verschwindet der Spieler; während der Runde bleibt die Figur
   * als Statist stehen (ihr Geld zählt für die Rangliste) und fällt wie ein abgelaufener Platz heraus.
   */
  leaveForGood(conn: Conn): void {
    const member = this.members.find((m) => m.conn === conn);
    if (!member) return;
    this.lastActive = this.now();
    member.conn = null;
    member.disconnectedAt = this.now();
    member.expired = true;
    member.input = { ...NO_INPUT };
    if (this.phase !== 'running') {
      this.members = this.members.filter((m) => m !== member);
    }
    this.broadcastLobby();
  }

  start(byId: string): Result<void> {
    this.lastActive = this.now();
    if (byId === '' || this.hostId() !== byId) return fail('not_host', 'Nur der Host kann starten.');
    if (this.phase === 'running') return fail('already_started', 'Die Runde läuft schon.');
    if (this.connected().length < MIN_START_PLAYERS) {
      return fail('need_players', 'Mindestens zwei Spieler nötig.');
    }
    // Getrennte Spieler fallen zwischen den Runden heraus
    this.members = this.connected();
    const seed = Math.floor(this.random() * 0x100000000) >>> 0;
    this.state = createGame(seed, this.map, this.members.map((m) => m.id), {
      roundMs: this.roundMs,
    });
    for (const m of this.members) {
      m.input = { ...NO_INPUT };
      m.ackSeq = 0;
    }
    this.phase = 'running';
    for (const m of this.members) this.sendStart(m);
    this.broadcastLobby();
    return { ok: true, value: undefined };
  }

  private sendStart(m: Member): void {
    if (!this.state || !m.conn) return;
    m.conn.send({
      t: 'start',
      mapId: this.mapId,
      map: this.state.map,
      you: m.id,
      players: this.roster(),
      snap: projectSnapshot(this.state, m.id),
    });
  }

  /** Letzte Eingabe merken. Ein noch nicht verbrauchter Kaufbefehl bleibt erhalten. */
  setInput(m: Member, seq: number, input: Input): void {
    if (m.conn === null) return;
    this.lastActive = this.now();
    if (Number.isSafeInteger(seq) && seq >= 0) m.ackSeq = Math.max(m.ackSeq, seq);
    m.input = { ...input, buy: input.buy ?? m.input.buy };
  }

  /** Ein Serverschritt: Eingaben anwenden, `step`, Snapshots senden. */
  tick(): void {
    const now = this.now();
    this.expireMembers();
    if (this.phase !== 'running' || !this.state) return;
    if (this.connected().length > 0) this.lastActive = now;

    const inputs: Record<string, Input> = {};
    for (const m of this.members) inputs[m.id] = m.conn ? m.input : NO_INPUT;
    step(this.state, inputs, this.stepMs);
    // Einmalige Befehle sind verbraucht
    for (const m of this.members) m.input = { ...m.input, buy: null };

    for (const m of this.members) {
      m.conn?.send({ t: 'snap', snap: projectSnapshot(this.state, m.id), ack: m.ackSeq });
    }
    if (this.state.phase === 'ended') {
      this.phase = 'ended';
      this.broadcastLobby();
    }
  }

  /** Leerer Raum, der lange genug leer war. */
  isDead(): boolean {
    return this.connected().length === 0 && this.now() - this.lastActive >= this.emptyMs;
  }
}
