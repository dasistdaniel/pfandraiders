import { parseTiledMap, parseTiledVisuals } from '../tiled';
import type { MapVisuals } from '../tiled';
import cityJson from './city.tiled.json';

/** Die Stadt (64 x 40), geladen aus `city.tiled.json` (erzeugt aus `cityPlan.ts`, siehe scripts/generateCity.ts). */
export const CITY_TILED_MAP = parseTiledMap(cityJson);

let cityVisuals: MapVisuals | null | undefined;

/** Grafikebenen der Stadt (ground, below, above) für den Client. Wird erst beim ersten Aufruf geparst und gemerkt, der Server liest sie nie. */
export function getCityVisuals(): MapVisuals | null {
  if (cityVisuals === undefined) cityVisuals = parseTiledVisuals(cityJson);
  return cityVisuals;
}
