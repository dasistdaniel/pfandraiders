import { MAX_MESSAGE_BYTES, parseClientMessage } from '@pfandraiders/core';
import type { ErrorCode, MapId, ServerMessage } from '@pfandraiders/core';
import type { IncomingMessage } from 'http';
import { WebSocketServer } from 'ws';
import type { PerMessageDeflateOptions, WebSocket } from 'ws';
import { SERVER_CONFIG } from './config';
import type { Conn, Member, Room } from './room';
import { RoomManager } from './rooms';

export interface ServerOptions {
  port: number;
  /** Erlaubte Origins. Leer oder fehlend = alle (nur für Entwicklung). */
  allowedOrigins?: string[];
  stepMs?: number;
  roundMs?: number;
  /** Countdown vor jeder Runde in ms (Standard CONFIG.countdownMs; für Tests). */
  countdownMs?: number;
  /** Frist für die Rückkehr eines getrennten Spielers in ms. Standard SERVER_CONFIG.graceMs. */
  graceMs?: number;
  /** Karte der Räume. Standard DEFAULT_MAP_ID. */
  mapId?: MapId;
  now?: () => number;
  random?: () => number;
  /** Mehr gleichzeitige Verbindungen werden abgewiesen (503). */
  maxConnections?: number;
  /** Gleichzeitige Verbindungen pro IP (X-Forwarded-For, sonst Socket-Adresse). Standard 10. */
  maxPerIp?: number;
  /** Ein Socket ohne Raum wird nach so vielen ms geschlossen. Standard 30000. */
  idleMs?: number;
  /** Abgefangene Ausnahmen (Tick und Nachrichtenhandler). Ohne Angabe wird nach stderr geloggt. */
  onError?: (err: unknown, room: Room | null) => void;
  /** permessage-deflate anbieten (WS_DEFLATE). Standard an; Umgebungsvariable WS_COMPRESSION=off schaltet ab. */
  compression?: boolean;
}

/**
 * Einstellungen für permessage-deflate. Der Server schickt je Client 20 Snapshots pro Sekunde mit 6–10 KB JSON,
 * die sich von Takt zu Takt kaum ändern. Mit Kontextübernahme (Standard, Fenster 32 KB) findet zlib fast den ganzen
 * vorigen Snapshot im Fenster wieder: Gemessen mit 8 laufenden Clients schrumpft ein Snapshot von 9,6 KB auf etwa
 * 430 Bytes (4,5 %). Stufe 1 ist dabei die billigste; höhere Stufen sparen wenig mehr und kosten mehr CPU, ohne
 * Kontextübernahme oder mit kleinerem Fenster sind es 13–15 %. Kosten: je Verbindung ein zlib-Kontext (etwa
 * 256 KB fürs Packen, mehr erst, wenn auch der Client packt). Zahlen in docs/NETZ.md (Befund 4).
 * Nur Nachrichten ab `threshold` Bytes werden gepackt (kurze Antworten wie Fehler lohnen nicht);
 * `concurrencyLimit` bleibt beim Standard 10 (gleichzeitige zlib-Aufträge im ganzen Prozess).
 */
export const WS_DEFLATE: PerMessageDeflateOptions = {
  threshold: 256,
  zlibDeflateOptions: { level: 1 },
};

/** Origin vergleichbar machen: trimmen, kleinschreiben, Schrägstrich am Ende entfernen. */
export function normalizeOrigin(origin: string): string {
  return origin.trim().toLowerCase().replace(/\/+$/, '');
}

export interface RunningServer {
  port: number;
  manager: RoomManager;
  close(): Promise<void>;
}

export interface Session {
  room: Room | null;
  member: Member | null;
  tokens: number;
  lastRefill: number;
  alive: boolean;
  /** Zeitpunkt der letzten rate_limited-Antwort */
  lastNotice: number;
  /** Zeitpunkt des letzten Verwerfens wegen Ratenlimit */
  lastLimited: number | null;
  /** Beginn der aktuellen Dauerüberlast */
  overSince: number | null;
  /** Ausnahmen im Nachrichtenhandler dieser Verbindung */
  errors: number;
  /** Zeitpunkt der letzten beantworteten Raumliste */
  lastListRooms: number;
  /** Zeitpunkte der falschen Passwörter (gleitendes Fenster) */
  passwordFails: number[];
}

export function newSession(now: number): Session {
  return {
    room: null,
    member: null,
    tokens: SERVER_CONFIG.maxMessagesPerSecond,
    lastRefill: now,
    alive: true,
    lastNotice: -Infinity,
    lastLimited: null,
    overSince: null,
    errors: 0,
    lastListRooms: -Infinity,
    passwordFails: [],
  };
}

/** Was der Handler vom Socket braucht (testbar ohne echten Socket). */
export interface Sock {
  close(code?: number, reason?: string): void;
}

export interface Env {
  manager: RoomManager;
  sockets: Map<Conn, Sock>;
  now?: () => number;
  onError?: (err: unknown, room: Room | null) => void;
}

interface SenderSocket {
  readyState: number;
  bufferedAmount: number;
  send(data: string): void;
  terminate(): void;
}

const WS_OPEN = 1;

/**
 * Sendet Nachrichten an einen Socket. Ist der Sendepuffer über der Grenze, werden Snapshots
 * verworfen (nie nachgeschoben); bleibt er zu lange darüber, wird der Socket getrennt.
 */
export function makeSender(
  ws: SenderSocket,
  cfg: { maxBufferedBytes: number; bufferedStaleMs: number } = SERVER_CONFIG,
  now: () => number = Date.now,
): { send(msg: ServerMessage): void; skipped(): number } {
  let skipped = 0;
  let overSince: number | null = null;
  return {
    send(msg) {
      if (ws.readyState !== WS_OPEN) return;
      if (msg.t === 'snap') {
        if (ws.bufferedAmount > cfg.maxBufferedBytes) {
          skipped++;
          const t = now();
          if (overSince === null) overSince = t;
          else if (t - overSince > cfg.bufferedStaleMs) ws.terminate();
          return;
        }
        overSince = null;
      }
      ws.send(JSON.stringify(msg));
    },
    skipped: () => skipped,
  };
}

function reply(conn: Conn, code: ErrorCode, message: string): void {
  conn.send({ t: 'error', code, message });
}

function report(env: Env, err: unknown, room: Room | null): void {
  try {
    if (env.onError) env.onError(err, room);
    else console.error(`Handler-Fehler (Raum ${room?.code ?? '-'}):`, err);
  } catch {
    /* Logging darf nie selbst scheitern */
  }
}

/** Verarbeitet eine rohe Nachricht einer Verbindung. Wirft nie. */
export function handleMessage(env: Env, session: Session, conn: Conn, sock: Sock, raw: string): void {
  try {
    dispatch(env, session, conn, sock, raw);
  } catch (err) {
    report(env, err, session.room);
    try {
      reply(conn, 'bad_message', 'Interner Fehler.');
    } catch {
      /* Verbindung schon weg */
    }
    session.errors++;
    if (session.errors >= SERVER_CONFIG.maxHandlerErrors) sock.close(1011, 'too many errors');
  }
}

function dispatch(env: Env, session: Session, conn: Conn, sock: Sock, raw: string): void {
  const now = (env.now ?? Date.now)();
  const { manager } = env;

  // Ratenbegrenzung: Token-Eimer, pro Sekunde maxMessagesPerSecond Nachrichten
  session.tokens = Math.min(
    SERVER_CONFIG.maxMessagesPerSecond,
    session.tokens + ((now - session.lastRefill) / 1000) * SERVER_CONFIG.maxMessagesPerSecond,
  );
  session.lastRefill = now;
  if (session.tokens < 1) {
    if (session.lastLimited === null || now - session.lastLimited > SERVER_CONFIG.rateNoticeMs) {
      session.overSince = now;
    }
    session.lastLimited = now;
    if (now - (session.overSince ?? now) >= SERVER_CONFIG.rateCloseMs) {
      sock.close(1008, 'rate limit');
      return;
    }
    if (now - session.lastNotice >= SERVER_CONFIG.rateNoticeMs) {
      session.lastNotice = now;
      reply(conn, 'rate_limited', 'Zu viele Nachrichten.');
    }
    return;
  }
  session.tokens -= 1;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    reply(conn, 'bad_message', 'Kein gültiges JSON.');
    return;
  }
  const msg = parseClientMessage(parsed);
  if (msg === null) {
    reply(conn, 'bad_message', 'Ungültige Nachricht.');
    return;
  }

  /** Gehört diese Verbindung noch dem Mitglied? Sonst ersetzt (Token-Rückkehr) und veraltet. */
  const isCurrent = (): boolean => {
    if (session.member && session.member.conn !== conn) {
      sock.close(4000, 'replaced');
      return false;
    }
    return true;
  };

  switch (msg.t) {
    case 'create': {
      if (session.room) return reply(conn, 'bad_message', 'Du bist schon in einem Raum.');
      const r = manager.create(msg.name, conn, {
        roomName: msg.roomName,
        visibility: msg.visibility,
        password: msg.password,
        avatar: msg.avatar,
      });
      if (!r.ok) return reply(conn, r.code, r.message);
      session.room = r.value.room;
      session.member = r.value.member;
      return;
    }
    case 'join': {
      if (session.room) return reply(conn, 'bad_message', 'Du bist schon in einem Raum.');
      const room = manager.get(msg.room);
      if (!room) return reply(conn, 'room_not_found', 'Raum nicht gefunden.');
      // Zu viele falsche Passwörter: gesperrt bis das Fenster frei ist (Rückkehr mit gültigem Token ausgenommen)
      const needsPassword = room.locked && !room.hasReturnToken(msg.token);
      if (needsPassword) {
        session.passwordFails = session.passwordFails.filter((t) => now - t < SERVER_CONFIG.wrongPasswordWindowMs);
        if (session.passwordFails.length >= SERVER_CONFIG.wrongPasswordMax) {
          return reply(conn, 'rate_limited', 'Zu viele falsche Passwörter. Bitte kurz warten.');
        }
      }
      const prev = msg.token === undefined ? undefined : room.members.find((m) => m.token === msg.token)?.conn;
      const r = room.join(msg.name, conn, msg.token, { password: msg.password, avatar: msg.avatar });
      if (!r.ok) {
        if (r.code === 'wrong_password') session.passwordFails.push(now);
        return reply(conn, r.code, r.message);
      }
      // Rückkehr ersetzt eine noch offene alte Verbindung: diese schliessen
      if (prev && prev !== conn) env.sockets.get(prev)?.close(4000, 'replaced');
      session.room = room;
      session.member = r.value;
      return;
    }
    case 'start': {
      if (!session.room || !session.member) return reply(conn, 'not_in_room', 'Du bist in keinem Raum.');
      if (!isCurrent()) return;
      const r = session.room.start(session.member.id, msg.roundMs);
      if (!r.ok) reply(conn, r.code, r.message);
      return;
    }
    case 'input': {
      if (!session.room || !session.member) return reply(conn, 'not_in_room', 'Du bist in keinem Raum.');
      if (!isCurrent()) return;
      session.room.setInput(session.member, msg.seq, msg.input);
      return;
    }
    case 'chat': {
      if (!session.room || !session.member) return reply(conn, 'not_in_room', 'Du bist in keinem Raum.');
      if (!isCurrent()) return;
      const r = session.room.chat(conn, msg.text);
      if (!r.ok) reply(conn, r.code, r.message);
      return;
    }
    case 'leave': {
      if (!session.room || !session.member) return reply(conn, 'not_in_room', 'Du bist in keinem Raum.');
      if (!isCurrent()) return; // veraltete Verbindung darf den Platz der neuen nicht freigeben
      session.room.leaveForGood(conn);
      session.room = null;
      session.member = null;
      sock.close(1000, 'left');
      return;
    }
    case 'ready': {
      if (!session.room || !session.member) return reply(conn, 'not_in_room', 'Du bist in keinem Raum.');
      if (!isCurrent()) return;
      const r = session.room.setReady(session.member, msg.ready);
      if (!r.ok) reply(conn, r.code, r.message);
      return;
    }
    case 'shopBuy': {
      if (!session.room || !session.member) return reply(conn, 'not_in_room', 'Du bist in keinem Raum.');
      if (!isCurrent()) return;
      const r = session.room.shopBuy(session.member, msg.category, msg.item, msg.qty);
      if (!r.ok) reply(conn, r.code, r.message);
      return;
    }
    case 'setRoundMs': {
      if (!session.room || !session.member) return reply(conn, 'not_in_room', 'Du bist in keinem Raum.');
      if (!isCurrent()) return;
      const r = session.room.setRoundMs(session.member.id, msg.roundMs);
      if (!r.ok) reply(conn, r.code, r.message);
      return;
    }
    case 'endSeries': {
      if (!session.room || !session.member) return reply(conn, 'not_in_room', 'Du bist in keinem Raum.');
      if (!isCurrent()) return;
      const r = session.room.endSeries(session.member.id);
      if (!r.ok) reply(conn, r.code, r.message);
      return;
    }
    case 'listRooms': {
      // Jederzeit erlaubt, auch ohne Raum; verlängert die Leerlauffrist nicht
      if (now - session.lastListRooms < SERVER_CONFIG.listRoomsMinGapMs) {
        return reply(conn, 'rate_limited', 'Raumliste höchstens einmal pro Sekunde.');
      }
      session.lastListRooms = now;
      conn.send({ t: 'rooms', rooms: manager.listRooms() });
      return;
    }
    case 'setAvatar': {
      if (!session.room || !session.member) return reply(conn, 'not_in_room', 'Du bist in keinem Raum.');
      if (!isCurrent()) return;
      const r = session.room.setAvatar(session.member, msg.avatar);
      if (!r.ok) reply(conn, r.code, r.message);
      return;
    }
    case 'setRounds': {
      if (!session.room || !session.member) return reply(conn, 'not_in_room', 'Du bist in keinem Raum.');
      if (!isCurrent()) return;
      const r = session.room.setRounds(session.member.id, msg.rounds);
      if (!r.ok) reply(conn, r.code, r.message);
      return;
    }
    case 'setMap': {
      if (!session.room || !session.member) return reply(conn, 'not_in_room', 'Du bist in keinem Raum.');
      if (!isCurrent()) return;
      const r = session.room.setMap(session.member.id, msg.mapId);
      if (!r.ok) reply(conn, r.code, r.message);
      return;
    }
    case 'toLobby': {
      if (!session.room || !session.member) return reply(conn, 'not_in_room', 'Du bist in keinem Raum.');
      if (!isCurrent()) return;
      const r = session.room.toLobby(session.member.id);
      if (!r.ok) reply(conn, r.code, r.message);
      return;
    }
  }
}

export function startServer(opts: ServerOptions): Promise<RunningServer> {
  const stepMs = opts.stepMs ?? SERVER_CONFIG.stepMs;
  const allowed = (opts.allowedOrigins ?? []).map(normalizeOrigin).filter((o) => o.length > 0);
  const maxPerIp = opts.maxPerIp ?? 10;
  const idleMs = opts.idleMs ?? 30_000;
  const ipCounts = new Map<string, number>();
  const ipOf = (req: IncomingMessage): string => {
    const xff = req.headers['x-forwarded-for'];
    const first = (Array.isArray(xff) ? xff[0] : xff)?.split(',')[0]?.trim();
    return first ? first : (req.socket.remoteAddress ?? 'unknown');
  };
  const maxConnections = opts.maxConnections ?? SERVER_CONFIG.maxConnections;
  const manager = new RoomManager({
    stepMs,
    roundMs: opts.roundMs,
    countdownMs: opts.countdownMs,
    graceMs: opts.graceMs,
    mapId: opts.mapId,
    now: opts.now,
    random: opts.random,
    onError: opts.onError
      ? (err, room) => opts.onError!(err, room)
      : (err, room) => console.error(`Tick-Fehler in Raum ${room.code}:`, err),
  });

  const wss = new WebSocketServer({
    port: opts.port,
    maxPayload: MAX_MESSAGE_BYTES,
    perMessageDeflate: opts.compression === false ? false : WS_DEFLATE,
    verifyClient: (info, done) => {
      if (wss.clients.size >= maxConnections) {
        done(false, 503, 'server full');
      } else if (!(allowed.length === 0 || (info.origin && allowed.includes(normalizeOrigin(info.origin))))) {
        done(false, 403, 'origin not allowed');
      } else if ((ipCounts.get(ipOf(info.req)) ?? 0) >= maxPerIp) {
        done(false, 429, 'too many connections');
      } else {
        done(true);
      }
    },
  });

  const sessions = new Map<WebSocket, Session>();
  const sockets = new Map<Conn, Sock>();
  const env: Env = { manager, sockets, onError: opts.onError };

  wss.on('connection', (ws, req) => {
    const ip = ipOf(req);
    ipCounts.set(ip, (ipCounts.get(ip) ?? 0) + 1);
    const session = newSession(Date.now());
    sessions.set(ws, session);
    const sender = makeSender(ws);
    const conn: Conn = {
      send: (msg) => sender.send(msg),
      close: (code, reason) => ws.close(code, reason),
    };
    sockets.set(conn, ws);

    const idleTimer = setTimeout(() => {
      if (session.room === null) ws.close(1008, 'idle: no room joined');
    }, idleMs);

    ws.on('pong', () => {
      session.alive = true;
    });
    ws.on('message', (data) => handleMessage(env, session, conn, ws, String(data)));
    ws.on('close', () => {
      clearTimeout(idleTimer);
      const n = (ipCounts.get(ip) ?? 1) - 1;
      if (n <= 0) ipCounts.delete(ip);
      else ipCounts.set(ip, n);
      try {
        session.room?.leave(conn);
      } catch (err) {
        report(env, err, session.room);
      }
      sessions.delete(ws);
      sockets.delete(conn);
    });
    ws.on('error', () => ws.terminate());
  });

  const tickTimer = setInterval(() => manager.tickAll(), stepMs);
  const sweepTimer = setInterval(() => {
    try {
      manager.sweep();
    } catch (err) {
      report(env, err, null);
    }
  }, 10_000);
  const pingTimer = setInterval(() => {
    for (const [ws, session] of sessions) {
      if (!session.alive) {
        ws.terminate();
        continue;
      }
      session.alive = false;
      ws.ping();
    }
  }, SERVER_CONFIG.pingEveryMs);
  const clearTimers = (): void => {
    clearInterval(tickTimer);
    clearInterval(sweepTimer);
    clearInterval(pingTimer);
  };

  return new Promise((resolve, reject) => {
    let listening = false;
    wss.on('error', (err) => {
      if (!listening) {
        clearTimers();
        try {
          wss.close();
        } catch {
          /* nicht gestartet */
        }
        reject(err);
      } else {
        console.error('WebSocket-Serverfehler:', err);
      }
    });
    wss.on('listening', () => {
      listening = true;
      const address = wss.address();
      const port = typeof address === 'object' && address ? address.port : opts.port;
      resolve({
        port,
        manager,
        close: () =>
          new Promise<void>((done) => {
            clearTimers();
            for (const ws of wss.clients) ws.close(1001, 'server shutting down');
            // Wer die Close-Handshake nicht beantwortet, wird nach kurzer Frist getrennt
            const force = setTimeout(() => {
              for (const ws of wss.clients) ws.terminate();
            }, 500);
            wss.close(() => {
              clearTimeout(force);
              done();
            });
          }),
      });
    });
  });
}
