import { describe, expect, it } from 'vitest';
import { totalBottles } from '../src/bottles';
import { CONFIG, TILE } from '../src/config';
import { createGame } from '../src/game';
import { boxBlocked } from '../src/map';
import { CITY_MAP } from '../src/maps';
import { lineClear, nextWaypoint } from '../src/path';
import { step } from '../src/step';
import type { Point } from '../src/types';

/** Paare freier Kachelmitten auf der Stadtkarte mit verbautem direktem Weg (64 bis 120 px), deterministisch gewählt. */
function cases(): { cop: Point; player: Point }[] {
  const m = CITY_MAP;
  const free = (c: number, r: number): Point | null => {
    const p = { x: c * TILE + TILE / 2, y: r * TILE + TILE / 2 };
    return boxBlocked(m, p.x, p.y, CONFIG.playerHalf) ? null : p;
  };
  const out: { cop: Point; player: Point }[] = [];
  for (let r = 1; r < m.rows - 1 && out.length < 25; r += 3) {
    for (let c = 1; c < m.cols - 1 && out.length < 25; c += 5) {
      const a = free(c, r);
      if (!a) continue;
      for (const [dc, dr] of [[6, 0], [0, 6], [5, 3], [-4, 5]]) {
        const b = free(c + dc, r + dr);
        if (!b) continue;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < 64 || d > 120 || lineClear(m, a, b) || !nextWaypoint(m, a, b)) continue;
        out.push({ cop: a, player: b });
        break;
      }
    }
  }
  return out;
}

describe('police pathing on the city map', () => {
  it('finds enough test cases', () => {
    expect(cases().length).toBeGreaterThanOrEqual(10);
  });

  it('reaches players behind houses and confiscates, without entering walls', () => {
    const failed: string[] = [];
    for (const { cop: from, player } of cases()) {
      const s = createGame(1, CITY_MAP, ['p1']);
      s.nextNpcMs = 1e9;
      s.players.p1.x = player.x;
      s.players.p1.y = player.y;
      s.players.p1.health = 1e9; // kein Umfallen durch Hunger
      s.players.p1.items.bag = 3;
      s.players.p1.bottles = { plastic: 4, glass: 0, crate: 0 };
      s.npcs.push({
        id: 1, kind: 'police', x: from.x, y: from.y, lifeMs: 30000, mood: 'active', moodMs: 0, targetId: null,
        restId: null, restMs: 0, pauseMs: 0, wanderX: from.x, wanderY: from.y, wanderRef: 0, cooldownMs: 0,
        distractedMs: 0, checkMs: 0, pathX: from.x, pathY: from.y, pathMs: 0,
      });
      const cop = s.npcs[0];
      for (let t = 0; t < 600 && totalBottles(s.players.p1.bottles) === 4; t++) {
        step(s, {}, 20);
        expect(boxBlocked(CITY_MAP, cop.x, cop.y, CONFIG.playerHalf)).toBe(false);
      }
      if (totalBottles(s.players.p1.bottles) !== 2) failed.push(`${from.x},${from.y} -> ${player.x},${player.y} (cop ${cop.x.toFixed(1)},${cop.y.toFixed(1)}, ${cop.mood})`);
    }
    expect(failed).toEqual([]);
  });
});
