import {
  BUY_REFUSAL_TEXT,
  CHAT_HISTORY_SIZE,
  createGame,
  DEFAULT_MAP_ID,
  DEFAULT_ROUND_MS,
  freshProgress,
  isRoundMs,
  MAP_DEFS,
  MAX_ROOM_PLAYERS,
  MIN_START_PLAYERS,
  NO_INPUT,
  progressOf,
  projectSnapshot,
  ranking,
  ROOM_COLORS,
  shopBuy,
  step,
} from '@pfandraiders/core';
import type {
  ChatMessage,
  ErrorCode,
  GameState,
  Input,
  MapData,
  MapId,
  Progress,
  RankEntry,
  RoomPhase,
  RosterEntry,
  ServerBuild,
  ServerMessage,
  ShopCategory,
  ShopItemId,
} from '@pfandraiders/core';
import { randomUUID } from 'node:crypto';
import { currentBuild } from './buildInfo';
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
  /** Zuletzt gesendete Eingabe */
  input: Input;
  ackSeq: number;
  /** Shop-Phase: hat "Bereit" gedrückt */
  ready: boolean;
}

export interface RoomOptions {
  /** Kennung der Karte (Standard DEFAULT_MAP_ID); bestimmt die Karte und wird mit start gesendet. */
  mapId?: MapId;
  /** Überschreibt die Kartendaten von mapId (für Tests). */
  map?: MapData;
  stepMs?: number;
  graceMs?: number;
  emptyMs?: number;
  /** Feste Rundenlänge (Umgebung ROUND_MS, für Tests); hat Vorrang vor der Wahl des Hosts. */
  roundMs?: number;
  now?: () => number;
  random?: () => number;
  /** Build des Servers für joined (Standard currentBuild()). */
  build?: ServerBuild;
}

export type Result<T> = { ok: true; value: T } | { ok: false; code: ErrorCode; message: string };

function fail<T>(code: ErrorCode, message: string): Result<T> {
  return { ok: false, code, message };
}

const OK: Result<void> = { ok: true, value: undefined };

export class Room {
  phase: RoomPhase = 'lobby';
  members: Member[] = [];
  state: GameState | null = null;
  /** Fortschritt der Serie je Spieler-id (Geld, Tasche, Upgrades, Inventar, Gesamtverdienst); leer in der Lobby */
  readonly progress = new Map<string, Progress>();
  private nextId = 1;
  private lastActive: number;
  private readonly mapId: MapId;
  private readonly map: MapData;
  private readonly stepMs: number;
  private readonly graceMs: number;
  private readonly emptyMs: number;
  private readonly fixedRoundMs: number | undefined;
  /** Vom Host gewählte Rundenzeit */
  private chosenRoundMs: number = DEFAULT_ROUND_MS;
  /** Rangliste der letzten Runde, für Nachzügler in der Shop-Phase */
  private lastRanking: RankEntry[] = [];
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly build: ServerBuild;
  /** Letzte Chatnachrichten der Lobby (nur im Speicher) */
  private chatHistory: ChatMessage[] = [];
  /** Zeitpunkte der angenommenen Chatnachrichten je Mitglied (Ratenbegrenzung) */
  private chatTimes = new Map<string, number[]>();

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
    this.fixedRoundMs = opts.roundMs;
    this.now = opts.now ?? (() => Date.now());
    this.random = opts.random ?? Math.random;
    this.build = opts.build ?? currentBuild();
    this.lastActive = this.now();
  }

  /** Rundenzeit der nächsten Runde: ROUND_MS (falls gesetzt), sonst die Wahl des Hosts. */
  roundMs(): number {
    return this.fixedRoundMs ?? this.chosenRoundMs;
  }

  /** Host = erster verbundener Spieler in Beitrittsreihenfolge. */
  hostId(): string {
    return this.members.find((m) => m.conn !== null)?.id ?? '';
  }

  roster(): RosterEntry[] {
    return this.members.map((m) => ({
      id: m.id,
      name: m.name,
      color: m.color,
      connected: m.conn !== null,
      ready: m.ready,
    }));
  }

  lobbyMessage(): ServerMessage {
    return {
      t: 'lobby',
      room: this.code,
      host: this.hostId(),
      players: this.roster(),
      phase: this.phase,
      roundMs: this.roundMs(),
    };
  }

  private broadcastLobby(): void {
    const msg = this.lobbyMessage();
    for (const m of this.members) m.conn?.send(msg);
  }

  private broadcast(msg: ServerMessage): void {
    for (const m of this.members) m.conn?.send(msg);
  }

  private connected(): Member[] {
    return this.members.filter((m) => m.conn !== null);
  }

  /** Entfernt ein Mitglied samt Fortschritt (nur außerhalb der laufenden Runde). */
  private drop(m: Member): void {
    this.members = this.members.filter((x) => x !== m);
    this.progress.delete(m.id);
  }

  /**
   * Markiert Mitglieder nach der Frist als abgelaufen; außerhalb der Runde fliegen sie raus
   * (ihr Fortschritt verfällt). In der Shop-Phase kann das die nächste Runde auslösen.
   */
  private expireMembers(): void {
    const now = this.now();
    for (const m of this.members) {
      if (m.disconnectedAt !== null && now - m.disconnectedAt > this.graceMs) m.expired = true;
    }
    if (this.phase === 'playing') return;
    const gone = this.members.filter((m) => m.conn === null && m.expired);
    if (gone.length === 0) return;
    for (const m of gone) this.drop(m);
    if (this.phase === 'shop') {
      this.broadcastLobby();
      this.checkAllReady();
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
        back.ready = false; // wer wieder verbindet, ist nicht bereit
        conn.send({ t: 'joined', room: this.code, you: back.id, token: back.token, build: this.build });
        this.sendChatHistory(conn);
        if (this.phase === 'playing' && this.state) this.sendStart(back);
        if (this.phase === 'shop') this.sendShop(back);
        this.broadcastLobby();
        return { ok: true, value: back };
      }
    }

    if (this.phase === 'playing') return fail('already_started', 'Die Runde läuft bereits.');
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
      ready: false,
    };
    this.members.push(member);
    conn.send({ t: 'joined', room: this.code, you: member.id, token: member.token, build: this.build });
    this.sendChatHistory(conn);
    if (this.phase === 'shop') {
      // Beitritt zwischen zwei Runden: leerer Fortschritt, spielt ab der nächsten Runde mit
      this.progress.set(member.id, freshProgress());
      this.sendShop(member);
    }
    this.broadcastLobby();
    return { ok: true, value: member };
  }

  private sendChatHistory(conn: Conn): void {
    conn.send({ t: 'chathistory', messages: this.chatHistory.map((m) => ({ ...m })) });
  }

  /** Ohne verbundene Spieler wird der Chat vergessen (ein Nachzügler sieht keine alten Nachrichten). */
  private forgetChatIfEmpty(): void {
    if (this.connected().length > 0) return;
    this.chatHistory = [];
    this.chatTimes.clear();
  }

  /**
   * Chatnachricht eines Mitglieds (Text schon mit cleanChat bereinigt). Nur in der Lobby;
   * pro Mitglied höchstens eine Nachricht je chatMinGapMs und chatMaxPerWindow je chatWindowMs.
   * Geht an alle verbundenen Mitglieder, auch an den Absender.
   */
  chat(conn: Conn, text: string): Result<void> {
    const member = this.members.find((m) => m.conn === conn);
    if (!member) return fail('not_in_room', 'Du bist in keinem Raum.');
    if (this.phase !== 'lobby') return fail('chat_closed', 'Chat gibt es nur in der Lobby.');
    const now = this.now();
    const times = (this.chatTimes.get(member.id) ?? []).filter((t) => now - t < SERVER_CONFIG.chatWindowMs);
    const last = times[times.length - 1];
    if ((last !== undefined && now - last < SERVER_CONFIG.chatMinGapMs) || times.length >= SERVER_CONFIG.chatMaxPerWindow) {
      this.chatTimes.set(member.id, times);
      return fail('chat_too_fast', 'Zu schnell.');
    }
    times.push(now);
    this.chatTimes.set(member.id, times);
    this.lastActive = now;
    const msg: ChatMessage = { id: member.id, name: member.name, color: member.color, text, at: now };
    this.chatHistory.push(msg);
    if (this.chatHistory.length > CHAT_HISTORY_SIZE) {
      this.chatHistory.splice(0, this.chatHistory.length - CHAT_HISTORY_SIZE);
    }
    for (const m of this.members) m.conn?.send({ t: 'chat', ...msg });
    return OK;
  }

  /**
   * Verbindung weg. In der Lobby verschwindet der Spieler; im Spiel steht seine Figur still weiter;
   * in der Shop-Phase behält er seinen Fortschritt bis zum Ende der Frist und zählt nicht mehr für "alle bereit".
   */
  leave(conn: Conn): void {
    const member = this.members.find((m) => m.conn === conn);
    if (!member) return;
    this.lastActive = this.now();
    member.conn = null;
    member.disconnectedAt = this.now();
    member.input = { ...NO_INPUT };
    member.ready = false;
    if (this.phase === 'lobby') this.drop(member);
    this.forgetChatIfEmpty();
    this.broadcastLobby();
    this.checkAllReady();
  }

  /**
   * Absichtliches Verlassen: der Platz wird sofort frei, das Token gilt nicht mehr (keine Frist).
   * In der Lobby und in der Shop-Phase verschwindet der Spieler samt Fortschritt; während der Runde
   * bleibt die Figur als Statist stehen (ihr Verdienst zählt für die Rangliste) und fällt am Rundenende heraus.
   */
  leaveForGood(conn: Conn): void {
    const member = this.members.find((m) => m.conn === conn);
    if (!member) return;
    this.lastActive = this.now();
    member.conn = null;
    member.disconnectedAt = this.now();
    member.expired = true;
    member.input = { ...NO_INPUT };
    member.ready = false;
    if (this.phase !== 'playing') this.drop(member);
    this.forgetChatIfEmpty();
    this.broadcastLobby();
    this.checkAllReady();
  }

  /**
   * Startet die Serie (nur Host, nur in der Lobby, mindestens MIN_START_PLAYERS verbunden).
   * `roundMs`: gültiger Wert setzt die Rundenzeit, ungültige Zahl den Standard, fehlend = unverändert.
   */
  start(byId: string, roundMs?: number): Result<void> {
    this.lastActive = this.now();
    if (byId === '' || this.hostId() !== byId) return fail('not_host', 'Nur der Host kann starten.');
    if (this.phase !== 'lobby') return fail('already_started', 'Die Serie läuft schon.');
    if (this.connected().length < MIN_START_PLAYERS) {
      return fail('need_players', 'Mindestens zwei Spieler nötig.');
    }
    if (roundMs !== undefined) this.chosenRoundMs = isRoundMs(roundMs) ? roundMs : DEFAULT_ROUND_MS;
    // Getrennte Spieler der Lobby sind schon entfernt; neue Serie, leerer Fortschritt
    this.members = this.connected();
    this.progress.clear();
    for (const m of this.members) this.progress.set(m.id, freshProgress());
    this.startRound();
    return OK;
  }

  /** Neue Runde mit allen Mitgliedern (auch getrennten in der Frist) und ihrem Fortschritt. */
  private startRound(): void {
    const seed = Math.floor(this.random() * 0x100000000) >>> 0;
    const ids = this.members.map((m) => m.id);
    const progress: Record<string, Progress> = {};
    for (const id of ids) progress[id] = this.progress.get(id) ?? freshProgress();
    this.state = createGame(seed, this.map, ids, { roundMs: this.roundMs(), progress });
    for (const m of this.members) {
      m.input = { ...NO_INPUT };
      m.ackSeq = 0;
      m.ready = false;
    }
    this.phase = 'playing';
    // Chat ist nur in der Lobby offen; die Zähler werden nicht mehr gebraucht
    this.chatTimes.clear();
    this.broadcast({ t: 'phase', phase: 'playing' });
    for (const m of this.members) this.sendStart(m);
    this.broadcastLobby();
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
      roundMs: this.roundMs(),
    });
  }

  /** Alles, was ein Spieler in der Shop-Phase braucht: Phase, Rangliste der letzten Runde, eigener Stand. */
  private sendShop(m: Member): void {
    if (!m.conn) return;
    m.conn.send({ t: 'phase', phase: 'shop' });
    m.conn.send({ t: 'ranking', entries: this.lastRanking.map((e) => ({ ...e })) });
    this.sendShopState(m);
  }

  /** Eigener Stand, nur an diesen Spieler (fremder Fortschritt bleibt privat). */
  private sendShopState(m: Member): void {
    if (!m.conn) return;
    const own = this.progress.get(m.id) ?? freshProgress();
    m.conn.send({ t: 'shopState', you: progressOf(own), ready: m.ready });
  }

  /** Bereit / nicht bereit in der Shop-Phase. Sind danach alle Verbundenen bereit, beginnt die nächste Runde. */
  setReady(m: Member, ready: boolean): Result<void> {
    if (this.phase !== 'shop') return fail('wrong_phase', 'Bereit gibt es nur im Shop.');
    if (m.conn === null) return OK;
    this.lastActive = this.now();
    m.ready = ready;
    this.sendShopState(m);
    this.broadcastLobby();
    this.checkAllReady();
    return OK;
  }

  /** Kauf in der Shop-Phase; abgelehnt ohne Teilkauf. Der neue eigene Stand geht nur an den Käufer. */
  shopBuy(m: Member, category: ShopCategory, item: ShopItemId, qty: number): Result<void> {
    if (this.phase !== 'shop') return fail('wrong_phase', 'Kaufen geht nur im Shop.');
    if (m.conn === null) return OK;
    this.lastActive = this.now();
    let own = this.progress.get(m.id);
    if (!own) {
      own = freshProgress();
      this.progress.set(m.id, own);
    }
    const r = shopBuy(own, category, item, qty);
    if (!r.ok) return fail('cannot_buy', BUY_REFUSAL_TEXT[r.reason]);
    this.sendShopState(m);
    return OK;
  }

  /** Rundenzeit wählen (nur Host, nur Lobby oder Shop; der Wert ist schon gegen ROUND_MS_CHOICES geprüft). */
  setRoundMs(byId: string, roundMs: number): Result<void> {
    if (byId === '' || this.hostId() !== byId) return fail('not_host', 'Nur der Host kann die Rundenzeit ändern.');
    if (this.phase === 'playing') return fail('wrong_phase', 'Die Rundenzeit ändert sich erst zwischen den Runden.');
    if (!isRoundMs(roundMs)) return fail('bad_message', 'Ungültige Rundenzeit.');
    this.lastActive = this.now();
    this.chosenRoundMs = roundMs;
    this.broadcastLobby();
    return OK;
  }

  /** Serie beenden (nur Host, nur Shop): zurück in die Lobby, Fortschritt verfällt, Getrennte fallen heraus. */
  endSeries(byId: string): Result<void> {
    if (byId === '' || this.hostId() !== byId) return fail('not_host', 'Nur der Host kann die Serie beenden.');
    if (this.phase !== 'shop') return fail('wrong_phase', 'Die Serie lässt sich nur im Shop beenden.');
    this.lastActive = this.now();
    this.phase = 'lobby';
    this.state = null;
    this.progress.clear();
    this.lastRanking = [];
    this.members = this.connected();
    for (const m of this.members) m.ready = false;
    this.broadcast({ t: 'phase', phase: 'lobby' });
    this.broadcastLobby();
    return OK;
  }

  /** Shop-Phase: alle verbundenen Spieler bereit (und mindestens einer verbunden) -> nächste Runde. */
  private checkAllReady(): void {
    if (this.phase !== 'shop') return;
    const live = this.connected();
    if (live.length === 0 || !live.every((m) => m.ready)) return;
    this.startRound();
  }

  /** Runde vorbei: Fortschritt sichern, Rangliste senden, Shop-Phase. */
  private endRound(): void {
    const state = this.state;
    if (!state) return;
    for (const m of this.members) {
      const p = state.players[m.id];
      if (p) this.progress.set(m.id, progressOf(p));
    }
    this.lastRanking = ranking(state);
    this.phase = 'shop';
    for (const m of this.members) m.ready = false;
    // Wer die Runde endgültig verlassen hat (oder dessen Frist ablief), fällt jetzt heraus
    for (const m of this.members.filter((x) => x.conn === null && x.expired)) this.drop(m);
    for (const m of this.members) this.sendShop(m);
    this.broadcastLobby();
  }

  /** Letzte Eingabe merken. */
  setInput(m: Member, seq: number, input: Input): void {
    if (m.conn === null) return;
    this.lastActive = this.now();
    if (Number.isSafeInteger(seq) && seq >= 0) m.ackSeq = Math.max(m.ackSeq, seq);
    m.input = { ...input };
  }

  /** Ein Serverschritt: Eingaben anwenden, `step`, Snapshots senden. */
  tick(): void {
    const now = this.now();
    this.expireMembers();
    if (this.phase !== 'playing' || !this.state) return;
    if (this.connected().length > 0) this.lastActive = now;

    const inputs: Record<string, Input> = {};
    for (const m of this.members) inputs[m.id] = m.conn ? m.input : NO_INPUT;
    step(this.state, inputs, this.stepMs);

    for (const m of this.members) {
      m.conn?.send({ t: 'snap', snap: projectSnapshot(this.state, m.id), ack: m.ackSeq });
    }
    if (this.state.phase === 'ended') this.endRound();
  }

  /** Leerer Raum, der lange genug leer war. */
  isDead(): boolean {
    return this.connected().length === 0 && this.now() - this.lastActive >= this.emptyMs;
  }
}
