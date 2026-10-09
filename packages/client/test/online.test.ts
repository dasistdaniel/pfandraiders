import { CITY_MAP, CONFIG, DEFAULT_MAP_ID, DEFAULT_ROUND_MS, DEFAULT_ROUNDS, RETRO_MAP, createGame, freshProgress, NO_INPUT, projectSnapshot, ROOM_COLORS } from '@pfandraiders/core';
import type { ClientMessage, Player, RoomPhase, ServerMessage } from '@pfandraiders/core';
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
    { id: 'p1', name: 'Anna', color: ROOM_COLORS[0], connected: true, ready: false, avatar: 1 },
    { id: 'p2', name: 'Bob', color: ROOM_COLORS[1], connected: true, ready: false, avatar: 14 },
  ];
}

/** lobby-Nachricht mit den Pflichtfeldern für Räume */
function lobbyMsg(host: string, phase: RoomPhase, roundMs: number): ServerMessage {
  return { t: 'lobby', room: 'ABCD', roomName: 'Annas Raum', visibility: 'public', locked: false, host, players: roster(), phase, roundMs, rounds: DEFAULT_ROUNDS };
}

function setup() {
  const socket = new FakeSocket();
  const conn = new OnlineConnection('ws://test', () => socket);
  conn.connect();
  socket.open();
  return { socket, conn };
}

function startMessage(tickValue = 0, x2 = 40): ServerMessage {
  const s = createGame(1, CITY_MAP, ['p1', 'p2'], { countdownMs: 0 });
  s.tick = tickValue;
  s.players.p2.x = x2;
  return { t: 'start', mapId: DEFAULT_MAP_ID, map: CITY_MAP, you: 'p1', players: roster(), snap: projectSnapshot(s, 'p1'), roundMs: DEFAULT_ROUND_MS, rounds: DEFAULT_ROUNDS, round: 1 };
}

function snapMessage(tickValue: number, x2: number): ServerMessage {
  const s = createGame(1, CITY_MAP, ['p1', 'p2'], { countdownMs: 0 });
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
    socket.receive(lobbyMsg('p1', 'lobby', DEFAULT_ROUND_MS));
    expect(conn.roster).toHaveLength(2);
    expect(conn.isHost()).toBe(false);
    socket.receive(lobbyMsg('p2', 'lobby', DEFAULT_ROUND_MS));
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
    socket.receive(lobbyMsg('p1', 'lobby', DEFAULT_ROUND_MS));
    conn.requestStart();
    expect(socket.sent.some((m) => m.t === 'start')).toBe(false);
    socket.receive(lobbyMsg('p2', 'lobby', DEFAULT_ROUND_MS));
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

  it('does not send inputs before a game has started', () => {
    const { socket, conn } = setup();
    conn.setInput('p1', { ...NO_INPUT, moveX: 1 });
    conn.update(200);
    expect(socket.sent.filter((m) => m.t === 'input')).toHaveLength(0);
  });

  it('sends a changed attack, steal or spray key at once, not only with the heartbeat', () => {
    const { socket, conn } = setup();
    socket.receive(startMessage());
    conn.update(10);
    const before = socket.sent.filter((m) => m.t === 'input').length;
    conn.setInput('p1', { ...NO_INPUT, attack: true });
    conn.update(10);
    conn.setInput('p1', { ...NO_INPUT, steal: true });
    conn.update(10);
    conn.setInput('p1', { ...NO_INPUT, spray: true });
    conn.update(10);
    const inputs = socket.sent.filter((m) => m.t === 'input') as Extract<ClientMessage, { t: 'input' }>[];
    expect(inputs.length).toBe(before + 3);
    expect(inputs.at(-3)!.input.attack).toBe(true);
    expect(inputs.at(-2)!.input.steal).toBe(true);
    expect(inputs.at(-1)!.input.spray).toBe(true);
  });

  it('tracks the room phase and sends ready', () => {
    const { socket, conn } = setup();
    expect(conn.roomPhase).toBe('lobby');
    socket.receive({ t: 'phase', phase: 'shop' });
    expect(conn.roomPhase).toBe('shop');
    conn.setReady(true);
    expect(socket.sent.at(-1)).toEqual({ t: 'ready', ready: true });
    socket.receive(lobbyMsg('p1', 'playing', DEFAULT_ROUND_MS));
    expect(conn.roomPhase).toBe('playing');
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

  it('snaps the own player to a far away server position', () => {
    const { socket, conn } = setup();
    socket.receive(startMessage(0));
    const s = createGame(1, CITY_MAP, ['p1', 'p2'], { countdownMs: 0 });
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

describe('OnlineConnection own-player prediction', () => {
  const SPEED = CONFIG.playerSpeed;

  function ownSnap(tickValue: number, ack: number, mutate: (p: Player) => void = () => {}): ServerMessage {
    const s = createGame(1, CITY_MAP, ['p1', 'p2'], { countdownMs: 0 });
    s.tick = tickValue;
    mutate(s.players.p1);
    return { t: 'snap', snap: projectSnapshot(s, 'p1'), ack };
  }
  function spawn() {
    return createGame(1, CITY_MAP, ['p1', 'p2'], { countdownMs: 0 }).players.p1;
  }
  function lastSeq(socket: FakeSocket): number {
    const inputs = socket.sent.filter((m) => m.t === 'input') as Extract<ClientMessage, { t: 'input' }>[];
    return inputs[inputs.length - 1].seq;
  }
  function started() {
    const ctx = setup();
    ctx.socket.receive(startMessage(0, 40));
    ctx.conn.update(16);
    return ctx;
  }

  it('moves the own figure at once, before any snapshot arrives', () => {
    const { conn } = started();
    const x0 = conn.getState().players.p1.x;
    conn.setInput('p1', { ...NO_INPUT, moveX: 1 });
    conn.update(16);
    expect(conn.getState().players.p1.x).toBeCloseTo(x0 + (SPEED * 16) / 1000, 6);
    conn.update(100);
    expect(conn.getState().players.p1.x).toBeCloseTo(x0 + (SPEED * 116) / 1000, 6);
    expect(conn.bufferedSnapshots()).toBe(1);
  });

  it('stands still with the menu input (NO_INPUT)', () => {
    const { conn } = started();
    const x0 = conn.getState().players.p1.x;
    conn.setInput('p1', { ...NO_INPUT });
    for (let i = 0; i < 10; i++) conn.update(16);
    expect(conn.getState().players.p1.x).toBe(x0);
  });

  it('does not walk while the connection is down', () => {
    const { socket, conn } = started();
    const x0 = conn.getState().players.p1.x;
    socket.close();
    conn.setInput('p1', { ...NO_INPUT, moveX: 1 });
    for (let i = 0; i < 10; i++) conn.update(16);
    expect(conn.getState().players.p1.x).toBe(x0);
  });

  it('does not walk during the countdown, but keeps sending the input; walks once it is over', () => {
    const { socket, conn } = started();
    socket.receive(ownSnap(1, 0, () => {}));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const counting = ownSnap(2, 0) as any;
    counting.snap.countdownMs = 3000;
    socket.receive(counting);
    conn.update(16);
    const x0 = conn.getState().players.p1.x;
    conn.setInput('p1', { ...NO_INPUT, moveX: 1 });
    for (let i = 0; i < 10; i++) conn.update(16);
    expect(conn.getState().players.p1.x).toBe(x0);
    expect(conn.getState().countdownMs).toBe(3000);
    // gesendet wird trotzdem: der Server wendet die gehaltene Eingabe ab dem ersten Rundentakt an
    const inputs = socket.sent.filter((m) => m.t === 'input') as Extract<ClientMessage, { t: 'input' }>[];
    expect(inputs[inputs.length - 1].input.moveX).toBe(1);
    socket.receive(ownSnap(3, lastSeq(socket)));
    conn.update(16);
    expect(conn.getState().players.p1.x).toBeGreaterThan(x0);
  });

  it('does not walk after the round has ended', () => {
    const { socket, conn } = started();
    socket.receive(ownSnap(1, 0, () => {}));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msg = ownSnap(2, 0) as any;
    msg.snap.phase = 'ended';
    msg.snap.timeLeftMs = 0;
    socket.receive(msg);
    conn.update(16);
    const x0 = conn.getState().players.p1.x;
    conn.setInput('p1', { ...NO_INPUT, moveX: 1 });
    for (let i = 0; i < 10; i++) conn.update(16);
    expect(conn.getState().players.p1.x).toBe(x0);
  });

  it('does not jump on a snapshot that matches the prediction', () => {
    const { socket, conn } = started();
    conn.setInput('p1', { ...NO_INPUT, moveX: 1 });
    for (let i = 0; i < 6; i++) conn.update(16);
    const seq = lastSeq(socket);
    const before = conn.getState().players.p1.x;
    // Server ist etwas zurück (er sieht die Eingabe später), liegt aber auf dem eigenen Weg
    socket.receive(ownSnap(1, seq, (p) => (p.x = spawn().x + 5)));
    conn.update(16);
    expect(conn.getState().players.p1.x).toBeCloseTo(before + (SPEED * 16) / 1000, 6);
  });

  it('corrects a standing figure gently towards the server position', () => {
    const { socket, conn } = started();
    for (let i = 0; i < 10; i++) conn.update(16);
    const x0 = conn.getState().players.p1.x;
    const seq = lastSeq(socket);
    socket.receive(ownSnap(1, seq, (p) => (p.x = x0 + 4)));
    conn.update(16);
    const x1 = conn.getState().players.p1.x;
    expect(x1).toBeGreaterThan(x0);
    expect(x1).toBeLessThan(x0 + 4 * 0.35 + 1e-9);
    for (let k = 2; k < 30; k++) {
      socket.receive(ownSnap(k, seq, (p) => (p.x = x0 + 4)));
      conn.update(50);
    }
    expect(conn.getState().players.p1.x).toBeCloseTo(x0 + 4, 0);
    expect(Math.abs(conn.getState().players.p1.x - (x0 + 4))).toBeLessThanOrEqual(0.5);
  });

  it('ignores garbage acks except for the snap rule', () => {
    const { socket, conn } = started();
    for (let i = 0; i < 10; i++) conn.update(16);
    const x0 = conn.getState().players.p1.x;
    let tick = 1;
    for (const ack of ['7', null, -1, 1.5, 1e300, Number.MAX_SAFE_INTEGER + 2, 999]) {
      const msg = ownSnap(tick++, 0, (p) => (p.x = x0 + 4)) as Extract<ServerMessage, { t: 'snap' }>;
      expect(() => socket.receive({ ...msg, ack: ack as number })).not.toThrow();
      conn.update(16);
      expect(conn.getState().players.p1.x).toBe(x0);
    }
  });

  it('takes every other own field from the snapshot at once and leaves the buffer untouched', () => {
    const { socket, conn } = started();
    conn.setInput('p1', { ...NO_INPUT, moveX: 1 });
    conn.update(16);
    const seq = lastSeq(socket);
    socket.receive(ownSnap(1, seq, (p) => (p.money = 1234)));
    conn.update(16);
    const me = conn.getState().players.p1;
    expect(me.money).toBe(1234);
    expect(me.x).toBeGreaterThan(spawn().x);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buf = (conn as any).buffer as { snap: { players: Record<string, Player> } }[];
    expect(buf[buf.length - 1].snap.players.p1.x).toBe(spawn().x);
  });

  it('shows the server position while unconscious', () => {
    const { socket, conn } = started();
    conn.setInput('p1', { ...NO_INPUT, moveX: 1 });
    conn.update(16);
    socket.receive(
      ownSnap(1, lastSeq(socket), (p) => {
        p.mode = 'unconscious';
        p.unconsciousMs = 5000;
      }),
    );
    for (let i = 0; i < 5; i++) conn.update(16);
    expect(conn.getState().players.p1.x).toBe(spawn().x);
  });

  it('starts the prediction anew on start', () => {
    const { socket, conn } = started();
    conn.setInput('p1', { ...NO_INPUT, moveX: 1 });
    for (let i = 0; i < 10; i++) conn.update(16);
    expect(conn.getState().players.p1.x).toBeGreaterThan(spawn().x);
    conn.setInput('p1', { ...NO_INPUT });
    socket.receive(startMessage(0, 40));
    conn.update(16);
    expect(conn.getState().players.p1.x).toBe(spawn().x);
  });
});

describe('shop phase messages', () => {
  it('stores the own shop state and ready flag and tells the scene', () => {
    const { socket, conn } = setup();
    let calls = 0;
    conn.onShopState = () => calls++;
    socket.receive({ t: 'shopState', you: { ...freshProgress(), money: 250 }, ready: true });
    expect(conn.shop?.money).toBe(250);
    expect(conn.shopReady).toBe(true);
    expect(calls).toBe(1);
  });

  it('keeps the old shop state when a broken one arrives', () => {
    const { socket, conn } = setup();
    socket.receive({ t: 'shopState', you: { ...freshProgress(), money: 250 }, ready: false });
    socket.onmessage?.({ data: JSON.stringify({ t: 'shopState', you: { money: -5 }, ready: true }) });
    expect(conn.shop?.money).toBe(250);
    expect(conn.shopReady).toBe(false);
  });

  it('stores the ranking and the phase and calls onPhase', () => {
    const { socket, conn } = setup();
    let phases = 0;
    conn.onPhase = () => phases++;
    socket.receive({ t: 'ranking', entries: [{ id: 'p1', money: 5, round: 5, total: 5 }] });
    socket.receive({ t: 'phase', phase: 'shop' });
    expect(conn.ranking).toEqual([{ id: 'p1', money: 5, round: 5, total: 5 }]);
    expect(conn.roomPhase).toBe('shop');
    expect(phases).toBe(1);
  });

  it('accepts the final phase and ignores unknown phases', () => {
    const { socket, conn } = setup();
    let phases = 0;
    conn.onPhase = () => phases++;
    socket.receive({ t: 'phase', phase: 'final' });
    expect(conn.roomPhase).toBe('final');
    socket.onmessage?.({ data: JSON.stringify({ t: 'phase', phase: 'bogus' }) });
    expect(conn.roomPhase).toBe('final');
    expect(phases).toBe(1);
  });

  it('sends shopBuy, and setRoundMs and endSeries only as host', () => {
    const { socket, conn } = setup();
    socket.receive({ t: 'joined', room: 'ABCD', you: 'p2', token: 't' });
    socket.receive(lobbyMsg('p1', 'lobby', 420_000));
    expect(conn.roundMs).toBe(420_000);
    conn.shopBuy('defense', 'dog_treat', 3);
    conn.setRoundMs(180_000);
    conn.endSeries();
    expect(socket.sent.filter((m) => m.t !== 'join')).toEqual([{ t: 'shopBuy', category: 'defense', item: 'dog_treat', qty: 3 }]);
    socket.receive(lobbyMsg('p2', 'shop', 420_000));
    conn.setRoundMs(180_000);
    conn.endSeries();
    expect(socket.sent.slice(-2)).toEqual([{ t: 'setRoundMs', roundMs: 180_000 }, { t: 'endSeries' }]);
  });
});

describe('rooms, room list, avatars and round count', () => {
  it('sends create with only the given options', () => {
    const { socket, conn } = setup();
    conn.create('Anna', { roomName: 'Bude', visibility: 'private', password: 'pw', avatar: 3 });
    conn.create('Anna', { roomName: '', password: '' });
    expect(socket.sent).toEqual([
      { t: 'create', name: 'Anna', roomName: 'Bude', visibility: 'private', password: 'pw', avatar: 3 },
      { t: 'create', name: 'Anna' },
    ]);
  });

  it('sends join with password and avatar next to the token', () => {
    const { socket, conn } = setup();
    conn.join('ABCD', 'Bob', undefined, { password: 'pw', avatar: 0 });
    conn.join('ABCD', 'Bob', 'tok', {});
    expect(socket.sent).toEqual([
      { t: 'join', room: 'ABCD', name: 'Bob', password: 'pw', avatar: 0 },
      { t: 'join', room: 'ABCD', name: 'Bob', token: 'tok' },
    ]);
  });

  it('reconnects with the token only, never with a password', () => {
    const sockets = [new FakeSocket(), new FakeSocket()];
    let k = 0;
    const conn = new OnlineConnection('ws://test', () => sockets[k++]);
    conn.connect();
    sockets[0].open();
    conn.join('ABCD', 'Bob', undefined, { password: 'geheim' });
    sockets[0].receive({ t: 'joined', room: 'ABCD', you: 'p2', token: 'tok' });
    conn.reopen();
    sockets[1].open();
    expect(sockets[1].sent).toEqual([{ t: 'join', room: 'ABCD', name: 'Bob', token: 'tok' }]);
  });

  it('reads room name, visibility, lock and round count from lobby and keeps old values for garbage', () => {
    const { socket, conn } = setup();
    socket.receive({ ...lobbyMsg('p1', 'lobby', DEFAULT_ROUND_MS), roomName: 'Bude', visibility: 'private', locked: true, rounds: 5 } as ServerMessage);
    expect(conn).toMatchObject({ roomName: 'Bude', visibility: 'private', locked: true, rounds: 5 });
    socket.onmessage?.({
      data: JSON.stringify({ ...lobbyMsg('p1', 'lobby', DEFAULT_ROUND_MS), roomName: 7, visibility: 'x', locked: 'ja', rounds: 2 }),
    });
    expect(conn).toMatchObject({ roomName: 'Bude', visibility: 'private', locked: true, rounds: 5 });
  });

  it('reads rounds and the round number from start', () => {
    const { socket, conn } = setup();
    socket.receive({ ...(startMessage() as Extract<ServerMessage, { t: 'start' }>), rounds: 1, round: 1 });
    expect(conn.rounds).toBe(1);
    expect(conn.round).toBe(1);
  });

  it('stores a valid room list, calls onRooms and ignores garbage', () => {
    const { socket, conn } = setup();
    let calls = 0;
    conn.onRooms = () => calls++;
    const room = { code: 'ABCD', name: 'Bude', host: 'Anna', players: 1, max: 8, phase: 'lobby' as const, locked: false };
    socket.receive({ t: 'rooms', rooms: [room] });
    expect(conn.rooms).toEqual([room]);
    socket.onmessage?.({ data: JSON.stringify({ t: 'rooms', rooms: 'kaputt' }) });
    expect(conn.rooms).toEqual([room]);
    expect(calls).toBe(1);
  });

  it('sends listRooms and setAvatar when open, setRounds and toLobby only as host', () => {
    const { socket, conn } = setup();
    socket.receive({ t: 'joined', room: 'ABCD', you: 'p2', token: 't' });
    socket.receive(lobbyMsg('p1', 'lobby', DEFAULT_ROUND_MS));
    conn.listRooms();
    conn.setAvatar(5);
    conn.setRounds(1);
    conn.toLobby();
    expect(socket.sent).toEqual([{ t: 'listRooms' }, { t: 'setAvatar', avatar: 5 }]);
    socket.receive(lobbyMsg('p2', 'final', DEFAULT_ROUND_MS));
    conn.setRounds(1);
    conn.toLobby();
    expect(socket.sent.slice(-2)).toEqual([{ t: 'setRounds', rounds: 1 }, { t: 'toLobby' }]);
  });

  it('knows its own avatar from the roster', () => {
    const { socket, conn } = setup();
    expect(conn.ownAvatar()).toBeNull();
    socket.receive({ t: 'joined', room: 'ABCD', you: 'p2', token: 't' });
    socket.receive(lobbyMsg('p1', 'lobby', DEFAULT_ROUND_MS));
    expect(conn.ownAvatar()).toBe(14);
  });

  it('keeps the chat when the room goes final and back to lobby', () => {
    const { socket, conn } = setup();
    socket.receive({ t: 'chathistory', messages: [{ id: 'p1', name: 'Anna', color: ROOM_COLORS[0], text: 'Hallo', at: 1 }] });
    socket.receive({ t: 'phase', phase: 'final' });
    socket.receive({ t: 'phase', phase: 'lobby' });
    expect(conn.roomPhase).toBe('lobby');
    expect(conn.chat.map((m) => m.text)).toEqual(['Hallo']);
  });
});
