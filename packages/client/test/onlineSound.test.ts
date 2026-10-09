import { DEFAULT_ROUNDS, ROOM_COLORS } from '@pfandraiders/core';
import type { ClientMessage, RosterEntry, ServerMessage } from '@pfandraiders/core';
import { describe, expect, it } from 'vitest';
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
  receive(msg: ServerMessage): void {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
}

const player = (id: string, connected = true): RosterEntry => ({ id, name: id, color: ROOM_COLORS[0], connected, ready: false, avatar: 0 });
const lobby = (players: RosterEntry[]): ServerMessage => ({
  t: 'lobby', room: 'ABCD', roomName: 'Raum', visibility: 'public', locked: false, host: 'p1', players, phase: 'lobby', roundMs: 60000, rounds: DEFAULT_ROUNDS,
});

function setup() {
  const socket = new FakeSocket();
  const conn = new OnlineConnection('ws://test', () => socket);
  const played: string[] = [];
  conn.sound = (id) => played.push(id);
  conn.connect();
  socket.onopen?.();
  socket.receive({ t: 'joined', room: 'ABCD', you: 'p1', token: 't' });
  return { socket, conn, played };
}

describe('OnlineConnection sounds', () => {
  it('is silent for the first roster after joining, then join and leave', () => {
    const { socket, played } = setup();
    socket.receive(lobby([player('p1'), player('p2')]));
    expect(played).toEqual([]);
    socket.receive(lobby([player('p1'), player('p2'), player('p3')]));
    socket.receive(lobby([player('p1'), player('p3', false)]));
    expect(played).toEqual(['join', 'leave']);
  });

  it('chat only for messages of others, never for the history', () => {
    const { socket, played } = setup();
    socket.receive({ t: 'chat', id: 'p1', name: 'p1', color: 0, text: 'hallo', at: 1 } as ServerMessage);
    socket.receive({ t: 'chathistory', messages: [{ id: 'p2', name: 'p2', color: 0, text: 'alt', at: 0 }] } as ServerMessage);
    expect(played).toEqual([]);
    socket.receive({ t: 'chat', id: 'p2', name: 'p2', color: 0, text: 'hi', at: 2 } as ServerMessage);
    expect(played).toEqual(['chat']);
  });

  it('errors from the server and a lost open connection, but not an own close', () => {
    const { socket, conn, played } = setup();
    socket.receive({ t: 'error', code: 'cannot_buy', message: 'x' });
    socket.receive({ t: 'error', code: 'wrong_password', message: 'x' });
    socket.onclose?.();
    expect(played).toEqual(['buy_denied', 'error', 'error']);
    const own = setup();
    own.conn.close();
    expect(own.played).toEqual([]);
    expect(conn.status).toBe('closed');
  });

  it('a failed connection attempt (never open) stays silent; no sink is harmless', () => {
    const socket = new FakeSocket();
    const conn = new OnlineConnection('ws://test', () => socket);
    const played: string[] = [];
    conn.sound = (id) => played.push(id);
    conn.connect();
    socket.onclose?.();
    expect(played).toEqual([]);
    const quiet = setup();
    quiet.conn.sound = () => {
      throw new Error('kaputt');
    };
    expect(() => quiet.socket.receive({ t: 'error', code: 'room_full', message: 'x' })).not.toThrow();
  });
});
