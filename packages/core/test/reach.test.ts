import { describe, expect, it } from 'vitest';
import { parseMap, reachableTiles, tileIndexAt } from '../src/map';

// 6 x 4 Kacheln: links ein 2 x 2-Raum, rechts ein 1 x 2-Gang, dazwischen eine Wand
const ROWS = ['######', '#..#.#', '#..#.#', '######'];
const sorted = (s: Set<number>): number[] => [...s].sort((a, b) => a - b);

describe('tileIndexAt', () => {
  it('maps pixels to tile indices and -1 outside the map', () => {
    const m = parseMap(ROWS);
    expect(tileIndexAt(m, 24, 24)).toBe(7);
    expect(tileIndexAt(m, 0, 0)).toBe(0);
    expect(tileIndexAt(m, 95.9, 63.9)).toBe(23);
    expect(tileIndexAt(m, -1, 5)).toBe(-1);
    expect(tileIndexAt(m, 96, 5)).toBe(-1);
    expect(tileIndexAt(m, 5, 64)).toBe(-1);
    expect(tileIndexAt(m, NaN, 5)).toBe(-1);
  });
});

describe('reachableTiles', () => {
  it('floods through walkable tiles only (four neighbours)', () => {
    const m = parseMap(ROWS);
    expect(sorted(reachableTiles(m, 24, 24))).toEqual([7, 8, 13, 14]);
    expect(sorted(reachableTiles(m, 72, 24))).toEqual([10, 16]);
  });

  it('is empty when starting on a wall or outside', () => {
    const m = parseMap(ROWS);
    expect(reachableTiles(m, 8, 8).size).toBe(0);
    expect(reachableTiles(m, -20, 8).size).toBe(0);
  });

  it('treats soft tiles as blocked like the NPC path search', () => {
    const m = parseMap(['#####', '#...#', '#####']);
    m.soft = m.solid.map((_, i) => i === 7);
    expect(sorted(reachableTiles(m, 24, 24))).toEqual([6]);
  });
});
