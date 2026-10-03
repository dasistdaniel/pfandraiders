import { parseMap } from '../map';
import { parseTiledMap } from '../tiled';
import retroJson from './retro.tiled.json';
import { RETRO_ROWS, RETRO_ZONES } from './retro-ascii';

/** Die Retro-Karte, geladen aus `retro.tiled.json` (erzeugt aus `retro-ascii.ts`, siehe scripts/asciiToTiled.ts). */
export const RETRO_MAP = parseTiledMap(retroJson);
/** Dieselbe Karte direkt aus ASCII, nur als Referenz für den Paritätstest. */
export const RETRO_ASCII_MAP = parseMap(RETRO_ROWS, RETRO_ZONES);
