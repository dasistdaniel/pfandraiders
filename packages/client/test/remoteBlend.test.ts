import { createGame, parseMap, projectSnapshot } from '@pfandraiders/core';
import type { Snapshot } from '@pfandraiders/core';
import { describe, expect, it } from 'vitest';
import { BLEND_MAX_PX, BLEND_MS, RemoteBlend } from '../src/remoteBlend';

function snapAt(x2: number, xn = 0, x1 = 24): Snapshot {
  const s = createGame(1, parseMap(['#########', '#@@.....#', '#########']), ['p1', 'p2']);
  s.players.p1.x = x1;
  s.players.p2.x = x2;
  s.npcs = xn
    ? [{ id: 7, kind: 'dog', x: xn, y: 24, lifeMs: 1000, mood: 'active', moodMs: 0, targetId: null, restId: null, restMs: 0, pauseMs: 0, wanderX: 0, wanderY: 0, wanderRef: 0, cooldownMs: 0, distractedMs: 0, checkMs: 0, pathX: 0, pathY: 0, pathMs: 0 }]
    : [];
  return projectSnapshot(s, 'p1');
}

describe('RemoteBlend', () => {
  it('passes positions through unchanged without a jump', () => {
    const b = new RemoteBlend();
    const s = snapAt(40, 100);
    expect(b.apply(s, 'p1', 16, false)).toBe(s);
    expect(b.apply(snapAt(50, 110), 'p1', 16, false).players.p2.x).toBe(50);
  });

  it('eases a jump of other players and npcs out over BLEND_MS', () => {
    const b = new RemoteBlend();
    b.apply(snapAt(40, 100), 'p1', 16, false);
    // neue Daten nach dem Fortschreiben: Ziel liegt 20 px weiter
    const xs: number[] = [];
    const ns: number[] = [];
    for (let t = 0; t < BLEND_MS + 20; t += 10) {
      const out = b.apply(snapAt(60, 120), 'p1', 10, t === 0);
      xs.push(out.players.p2.x);
      ns.push(out.npcs[0].x);
    }
    expect(xs[0]).toBeCloseTo(42, 6); // 10 % des Wegs im ersten Frame
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i]).toBeGreaterThanOrEqual(xs[i - 1]);
      expect(xs[i] - xs[i - 1]).toBeLessThanOrEqual(2 + 1e-9);
    }
    expect(xs[xs.length - 1]).toBe(60);
    expect(ns[0]).toBeCloseTo(102, 6);
    expect(ns[ns.length - 1]).toBe(120);
  });

  it('starts a new blend from what is shown, also in the middle of one', () => {
    const b = new RemoteBlend();
    b.apply(snapAt(40), 'p1', 16, false);
    const mid = b.apply(snapAt(60), 'p1', 50, true).players.p2.x; // halb: 40 + 20 * 0,5
    expect(mid).toBeCloseTo(50, 6);
    const again = b.apply(snapAt(80), 'p1', 10, true).players.p2.x;
    expect(again).toBeCloseTo(50 + 30 * 0.1, 6);
  });

  it('snaps instead of blending beyond BLEND_MAX_PX and never touches the own player', () => {
    const b = new RemoteBlend();
    b.apply(snapAt(40, 0, 24), 'p1', 16, false);
    const out = b.apply(snapAt(40 + BLEND_MAX_PX + 1, 0, 200), 'p1', 10, true);
    expect(out.players.p2.x).toBe(40 + BLEND_MAX_PX + 1);
    expect(out.players.p1.x).toBe(200);
  });

  it('shows new figures at their position and forgets old ones on reset', () => {
    const b = new RemoteBlend();
    expect(b.apply(snapAt(40, 100), 'p1', 16, true).npcs[0].x).toBe(100);
    b.reset();
    expect(b.apply(snapAt(60, 120), 'p1', 16, true).players.p2.x).toBe(60);
  });

  it('does not change its input', () => {
    const b = new RemoteBlend();
    b.apply(snapAt(40, 100), 'p1', 16, false);
    const s = snapAt(60, 120);
    const before = JSON.stringify(s);
    b.apply(s, 'p1', 10, true);
    expect(JSON.stringify(s)).toBe(before);
  });
});
