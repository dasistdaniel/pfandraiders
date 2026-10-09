import {
  BUY_REFUSAL_TEXT,
  CHAT_HISTORY_SIZE,
  createGame,
  DEFAULT_MAP_ID,
  DEFAULT_ROUND_MS,
  DEFAULT_ROUNDS,
  finalRanking,
  freshProgress,
  isAvatar,
  isRoundMs,
  isRounds,
  MAP_DEFS,
  MAX_ROOM_PLAYERS,
  MIN_START_PLAYERS,
  NO_INPUT,
  pickAvatar,
  progressAfterRound,
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
  RoomInfo,
  RoomPhase,
  RoomVisibility,
  RosterEntry,
  ServerBuild,
  ServerMessage,
  ShopCategory,
  ShopItemId,
} from '@pfandraiders/core';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
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
  /** Figur (Index 0 bis AVATAR_COUNT - 1), im Raum eindeutig; wird frei, wenn das Mitglied entfernt wird */
  avatar: number;
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
  /** Countdown vor jeder Runde (Standard CONFIG.countdownMs; für Tests kürzer oder 0). */
  countdownMs?: number;
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

/** Einstellungen beim Anlegen; danach unveränderlich (Spec §1.4). */
export interface RoomSettings {
  /** Raumname, schon bereinigt (1 bis MAX_ROOM_NAME_LENGTH Zeichen) */
  name: string;
  visibility: RoomVisibility;
  /** Passwort, schon bereinigt; fehlt = kein Passwort. Der Raum behält nur den SHA-256-Hash. */
  password?: string;
}

/** Zusätzliche Angaben beim Beitritt */
export interface JoinExtras {
  /** Passwort für einen Raum mit Passwort */
  password?: string;
  /** Wunschfigur (0 bis AVATAR_COUNT - 1) */
  avatar?: number;
}

function sha256(text: string): Buffer {
  return createHash('sha256').update(text, 'utf8').digest();
}

export class Room {
  phase: RoomPhase = 'lobby';
  members: Member[] = [];
  state: GameState | null = null;
  /** Fortschritt der Serie je Spieler-id (Geld, Besitz, Gesamtverdienst); leer in der Lobby */
  readonly progress = new Map<string, Progress>();
  /** Raumname (fest) */
  readonly name: string;
  /** Sichtbarkeit in der Raumliste (fest) */
  readonly visibility: RoomVisibility;
  /** SHA-256 des Passworts; null = kein Passwort. Das Passwort selbst wird nicht gespeichert. */
  private readonly passwordHash: Buffer | null;
  private nextId = 1;
  private lastActive: number;
  private readonly mapId: MapId;
  private readonly map: MapData;
  private readonly stepMs: number;
  private readonly graceMs: number;
  private readonly emptyMs: number;
  private readonly fixedRoundMs: number | undefined;
  private readonly countdownMs: number | undefined;
  /** Vom Host gewählte Rundenzeit */
  private chosenRoundMs: number = DEFAULT_ROUND_MS;
  /** Vom Host gewählte Rundenzahl (0 = offen) */
  private chosenRounds: number = DEFAULT_ROUNDS;
  /** Laufende bzw. letzte Runde der Serie ab 1; 0 in der Lobby */
  round = 0;
  /** Rangliste der letzten Runde (Shop-Phase) bzw. Endwertung (Phase final), für Nachzügler */
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
    settings: Partial<RoomSettings> = {},
  ) {
    this.name = settings.name ?? `Raum ${code}`;
    this.visibility = settings.visibility ?? 'public';
    this.passwordHash = settings.password ? sha256(settings.password) : null;
    this.mapId = opts.mapId ?? DEFAULT_MAP_ID;
    this.map = opts.map ?? MAP_DEFS[this.mapId].map;
    this.stepMs = opts.stepMs ?? SERVER_CONFIG.stepMs;
    this.graceMs = opts.graceMs ?? SERVER_CONFIG.graceMs;
    // Ein leerer Raum darf nie vor Ablauf der Rückkehrfrist verschwinden
    this.emptyMs = Math.max(opts.emptyMs ?? SERVER_CONFIG.emptyRoomMs, this.graceMs + 15_000);
    this.fixedRoundMs = opts.roundMs;
    this.countdownMs = opts.countdownMs;
    this.now = opts.now ?? (() => Date.now());
    this.random = opts.random ?? Math.random;
    this.build = opts.build ?? currentBuild();
    this.lastActive = this.now();
  }

  /** Rundenzeit der nächsten Runde: ROUND_MS (falls gesetzt), sonst die Wahl des Hosts. */
  roundMs(): number {
    return this.fixedRoundMs ?? this.chosenRoundMs;
  }

  /** Rundenzahl der Serie (0 = offen). */
  rounds(): number {
    return this.chosenRounds;
  }

  /** Raum verlangt beim Beitritt ein Passwort. */
  get locked(): boolean {
    return this.passwordHash !== null;
  }

  /** Zeitkonstanter Vergleich über SHA-256 beider Werte; ohne Passwort im Raum immer true. */
  private passwordOk(given: string | undefined): boolean {
    if (this.passwordHash === null) return true;
    return timingSafeEqual(sha256(given ?? ''), this.passwordHash);
  }

  /** Gehört das Token einem Mitglied, das innerhalb der Frist zurückkehren darf? (Für die Ratenbegrenzung im Handler.) */
  hasReturnToken(token?: string): boolean {
    if (token === undefined) return false;
    const now = this.now();
    return this.members.some(
      (m) => m.token === token && !m.expired && (m.disconnectedAt === null || now - m.disconnectedAt <= this.graceMs),
    );
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
      avatar: m.avatar,
    }));
  }

  lobbyMessage(): ServerMessage {
    return {
      t: 'lobby',
      room: this.code,
      roomName: this.name,
      visibility: this.visibility,
      locked: this.locked,
      host: this.hostId(),
      players: this.roster(),
      phase: this.phase,
      roundMs: this.roundMs(),
      rounds: this.rounds(),
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
   * (ihr Fortschritt und ihre Figur werden frei). In der Shop-Phase kann das die nächste Runde auslösen.
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
    this.broadcastLobby();
    if (this.phase === 'shop') this.checkAllReady();
  }

  join(name: string, conn: Conn, token?: string, extras: JoinExtras = {}): Result<Member> {
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
        if (this.phase === 'final') this.sendFinal(back);
        this.broadcastLobby();
        return { ok: true, value: back };
      }
    }

    // Passwort vor allen anderen Prüfungen (Rückkehr mit gültigem Token braucht keins)
    if (!this.passwordOk(extras.password)) return fail('wrong_password', 'Passwort falsch oder nötig.');

    if (this.phase === 'playing') return fail('already_started', 'Die Runde läuft bereits.');
    if (this.members.length >= MAX_ROOM_PLAYERS) return fail('room_full', 'Der Raum ist voll.');
    if (this.members.some((m) => m.name.toLowerCase() === name.toLowerCase())) {
      return fail('name_taken', 'Der Name ist schon vergeben.');
    }

    const used = new Set(this.members.map((m) => m.color));
    const free = ROOM_COLORS.find((c) => !used.has(c));
    const avatar = pickAvatar(new Set(this.members.map((m) => m.avatar)), extras.avatar);
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
      avatar,
    };
    this.members.push(member);
    conn.send({ t: 'joined', room: this.code, you: member.id, token: member.token, build: this.build });
    this.sendChatHistory(conn);
    if (this.phase === 'shop') {
      // Beitritt zwischen zwei Runden: leerer Fortschritt, spielt ab der nächsten Runde mit
      this.progress.set(member.id, freshProgress());
      this.sendShop(member);
    }
    // Beitritt während der Endwertung: sieht sie, steht aber nicht drin, und wartet auf die Lobby
    if (this.phase === 'final') this.sendFinal(member);
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
    this.round = 0;
    this.startRound();
    return OK;
  }

  /** Neue Runde mit allen Mitgliedern (auch getrennten in der Frist) und ihrem Fortschritt. */
  private startRound(): void {
    const seed = Math.floor(this.random() * 0x100000000) >>> 0;
    const ids = this.members.map((m) => m.id);
    const progress: Record<string, Progress> = {};
    for (const id of ids) progress[id] = this.progress.get(id) ?? freshProgress();
    // Jede Runde (auch nach der Shop-Phase) beginnt mit dem Countdown; der Raum ist dabei schon 'playing'
    this.state = createGame(seed, this.map, ids, { roundMs: this.roundMs(), progress, countdownMs: this.countdownMs });
    for (const m of this.members) {
      m.input = { ...NO_INPUT };
      m.ackSeq = 0;
      m.ready = false;
    }
    this.round++;
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
      rounds: this.rounds(),
      round: this.round,
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

  /** Endwertung an einen Spieler: erst die Phase, dann die Rangliste nach Gesamtverdienst (kein Shop-Stand). */
  private sendFinal(m: Member): void {
    if (!m.conn) return;
    m.conn.send({ t: 'phase', phase: 'final' });
    m.conn.send({ t: 'ranking', entries: this.lastRanking.map((e) => ({ ...e })) });
  }

  /**
   * Serie vorbei: Endwertung aus dem Fortschritt aller aktuellen Mitglieder (Gesamtverdienst; Rundenverdienst
   * aus der letzten Runde, sonst 0), danach eingefroren. Kein Shop.
   */
  private enterFinal(): void {
    const entries: RankEntry[] = this.members.map((m) => {
      const p = this.progress.get(m.id) ?? freshProgress();
      const last = this.lastRanking.find((e) => e.id === m.id);
      return { id: m.id, money: p.money, round: last?.round ?? 0, total: p.earnedTotal };
    });
    this.lastRanking = finalRanking(entries);
    this.phase = 'final';
    this.state = null;
    for (const m of this.members) m.ready = false;
    for (const m of this.members) this.sendFinal(m);
    this.broadcastLobby();
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

  /** Eigene Figur wählen (nur Lobby). Vergeben = avatar_taken; die eigene Figur noch einmal = ok ohne Nachricht. */
  setAvatar(m: Member, avatar: number): Result<void> {
    if (this.phase !== 'lobby') return fail('wrong_phase', 'Die Figur wählt man in der Lobby.');
    if (!isAvatar(avatar)) return fail('bad_message', 'Ungültige Figur.');
    if (m.conn === null || m.avatar === avatar) return OK;
    if (this.members.some((x) => x !== m && x.avatar === avatar)) {
      return fail('avatar_taken', 'Die Figur ist schon vergeben.');
    }
    this.lastActive = this.now();
    m.avatar = avatar;
    this.broadcastLobby();
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

  /** Rundenzeit wählen (nur Host, nicht während einer Runde; der Wert ist schon gegen ROUND_MS_CHOICES geprüft). */
  setRoundMs(byId: string, roundMs: number): Result<void> {
    if (byId === '' || this.hostId() !== byId) return fail('not_host', 'Nur der Host kann die Rundenzeit ändern.');
    if (this.phase === 'playing') return fail('wrong_phase', 'Die Rundenzeit ändert sich erst zwischen den Runden.');
    if (!isRoundMs(roundMs)) return fail('bad_message', 'Ungültige Rundenzeit.');
    this.lastActive = this.now();
    this.chosenRoundMs = roundMs;
    this.broadcastLobby();
    return OK;
  }

  /** Rundenzahl wählen (nur Host, nur Lobby): 1, 3, 5 oder 0 = offen. */
  setRounds(byId: string, rounds: number): Result<void> {
    if (byId === '' || this.hostId() !== byId) return fail('not_host', 'Nur der Host kann die Rundenzahl ändern.');
    if (this.phase !== 'lobby') return fail('wrong_phase', 'Die Rundenzahl ändert sich nur in der Lobby.');
    if (!isRounds(rounds)) return fail('bad_message', 'Ungültige Rundenzahl.');
    this.lastActive = this.now();
    this.chosenRounds = rounds;
    this.broadcastLobby();
    return OK;
  }

  /** Serie vorzeitig beenden (nur Host, nur Shop): weiter zur Endwertung der bisherigen Runden. */
  endSeries(byId: string): Result<void> {
    if (byId === '' || this.hostId() !== byId) return fail('not_host', 'Nur der Host kann die Serie beenden.');
    if (this.phase !== 'shop') return fail('wrong_phase', 'Die Serie lässt sich nur im Shop beenden.');
    this.lastActive = this.now();
    this.enterFinal();
    return OK;
  }

  /**
   * Nach der Endwertung zurück in die Lobby (nur Host, nur final). Bleibt: Code, Name, Sichtbarkeit, Passwort,
   * Host, Rundenzahl, Rundenzeit, Mitglieder (auch Getrennte in der Frist), Figuren und Chat.
   * Zurückgesetzt: Fortschritt, Rangliste, Rundennummer. Abgelaufene fallen heraus.
   */
  toLobby(byId: string): Result<void> {
    if (byId === '' || this.hostId() !== byId) return fail('not_host', 'Nur der Host kann zurück in die Lobby.');
    if (this.phase !== 'final') return fail('wrong_phase', 'Zurück in die Lobby geht nur nach der Endwertung.');
    this.lastActive = this.now();
    this.expireMembers();
    this.phase = 'lobby';
    this.state = null;
    this.progress.clear();
    this.lastRanking = [];
    this.round = 0;
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

  /** Runde vorbei: Fortschritt ohne Mietsachen sichern, dann Shop-Phase oder (nach der letzten Runde) Endwertung. */
  private endRound(): void {
    const state = this.state;
    if (!state) return;
    for (const m of this.members) {
      const p = state.players[m.id];
      // Mietsachen (Einkaufswagen) gelten nur für eine Runde
      if (p) this.progress.set(m.id, progressAfterRound(p));
    }
    this.lastRanking = ranking(state);
    for (const m of this.members) m.ready = false;
    // Wer die Runde endgültig verlassen hat (oder dessen Frist ablief), fällt jetzt heraus
    for (const m of this.members.filter((x) => x.conn === null && x.expired)) this.drop(m);
    if (this.chosenRounds !== 0 && this.round >= this.chosenRounds) {
      this.enterFinal();
      return;
    }
    this.phase = 'shop';
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

  /**
   * Eintrag für die Raumliste; null = privat oder niemand verbunden. Ohne Token, Passwort und Spieler-IDs.
   * Die Phase final erscheint als shop (läuft, nicht beitretbar).
   */
  info(): RoomInfo | null {
    if (this.visibility !== 'public') return null;
    const hostId = this.hostId();
    const host = this.members.find((m) => m.id === hostId);
    if (!host) return null;
    return {
      code: this.code,
      name: this.name,
      host: host.name,
      players: this.members.length,
      max: MAX_ROOM_PLAYERS,
      phase: this.phase === 'final' ? 'shop' : this.phase,
      locked: this.locked,
    };
  }
}
