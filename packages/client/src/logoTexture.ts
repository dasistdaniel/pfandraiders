import Phaser from 'phaser';
import { GAME_W } from './layout';
import { COLOR_LOGO, buildLogo } from './logo';
import type { PixelKind } from './logo';

export const LOGO_TEXTURE = 'logo';
/** Bildpixel je Logo-Einheit: 60 x 23 Einheiten ergeben 480 x 184 px. */
export const LOGO_PX = 8;

/** Backt das Logo einmalig als Canvas-Textur und gibt den Schlüssel zurück. */
export function ensureLogoTexture(scene: Phaser.Scene): string {
  if (scene.textures.exists(LOGO_TEXTURE)) return LOGO_TEXTURE;
  const geo = buildLogo();
  const tex = scene.textures.createCanvas(LOGO_TEXTURE, geo.width * LOGO_PX, geo.height * LOGO_PX);
  if (!tex) return LOGO_TEXTURE;
  const ctx = tex.getContext();
  for (const s of geo.stripes) {
    ctx.fillStyle = s.color;
    ctx.beginPath();
    s.points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x * LOGO_PX, y * LOGO_PX) : ctx.lineTo(x * LOGO_PX, y * LOGO_PX)));
    ctx.closePath();
    ctx.fill();
  }
  // Raster Zelle für Zelle: erst die Streifen, darüber Kontur und Füllung (decken sich nicht)
  const colors: Record<PixelKind, string> = { outline: COLOR_LOGO.outline, fill: COLOR_LOGO.fill };
  for (const p of geo.pixels) {
    ctx.fillStyle = colors[p.kind];
    ctx.fillRect(p.x * LOGO_PX, p.y * LOGO_PX, LOGO_PX, LOGO_PX);
  }
  tex.refresh();
  return LOGO_TEXTURE;
}

/** Logo oben mittig; scale 1 auf der Hauptseite, 0.5 auf Unterseiten. */
export function addLogo(scene: Phaser.Scene, y = 12, scale = 1): Phaser.GameObjects.Image {
  return scene.add.image(GAME_W / 2, y, ensureLogoTexture(scene)).setOrigin(0.5, 0).setScale(scale);
}
