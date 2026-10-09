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
