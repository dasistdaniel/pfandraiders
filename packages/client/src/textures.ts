import Phaser from 'phaser';
import { MAP_DEFS } from '@pfandraiders/core';
import type { MapData, MapId, MapVisuals, SpotType } from '@pfandraiders/core';
import { decodeSprite, type Decoded } from './pixelart';
import { DOG_SPRITES, PLAYER_SPRITES, POLICE_SPRITES, type PlayerFrame } from './sprites/characters';
import { OBJECT_SPRITES, SPOT_SPRITES, TILE_SPRITES } from './sprites/tiles';
import { dogTexture, mapTexture, objectTexture, playerTexture, policeTexture, spotTexture, tileTexture } from './textureKeys';
import type { TilesetId } from './textureKeys';
import { cellRect, visualsMatchMap } from './mapRender';
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

/** Der gezeichnete Satz (ohne Kenney-Bogen): immer für retro, für city nur als Rückfall. */
function bakeDrawnSet(scene: Phaser.Scene, set: TilesetId): void {
  for (const [key, rows] of Object.entries(TILE_SPRITES)) {
    bake(scene, tileTexture(set, key as TileKey), decodeSprite(rows));
  }
  for (const [type, sprites] of Object.entries(SPOT_SPRITES) as [SpotType, (typeof SPOT_SPRITES)[SpotType]][]) {
    bake(scene, spotTexture(set, type, true), decodeSprite(sprites.full));
    bake(scene, spotTexture(set, type, false), decodeSprite(sprites.empty));
  }
  bake(scene, objectTexture(set, 'dropoff'), decodeSprite(OBJECT_SPRITES.dropoff));
}

/** Der Kenney-Satz der Stadt (setzt den geladenen Bogen voraus). */
function bakeCitySet(scene: Phaser.Scene): void {
  for (const [key, cell] of Object.entries(KENNEY_TILES) as [TileKey, Cell][]) {
    bakeFromSheet(scene, tileTexture('city', key), cell);
  }
  for (const [type, cell] of Object.entries(KENNEY_SPOTS) as [SpotType, Cell][]) {
    const floor = KENNEY_TILES.floor_0;
    bakeFromSheet(scene, spotTexture('city', type, false), cell, [], floor);
    bakeFromSheet(scene, spotTexture('city', type, true), cell, [{ cell: KENNEY_BOTTLES, size: 10, at: 5 }], floor);
  }
  bakeFromSheet(scene, objectTexture('city', 'dropoff'), KENNEY_OBJECTS.dropoff);
}

export function bakeStaticTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists(tileTexture('retro', 'floor_0'))) return;
  bakeDrawnSet(scene, 'retro');
  if (sheetImage(scene)) bakeCitySet(scene);
  else bakeDrawnSet(scene, 'city');
  for (const f of ['a', 'b'] as const) {
    bake(scene, dogTexture(f), decodeSprite(DOG_SPRITES[f]));
    bake(scene, policeTexture(f), decodeSprite(POLICE_SPRITES[f]));
  }
}

const FLAT_FLOOR = '#5a5a5a';
const FLAT_WALL = '#7a1f1f';

/** Rückfall ohne passende Grafikebenen oder Bogen: einfarbige Karte aus solid (Boden grau, Wand dunkelrot). */
function bakeFlatMap(scene: Phaser.Scene, mapId: MapId, map: MapData): void {
  const key = mapTexture(mapId, 'ground-below');
  const tex = scene.textures.createCanvas(key, map.cols * CELL, map.rows * CELL);
  if (!tex) {
    console.warn(`Kartenbild ${key} konnte nicht erzeugt werden`);
    return;
  }
  const ctx = tex.getContext();
  for (let r = 0; r < map.rows; r++) {
    for (let c = 0; c < map.cols; c++) {
      ctx.fillStyle = map.solid[r * map.cols + c] ? FLAT_WALL : FLAT_FLOOR;
      ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
    }
  }
  tex.refresh();
}

/**
 * Backt das Kartenbild der Stadt aus ihren Grafikebenen: ein Canvas je Bild, ein drawImage je Zelle.
 * map:<id>:ground-below (ground + below) und map:<id>:above. Passen Ebenen und Karte nicht zusammen, fehlen sie
 * oder der Bogen, entsteht nur ein einfarbiges ground-below aus solid (kein above). Existiert das Bild schon,
 * passiert nichts. Karten ohne Ebenen (retro) bekommen kein Bild und zeichnen pro Kachel.
 */
export function bakeMapLayers(scene: Phaser.Scene, mapId: MapId, map: MapData): void {
  const def = MAP_DEFS[mapId];
  if (def.tileset !== 'city') return;
  const groundKey = mapTexture(mapId, 'ground-below');
  const aboveKey = mapTexture(mapId, 'above');
  if (scene.textures.exists(groundKey)) return;
  let visuals: MapVisuals | null = null;
  try {
    visuals = def.visuals; // lazy, parseTiledVisuals kann werfen
  } catch (e) {
    console.warn('Grafikebenen der Karte nicht lesbar, zeichne einfarbige Karte', e);
  }
  const img = sheetImage(scene);
  if (!img || !visualsMatchMap(visuals, map)) {
    bakeFlatMap(scene, mapId, map);
    return;
  }
  const w = visuals.cols * CELL;
  const h = visuals.rows * CELL;
  const groundTex = scene.textures.createCanvas(groundKey, w, h);
  if (!groundTex) {
    console.warn(`Kartenbild ${groundKey} konnte nicht erzeugt werden`);
    return;
  }
  const aboveTex = scene.textures.createCanvas(aboveKey, w, h);
  if (!aboveTex) {
    // Nicht halb gebacken zurücklassen: das erste Bild wieder entfernen, dann Rückfall
    scene.textures.remove(groundKey);
    console.warn(`Kartenbild ${aboveKey} konnte nicht erzeugt werden`);
    bakeFlatMap(scene, mapId, map);
    return;
  }
  const paint = (tex: Phaser.Textures.CanvasTexture, layers: number[][]): void => {
    const ctx = tex.getContext();
    ctx.imageSmoothingEnabled = false;
    for (const layer of layers) {
      for (let i = 0; i < layer.length; i++) {
        const src = cellRect(layer[i]);
        if (!src) continue;
        const dx = (i % visuals.cols) * CELL;
        const dy = Math.floor(i / visuals.cols) * CELL;
        ctx.drawImage(img, src.col * CELL, src.row * CELL, CELL, CELL, dx, dy, CELL, CELL);
      }
    }
    tex.refresh();
  };
  paint(groundTex, [visuals.ground, visuals.below]);
  paint(aboveTex, [visuals.above]);
}

export function ensurePlayerTextures(scene: Phaser.Scene, color: number): void {
  for (const frame of Object.keys(PLAYER_SPRITES) as PlayerFrame[]) {
    bake(scene, playerTexture(color, frame), decodeSprite(PLAYER_SPRITES[frame], color));
  }
}
