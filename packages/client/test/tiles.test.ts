import { describe, expect, it } from 'vitest';
import { CITY_MAP, parseMap } from '@pfandraiders/core';
import { tileKey } from '../src/tiles';

const map = parseMap(['###', '#.#', '###', '#.#', '###']);

describe('tileKey', () => {
  it('uses floor_* for walkable tiles', () => {
    expect(tileKey(map, 1, 1)).toMatch(/^floor_[012]$/);
  });
  it('uses wall_front for a wall with floor below', () => {
    expect(tileKey(map, 1, 0)).toBe('wall_front');
    expect(tileKey(map, 1, 2)).toBe('wall_front');
  });
  it('uses wall_top_* for a wall with wall below', () => {
    expect(tileKey(map, 0, 0)).toMatch(/^wall_top_[012]$/);
  });
  it('treats outside below as wall for the last row', () => {
    expect(tileKey(map, 1, 4)).toMatch(/^wall_top_[012]$/);
  });
  it('is deterministic', () => {
    expect(tileKey(map, 1, 3)).toBe(tileKey(map, 1, 3));
  });
  it('uses all floor and roof variants and wall_front on the city map', () => {
    const keys = new Set<string>();
    for (let r = 0; r < CITY_MAP.rows; r++) for (let c = 0; c < CITY_MAP.cols; c++) keys.add(tileKey(CITY_MAP, c, r));
    for (const k of ['floor_0', 'floor_1', 'floor_2', 'wall_top_0', 'wall_top_1', 'wall_top_2', 'wall_front']) {
      expect(keys.has(k)).toBe(true);
    }
  });
});
