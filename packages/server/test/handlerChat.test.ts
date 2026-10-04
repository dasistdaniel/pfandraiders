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

function inRoom() {
  let t = 50_000;
  const now = () => t;
  const manager = new RoomManager({ maxRooms: 5, now });
  const sockets = new Map<Conn, ReturnType<typeof fakeSock>>();
  const errors: unknown[] = [];
  const env: Env = { manager, sockets, now, onError: (e) => errors.push(e) };
  const a = fakeConn();
  const b = fakeConn();
  const created = manager.create('Anna', a.conn);
  if (!created.ok) throw new Error('create failed');
  const { room, member } = created.value;
  if (!room.join('Bob', b.conn).ok) throw new Error('join failed');
  const sock = fakeSock();
  sockets.set(a.conn, sock);
  const session: Session = { ...newSession(t), room, member };
  const send = (msg: unknown) => handleMessage(env, session, a.conn, sock, JSON.stringify(msg));
  return { env, a, b, room, member, sock, session, send, errors, advance: (ms: number) => (t += ms) };
}

const chats = (sent: ServerMessage[]) => sent.filter((m) => m.t === 'chat');
const errorCodes = (sent: ServerMessage[]) => sent.flatMap((m) => (m.t === 'error' ? [m.code] : []));

describe('chat through the message handler', () => {
  it('cleans the text and broadcasts it to both players', () => {
    const { a, b, send } = inRoom();
    send({ t: 'chat', text: '  Hallo\n  Bob​ ' });
    expect(chats(a.sent)).toEqual([expect.objectContaining({ t: 'chat', id: 'p1', name: 'Anna', text: 'Hallo Bob' })]);
    expect(chats(b.sent)).toHaveLength(1);
  });

  it('answers bad_message for invalid chat payloads', () => {
    const { a, b, send, advance } = inRoom();
    for (const bad of [{ t: 'chat' }, { t: 'chat', text: 5 }, { t: 'chat', text: '   ' }, { t: 'chat', text: 'x'.repeat(2000) }]) {
      send(bad);
      advance(2000);
    }
    expect(errorCodes(a.sent)).toEqual(['bad_message', 'bad_message', 'bad_message', 'bad_message']);
    expect(chats(b.sent)).toHaveLength(0);
  });

  it('answers chat_too_fast and chat_closed', () => {
    const { a, member, room, send } = inRoom();
    send({ t: 'chat', text: 'eins' });
    send({ t: 'chat', text: 'zwei' });
    expect(errorCodes(a.sent)).toEqual(['chat_too_fast']);
    expect(room.start(member.id).ok).toBe(true);
    send({ t: 'chat', text: 'drei' });
    expect(errorCodes(a.sent)).toEqual(['chat_too_fast', 'chat_closed']);
    expect(chats(a.sent).map((m) => m.text)).toEqual(['eins']);
  });

  it('answers not_in_room for a socket without a room', () => {
    const { env } = inRoom();
    const c = fakeConn();
    handleMessage(env, newSession(0), c.conn, fakeSock(), JSON.stringify({ t: 'chat', text: 'hi' }));
    expect(errorCodes(c.sent)).toEqual(['not_in_room']);
  });

  it('closes a replaced connection instead of chatting', () => {
    const { a, b, room, member, sock, send } = inRoom();
    const fresh = fakeConn();
    expect(room.join('Anna', fresh.conn, member.token).ok).toBe(true);
    send({ t: 'chat', text: 'alt' });
    expect(sock.close).toHaveBeenCalledWith(4000, 'replaced');
    expect(chats(b.sent)).toHaveLength(0);
    expect(chats(a.sent)).toHaveLength(0);
  });

  it('contains exceptions thrown by Room.chat', () => {
    const { a, room, send, errors } = inRoom();
    room.chat = () => {
      throw new Error('boom');
    };
    send({ t: 'chat', text: 'hi' });
    expect(errors).toHaveLength(1);
    expect(errorCodes(a.sent)).toEqual(['bad_message']);
  });
});
