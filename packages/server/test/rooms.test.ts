import { ROOM_CODE_CHARS, ROOM_CODE_LENGTH } from '@pfandraiders/core';
import { describe, expect, it } from 'vitest';
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
    const m = new RoomManager({ maxRooms: 5, now: () => t, emptyMs: 1000 });
    const r = m.create('A', conn);
    if (!r.ok) throw new Error('create failed');
    r.value.room.leave(conn);
    t = 2000;
    m.sweep();
    expect(m.size).toBe(0);
  });
});
