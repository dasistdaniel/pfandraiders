import { SHEET_CELLS, SHEET_COLS } from '@pfandraiders/core';
import type { MapData, MapVisuals } from '@pfandraiders/core';

/** Zelle im Kachelbogen zu einer Zellnummer (gid, 1 = oben links); 0, ungültige und zu große Nummern ergeben null. */
export function cellRect(gid: number): { col: number; row: number } | null {
  if (!Number.isInteger(gid) || gid < 1 || gid > SHEET_CELLS) return null;
  return { col: (gid - 1) % SHEET_COLS, row: Math.floor((gid - 1) / SHEET_COLS) };
}

/** Sind alle drei Ebenen da und genau so groß wie die Karte? Sonst zeichnet der Client die einfarbige Rückfallkarte. */
export function visualsComplete(v: MapVisuals | null): v is MapVisuals {
  if (!v) return false;
  if (!Number.isInteger(v.cols) || !Number.isInteger(v.rows) || v.cols < 1 || v.rows < 1) return false;
  const n = v.cols * v.rows;
  return [v.ground, v.below, v.above].every((l) => Array.isArray(l) && l.length === n);
}

/**
 * Passen die Grafikebenen zur Karte des Servers (Versionsunterschied zwischen Client und Server)?
 * Gleiche Maße, und jede feste Kachel hat Grafik in ground oder below.
 */
export function visualsMatchMap(v: MapVisuals | null, map: MapData): v is MapVisuals {
  if (!visualsComplete(v)) return false;
  if (v.cols !== map.cols || v.rows !== map.rows) return false;
  for (let i = 0; i < map.solid.length; i++) {
    if (map.solid[i] && !v.ground[i] && !v.below[i]) return false;
  }
  return true;
}
