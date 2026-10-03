import { describe, expect, it } from 'vitest';
import { TILE } from '../src/config';
import { RETRO_MAP } from '../src/maps/retro';

function reachableTiles(map: typeof RETRO_MAP, startX: number, startY: number): Set<number> {
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

describe('retro map', () => {
  it('has the expected content', () => {
    expect(RETRO_MAP.cols).toBe(32);
    expect(RETRO_MAP.rows).toBe(20);
    expect(RETRO_MAP.spawns.length).toBe(4);
    expect(RETRO_MAP.dropoffs.length).toBe(1);
    expect(RETRO_MAP.shops.length).toBe(1);
    expect(RETRO_MAP.spots.length).toBe(17);
    expect(RETRO_MAP.npcSpawns.length).toBe(4);
    expect(RETRO_MAP.zones.map((z) => z.id)).toEqual(['stadium', 'concert']);
  });

  it('is enclosed by walls', () => {
    const { cols, rows, solid } = RETRO_MAP;
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
    const start = RETRO_MAP.spawns[0];
    const reach = reachableTiles(RETRO_MAP, start.x, start.y);
    const targets = [
      ...RETRO_MAP.spots,
      ...RETRO_MAP.dropoffs,
      ...RETRO_MAP.shops,
      ...RETRO_MAP.spawns,
      ...RETRO_MAP.npcSpawns,
    ];
    for (const t of targets) {
      const tile = Math.floor(t.y / TILE) * RETRO_MAP.cols + Math.floor(t.x / TILE);
      expect(reach.has(tile), `unreachable target at ${t.x},${t.y}`).toBe(true);
    }
  });

  it('puts at least three spots into each event zone', () => {
    for (const zone of RETRO_MAP.zones) {
      const inside = RETRO_MAP.spots.filter(
        (s) => s.x >= zone.area.x0 && s.x < zone.area.x1 && s.y >= zone.area.y0 && s.y < zone.area.y1,
      );
      expect(inside.length, zone.id).toBeGreaterThanOrEqual(3);
    }
  });
});
