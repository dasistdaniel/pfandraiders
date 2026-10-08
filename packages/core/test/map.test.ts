import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { boxBlocked, isSolidAt, parseMap } from '../src/map';

const ROWS = [
  '#######',
  '#@bnD.#',
  '#.gmp.#',
  '#######',
];

describe('parseMap', () => {
  it('rejects the former shop character S', () => {
    expect(() => parseMap(['#####', '#@S.#', '#####'])).toThrow(/unknown map char 'S'/);
  });

  it('reads size, solids and special tiles at tile centers', () => {
    const map = parseMap(ROWS);
    expect(map.cols).toBe(7);
    expect(map.rows).toBe(4);
    expect(map.solid[0]).toBe(true);
    expect(map.solid[1 * 7 + 1]).toBe(false);
    expect(map.spawns).toEqual([{ x: 24, y: 24 }]);
    expect(map.dropoffs).toEqual([{ x: 72, y: 24 }]);
    expect('shops' in map).toBe(false);
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
  it('reads npc spawn tiles as walkable floor', () => {
    const map = parseMap(['####', '#N@#', '####']);
    expect(map.npcSpawns).toEqual([{ x: 24, y: 24 }]);
    expect(map.spawns).toEqual([{ x: 40, y: 24 }]);
    expect(map.solid[1 * 4 + 1]).toBe(false);
    expect(map.zones).toEqual([]);
  });

  it('passes zones through', () => {
    const zones = [{ id: 'z', name: 'Zone', area: { x0: 0, y0: 0, x1: 32, y1: 32 } }];
    expect(parseMap(['@'], zones).zones).toEqual(zones);
  });
});

describe('soft tiles', () => {
  // 3 x 3 Kacheln, weiche Kachel in der Mitte (Mitte bei 24, 24); Kern 21..27
  const soft = [false, false, false, false, true, false, false, false, false];
  const m = { ...parseMap(['...', '...', '...']), soft };
  const H = CONFIG.softHalf;
  const HALF = CONFIG.playerHalf;

  it('keeps isSolidAt for full solids only', () => {
    expect(isSolidAt(m, 24, 24)).toBe(false);
  });

  it('allows standing next to a soft tile and inside its tile but outside the core', () => {
    expect(boxBlocked(m, 24 - H - HALF, 24, HALF)).toBe(false); // Kante genau am Kern
    expect(boxBlocked(m, 24 - H - HALF - 1, 24, HALF)).toBe(false);
    expect(boxBlocked(m, 24, 24 + H + HALF, HALF)).toBe(false);
  });

  it('blocks a box that overlaps the core', () => {
    expect(boxBlocked(m, 24, 24, HALF)).toBe(true);
    expect(boxBlocked(m, 24 - H - HALF + 0.5, 24, HALF)).toBe(true);
    expect(boxBlocked(m, 24 + H + HALF - 0.5, 24 + 4, HALF)).toBe(true);
  });

  it('lets a box slide past the core', () => {
    for (let x = 6; x <= 42; x += 1) expect(boxBlocked(m, x, 24 - H - HALF, HALF), `x=${x}`).toBe(false);
  });

  it('changes nothing without soft or with an empty soft array', () => {
    const plain = parseMap(['...', '...', '...']);
    expect(boxBlocked(plain, 24, 24, HALF)).toBe(false);
    expect(boxBlocked({ ...plain, soft: [] }, 24, 24, HALF)).toBe(false);
    expect(boxBlocked({ ...plain, soft: new Array(9).fill(false) }, 24, 24, HALF)).toBe(false);
  });

  it('keeps solid tiles fully solid', () => {
    const s = { ...parseMap(['.#.']), soft: [false, false, false] };
    expect(boxBlocked(s, 24 - 7, 8, 5)).toBe(true);
  });
});
