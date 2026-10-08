import { createGame, parseMap, projectSnapshot } from '@pfandraiders/core';
import type { Snapshot } from '@pfandraiders/core';
import { describe, expect, it } from 'vitest';
import { interpolateSnapshot } from '../src/interpolate';

function snapAt(x2: number, xn = 0, ids = ['p1', 'p2']): Snapshot {
  const s = createGame(1, parseMap(['#########', '#@@.....#', '#########']), ids);
  s.players.p1.x = 24;
  if (s.players.p2) s.players.p2.x = x2;
  s.npcs = xn
    ? [{ id: 7, kind: 'dog', x: xn, y: 24, lifeMs: 1000, mood: 'active', moodMs: 0, targetId: null, restId: null, restMs: 0, pauseMs: 0, wanderX: 0, wanderY: 0, wanderRef: 0, cooldownMs: 0, distractedMs: 0, checkMs: 0, pathX: 0, pathY: 0, pathMs: 0 }]
    : [];
  return projectSnapshot(s, 'p1');
}

describe('interpolateSnapshot', () => {
  it('moves other players between the two snapshots', () => {
    const a = snapAt(40);
    const b = snapAt(80);
    const out = interpolateSnapshot(a, b, 0.5, b, 'p1');
    expect(out.players.p2.x).toBeCloseTo(60, 5);
  });

  it('takes the own player straight from the latest snapshot without delay', () => {
    const a = snapAt(40);
    const b = snapAt(80);
    a.players.p1.x = 10;
    b.players.p1.x = 30;
    const out = interpolateSnapshot(a, b, 0.5, b, 'p1');
    expect(out.players.p1.x).toBe(30);
  });

  it('takes every non-position field from the latest snapshot', () => {
    const a = snapAt(40);
    const b = snapAt(80);
    b.timeLeftMs = 1234;
    b.players.p2.health = 55;
    const out = interpolateSnapshot(a, b, 0.25, b, 'p1');
    expect(out.timeLeftMs).toBe(1234);
    expect(out.players.p2.health).toBe(55);
  });

  it('interpolates npcs by id and shows new npcs at their latest position', () => {
    const a = snapAt(40, 100);
    const b = snapAt(40, 140);
    expect(interpolateSnapshot(a, b, 0.5, b, 'p1').npcs[0].x).toBeCloseTo(120, 5);
    const none = snapAt(40, 0);
    expect(interpolateSnapshot(none, b, 0.5, b, 'p1').npcs[0].x).toBe(140);
  });

  it('copes with a player that is missing in the older snapshot', () => {
    const only1 = snapAt(0, 0, ['p1']);
    const both = snapAt(80);
    const out = interpolateSnapshot(only1, both, 0.5, both, 'p1');
    expect(out.players.p2.x).toBe(80);
  });

  it('does not change its inputs', () => {
    const a = snapAt(40);
    const b = snapAt(80);
    const before = JSON.stringify([a, b]);
    interpolateSnapshot(a, b, 0.5, b, 'p1');
    expect(JSON.stringify([a, b])).toBe(before);
  });

  it('clamps alpha to [0, 1]', () => {
    const a = snapAt(40);
    const b = snapAt(80);
    expect(interpolateSnapshot(a, b, -3, b, 'p1').players.p2.x).toBe(40);
    expect(interpolateSnapshot(a, b, 9, b, 'p1').players.p2.x).toBe(80);
  });
});
