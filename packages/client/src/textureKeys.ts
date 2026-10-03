import type { MapId, SpotType } from '@pfandraiders/core';
import type { PlayerFrame } from './sprites/characters';
import type { TileKey } from './tiles';

/** Kachelsatz einer Karte; Kacheln, Spots und Objekte tragen ihn als Präfix, Figuren nicht. */
export type TilesetId = MapId;

export const tileTexture = (set: TilesetId, key: TileKey): string => `${set}:tile:${key}`;
export const spotTexture = (set: TilesetId, type: SpotType, full: boolean): string =>
  `${set}:spot:${type}:${full ? 'full' : 'empty'}`;
export const objectTexture = (set: TilesetId, name: 'dropoff' | 'shop'): string => `${set}:object:${name}`;
/** Gebackenes Kartenbild einer Karte: ground-below (Boden + Details) oder above (Baumkronen). */
export const mapTexture = (map: MapId, layer: 'ground-below' | 'above'): string => `map:${map}:${layer}`;
export const playerTexture = (color: number, frame: PlayerFrame): string =>
  `player:${color.toString(16).padStart(6, '0')}:${frame}`;
export const dogTexture = (f: 'a' | 'b'): string => `dog:${f}`;
export const policeTexture = (f: 'a' | 'b'): string => `police:${f}`;
