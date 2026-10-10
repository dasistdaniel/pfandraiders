import { createGame, parseMap, projectSnapshot } from '@pfandraiders/core';
import type { Snapshot } from '@pfandraiders/core';
import { describe, expect, it } from 'vitest';
import { extrapolateSnapshot, extrapolationTicks, MAX_EXTRAP_MS } from '../src/extrapolate';

function snapAt(tick: number, x2: number, xn = 0, ids = ['p1', 'p2']): Snapshot {
  const s = createGame(1, parseMap(['#########', '#@@.....#', '#########']), ids);
  s.tick = tick;
  s.players.p1.x = 24;
  if (s.players.p2) s.players.p2.x = x2;
  s.npcs = xn
    ? [{ id: 7, kind: 'dog', x: xn, y: 24, lifeMs: 1000, mood: 'active', moodMs: 0, targetId: null, restId: null, restMs: 0, pauseMs: 0, wanderX: 0, wanderY: 0, wanderRef: 0, cooldownMs: 0, distractedMs: 0, checkMs: 0, pathX: 0, pathY: 0, pathMs: 0 }]
    : [];
  return projectSnapshot(s, 'p1');
}

describe('extrapolationTicks', () => {
  it('counts ticks past the newest snapshot, capped at MAX_EXTRAP_MS', () => {
    expect(MAX_EXTRAP_MS).toBe(150);
    expect(extrapolationTicks(9.5, 10, 50)).toBe(0);
    expect(extrapolationTicks(11, 10, 50)).toBe(1);
    expect(extrapolationTicks(20, 10, 50)).toBe(3); // 150 ms / 50 ms
    expect(extrapolationTicks(20, 10, 60)).toBe(2.5);
    expect(extrapolationTicks(Number.NaN, 10, 50)).toBe(0);
    expect(extrapolationTicks(12, 10, 0)).toBe(0);
  });
});

describe('extrapolateSnapshot', () => {
  it('continues other players and npcs with their last velocity per tick', () => {
    const a = snapAt(10, 40, 100);
    const b = snapAt(11, 45, 104);
    const out = extrapolateSnapshot(a, b, 2, 'p1');
    expect(out.players.p2.x).toBeCloseTo(55, 6);
    expect(out.npcs[0].x).toBeCloseTo(112, 6);
  });

  it('uses the tick distance between the two snapshots (a missing tick in between)', () => {
    const a = snapAt(10, 40);
    const b = snapAt(12, 50);
    expect(extrapolateSnapshot(a, b, 1, 'p1').players.p2.x).toBeCloseTo(55, 6);
  });

  it('never moves the own player and takes all other fields from the newer snapshot', () => {
    const a = snapAt(10, 40);
    const b = snapAt(11, 45);
    a.players.p1.x = 10;
    b.players.p1.x = 30;
    b.players.p2.health = 42;
    const out = extrapolateSnapshot(a, b, 3, 'p1');
    expect(out.players.p1.x).toBe(30);
    expect(out.players.p2.health).toBe(42);
    expect(out.tick).toBe(11);
  });

  it('holds a figure that jumped (respawn, teleport) instead of flying on', () => {
    const a = snapAt(10, 40);
    const b = snapAt(11, 400);
    expect(extrapolateSnapshot(a, b, 2, 'p1').players.p2.x).toBe(400);
  });

  it('holds figures missing in the older snapshot and copes with zero ahead or bad ticks', () => {
    const a = snapAt(10, 0, 0, ['p1']);
    const b = snapAt(11, 80, 100);
    const out = extrapolateSnapshot(a, b, 2, 'p1');
    expect(out.players.p2.x).toBe(80);
    expect(out.npcs[0].x).toBe(100);
    const c = snapAt(11, 50);
    expect(extrapolateSnapshot(c, c, 2, 'p1').players.p2.x).toBe(50);
    expect(extrapolateSnapshot(snapAt(10, 40), snapAt(11, 45), 0, 'p1').players.p2.x).toBe(45);
  });

  it('does not change its inputs', () => {
    const a = snapAt(10, 40, 100);
    const b = snapAt(11, 45, 104);
    const before = JSON.stringify([a, b]);
    extrapolateSnapshot(a, b, 2, 'p1');
    expect(JSON.stringify([a, b])).toBe(before);
  });
});
