import type { MapData } from '../types';
import { RETRO_MAP } from './retro';

/** Kennung einer spielbaren Karte. */
export type MapId = 'city' | 'retro';

export interface MapDef {
  id: MapId;
  name: string;
  /** Welcher Kachelsatz die Karte zeichnet (der Client wählt danach die Grafik). */
  tileset: MapId;
  map: MapData;
}

const MAP_IDS: readonly string[] = ['city', 'retro'];

export function isMapId(v: unknown): v is MapId {
  return typeof v === 'string' && MAP_IDS.includes(v);
}

export const MAP_DEFS: Record<MapId, MapDef> = {
  // Platzhalter bis Task 3: die Stadt nutzt vorerst die Daten der Retro-Karte.
  city: { id: 'city', name: 'Stadt', tileset: 'city', map: RETRO_MAP },
  retro: { id: 'retro', name: 'Retro', tileset: 'retro', map: RETRO_MAP },
};

export const DEFAULT_MAP_ID: MapId = 'city';

/** Die Standardkarte (`MAP_DEFS[DEFAULT_MAP_ID].map`). */
export const CITY_MAP: MapData = MAP_DEFS[DEFAULT_MAP_ID].map;

export { RETRO_MAP, RETRO_ASCII_MAP } from './retro';
