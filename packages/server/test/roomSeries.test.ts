import { DEFAULT_ROUND_MS, NO_INPUT } from '@pfandraiders/core';
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
  of<T extends ServerMessage['t']>(t: T): Extract<ServerMessage, { t: T }>[] {
    return this.messages.filter((m): m is Extract<ServerMessage, { t: T }> => m.t === t);
  }
  last<T extends ServerMessage['t']>(t: T): Extract<ServerMessage, { t: T }> {
    const all = this.of(t);
    return all[all.length - 1];
  }
}

/** Raum mit drei verbundenen Spielern; die erste Runde ist nach zwei Ticks vorbei (roundMs 100). */
function series(opts: { roundMs?: number } = { roundMs: 100 }) {
  let time = 0;
  const room = new Room('ABCD', { now: () => time, random: () => 0.5, roundMs: opts.roundMs });
  const conns = [new FakeConn(), new FakeConn(), new FakeConn()];
  const members = ['Anna', 'Bob', 'Cara'].map((name, i) => {
    const r = room.join(name, conns[i]);
    if (!r.ok) throw new Error('join failed');
    return r.value;
  });
  const advance = (ms: number) => {
    time += ms;
  };
  const endRound = () => {
    for (let i = 0; i < 100 && room.phase === 'playing'; i++) room.tick();
  };
  return { room, conns, members, advance, endRound };
}

describe('series phases', () => {
  it('goes lobby -> playing -> shop and tells everybody', () => {
    const { room, conns, endRound } = series();
    expect(room.phase).toBe('lobby');
    expect(room.start('p1').ok).toBe(true);
    expect(room.phase).toBe('playing');
    expect(conns[1].last('phase').phase).toBe('playing');
    endRound();
    expect(room.phase).toBe('shop');
    expect(conns[2].last('phase').phase).toBe('shop');
    expect(conns[0].last('lobby').phase).toBe('shop');
    expect(conns[0].last('ranking').entries.map((e) => e.id).sort()).toEqual(['p1', 'p2', 'p3']);
    expect(conns[0].last('shopState')).toMatchObject({ ready: false, you: { money: 0, containerLevel: 0 } });
  });

  it('keeps money, levels and inventory into the next round and resets the rest', () => {
    const { room, members, endRound } = series();
    room.start('p1');
    const p = room.state!.players.p1;
    p.money = 900;
    p.earnedRound = 900;
    p.earnedTotal = 900;
    p.containerLevel = 1;
    p.upgrades.speed = 2;
    p.inventory.food = 3;
    p.bottles = { plastic: 2, glass: 0, crate: 0 };
    p.health = 12;
    endRound();
    for (const m of members) room.setReady(m, true);
    expect(room.phase).toBe('playing');
    const q = room.state!.players.p1;
    expect(q).toMatchObject({
      money: 900,
      containerLevel: 1,
      upgrades: { speed: 2 },
      inventory: { food: 3 },
      earnedTotal: 900,
      earnedRound: 0,
      bottles: { plastic: 0, glass: 0, crate: 0 },
    });
    expect(q.health).toBe(100);
    expect(room.state!.tick).toBe(0);
  });

  it('starts the next round only when all connected players are ready, and ready can be taken back', () => {
    const { room, members, conns, endRound } = series();
    room.start('p1');
    endRound();
    room.setReady(members[0], true);
    room.setReady(members[1], true);
    expect(room.phase).toBe('shop');
    expect(conns[2].last('lobby').players.map((p) => p.ready)).toEqual([true, true, false]);
    room.setReady(members[1], false);
    room.setReady(members[2], true);
    expect(room.phase).toBe('shop');
    room.setReady(members[1], true);
    expect(room.phase).toBe('playing');
    expect(conns[0].of('start')).toHaveLength(2);
  });

  it('starts at once when the last player who is not ready disconnects', () => {
    const { room, members, endRound } = series();
    room.start('p1');
    endRound();
    room.setReady(members[0], true);
    room.setReady(members[1], true);
    room.leave(members[2].conn!);
    expect(room.phase).toBe('playing');
    // der Getrennte spielt als stehende Figur mit und behält seinen Platz
    expect(Object.keys(room.state!.players)).toEqual(['p1', 'p2', 'p3']);
  });

  it('also starts when the last unready player leaves for good, and drops his progress', () => {
    const { room, members, endRound } = series();
    room.start('p1');
    endRound();
    room.setReady(members[0], true);
    room.setReady(members[1], true);
    room.leaveForGood(members[2].conn!);
    expect(room.phase).toBe('playing');
    expect(Object.keys(room.state!.players)).toEqual(['p1', 'p2']);
    expect(room.progress.has('p3')).toBe(false);
  });

  it('does not wait for a disconnected player and keeps him as a standing figure after his grace runs out', () => {
    const { room, members, advance, endRound } = series();
    room.start('p1');
    endRound();
    room.leave(members[2].conn!);
    room.setReady(members[0], true);
    expect(room.phase).toBe('shop');
    room.setReady(members[1], true);
    expect(room.phase).toBe('playing'); // p3 ist getrennt und zählt nicht
    expect(Object.keys(room.state!.players)).toEqual(['p1', 'p2', 'p3']);
    advance(SERVER_CONFIG.graceMs + 1);
    room.tick();
    expect(room.members.map((m) => m.id)).toEqual(['p1', 'p2', 'p3']); // in der laufenden Runde bleibt er Statist
  });

  it('does not start a round when nobody is connected', () => {
    const { room, members, endRound } = series();
    room.start('p1');
    endRound();
    for (const m of members) room.leave(m.conn!);
    expect(room.phase).toBe('shop');
  });

  it('gives a player who returns with his token in the shop phase his progress, and he is not ready', () => {
    const { room, members, endRound } = series();
    room.start('p1');
    room.state!.players.p2.money = 444;
    endRound();
    room.setReady(members[1], true);
    room.leave(members[1].conn!);
    const back = new FakeConn();
    expect(room.join('Bob', back, members[1].token).ok).toBe(true);
    expect(back.last('phase').phase).toBe('shop');
    expect(back.last('shopState')).toMatchObject({ ready: false, you: { money: 444 } });
    expect(back.of('ranking')).toHaveLength(1);
    expect(members[1].ready).toBe(false);
  });

  it('lets a new player join in the shop phase with empty progress', () => {
    const { room, endRound } = series();
    room.start('p1');
    endRound();
    const d = new FakeConn();
    const r = room.join('Dora', d);
    expect(r.ok).toBe(true);
    expect(d.last('shopState').you.money).toBe(0);
    expect(room.progress.get('p4')?.money).toBe(0);
  });

  it('refuses ready outside the shop phase', () => {
    const { room, members } = series();
    expect(room.setReady(members[0], true)).toMatchObject({ ok: false, code: 'wrong_phase' });
    room.start('p1');
    expect(room.setReady(members[0], true)).toMatchObject({ ok: false, code: 'wrong_phase' });
  });

  it('sends the round time with start and in the lobby message', () => {
    const { room, conns } = series({});
    expect(conns[0].last('lobby').roundMs).toBe(DEFAULT_ROUND_MS);
    expect(room.start('p1', 420_000).ok).toBe(true);
    expect(conns[1].last('start').roundMs).toBe(420_000);
    expect(room.state!.timeLeftMs).toBe(420_000);
  });

  it('uses the default for an invalid round time in start', () => {
    const { room } = series({});
    room.start('p1', 123_456);
    expect(room.state!.timeLeftMs).toBe(DEFAULT_ROUND_MS);
  });

  it('applies the inputs without any buy merging', () => {
    const { room, members } = series({});
    room.start('p1');
    room.setInput(members[0], 1, { ...NO_INPUT, attack: true });
    expect(members[0].input).toEqual({ ...NO_INPUT, attack: true });
  });
});
