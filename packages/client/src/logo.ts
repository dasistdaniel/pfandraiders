/**
 * PfandRaiders-Logo als reine Geometrie (ohne Phaser): "PFAND" über "RAIDERS" in einer 5x7-Pixelschrift,
 * beide Zeilen rechtsbündig, dahinter vier parallele 45-Grad-Streifen (rot, gelb, grün, blau).
 * Alle Maße in Einheiten (ein Schriftpixel = 1 Einheit). Der Text ist ein Raster aus Einheitszellen
 * (Füllung, Kontur oder leer); daraus entstehen die SVG-Dateien (scripts/generate-logo.mjs) und die
 * Phaser-Textur (logoTexture.ts).
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

export type PixelKind = 'fill' | 'outline';
/** Eine Rasterzelle: Füllung, Kontur oder leer (null). */
export type Cell = PixelKind | null;
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
  /** Deckungsraster des Textes, grid[y][x]. */
  grid: Cell[][];
  /** Die belegten Zellen des Rasters, Zeile für Zeile. */
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

/** Gesetzte Pixel eines Wortes, verschoben um (ox, oy); scale Einheiten je Schriftpixel. */
export function wordPixels(word: string, ox: number, oy: number, scale = 1): Point[] {
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

/**
 * Deckungsraster: Füllzellen, darum die volle 8-Nachbar-Ausdehnung um 1 Einheit als Kontur (wie im Entwurf).
 * Zellen, die von Füllung und Kontur ganz eingeschlossen sind (Innenräume, die die Ausdehnung nicht erreicht: die
 * Mitte des D, ein Loch zwischen R und S, der Innenraum des großen P im Favicon), werden ebenfalls Kontur, damit
 * nichts durch die Buchstaben scheint. Offene Kerben am Rand bleiben wie im Entwurf.
 */
export function coverageGrid(fill: readonly Point[], width: number, height: number): Cell[][] {
  const grid: Cell[][] = Array.from({ length: height }, () => Array<Cell>(width).fill(null));
  const inside = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < width && y < height;
  for (const [x, y] of fill) {
    if (!inside(x, y)) throw new Error(`Textpixel ${x},${y} außerhalb des Logos`);
    grid[y][x] = 'fill';
  }
  for (const [x, y] of fill) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (!inside(nx, ny)) throw new Error(`Kontur ${nx},${ny} außerhalb des Logos`);
        if (grid[ny][nx] === null) grid[ny][nx] = 'outline';
      }
    }
  }
  // Leere Zellen, die vom Rand aus nicht erreichbar sind (4-Nachbarschaft), sind Innenräume
  const outside = Array.from({ length: height }, () => Array<boolean>(width).fill(false));
  const stack: [number, number][] = [];
  for (let x = 0; x < width; x++) stack.push([x, 0], [x, height - 1]);
  for (let y = 0; y < height; y++) stack.push([0, y], [width - 1, y]);
  while (stack.length > 0) {
    const [x, y] = stack.pop()!;
    if (!inside(x, y) || outside[y][x] || grid[y][x] !== null) continue;
    outside[y][x] = true;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (grid[y][x] === null && !outside[y][x]) grid[y][x] = 'outline';
  return grid;
}

function gridPixels(grid: Cell[][]): LogoPixel[] {
  const out: LogoPixel[] = [];
  grid.forEach((row, y) => row.forEach((kind, x) => kind && out.push({ x, y, kind })));
  return out;
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
  const grid = coverageGrid(fill, width, height);
  return { width, height, lines, stripes, grid, pixels: gridPixels(grid) };
}

/**
 * Favicon: 32x32 Einheiten, dunkles Quadrat, die vier Streifen diagonal, darauf ein großes "P" (4 Einheiten je
 * Schriftpixel, auf geradem Raster, damit es bei 16 px scharf bleibt) mit 1 Einheit dunkler Kontur; der
 * Innenraum des P ist dunkel.
 */
export const FAVICON_SIZE = 32;
export const FAVICON_SCALE = 4;

export function buildFavicon(): LogoGeometry {
  const s = FAVICON_SIZE;
  const pw = glyph('P')[0].length * FAVICON_SCALE;
  const ph = GLYPH_H * FAVICON_SCALE;
  const px = (s - pw) / 2;
  const py = (s - ph) / 2;
  // Streifenband mittig auf der Diagonale von unten links nach oben rechts
  const band = STRIPE_COLORS.length * STRIPE_W + (STRIPE_COLORS.length - 1) * STRIPE_GAP;
  const stripes = STRIPE_COLORS.map((color, i) => ({
    points: clipToRect(stripe(-band / 2 + i * (STRIPE_W + STRIPE_GAP), STRIPE_W, s), s, s),
    color,
  }));
  const grid = coverageGrid(wordPixels('P', px, py, FAVICON_SCALE), s, s);
  return { width: s, height: s, lines: [{ word: 'P', x: px, y: py, w: pw }], stripes, grid, pixels: gridPixels(grid) };
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

/** Raster als Text: '#' Füllung, 'o' Kontur, Streifen als r y g b (Zellmitte im Streifen), sonst '.'. */
export function geometryAscii(geo: LogoGeometry, stripeChars = 'rygb'): string {
  return geo.grid
    .map((row, y) =>
      row
        .map((cell, x) => {
          if (cell === 'fill') return '#';
          if (cell === 'outline') return 'o';
          const i = geo.stripes.findIndex((s) => pointInPolygon([x + 0.5, y + 0.5], s.points));
          return i >= 0 ? stripeChars[i] : '.';
        })
        .join(''),
    )
    .join('\n');
}

function pointInPolygon([px, py]: Point, poly: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export interface LogoSvgOptions {
  fill: string;
  outline: string;
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
  const rects: { x: number; y: number; w: number; h: number }[] = [];
  let open = new Map<string, { x: number; y: number; w: number; h: number }>();
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
        rects.push(rect);
        nextOpen.set(k, rect);
      }
    }
    open = nextOpen;
  }
  return rects.map((r) => `M${r.x} ${r.y}h${r.w}v${r.h}h-${r.w}z`).join('');
}

const num = (n: number): string => String(Math.round(n * 1000) / 1000);

/** SVG aus einer Geometrie: Streifen als Polygone, darüber Kontur und Füllung als je ein Pfad. */
export function geometrySvg(geo: LogoGeometry, opts: LogoSvgOptions): string {
  const unit = opts.unit ?? 8;
  const parts: string[] = [];
  if (opts.background) parts.push(`<rect width="${geo.width}" height="${geo.height}" fill="${opts.background}"/>`);
  geo.stripes.forEach((s, i) => {
    const color = opts.monoStripe ?? opts.stripeColors?.[i] ?? s.color;
    const pts = s.points.map((p) => `${num(p[0])},${num(p[1])}`).join(' ');
    parts.push(`<polygon fill="${color}" points="${pts}"/>`);
  });
  for (const kind of ['outline', 'fill'] as const) {
    const cells = geo.pixels.filter((p) => p.kind === kind);
    parts.push(`<path fill="${opts[kind]}" shape-rendering="crispEdges" d="${cellsPath(cells)}"/>`);
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
  stripeColors: STRIPE_COLORS,
};
/** Einfarbig schwarz für helle Hintergründe; die Kontur ist weiß ausgespart. */
export const BLACK_LOGO: LogoSvgOptions = { fill: '#000000', outline: '#ffffff', monoStripe: '#000000' };
/** Weiß für dunkle Hintergründe; Kontur dunkel. */
export const WHITE_LOGO: LogoSvgOptions = { fill: '#ffffff', outline: '#111111', monoStripe: '#ffffff' };

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
