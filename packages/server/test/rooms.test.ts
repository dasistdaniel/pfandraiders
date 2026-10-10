import { ROOM_CODE_CHARS, ROOM_CODE_LENGTH } from '@pfandraiders/core';
import { describe, expect, it, vi } from 'vitest';
import { RoomManager } from '../src/rooms';

const conn = { send() {} };

describe('RoomManager', () => {
  it('creates rooms with valid, unique codes and puts the creator in', () => {
    const m = new RoomManager({ maxRooms: 10 });
    const codes = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const r = m.create(`P${i}`, conn);
      if (!r.ok) throw new Error('create failed');
      expect(r.value.room.code).toHaveLength(ROOM_CODE_LENGTH);
      for (const ch of r.value.room.code) expect(ROOM_CODE_CHARS).toContain(ch);
      expect(r.value.member.id).toBe('p1');
      codes.add(r.value.room.code);
    }
    expect(codes.size).toBe(10);
    expect(m.size).toBe(10);
  });

  it('refuses to create more rooms than allowed', () => {
    const m = new RoomManager({ maxRooms: 1 });
    expect(m.create('A', conn).ok).toBe(true);
    expect(m.create('B', conn)).toMatchObject({ ok: false, code: 'too_many_rooms' });
  });

  it('finds rooms by code', () => {
    const m = new RoomManager({ maxRooms: 5 });
    const r = m.create('A', conn);
    if (!r.ok) throw new Error('create failed');
    expect(m.get(r.value.room.code)).toBe(r.value.room);
    expect(m.get('ZZZZ')).toBeUndefined();
  });

  it('retries on a code collision', () => {
    const seq = [0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5];
    let i = 0;
    const m = new RoomManager({ maxRooms: 5, random: () => seq[i++ % seq.length] });
    const a = m.create('A', conn);
    const b = m.create('B', conn);
    if (!a.ok || !b.ok) throw new Error('create failed');
    expect(a.value.room.code).not.toBe(b.value.room.code);
  });

  it('sweeps dead rooms', () => {
    let t = 0;
    const m = new RoomManager({ maxRooms: 5, now: () => t, emptyMs: 1000, graceMs: 5000 });
    const r = m.create('A', conn);
    if (!r.ok) throw new Error('create failed');
    r.value.room.leave(conn);
    t = 20_000; // Rückkehrfrist 5 s + 15 s
    m.sweep();
    expect(m.size).toBe(0);
  });

  it('one failing room neither stops the others nor survives 3 consecutive failures', () => {
    const onError = vi.fn();
    const m = new RoomManager({ maxRooms: 5, onError });
    const closed = vi.fn();
    const c1 = { send: vi.fn(), close: closed };
    const bad = m.create('A', c1);
    const good = m.create('B', conn);
    if (!bad.ok || !good.ok) throw new Error('create failed');
    bad.value.room.tick = () => {
      throw new Error('boom');
    };
    const goodTick = vi.spyOn(good.value.room, 'tick');
    m.tickAll();
    m.tickAll();
    expect(goodTick).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledTimes(2);
    expect(m.size).toBe(2);
    m.tickAll();
    expect(m.size).toBe(1);
    expect(m.get(bad.value.room.code)).toBeUndefined();
    expect(m.get(good.value.room.code)).toBeDefined();
    expect(c1.send).toHaveBeenCalledWith(expect.objectContaining({ t: 'error', code: 'bad_message' }));
    expect(closed).toHaveBeenCalledWith(1011, expect.any(String));
  });

  it('resets the failure count after a successful tick', () => {
    const m = new RoomManager({ maxRooms: 5, onError: () => {} });
    const r = m.create('A', conn);
    if (!r.ok) throw new Error('create failed');
    const room = r.value.room;
    const real = room.tick.bind(room);
    let fail = true;
    room.tick = () => {
      if (fail) throw new Error('boom');
      real();
    };
    m.tickAll();
    m.tickAll();
    fail = false;
    m.tickAll();
    fail = true;
    m.tickAll();
    m.tickAll();
    expect(m.size).toBe(1);
  });
});

describe('RoomManager.create with options', () => {
  it('uses the default room name, public and no password', () => {
    const m = new RoomManager({ maxRooms: 5 });
    const a = m.create('Anna', conn);
    const k = m.create('Klaus', conn);
    if (!a.ok || !k.ok) throw new Error('create failed');
    expect(a.value.room.name).toBe('Annas Raum');
    expect(k.value.room.name).toBe("Klaus' Raum");
    expect(a.value.room.visibility).toBe('public');
    expect(a.value.room.locked).toBe(false);
  });

  it('passes name, visibility and password on and lets the creator in', () => {
    const m = new RoomManager({ maxRooms: 5 });
    const r = m.create('Anna', conn, { roomName: 'Bude', visibility: 'private', password: 'pw' });
    if (!r.ok) throw new Error('create failed');
    expect(r.value.room).toMatchObject({ name: 'Bude', visibility: 'private', locked: true });
    expect(r.value.member.name).toBe('Anna');
  });
});

describe('RoomManager.listRooms', () => {
  const quiet = () => ({ send() {} });

  it('lists public rooms with name, host, players, max, phase and lock, without secrets', () => {
    const m = new RoomManager({ maxRooms: 5, countdownMs: 0 });
    const r = m.create('Anna', quiet(), { roomName: 'Bude', password: 'geheim' });
    if (!r.ok) throw new Error('create failed');
    r.value.room.join('Bob', quiet(), undefined, { password: 'geheim' });
    const list = m.listRooms();
    expect(list).toEqual([{ code: r.value.room.code, name: 'Bude', host: 'Anna', players: 2, max: 8, phase: 'lobby', locked: true, mapName: 'Stadt' }]);
    const text = JSON.stringify(list);
    expect(text).not.toContain('geheim');
    expect(text).not.toContain(r.value.member.token);
    expect(text).not.toContain('"p1"');
  });

  it('hides private rooms and rooms without connected players', () => {
    const m = new RoomManager({ maxRooms: 5 });
    m.create('Anna', quiet(), { visibility: 'private' });
    const c = quiet();
    const empty = m.create('Bob', c);
    if (!empty.ok) throw new Error('create failed');
    empty.value.room.leave(c);
    expect(m.listRooms()).toEqual([]);
  });

  it('puts joinable lobbies first, then more players, then by code', () => {
    let i = 0;
    // Codes AAAA, BBBB, CCCC, DDDD (ROOM_CODE_CHARS beginnt mit ABCD)
    const seq = [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3].map((k) => (k + 0.5) / ROOM_CODE_CHARS.length);
    const m = new RoomManager({ maxRooms: 5, countdownMs: 0, random: () => seq[i++ % seq.length] });
    const a = m.create('A', quiet()); // AAAA: Lobby, 1 Spieler
    const b = m.create('B', quiet()); // BBBB: läuft, 2 Spieler
    const c = m.create('C', quiet()); // CCCC: Lobby, 3 Spieler
    const d = m.create('D', quiet()); // DDDD: Lobby, 1 Spieler
    if (!a.ok || !b.ok || !c.ok || !d.ok) throw new Error('create failed');
    expect([a, b, c, d].map((r) => (r.ok ? r.value.room.code : ''))).toEqual(['AAAA', 'BBBB', 'CCCC', 'DDDD']);
    b.value.room.join('B2', quiet());
    b.value.room.start('p1');
    c.value.room.join('C2', quiet());
    c.value.room.join('C3', quiet());
    expect(m.listRooms().map((r) => [r.code, r.phase, r.players])).toEqual([
      ['CCCC', 'lobby', 3],
      ['AAAA', 'lobby', 1],
      ['DDDD', 'lobby', 1],
      ['BBBB', 'playing', 2],
    ]);
  });

  it('puts a full lobby behind the joinable ones and shows the final phase as shop', () => {
    let i = 0;
    const seq = [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2].map((k) => (k + 0.5) / ROOM_CODE_CHARS.length);
    const m = new RoomManager({ maxRooms: 5, countdownMs: 0, roundMs: 100, random: () => seq[i++ % seq.length] });
    const full = m.create('A', quiet());
    const fin = m.create('B', quiet());
    const open = m.create('C', quiet());
    if (!full.ok || !fin.ok || !open.ok) throw new Error('create failed');
    for (let k = 2; k <= 8; k++) full.value.room.join(`A${k}`, quiet());
    fin.value.room.join('B2', quiet());
    fin.value.room.setRounds('p1', 1);
    fin.value.room.start('p1');
    for (let k = 0; k < 10 && fin.value.room.phase === 'playing'; k++) fin.value.room.tick();
    expect(fin.value.room.phase).toBe('final');
    expect(m.listRooms().map((r) => [r.code, r.phase, r.players])).toEqual([
      ['CCCC', 'lobby', 1],
      ['AAAA', 'lobby', 8],
      ['BBBB', 'shop', 2],
    ]);
  });

  it('returns at most 50 rooms', () => {
    const m = new RoomManager({ maxRooms: 60 });
    for (let k = 0; k < 60; k++) m.create(`P${k}`, quiet());
    expect(m.listRooms()).toHaveLength(50);
  });
});
