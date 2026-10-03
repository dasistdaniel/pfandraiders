import { describe, expect, it } from 'vitest';
import { KENNEY_BOTTLES, KENNEY_OBJECTS, KENNEY_SPOTS, KENNEY_TILES, cellInBounds } from '../src/kenneyMap';

const TILE_KEYS = ['floor_0', 'floor_1', 'floor_2', 'wall_top_0', 'wall_top_1', 'wall_top_2', 'wall_front'];
const SPOT_TYPES = ['bus_stop', 'bench', 'bush', 'bin', 'park'];

describe('kenneyMap', () => {
  it('has every tile key, both objects and all spot types', () => {
    expect(Object.keys(KENNEY_TILES).sort()).toEqual([...TILE_KEYS].sort());
    expect(Object.keys(KENNEY_OBJECTS).sort()).toEqual(['dropoff', 'shop']);
    expect(Object.keys(KENNEY_SPOTS).sort()).toEqual([...SPOT_TYPES].sort());
  });

  it('keeps every cell inside the sheet', () => {
    const all = [
      ...Object.values(KENNEY_TILES),
      ...Object.values(KENNEY_OBJECTS),
      ...Object.values(KENNEY_SPOTS),
      KENNEY_BOTTLES,
    ];
    for (const c of all) expect(cellInBounds(c)).toBe(true);
  });

  it('rejects out-of-range, NaN and non-integer cells', () => {
    expect(cellInBounds({ col: -1, row: 0 })).toBe(false);
    expect(cellInBounds({ col: 37, row: 0 })).toBe(false);
    expect(cellInBounds({ col: 0, row: 28 })).toBe(false);
    expect(cellInBounds({ col: NaN, row: 0 })).toBe(false);
    expect(cellInBounds({ col: 0, row: 1.5 })).toBe(false);
    expect(cellInBounds({ col: 0, row: 0 })).toBe(true);
    expect(cellInBounds({ col: 36, row: 27 })).toBe(true);
  });
});
