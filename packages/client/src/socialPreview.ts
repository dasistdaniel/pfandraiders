/**
 * Vorschaubild für Link-Vorschauen (WhatsApp, Facebook, Discord …) und das Apple-Touch-Icon als reines RGB-Raster,
 * ohne Phaser und ohne Node. Das Logo kommt aus logo.ts (Einheitenraster, scharf hochskaliert), der Text aus einer
 * eingebauten 5x7-Pixelschrift, die Flaschen sind kleine Pixelbilder in den Farben der Flaschen-Symbole im HUD.
 * scripts/generate-social-preview.mjs packt die Raster als PNG (npm run social).
 */
import { GLYPHS, LETTER_GAP, LOGO_COLORS, buildFavicon, buildLogo } from './logo';
import type { LogoGeometry, Point } from './logo';

export const SOCIAL_W = 1200;
export const SOCIAL_H = 630;
export const TOUCH_ICON_SIZE = 180;

export const SOCIAL_BG = '#111111';
export const SOCIAL_TAGLINE = 'PFAND SAMMELN. SCHLAG ZU. GEWINNE.';
export const SOCIAL_SUBLINE = 'LOKAL BIS 4 - ONLINE BIS 8';

/** Ein Bild: Breite, Höhe und je Pixel drei Bytes (R, G, B), zeilenweise. */
export interface RgbImage {
  width: number;
  height: number;
  data: Uint8Array;
}

/** 5x7-Pixelschrift für Großbuchstaben, Ziffern und etwas Satzzeichen (Logo-Glyphen eingeschlossen). */
export const FONT: Readonly<Record<string, readonly string[]>> = {
  ...GLYPHS,
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  '.': ['0', '0', '0', '0', '0', '0', '1'],
  '!': ['1', '1', '1', '1', '1', '0', '1'],
  ':': ['0', '0', '1', '0', '0', '1', '0'],
  '-': ['000', '000', '000', '111', '000', '000', '000'],
  ' ': ['00', '00', '00', '00', '00', '00', '00'],
};

function fontGlyph(ch: string): readonly string[] {
  const g = FONT[ch];
  if (!g) throw new Error(`Kein Glyph für ${JSON.stringify(ch)}`);
  return g;
}

/** Breite eines Textes in Schriftpixeln. */
export function textWidth(text: string): number {
  let w = 0;
  for (const ch of text) w += fontGlyph(ch)[0].length + LETTER_GAP;
  return Math.max(0, w - LETTER_GAP);
}

type Rgb = readonly [number, number, number];

export function hexRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

class Canvas implements RgbImage {
  readonly data: Uint8Array;
  constructor(
    readonly width: number,
    readonly height: number,
    bg: Rgb,
  ) {
    this.data = new Uint8Array(width * height * 3);
    this.rect(0, 0, width, height, bg);
  }
  rect(x: number, y: number, w: number, h: number, c: Rgb): void {
    const x0 = Math.max(0, Math.round(x));
    const y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(this.width, Math.round(x + w));
    const y1 = Math.min(this.height, Math.round(y + h));
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        const i = (py * this.width + px) * 3;
        this.data[i] = c[0];
        this.data[i + 1] = c[1];
        this.data[i + 2] = c[2];
      }
    }
  }
  /** Polygon füllen: Pixel, deren Mitte innen liegt. */
  polygon(points: readonly Point[], c: Rgb): void {
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const x0 = Math.max(0, Math.floor(Math.min(...xs)));
    const x1 = Math.min(this.width, Math.ceil(Math.max(...xs)));
    const y0 = Math.max(0, Math.floor(Math.min(...ys)));
    const y1 = Math.min(this.height, Math.ceil(Math.max(...ys)));
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) if (inPolygon(px + 0.5, py + 0.5, points)) this.rect(px, py, 1, 1, c);
    }
  }
  /** Text in der Pixelschrift, `scale` Bildpixel je Schriftpixel, linke obere Ecke (x, y). */
  text(text: string, x: number, y: number, scale: number, c: Rgb, shadow?: Rgb): void {
    if (shadow) this.text(text, x + scale, y + scale, scale, shadow);
    let cx = x;
    for (const ch of text) {
      const g = fontGlyph(ch);
      g.forEach((row, gy) =>
        [...row].forEach((bit, gx) => {
          if (bit === '1') this.rect(cx + gx * scale, y + gy * scale, scale, scale, c);
        }),
      );
      cx += (g[0].length + LETTER_GAP) * scale;
    }
  }
  /** Kleines Pixelbild: jedes Zeichen eine Zelle, Farbe aus der Palette, '.' durchsichtig. */
  sprite(rows: readonly string[], x: number, y: number, scale: number, palette: Readonly<Record<string, Rgb>>): void {
    rows.forEach((row, sy) =>
      [...row].forEach((ch, sx) => {
        const c = palette[ch];
        if (c) this.rect(x + sx * scale, y + sy * scale, scale, scale, c);
      }),
    );
  }
  /** Logo-Geometrie mit `unit` Bildpixeln je Einheit an (x, y): Streifen, darüber Kontur und Füllung. */
  logo(geo: LogoGeometry, x: number, y: number, unit: number, stripes = geo.stripes): void {
    for (const s of stripes) {
      this.polygon(
        s.points.map(([px, py]) => [x + px * unit, y + py * unit] as const),
        hexRgb(s.color),
      );
    }
    const fill = hexRgb(LOGO_COLORS.cream);
    const outline = hexRgb(LOGO_COLORS.dark);
    for (const p of geo.pixels) this.rect(x + p.x * unit, y + p.y * unit, unit, unit, p.kind === 'fill' ? fill : outline);
  }
}

function inPolygon(px: number, py: number, poly: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Plastikflasche, Glasflasche und Kasten als Pixelbilder (Farben wie die Flaschen-Symbole im HUD). */
const BOTTLES: readonly { rows: readonly string[]; palette: Record<string, Rgb> }[] = [
  {
    rows: ['.cc.', '.bb.', '.bb.', 'bbbb', 'bhbb', 'bhbb', 'bbbb', 'bhbb', 'bbbb', 'bbbb'],
    palette: { c: hexRgb('#e0e0e0'), b: hexRgb('#42a5f5'), h: hexRgb('#90caf9') },
  },
  {
    rows: ['.cc.', '.gg.', '.gg.', '.gg.', 'gggg', 'ghgg', 'gwwg', 'gwwg', 'gggg', 'gggg'],
    palette: { c: hexRgb('#ffca28'), g: hexRgb('#66bb6a'), h: hexRgb('#a5d6a7'), w: hexRgb('#fff6d6') },
  },
  {
    rows: ['........', '.g.g.g..', '.g.g.g..', 'kkkkkkkk', 'kbkkkkbk', 'kkkkkkkk', 'kkkddkkk', 'kkkkkkkk', 'kbkkkkbk', 'kkkkkkkk'],
    palette: { k: hexRgb('#8d6e63'), b: hexRgb('#6d4c41'), d: hexRgb('#3e2723'), g: hexRgb('#66bb6a') },
  },
];

export interface SocialLayout {
  logoUnit: number;
  logoX: number;
  logoY: number;
  taglineScale: number;
  taglineX: number;
  taglineY: number;
  sublineScale: number;
  sublineX: number;
  sublineY: number;
}

/** Lage der Teile im 1200x630-Bild: alles waagrecht mittig. */
export function socialLayout(): SocialLayout {
  const geo = buildLogo();
  const logoUnit = 13;
  const taglineScale = 5;
  const sublineScale = 4;
  return {
    logoUnit,
    logoX: Math.round((SOCIAL_W - geo.width * logoUnit) / 2),
    logoY: 40,
    taglineScale,
    taglineX: Math.round((SOCIAL_W - textWidth(SOCIAL_TAGLINE) * taglineScale) / 2),
    taglineY: 380,
    sublineScale,
    sublineX: Math.round((SOCIAL_W - textWidth(SOCIAL_SUBLINE) * sublineScale) / 2),
    sublineY: 450,
  };
}

/** Das Vorschaubild 1200x630. Deterministisch: gleiche Eingaben, gleiche Bytes. */
export function renderSocialPreview(): RgbImage {
  const c = new Canvas(SOCIAL_W, SOCIAL_H, hexRgb(SOCIAL_BG));
  const L = socialLayout();
  const geo = buildLogo();
  c.logo(geo, L.logoX, L.logoY, L.logoUnit);
  c.text(SOCIAL_TAGLINE, L.taglineX, L.taglineY, L.taglineScale, hexRgb(LOGO_COLORS.cream), hexRgb('#000000'));
  c.text(SOCIAL_SUBLINE, L.sublineX, L.sublineY, L.sublineScale, hexRgb(LOGO_COLORS.yellow));
  // Flaschenreihe unten: abwechselnd Plastik, Glas, Kasten, mittig
  const scale = 6;
  const count = 13;
  const gap = 30;
  const widths = Array.from({ length: count }, (_, i) => BOTTLES[i % 3].rows[0].length * scale);
  const total = widths.reduce((a, b) => a + b, 0) + gap * (count - 1);
  let x = Math.round((SOCIAL_W - total) / 2);
  const base = 592;
  for (let i = 0; i < count; i++) {
    const b = BOTTLES[i % 3];
    c.sprite(b.rows, x, base - b.rows.length * scale, scale, b.palette);
    x += widths[i] + gap;
  }
  return c;
}

/** Apple-Touch-Icon 180x180: das Favicon (32 Einheiten zu 5 px) mittig auf dunklem Grund. */
export function renderTouchIcon(): RgbImage {
  const c = new Canvas(TOUCH_ICON_SIZE, TOUCH_ICON_SIZE, hexRgb(LOGO_COLORS.dark));
  const geo = buildFavicon();
  const unit = 5;
  const off = (TOUCH_ICON_SIZE - geo.width * unit) / 2;
  c.logo(geo, off, off, unit);
  return c;
}
