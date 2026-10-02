import { CITY_MAP, createGame, NO_INPUT, projectSnapshot, ROOM_COLORS } from '@pfandraiders/core';
import type { ClientMessage, ServerMessage } from '@pfandraiders/core';
import { describe, expect, it } from 'vitest';
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
  return { t: 'start', map: CITY_MAP, you: 'p1', players: roster(), snap: projectSnapshot(s, 'p1') };
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
