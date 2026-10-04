import type { ClientMessage } from '@pfandraiders/core';
import { describe, expect, it, vi } from 'vitest';
import { CLIENT_CHAT_SIZE } from '../src/chatLogic';
import { OnlineConnection } from '../src/online';
import type { SocketLike } from '../src/online';

class FakeSocket implements SocketLike {
  sent: ClientMessage[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  send(data: string): void {
    this.sent.push(JSON.parse(data) as ClientMessage);
  }
  close(): void {
    this.onclose?.();
  }
  open(): void {
    this.onopen?.();
  }
  raw(data: unknown): void {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

function setup() {
  const socket = new FakeSocket();
  const conn = new OnlineConnection('ws://test', () => socket);
  conn.connect();
  socket.open();
  const onChat = vi.fn();
  conn.onChat = onChat;
  return { socket, conn, onChat };
}

const msg = (text: string, extra: Record<string, unknown> = {}) => ({
  t: 'chat',
  id: 'p1',
  name: 'Anna',
  color: 0xef5350,
  text,
  at: 1000,
  ...extra,
});

describe('OnlineConnection chat', () => {
  it('sends chat text only while open and not blank', () => {
    const socket = new FakeSocket();
    const conn = new OnlineConnection('ws://test', () => socket);
    conn.sendChat('zu früh');
    conn.connect();
    conn.sendChat('noch zu');
    socket.open();
    conn.sendChat('   ');
    conn.sendChat('Hallo');
    expect(socket.sent).toEqual([{ t: 'chat', text: 'Hallo' }]);
  });

  it('appends valid chat messages and notifies', () => {
    const { socket, conn, onChat } = setup();
    socket.raw(msg('Hallo'));
    expect(conn.chat).toEqual([{ id: 'p1', name: 'Anna', color: 0xef5350, text: 'Hallo', at: 1000 }]);
    expect(onChat).toHaveBeenCalledTimes(1);
  });

  it('drops malformed chat messages without notifying', () => {
    const { socket, conn, onChat } = setup();
    socket.raw(msg('x'.repeat(201)));
    socket.raw(msg('ok', { name: 'x'.repeat(17) }));
    socket.raw(msg('ok', { color: 'red' }));
    socket.raw(msg('ok', { at: null }));
    socket.raw({ t: 'chat' });
    socket.raw({ t: 'chathistory' });
    socket.raw({ t: 'chathistory', messages: 'nope' });
    expect(conn.chat).toEqual([]);
    expect(onChat).not.toHaveBeenCalled();
  });

  it('keeps only the last CLIENT_CHAT_SIZE messages', () => {
    const { socket, conn } = setup();
    for (let i = 0; i < CLIENT_CHAT_SIZE + 3; i++) socket.raw(msg(`m${i}`));
    expect(conn.chat).toHaveLength(CLIENT_CHAT_SIZE);
    expect(conn.chat[0].text).toBe('m3');
  });

  it('replaces the list with a history and skips bad entries in it', () => {
    const { socket, conn, onChat } = setup();
    socket.raw(msg('alt'));
    socket.raw({ t: 'chathistory', messages: [msg('eins'), null, msg('', {}), msg('zwei', { id: 7 }), msg('drei')] });
    expect(conn.chat.map((m) => m.text)).toEqual(['eins', 'drei']);
    expect(onChat).toHaveBeenCalledTimes(2);
    socket.raw({ t: 'chathistory', messages: [] });
    expect(conn.chat).toEqual([]);
  });
});
