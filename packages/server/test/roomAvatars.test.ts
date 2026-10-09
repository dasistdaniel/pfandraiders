import type { ServerMessage } from '@pfandraiders/core';
import { describe, expect, it } from 'vitest';
import { Room } from '../src/room';
import type { Conn, Member } from '../src/room';

class FakeConn implements Conn {
  messages: ServerMessage[] = [];
  send(msg: ServerMessage): void {
    this.messages.push(msg);
  }
  of<T extends ServerMessage['t']>(t: T): Extract<ServerMessage, { t: T }>[] {
    return this.messages.filter((m): m is Extract<ServerMessage, { t: T }> => m.t === t);
  }
  last<T extends ServerMessage['t']>(t: T): Extract<ServerMessage, { t: T }> {
    const all = this.of(t);
    return all[all.length - 1];
  }
}

function setup() {
  let time = 0;
  const room = new Room('ABCD', { now: () => time, random: () => 0.5, roundMs: 100, countdownMs: 0 });
  const join = (name: string, avatar?: number): { member: Member; conn: FakeConn } => {
    const conn = new FakeConn();
    const r = room.join(name, conn, undefined, avatar === undefined ? {} : { avatar });
    if (!r.ok) throw new Error(`join failed: ${r.code}`);
    return { member: r.value, conn };
  };
  const endRound = () => {
    for (let i = 0; i < 100 && room.phase === 'playing'; i++) room.tick();
  };
  return { room, join, endRound, advance: (ms: number) => (time += ms) };
}

describe('avatar assignment', () => {
  it('follows the default order m02, f03, m01 without a wish', () => {
    const { room, join } = setup();
    expect([join('Anna').member.avatar, join('Bob').member.avatar, join('Cara').member.avatar]).toEqual([1, 14, 0]);
    expect(room.roster().map((r) => r.avatar)).toEqual([1, 14, 0]);
  });

  it('gives a free wish and replaces a taken one by the first free default', () => {
    const { join } = setup();
    expect(join('Anna', 7).member.avatar).toBe(7);
    expect(join('Bob', 7).member.avatar).toBe(1);
    expect(join('Cara', 1).member.avatar).toBe(14);
  });

  it('sends the avatars with lobby and start', () => {
    const { room, join } = setup();
    const a = join('Anna', 5);
    join('Bob', 6);
    expect(a.conn.last('lobby').players.map((p) => p.avatar)).toEqual([5, 6]);
    room.start('p1');
    expect(a.conn.last('start').players.map((p) => p.avatar)).toEqual([5, 6]);
  });

  it('frees the avatar when a player leaves the lobby or leaves for good', () => {
    const { room, join } = setup();
    const a = join('Anna');
    const b = join('Bob');
    room.leave(a.conn);
    expect(join('Cara').member.avatar).toBe(1);
    room.leaveForGood(b.conn);
    expect(join('Dora').member.avatar).toBe(14);
  });

  it('keeps the avatar of a disconnected player in the grace period', () => {
    const { room, join, endRound } = setup();
    join('Anna');
    const b = join('Bob', 9);
    room.start('p1');
    endRound();
    room.leave(b.conn); // Shop-Phase: Bob bleibt in der Frist Mitglied
    expect(join('Cara', 9).member.avatar).not.toBe(9);
  });
});

describe('setAvatar', () => {
  it('changes the own avatar in the lobby and tells everybody', () => {
    const { room, join } = setup();
    const a = join('Anna');
    const b = join('Bob');
    expect(room.setAvatar(a.member, 20).ok).toBe(true);
    expect(a.member.avatar).toBe(20);
    expect(b.conn.last('lobby').players[0].avatar).toBe(20);
  });

  it('refuses a taken avatar with avatar_taken and an invalid one with bad_message', () => {
    const { room, join } = setup();
    const a = join('Anna');
    join('Bob');
    expect(room.setAvatar(a.member, 14)).toMatchObject({ ok: false, code: 'avatar_taken', message: 'Die Figur ist schon vergeben.' });
    expect(room.setAvatar(a.member, 24)).toMatchObject({ ok: false, code: 'bad_message' });
    expect(a.member.avatar).toBe(1);
  });

  it('accepts the own current avatar without a new lobby message', () => {
    const { room, join } = setup();
    const a = join('Anna');
    const before = a.conn.of('lobby').length;
    expect(room.setAvatar(a.member, 1).ok).toBe(true);
    expect(a.conn.of('lobby')).toHaveLength(before);
  });

  it('is only allowed in the lobby', () => {
    const { room, join, endRound } = setup();
    const a = join('Anna');
    join('Bob');
    room.start('p1');
    expect(room.setAvatar(a.member, 3)).toMatchObject({ ok: false, code: 'wrong_phase' });
    endRound();
    expect(room.setAvatar(a.member, 3)).toMatchObject({ ok: false, code: 'wrong_phase' });
  });
});
