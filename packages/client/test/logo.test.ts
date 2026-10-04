import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BLACK_LOGO,
  COLOR_LOGO,
  GLYPHS,
  GLYPH_H,
  STRIPE_COLORS,
  WHITE_LOGO,
  buildFavicon,
  buildLogo,
  faviconSvg,
  logoFiles,
  logoSvg,
} from '../src/logo';
import type { LogoGeometry, Point } from '../src/logo';

const repoFile = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(`../../../${rel}`, import.meta.url)), 'utf8');

function textBounds(geo: LogoGeometry, kind = 'fill', yFrom = 0, yTo = Infinity) {
  const px = geo.pixels.filter((p) => p.kind === kind && p.y >= yFrom && p.y < yTo);
  return {
    minX: Math.min(...px.map((p) => p.x)),
    maxX: Math.max(...px.map((p) => p.x)),
    minY: Math.min(...px.map((p) => p.y)),
    maxY: Math.max(...px.map((p) => p.y)),
  };
}

const sub = (a: Point, b: Point): [number, number] => [a[0] - b[0], a[1] - b[1]];
const len = (v: readonly [number, number]): number => Math.hypot(v[0], v[1]);
const cellKey = (x: number, y: number): string => `${x},${y}`;

/** Glyphpixel unabhängig vom Modul nachgerechnet wie im Entwurf (gen.js): rechtsbündig ab x 18, Zeilen bei y 3 und 13. */
function draftGlyphPixels(): [number, number][] {
  const out: [number, number][] = [];
  const width = (w: string): number => [...w].reduce((n, ch) => n + GLYPHS[ch][0].length + 1, -1);
  const right = 18 + Math.max(width('PFAND'), width('RAIDERS'));
  for (const [word, oy] of [
    ['PFAND', 3],
    ['RAIDERS', 13],
  ] as const) {
    let x = right - width(word);
    for (const ch of word) {
      GLYPHS[ch].forEach((row, gy) => [...row].forEach((c, gx) => c === '1' && out.push([x + gx, oy + gy])));
      x += GLYPHS[ch][0].length + 1;
    }
  }
  return out;
}

/** Silhouette des Entwurfs: volle 8-Nachbar-Ausdehnung der Glyphpixel um 1 Einheit. */
function draftDilation(): Set<string> {
  const out = new Set<string>();
  for (const [x, y] of draftGlyphPixels()) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) out.add(cellKey(x + dx, y + dy));
  }
  return out;
}

/**
 * Die Zellen, die die Ausdehnung ganz einschließt, aber nicht erreicht: die Mitte beider D und ein Loch zwischen
 * R und S. Im Entwurf schien dort der Hintergrund durch; jetzt sind sie dunkel.
 */
const ENCLOSED = ['54,5', '54,6', '54,7', '36,15', '36,16', '36,17', '51,17'];

/** Ziel-Silhouette: Ausdehnung des Entwurfs plus die eingeschlossenen Löcher. */
function draftSilhouette(): Set<string> {
  return new Set([...draftDilation(), ...ENCLOSED]);
}

/** Zellen des Pfads in Farbe color aus Rechtecken "M x y h w v h h -w z"; Überlappungen sind Fehler. */
function pathCells(svg: string, color: string): Set<string> {
  const m = svg.match(new RegExp(`<path fill="${color}"[^>]* d="([^"]+)"`));
  if (!m) throw new Error(`kein Pfad in ${color}`);
  const out = new Set<string>();
  const rects = [...m[1].matchAll(/M(\d+) (\d+)h(\d+)v(\d+)h-(\d+)z/g)];
  expect(rects.map((r) => r[0]).join('')).toBe(m[1]); // nichts anderes im Pfad
  for (const r of rects) {
    const [x, y, w, h, w2] = r.slice(1).map(Number);
    expect(w2).toBe(w);
    for (let cy = y; cy < y + h; cy++) {
      for (let cx = x; cx < x + w; cx++) {
        expect(out.has(cellKey(cx, cy))).toBe(false);
        out.add(cellKey(cx, cy));
      }
    }
  }
  return out;
}

const fills =(svg: string): string[] => [...svg.matchAll(/fill="(#[0-9a-f]{6})"/g)].map((m) => m[1]);

describe('glyphs', () => {
  it('every glyph has 7 rows of equal width; I is 3 wide, the rest 5', () => {
    for (const [ch, rows] of Object.entries(GLYPHS)) {
      expect(rows).toHaveLength(GLYPH_H);
      const w = rows[0].length;
      expect(w).toBe(ch === 'I' ? 3 : 5);
      for (const r of rows) {
        expect(r).toHaveLength(w);
        expect(r).toMatch(/^[01]+$/);
      }
    }
  });
});

describe('buildLogo', () => {
  const geo = buildLogo();
  const [pfand, raiders] = geo.lines;

  it('is 60 x 23 units', () => {
    expect([geo.width, geo.height]).toEqual([60, 23]);
  });

  it('PFAND is 29 units wide, RAIDERS 39', () => {
    expect(pfand.word).toBe('PFAND');
    expect(pfand.w).toBe(29);
    expect(raiders.word).toBe('RAIDERS');
    expect(raiders.w).toBe(39);
  });

  it('both lines are right-aligned and PFAND is above RAIDERS with a 3 unit gap', () => {
    const top = textBounds(geo, 'fill', 0, raiders.y);
    const bottom = textBounds(geo, 'fill', raiders.y);
    expect(top.maxX).toBe(bottom.maxX);
    expect(top.maxX - top.minX + 1).toBe(29);
    expect(bottom.maxX - bottom.minX + 1).toBe(39);
    expect(top.maxY).toBeLessThan(bottom.minY);
    expect(bottom.minY - top.maxY - 1).toBe(3);
  });

  it('text pixels are unique cells inside the logo', () => {
    const cells = new Set(geo.pixels.map((p) => `${p.x},${p.y}`));
    expect(cells.size).toBe(geo.pixels.length);
    for (const p of geo.pixels) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThan(geo.width);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThan(geo.height);
    }
  });

  it('(a) every dilation cell of a text pixel is fill or outline, no gaps', () => {
    for (const [x, y] of draftGlyphPixels()) {
      expect(geo.grid[y][x]).toBe('fill');
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) expect(geo.grid[y + dy][x + dx]).not.toBeNull();
    }
    expect(geo.pixels.every((p) => p.kind === 'fill' || p.kind === 'outline')).toBe(true);
  });

  it('(b) fill equals the glyph pixels and fill + outline equal the draft dilation plus the enclosed holes', () => {
    const fill = new Set(geo.pixels.filter((p) => p.kind === 'fill').map((p) => cellKey(p.x, p.y)));
    expect(fill).toEqual(new Set(draftGlyphPixels().map(([x, y]) => cellKey(x, y))));
    expect(new Set(geo.pixels.map((p) => cellKey(p.x, p.y)))).toEqual(draftSilhouette());
  });

  it('no empty cell is enclosed by the text (no holes inside letters)', () => {
    const dil = draftDilation();
    for (const c of ENCLOSED) expect(dil.has(c)).toBe(false);
    // Flutfüllung von außen über leere Zellen erreicht jede leere Zelle
    const empty = (x: number, y: number): boolean => geo.grid[y]?.[x] === null;
    const seen = new Set<string>();
    const stack: [number, number][] = [[0, 0]];
    while (stack.length > 0) {
      const [x, y] = stack.pop()!;
      if (!empty(x, y) || seen.has(cellKey(x, y))) continue;
      seen.add(cellKey(x, y));
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    const allEmpty = geo.grid.flatMap((row, y) => row.flatMap((c, x) => (c === null ? [cellKey(x, y)] : [])));
    expect(allEmpty.filter((c) => !seen.has(c))).toEqual([]);
  });

  it('grid and pixel list agree', () => {
    geo.grid.forEach((row, y) => row.forEach((c, x) => expect(geo.pixels.find((p) => p.x === x && p.y === y)?.kind ?? null).toBe(c)));
  });

  it('has 4 equal, parallel 45-degree stripes from bottom-left to top-right', () => {
    expect(geo.stripes.map((s) => s.color)).toEqual([...STRIPE_COLORS]);
    const ref = geo.stripes[0].points;
    for (const s of geo.stripes) {
      const [bl, br, tr, tl] = s.points;
      expect(bl[1]).toBe(geo.height);
      expect(tl[1]).toBe(0);
      expect(sub(br, bl)).toEqual([4, 0]); // 4 units wide
      expect(sub(tl, bl)).toEqual([geo.height, -geo.height]); // 45 degrees, up and right
      expect(len(sub(tl, bl))).toBe(len(sub(ref[3], ref[0]))); // equal length
      expect(sub(tr, br)).toEqual(sub(tl, bl)); // parallelogram
    }
    for (let i = 1; i < geo.stripes.length; i++) {
      expect(geo.stripes[i].points[0][0] - geo.stripes[i - 1].points[1][0]).toBe(2); // 2 units gap
    }
  });

  it('stripes pass behind the text', () => {
    const last = geo.stripes[geo.stripes.length - 1].points;
    expect(last[2][0]).toBeGreaterThan(raiders.x);
  });
});

describe('logoSvg', () => {
  const svg = logoSvg(COLOR_LOGO);

  it('is clean: no text, no filter, a title, unit viewBox', () => {
    expect(svg).not.toContain('<text');
    expect(svg).not.toContain('filter');
    expect(svg).not.toContain('<rect');
    expect(svg).toContain('<title>PfandRaiders</title>');
    expect(svg).toContain('viewBox="0 0 60 23"');
    expect(svg).toContain('width="480" height="184"');
    expect(svg.match(/<polygon /g)).toHaveLength(4);
  });

  it('has one path per colour', () => {
    const paths = [...svg.matchAll(/<path fill="(#[0-9a-f]{6})"/g)].map((m) => m[1]);
    expect(paths).toEqual(['#1b1b1f', '#fff6d6']);
    expect(svg).not.toContain('shadow');
  });

  it('is deterministic and compact', () => {
    expect(logoSvg(COLOR_LOGO)).toBe(svg);
    for (const content of Object.values(logoFiles())) expect(content.length).toBeLessThan(6 * 1024);
  });

  it('unit scales width and height; background adds a rect', () => {
    const s = logoSvg({ ...COLOR_LOGO, unit: 2, background: '#000000' });
    expect(s).toContain('width="120" height="46"');
    expect(s).toContain('<rect width="60" height="23" fill="#000000"/>');
  });

  it('mono versions draw stripes and text in one colour', () => {
    for (const [opts, ink, knockout] of [
      [BLACK_LOGO, '#000000', '#ffffff'],
      [WHITE_LOGO, '#ffffff', '#111111'],
    ] as const) {
      const s = logoSvg(opts);
      expect(new Set(fills(s))).toEqual(new Set([ink, knockout]));
      const polys = [...s.matchAll(/<polygon fill="(#[0-9a-f]{6})"/g)].map((m) => m[1]);
      expect(new Set(polys)).toEqual(new Set([ink]));
    }
  });

  it('(c) every version draws exactly the draft coverage: fill path = glyphs, outline path = dilation plus holes minus glyphs', () => {
    const glyphs = new Set(draftGlyphPixels().map(([x, y]) => cellKey(x, y)));
    const outline = new Set([...draftSilhouette()].filter((c) => !glyphs.has(c)));
    for (const opts of [COLOR_LOGO, BLACK_LOGO, WHITE_LOGO]) {
      const s = logoSvg(opts);
      expect(s.match(/<path /g)).toHaveLength(2);
      expect(pathCells(s, opts.fill)).toEqual(glyphs);
      expect(pathCells(s, opts.outline)).toEqual(outline);
      expect(s).not.toContain('stroke'); // keine Kontur an den Streifen
    }
  });
});

describe('favicon', () => {
  it('is a 32 unit dark square with 4 stripes and a cream P', () => {
    const geo = buildFavicon();
    expect([geo.width, geo.height]).toEqual([32, 32]);
    expect(geo.stripes).toHaveLength(4);
    for (const s of geo.stripes) for (const [x, y] of s.points) expect(x >= 0 && x <= 32 && y >= 0 && y <= 32).toBe(true);
    const p = textBounds(geo);
    expect([p.maxX - p.minX + 1, p.maxY - p.minY + 1]).toEqual([20, 28]);
    // gerades Raster: bei 16 px wird jedes Schriftpixel genau 2 x 2 px groß
    expect(p.minX % 2).toBe(0);
    expect(p.minY % 2).toBe(0);
    const svg = faviconSvg();
    expect(svg).toContain('viewBox="0 0 32 32"');
    expect(svg).toContain('<rect width="32" height="32" fill="#1b1b1f"/>');
    expect(svg).toContain('<path fill="#fff6d6"');
    expect(svg).not.toContain('<text');
  });

  it('P has a continuous 1-unit outline and a dark counter (no stripe shows through)', () => {
    const geo = buildFavicon();
    for (const p of geo.pixels.filter((q) => q.kind === 'fill')) {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) expect(geo.grid[p.y + dy][p.x + dx]).not.toBeNull();
    }
    // Innenraum des P: Schriftzeilen 1-2, Spalten 1-3 (4 Einheiten je Schriftpixel)
    const { x, y } = geo.lines[0];
    for (let cy = y + 4; cy < y + 12; cy++) for (let cx = x + 4; cx < x + 16; cx++) expect(geo.grid[cy][cx]).toBe('outline');
    // Kontur genau 1 Einheit breit: zwei Einheiten außerhalb ist leer
    expect(geo.grid[y - 2][x]).toBeNull();
    expect(geo.grid[y][x - 2]).toBeNull();
    const svg = faviconSvg();
    expect(pathCells(svg, '#1b1b1f').size + pathCells(svg, '#fff6d6').size).toBe(geo.pixels.length);
  });
});

describe('committed files', () => {
  it('equal the generated output (npm run logo)', () => {
    for (const [rel, content] of Object.entries(logoFiles())) {
      expect(repoFile(rel).replace(/\r\n/g, '\n'), rel).toBe(content);
    }
  });

  it('colour logo is the same in public and assets', () => {
    const files = logoFiles();
    expect(files['assets/logo/logo.svg']).toBe(files['packages/client/public/logo.svg']);
  });
});
