import type { MapData } from '@pfandraiders/core';

export type TileKey =
  | 'floor_0' | 'floor_1' | 'floor_2'
  | 'wall_top_0' | 'wall_top_1' | 'wall_top_2'
  | 'wall_front';

/** Fester Hash aus Spalte und Zeile, kein Zufall: dieselbe Karte sieht immer gleich aus. */
function variant(col: number, row: number): 0 | 1 | 2 {
  return (((Math.imul(col, 73856093) ^ Math.imul(row, 19349663)) >>> 0) % 3) as 0 | 1 | 2;
}

export function tileKey(map: MapData, col: number, row: number): TileKey {
  const solid = (c: number, r: number) =>
    c < 0 || r < 0 || c >= map.cols || r >= map.rows || map.solid[r * map.cols + c];
  const v = variant(col, row);
  if (!solid(col, row)) return `floor_${v}`;
  return !solid(col, row + 1) ? 'wall_front' : `wall_top_${v}`;
}
