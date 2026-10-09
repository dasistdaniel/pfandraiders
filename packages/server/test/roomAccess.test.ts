import type { ServerMessage } from '@pfandraiders/core';
import { describe, expect, it } from 'vitest';
import { SERVER_CONFIG } from '../src/config';
import { Room } from '../src/room';
import type { Conn } from '../src/room';

class FakeConn implements Conn {
  messages: ServerMessage[] = [];
  send(msg: ServerMessage): void {
    this.messages.push(msg);
  }
  last<T extends ServerMessage['t']>(t: T): Extract<ServerMessage, { t: T }> {
    const all = this.messages.filter((m): m is Extract<ServerMessage, { t: T }> => m.t === t);
    return all[all.length - 1];
  }
}

function lockedRoom() {
  let time = 0;
  const room = new Room(
    'ABCD',
    { now: () => time, random: () => 0.5, roundMs: 100, countdownMs: 0 },
    { name: 'Geheimbude', visibility: 'private', password: 'geheim' },
  );
  return { room, advance: (ms: number) => (time += ms) };
}

describe('room settings', () => {
  it('has defaults when nothing is given', () => {
    const room = new Room('ABCD');
    expect(room.name).toBe('Raum ABCD');
    expect(room.visibility).toBe('public');
    expect(room.locked).toBe(false);
  });

  it('sends name, visibility and lock state with the lobby message', () => {
    const { room } = lockedRoom();
    const a = new FakeConn();
    expect(room.join('Anna', a, undefined, { password: 'geheim' }).ok).toBe(true);
    expect(a.last('lobby')).toMatchObject({ room: 'ABCD', roomName: 'Geheimbude', visibility: 'private', locked: true });
  });

  it('never sends the password to anybody', () => {
    const { room } = lockedRoom();
    const a = new FakeConn();
    const b = new FakeConn();
    room.join('Anna', a, undefined, { password: 'geheim' });
    room.join('Bob', b, undefined, { password: 'geheim' });
    room.start('p1');
    expect(JSON.stringify([...a.messages, ...b.messages])).not.toContain('geheim');
  });
});

describe('password', () => {
  it('refuses a missing or wrong password with wrong_password and changes nothing', () => {
    const { room } = lockedRoom();
    room.join('Anna', new FakeConn(), undefined, { password: 'geheim' });
    const b = new FakeConn();
    expect(room.join('Bob', b)).toMatchObject({ ok: false, code: 'wrong_password', message: 'Passwort falsch oder nötig.' });
    expect(room.join('Bob', b, undefined, { password: 'Geheim' })).toMatchObject({ ok: false, code: 'wrong_password' });
    expect(room.members.map((m) => m.name)).toEqual(['Anna']);
    expect(b.messages).toEqual([]);
  });

  it('lets a player in with the right password', () => {
    const { room } = lockedRoom();
    room.join('Anna', new FakeConn(), undefined, { password: 'geheim' });
    expect(room.join('Bob', new FakeConn(), undefined, { password: 'geheim' }).ok).toBe(true);
  });

  it('ignores a password for a room without one', () => {
    const room = new Room('ABCD');
    expect(room.join('Anna', new FakeConn(), undefined, { password: 'egal' }).ok).toBe(true);
  });

  it('checks the password before the phase: a running locked room answers wrong_password first', () => {
    const { room } = lockedRoom();
    room.join('Anna', new FakeConn(), undefined, { password: 'geheim' });
    room.join('Bob', new FakeConn(), undefined, { password: 'geheim' });
    room.start('p1');
    expect(room.join('Cara', new FakeConn())).toMatchObject({ ok: false, code: 'wrong_password' });
    expect(room.join('Cara', new FakeConn(), undefined, { password: 'geheim' })).toMatchObject({ ok: false, code: 'already_started' });
  });

  it('lets a player return with his token without the password, but not after the grace period', () => {
    const { room, advance } = lockedRoom();
    const a = new FakeConn();
    const b = new FakeConn();
    room.join('Anna', a, undefined, { password: 'geheim' });
    const bob = room.join('Bob', b, undefined, { password: 'geheim' });
    if (!bob.ok) throw new Error('join failed');
    room.start('p1');
    room.leave(b);
    expect(room.hasReturnToken(bob.value.token)).toBe(true);
    expect(room.join('Bob', new FakeConn(), bob.value.token).ok).toBe(true);
    room.leave(bob.value.conn!);
    advance(SERVER_CONFIG.graceMs + 1);
    expect(room.hasReturnToken(bob.value.token)).toBe(false);
    expect(room.join('Bob', new FakeConn(), bob.value.token)).toMatchObject({ ok: false, code: 'wrong_password' });
  });

  it('knows no return token for undefined or unknown tokens', () => {
    const { room } = lockedRoom();
    room.join('Anna', new FakeConn(), undefined, { password: 'geheim' });
    expect(room.hasReturnToken(undefined)).toBe(false);
    expect(room.hasReturnToken('nope')).toBe(false);
  });
});
