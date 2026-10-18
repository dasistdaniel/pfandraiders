import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { SOCIAL_PREVIEW, escapeHtml, socialImageUrl } from '@pfandraiders/core';
import { describe, expect, it } from 'vitest';
import {
  FONT,
  SOCIAL_SUBLINE,
  SOCIAL_TAGLINE,
  SOCIAL_W,
  renderSocialPreview,
  renderTouchIcon,
  socialLayout,
  textWidth,
} from '../src/socialPreview';
import type { RgbImage } from '../src/socialPreview';
import { buildLogo } from '../src/logo';

const clientFile = (rel: string): Buffer => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)));

/** Liest unser eigenes PNG-Format (RGB 8 Bit, ein IDAT, Filter 0) zurück. */
function readPng(buf: Buffer): RgbImage & { colorType: number; bitDepth: number } {
  expect([...buf.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  expect(buf.toString('ascii', 12, 16)).toBe('IHDR');
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const bitDepth = buf[24];
  const colorType = buf[25];
  const idat: Buffer[] = [];
  let pos = 8;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    if (type === 'IDAT') idat.push(buf.subarray(pos + 8, pos + 8 + len));
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const data = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    expect(raw[y * (width * 3 + 1)]).toBe(0);
    data.set(raw.subarray(y * (width * 3 + 1) + 1, (y + 1) * (width * 3 + 1)), y * width * 3);
  }
  return { width, height, data, colorType, bitDepth };
}

describe('social-preview.png', () => {
  const buf = clientFile('public/social-preview.png');

  it('ist ein PNG mit 1200x630 und unter 300 KB', () => {
    const png = readPng(buf);
    expect(png.width).toBe(1200);
    expect(png.height).toBe(630);
    expect(png.bitDepth).toBe(8);
    expect(png.colorType).toBe(2);
    expect(buf.length).toBeLessThan(300 * 1024);
  });

  it('ist auf dem Stand des Generators (sonst npm run social)', () => {
    const png = readPng(buf);
    const img = renderSocialPreview();
    expect(Buffer.from(png.data).equals(Buffer.from(img.data))).toBe(true);
  });
});

describe('apple-touch-icon.png', () => {
  it('ist ein 180x180-PNG auf dem Stand des Generators', () => {
    const buf = clientFile('public/apple-touch-icon.png');
    const png = readPng(buf);
    expect(png.width).toBe(180);
    expect(png.height).toBe(180);
    expect(Buffer.from(png.data).equals(Buffer.from(renderTouchIcon().data))).toBe(true);
    expect(buf.length).toBeLessThan(20 * 1024);
  });
});

describe('renderSocialPreview', () => {
  it('ist deterministisch', () => {
    expect(Buffer.from(renderSocialPreview().data).equals(Buffer.from(renderSocialPreview().data))).toBe(true);
  });

  it('hat dunkle Ecken (#111)', () => {
    const img = renderSocialPreview();
    for (const [x, y] of [
      [0, 0],
      [1199, 0],
      [0, 629],
      [1199, 629],
    ]) {
      const i = (y * img.width + x) * 3;
      expect([...img.data.subarray(i, i + 3)]).toEqual([0x11, 0x11, 0x11]);
    }
  });

  it('legt Logo und Texte waagrecht mittig und ganz ins Bild', () => {
    const L = socialLayout();
    const logoW = buildLogo().width * L.logoUnit;
    expect(Math.abs(L.logoX * 2 + logoW - SOCIAL_W)).toBeLessThanOrEqual(1);
    const tagW = textWidth(SOCIAL_TAGLINE) * L.taglineScale;
    expect(L.taglineX).toBeGreaterThanOrEqual(40);
    expect(Math.abs(L.taglineX * 2 + tagW - SOCIAL_W)).toBeLessThanOrEqual(1);
    expect(L.sublineX).toBeGreaterThanOrEqual(40);
    // lesbar auch auf 300 px Breite: mindestens 5 Bildpixel je Schriftpixel
    expect(L.taglineScale).toBeGreaterThanOrEqual(5);
  });

  it('kennt jedes Zeichen der Texte, alle Glyphen 7 Zeilen hoch und gleich breit', () => {
    for (const ch of SOCIAL_TAGLINE + SOCIAL_SUBLINE) expect(FONT[ch], ch).toBeDefined();
    for (const [ch, g] of Object.entries(FONT)) {
      expect(g, ch).toHaveLength(7);
      for (const row of g) expect(row.length, ch).toBe(g[0].length);
    }
  });
});

describe('index.html', () => {
  const html = clientFile('index.html').toString('utf8');
  const meta = (attr: string, key: string): string | undefined =>
    new RegExp(`<meta ${attr}="${key.replace(/[.:]/g, '\\$&')}" content="([^"]*)"`).exec(html)?.[1];

  it('trägt dieselben Vorschau-Tags wie SOCIAL_PREVIEW', () => {
    const s = SOCIAL_PREVIEW;
    const expected: [string, string, string][] = [
      ['name', 'description', s.description],
      ['property', 'og:type', 'website'],
      ['property', 'og:site_name', s.siteName],
      ['property', 'og:locale', s.locale],
      ['property', 'og:url', s.pageUrl],
      ['property', 'og:title', s.title],
      ['property', 'og:description', s.description],
      ['property', 'og:image', socialImageUrl(s.pageUrl)],
      ['property', 'og:image:type', 'image/png'],
      ['property', 'og:image:width', String(s.imageWidth)],
      ['property', 'og:image:height', String(s.imageHeight)],
      ['property', 'og:image:alt', s.imageAlt],
      ['name', 'twitter:card', 'summary_large_image'],
      ['name', 'twitter:title', s.title],
      ['name', 'twitter:description', s.description],
      ['name', 'twitter:image', socialImageUrl(s.pageUrl)],
      ['name', 'theme-color', '#111'],
    ];
    for (const [attr, key, value] of expected) expect(meta(attr, key), key).toBe(escapeHtml(value));
    expect(html).toContain(`<title>${escapeHtml(s.title)}</title>`);
  });

  it('nutzt absolute Adressen nur unterhalb der Spielseite und verweist auf vorhandene Bilder', () => {
    const urls = [...html.matchAll(/content="(https?:[^"]*)"/g)].map((m) => m[1]);
    expect(urls.length).toBeGreaterThanOrEqual(3);
    for (const u of urls) expect(u.startsWith(SOCIAL_PREVIEW.pageUrl), u).toBe(true);
    expect(html).toContain('<link rel="apple-touch-icon" href="./apple-touch-icon.png" />');
    expect(clientFile(`public/${SOCIAL_PREVIEW.image}`).length).toBeGreaterThan(0);
  });
});
