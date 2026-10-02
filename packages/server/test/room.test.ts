import { CITY_MAP, MAX_ROOM_PLAYERS, NO_INPUT } from '@pfandraiders/core';
import type { Input, ServerMessage } from '@pfandraiders/core';
import { describe, expect, it } from 'vitest';
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

function setup(opts: { roundMs?: number } = {}) {
  let time = 0;
  const room = new Room('ABCD', { now: () => time, random: () => 0.5, roundMs: opts.roundMs });
  const advance = (ms: number) => {
    time += ms;
  };
  return { room, advance };
}

function twoPlayers(opts: { roundMs?: number } = {}) {
  const { room, advance } = setup(opts);
  const a = new FakeConn();
  const b = new FakeConn();
  const ra = room.join('Anna', a);
  const rb = room.join('Bob', b);
  if (!ra.ok || !rb.ok) throw new Error('join failed');
  return { room, advance, a, b, ma: ra.value, mb: rb.value };
}

const MOVE_RIGHT: Input = { ...NO_INPUT, moveX: 1 };

describe('joining', () => {
  it('assigns increasing ids, colors and a token, and the first player is host', () => {
    const { room, ma, mb } = twoPlayers();
    expect(ma.id).toBe('p1');
    expect(mb.id).toBe('p2');
    expect(ma.token).not.toBe(mb.token);
    expect(ma.token.length).toBeGreaterThan(10);
    expect(ma.color).not.toBe(mb.color);
    expect(room.hostId()).toBe('p1');
  });

  it('broadcasts the lobby to everybody after each change', () => {
    const { a, b } = twoPlayers();
    expect(a.last('lobby').players.map((p) => p.name)).toEqual(['Anna', 'Bob']);
    expect(b.last('lobby').host).toBe('p1');
    expect(b.last('lobby').phase).toBe('lobby');
  });

  it('rejects a duplicate name regardless of case', () => {
    const { room } = twoPlayers();
    const r = room.join('ANNA', new FakeConn());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('name_taken');
  });

  it('rejects the ninth player', () => {
    const { room } = setup();
    for (let i = 0; i < MAX_ROOM_PLAYERS; i++) expect(room.join(`P${i}`, new FakeConn()).ok).toBe(true);
    const r = room.join('Extra', new FakeConn());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('room_full');
  });

  it('rejects new players during a running round', () => {
    const { room } = twoPlayers();
    expect(room.start('p1').ok).toBe(true);
    const r = room.join('Late', new FakeConn());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('already_started');
  });
});

describe('start', () => {
  it('lets only the host start, and only with two connected players', () => {
    const { room } = setup();
    const a = new FakeConn();
    room.join('Anna', a);
    expect(room.start('p1')).toMatchObject({ ok: false, code: 'need_players' });
    room.join('Bob', new FakeConn());
    expect(room.start('p2')).toMatchObject({ ok: false, code: 'not_host' });
    expect(room.start('p1').ok).toBe(true);
    expect(room.start('p1')).toMatchObject({ ok: false, code: 'already_started' });
  });

  it('sends every player a start message with the map, their id, the roster and their own snapshot', () => {
    const { room, a, b } = twoPlayers();
    room.start('p1');
    const sa = a.last('start');
    const sb = b.last('start');
    expect(sa.you).toBe('p1');
    expect(sb.you).toBe('p2');
    expect(sa.map.cols).toBe(CITY_MAP.cols);
    expect(sa.players).toHaveLength(2);
    expect(Object.keys(sa.snap.players)).toEqual(['p1', 'p2']);
    expect(room.phase).toBe('running');
  });
});

describe('ticking', () => {
  it('steps the game and sends each player an individually projected snapshot', () => {
    const { room, a, b } = twoPlayers();
    room.start('p1');
    room.state!.players.p1.money = 500;
    room.state!.players.p2.money = 300;
    room.tick();
    const sa = a.last('snap').snap;
    const sb = b.last('snap').snap;
    expect(sa.tick).toBe(1);
    expect(sa.players.p1.money).toBe(500);
    expect(sa.players.p2.money).toBe(0); // fremdes Geld verborgen
    expect(sb.players.p2.money).toBe(300);
    expect(sb.players.p1.money).toBe(0);
    expect(sa.rngState).toBe(0);
  });

  it('applies the last received input every tick until a new one arrives', () => {
    const { room, a, ma } = twoPlayers();
    room.start('p1');
    const x0 = room.state!.players.p1.x;
    room.setInput(ma, 1, MOVE_RIGHT);
    room.tick();
    room.tick();
    const x2 = room.state!.players.p1.x;
    expect(x2).toBeGreaterThan(x0);
    room.setInput(ma, 2, NO_INPUT);
    room.tick();
    expect(room.state!.players.p1.x).toBe(x2);
    expect(a.last('snap').ack).toBe(2);
  });

  it('applies a buy command exactly once, also if a newer input without it arrives first', () => {
    const { room, ma } = twoPlayers();
    room.start('p1');
    const shop = room.state!.map.shops[0];
    room.state!.players.p1.x = shop.x;
    room.state!.players.p1.y = shop.y;
    room.state!.players.p1.money = 10_000;
    room.setInput(ma, 1, { ...NO_INPUT, buy: 'upgrade' });
    room.setInput(ma, 2, NO_INPUT); // überschreibt vor dem Tick, der Kauf darf nicht verloren gehen
    room.tick();
    room.tick();
    room.tick();
    expect(room.state!.players.p1.containerLevel).toBe(1);
  });

  it('ignores input from members that are not connected and uses no input for them', () => {
    const { room, ma } = twoPlayers();
    room.start('p1');
    room.setInput(ma, 1, MOVE_RIGHT);
    room.tick();
    const x = room.state!.players.p1.x;
    room.leave(ma.conn!);
    room.tick();
    room.tick();
    expect(room.state!.players.p1.x).toBe(x); // steht still
  });

  it('ends the round, tells everybody and reveals the money', () => {
    const { room, a, b } = twoPlayers({ roundMs: 100 });
    room.start('p1');
    room.state!.players.p2.money = 321;
    room.tick();
    room.tick();
    expect(room.phase).toBe('ended');
    expect(a.last('lobby').phase).toBe('ended');
    expect(a.last('snap').snap.phase).toBe('ended');
    expect(a.last('snap').snap.players.p2.money).toBe(321);
    const ticks = a.of('snap').length;
    room.tick();
    expect(a.of('snap').length).toBe(ticks); // nach dem Ende keine Snapshots mehr
    expect(b.of('snap').length).toBe(ticks);
  });

  it('can start another round after the end with the same members', () => {
    const { room, a } = twoPlayers({ roundMs: 100 });
    room.start('p1');
    room.tick();
    room.tick();
    expect(room.phase).toBe('ended');
    expect(room.start('p1').ok).toBe(true);
    expect(room.phase).toBe('running');
    expect(a.of('start')).toHaveLength(2);
    expect(room.state!.tick).toBe(0);
  });
});

describe('leaving and reconnecting', () => {
  it('removes a leaving player from the lobby completely', () => {
    const { room, a, ma, mb } = twoPlayers();
    room.leave(mb.conn!);
    expect(room.members.map((m) => m.id)).toEqual(['p1']);
    expect(a.last('lobby').players).toHaveLength(1);
    expect(room.hostId()).toBe(ma.id);
  });

  it('moves the host role to the next connected player when the host leaves', () => {
    const { room, b, ma } = twoPlayers();
    room.leave(ma.conn!);
    expect(room.hostId()).toBe('p2');
    expect(b.last('lobby').host).toBe('p2');
  });

  it('keeps a disconnected player in a running game and lets him back in with the token', () => {
    const { room, advance, ma } = twoPlayers();
    room.start('p1');
    const oldConn = ma.conn!;
    room.leave(oldConn);
    expect(room.state!.players.p1).toBeDefined();
    advance(10_000);
    const fresh = new FakeConn();
    const r = room.join('Anna', fresh, ma.token);
    expect(r.ok).toBe(true);
    expect(fresh.last('start').you).toBe('p1');
    expect(fresh.last('start').snap.tick).toBe(room.state!.tick);
    room.tick();
    expect(fresh.of('snap')).toHaveLength(1);
  });

  it('refuses the token after the grace period and for a wrong token', () => {
    const { room, advance, ma } = twoPlayers();
    room.start('p1');
    room.leave(ma.conn!);
    expect(room.join('Anna', new FakeConn(), 'wrong-token')).toMatchObject({ ok: false });
    advance(31_000);
    room.tick();
    expect(room.join('Anna', new FakeConn(), ma.token)).toMatchObject({ ok: false, code: 'already_started' });
    expect(room.state!.players.p1).toBeDefined(); // Figur bleibt als Statist
  });

  it('does not accept a token of a different room', () => {
    const { room } = twoPlayers();
    room.start('p1'); // sonst würde der unbekannte Token als normaler Beitritt in der Lobby gelten
    const other = new Room('WXYZ');
    const c = new FakeConn();
    const r = other.join('Cara', c);
    if (!r.ok) throw new Error('join failed');
    expect(room.join('Cara', new FakeConn(), r.value.token)).toMatchObject({ ok: false, code: 'already_started' });
  });
});

describe('room lifetime', () => {
  it('is dead after two minutes without any connected member', () => {
    const { room, advance, ma, mb } = twoPlayers();
    expect(room.isDead()).toBe(false);
    room.start('p1');
    room.leave(ma.conn!);
    room.leave(mb.conn!);
    advance(119_000);
    expect(room.isDead()).toBe(false);
    advance(2_000);
    expect(room.isDead()).toBe(true);
  });
});
