import type { MapData } from '../types';
import type { MapVisuals } from '../tiled';
import cityJson from './city.tiled.json';
import retroJson from './retro.tiled.json';
import { CITY_TILED_MAP, getCityVisuals } from './city';
import { RETRO_MAP } from './retro';
import { CUSTOM_MAP_SOURCES } from './custom/index';
import { customMapDefs } from './customMaps';
import type { BuiltinMapId } from './mapIds';
import type { CustomMapSource, MapDef, MapId } from './mapDef';

export type { CustomMapSource, MapDef, MapId } from './mapDef';
export * from './mapIds';
export * from './validate';
export { customMapDef, customMapDefs, customMapIdProblem, mapProblemsText } from './customMaps';
export { CUSTOM_MAP_SOURCES } from './custom/index';

/** Eingebaute Karten in der Reihenfolge der Auswahl; city zuerst (Standard). Die Grafik der Stadt wird erst bei Bedarf geparst. */
const BUILTIN_DEFS: readonly MapDef[] = [
  {
    id: 'city',
    name: 'Stadt',
    tileset: 'city',
    map: CITY_TILED_MAP,
    builtin: true,
    get visuals() {
      return getCityVisuals();
    },
  },
  { id: 'retro', name: 'Retro', tileset: 'retro', map: RETRO_MAP, visuals: null, builtin: true },
];

/**
 * Kartenliste: eingebaute zuerst, dann die eigenen in der Reihenfolge der Quellen (`npm run maps` sortiert nach Kennung).
 * Eigene Karten werden dabei geprüft; eine ungültige wirft mit Dateiname und allen Problemen.
 */
export function buildRegistry(builtins: readonly MapDef[], customs: readonly CustomMapSource[]): MapDef[] {
  return [...builtins, ...customMapDefs(customs, builtins.map((d) => d.id))];
}

const ALL: readonly MapDef[] = buildRegistry(BUILTIN_DEFS, CUSTOM_MAP_SOURCES);

/** Karten nach Kennung. Ohne Prototyp ("__proto__", "constructor" sind keine Karten); nachschlagen erst nach isMapId. */
export const MAP_DEFS: Readonly<Record<MapId, MapDef>> = Object.freeze(
  ALL.reduce((acc, d) => {
    acc[d.id] = d;
    return acc;
  }, Object.create(null) as Record<MapId, MapDef>),
);

export interface MapListEntry {
  id: MapId;
  name: string;
}

/** Auswahlliste für Lobby und Raumliste: eingebaute Karten, dann eigene nach Kennung. */
export const MAP_LIST: readonly MapListEntry[] = Object.freeze(ALL.map((d) => Object.freeze({ id: d.id, name: d.name })));

const KNOWN: ReadonlySet<string> = new Set(ALL.map((d) => d.id));

export function isMapId(v: unknown): v is MapId {
  return typeof v === 'string' && KNOWN.has(v);
}

/** Anzeigename einer Karte; unbekannte Kennungen erscheinen so, wie sie sind. */
export function mapName(id: string): string {
  return isMapId(id) ? MAP_DEFS[id].name : id;
}

/** Nächste oder vorige Karte in MAP_LIST, zyklisch; eine unbekannte Kennung ergibt die erste Karte. */
export function stepMapId(id: string, dir: -1 | 1): MapId {
  const n = MAP_LIST.length;
  const i = MAP_LIST.findIndex((m) => m.id === id);
  if (i < 0) return MAP_LIST[0].id;
  return MAP_LIST[(i + dir + n) % n].id;
}

export const DEFAULT_MAP_ID: BuiltinMapId = 'city';

/** Grafikebenen der eingebauten Karten, lazy: erst der Zugriff auf city parst die Tiled-Ebenen. */
export const MAP_VISUALS: Readonly<Record<BuiltinMapId, MapVisuals | null>> = {
  get city() {
    return getCityVisuals();
  },
  retro: null,
};

/** Die Standardkarte (`MAP_DEFS[DEFAULT_MAP_ID].map`). */
export const CITY_MAP: MapData = MAP_DEFS[DEFAULT_MAP_ID].map;

/** Tiled-JSON jeder Karte in der Reihenfolge von MAP_LIST (für den Test über alle Karten). */
export const MAP_SOURCES: readonly { id: MapId; json: unknown }[] = [
  { id: 'city', json: cityJson },
  { id: 'retro', json: retroJson },
  ...CUSTOM_MAP_SOURCES.map((s) => ({ id: s.id, json: s.json })),
];

export { CITY_TILED_MAP, getCityVisuals } from './city';
export { RETRO_MAP, RETRO_ASCII_MAP } from './retro';
