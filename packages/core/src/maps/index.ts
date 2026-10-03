import type { MapData } from '../types';
import type { MapVisuals } from '../tiled';
import { CITY_TILED_MAP } from './city';
import { RETRO_MAP } from './retro';

/** Kennung einer spielbaren Karte. */
export type MapId = 'city' | 'retro';

export interface MapDef {
  id: MapId;
  name: string;
  /** Welcher Kachelsatz die Karte zeichnet (der Client wählt danach die Grafik). */
  tileset: MapId;
  map: MapData;
  /** Grafikebenen aus der Tiled-Datei; `null` = der Client zeichnet die Karte aus den Kacheltypen. */
  visuals: MapVisuals | null;
}

const MAP_IDS: readonly string[] = ['city', 'retro'];

export function isMapId(v: unknown): v is MapId {
  return typeof v === 'string' && MAP_IDS.includes(v);
}

/** Grafikebenen je Karte (Task 4 trägt die der Stadt ein). */
export const MAP_VISUALS: Record<MapId, MapVisuals | null> = {
  city: null,
  retro: null,
};

export const MAP_DEFS: Record<MapId, MapDef> = {
  city: { id: 'city', name: 'Stadt', tileset: 'city', map: CITY_TILED_MAP, visuals: MAP_VISUALS.city },
  retro: { id: 'retro', name: 'Retro', tileset: 'retro', map: RETRO_MAP, visuals: MAP_VISUALS.retro },
};

export const DEFAULT_MAP_ID: MapId = 'city';

/** Die Standardkarte (`MAP_DEFS[DEFAULT_MAP_ID].map`). */
export const CITY_MAP: MapData = MAP_DEFS[DEFAULT_MAP_ID].map;

export { CITY_TILED_MAP } from './city';
export { RETRO_MAP, RETRO_ASCII_MAP } from './retro';
