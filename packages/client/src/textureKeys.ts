import type { SpotType } from '@pfandraiders/core';
import type { PlayerFrame } from './sprites/characters';
import type { TileKey } from './tiles';

export const tileTexture = (key: TileKey): string => `tile:${key}`;
export const spotTexture = (type: SpotType, full: boolean): string => `spot:${type}:${full ? 'full' : 'empty'}`;
export const objectTexture = (name: 'dropoff' | 'shop'): string => `object:${name}`;
export const playerTexture = (color: number, frame: PlayerFrame): string =>
  `player:${color.toString(16).padStart(6, '0')}:${frame}`;
export const dogTexture = (f: 'a' | 'b'): string => `dog:${f}`;
export const policeTexture = (f: 'a' | 'b'): string => `police:${f}`;
