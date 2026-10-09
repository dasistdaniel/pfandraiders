import type { ServerMessage } from '@pfandraiders/core';
import { describe, expect, it, vi } from 'vitest';
import type { Conn } from '../src/room';
import { RoomManager } from '../src/rooms';
import { handleMessage, newSession } from '../src/server';
import type { Env, Session } from '../src/server';

function fakeConn() {
  const sent: ServerMessage[] = [];
  const conn: Conn = { send: (m) => void sent.push(m) };
  return { conn, sent };
}
function fakeSock() {
  return { close: vi.fn(), terminate: vi.fn() };
}

function setup() {
  let t = 1000;
  const manager = new RoomManager({ maxRooms: 5, countdownMs: 0, roundMs: 100 });
  const env: Env = { manager, sockets: new Map(), now: () => t, onError: () => {} };
  const send = (s: Session, c: ReturnType<typeof fakeConn>, msg: unknown) => handleMessage(env, s, c.conn, fakeSock(), JSON.stringify(msg));
  return { env, manager, send, advance: (ms: number) => (t += ms) };
}

describe('create and join with the new fields', () => {
  it('creates a named private room with password and avatar wish', () => {
    const { manager, send } = setup();
    const a = fakeConn();
    const sa = newSession(1000);
    send(sa, a, { t: 'create', name: 'Anna', roomName: 'Bude', visibility: 'private', password: 'geheim', avatar: 9 });
    const room = sa.room!;
    expect(room).toMatchObject({ name: 'Bude', visibility: 'private', locked: true });
    expect(sa.member!.avatar).toBe(9);
    expect(manager.listRooms()).toEqual([]);
    expect(a.sent.find((m) => m.t === 'lobby')).toMatchObject({ roomName: 'Bude', locked: true });
  });

  it('answers wrong_password for a missing or wrong password and joins with the right one', () => {
    const { send } = setup();
    const a = fakeConn();
    const sa = newSession(1000);
    send(sa, a, { t: 'create', name: 'Anna', password: 'geheim' });
    const code = sa.room!.code;
    const b = fakeConn();
    const sb = newSession(1000);
    send(sb, b, { t: 'join', room: code, name: 'Bob' });
    expect(b.sent.at(-1)).toMatchObject({ t: 'error', code: 'wrong_password' });
    send(sb, b, { t: 'join', room: code, name: 'Bob', password: 'falsch' });
    expect(b.sent.at(-1)).toMatchObject({ t: 'error', code: 'wrong_password' });
    send(sb, b, { t: 'join', room: code, name: 'Bob', password: 'geheim', avatar: 2 });
    expect(sb.member).toMatchObject({ name: 'Bob', avatar: 2 });
  });

  it('rejects a too long password as bad_message', () => {
    const { send } = setup();
    const a = fakeConn();
    send(newSession(1000), a, { t: 'create', name: 'Anna', password: 'x'.repeat(17) });
    expect(a.sent).toEqual([expect.objectContaining({ t: 'error', code: 'bad_message' })]);
  });
});

describe('wrong password limit', () => {
  function locked() {
    const s = setup();
    const a = fakeConn();
    const sa = newSession(1000);
    s.send(sa, a, { t: 'create', name: 'Anna', password: 'geheim' });
    return { ...s, room: sa.room!, code: sa.room!.code };
  }

  it('allows five wrong passwords per minute and connection, then rate_limited even for the right one', () => {
    const { send, code, advance } = locked();
    const b = fakeConn();
    const sb = newSession(1000);
    for (let i = 0; i < 5; i++) {
      send(sb, b, { t: 'join', room: code, name: 'Bob', password: 'falsch' });
      expect(b.sent.at(-1)).toMatchObject({ t: 'error', code: 'wrong_password' });
    }
    send(sb, b, { t: 'join', room: code, name: 'Bob', password: 'geheim' });
    expect(b.sent.at(-1)).toMatchObject({ t: 'error', code: 'rate_limited' });
    expect(sb.room).toBeNull();
    advance(59_999);
    send(sb, b, { t: 'join', room: code, name: 'Bob', password: 'geheim' });
    expect(b.sent.at(-1)).toMatchObject({ t: 'error', code: 'rate_limited' });
    advance(1);
    send(sb, b, { t: 'join', room: code, name: 'Bob', password: 'geheim' });
    expect(sb.room).not.toBeNull();
  });

  it('counts a missing password as a failure and does not limit other connections', () => {
    const { send, code } = locked();
    const b = fakeConn();
    const sb = newSession(1000);
    for (let i = 0; i < 5; i++) send(sb, b, { t: 'join', room: code, name: 'Bob' });
    send(sb, b, { t: 'join', room: code, name: 'Bob', password: 'geheim' });
    expect(b.sent.at(-1)).toMatchObject({ t: 'error', code: 'rate_limited' });
    const c = fakeConn();
    const sc = newSession(1000);
    send(sc, c, { t: 'join', room: code, name: 'Cara', password: 'geheim' });
    expect(sc.room).not.toBeNull();
  });

  it('lets a token return through even when the connection is limited', () => {
    const { send, code, room } = locked();
    const bob = room.join('Bob', fakeConn().conn, undefined, { password: 'geheim' });
    if (!bob.ok) throw new Error('join failed');
    room.start('p1');
    room.leave(bob.value.conn!);
    const b = fakeConn();
    const sb = newSession(1000);
    for (let i = 0; i < 5; i++) send(sb, b, { t: 'join', room: code, name: 'Bob', password: 'falsch' });
    send(sb, b, { t: 'join', room: code, name: 'Bob', token: bob.value.token });
    expect(sb.member).toBe(bob.value);
  });

  it('does not count failures in rooms without a password', () => {
    const { send } = setup();
    const a = fakeConn();
    const sa = newSession(1000);
    send(sa, a, { t: 'create', name: 'Anna' });
    const b = fakeConn();
    const sb = newSession(1000);
    send(sb, b, { t: 'join', room: sa.room!.code, name: 'Bob', password: 'egal' });
    expect(sb.room).toBe(sa.room);
    expect(sb.passwordFails).toEqual([]);
  });
});

describe('listRooms', () => {
  it('answers with the public rooms, also without a room, at most once per second', () => {
    const { send, advance } = setup();
    const a = fakeConn();
    const sa = newSession(1000);
    send(sa, a, { t: 'create', name: 'Anna', roomName: 'Bude' });
    const c = fakeConn();
    const sc = newSession(1000);
    send(sc, c, { t: 'listRooms' });
    expect(c.sent.at(-1)).toMatchObject({ t: 'rooms', rooms: [{ name: 'Bude', host: 'Anna', players: 1 }] });
    advance(999);
    send(sc, c, { t: 'listRooms' });
    expect(c.sent.at(-1)).toMatchObject({ t: 'error', code: 'rate_limited' });
    advance(1);
    send(sc, c, { t: 'listRooms' });
    expect(c.sent.at(-1)).toMatchObject({ t: 'rooms' });
    expect(sc.room).toBeNull();
  });
});

describe('setAvatar, setRounds and toLobby', () => {
  it('routes the messages to the room with its errors', () => {
    const { send } = setup();
    const a = fakeConn();
    const b = fakeConn();
    const sa = newSession(1000);
    const sb = newSession(1000);
    send(sa, a, { t: 'create', name: 'Anna' });
    send(sb, b, { t: 'join', room: sa.room!.code, name: 'Bob' });
    const room = sa.room!;

    send(sb, b, { t: 'setAvatar', avatar: 1 });
    expect(b.sent.at(-1)).toMatchObject({ t: 'error', code: 'avatar_taken' });
    send(sb, b, { t: 'setAvatar', avatar: 30 });
    expect(b.sent.at(-1)).toMatchObject({ t: 'error', code: 'bad_message' });
    send(sb, b, { t: 'setAvatar', avatar: 23 });
    expect(sb.member!.avatar).toBe(23);

    send(sb, b, { t: 'setRounds', rounds: 1 });
    expect(b.sent.at(-1)).toMatchObject({ t: 'error', code: 'not_host' });
    send(sa, a, { t: 'setRounds', rounds: 1 });
    expect(room.rounds()).toBe(1);

    send(sa, a, { t: 'toLobby' });
    expect(a.sent.at(-1)).toMatchObject({ t: 'error', code: 'wrong_phase' });
    send(sa, a, { t: 'start' });
    for (let i = 0; i < 10 && room.phase === 'playing'; i++) room.tick();
    expect(room.phase).toBe('final');
    send(sb, b, { t: 'toLobby' });
    expect(b.sent.at(-1)).toMatchObject({ t: 'error', code: 'not_host' });
    send(sa, a, { t: 'toLobby' });
    expect(room.phase).toBe('lobby');
  });

  it('answers not_in_room without a room', () => {
    const { send } = setup();
    const c = fakeConn();
    const sc = newSession(1000);
    for (const msg of [{ t: 'setAvatar', avatar: 1 }, { t: 'setRounds', rounds: 1 }, { t: 'toLobby' }]) {
      send(sc, c, msg);
      expect(c.sent.at(-1)).toMatchObject({ t: 'error', code: 'not_in_room' });
    }
  });
});
