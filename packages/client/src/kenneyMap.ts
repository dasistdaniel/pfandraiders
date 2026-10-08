import type { SpotType } from '@pfandraiders/core';
import type { TileKey } from './tiles';

/** Reine Daten, frei von Phaser: Zuordnung der Spielschlüssel zu Zellen im Kenney-Sheet (Roguelike Modern City, CC0). */
export const SHEET_COLS = 37;
export const SHEET_ROWS = 28;
export const CELL = 16;

export interface Cell {
  col: number;
  row: number;
}

export function cellInBounds(c: Cell): boolean {
  return (
    Number.isInteger(c.col) && Number.isInteger(c.row) &&
    c.col >= 0 && c.col < SHEET_COLS && c.row >= 0 && c.row < SHEET_ROWS
  );
}

/** Startvorschlag, wird nach Sichtprüfung nachgebessert. */
export const KENNEY_TILES: Record<TileKey, Cell> = {
  floor_0: { col: 2, row: 24 },
  floor_1: { col: 3, row: 24 },
  floor_2: { col: 2, row: 24 },
  wall_top_0: { col: 4, row: 0 },
  wall_top_1: { col: 6, row: 0 },
  wall_top_2: { col: 7, row: 0 },
  wall_front: { col: 1, row: 7 },
};

export const KENNEY_OBJECTS: { dropoff: Cell } = {
  dropoff: { col: 24, row: 8 },
};

export const KENNEY_SPOTS: Record<SpotType, Cell> = {
  bus_stop: { col: 10, row: 14 },
  bench: { col: 16, row: 16 },
  bush: { col: 33, row: 13 },
  bin: { col: 13, row: 14 },
  park: { col: 33, row: 12 },
};

export const KENNEY_BOTTLES: Cell = { col: 29, row: 7 };
