import type { MapVisuals } from '../tiled';
import type { MapData } from '../types';
import type { TilesetId } from './mapIds';

/** Kennung einer spielbaren Karte: eingebaut (city, retro) oder eigene Karte (Dateiname). Gültig ist nur, was isMapId kennt. */
export type MapId = string;

export interface MapDef {
  id: MapId;
  name: string;
  /** Welcher Kachelsatz die Karte zeichnet (der Client wählt danach die Grafik). */
  tileset: TilesetId;
  map: MapData;
  /** Grafikebenen aus der Tiled-Datei; `null` = der Client zeichnet die Karte aus den Kacheltypen. */
  visuals: MapVisuals | null;
  /** Eingebaute Karte (Regeln BUILTIN_MAP_RULES) oder eigene aus `custom/` (CUSTOM_MAP_RULES) */
  builtin: boolean;
}

/** Eine eigene Karte aus `packages/core/src/maps/custom/` (die Liste erzeugt `npm run maps`). */
export interface CustomMapSource {
  id: string;
  file: string;
  json: unknown;
}
