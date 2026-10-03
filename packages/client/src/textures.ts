import Phaser from 'phaser';
import type { SpotType } from '@pfandraiders/core';
import { decodeSprite, type Decoded } from './pixelart';
import { DOG_SPRITES, PLAYER_SPRITES, POLICE_SPRITES, type PlayerFrame } from './sprites/characters';
import { OBJECT_SPRITES, SPOT_SPRITES, TILE_SPRITES } from './sprites/tiles';
import { dogTexture, objectTexture, playerTexture, policeTexture, spotTexture, tileTexture } from './textureKeys';
import type { TileKey } from './tiles';

function bake(scene: Phaser.Scene, key: string, d: Decoded): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, d.w, d.h);
  if (!tex) return;
  const ctx = tex.getContext();
  for (let y = 0; y < d.h; y++) {
    for (let x = 0; x < d.w; x++) {
      const c = d.px[y * d.w + x];
      if (c === null) continue;
      ctx.fillStyle = `#${c.toString(16).padStart(6, '0')}`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  tex.refresh();
}

export function bakeStaticTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists(tileTexture('floor_0'))) return;
  for (const [key, rows] of Object.entries(TILE_SPRITES)) {
    bake(scene, tileTexture(key as TileKey), decodeSprite(rows));
  }
  for (const [type, sprites] of Object.entries(SPOT_SPRITES) as [SpotType, (typeof SPOT_SPRITES)[SpotType]][]) {
    bake(scene, spotTexture(type, true), decodeSprite(sprites.full));
    bake(scene, spotTexture(type, false), decodeSprite(sprites.empty));
  }
  bake(scene, objectTexture('dropoff'), decodeSprite(OBJECT_SPRITES.dropoff));
  bake(scene, objectTexture('shop'), decodeSprite(OBJECT_SPRITES.shop));
  for (const f of ['a', 'b'] as const) {
    bake(scene, dogTexture(f), decodeSprite(DOG_SPRITES[f]));
    bake(scene, policeTexture(f), decodeSprite(POLICE_SPRITES[f]));
  }
}

export function ensurePlayerTextures(scene: Phaser.Scene, color: number): void {
  for (const frame of Object.keys(PLAYER_SPRITES) as PlayerFrame[]) {
    bake(scene, playerTexture(color, frame), decodeSprite(PLAYER_SPRITES[frame], color));
  }
}
