import { TILE } from './config';
import type { MapData, Point, SpotDef, SpotType, ZoneDef } from './types';

const SPOT_CHARS: Record<string, SpotType> = {
  b: 'bus_stop',
  n: 'bench',
  g: 'bush',
  m: 'bin',
  p: 'park',
};

export function parseMap(rows: string[], zones: ZoneDef[] = []): MapData {
  const cols = rows[0].length;
  const solid: boolean[] = [];
  const spots: SpotDef[] = [];
  const dropoffs: Point[] = [];
  const shops: Point[] = [];
  const spawns: Point[] = [];
  const npcSpawns: Point[] = [];

  rows.forEach((row, r) => {
    if (row.length !== cols) {
      throw new Error(`map row ${r} has length ${row.length}, expected ${cols}`);
    }
    for (let c = 0; c < cols; c++) {
      const ch = row[c];
      const center = { x: c * TILE + TILE / 2, y: r * TILE + TILE / 2 };
      solid.push(ch === '#');
      if (ch === '#' || ch === '.') continue;
      if (ch === '@') spawns.push(center);
      else if (ch === 'D') dropoffs.push(center);
      else if (ch === 'S') shops.push(center);
      else if (ch === 'N') npcSpawns.push(center);
      else if (ch in SPOT_CHARS) spots.push({ id: spots.length, type: SPOT_CHARS[ch], ...center });
      else throw new Error(`unknown map char '${ch}' at row ${r}, col ${c}`);
    }
  });

  return { cols, rows: rows.length, solid, spots, dropoffs, shops, spawns, npcSpawns, zones };
}

/** Wand oder außerhalb der Karte */
export function isSolidAt(map: MapData, px: number, py: number): boolean {
  const c = Math.floor(px / TILE);
  const r = Math.floor(py / TILE);
  if (c < 0 || r < 0 || c >= map.cols || r >= map.rows) return true;
  return map.solid[r * map.cols + c];
}

/** Quadrat mit halber Kantenlänge `half` um (x, y). Gilt für half < TILE / 2. */
export function boxBlocked(map: MapData, x: number, y: number, half: number): boolean {
  return (
    isSolidAt(map, x - half, y - half) ||
    isSolidAt(map, x + half, y - half) ||
    isSolidAt(map, x - half, y + half) ||
    isSolidAt(map, x + half, y + half)
  );
}
