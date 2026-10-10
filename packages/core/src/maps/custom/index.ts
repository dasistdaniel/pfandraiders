// Erzeugt von `npm run maps` (packages/core/scripts/generateCustomMaps.ts). Nicht von Hand ändern.
import type { CustomMapSource } from '../mapDef';
import map_uebung from './uebung.tiled.json';

export const CUSTOM_MAP_SOURCES: readonly CustomMapSource[] = [
  { id: 'uebung', file: 'uebung.tiled.json', json: map_uebung },
];
