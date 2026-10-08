import { CONFIG, TILE } from './config';
import { boxBlocked } from './map';
import type { MapData, Point } from './types';

/** Abstand der Prüfpunkte auf einer Strecke (px); kleiner als jede Wand- oder Kernbreite. */
const SAMPLE_PX = 2;
/** BFS sucht nur in einem Fenster von so vielen Kacheln um den Start (deckt den Wahrnehmungsradius ab). */
export const PATH_WINDOW_TILES = 14;
/** Höchstens so viele Kacheln des Pfads werden für die Abkürzung per Sichtlinie geprüft. */
const MAX_SMOOTH = 8;
/** Nachbarn in fester Reihenfolge (rechts, links, unten, oben), damit der Pfad überall gleich ausfällt. */
const DIRS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * Kommt eine Box (halbe Kante `half`) geradlinig von a nach b, ohne irgendwo anzustoßen?
 * Prüft Punkte im Abstand von höchstens SAMPLE_PX, inklusive Ziel. Keine Trigonometrie.
 */
export function lineClear(map: MapData, a: Point, b: Point, half: number = CONFIG.playerHalf): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / SAMPLE_PX));
  for (let i = 1; i <= n; i++) {
    if (boxBlocked(map, a.x + (dx * i) / n, a.y + (dy * i) / n, half)) return false;
  }
  return true;
}

const center = (c: number, r: number): Point => ({ x: c * TILE + TILE / 2, y: r * TILE + TILE / 2 });

/**
 * Begehbar ist eine Kachel, wenn eine Spielerbox auf ihrer Mitte frei steht. Wände sind damit
 * gesperrt und weiche Kacheln (Baum, Laterne) ebenfalls, denn ihr Kern liegt genau in der Mitte.
 */
function tileFree(map: MapData, c: number, r: number): boolean {
  const p = center(c, r);
  return !boxBlocked(map, p.x, p.y, CONFIG.playerHalf);
}

/**
 * Nächster Wegpunkt von `from` nach `to` um Wände herum: Breitensuche auf dem Kachelraster
 * (4 Nachbarn, feste Reihenfolge, nur im Fenster PATH_WINDOW_TILES um den Start), danach die
 * fernste der ersten Pfadkacheln, die noch auf gerader Linie erreichbar ist. Start- und Zielkachel
 * zählen immer als begehbar. Liefert null, wenn es keinen Weg gibt oder Start und Ziel auf
 * derselben Kachel liegen. Rein und deterministisch.
 */
export function nextWaypoint(map: MapData, from: Point, to: Point): Point | null {
  const sc = Math.floor(from.x / TILE);
  const sr = Math.floor(from.y / TILE);
  const gc = Math.floor(to.x / TILE);
  const gr = Math.floor(to.y / TILE);
  if (sc === gc && sr === gr) return null;
  const R = PATH_WINDOW_TILES;
  if (Math.abs(gc - sc) > R || Math.abs(gr - sr) > R) return null;
  const c0 = Math.max(0, sc - R);
  const r0 = Math.max(0, sr - R);
  const c1 = Math.min(map.cols - 1, sc + R);
  const r1 = Math.min(map.rows - 1, sr + R);
  const w = c1 - c0 + 1;
  const h = r1 - r0 + 1;
  // parent: Index der Vorgängerkachel + 1 (0 = nicht besucht)
  const parent = new Int32Array(w * h);
  const queue = new Int32Array(w * h);
  const idx = (c: number, r: number): number => (r - r0) * w + (c - c0);
  const start = idx(sc, sr);
  const goal = idx(gc, gr);
  parent[start] = start + 1;
  let head = 0;
  let tail = 0;
  queue[tail++] = start;
  let found = false;
  while (head < tail) {
    const cur = queue[head++];
    if (cur === goal) {
      found = true;
      break;
    }
    const cc = (cur % w) + c0;
    const cr = Math.floor(cur / w) + r0;
    for (const [dc, dr] of DIRS) {
      const nc = cc + dc;
      const nr = cr + dr;
      if (nc < c0 || nc > c1 || nr < r0 || nr > r1) continue;
      const ni = idx(nc, nr);
      if (parent[ni] !== 0) continue;
      if (ni !== goal && !tileFree(map, nc, nr)) continue;
      parent[ni] = cur + 1;
      queue[tail++] = ni;
    }
  }
  if (!found) return null;
  // Pfad rückwärts vom Ziel bis direkt hinter den Start
  const path: number[] = [];
  for (let i = goal; i !== start; i = parent[i] - 1) path.push(i);
  path.reverse();
  const tileCenter = (i: number): Point => center((i % w) + c0, Math.floor(i / w) + r0);
  let best = tileCenter(path[0]);
  for (let k = 1; k < Math.min(path.length, MAX_SMOOTH); k++) {
    const p = tileCenter(path[k]);
    if (!lineClear(map, from, p)) break;
    best = p;
  }
  return best;
}
