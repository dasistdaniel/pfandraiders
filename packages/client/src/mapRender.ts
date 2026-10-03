import { SHEET_CELLS, SHEET_COLS } from '@pfandraiders/core';
import type { MapVisuals } from '@pfandraiders/core';

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
