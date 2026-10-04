import { CITY_MAP, DEFAULT_MAP_ID, RETRO_MAP, createGame, NO_INPUT, projectSnapshot, ROOM_COLORS } from '@pfandraiders/core';
import type { ClientMessage, ServerMessage } from '@pfandraiders/core';
import { describe, expect, it, vi } from 'vitest';
import { OnlineConnection } from '../src/online';
import type { SocketLike } from '../src/online';

class FakeSocket implements SocketLike {
  sent: ClientMessage[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  closed = false;
  send(data: string): void {
    this.sent.push(JSON.parse(data) as ClientMessage);
  }
  close(): void {
    this.closed = true;
    this.onclose?.();
  }
  open(): void {
    this.onopen?.();
  }
  receive(msg: ServerMessage): void {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
}

function roster() {
  return [
    { id: 'p1', name: 'Anna', color: ROOM_COLORS[0], connected: true },
    { id: 'p2', name: 'Bob', color: ROOM_COLORS[1], connected: true },
  ];
}

function setup() {
  const socket = new FakeSocket();
  const conn = new OnlineConnection('ws://test', () => socket);
  conn.connect();
  socket.open();
  return { socket, conn };
}

function startMessage(tickValue = 0, x2 = 40): ServerMessage {
  const s = createGame(1, CITY_MAP, ['p1', 'p2']);
  s.tick = tickValue;
  s.players.p2.x = x2;
  return { t: 'start', mapId: DEFAULT_MAP_ID, map: CITY_MAP, you: 'p1', players: roster(), snap: projectSnapshot(s, 'p1') };
}

function snapMessage(tickValue: number, x2: number): ServerMessage {
  const s = createGame(1, CITY_MAP, ['p1', 'p2']);
  s.tick = tickValue;
  s.players.p2.x = x2;
  return { t: 'snap', snap: projectSnapshot(s, 'p1'), ack: 0 };
}

describe('OnlineConnection messages', () => {
  it('sends create and join with the given data', () => {
    const { socket, conn } = setup();
    conn.create('Anna');
    conn.join('abcd', 'Bob', 'tok');
    expect(socket.sent).toEqual([
      { t: 'create', name: 'Anna' },
      { t: 'join', room: 'abcd', name: 'Bob', token: 'tok' },
    ]);
  });

  it('omits the token field entirely when joining without one', () => {
    const { socket, conn } = setup();
    conn.join('abcd', 'Bob');
    expect(socket.sent).toEqual([{ t: 'join', room: 'abcd', name: 'Bob' }]);
    expect('token' in socket.sent[0]).toBe(false);
  });

  it('records room, own id and token from joined and exposes the roster from lobby', () => {
    const { socket, conn } = setup();
    socket.receive({ t: 'joined', room: 'ABCD', you: 'p2', token: 'secret' });
    expect(conn.room).toBe('ABCD');
    expect(conn.you).toBe('p2');
    expect(conn.token).toBe('secret');
    socket.receive({ t: 'lobby', room: 'ABCD', host: 'p1', players: roster(), phase: 'lobby' });
    expect(conn.roster).toHaveLength(2);
    expect(conn.isHost()).toBe(false);
    socket.receive({ t: 'lobby', room: 'ABCD', host: 'p2', players: roster(), phase: 'lobby' });
    expect(conn.isHost()).toBe(true);
  });

  it('stores the server build from joined, before onJoined fires', () => {
    const { socket, conn } = setup();
    expect(conn.serverBuild).toBeNull();
    let seen: unknown = undefined;
    conn.onJoined = () => {
      seen = conn.serverBuild;
    };
    socket.receive({ t: 'joined', room: 'ABCD', you: 'p2', token: 't', build: { number: '7', sha: 'abcdef1' } });
    expect(conn.serverBuild).toEqual({ number: '7', sha: 'abcdef1' });
    expect(seen).toEqual({ number: '7', sha: 'abcdef1' });
  });

  it('keeps serverBuild null for joined without or with an invalid build', () => {
    const { socket, conn } = setup();
    socket.receive({ t: 'joined', room: 'ABCD', you: 'p2', token: 't' });
    expect(conn.serverBuild).toBeNull();
    socket.receive({ t: 'joined', room: 'ABCD', you: 'p2', token: 't', build: { number: '7', sha: 'x'.repeat(17) } });
    expect(conn.serverBuild).toBeNull();
    socket.receive({ t: 'joined', room: 'ABCD', you: 'p2', token: 't', build: { number: 7, sha: 'abc' } } as unknown as ServerMessage);
    expect(conn.serverBuild).toBeNull();
    expect(conn.room).toBe('ABCD');
  });

  it('builds a full game state on start and fires onStart', () => {
    const { socket, conn } = setup();
    let started = 0;
    conn.onStart = () => started++;
    socket.receive(startMessage());
    expect(started).toBe(1);
    expect(conn.localPlayerIds).toEqual(['p1']);
    const state = conn.getState();
    expect(state.map.cols).toBe(CITY_MAP.cols);
    expect(Object.keys(state.players)).toEqual(['p1', 'p2']);
  });

  it('defaults mapId and takes a valid mapId from start', () => {
    const { socket, conn } = setup();
    expect(conn.mapId).toBe(DEFAULT_MAP_ID);
    const msg = startMessage() as Extract<ServerMessage, { t: 'start' }>;
    socket.receive({ ...msg, mapId: 'retro', map: RETRO_MAP });
    expect(conn.mapId).toBe('retro');
  });

  it.each([['x'], [null], [7], [{}], ['__proto__'], [undefined]])('drops a start with mapId %j and keeps its state', (bad) => {
    const { socket, conn } = setup();
    let started = 0;
    conn.onStart = () => started++;
    socket.receive(startMessage(0));
    expect(started).toBe(1);
    const before = conn.getState();
    const msg = startMessage(5) as Extract<ServerMessage, { t: 'start' }>;
    const broken = { ...msg, mapId: bad } as unknown;
    if (bad === undefined) delete (broken as { mapId?: unknown }).mapId;
    expect(() => socket.receive(broken as ServerMessage)).not.toThrow();
    expect(started).toBe(1);
    expect(conn.mapId).toBe(DEFAULT_MAP_ID);
    expect(conn.getState()).toBe(before);
  });

  it('reports errors and a closed connection', () => {
    const { socket, conn } = setup();
    const errors: string[] = [];
    let closed = 0;
    conn.onError = (code) => errors.push(code);
    conn.onClosed = () => closed++;
    socket.receive({ t: 'error', code: 'room_full', message: 'voll' });
    expect(errors).toEqual(['room_full']);
    socket.close();
    expect(closed).toBe(1);
    expect(conn.status).toBe('closed');
  });

  it('ignores malformed server messages without throwing', () => {
    const { socket, conn } = setup();
    expect(() => socket.onmessage?.({ data: 'not json' })).not.toThrow();
    expect(() => socket.onmessage?.({ data: '{"t":"snap"}' })).not.toThrow();
    expect(conn.status).toBe('open');
  });

  it('only the host sends start', () => {
    const { socket, conn } = setup();
    socket.receive({ t: 'joined', room: 'ABCD', you: 'p2', token: 't' });
    socket.receive({ t: 'lobby', room: 'ABCD', host: 'p1', players: roster(), phase: 'lobby' });
    conn.requestStart();
    expect(socket.sent.some((m) => m.t === 'start')).toBe(false);
    socket.receive({ t: 'lobby', room: 'ABCD', host: 'p2', players: roster(), phase: 'lobby' });
    conn.requestStart();
    expect(socket.sent.filter((m) => m.t === 'start')).toHaveLength(1);
  });

  it('sends leave only on an open socket and never throws', () => {
    const { socket, conn } = setup();
    conn.leave();
    expect(socket.sent).toEqual([{ t: 'leave' }]);
    socket.send = () => {
      throw new Error('socket is closing');
    };
    expect(() => conn.leave()).not.toThrow();
    socket.close();
    socket.sent = [];
    conn.leave();
    expect(socket.sent).toEqual([]);
  });
});

describe('OnlineConnection input', () => {
  it('sends a changed input at once with a rising sequence number', () => {
    const { socket, conn } = setup();
    socket.receive(startMessage());
    conn.setInput('p1', { ...NO_INPUT, moveX: 1 });
    conn.update(10);
    conn.setInput('p1', { ...NO_INPUT, moveX: -1 });
    conn.update(10);
    const inputs = socket.sent.filter((m) => m.t === 'input') as Extract<ClientMessage, { t: 'input' }>[];
    expect(inputs.map((m) => m.input.moveX)).toEqual([1, -1]);
    expect(inputs[1].seq).toBeGreaterThan(inputs[0].seq);
  });

  it('repeats an unchanged input only as a heartbeat every 100 ms', () => {
    const { socket, conn } = setup();
    socket.receive(startMessage());
    conn.setInput('p1', { ...NO_INPUT, moveX: 1 });
    conn.update(10); // sofort gesendet
    conn.update(10);
    conn.update(10);
    expect(socket.sent.filter((m) => m.t === 'input')).toHaveLength(1);
    conn.update(90); // 100 ms seit dem letzten Senden
    expect(socket.sent.filter((m) => m.t === 'input')).toHaveLength(2);
  });

  it('sends a buy command exactly once, also when it arrives between frames', () => {
    const { socket, conn } = setup();
    socket.receive(startMessage());
    conn.setInput('p1', { ...NO_INPUT, buy: 'upgrade' });
    conn.setInput('p1', NO_INPUT); // nächster Frame meldet "nicht gedrückt"
    conn.update(10);
    conn.update(200);
    const inputs = socket.sent.filter((m) => m.t === 'input') as Extract<ClientMessage, { t: 'input' }>[];
    expect(inputs.filter((m) => m.input.buy === 'upgrade')).toHaveLength(1);
  });

  it('does not send inputs before a game has started', () => {
    const { socket, conn } = setup();
    conn.setInput('p1', { ...NO_INPUT, moveX: 1 });
    conn.update(200);
    expect(socket.sent.filter((m) => m.t === 'input')).toHaveLength(0);
  });
});

describe('OnlineConnection rendering state', () => {
  it('shows other players with a 100 ms delay, interpolated between snapshots', () => {
    const { socket, conn } = setup();
    socket.receive(startMessage(0, 40));
    conn.update(100);
    socket.receive(snapMessage(1, 80)); // kommt bei Uhr 100 an
    conn.update(50); // Uhr 150, Renderzeit 50: zwischen Start (Uhr 0, x 40) und Snapshot (Uhr 100, x 80)
    expect(conn.getState().players.p2.x).toBeCloseTo(60, 3);
    conn.update(100); // Uhr 250, Renderzeit 150: hinter dem letzten Snapshot
    expect(conn.getState().players.p2.x).toBe(80);
  });

  it('keeps the own player at the latest server position', () => {
    const { socket, conn } = setup();
    socket.receive(startMessage(0));
    const s = createGame(1, CITY_MAP, ['p1', 'p2']);
    s.players.p1.x = 200;
    s.tick = 1;
    conn.update(100);
    socket.receive({ t: 'snap', snap: projectSnapshot(s, 'p1'), ack: 0 });
    conn.update(10);
    expect(conn.getState().players.p1.x).toBe(200);
  });

  it('drops old snapshots so memory stays bounded', () => {
    const { socket, conn } = setup();
    socket.receive(startMessage(0));
    for (let i = 1; i <= 200; i++) {
      conn.update(50);
      socket.receive(snapMessage(i, 40 + i));
    }
    conn.update(200); // Renderzeit hinter dem neuesten Snapshot
    expect(conn.bufferedSnapshots()).toBeLessThanOrEqual(32);
    expect(conn.getState().tick).toBe(200);
  });
});

describe('OnlineConnection robustness', () => {
  function started() {
    const ctx = setup();
    ctx.socket.receive(startMessage(0, 40));
    ctx.conn.update(10);
    return ctx;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function rawSnap(mutate: (snap: any) => void, tickValue = 1): string {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msg = snapMessage(tickValue, 50) as any;
    mutate(msg.snap);
    return JSON.stringify(msg);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cases: [string, (snap: any) => void][] = [
    ['missing npcs', (s) => delete s.npcs],
    ['npcs not an array', (s) => (s.npcs = {})],
    ['players as array', (s) => (s.players = [])],
    ['NaN position (null via JSON)', (s) => (s.players.p2.x = null)],
    ['string tick', (s) => (s.tick = '5')],
    ['null tick', (s) => (s.tick = null)],
    ['negative tick', (s) => (s.tick = -1)],
    ['bad phase', (s) => (s.phase = 'x')],
    ['bad npc kind', (s) => (s.npcs = [{ id: 1, kind: 'cat', x: 1, y: 1 }])],
    ['zone without phase', (s) => (s.zones = [{ def: {} }])],
  ];

  for (const [name, mutate] of cases) {
    it(`drops an invalid snapshot (${name})`, () => {
      const { socket, conn } = started();
      const before = conn.getState().tick;
      expect(() => socket.onmessage?.({ data: rawSnap(mutate) })).not.toThrow();
      expect(() => conn.update(50)).not.toThrow();
      expect(conn.bufferedSnapshots()).toBe(1);
      expect(conn.getState().tick).toBe(before);
    });
  }

  it('drops an Infinity tick and ignores an invalid start entirely', () => {
    const { socket, conn } = started();
    socket.onmessage?.({ data: rawSnap((s) => (s.tick = Infinity)) });
    expect(conn.bufferedSnapshots()).toBe(1);
    let starts = 0;
    conn.onStart = () => starts++;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bad = startMessage(0) as any;
    delete bad.snap.npcs;
    socket.onmessage?.({ data: JSON.stringify(bad) });
    expect(starts).toBe(0);
    expect(() => conn.update(10)).not.toThrow();
    expect(conn.getState().tick).toBe(0);
  });

  it('does not throw when a buffered snapshot turns out to be unrenderable', () => {
    const { socket, conn } = started();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    socket.receive(snapMessage(1, 60));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buf = (conn as any).buffer as { snap: any }[];
    buf[buf.length - 1].snap.npcs = undefined;
    expect(() => conn.update(10)).not.toThrow();
    expect(conn.bufferedSnapshots()).toBe(1);
    expect(conn.getState().tick).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('drops duplicate or older ticks, and a new start resets the buffer', () => {
    const { socket, conn } = started();
    socket.receive(snapMessage(5, 50));
    socket.receive(snapMessage(3, 70));
    socket.receive(snapMessage(5, 90));
    expect(conn.bufferedSnapshots()).toBe(2);
    conn.update(250);
    conn.update(250);
    expect(conn.getState().tick).toBe(5);
    socket.receive(startMessage(0, 40));
    expect(conn.bufferedSnapshots()).toBe(1);
    conn.update(10);
    expect(conn.getState().tick).toBe(0);
  });

  it('ignores NaN and negative deltas and caps huge ones', () => {
    const { socket, conn } = started();
    const count = () => socket.sent.filter((m) => m.t === 'input').length;
    conn.setInput('p1', { ...NO_INPUT, moveX: 1 });
    conn.update(10); // geaenderte Eingabe: sendet sofort
    const base = count();
    conn.update(Number.NaN);
    conn.update(-5);
    conn.update(90);
    expect(count()).toBe(base);
    conn.update(10); // 100 ms seit dem Senden
    expect(count()).toBe(base + 1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const before = (conn as any).clock as number;
    conn.update(10_000);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((conn as any).clock - before).toBeLessThanOrEqual(250);
  });
});

describe('OnlineConnection reopen', () => {
  function joinedSetup() {
    const sockets: FakeSocket[] = [];
    const conn = new OnlineConnection('ws://test', () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s;
    });
    conn.connect();
    sockets[0].open();
    conn.join('ABCD', 'Anna');
    sockets[0].receive({ t: 'joined', room: 'ABCD', you: 'p1', token: 'tok' });
    sockets[0].receive(startMessage(0, 40));
    conn.update(10);
    return { sockets, conn };
  }

  it('opens a second socket, joins with room, name and token after onopen, and closes the old one', () => {
    const { sockets, conn } = joinedSetup();
    expect(conn.playerName()).toBe('Anna');
    conn.reopen();
    expect(sockets).toHaveLength(2);
    expect(sockets[0].closed).toBe(true);
    expect(conn.status).toBe('connecting');
    expect(sockets[1].sent).toEqual([]);
    sockets[1].open();
    expect(conn.status).toBe('open');
    expect(sockets[1].sent).toEqual([{ t: 'join', room: 'ABCD', name: 'Anna', token: 'tok' }]);
  });

  it('ignores the late onclose of a replaced socket', () => {
    const { sockets, conn } = joinedSetup();
    let closed = 0;
    conn.onClosed = () => closed++;
    conn.reopen();
    sockets[0].onclose?.(); // spätes Ereignis des alten Sockets (auch wenn schon abgehängt)
    expect(closed).toBe(0);
    expect(conn.status).toBe('connecting');
    sockets[1].open();
    expect(conn.status).toBe('open');
  });

  it('reports onClosed when the new socket drops', () => {
    const { sockets, conn } = joinedSetup();
    let closed = 0;
    conn.onClosed = () => closed++;
    conn.reopen();
    sockets[1].close();
    expect(closed).toBe(1);
    expect(conn.status).toBe('closed');
  });

  it('ignores a late onclose of the first socket after connect() was replaced', () => {
    const { sockets, conn } = joinedSetup();
    const first = sockets[0];
    const handler = first.onclose;
    conn.reopen();
    let closed = 0;
    conn.onClosed = () => closed++;
    handler?.();
    expect(closed).toBe(0);
  });

  it('replaces a socket that is still connecting; its stale onclose is ignored', () => {
    const { sockets, conn } = joinedSetup();
    conn.reopen(); // sockets[1] bleibt im Zustand connecting
    expect(conn.status).toBe('connecting');
    const stale = sockets[1].onclose;
    let closed = 0;
    conn.onClosed = () => closed++;
    conn.reopen();
    expect(sockets).toHaveLength(3);
    expect(sockets[1].closed).toBe(true);
    stale?.();
    sockets[1].onclose?.();
    expect(closed).toBe(0);
    expect(conn.status).toBe('connecting');
    sockets[2].open();
    expect(sockets[2].sent).toEqual([{ t: 'join', room: 'ABCD', name: 'Anna', token: 'tok' }]);
    expect(sockets[1].sent).toEqual([]);
  });

  it('drops a buy command pressed during the outage', () => {
    const { sockets, conn } = joinedSetup();
    conn.update(10);
    conn.setInput('p1', { ...NO_INPUT, buy: 'upgrade' });
    conn.reopen();
    sockets[1].open();
    sockets[1].receive(startMessage(1, 40));
    conn.update(10);
    const inputs = sockets[1].sent.filter((m) => m.t === 'input') as Extract<ClientMessage, { t: 'input' }>[];
    expect(inputs.length).toBeGreaterThan(0);
    expect(inputs.every((m) => m.input.buy === null)).toBe(true);
  });

  it('throws without a prior joined', () => {
    const { conn } = setup();
    expect(() => conn.reopen()).toThrow();
    conn.join('ABCD', 'Anna');
    expect(() => conn.reopen()).toThrow(); // noch kein Token
  });

  it('keeps the buffered state until start, then replaces it and sends an input at once', () => {
    const { sockets, conn } = joinedSetup();
    sockets[0].receive(snapMessage(5, 90));
    conn.update(250);
    conn.update(250);
    expect(conn.getState().tick).toBe(5);
    conn.reopen();
    sockets[1].open();
    conn.update(50);
    expect(conn.getState().tick).toBe(5);
    expect(sockets[1].sent.filter((m) => m.t === 'input')).toHaveLength(0);
    sockets[1].receive({ t: 'joined', room: 'ABCD', you: 'p1', token: 'tok' });
    sockets[1].receive(startMessage(2, 40));
    conn.update(10);
    expect(conn.getState().tick).toBe(2);
    expect(sockets[1].sent.filter((m) => m.t === 'input')).toHaveLength(1);
  });

  it('sets status closed and rethrows when the factory throws in reopen()', () => {
    let fail = false;
    const socket = new FakeSocket();
    const conn = new OnlineConnection('ws://test', () => {
      if (fail) throw new Error('boom');
      return socket;
    });
    conn.connect();
    socket.open();
    conn.join('ABCD', 'Anna');
    socket.receive({ t: 'joined', room: 'ABCD', you: 'p1', token: 'tok' });
    fail = true;
    expect(() => conn.reopen()).toThrow('boom');
    expect(conn.status).toBe('closed');
  });
});
