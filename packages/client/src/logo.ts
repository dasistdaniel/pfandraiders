/**
 * PfandRaiders-Logo als reine Geometrie (ohne Phaser): "PFAND" über "RAIDERS" in einer 5x7-Pixelschrift,
 * beide Zeilen rechtsbündig, dahinter vier parallele 45-Grad-Streifen (rot, gelb, grün, blau).
 * Alle Maße in Einheiten (ein Schriftpixel = 1 Einheit). Daraus entstehen die SVG-Dateien
 * (scripts/generate-logo.mjs) und die Phaser-Textur (logoTexture.ts).
 */

export const LOGO_COLORS = {
  red: '#ef5350',
  yellow: '#ffca28',
  green: '#66bb6a',
  blue: '#42a5f5',
  cream: '#fff6d6',
  dark: '#1b1b1f',
} as const;

export const STRIPE_COLORS: readonly string[] = [LOGO_COLORS.red, LOGO_COLORS.yellow, LOGO_COLORS.green, LOGO_COLORS.blue];

/** 5x7-Pixelschrift (I ist 3 breit); '1' = gesetztes Pixel. */
export const GLYPHS: Readonly<Record<string, readonly string[]>> = {
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10101', '10011', '10001', '10001'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  I: ['111', '010', '010', '010', '010', '010', '111'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
};

export const GLYPH_H = 7;
export const LETTER_GAP = 1;
export const LINE_GAP = 3;
export const STRIPE_W = 4;
export const STRIPE_GAP = 2;

export type PixelKind = 'fill' | 'outline' | 'shadow';
export type Point = readonly [number, number];

export interface LogoPixel {
  x: number;
  y: number;
  kind: PixelKind;
}

export interface LogoStripe {
  points: Point[];
  color: string;
}

export interface LogoLine {
  word: string;
  x: number;
  y: number;
  w: number;
}

export interface LogoGeometry {
  /** Breite und Höhe in Einheiten. */
  width: number;
  height: number;
  lines: LogoLine[];
  /** Streifen von unten links nach oben rechts, hinter dem Text. */
  stripes: LogoStripe[];
  /** Textpixel; jede Zelle höchstens einmal (fill, outline und shadow überschneiden sich nicht). */
  pixels: LogoPixel[];
}

/** Breite eines Wortes in Einheiten (Buchstaben plus je 1 Einheit Abstand). */
export function wordWidth(word: string): number {
  let w = 0;
  for (const ch of word) w += glyph(ch)[0].length + LETTER_GAP;
  return w - LETTER_GAP;
}

function glyph(ch: string): readonly string[] {
  const g = GLYPHS[ch];
  if (!g) throw new Error(`Kein Glyph für ${ch}`);
  return g;
}

const key = (x: number, y: number): string => `${x},${y}`;

/** Gesetzte Pixel eines Wortes, verschoben um (ox, oy). */
function wordPixels(word: string, ox: number, oy: number, scale = 1): Point[] {
  const out: Point[] = [];
  let x = 0;
  for (const ch of word) {
    const g = glyph(ch);
    g.forEach((row, gy) =>
      [...row].forEach((c, gx) => {
        if (c !== '1') return;
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) out.push([ox + (x + gx) * scale + sx, oy + gy * scale + sy]);
        }
      }),
    );
    x += g[0].length + LETTER_GAP;
  }
  return out;
}

/** Ausdehnung um r Zellen in alle acht Richtungen. */
function dilate(cells: Set<string>, r: number): Set<string> {
  const out = new Set<string>();
  for (const c of cells) {
    const [x, y] = c.split(',').map(Number);
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) out.add(key(x + dx, y + dy));
  }
  return out;
}

function shift(cells: Set<string>, dx: number, dy: number): Set<string> {
  const out = new Set<string>();
  for (const c of cells) {
    const [x, y] = c.split(',').map(Number);
    out.add(key(x + dx, y + dy));
  }
  return out;
}

/** Füllung, Kontur (Ausdehnung minus Füllung) und Schlagschatten (Kontur um 1 nach rechts unten, nur außerhalb). */
function layered(fill: Point[], outlineR: number, shadow: boolean): LogoPixel[] {
  const f = new Set(fill.map(([x, y]) => key(x, y)));
  const d = dilate(f, outlineR);
  const pixels: LogoPixel[] = [];
  const push = (cells: Iterable<string>, kind: PixelKind): void => {
    for (const c of cells) {
      const [x, y] = c.split(',').map(Number);
      pixels.push({ x, y, kind });
    }
  };
  push(f, 'fill');
  push([...d].filter((c) => !f.has(c)), 'outline');
  if (shadow) push([...shift(d, 1, 1)].filter((c) => !d.has(c)), 'shadow');
  // feste Reihenfolge: Zeile, dann Spalte
  return pixels.sort((a, b) => a.y - b.y || a.x - b.x);
}

/** 45-Grad-Streifen über die volle Höhe h: unten bei x = x0 (Breite w), oben um h nach rechts versetzt. */
function stripe(x0: number, w: number, h: number): Point[] {
  return [
    [x0, h],
    [x0 + w, h],
    [x0 + w + h, 0],
    [x0 + h, 0],
  ];
}

const PAD_LEFT = 18;
const PAD_RIGHT = 3;
const PAD_Y = 3;

export function buildLogo(): LogoGeometry {
  const words = ['PFAND', 'RAIDERS'];
  const textW = Math.max(...words.map(wordWidth));
  const width = PAD_LEFT + textW + PAD_RIGHT;
  const height = PAD_Y + GLYPH_H + LINE_GAP + GLYPH_H + PAD_Y;
  const lines = words.map((word, i) => {
    const w = wordWidth(word);
    return { word, x: PAD_LEFT + textW - w, y: PAD_Y + i * (GLYPH_H + LINE_GAP), w };
  });
  const fill = lines.flatMap((l) => wordPixels(l.word, l.x, l.y));
  const stripes = STRIPE_COLORS.map((color, i) => ({
    points: stripe(i * (STRIPE_W + STRIPE_GAP), STRIPE_W, height),
    color,
  }));
  return { width, height, lines, stripes, pixels: layered(fill, 1, true) };
}

/** Favicon: 32x32 Einheiten, dunkles Quadrat, die vier Streifen diagonal, darauf ein großes "P" (3 Einheiten je Pixel). */
export const FAVICON_SIZE = 32;
const FAVICON_SCALE = 3;

export function buildFavicon(): LogoGeometry {
  const s = FAVICON_SIZE;
  const pw = glyph('P')[0].length * FAVICON_SCALE;
  const ph = GLYPH_H * FAVICON_SCALE;
  const px = Math.ceil((s - pw) / 2);
  const py = Math.floor((s - ph) / 2);
  // Streifenband mittig auf der Diagonale von unten links nach oben rechts
  const band = STRIPE_COLORS.length * STRIPE_W + (STRIPE_COLORS.length - 1) * STRIPE_GAP;
  const stripes = STRIPE_COLORS.map((color, i) => ({
    points: clipToRect(stripe(-band / 2 + i * (STRIPE_W + STRIPE_GAP), STRIPE_W, s), s, s),
    color,
  }));
  return {
    width: s,
    height: s,
    lines: [{ word: 'P', x: px, y: py, w: pw }],
    stripes,
    pixels: layered(wordPixels('P', px, py, FAVICON_SCALE), 2, false),
  };
}

/** Polygon auf das Rechteck 0..w x 0..h zuschneiden (Sutherland-Hodgman). */
function clipToRect(poly: Point[], w: number, h: number): Point[] {
  const edges: [(p: Point) => boolean, (a: Point, b: Point) => Point][] = [
    [(p) => p[0] >= 0, (a, b) => lerpAt(a, b, 0, 0)],
    [(p) => p[0] <= w, (a, b) => lerpAt(a, b, 0, w)],
    [(p) => p[1] >= 0, (a, b) => lerpAt(a, b, 1, 0)],
    [(p) => p[1] <= h, (a, b) => lerpAt(a, b, 1, h)],
  ];
  let out = poly;
  for (const [inside, cut] of edges) {
    const input = out;
    out = [];
    input.forEach((cur, i) => {
      const prev = input[(i + input.length - 1) % input.length];
      if (inside(cur)) {
        if (!inside(prev)) out.push(cut(prev, cur));
        out.push(cur);
      } else if (inside(prev)) {
        out.push(cut(prev, cur));
      }
    });
  }
  // doppelte Punkte (Ecken auf der Kante) entfernen
  return out.filter((p, i) => {
    const q = out[(i + out.length - 1) % out.length];
    return p[0] !== q[0] || p[1] !== q[1];
  });
}

function lerpAt(a: Point, b: Point, axis: 0 | 1, v: number): Point {
  const t = (v - a[axis]) / (b[axis] - a[axis]);
  const p: [number, number] = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  p[axis] = v;
  return p;
}

export interface LogoSvgOptions {
  fill: string;
  outline: string;
  shadow: string;
  /** Je Streifen eine Farbe; oder monoStripe für alle. */
  stripeColors?: readonly string[];
  monoStripe?: string;
  background?: string;
  /** Pixel je Einheit für width/height (Standard 8). */
  unit?: number;
}

/**
 * Rechtecke aus Zellen: waagrechte Läufe je Zeile, gleiche Läufe in Folgezeilen zusammengefasst.
 * Ergebnis als kompakter Pfad "M x y h w v h h -w z".
 */
export function cellsPath(cells: readonly { x: number; y: number }[]): string {
  const rows = new Map<number, number[]>();
  for (const { x, y } of cells) {
    const r = rows.get(y);
    if (r) r.push(x);
    else rows.set(y, [x]);
  }
  // Läufe je Zeile
  const runs: { x: number; y: number; w: number; h: number }[] = [];
  const open = new Map<string, { x: number; y: number; w: number; h: number }>();
  for (const y of [...rows.keys()].sort((a, b) => a - b)) {
    const xs = [...new Set(rows.get(y))].sort((a, b) => a - b);
    const rowRuns: { x: number; w: number }[] = [];
    for (const x of xs) {
      const last = rowRuns[rowRuns.length - 1];
      if (last && last.x + last.w === x) last.w++;
      else rowRuns.push({ x, w: 1 });
    }
    const nextOpen = new Map<string, { x: number; y: number; w: number; h: number }>();
    for (const r of rowRuns) {
      const k = `${r.x}:${r.w}`;
      const prev = open.get(k);
      if (prev && prev.y + prev.h === y) {
        prev.h++;
        nextOpen.set(k, prev);
      } else {
        const rect = { x: r.x, y, w: r.w, h: 1 };
        runs.push(rect);
        nextOpen.set(k, rect);
      }
    }
    open.clear();
    for (const [k, v] of nextOpen) open.set(k, v);
  }
  return runs.map((r) => `M${r.x} ${r.y}h${r.w}v${r.h}h-${r.w}z`).join('');
}

const num = (n: number): string => String(Math.round(n * 1000) / 1000);

/** SVG aus einer Geometrie: Streifen als Polygone, Text als ein Pfad je Farbe. */
export function geometrySvg(geo: LogoGeometry, opts: LogoSvgOptions): string {
  const unit = opts.unit ?? 8;
  const parts: string[] = [];
  if (opts.background) parts.push(`<rect width="${geo.width}" height="${geo.height}" fill="${opts.background}"/>`);
  geo.stripes.forEach((s, i) => {
    const color = opts.monoStripe ?? opts.stripeColors?.[i] ?? s.color;
    const pts = s.points.map((p) => `${num(p[0])},${num(p[1])}`).join(' ');
    parts.push(`<polygon fill="${color}" points="${pts}"/>`);
  });
  // Ebenen in Zeichenreihenfolge; gleiche Farben teilen sich einen Pfad
  const colorOf: Record<PixelKind, string> = { shadow: opts.shadow, outline: opts.outline, fill: opts.fill };
  const byColor = new Map<string, LogoPixel[]>();
  for (const kind of ['shadow', 'outline', 'fill'] as const) {
    const color = colorOf[kind];
    const list = byColor.get(color) ?? [];
    list.push(...geo.pixels.filter((p) => p.kind === kind));
    byColor.set(color, list);
  }
  for (const [color, cells] of byColor) {
    if (cells.length === 0) continue;
    parts.push(`<path fill="${color}" shape-rendering="crispEdges" d="${cellsPath(cells)}"/>`);
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${geo.width} ${geo.height}" ` +
    `width="${geo.width * unit}" height="${geo.height * unit}">\n` +
    `<title>PfandRaiders</title>\n${parts.join('\n')}\n</svg>\n`
  );
}

export function logoSvg(opts: LogoSvgOptions): string {
  return geometrySvg(buildLogo(), opts);
}

export const COLOR_LOGO: LogoSvgOptions = {
  fill: LOGO_COLORS.cream,
  outline: LOGO_COLORS.dark,
  shadow: LOGO_COLORS.dark,
  stripeColors: STRIPE_COLORS,
};
/** Einfarbig schwarz für helle Hintergründe; die Kontur ist weiß ausgespart. */
export const BLACK_LOGO: LogoSvgOptions = { fill: '#000000', outline: '#ffffff', shadow: '#ffffff', monoStripe: '#000000' };
/** Weiß für dunkle Hintergründe; Kontur dunkel. */
export const WHITE_LOGO: LogoSvgOptions = { fill: '#ffffff', outline: '#111111', shadow: '#111111', monoStripe: '#ffffff' };

export function faviconSvg(): string {
  return geometrySvg(buildFavicon(), { ...COLOR_LOGO, background: LOGO_COLORS.dark, unit: 1 });
}

/** Alle erzeugten Dateien, Pfad relativ zum Repository. Quelle für Generator und Test. */
export function logoFiles(): Record<string, string> {
  const color = logoSvg(COLOR_LOGO);
  return {
    'packages/client/public/logo.svg': color,
    'packages/client/public/favicon.svg': faviconSvg(),
    'assets/logo/logo.svg': color,
    'assets/logo/logo-black.svg': logoSvg(BLACK_LOGO),
    'assets/logo/logo-white.svg': logoSvg(WHITE_LOGO),
  };
}
