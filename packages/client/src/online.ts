import { cleanMapName, DEFAULT_MAP_ID, DEFAULT_ROUND_MS, DEFAULT_ROUNDS, isMapId, isRounds, mapName, parseServerBuild, stateFromSnapshot } from '@pfandraiders/core';
import type {
  ChatMessage,
  ClientMessage,
  ErrorCode,
  GameState,
  Input,
  MapData,
  MapId,
  Progress,
  RankEntry,
  RoomInfo,
  RoomVisibility,
  RoomPhase,
  RosterEntry,
  ServerBuild,
  ServerMessage,
  ShopCategory,
  ShopItemId,
  Snapshot,
} from '@pfandraiders/core';
import { NO_INPUT } from '@pfandraiders/core';
import type { SoundId } from './audioIds';
import { CLIENT_CHAT_SIZE, parseChatMessage } from './chatLogic';
import { chatSound, errorSound, rosterSounds } from './eventSounds';
import { countdownLeft } from './countdown';
import type { GameConnection } from './connection';
import { interpolateSnapshot } from './interpolate';
import { NetStats } from './netStats';
import type { NetExtra } from './netStats';
import { Predictor } from './prediction';
import { parseRoomList } from './roomList';
import { parseProgress, parseRanking } from './shopGuard';
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
  return a.moveX === b.moveX && a.moveY === b.moveY && a.action === b.action && a.steal === b.steal && a.attack === b.attack && a.spray === b.spray;
}

/** Angaben beim Anlegen eines Raums (leere Felder werden nicht gesendet) */
export interface CreateOptions {
  roomName?: string;
  visibility?: RoomVisibility;
  password?: string;
  /** Wunschfigur */
  avatar?: number;
}

/** Angaben beim Beitritt (leeres Passwort wird nicht gesendet) */
export interface JoinOptions {
  password?: string;
  avatar?: number;
}

export class OnlineConnection implements GameConnection {
  localPlayerIds: string[] = [];
  status: ConnStatus = 'idle';
  room = '';
  you = '';
  token = '';
  host = '';
  roster: RosterEntry[] = [];
  /** Karte der laufenden Runde (wird mit start gesetzt). */
  mapId: MapId = DEFAULT_MAP_ID;
  /** Karte der Lobby (Wahl des Hosts für den nächsten Serienstart) laut lobby-Nachricht. */
  lobbyMapId: MapId = DEFAULT_MAP_ID;
  /** Anzeigename dazu, wie ihn der Server schickt (auch für Karten, die dieser Client nicht kennt). */
  lobbyMapName: string = mapName(DEFAULT_MAP_ID);
  /** Build des Servers aus joined; null = unbekannt (älterer Server oder ungültige Angabe). */
  serverBuild: ServerBuild | null = null;
  /** Lobby-Chat, älteste zuerst (höchstens CLIENT_CHAT_SIZE). chathistory ersetzt die Liste. */
  chat: ChatMessage[] = [];
  /** Phase des Raums laut Server (lobby, playing, shop, final). */
  roomPhase: RoomPhase = 'lobby';
  /** Rundenzeit laut Server (Lobby-Nachricht oder start) */
  roundMs: number = DEFAULT_ROUND_MS;
  /** Eigener Stand in der Shop-Phase; null = noch keiner */
  shop: Progress | null = null;
  /** Eigenes "bereit" laut Server */
  shopReady = false;
  /** Rangliste der letzten Runde */
  ranking: RankEntry[] = [];
  /** Raumname, Sichtbarkeit und Passwortschutz laut Lobby-Nachricht */
  roomName = '';
  visibility: RoomVisibility = 'public';
  locked = false;
  /** Rundenzahl der Serie (0 = offen) und laufende Runde ab 1 (0 = noch keine) */
  rounds: number = DEFAULT_ROUNDS;
  round = 0;
  /** Letzte Raumliste vom Server */
  rooms: RoomInfo[] = [];
  /** Neue Raumliste in `rooms`. */
  onRooms: (() => void) | null = null;
  /** Phase des Raums hat gewechselt (phase-Nachricht). */
  onPhase: (() => void) | null = null;
  /** Neuer eigener Shop-Stand. */
  onShopState: (() => void) | null = null;

  onJoined: (() => void) | null = null;
  onLobby: (() => void) | null = null;
  /** Neue Chatnachricht oder neuer Verlauf in `chat`. */
  onChat: (() => void) | null = null;
  onStart: (() => void) | null = null;
  onError: ((code: ErrorCode, message: string) => void) | null = null;
  onClosed: (() => void) | null = null;
  /**
   * Töne der Verbindung, unabhängig davon, welche Szene gerade zuhört: join/leave (Spielerliste), chat (fremde
   * Nachricht), error bzw. buy_denied (Fehler vom Server, Verbindung verloren). null = still.
   */
  sound: ((id: SoundId) => void) | null = null;
  /** Spielerliste für join/leave; null = nach dem Beitritt noch keine (die erste bleibt still) */
  private soundRoster: RosterEntry[] | null = null;
  /** close() wurde aufgerufen: das folgende Schließen ist kein Verbindungsverlust */
  private closing = false;

  private socket: SocketLike | null = null;
  private map: MapData | null = null;
  private buffer: Buffered[] = [];
  private clock = 0;
  private seq = 0;
  private pendingInput: Input = { ...NO_INPUT };
  private lastSent: Input | null = null;
  private sinceSent = 0;
  private rendered: GameState | null = null;
  /** Vorhersage der eigenen Figur (Position sofort aus der eigenen Eingabe, Server korrigiert sanft). */
  private readonly predictor = new Predictor();
  private warned = false;
  private lastName = '';
  /** Netz-Diagnose (Overlay); null = aus, dann kostet sie nichts */
  private stats: NetStats | null = null;

  constructor(
    private readonly url: string,
    private readonly factory: SocketFactory,
  ) {}

  connect(): void {
    this.status = 'connecting';
    this.closing = false;
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
    this.closing = false;
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
      // Nur ein Abbruch einer offenen Verbindung in einem Raum klingt: nicht ein gescheiterter
      // Wiederverbindungsversuch und nicht das Schließen eines ungenutzten Sockets ohne Raum (Server nach 30 s)
      if (this.status === 'open' && !this.closing && this.room !== '') this.play('error');
      this.status = 'closed';
      this.onClosed?.();
    };
  }

  close(): void {
    this.closing = true;
    this.socket?.close();
  }

  private play(id: SoundId): void {
    try {
      this.sound?.(id);
    } catch {
      // Ton darf die Verbindung nie stören
    }
  }

  private sendMsg(msg: ClientMessage): void {
    this.socket?.send(JSON.stringify(msg));
  }

  create(name: string, opts: CreateOptions = {}): void {
    this.lastName = name;
    const msg: Extract<ClientMessage, { t: 'create' }> = { t: 'create', name };
    if (opts.roomName) msg.roomName = opts.roomName;
    if (opts.visibility) msg.visibility = opts.visibility;
    if (opts.password) msg.password = opts.password;
    if (opts.avatar !== undefined) msg.avatar = opts.avatar;
    this.sendMsg(msg);
  }

  /** Beitritt; ein Passwort wird nur gesendet, nie gespeichert (die Wiederverbindung nutzt das Token). */
  join(room: string, name: string, token?: string, opts: JoinOptions = {}): void {
    this.lastName = name;
    const msg: Extract<ClientMessage, { t: 'join' }> = { t: 'join', room, name };
    if (token) msg.token = token;
    if (opts.password) msg.password = opts.password;
    if (opts.avatar !== undefined) msg.avatar = opts.avatar;
    this.sendMsg(msg);
  }

  isHost(): boolean {
    return this.you !== '' && this.host === this.you;
  }

  /** Nur der Host darf starten (der Server prüft zusätzlich). */
  requestStart(): void {
    if (this.isHost()) this.sendMsg({ t: 'start' });
  }

  /** Shop-Phase: bereit oder nicht mehr bereit (der Server prüft die Phase). */
  setReady(ready: boolean): void {
    if (this.status !== 'open') return;
    this.sendMsg({ t: 'ready', ready });
  }

  /** Shop-Phase: kaufen (der Server prüft Geld, Bestand und Phase). */
  shopBuy(category: ShopCategory, item: ShopItemId, qty: number): void {
    if (this.status !== 'open') return;
    this.sendMsg({ t: 'shopBuy', category, item, qty });
  }

  /** Rundenzeit setzen (nur Host; der Server prüft zusätzlich). */
  setRoundMs(ms: number): void {
    if (this.status !== 'open' || !this.isHost()) return;
    this.sendMsg({ t: 'setRoundMs', roundMs: ms });
  }

  /** Serie beenden (nur Host, nur Shop; der Server prüft zusätzlich). */
  endSeries(): void {
    if (this.status !== 'open' || !this.isHost()) return;
    this.sendMsg({ t: 'endSeries' });
  }

  /** Öffentliche Räume abfragen (auch ohne Raum; der Server antwortet höchstens einmal pro Sekunde). */
  listRooms(): void {
    if (this.status !== 'open') return;
    this.sendMsg({ t: 'listRooms' });
  }

  /** Eigene Figur wählen (nur Lobby; der Server prüft Phase und Belegung). */
  setAvatar(avatar: number): void {
    if (this.status !== 'open') return;
    this.sendMsg({ t: 'setAvatar', avatar });
  }

  /** Rundenzahl setzen (nur Host; der Server prüft zusätzlich). */
  setRounds(rounds: number): void {
    if (this.status !== 'open' || !this.isHost()) return;
    this.sendMsg({ t: 'setRounds', rounds });
  }

  /** Karte wählen (nur Host; der Server prüft zusätzlich Phase und Kennung). */
  setMap(mapId: MapId): void {
    if (this.status !== 'open' || !this.isHost()) return;
    this.sendMsg({ t: 'setMap', mapId });
  }

  /** Nach der Endwertung alle zurück in die Lobby (nur Host; der Server prüft zusätzlich). */
  toLobby(): void {
    if (this.status !== 'open' || !this.isHost()) return;
    this.sendMsg({ t: 'toLobby' });
  }

  /** Eigene Figur laut Raumliste; null = noch unbekannt. */
  ownAvatar(): number | null {
    return this.roster.find((r) => r.id === this.you)?.avatar ?? null;
  }

  /** Raum absichtlich verlassen: der Server gibt den Platz sofort frei. Schließt die Verbindung nicht selbst. */
  leave(): void {
    if (this.status !== 'open') return;
    this.closing = true; // der Server schließt danach: kein Verbindungsverlust
    try {
      this.sendMsg({ t: 'leave' });
    } catch {
      // Socket schon im Schließen: dann verfällt der Platz nach der Frist
    }
  }

  /** Chatnachricht senden (der Server bereinigt und prüft; leerer Text wird nicht gesendet). */
  sendChat(text: string): void {
    if (this.status !== 'open' || text.trim().length === 0) return;
    this.sendMsg({ t: 'chat', text });
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
        this.serverBuild = parseServerBuild(msg.build);
        this.room = msg.room;
        this.you = msg.you;
        this.token = msg.token;
        this.localPlayerIds = [msg.you];
        this.soundRoster = null;
        this.onJoined?.();
        break;
      case 'lobby':
        this.host = msg.host;
        this.roster = msg.players;
        if (Array.isArray(msg.players)) {
          for (const id of rosterSounds(this.soundRoster, msg.players, this.you)) this.play(id);
          this.soundRoster = [...msg.players];
        }
        this.roomPhase = msg.phase;
        if (typeof msg.roundMs === 'number' && Number.isFinite(msg.roundMs) && msg.roundMs > 0) this.roundMs = msg.roundMs;
        if (typeof msg.roomName === 'string') this.roomName = msg.roomName;
        if (msg.visibility === 'public' || msg.visibility === 'private') this.visibility = msg.visibility;
        if (typeof msg.locked === 'boolean') this.locked = msg.locked;
        if (isRounds(msg.rounds)) this.rounds = msg.rounds;
        if (isMapId(msg.mapId)) this.lobbyMapId = msg.mapId;
        // Der Name vom Server hat Vorrang (auch für unbekannte Karten), sonst der eigene Name der Karte
        const shownMap = cleanMapName(msg.mapName);
        if (shownMap !== null) this.lobbyMapName = shownMap;
        else if (isMapId(msg.mapId)) this.lobbyMapName = mapName(msg.mapId);
        this.onLobby?.();
        break;
      case 'start':
        if (!isMapId(msg.mapId)) console.warn('start mit unbekannter Karte verworfen:', msg.mapId);
        if (!msg.map || !isMapId(msg.mapId) || !isValidSnapshot(msg.snap)) break;
        this.map = msg.map;
        this.mapId = msg.mapId;
        this.you = msg.you;
        this.localPlayerIds = [msg.you];
        this.roster = msg.players;
        if (Array.isArray(msg.players)) this.soundRoster = [...msg.players];
        this.buffer = [{ at: this.clock, snap: msg.snap }];
        this.rendered = stateFromSnapshot(msg.map, msg.snap);
        this.predictor.reset(msg.snap.players[msg.you] ?? null);
        this.seq = 0;
        this.lastSent = null;
        if (typeof msg.roundMs === 'number' && Number.isFinite(msg.roundMs) && msg.roundMs > 0) this.roundMs = msg.roundMs;
        if (isRounds(msg.rounds)) this.rounds = msg.rounds;
        if (typeof msg.round === 'number' && Number.isInteger(msg.round) && msg.round >= 1) this.round = msg.round;
        this.roomPhase = 'playing';
        this.onStart?.();
        break;
      case 'snap':
        if (!this.map || !isValidSnapshot(msg.snap)) break;
        // Doppelte oder rückwärts laufende Snapshots verwerfen.
        if (this.buffer.length > 0 && msg.snap.tick <= this.buffer[this.buffer.length - 1].snap.tick) break;
        this.buffer.push({ at: this.clock, snap: msg.snap });
        if (this.buffer.length > MAX_BUFFER) this.buffer.splice(0, this.buffer.length - MAX_BUFFER);
        {
          const me = msg.snap.players[this.you];
          if (me) this.predictor.onSnapshot({ x: me.x, y: me.y }, msg.ack, this.moving(), this.clock);
        }
        if (this.stats) {
          this.stats.noteSnapshot(msg.ack);
          this.stats.notePrediction(this.predictor.corrections, this.predictor.snaps);
        }
        break;
      case 'chat': {
        const chat = parseChatMessage(msg);
        if (!chat) break;
        this.chat.push(chat);
        if (this.chat.length > CLIENT_CHAT_SIZE) this.chat.splice(0, this.chat.length - CLIENT_CHAT_SIZE);
        {
          const id = chatSound(chat, this.you);
          if (id) this.play(id);
        }
        this.onChat?.();
        break;
      }
      case 'chathistory': {
        if (!Array.isArray(msg.messages)) break;
        const list: ChatMessage[] = [];
        for (const raw of msg.messages.slice(-CLIENT_CHAT_SIZE)) {
          const chat = parseChatMessage(raw);
          if (chat) list.push(chat);
        }
        this.chat = list;
        this.onChat?.();
        break;
      }
      case 'phase':
        if (msg.phase !== 'lobby' && msg.phase !== 'playing' && msg.phase !== 'shop' && msg.phase !== 'final') break;
        this.roomPhase = msg.phase;
        this.onPhase?.();
        break;
      case 'shopState': {
        const you = parseProgress(msg.you);
        if (!you || typeof msg.ready !== 'boolean') break;
        this.shop = you;
        this.shopReady = msg.ready;
        this.onShopState?.();
        break;
      }
      case 'ranking': {
        const entries = parseRanking(msg.entries);
        if (entries) this.ranking = entries;
        break;
      }
      case 'rooms': {
        const rooms = parseRoomList(msg.rooms);
        if (!rooms) break;
        this.rooms = rooms;
        this.onRooms?.();
        break;
      }
      case 'error':
        this.play(errorSound(msg.code));
        this.onError?.(msg.code, msg.message);
        break;
      default:
        break;
    }
  }

  setInput(playerId: string, input: Input): void {
    if (playerId !== this.you) return;
    this.pendingInput = { ...input };
  }

  update(deltaMs: number): void {
    this.stats?.noteFrame();
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
    this.predictOwn(dt);
  }

  private moving(): boolean {
    return this.pendingInput.moveX !== 0 || this.pendingInput.moveY !== 0;
  }

  /**
   * Eigene Figur: Position aus der Vorhersage (dieselbe Eingabe, die gesendet wird; bei offenem Menü also
   * NO_INPUT), alle anderen Felder (Geld, Flaschen, Zustand, Gesundheit ...) aus dem neuesten Snapshot.
   */
  private predictOwn(dt: number): void {
    const rendered = this.rendered;
    if (!rendered || !this.map || this.buffer.length === 0) return;
    // Container und Zustand aus dem Puffer, nicht aus `rendered` (das trägt schon die vorhergesagte Position)
    const latest = this.buffer[this.buffer.length - 1].snap;
    const server = latest.players[this.you];
    // Ohne offene Verbindung geht keine Eingabe hinaus, nach Rundenende rechnet der Server nicht mehr:
    // in beiden Fällen bleibt die Figur auf dem Server stehen, hier ebenso. Während des Countdowns vor der Runde
    // bewegt der Server niemanden: keine Vorhersage (die Eingabe geht trotzdem hinaus und wirkt ab "LOS!")
    const live = this.status === 'open' && latest.phase !== 'ended' && countdownLeft(latest) === 0;
    const input = live ? this.pendingInput : NO_INPUT;
    this.predictor.step(dt, input, server, this.map, this.clock);
    const pos = this.predictor.position;
    const shown = rendered.players[this.you];
    if (!pos || !shown) return;
    // Kopie: `rendered` teilt sich die Spielerobjekte mit dem Snapshot im Puffer
    rendered.players = { ...rendered.players, [this.you]: { ...shown, x: pos.x, y: pos.y } };
  }

  private sendInputIfNeeded(): void {
    if (!this.map || this.status !== 'open') return;
    const input: Input = { ...this.pendingInput };
    const changed = this.lastSent === null || !sameInput(this.lastSent, input);
    if (!changed && this.sinceSent < HEARTBEAT_MS) return;
    this.sendMsg({ t: 'input', seq: ++this.seq, input });
    this.predictor.noteSent(this.seq, this.clock);
    this.stats?.noteSent(this.seq);
    this.lastSent = input;
    this.sinceSent = 0;
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

  /** Netz-Diagnose ein- oder ausschalten; `now` ist die Uhr für die Messung (echte Zeit, nicht die Spieluhr). */
  enableNetStats(on: boolean, now: () => number = () => performance.now()): void {
    this.stats = on ? (this.stats ?? new NetStats(now)) : null;
  }

  /** Messwerte der Netz-Diagnose; null = aus. */
  get netStats(): NetStats | null {
    return this.stats;
  }

  /** Puffer und Vorhersage für die Netz-Diagnose (nur lesen). */
  netInfo(): NetExtra {
    const renderTime = this.clock - INTERP_DELAY_MS;
    return {
      buffered: this.buffer.length,
      ahead: this.buffer.filter((b) => b.at > renderTime).length,
      offsetPx: this.predictor.offsetSize,
      errorPx: this.predictor.lastError,
    };
  }
}
