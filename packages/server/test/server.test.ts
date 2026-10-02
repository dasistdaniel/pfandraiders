import { MAX_MESSAGE_BYTES, ROOM_CODE_LENGTH } from '@pfandraiders/core';
import type { ClientMessage, ServerMessage } from '@pfandraiders/core';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { startServer } from '../src/server';
import type { RunningServer } from '../src/server';

let server: RunningServer;
const sockets: WebSocket[] = [];

afterEach(async () => {
  for (const s of sockets.splice(0)) s.terminate();
  await server?.close();
});

class Bot {
  messages: ServerMessage[] = [];
  private waiters: Array<() => void> = [];
  constructor(readonly ws: WebSocket) {
    ws.on('message', (data) => {
      this.messages.push(JSON.parse(String(data)) as ServerMessage);
      for (const w of this.waiters.splice(0)) w();
    });
  }
  send(msg: ClientMessage | unknown): void {
    this.ws.send(JSON.stringify(msg));
  }
  async until<T extends ServerMessage['t']>(
    t: T,
    pred: (m: Extract<ServerMessage, { t: T }>) => boolean = () => true,
    timeoutMs = 3000,
  ): Promise<Extract<ServerMessage, { t: T }>> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const hit = this.messages.find((m): m is Extract<ServerMessage, { t: T }> => m.t === t && pred(m as never));
      if (hit) return hit;
      const left = deadline - Date.now();
      if (left <= 0) throw new Error(`timeout waiting for ${t}; got ${this.messages.map((m) => m.t).join(',')}`);
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, left);
        this.waiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  }
}

async function connect(port: number, headers: Record<string, string> = {}): Promise<Bot> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers });
  sockets.push(ws);
  const bot = new Bot(ws);
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
    ws.once('unexpected-response', (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)));
  });
  return bot;
}

async function twoBotsInStartedRoom() {
  server = await startServer({ port: 0, stepMs: 20 });
  const a = await connect(server.port);
  const b = await connect(server.port);
  a.send({ t: 'create', name: 'Anna' });
  const joinedA = await a.until('joined');
  expect(joinedA.room).toHaveLength(ROOM_CODE_LENGTH);
  b.send({ t: 'join', room: joinedA.room, name: 'Bob' });
  const joinedB = await b.until('joined');
  a.send({ t: 'start' });
  await a.until('start');
  await b.until('start');
  return { a, b, code: joinedA.room, joinedA, joinedB };
}

describe('websocket server', () => {
  it('plays a full flow: create, join, start, inputs, snapshots', async () => {
    const { a, b } = await twoBotsInStartedRoom();
    a.send({ t: 'input', seq: 1, input: { moveX: 1, moveY: 0, action: false, steal: false, buy: null } });
    const first = await a.until('snap');
    const moved = await a.until('snap', (m) => m.snap.players.p1.x > first.snap.players.p1.x);
    expect(moved.ack).toBe(1);
    const seenByB = await b.until('snap', (m) => m.snap.players.p1.x > first.snap.players.p1.x);
    expect(seenByB.snap.players.p2).toBeDefined();
  });

  it('hides private data of the other player in the snapshots on the wire', async () => {
    const { a, b, code } = await twoBotsInStartedRoom();
    const room = server.manager.get(code)!;
    room.state!.players.p1.money = 4242;
    room.state!.players.p1.bottles = { plastic: 3, glass: 0, crate: 0 };
    room.state!.players.p1.item = 'bolt_cutters';
    const seenByB = await b.until('snap', (m) => m.snap.players.p1.bottles.plastic === 1);
    expect(seenByB.snap.players.p1.money).toBe(0);
    expect(seenByB.snap.players.p1.item).toBeNull();
    expect(seenByB.snap.rngState).toBe(0);
    const seenByA = await a.until('snap', (m) => m.snap.players.p1.money === 4242);
    expect(seenByA.snap.players.p1.item).toBe('bolt_cutters');
    expect(seenByA.snap.players.p1.bottles.plastic).toBe(3);
  });

  it('survives malformed and hostile messages and keeps the connection usable', async () => {
    server = await startServer({ port: 0, stepMs: 20 });
    const a = await connect(server.port);
    a.ws.send('this is not json');
    await a.until('error', (m) => m.code === 'bad_message');
    a.send({ t: 'nope' });
    a.send({ t: '__proto__' });
    a.send({ t: 'create', name: 5 });
    a.send({ t: 'join', room: 'ZZ', name: 'x' });
    a.send({ t: 'input', seq: 'x', input: 1 });
    a.send([1, 2, 3]);
    a.send(null);
    await a.until('error', (m) => m.code === 'bad_message');
    a.send({ t: 'create', name: 'Anna' }); // danach funktioniert noch alles
    await a.until('joined');
  });

  it('rejects messages that are too large', async () => {
    server = await startServer({ port: 0, stepMs: 20 });
    const a = await connect(server.port);
    const closed = new Promise<number>((resolve) => a.ws.once('close', (code) => resolve(code)));
    a.ws.send('x'.repeat(MAX_MESSAGE_BYTES * 4));
    await expect(closed).resolves.toBeGreaterThan(0);
    // Server lebt weiter
    const b = await connect(server.port);
    b.send({ t: 'create', name: 'Bob' });
    await b.until('joined');
  });

  it('answers input before joining a room with an error instead of crashing', async () => {
    server = await startServer({ port: 0, stepMs: 20 });
    const a = await connect(server.port);
    a.send({ t: 'input', seq: 1, input: {} });
    await a.until('error', (m) => m.code === 'not_in_room');
    a.send({ t: 'start' });
    await a.until('error', (m) => m.code === 'not_in_room');
  });

  it('reports unknown rooms and lets only the host start', async () => {
    server = await startServer({ port: 0, stepMs: 20 });
    const a = await connect(server.port);
    const b = await connect(server.port);
    a.send({ t: 'join', room: 'ABCD', name: 'Anna' });
    await a.until('error', (m) => m.code === 'room_not_found');
    a.send({ t: 'create', name: 'Anna' });
    const { room } = await a.until('joined');
    b.send({ t: 'join', room, name: 'Bob' });
    await b.until('joined');
    b.send({ t: 'start' });
    await b.until('error', (m) => m.code === 'not_host');
  });

  it('lets a disconnected player come back with the token and get a fresh start message', async () => {
    const { a, code, joinedA } = await twoBotsInStartedRoom();
    a.ws.close();
    await new Promise((r) => setTimeout(r, 100));
    const again = await connect(server.port);
    again.send({ t: 'join', room: code, name: 'Anna', token: joinedA.token });
    await again.until('joined');
    const start = await again.until('start');
    expect(start.you).toBe('p1');
    await again.until('snap');
  });

  it('refuses a rejoin with a wrong token during a running round', async () => {
    const { code } = await twoBotsInStartedRoom();
    const c = await connect(server.port);
    c.send({ t: 'join', room: code, name: 'Cara', token: 'bogus' });
    await c.until('error', (m) => m.code === 'already_started');
  });

  it('ignores input from a stale socket after a token rejoin and closes it', async () => {
    const { a, code, joinedA } = await twoBotsInStartedRoom();
    const a2 = await connect(server.port);
    a2.send({ t: 'join', room: code, name: 'Anna', token: joinedA.token });
    await a2.until('joined');
    await a2.until('start');
    const oldClosed = new Promise<number>((resolve) => a.ws.once('close', (c) => resolve(c)));
    const room = server.manager.get(code)!;
    const x0 = room.state!.players.p1.x;
    // Der Server hat die alte Verbindung zum Schliessen markiert, sie kann aber noch Nachrichten schicken
    for (let i = 0; i < 5; i++) {
      a.send({ t: 'input', seq: 5, input: { moveX: 1, moveY: 0, action: false, steal: false, buy: null } });
    }
    await expect(oldClosed).resolves.toBeGreaterThan(0);
    await new Promise((r) => setTimeout(r, 150));
    expect(room.state!.players.p1.x).toBe(x0);
    a2.send({ t: 'input', seq: 1, input: { moveX: 1, moveY: 0, action: false, steal: false, buy: null } });
    await a2.until('snap', (m) => m.snap.players.p1.x > x0);
  });

  it('rejects connections from origins that are not allowed', async () => {
    server = await startServer({ port: 0, stepMs: 20, allowedOrigins: ['https://good.example'] });
    await expect(connect(server.port, { Origin: 'https://evil.example' })).rejects.toThrow();
    // Browser senden immer einen Origin; ohne Header wird abgelehnt, sobald eine Liste gesetzt ist
    await expect(connect(server.port)).rejects.toThrow();
    const ok = await connect(server.port, { Origin: 'https://good.example' });
    ok.send({ t: 'create', name: 'Anna' });
    await ok.until('joined');
  });

  it('throttles a message flood without taking the server down', async () => {
    server = await startServer({ port: 0, stepMs: 20 });
    const a = await connect(server.port);
    a.send({ t: 'create', name: 'Anna' });
    await a.until('joined');
    for (let i = 0; i < 2000; i++) a.send({ t: 'input', seq: i, input: {} });
    await a.until('error', (m) => m.code === 'rate_limited');
    const b = await connect(server.port);
    b.send({ t: 'create', name: 'Bob' });
    await b.until('joined');
  });
});
