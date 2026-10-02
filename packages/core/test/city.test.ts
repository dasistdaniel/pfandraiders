import { describe, expect, it } from 'vitest';
import { TILE } from '../src/config';
import { CITY_MAP } from '../src/maps/city';

function reachableTiles(map: typeof CITY_MAP, startX: number, startY: number): Set<number> {
  const seen = new Set<number>();
  const stack = [Math.floor(startY / TILE) * map.cols + Math.floor(startX / TILE)];
  while (stack.length > 0) {
    const i = stack.pop()!;
    if (seen.has(i) || map.solid[i]) continue;
    seen.add(i);
    const c = i % map.cols;
    const r = Math.floor(i / map.cols);
    if (c > 0) stack.push(i - 1);
    if (c < map.cols - 1) stack.push(i + 1);
    if (r > 0) stack.push(i - map.cols);
    if (r < map.rows - 1) stack.push(i + map.cols);
  }
  return seen;
}

describe('city map', () => {
  it('has the expected content', () => {
    expect(CITY_MAP.cols).toBe(32);
    expect(CITY_MAP.rows).toBe(20);
    expect(CITY_MAP.spawns.length).toBe(4);
    expect(CITY_MAP.dropoffs.length).toBe(1);
    expect(CITY_MAP.shops.length).toBe(1);
    expect(CITY_MAP.spots.length).toBe(13);
  });

  it('is enclosed by walls', () => {
    const { cols, rows, solid } = CITY_MAP;
    for (let c = 0; c < cols; c++) {
      expect(solid[c]).toBe(true);
      expect(solid[(rows - 1) * cols + c]).toBe(true);
    }
    for (let r = 0; r < rows; r++) {
      expect(solid[r * cols]).toBe(true);
      expect(solid[r * cols + cols - 1]).toBe(true);
    }
  });

  it('lets a player walk from the first spawn to every spot, dropoff and shop', () => {
    const start = CITY_MAP.spawns[0];
    const reach = reachableTiles(CITY_MAP, start.x, start.y);
    const targets = [...CITY_MAP.spots, ...CITY_MAP.dropoffs, ...CITY_MAP.shops, ...CITY_MAP.spawns];
    for (const t of targets) {
      const tile = Math.floor(t.y / TILE) * CITY_MAP.cols + Math.floor(t.x / TILE);
      expect(reach.has(tile), `unreachable target at ${t.x},${t.y}`).toBe(true);
    }
  });
});
