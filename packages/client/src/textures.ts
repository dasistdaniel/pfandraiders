import Phaser from 'phaser';
import type { SpotType } from '@pfandraiders/core';
import { decodeSprite, type Decoded } from './pixelart';
import { DOG_SPRITES, PLAYER_SPRITES, POLICE_SPRITES, type PlayerFrame } from './sprites/characters';
import { OBJECT_SPRITES, SPOT_SPRITES, TILE_SPRITES } from './sprites/tiles';
import { dogTexture, objectTexture, playerTexture, policeTexture, spotTexture, tileTexture } from './textureKeys';
import type { TileKey } from './tiles';
import { CELL, KENNEY_BOTTLES, KENNEY_OBJECTS, KENNEY_SPOTS, KENNEY_TILES, type Cell } from './kenneyMap';

export const SHEET_KEY = 'kenney-city';

function sheetImage(scene: Phaser.Scene): CanvasImageSource | null {
  if (!scene.textures.exists(SHEET_KEY)) return null;
  return scene.textures.get(SHEET_KEY).getSourceImage() as CanvasImageSource;
}

/** Schneidet eine 16x16-Zelle 1:1 (ohne Glättung) in eine eigene Textur. Gibt es die Textur schon, passiert nichts. */
function bakeFromSheet(scene: Phaser.Scene, key: string, cell: Cell, overlays: { cell: Cell; size: number; at: number }[] = [], base?: Cell): void {
  const img = sheetImage(scene);
  if (!img || scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, CELL, CELL);
  if (!tex) return;
  const ctx = tex.getContext();
  ctx.imageSmoothingEnabled = false;
  const draw = (c: Cell, size: number, at: number) =>
    ctx.drawImage(img, c.col * CELL, c.row * CELL, CELL, CELL, at, at, size, size);
  if (base) draw(base, CELL, 0);
  draw(cell, CELL, 0);
  for (const o of overlays) draw(o.cell, o.size, o.at);
  tex.refresh();
}

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
  if (sheetImage(scene)) {
    for (const [key, cell] of Object.entries(KENNEY_TILES) as [TileKey, Cell][]) {
      bakeFromSheet(scene, tileTexture(key), cell);
    }
    for (const [type, cell] of Object.entries(KENNEY_SPOTS) as [SpotType, Cell][]) {
      const floor = KENNEY_TILES.floor_0;
      bakeFromSheet(scene, spotTexture(type, false), cell, [], floor);
      bakeFromSheet(scene, spotTexture(type, true), cell, [{ cell: KENNEY_BOTTLES, size: 10, at: 5 }], floor);
    }
    bakeFromSheet(scene, objectTexture('dropoff'), KENNEY_OBJECTS.dropoff);
    bakeFromSheet(scene, objectTexture('shop'), KENNEY_OBJECTS.shop);
  } else {
    for (const [key, rows] of Object.entries(TILE_SPRITES)) {
      bake(scene, tileTexture(key as TileKey), decodeSprite(rows));
    }
    for (const [type, sprites] of Object.entries(SPOT_SPRITES) as [SpotType, (typeof SPOT_SPRITES)[SpotType]][]) {
      bake(scene, spotTexture(type, true), decodeSprite(sprites.full));
      bake(scene, spotTexture(type, false), decodeSprite(sprites.empty));
    }
    bake(scene, objectTexture('dropoff'), decodeSprite(OBJECT_SPRITES.dropoff));
    bake(scene, objectTexture('shop'), decodeSprite(OBJECT_SPRITES.shop));
  }
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
