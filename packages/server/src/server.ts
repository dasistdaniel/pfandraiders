import { MAX_MESSAGE_BYTES, parseClientMessage } from '@pfandraiders/core';
import type { ErrorCode, ServerMessage } from '@pfandraiders/core';
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import { SERVER_CONFIG } from './config';
import type { Conn, Member, Room } from './room';
import { RoomManager } from './rooms';

export interface ServerOptions {
  port: number;
  /** Erlaubte Origins. Leer oder fehlend = alle (nur für Entwicklung). */
  allowedOrigins?: string[];
  stepMs?: number;
  roundMs?: number;
  now?: () => number;
  random?: () => number;
}

export interface RunningServer {
  port: number;
  manager: RoomManager;
  close(): Promise<void>;
}

interface Session {
  room: Room | null;
  member: Member | null;
  tokens: number;
  lastRefill: number;
  alive: boolean;
}

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function error(ws: WebSocket, code: ErrorCode, message: string): void {
  send(ws, { t: 'error', code, message });
}

export function startServer(opts: ServerOptions): Promise<RunningServer> {
  const stepMs = opts.stepMs ?? SERVER_CONFIG.stepMs;
  const allowed = opts.allowedOrigins ?? [];
  const manager = new RoomManager({
    stepMs,
    roundMs: opts.roundMs,
    now: opts.now,
    random: opts.random,
  });

  const wss = new WebSocketServer({
    port: opts.port,
    maxPayload: MAX_MESSAGE_BYTES,
    verifyClient: (info, done) => {
      if (allowed.length === 0 || (info.origin && allowed.includes(info.origin))) {
        done(true);
      } else {
        done(false, 403, 'origin not allowed');
      }
    },
  });

  const sessions = new Map<WebSocket, Session>();
  const sockets = new Map<Conn, WebSocket>();

  wss.on('connection', (ws) => {
    const session: Session = {
      room: null,
      member: null,
      tokens: SERVER_CONFIG.maxMessagesPerSecond,
      lastRefill: Date.now(),
      alive: true,
    };
    sessions.set(ws, session);
    const conn: Conn = { send: (msg: ServerMessage) => send(ws, msg) };
    sockets.set(conn, ws);
    /** Gehört diese Verbindung noch dem Mitglied? Sonst ersetzt (Token-Rückkehr) und veraltet. */
    const isCurrent = (): boolean => {
      if (session.member && session.member.conn !== conn) {
        ws.close(4000, 'replaced');
        return false;
      }
      return true;
    };

    ws.on('pong', () => {
      session.alive = true;
    });

    ws.on('message', (data) => {
      // Ratenbegrenzung: Token-Eimer, pro Sekunde maxMessagesPerSecond Nachrichten
      const now = Date.now();
      session.tokens = Math.min(
        SERVER_CONFIG.maxMessagesPerSecond,
        session.tokens + ((now - session.lastRefill) / 1000) * SERVER_CONFIG.maxMessagesPerSecond,
      );
      session.lastRefill = now;
      if (session.tokens < 1) {
        error(ws, 'rate_limited', 'Zu viele Nachrichten.');
        return;
      }
      session.tokens -= 1;

      let parsed: unknown;
      try {
        parsed = JSON.parse(String(data));
      } catch {
        error(ws, 'bad_message', 'Kein gültiges JSON.');
        return;
      }
      const msg = parseClientMessage(parsed);
      if (msg === null) {
        error(ws, 'bad_message', 'Ungültige Nachricht.');
        return;
      }

      switch (msg.t) {
        case 'create': {
          if (session.room) {
            error(ws, 'bad_message', 'Du bist schon in einem Raum.');
            return;
          }
          const r = manager.create(msg.name, conn);
          if (!r.ok) return error(ws, r.code, r.message);
          session.room = r.value.room;
          session.member = r.value.member;
          return;
        }
        case 'join': {
          if (session.room) {
            error(ws, 'bad_message', 'Du bist schon in einem Raum.');
            return;
          }
          const room = manager.get(msg.room);
          if (!room) return error(ws, 'room_not_found', 'Raum nicht gefunden.');
          const prev = msg.token === undefined ? undefined : room.members.find((m) => m.token === msg.token)?.conn;
          const r = room.join(msg.name, conn, msg.token);
          if (!r.ok) return error(ws, r.code, r.message);
          // Rückkehr ersetzt eine noch offene alte Verbindung: diese schliessen
          if (prev && prev !== conn) sockets.get(prev)?.close(4000, 'replaced');
          session.room = room;
          session.member = r.value;
          return;
        }
        case 'start': {
          if (!session.room || !session.member) return error(ws, 'not_in_room', 'Du bist in keinem Raum.');
          if (!isCurrent()) return;
          const r = session.room.start(session.member.id);
          if (!r.ok) error(ws, r.code, r.message);
          return;
        }
        case 'input': {
          if (!session.room || !session.member) return error(ws, 'not_in_room', 'Du bist in keinem Raum.');
          if (!isCurrent()) return;
          session.room.setInput(session.member, msg.seq, msg.input);
          return;
        }
      }
    });

    ws.on('close', () => {
      session.room?.leave(conn);
      sessions.delete(ws);
      sockets.delete(conn);
    });
    ws.on('error', () => ws.terminate());
  });

  const tickTimer = setInterval(() => manager.tickAll(), stepMs);
  const sweepTimer = setInterval(() => manager.sweep(), 10_000);
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

  return new Promise((resolve) => {
    wss.on('listening', () => {
      const address = wss.address();
      const port = typeof address === 'object' && address ? address.port : opts.port;
      resolve({
        port,
        manager,
        close: () =>
          new Promise<void>((done) => {
            clearInterval(tickTimer);
            clearInterval(sweepTimer);
            clearInterval(pingTimer);
            for (const ws of wss.clients) ws.terminate();
            wss.close(() => done());
          }),
      });
    });
  });
}
