import { describe, expect, it } from 'vitest';
import { GAME_H, GAME_W, viewportsFor } from '../src/layout';
import type { Rect } from '../src/layout';

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

describe('viewportsFor', () => {
  it('gives one player the whole screen', () => {
    expect(viewportsFor(1)).toEqual([{ x: 0, y: 0, w: GAME_W, h: GAME_H }]);
  });

  it('splits two players into a left and a right half with a gap', () => {
    const [a, b] = viewportsFor(2);
    expect(a).toMatchObject({ x: 0, y: 0, h: GAME_H });
    expect(b).toMatchObject({ y: 0, h: GAME_H });
    expect(b.x).toBe(a.w + 2);
    expect(b.x + b.w).toBe(GAME_W);
  });

  it('gives three and four players quarters in reading order', () => {
    const four = viewportsFor(4);
    expect(four).toHaveLength(4);
    expect(four[0]).toMatchObject({ x: 0, y: 0 });
    expect(four[1].x).toBeGreaterThan(0);
    expect(four[1].y).toBe(0);
    expect(four[2].x).toBe(0);
    expect(four[2].y).toBeGreaterThan(0);
    expect(four[3].x).toBeGreaterThan(0);
    expect(four[3].y).toBeGreaterThan(0);
    expect(viewportsFor(3)).toEqual(four.slice(0, 3));
  });

  it.each([1, 2, 3, 4])('keeps %i viewports inside the screen and apart from each other', (n) => {
    const views = viewportsFor(n);
    for (const v of views) {
      expect(v.w).toBeGreaterThan(0);
      expect(v.h).toBeGreaterThan(0);
      expect(v.x).toBeGreaterThanOrEqual(0);
      expect(v.y).toBeGreaterThanOrEqual(0);
      expect(v.x + v.w).toBeLessThanOrEqual(GAME_W);
      expect(v.y + v.h).toBeLessThanOrEqual(GAME_H);
    }
    for (let i = 0; i < views.length; i++) {
      for (let j = i + 1; j < views.length; j++) {
        expect(overlaps(views[i], views[j])).toBe(false);
      }
    }
  });

  it('rejects unsupported player counts', () => {
    expect(() => viewportsFor(0)).toThrow(/player count/);
    expect(() => viewportsFor(5)).toThrow(/player count/);
    expect(() => viewportsFor(1.5)).toThrow(/player count/);
  });
});
