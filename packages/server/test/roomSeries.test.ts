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
function series(opts: { roundMs?: number; countdownMs?: number } = { roundMs: 100 }) {
  let time = 0;
  const room = new Room('ABCD', { now: () => time, random: () => 0.5, roundMs: opts.roundMs, countdownMs: opts.countdownMs ?? 0 });
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
    expect(conns[0].last('shopState')).toMatchObject({ ready: false, you: { money: 0, items: { bag: 0, cart: 0 } } });
  });

  it('keeps money, items and earnings into the next round and resets the rest', () => {
    const { room, members, endRound } = series();
    room.start('p1');
    const p = room.state!.players.p1;
    p.money = 900;
    p.earnedRound = 900;
    p.earnedTotal = 900;
    p.items.bag = 2;
    p.items.flashlight = 2;
    p.items.dog_treat = 3;
    p.bottles = { plastic: 2, glass: 0, crate: 0 };
    p.health = 12;
    endRound();
    for (const m of members) room.setReady(m, true);
    expect(room.phase).toBe('playing');
    const q = room.state!.players.p1;
    expect(q).toMatchObject({
      money: 900,
      items: { bag: 2, flashlight: 2, dog_treat: 3 },
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

describe('buying in the shop phase', () => {
  function inShop() {
    const s = series();
    s.room.start('p1');
    s.room.state!.players.p1.money = 1000;
    s.endRound();
    return s;
  }

  it('buys with enough money and answers with the new own state only to the buyer', () => {
    const { room, members, conns } = inShop();
    const before = conns[1].of('shopState').length;
    expect(room.shopBuy(members[0], 'defense', 'dog_treat', 3).ok).toBe(true);
    expect(room.progress.get('p1')).toMatchObject({ money: 700, items: { dog_treat: 3 } });
    expect(conns[0].last('shopState').you).toMatchObject({ money: 700, items: { dog_treat: 3 } });
    expect(conns[1].of('shopState')).toHaveLength(before);
  });

  it('refuses without money and without partial purchase', () => {
    const { room, members } = inShop();
    const r = room.shopBuy(members[0], 'defense', 'dog_treat', 11);
    expect(r).toMatchObject({ ok: false, code: 'cannot_buy', message: 'Nicht genug Geld.' });
    expect(room.progress.get('p1')).toMatchObject({ money: 1000, items: { dog_treat: 0 } });
  });

  it('never lets two purchases together spend more than the money', () => {
    const { room, members } = inShop();
    expect(room.shopBuy(members[0], 'defense', 'dog_treat', 6).ok).toBe(true);
    expect(room.shopBuy(members[0], 'defense', 'dog_treat', 6)).toMatchObject({ ok: false, code: 'cannot_buy' });
    expect(room.progress.get('p1')!.money).toBe(400);
  });

  it('refuses buying outside the shop phase', () => {
    const { room, members } = series();
    expect(room.shopBuy(members[0], 'defense', 'dog_treat', 1)).toMatchObject({ ok: false, code: 'wrong_phase' });
    room.start('p1');
    expect(room.shopBuy(members[0], 'defense', 'dog_treat', 1)).toMatchObject({ ok: false, code: 'wrong_phase' });
  });

  it('carries bought items into the next round', () => {
    const { room, members } = inShop();
    room.shopBuy(members[0], 'upgrades', 'card', 1);
    room.shopBuy(members[0], 'bags', 'bag', 1);
    room.shopBuy(members[0], 'bags', 'bag', 1);
    for (const m of members) room.setReady(m, true);
    expect(room.state!.players.p1).toMatchObject({ money: 400, items: { card: 1, bag: 2 } });
  });

  it('rents the cart for exactly one round', () => {
    const { room, members, conns, endRound } = inShop();
    expect(room.shopBuy(members[0], 'bags', 'cart', 1).ok).toBe(true);
    expect(conns[0].last('shopState').you.items.cart).toBe(1);
    for (const m of members) room.setReady(m, true);
    expect(room.state!.players.p1.items.cart).toBe(1);
    room.state!.players.p1.items.bag = 2; // bleibt
    endRound();
    expect(room.progress.get('p1')!.items).toMatchObject({ cart: 0, bag: 2 });
    expect(conns[0].last('shopState').you.items).toMatchObject({ cart: 0, bag: 2 });
    for (const m of members) room.setReady(m, true);
    expect(room.state!.players.p1.items.cart).toBe(0);
  });

  it('keeps the id papers for exactly one round', () => {
    const { room, members, endRound } = inShop();
    expect(room.shopBuy(members[0], 'defense', 'id_papers', 1).ok).toBe(true);
    for (const m of members) room.setReady(m, true);
    expect(room.state!.players.p1.items.id_papers).toBe(1);
    endRound();
    expect(room.progress.get('p1')!.items.id_papers).toBe(0);
  });

  it('sells pepper spray as ten charges per bottle and keeps unused charges', () => {
    const { room, members, conns, endRound } = inShop();
    expect(room.shopBuy(members[0], 'defense', 'pepper', 2).ok).toBe(true);
    expect(conns[0].last('shopState').you).toMatchObject({ money: 400, items: { pepper: 20 } });
    expect(room.shopBuy(members[0], 'defense', 'pepper', 9)).toMatchObject({ ok: false, code: 'cannot_buy', message: 'Mehr geht nicht.' });
    for (const m of members) room.setReady(m, true);
    room.state!.players.p1.items.pepper = 13;
    endRound();
    expect(room.progress.get('p1')!.items.pepper).toBe(13);
  });
});

describe('round time and ending the series', () => {
  it('lets only the host set the round time, in lobby and shop', () => {
    const { room, conns, endRound } = series({});
    expect(room.setRoundMs('p2', 600_000)).toMatchObject({ ok: false, code: 'not_host' });
    expect(room.setRoundMs('p1', 600_000).ok).toBe(true);
    expect(conns[2].last('lobby').roundMs).toBe(600_000);
    room.start('p1');
    expect(room.state!.timeLeftMs).toBe(600_000);
    expect(room.setRoundMs('p1', 180_000)).toMatchObject({ ok: false, code: 'wrong_phase' });
    room.state!.timeLeftMs = 1;
    endRound();
    expect(room.setRoundMs('p1', 180_000).ok).toBe(true);
    expect(room.roundMs()).toBe(180_000);
  });

  it('keeps ROUND_MS from the environment over the host choice', () => {
    const { room, conns } = series({ roundMs: 1000 });
    room.setRoundMs('p1', 600_000);
    expect(room.roundMs()).toBe(1000);
    expect(conns[0].last('lobby').roundMs).toBe(1000);
  });

  it('lets only the host end the series in the shop phase, into the final ranking, then back to the lobby without progress', () => {
    const { room, conns, members, endRound } = series();
    expect(room.endSeries('p1')).toMatchObject({ ok: false, code: 'wrong_phase' });
    room.start('p1');
    endRound();
    room.leave(members[2].conn!);
    expect(room.endSeries('p2')).toMatchObject({ ok: false, code: 'not_host' });
    expect(room.endSeries('p1').ok).toBe(true);
    expect(room.phase).toBe('final');
    expect(conns[1].last('phase').phase).toBe('final');
    expect(room.toLobby('p1').ok).toBe(true);
    expect(room.phase).toBe('lobby');
    expect(room.state).toBeNull();
    expect(room.progress.size).toBe(0);
    // p3 ist getrennt, aber noch in der Frist: bleibt in der Lobby, start entfernt ihn
    expect(room.members.map((m) => m.id)).toEqual(['p1', 'p2', 'p3']);
    expect(conns[1].last('phase').phase).toBe('lobby');
    expect(room.start('p1').ok).toBe(true);
    expect(room.members.map((m) => m.id)).toEqual(['p1', 'p2']);
    expect(room.state!.players.p1.money).toBe(0);
  });
});
