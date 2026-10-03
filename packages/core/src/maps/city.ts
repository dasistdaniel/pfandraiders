import { parseTiledMap, parseTiledVisuals } from '../tiled';
import cityJson from './city.tiled.json';

/** Die Stadt (64 x 40), geladen aus `city.tiled.json` (erzeugt aus `cityPlan.ts`, siehe scripts/generateCity.ts). */
export const CITY_TILED_MAP = parseTiledMap(cityJson);

/** Grafikebenen der Stadt (ground, below, above) für den Client; der Server braucht sie nicht. */
export const CITY_VISUALS = parseTiledVisuals(cityJson);
