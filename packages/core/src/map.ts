import { CONFIG, TILE } from './config';
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
      else if (ch === 'N') npcSpawns.push(center);
      else if (ch in SPOT_CHARS) spots.push({ id: spots.length, type: SPOT_CHARS[ch], ...center });
      else throw new Error(`unknown map char '${ch}' at row ${r}, col ${c}`);
    }
  });

  return { cols, rows: rows.length, solid, spots, dropoffs, spawns, npcSpawns, zones };
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
  if (
    isSolidAt(map, x - half, y - half) ||
    isSolidAt(map, x + half, y - half) ||
    isSolidAt(map, x - half, y + half) ||
    isSolidAt(map, x + half, y + half)
  ) {
    return true;
  }
  const soft = map.soft;
  if (!soft || soft.length === 0) return false;
  // Weiche Kachel: blockiert nur, wenn die Box das Quadrat um die Kachelmitte echt überlappt.
  const k = CONFIG.softHalf;
  const c0 = Math.floor((x - half) / TILE);
  const c1 = Math.floor((x + half) / TILE);
  const r0 = Math.floor((y - half) / TILE);
  const r1 = Math.floor((y + half) / TILE);
  for (let r = Math.max(r0, 0); r <= Math.min(r1, map.rows - 1); r++) {
    for (let c = Math.max(c0, 0); c <= Math.min(c1, map.cols - 1); c++) {
      if (!soft[r * map.cols + c]) continue;
      const cx = c * TILE + TILE / 2;
      const cy = r * TILE + TILE / 2;
      if (x - half < cx + k && x + half > cx - k && y - half < cy + k && y + half > cy - k) return true;
    }
  }
  return false;
}

/** Kachelindex (row * cols + col) unter dem Pixelpunkt; -1 = außerhalb der Karte. */
export function tileIndexAt(map: MapData, px: number, py: number): number {
  const c = Math.floor(px / TILE);
  const r = Math.floor(py / TILE);
  if (!Number.isFinite(c) || !Number.isFinite(r) || c < 0 || r < 0 || c >= map.cols || r >= map.rows) return -1;
  return r * map.cols + c;
}

/**
 * Kacheln, die man von (px, py) aus über Vierer-Nachbarn erreicht. Wände und weiche Hindernisse (soft)
 * sperren wie bei der Wegsuche der NPCs. Liegt der Start außerhalb oder auf einer gesperrten Kachel, ist die Menge leer.
 */
export function reachableTiles(map: MapData, px: number, py: number): Set<number> {
  const seen = new Set<number>();
  const start = tileIndexAt(map, px, py);
  if (start < 0) return seen;
  const blocked = (i: number): boolean => map.solid[i] || (map.soft?.[i] ?? false);
  const stack = [start];
  while (stack.length > 0) {
    const i = stack.pop()!;
    if (seen.has(i) || blocked(i)) continue;
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
