import { describe, expect, it } from 'vitest';
import { boxBlocked, isSolidAt, parseMap } from '../src/map';

const ROWS = [
  '#######',
  '#@bnD.#',
  '#.gmpS#',
  '#######',
];

describe('parseMap', () => {
  it('reads size, solids and special tiles at tile centers', () => {
    const map = parseMap(ROWS);
    expect(map.cols).toBe(7);
    expect(map.rows).toBe(4);
    expect(map.solid[0]).toBe(true);
    expect(map.solid[1 * 7 + 1]).toBe(false);
    expect(map.spawns).toEqual([{ x: 24, y: 24 }]);
    expect(map.dropoffs).toEqual([{ x: 72, y: 24 }]);
    expect(map.shops).toEqual([{ x: 88, y: 40 }]);
  });

  it('numbers spots in reading order with their type', () => {
    const map = parseMap(ROWS);
    expect(map.spots.map((s) => [s.id, s.type])).toEqual([
      [0, 'bus_stop'],
      [1, 'bench'],
      [2, 'bush'],
      [3, 'bin'],
      [4, 'park'],
    ]);
    expect(map.spots[0]).toMatchObject({ x: 40, y: 24 });
  });

  it('rejects ragged rows', () => {
    expect(() => parseMap(['###', '##'])).toThrow(/row 1/);
  });

  it('rejects unknown characters', () => {
    expect(() => parseMap(['#?#'])).toThrow(/unknown map char/);
  });
});

describe('collision', () => {
  const map = parseMap(['####', '#..#', '####']);

  it('treats walls and everything outside the map as solid', () => {
    expect(isSolidAt(map, 8, 8)).toBe(true);
    expect(isSolidAt(map, 24, 24)).toBe(false);
    expect(isSolidAt(map, -1, 24)).toBe(true);
    expect(isSolidAt(map, 24, -1)).toBe(true);
    expect(isSolidAt(map, 1000, 24)).toBe(true);
  });

  it('blocks a box when any corner touches a wall', () => {
    expect(boxBlocked(map, 24, 24, 5)).toBe(false);
    expect(boxBlocked(map, 18, 24, 5)).toBe(true); // linke Kante x=13 liegt in der Wand
    expect(boxBlocked(map, 24, 18, 5)).toBe(true);
  });
});
