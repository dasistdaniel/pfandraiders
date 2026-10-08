import { CITY_MAP, DEFAULT_MAP_ID, MAX_ROOM_PLAYERS, NO_INPUT, RETRO_MAP } from '@pfandraiders/core';
import type { Input, MapId, ServerMessage } from '@pfandraiders/core';
import { describe, expect, it } from 'vitest';
import { currentBuild } from '../src/buildInfo';
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

function setup(opts: { roundMs?: number; mapId?: MapId; countdownMs?: number } = {}) {
  let time = 0;
  const room = new Room('ABCD', { now: () => time, random: () => 0.5, roundMs: opts.roundMs, mapId: opts.mapId, countdownMs: opts.countdownMs ?? 0 });
  const advance = (ms: number) => {
    time += ms;
  };
  return { room, advance };
}

function twoPlayers(opts: { roundMs?: number; mapId?: MapId; countdownMs?: number } = {}) {
  const { room, advance } = setup(opts);
  const a = new FakeConn();
  const b = new FakeConn();
  const ra = room.join('Anna', a);
  const rb = room.join('Bob', b);
  if (!ra.ok || !rb.ok) throw new Error('join failed');
  return { room, advance, a, b, ma: ra.value, mb: rb.value };
}

const MOVE_RIGHT: Input = { ...NO_INPUT, moveX: 1 };

describe('empty room lifetime', () => {
  it('is never shorter than the grace period plus 15 s', () => {
    let time = 0;
    const room = new Room('ABCD', { now: () => time, random: () => 0.5, graceMs: 60_000, emptyMs: 1000 });
    time += 60_000 + 14_999;
    expect(room.isDead()).toBe(false);
    time += 1;
    expect(room.isDead()).toBe(true);
  });
});

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
    expect(sa.mapId).toBe(DEFAULT_MAP_ID);
    expect(sb.mapId).toBe(DEFAULT_MAP_ID);
    expect(sa.players).toHaveLength(2);
    expect(Object.keys(sa.snap.players)).toEqual(['p1', 'p2']);
    expect(room.phase).toBe('playing');
  });
});

describe('map selection', () => {
  it('starts the retro map when the room has mapId retro', () => {
    const { room, a, b } = twoPlayers({ mapId: 'retro' });
    room.start('p1');
    expect(a.last('start').mapId).toBe('retro');
    expect(b.last('start').mapId).toBe('retro');
    expect(a.last('start').map).toEqual(RETRO_MAP);
    expect(room.state!.map).toEqual(RETRO_MAP);
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
    expect(room.phase).toBe('shop');
    expect(a.last('lobby').phase).toBe('shop');
    expect(a.last('snap').snap.phase).toBe('ended');
    expect(a.last('snap').snap.players.p2.money).toBe(321);
    const ticks = a.of('snap').length;
    room.tick();
    expect(a.of('snap').length).toBe(ticks); // nach dem Ende keine Snapshots mehr
    expect(b.of('snap').length).toBe(ticks);
  });

  it('starts the next round when everybody is ready after the end, with the same members', () => {
    const { room, a, ma, mb } = twoPlayers({ roundMs: 100 });
    room.start('p1');
    room.tick();
    room.tick();
    expect(room.phase).toBe('shop');
    expect(room.start('p1')).toMatchObject({ ok: false, code: 'already_started' });
    room.setReady(ma, true);
    room.setReady(mb, true);
    expect(room.phase).toBe('playing');
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
    expect(fresh.last('start').mapId).toBe(DEFAULT_MAP_ID);
    expect(fresh.last('start').snap.tick).toBe(room.state!.tick);
    room.tick();
    expect(fresh.of('snap')).toHaveLength(1);
  });

  it('refuses the token after the grace period and for a wrong token', () => {
    const { room, advance, ma } = twoPlayers();
    room.start('p1');
    room.leave(ma.conn!);
    expect(room.join('Anna', new FakeConn(), 'wrong-token')).toMatchObject({ ok: false });
    advance(SERVER_CONFIG.graceMs + 1000);
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
  it('is dead after grace plus 15 s without any connected member', () => {
    const { room, advance, ma, mb } = twoPlayers();
    expect(room.isDead()).toBe(false);
    room.start('p1');
    room.leave(ma.conn!);
    room.leave(mb.conn!);
    advance(134_000);
    expect(room.isDead()).toBe(false);
    advance(2_000);
    expect(room.isDead()).toBe(true);
  });
});

function threePlayers(opts: { roundMs?: number } = {}) {
  const base = twoPlayers(opts);
  const c = new FakeConn();
  const rc = base.room.join('Cara', c);
  if (!rc.ok) throw new Error('join failed');
  return { ...base, c, mc: rc.value };
}

describe('review fixes', () => {
  it('F1: gives distinct colors after a lobby leaver was removed', () => {
    const { room, mb } = threePlayers();
    room.leave(mb.conn!);
    const r = room.join('Dora', new FakeConn());
    if (!r.ok) throw new Error('join failed');
    const colors = room.members.map((m) => m.color);
    expect(new Set(colors).size).toBe(colors.length);
  });

  it('F2: a returning player can rejoin under his own name after the round ended', () => {
    const { room, advance, ma } = twoPlayers({ roundMs: 100 });
    room.start('p1');
    room.leave(ma.conn!);
    advance(SERVER_CONFIG.graceMs + 1000);
    room.tick();
    room.tick();
    expect(room.phase).toBe('shop');
    const r = room.join('Anna', new FakeConn());
    expect(r.ok).toBe(true);
    expect(room.members.filter((m) => m.name === 'Anna')).toHaveLength(1);
    expect(room.members.every((m) => m.conn !== null)).toBe(true);
  });

  it('F2: tick purges expired ghosts when the room is not running', () => {
    const { room, advance, ma } = twoPlayers({ roundMs: 100 });
    room.start('p1');
    room.leave(ma.conn!);
    room.tick();
    room.tick();
    expect(room.phase).toBe('shop');
    advance(SERVER_CONFIG.graceMs + 1000);
    room.tick();
    expect(room.members.map((m) => m.id)).toEqual(['p2']);
  });

  it('F3: token validity does not depend on tick, boundary is exactly graceMs', () => {
    const a = twoPlayers();
    a.room.start('p1');
    a.room.leave(a.ma.conn!);
    a.advance(SERVER_CONFIG.graceMs);
    expect(a.room.join('Anna', new FakeConn(), a.ma.token).ok).toBe(true);

    const b = twoPlayers();
    b.room.start('p1');
    b.room.leave(b.ma.conn!);
    b.advance(SERVER_CONFIG.graceMs + 1);
    expect(b.room.join('Anna', new FakeConn(), b.ma.token)).toMatchObject({ ok: false, code: 'already_started' });
  });

  it('F4: invalid seq does not poison the ack but the input is still applied', () => {
    const { room, a, ma } = twoPlayers();
    room.start('p1');
    room.setInput(ma, 1, NO_INPUT);
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -1, 1.5]) room.setInput(ma, bad, MOVE_RIGHT);
    room.tick();
    expect(a.last('snap').ack).toBe(1);
    expect(ma.input.moveX).toBe(1);
  });

  it('F5: start with an empty id is never allowed', () => {
    const { room, ma, mb } = twoPlayers({ roundMs: 100 });
    room.start('p1');
    room.leave(ma.conn!);
    room.leave(mb.conn!);
    expect(room.start('')).toMatchObject({ ok: false, code: 'not_host' });
    room.tick();
    room.tick();
    expect(room.phase).toBe('shop');
    expect(room.start('')).toMatchObject({ ok: false, code: 'not_host' });
  });

  it('F6a: host migrates past a disconnected first member during a running round', () => {
    const { room, ma } = threePlayers();
    room.start('p1');
    room.leave(ma.conn!);
    expect(room.hostId()).toBe('p2');
  });

  it('F6b: setInput on a disconnected member is ignored', () => {
    const { room, ma } = twoPlayers();
    room.start('p1');
    const x = room.state!.players.p1.x;
    room.leave(ma.conn!);
    room.setInput(ma, 5, MOVE_RIGHT);
    room.tick();
    room.tick();
    expect(room.state!.players.p1.x).toBe(x);
    expect(ma.ackSeq).toBe(0);
  });

  it('F6c: rejoining resets the disconnect time so the member does not expire later', () => {
    const { room, advance, ma } = twoPlayers();
    room.start('p1');
    room.leave(ma.conn!);
    advance(10_000);
    expect(room.join('Anna', new FakeConn(), ma.token).ok).toBe(true);
    expect(ma.disconnectedAt).toBeNull();
    advance(SERVER_CONFIG.graceMs - 5_000);
    room.tick();
    expect(ma.expired).toBe(false);
  });

  it('F6d: a disconnected member in the grace period plays the next round as a standing figure', () => {
    const { room, ma, mb, mc } = threePlayers({ roundMs: 100 });
    room.start('p1');
    room.leave(mb.conn!);
    room.tick();
    room.tick();
    expect(room.phase).toBe('shop');
    room.setReady(ma, true);
    room.setReady(mc, true);
    expect(room.phase).toBe('playing');
    expect(room.members.map((m) => m.id)).toEqual(['p1', 'p2', 'p3']);
    expect(Object.keys(room.state!.players)).toEqual(['p1', 'p2', 'p3']);
  });

  it('F6e: leave of an unknown or already left connection is a no-op', () => {
    const { room, advance, a, ma } = twoPlayers();
    room.start('p1');
    const before = a.messages.length;
    room.leave(new FakeConn());
    expect(a.messages.length).toBe(before);
    const oldConn = ma.conn!;
    room.leave(oldConn);
    const t = ma.disconnectedAt;
    advance(5_000);
    room.leave(oldConn);
    expect(ma.disconnectedAt).toBe(t);
  });

  it('F6f: token rejoin replaces a still connected connection', () => {
    const { room, a, ma } = twoPlayers();
    room.start('p1');
    const fresh = new FakeConn();
    expect(room.join('Anna', fresh, ma.token).ok).toBe(true);
    const oldCount = a.messages.length;
    const freshCount = fresh.messages.length;
    room.tick();
    expect(a.messages.length).toBe(oldCount);
    expect(fresh.messages.length).toBeGreaterThan(freshCount);
    room.leave(a); // stale conn must not disconnect the member
    expect(ma.conn).toBe(fresh);
  });

  it('foreign token in a running room leaves members unchanged', () => {
    const { room } = twoPlayers();
    room.start('p1');
    const ids = room.members.map((m) => m.id);
    const r = room.join('Cara', new FakeConn(), 'foreign-token-0000');
    expect(r).toMatchObject({ ok: false, code: 'already_started' });
    expect(room.members.map((m) => m.id)).toEqual(ids);
  });

  it('foreign token in the lobby is a normal join with a fresh token', () => {
    const { room } = twoPlayers();
    const r = room.join('Cara', new FakeConn(), 'foreign-token-0000');
    if (!r.ok) throw new Error('join failed');
    expect(r.value.id).toBe('p3');
    expect(r.value.token).not.toBe('foreign-token-0000');
  });
});

describe('leaving for good', () => {
  it('removes the player from the lobby at once', () => {
    const { room, a, ma, mb } = twoPlayers();
    room.leaveForGood(mb.conn!);
    expect(room.members.map((m) => m.id)).toEqual([ma.id]);
    expect(a.last('lobby').players).toHaveLength(1);
  });

  it('keeps the figure in a running round, invalidates the token and leaves the others playing', () => {
    const { room, b, ma } = twoPlayers();
    room.start('p1');
    room.leaveForGood(ma.conn!);
    expect(room.state!.players.p1).toBeDefined(); // Statist, Geld zählt für die Rangliste
    expect(b.last('lobby').players.find((p) => p.id === 'p1')?.connected).toBe(false);
    // Sofort, ohne Frist: das Token gilt nicht mehr
    expect(room.join('Anna', new FakeConn(), ma.token)).toMatchObject({ ok: false, code: 'already_started' });
    const before = b.of('snap').length;
    room.tick();
    expect(b.of('snap').length).toBe(before + 1);
    expect(room.hostId()).toBe('p2');
  });

  it('frees the name after the round so the player can join again with a fresh seat', () => {
    const { room, advance, ma } = twoPlayers({ roundMs: 1000 });
    room.start('p1');
    room.leaveForGood(ma.conn!);
    for (let i = 0; i < 200 && room.phase === 'playing'; i++) {
      advance(SERVER_CONFIG.stepMs);
      room.tick();
    }
    expect(room.phase).toBe('shop');
    room.tick(); // nach Rundenende räumt der nächste Schritt den freigegebenen Platz ab
    expect(room.members.map((m) => m.id)).toEqual(['p2']);
    const r = room.join('Anna', new FakeConn(), ma.token);
    if (!r.ok) throw new Error('join failed');
    expect(r.value.id).toBe('p3');
  });

  it('moves the host role when the host leaves', () => {
    const { room, b, ma } = twoPlayers();
    room.leaveForGood(ma.conn!);
    expect(room.hostId()).toBe('p2');
    expect(b.last('lobby').host).toBe('p2');
  });

  it('ignores an unknown connection', () => {
    const { room } = twoPlayers();
    const before = JSON.stringify(room.roster());
    room.leaveForGood(new FakeConn());
    expect(JSON.stringify(room.roster())).toBe(before);
  });
});

describe('joined build info', () => {
  it('sends the server build with joined, also on a token return', () => {
    const build = { number: '42', sha: 'abcdef1' };
    const room = new Room('ABCD', { now: () => 0, random: () => 0.5, build });
    const a = new FakeConn();
    const r = room.join('Anna', a);
    room.join('Bob', new FakeConn());
    if (!r.ok) throw new Error('join failed');
    expect(a.last('joined').build).toEqual(build);
    expect(room.start(r.value.id).ok).toBe(true);
    room.leave(a);
    const a2 = new FakeConn();
    room.join('Anna', a2, r.value.token);
    expect(a2.last('joined').build).toEqual(build);
  });

  it('defaults to the current server build', () => {
    const { a } = twoPlayers();
    expect(a.last('joined').build).toEqual(currentBuild());
  });
});
