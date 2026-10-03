import { TILE } from '../src/config';
import { SHEET_COLS } from '../src/tiled';
import type { TiledMap, TiledObject } from '../src/tiled';
import type { ZoneDef } from '../src/types';

/** Feste Kacheln des Stadtplans: Gebäude, Rand, Baum, Brunnen/Wasser, Auto, Laterne. */
const SOLID_CHARS = new Set(['R', 'Y', 'E', 'X', 'W', 't', 'o', 'c', 'l']);
/** Begehbare Kacheln ohne Objekt: Fahrbahn, Zebrastreifen, Gehweg/Platz, Gras. */
const GROUND_CHARS = new Set(['=', '+', '.', ',']);
const OBJECT_TYPES: Record<string, string> = { '@': 'spawn', D: 'dropoff', S: 'shop', N: 'npc_spawn' };
const SPOT_CHARS: Record<string, string> = {
  b: 'bus_stop',
  n: 'bench',
  g: 'bush',
  m: 'bin',
  p: 'park',
};

/** Zellnummer des Kenney-Bogens (Spalte, Zeile ab 0); 0 bleibt "leer". */
export const gid = (col: number, row: number): number => row * SHEET_COLS + col + 1;

// ---------------------------------------------------------------------------------------------
// Zellen des Kenney-Bogens "Roguelike Modern City" (modern-city.png, 37 x 28 Zellen zu 16 px).
// Angaben als gid(Spalte, Zeile). Auswahl und Begründung im Bericht zu Task 4.
// ---------------------------------------------------------------------------------------------

/** Fahrbahn: Asphalt, gelbe Mittellinien, weiße Randlinien, Zebrastreifen. */
const ROAD = {
  plain: gid(11, 19),
  /** Mittellinie (doppelt gelb) mitten in der Kachel: waagerecht / senkrecht */
  centreH: gid(13, 19),
  centreV: gid(13, 20),
  /** Mittellinie auf der Kachelgrenze (gerade Fahrbahnbreite): obere/untere bzw. linke/rechte Hälfte */
  centreHUpper: gid(14, 19),
  centreHLower: gid(14, 20),
  centreVLeft: gid(13, 21),
  centreVRight: gid(14, 21),
  /** weiße Randlinie zum Gehweg an der Kante oben/unten/links/rechts */
  edgeTop: gid(18, 22),
  edgeBottom: gid(17, 22),
  edgeLeft: gid(18, 21),
  edgeRight: gid(17, 21),
  /** Zebrastreifen: waagerechte Balken (über eine waagerechte Straße), senkrechte Balken (über eine senkrechte) */
  zebraH: gid(10, 22),
  zebraV: gid(13, 22),
};
/** Gehweg/Platz: graues Pflaster, mit Riss, mit Schattenkante (Gebäude nördlich), mit Bordstein (Fahrbahn südlich). */
const PAVE = { plain: gid(1, 20), crack: gid(1, 21), shadow: gid(1, 19), curb: gid(1, 22) };
/** Wiese: zwei Grasvarianten */
const GRASS = [gid(0, 24), gid(1, 24)];

/**
 * Glatte Dächer je Gebäudebuchstabe (eine Zelle je Buchstabe, nahtlos kachelbar): rot, dunkelgrau, beige;
 * Büros `X` mit Glasdach, weil das hellgraue Dach kaum vom Pflaster zu unterscheiden ist.
 */
const ROOF: Record<string, number> = { R: gid(6, 0), Y: gid(14, 0), X: gid(14, 7), E: gid(30, 0) };
/** Randbebauung `W`: dunkelgraues Plattendach im 2 x 2-Raster */
const BORDER_ROOF = [gid(8, 0), gid(9, 0), gid(8, 1), gid(9, 1)];

/** Untere Wandreihe (mit Sockel) je Farbfamilie: links, Mitte, rechts */
const WALL: Record<string, [number, number, number]> = {
  red: [gid(1, 8), gid(2, 8), gid(3, 8)],
  grey: [gid(5, 8), gid(6, 8), gid(7, 8)],
  beige: [gid(9, 8), gid(10, 8), gid(11, 8)],
  glass: [gid(13, 10), gid(14, 10), gid(15, 10)],
};
const WINDOWS = {
  brown: [gid(26, 15), gid(26, 16), gid(25, 16)],
  grey: [gid(26, 18), gid(26, 19), gid(25, 19)],
};
const DOOR = { brown: gid(20, 26), green: gid(23, 26), orange: gid(26, 26), glass: gid(25, 21) };
/** Einreihige Markisen: links, Mitte, rechts, einzeln */
const AWNING = {
  green: [gid(23, 11), gid(24, 11), gid(25, 11), gid(26, 11)],
  orange: [gid(27, 11), gid(28, 11), gid(29, 11), gid(30, 11)],
};

/** Bäume (nur Grüntöne): Stamm mit unterer Krone (below) und obere Krone eine Reihe darüber (above) */
const TREES = [31, 33, 34, 36].map((col) => ({ trunk: gid(col, 11), crown: gid(col, 10) }));
/** Straßenlaterne, drei Zellen hoch: Fuß (below), Mast und Kopf (above); Arm nach links bzw. rechts */
const LAMPS = [1, 2].map((col) => ({ base: gid(col, 18), pole: gid(col, 17), head: gid(col, 16) }));
/** Autos: grün, grau, orange. Seitenansicht 3 x 2 Zellen (waagerecht), Heckansicht 2 x 2 Zellen (senkrecht). */
const CARS_H = [16, 20, 24].map((row) => ({
  top: [gid(31, row), gid(32, row), gid(33, row)],
  bottom: [gid(31, row + 1), gid(32, row + 1), gid(33, row + 1)],
}));
const CARS_V = [18, 22, 26].map((row) => ({
  top: [gid(31, row), gid(32, row)],
  bottom: [gid(31, row + 1), gid(32, row + 1)],
}));
/** Brunnenbecken 3 x 3: [Zeile][Spalte] mit Rand */
const POOL = [4, 5, 6].map((row) => [26, 27, 28].map((col) => gid(col, row)));

/** Zelltabellen für Tests: Dächer je Buchstabe, Fassadenzellen, schlichte Bodenzellen. */
export const CITY_CELLS = {
  roofs: Object.fromEntries(Object.entries(ROOF).map(([ch, g]) => [ch, new Set([g])])) as Record<string, Set<number>>,
  facades: new Set<number>([
    ...Object.values(WALL).flat(),
    ...Object.values(WINDOWS).flat(),
    ...Object.values(DOOR),
    ...Object.values(AWNING).flat(),
  ]),
  plainGround: new Set<number>([...Object.values(ROAD), ...Object.values(PAVE), ...GRASS]),
};

// ---------------------------------------------------------------------------------------------
// Ableitung
// ---------------------------------------------------------------------------------------------

/** Fester Hash über Spalte, Zeile und Salz (kein Zufall, damit die Datei reproduzierbar bleibt). */
function hash(a: number, b: number, salt: number): number {
  let h = Math.imul(a + 1, 0x27d4eb2d) ^ Math.imul(b + 1, 0x165667b1) ^ Math.imul(salt + 1, 0x9e3779b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

type GroundClass = 'road' | 'pave' | 'grass';

const BUILDING_CHARS = 'RYEXW';
/** Zeichen, auf die überstehende Teile (Autos) in `below` gemalt werden dürfen */
const PLAIN_CHARS = '=+.,';

/** Bodenart je Kachel: Fahrbahn, Pflaster oder Gras; Objekte übernehmen die Umgebung. */
function groundClasses(rows: string[]): GroundClass[] {
  const h = rows.length;
  const w = rows[0].length;
  const direct = (ch: string): GroundClass | null => {
    if (ch === '=' || ch === '+' || ch === 'c') return 'road';
    if (ch === '.' || BUILDING_CHARS.includes(ch)) return 'pave';
    if (ch === ',') return 'grass';
    return null;
  };
  const out: GroundClass[] = [];
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const d = direct(rows[r][c]);
      if (d) {
        out.push(d);
        continue;
      }
      // Umgebung: Mehrheit der echten Bodenzeichen im wachsenden Ring (Gleichstand: Pflaster, Gras, Fahrbahn)
      let pick: GroundClass = 'pave';
      for (let rad = 1; rad <= 3; rad++) {
        const count = { pave: 0, grass: 0, road: 0 };
        for (let dr = -rad; dr <= rad; dr++) {
          for (let dc = -rad; dc <= rad; dc++) {
            if (rad === 1 && dr !== 0 && dc !== 0) continue; // erst die vier direkten Nachbarn
            const rr = r + dr;
            const cc = c + dc;
            if (rr < 0 || cc < 0 || rr >= h || cc >= w) continue;
            const ch = rows[rr][cc];
            if (!GROUND_CHARS.has(ch)) continue;
            count[ch === '.' ? 'pave' : ch === ',' ? 'grass' : 'road']++;
          }
        }
        const best = Math.max(count.pave, count.grass, count.road);
        if (best === 0) continue;
        pick = count.pave === best ? 'pave' : count.grass === best ? 'grass' : 'road';
        break;
      }
      out.push(pick);
    }
  }
  return out;
}

/** Bodenbild einer Fahrbahnkachel aus Straßenrichtung, Breite und Lage in der Fahrbahn. */
function roadCell(rows: string[], cls: GroundClass[], r: number, c: number): number {
  const h = rows.length;
  const w = rows[0].length;
  const isRoad = (rr: number, cc: number) => rr >= 0 && cc >= 0 && rr < h && cc < w && cls[rr * w + cc] === 'road';
  let left = c;
  while (isRoad(r, left - 1)) left--;
  let right = c;
  while (isRoad(r, right + 1)) right++;
  let top = r;
  while (isRoad(top - 1, c)) top--;
  let bottom = r;
  while (isRoad(bottom + 1, c)) bottom++;
  const hRun = right - left + 1;
  const vRun = bottom - top + 1;
  const MAX_WIDTH = 4;
  const horizontal = vRun <= MAX_WIDTH && hRun > MAX_WIDTH;
  const vertical = hRun <= MAX_WIDTH && vRun > MAX_WIDTH;

  if (rows[r][c] === '+') {
    if (horizontal) return ROAD.zebraH;
    if (vertical) return ROAD.zebraV;
    const stacked = (r > 0 && rows[r - 1][c] === '+') || (r + 1 < h && rows[r + 1][c] === '+');
    return stacked ? ROAD.zebraH : ROAD.zebraV;
  }
  if (!horizontal && !vertical) return ROAD.plain; // Kreuzung oder Platz
  const width = horizontal ? vRun : hRun;
  const i = horizontal ? r - top : c - left;
  if (width < 2) return ROAD.plain;
  if (width % 2 === 1 && i === (width - 1) / 2) return horizontal ? ROAD.centreH : ROAD.centreV;
  if (width % 2 === 0 && i === width / 2 - 1) return horizontal ? ROAD.centreHUpper : ROAD.centreVLeft;
  if (width % 2 === 0 && i === width / 2) return horizontal ? ROAD.centreHLower : ROAD.centreVRight;
  if (i === 0) return horizontal ? ROAD.edgeTop : ROAD.edgeLeft;
  if (i === width - 1) return horizontal ? ROAD.edgeBottom : ROAD.edgeRight;
  return ROAD.plain;
}

interface Visuals {
  ground: number[];
  below: number[];
  above: number[];
}

/** Leitet die Grafikebenen `ground`, `below`, `above` aus dem Plan ab (Regeln siehe Task 4 / Spec §5). */
function planVisuals(rows: string[]): Visuals {
  const h = rows.length;
  const w = rows[0].length;
  const at = (r: number, c: number) => rows[r][c];
  const inMap = (r: number, c: number) => r >= 0 && c >= 0 && r < h && c < w;
  const cls = groundClasses(rows);
  const ground = new Array<number>(w * h).fill(0);
  const below = new Array<number>(w * h).fill(0);
  const above = new Array<number>(w * h).fill(0);

  /** Setzt eine Zelle; doppelte Belegung ist ein Fehler im Plan oder in den Regeln. */
  const put = (layer: number[], name: string, r: number, c: number, g: number) => {
    if (!inMap(r, c)) return;
    const i = r * w + c;
    if (layer[i] !== 0) throw new Error(`visual collision in ${name} at row ${r}, col ${c}`);
    layer[i] = g;
  };

  // Boden
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const i = r * w + c;
      const k = cls[i];
      if (k === 'road') ground[i] = roadCell(rows, cls, r, c);
      else if (k === 'grass') ground[i] = GRASS[hash(c, r, 1) % GRASS.length];
      else if (r > 0 && BUILDING_CHARS.includes(at(r - 1, c))) ground[i] = PAVE.shadow;
      else if (r + 1 < h && cls[i + w] === 'road') ground[i] = PAVE.curb;
      else ground[i] = hash(c, r, 2) % 40 === 0 ? PAVE.crack : PAVE.plain;
    }
  }

  // Gebäude: Dach, unterste Reihe Fassade (Wand im Boden, Fenster/Türen/Markisen in below)
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const ch = at(r, c);
      if (!BUILDING_CHARS.includes(ch)) continue;
      const southSame = r + 1 >= h || at(r + 1, c) === ch;
      if (southSame) {
        put(below, 'below', r, c, ch === 'W' ? BORDER_ROOF[(r % 2) * 2 + (c % 2)] : ROOF[ch]);
        continue;
      }
      // Fassade: nur am Anfang eines Laufs gleicher Fassadenkacheln bearbeiten
      const isFacade = (cc: number) => cc >= 0 && cc < w && at(r, cc) === ch && (r + 1 >= h || at(r + 1, cc) !== ch);
      if (isFacade(c - 1)) continue;
      let c1 = c;
      while (isFacade(c1 + 1)) c1++;
      facadeRun(r, c, c1, ch);
    }
  }

  function facadeRun(r: number, c0: number, c1: number, ch: string) {
    const len = c1 - c0 + 1;
    const shop = ch === 'Y' || (ch === 'E' && c0 >= 13);
    const family = ch === 'R' ? 'red' : ch === 'E' ? 'beige' : ch === 'X' ? 'glass' : 'grey';
    const wall = WALL[family];
    const doors = new Set<number>();
    if (ch !== 'W') {
      if (len >= 8) {
        doors.add(c0 + Math.floor(len / 4));
        doors.add(c1 - Math.floor(len / 4));
      } else doors.add(c0 + Math.floor(len / 2));
    }
    const pickWindow = (list: number[]) => list[hash(c0, r, 3) % list.length];
    for (let c = c0; c <= c1; c++) {
      ground[r * w + c] = c === c0 ? wall[0] : c === c1 ? wall[2] : wall[1];
      let g: number;
      if (ch === 'W') g = c % 2 === 0 ? WINDOWS.grey[0] : wall[1];
      else if (ch === 'X') g = doors.has(c) ? DOOR.glass : ground[r * w + c];
      else if (shop) {
        if (doors.has(c)) g = DOOR.glass;
        else {
          const awning = ch === 'Y' ? AWNING.orange : AWNING.green;
          const segStart = c === c0 || doors.has(c - 1);
          const segEnd = c === c1 || doors.has(c + 1);
          g = segStart && segEnd ? awning[3] : segStart ? awning[0] : segEnd ? awning[2] : awning[1];
        }
      } else if (ch === 'R') g = doors.has(c) ? DOOR.brown : pickWindow(WINDOWS.brown);
      else g = doors.has(c) ? DOOR.green : pickWindow(WINDOWS.grey);
      put(below, 'below', r, c, g);
    }
  }

  // Brunnen/Wasser: Becken mit Rand aus den Nachbarn
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      if (at(r, c) !== 'o') continue;
      const water = (rr: number, cc: number) => inMap(rr, cc) && at(rr, cc) === 'o';
      const row = !water(r - 1, c) ? 0 : !water(r + 1, c) ? 2 : 1;
      const col = !water(r, c - 1) ? 0 : !water(r, c + 1) ? 2 : 1;
      put(below, 'below', r, c, POOL[row][col]);
    }
  }

  // Bäume und Laternen
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const ch = at(r, c);
      if (ch === 't') {
        const tree = TREES[hash(c, r, 4) % TREES.length];
        put(below, 'below', r, c, tree.trunk);
        put(above, 'above', r - 1, c, tree.crown);
      } else if (ch === 'l') {
        const lamp = LAMPS[hash(c, r, 5) % LAMPS.length];
        put(below, 'below', r, c, lamp.base);
        put(above, 'above', r - 1, c, lamp.pole);
        put(above, 'above', r - 2, c, lamp.head);
      }
    }
  }

  // Autos (Paare): Überstand nur auf schlichten Boden, sonst weggelassen
  const spill = (r: number, c: number, g: number) => {
    if (inMap(r, c) && PLAIN_CHARS.includes(at(r, c)) && below[r * w + c] === 0) below[r * w + c] = g;
  };
  const seen = new Set<number>();
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      if (at(r, c) !== 'c' || seen.has(r * w + c)) continue;
      if (c + 1 < w && at(r, c + 1) === 'c') {
        // waagerecht: Seitenansicht 3 Zellen breit; mittlere Zelle auf c, Überstand zur Fahrbahn
        seen.add(r * w + c + 1);
        const car = CARS_H[hash(c, r, 6) % CARS_H.length];
        const westRoad = inMap(r, c - 1) && cls[r * w + c - 1] === 'road';
        const x0 = westRoad ? c - 1 : c;
        for (let k = 0; k < 3; k++) {
          const x = x0 + k;
          if (x === c || x === c + 1) put(below, 'below', r, x, car.bottom[k]);
          else spill(r, x, car.bottom[k]);
          // Dach eine Reihe darüber in above; steht dort schon etwas Vorderes (Laternenkopf), dann in below
          if (inMap(r - 1, x) && above[(r - 1) * w + x] === 0) above[(r - 1) * w + x] = car.top[k];
          else spill(r - 1, x, car.top[k]);
        }
      } else if (r + 1 < h && at(r + 1, c) === 'c') {
        // senkrecht: Heckansicht 2 Zellen breit; Überstand zur Seite ohne Fahrbahn (Bordstein)
        seen.add((r + 1) * w + c);
        const car = CARS_V[hash(c, r, 7) % CARS_V.length];
        const eastRoad = inMap(r, c + 1) && cls[r * w + c + 1] === 'road';
        const x0 = eastRoad ? c - 1 : c;
        for (let k = 0; k < 2; k++) {
          const x = x0 + k;
          for (const [dy, g] of [[0, car.top[k]], [1, car.bottom[k]]] as const) {
            if (x === c) put(below, 'below', r + dy, x, g);
            else spill(r + dy, x, g);
          }
        }
      } else throw new Error(`car at row ${r}, col ${c} is not part of a pair`);
    }
  }

  return { ground, below, above };
}

/**
 * Wandelt den Stadtplan (Legende in `src/maps/cityPlan.ts`) in das Tiled-JSON-Format um:
 * Regel-Ebenen `walls`, `objects`, `zones` und Grafikebenen `ground`, `below`, `above`.
 */
export function planToTiled(rows: string[], zones: ZoneDef[]): TiledMap {
  const cols = rows[0].length;
  const data: number[] = [];
  const objects: TiledObject[] = [];
  let id = 1;

  rows.forEach((row, r) => {
    if (row.length !== cols) throw new Error(`map row ${r} has length ${row.length}, expected ${cols}`);
    for (let c = 0; c < cols; c++) {
      const ch = row[c];
      if (SOLID_CHARS.has(ch)) {
        data.push(1);
        continue;
      }
      data.push(0);
      if (GROUND_CHARS.has(ch)) continue;
      const base = {
        id: id++,
        name: '',
        x: c * TILE + TILE / 2,
        y: r * TILE + TILE / 2,
        width: 0,
        height: 0,
        rotation: 0,
        visible: true,
        point: true,
      };
      if (ch in OBJECT_TYPES) objects.push({ ...base, type: OBJECT_TYPES[ch] });
      else if (ch in SPOT_CHARS) {
        objects.push({
          ...base,
          type: 'spot',
          properties: [{ name: 'spotType', type: 'string', value: SPOT_CHARS[ch] }],
        });
      } else throw new Error(`unknown map char '${ch}' at row ${r}, col ${c}`);
    }
  });

  const zoneObjects: TiledObject[] = zones.map((z) => ({
    id: id++,
    name: z.name,
    type: 'zone',
    x: z.area.x0,
    y: z.area.y0,
    width: z.area.x1 - z.area.x0,
    height: z.area.y1 - z.area.y0,
    properties: [{ name: 'zoneId', type: 'string', value: z.id }],
  }));

  const { ground, below, above } = planVisuals(rows);
  const tile = (name: string, d: number[]) => ({ type: 'tilelayer' as const, name, width: cols, height: rows.length, data: d });

  return {
    type: 'map',
    orientation: 'orthogonal',
    width: cols,
    height: rows.length,
    tilewidth: TILE,
    tileheight: TILE,
    layers: [
      tile('walls', data),
      tile('ground', ground),
      tile('below', below),
      tile('above', above),
      { type: 'objectgroup', name: 'objects', objects },
      { type: 'objectgroup', name: 'zones', objects: zoneObjects },
    ],
  };
}
