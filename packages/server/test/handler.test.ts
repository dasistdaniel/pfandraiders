import type { ServerMessage } from '@pfandraiders/core';
import { describe, expect, it, vi } from 'vitest';
import { SERVER_CONFIG } from '../src/config';
import type { Conn } from '../src/room';
import { RoomManager } from '../src/rooms';
import { handleMessage, makeSender, newSession } from '../src/server';
import type { Env, Session } from '../src/server';

function fakeConn() {
  const sent: ServerMessage[] = [];
  const conn: Conn = { send: (m) => void sent.push(m) };
  return { conn, sent };
}
function fakeSock() {
  return { close: vi.fn(), terminate: vi.fn() };
}
const INPUT = { t: 'input', seq: 1, input: { moveX: 1, moveY: 0, action: false, steal: false, attack: false, eat: false } };

function setup() {
  let t = 1000;
  const errors: unknown[] = [];
  const manager = new RoomManager({ maxRooms: 5 });
  const sockets = new Map<Conn, ReturnType<typeof fakeSock>>();
  const env: Env = { manager, sockets, now: () => t, onError: (e) => errors.push(e) };
  return { env, manager, sockets, errors, advance: (ms: number) => (t += ms) };
}

describe('stale connection guard', () => {
  it('ignores input and start from a connection that no longer owns the member and closes it', () => {
    const { env, manager, sockets } = setup();
    const a = fakeConn();
    const b = fakeConn();
    const created = manager.create('Anna', a.conn);
    if (!created.ok) throw new Error('create failed');
    const { room, member } = created.value;
    const bob = room.join('Bob', b.conn);
    if (!bob.ok) throw new Error('join failed');
    // Anna ist inzwischen mit einer neuen Verbindung zurück; a.conn ist veraltet
    const fresh = fakeConn();
    member.conn = fresh.conn;
    const stale = fakeSock();
    sockets.set(a.conn, stale);
    const session: Session = { ...newSession(1000), room, member };

    handleMessage(env, session, a.conn, stale, JSON.stringify(INPUT));
    expect(member.input.moveX).toBe(0);
    expect(stale.close).toHaveBeenCalledWith(4000, 'replaced');

    stale.close.mockClear();
    handleMessage(env, session, a.conn, stale, JSON.stringify({ t: 'start' }));
    expect(room.phase).toBe('lobby');
    expect(stale.close).toHaveBeenCalledWith(4000, 'replaced');

    // Die aktuelle Verbindung darf beides
    const live = fakeSock();
    handleMessage(env, { ...session }, fresh.conn, live, JSON.stringify(INPUT));
    expect(member.input.moveX).toBe(1);
    expect(live.close).not.toHaveBeenCalled();
  });
});

describe('exception containment in the message handler', () => {
  it('answers with a generic error, logs, and closes a socket that throws repeatedly', () => {
    const { env, manager, errors } = setup();
    const a = fakeConn();
    const created = manager.create('Anna', a.conn);
    if (!created.ok) throw new Error('create failed');
    const { room, member } = created.value;
    room.setInput = () => {
      throw new Error('secret internal detail');
    };
    const sock = fakeSock();
    const session: Session = { ...newSession(1000), room, member };
    for (let i = 0; i < SERVER_CONFIG.maxHandlerErrors - 1; i++) {
      handleMessage(env, session, a.conn, sock, JSON.stringify(INPUT));
    }
    expect(errors).toHaveLength(SERVER_CONFIG.maxHandlerErrors - 1);
    const errs = a.sent.filter((m) => m.t === 'error');
    expect(errs.length).toBeGreaterThan(0);
    for (const e of errs) {
      expect(e).toMatchObject({ code: 'bad_message' });
      expect(JSON.stringify(e)).not.toContain('secret');
    }
    expect(sock.close).not.toHaveBeenCalled();
    handleMessage(env, session, a.conn, sock, JSON.stringify(INPUT));
    expect(sock.close).toHaveBeenCalledWith(1011, expect.any(String));
  });
});

describe('rate limit notices', () => {
  it('answers rate_limited at most once per second, then closes with 1008 after sustained flooding', () => {
    const { env, advance } = setup();
    const a = fakeConn();
    const sock = fakeSock();
    const session = newSession(1000);
    const flood = () => handleMessage(env, session, a.conn, sock, JSON.stringify({ t: 'start' }));
    for (let i = 0; i < SERVER_CONFIG.maxMessagesPerSecond + 500; i++) flood();
    const notices = () => a.sent.filter((m) => m.t === 'error' && m.code === 'rate_limited').length;
    expect(notices()).toBe(1);
    expect(sock.close).not.toHaveBeenCalled();
    // anhaltende Flut: alle 100 ms ein Schub weit über dem Limit
    for (let i = 0; i < 60 && sock.close.mock.calls.length === 0; i++) {
      advance(100);
      for (let k = 0; k < 40; k++) flood();
    }
    expect(sock.close).toHaveBeenCalledWith(1008, expect.any(String));
    expect(notices()).toBeLessThanOrEqual(7);
  });
});

describe('makeSender backpressure', () => {
  const cfg = { maxBufferedBytes: 100, bufferedStaleMs: 5000 };
  const snap = { t: 'snap' } as unknown as ServerMessage;
  const other = { t: 'error', code: 'bad_message', message: 'x' } as ServerMessage;
  function ws(bufferedAmount: number) {
    return { readyState: 1, bufferedAmount, send: vi.fn(), terminate: vi.fn() };
  }

  it('sends normally under the cap and skips snapshots over it, but always sends other messages', () => {
    const sock = ws(10);
    const s = makeSender(sock, cfg, () => 0);
    s.send(snap);
    expect(sock.send).toHaveBeenCalledTimes(1);
    sock.bufferedAmount = 500;
    s.send(snap);
    s.send(snap);
    expect(sock.send).toHaveBeenCalledTimes(1);
    expect(s.skipped()).toBe(2);
    s.send(other);
    expect(sock.send).toHaveBeenCalledTimes(2);
    expect(sock.terminate).not.toHaveBeenCalled();
  });

  it('terminates a socket that stays over the cap for more than the stale time, and resets when it recovers', () => {
    let t = 0;
    const sock = ws(500);
    const s = makeSender(sock, cfg, () => t);
    s.send(snap);
    t = 4000;
    s.send(snap);
    expect(sock.terminate).not.toHaveBeenCalled();
    sock.bufferedAmount = 0; // erholt sich
    s.send(snap);
    sock.bufferedAmount = 500;
    t = 8000;
    s.send(snap); // Frist beginnt neu
    expect(sock.terminate).not.toHaveBeenCalled();
    t = 13_500;
    s.send(snap);
    expect(sock.terminate).toHaveBeenCalledTimes(1);
  });

  it('does nothing on a closed socket', () => {
    const sock = ws(0);
    sock.readyState = 3;
    makeSender(sock, cfg, () => 0).send(snap);
    expect(sock.send).not.toHaveBeenCalled();
  });
});

describe('leave message', () => {
  function inRoom() {
    const s = setup();
    const a = fakeConn();
    const b = fakeConn();
    const created = s.manager.create('Anna', a.conn);
    if (!created.ok) throw new Error('create failed');
    const { room, member } = created.value;
    const bob = room.join('Bob', b.conn);
    if (!bob.ok) throw new Error('join failed');
    const sock = fakeSock();
    s.sockets.set(a.conn, sock);
    const session: Session = { ...newSession(1000), room, member };
    return { ...s, a, b, room, member, sock, session };
  }

  it('releases the seat in the lobby, clears the session and closes the socket', () => {
    const { env, a, b, room, sock, session } = inRoom();
    handleMessage(env, session, a.conn, sock, JSON.stringify({ t: 'leave' }));
    expect(room.members.map((m) => m.name)).toEqual(['Bob']);
    expect(room.hostId()).toBe('p2');
    expect(session.room).toBeNull();
    expect(session.member).toBeNull();
    expect(sock.close).toHaveBeenCalledWith(1000, 'left');
    const lobby = b.sent.filter((m) => m.t === 'lobby').pop();
    expect(lobby).toMatchObject({ host: 'p2' });
  });

  it('keeps the figure in a running round but the token no longer works', () => {
    const { env, a, room, member, sock, session } = inRoom();
    room.start(member.id);
    handleMessage(env, session, a.conn, sock, JSON.stringify({ t: 'leave' }));
    expect(room.state!.players[member.id]).toBeDefined();
    expect(room.roster().find((r) => r.id === member.id)?.connected).toBe(false);
    expect(room.join('Anna', fakeConn().conn, member.token)).toMatchObject({ ok: false, code: 'already_started' });
  });

  it('answers not_in_room for a socket without a room', () => {
    const { env, room } = inRoom();
    const c = fakeConn();
    const sock = fakeSock();
    const before = room.members.length;
    handleMessage(env, newSession(1000), c.conn, sock, JSON.stringify({ t: 'leave' }));
    expect(c.sent).toEqual([expect.objectContaining({ t: 'error', code: 'not_in_room' })]);
    expect(room.members.length).toBe(before);
    expect(sock.close).not.toHaveBeenCalled();
  });

  it('does not release the seat from a replaced connection', () => {
    const { env, a, room, member, sock, session } = inRoom();
    room.start(member.id);
    const fresh = fakeConn();
    expect(room.join('Anna', fresh.conn, member.token).ok).toBe(true);
    handleMessage(env, session, a.conn, sock, JSON.stringify({ t: 'leave' }));
    expect(sock.close).toHaveBeenCalledWith(4000, 'replaced');
    expect(member.conn).toBe(fresh.conn);
    expect(member.expired).toBe(false);
  });
});

describe('series messages', () => {
  it('routes start with round time, ready, shopBuy, setRoundMs and endSeries to the room', () => {
    const { env, manager } = setup();
    const a = fakeConn();
    const b = fakeConn();
    const created = manager.create('Anna', a.conn);
    if (!created.ok) throw new Error('create failed');
    const { room, member } = created.value;
    const bob = room.join('Bob', b.conn);
    if (!bob.ok) throw new Error('join failed');
    const sa: Session = { ...newSession(1000), room, member };
    const sb: Session = { ...newSession(1000), room, member: bob.value };
    const send = (s: Session, c: ReturnType<typeof fakeConn>, msg: unknown) =>
      handleMessage(env, s, c.conn, fakeSock(), JSON.stringify(msg));

    send(sa, a, { t: 'setRoundMs', roundMs: 180_000 });
    expect(room.roundMs()).toBe(180_000);
    send(sb, b, { t: 'setRoundMs', roundMs: 600_000 });
    expect(b.sent.at(-1)).toMatchObject({ t: 'error', code: 'not_host' });
    send(sa, a, { t: 'start', roundMs: 420_000 });
    expect(room.phase).toBe('playing');
    expect(room.state!.timeLeftMs).toBe(420_000);
    send(sa, a, { t: 'shopBuy', category: 'defense', item: 'food', qty: 1 });
    expect(a.sent.at(-1)).toMatchObject({ t: 'error', code: 'wrong_phase' });

    room.state!.players.p1.money = 500;
    room.state!.timeLeftMs = 1;
    room.tick();
    expect(room.phase).toBe('shop');
    send(sa, a, { t: 'shopBuy', category: 'defense', item: 'food', qty: 2 });
    expect(room.progress.get('p1')!.inventory.food).toBe(2);
    send(sa, a, { t: 'shopBuy', category: 'defense', item: 'food', qty: 100 });
    expect(a.sent.at(-1)).toMatchObject({ t: 'error', code: 'bad_message' });
    send(sa, a, { t: 'ready', ready: true });
    expect(room.members[0].ready).toBe(true);
    send(sa, a, { t: 'endSeries' });
    expect(room.phase).toBe('lobby');
  });
});
