import { parseMap } from '../map';
import { parseTiledMap } from '../tiled';
import cityJson from './city.tiled.json';
import { CITY_ROWS, CITY_ZONES } from './city-ascii';

/** Die Stadt, geladen aus `city.tiled.json` (erzeugt aus `city-ascii.ts`, siehe scripts/asciiToTiled.ts). */
export const CITY_MAP = parseTiledMap(cityJson);
/** Dieselbe Karte direkt aus ASCII, nur als Referenz für den Paritätstest. */
export const CITY_ASCII_MAP = parseMap(CITY_ROWS, CITY_ZONES);
