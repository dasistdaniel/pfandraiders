import { describe, expect, it } from 'vitest';
import { CONFIG, TILE } from '../src/config';
import { createGame } from '../src/game';
import { boxBlocked, isSolidAt } from '../src/map';
import { walk } from '../src/movement';
import { NO_INPUT } from '../src/types';
import { CITY_PLAN, CITY_ZONES } from '../src/maps/cityPlan';
import { CITY_TILED_MAP } from '../src/maps/city';

const COLS = 64;
const ROWS = 40;
const BUILDINGS = 'RYEX';
const SOLID_CHARS = 'RYEXWoc';
const SOFT_CHARS = 'tl';
const WALK_CHARS = '=+.,@DSNbngmp';
const SPOT_CHARS = 'bngmp';
const ROAD_CHARS = '=+N';

type Cell = { r: number; c: number };

const at = (r: number, c: number): string => CITY_PLAN[r][c];
const isWalk = (r: number, c: number): boolean =>
  r >= 0 && c >= 0 && r < ROWS && c < COLS && WALK_CHARS.includes(at(r, c));

function cellsOf(chars: string): Cell[] {
  const out: Cell[] = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (chars.includes(at(r, c))) out.push({ r, c });
  return out;
}

const NEIGHBOURS = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;

/** Zusammenhangskomponenten gleicher Zeichen (Vierer-Nachbarschaft) */
function components(chars: string): { ch: string; cells: Cell[] }[] {
  const seen = new Set<number>();
  const out: { ch: string; cells: Cell[] }[] = [];
  for (const start of cellsOf(chars)) {
    if (seen.has(start.r * COLS + start.c)) continue;
    const ch = at(start.r, start.c);
    const cells: Cell[] = [];
    const stack = [start];
    seen.add(start.r * COLS + start.c);
    while (stack.length > 0) {
      const cur = stack.pop()!;
      cells.push(cur);
      for (const [dr, dc] of NEIGHBOURS) {
        const r = cur.r + dr;
        const c = cur.c + dc;
        if (r < 0 || c < 0 || r >= ROWS || c >= COLS || seen.has(r * COLS + c) || at(r, c) !== ch) continue;
        seen.add(r * COLS + c);
        stack.push({ r, c });
      }
    }
    out.push({ ch, cells });
  }
  return out;
}

/** Flutfüllung über die begehbaren Kacheln der erzeugten Karte */
function reachable(start: Cell): Set<number> {
  const { cols, rows, solid } = CITY_TILED_MAP;
  const seen = new Set<number>();
  const stack = [start.r * cols + start.c];
  while (stack.length > 0) {
    const i = stack.pop()!;
    if (seen.has(i) || solid[i]) continue;
    seen.add(i);
    const c = i % cols;
    const r = Math.floor(i / cols);
    if (c > 0) stack.push(i - 1);
    if (c < cols - 1) stack.push(i + 1);
    if (r > 0) stack.push(i - cols);
    if (r < rows - 1) stack.push(i + cols);
  }
  return seen;
}

const dist = (a: Cell, b: Cell) => Math.hypot(a.r - b.r, a.c - b.c);

describe('city plan: shape', () => {
  it('has 40 rows of 64 columns', () => {
    expect(CITY_PLAN.length).toBe(ROWS);
    CITY_PLAN.forEach((row, r) => expect(row.length, `row ${r}`).toBe(COLS));
  });

  it('uses only legend characters', () => {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        expect(SOLID_CHARS + SOFT_CHARS + WALK_CHARS, `char at row ${r}, col ${c}`).toContain(at(r, c));
      }
    }
  });

  it('is closed by a solid border (W or buildings)', () => {
    const border = 'W' + BUILDINGS;
    for (let c = 0; c < COLS; c++) {
      expect(border, `top col ${c}`).toContain(at(0, c));
      expect(border, `bottom col ${c}`).toContain(at(ROWS - 1, c));
    }
    for (let r = 0; r < ROWS; r++) {
      expect(border, `left row ${r}`).toContain(at(r, 0));
      expect(border, `right row ${r}`).toContain(at(r, COLS - 1));
    }
  });

  it('keeps W on the border only', () => {
    for (const { r, c } of cellsOf('W')) {
      expect(r === 0 || c === 0 || r === ROWS - 1 || c === COLS - 1, `W at ${r},${c}`).toBe(true);
    }
  });
});

describe('city plan: content', () => {
  it('has the expected number of spawns, dropoffs, shops, spots and NPC entrances', () => {
    expect(cellsOf('@').length).toBe(8);
    expect(cellsOf('D').length).toBe(2);
    expect(cellsOf('S').length).toBe(2);
    const spots = cellsOf(SPOT_CHARS).length;
    expect(spots).toBeGreaterThanOrEqual(36);
    expect(spots).toBeLessThanOrEqual(48);
    const npcs = cellsOf('N').length;
    expect(npcs).toBeGreaterThanOrEqual(4);
    expect(npcs).toBeLessThanOrEqual(8);
  });

  it('uses every spot type', () => {
    for (const ch of SPOT_CHARS) expect(cellsOf(ch).length, `spot ${ch}`).toBeGreaterThan(0);
  });

  it('puts NPC entrances at street ends next to the border or on a side street near the main street', () => {
    let inner = 0;
    for (const { r, c } of cellsOf('N')) {
      const nextToBorder = r === 1 || c === 1 || r === ROWS - 2 || c === COLS - 2;
      const nearCrossing =
        !nextToBorder && ((r >= 13 && r <= 17) || (r >= 23 && r <= 27)) && [14, 15, 31, 32, 48, 49].includes(c);
      if (nearCrossing) inner++;
      expect(nextToBorder || nearCrossing, `N at ${r},${c}`).toBe(true);
      const road = NEIGHBOURS.some(([dr, dc]) => isWalk(r + dr, c + dc) && '=+'.includes(at(r + dr, c + dc)));
      expect(road, `N at ${r},${c} has no road next to it`).toBe(true);
    }
    expect(inner, 'NPC entrances near the centre').toBeGreaterThanOrEqual(2);
  });

  it('places spawns on the main street sidewalks with room to move', () => {
    for (const { r, c } of cellsOf('@')) {
      expect(r === 18 || r === 22, `@ at ${r},${c}`).toBe(true);
      const free = NEIGHBOURS.filter(([dr, dc]) => isWalk(r + dr, c + dc)).length;
      expect(free, `@ at ${r},${c}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('keeps every dropoff and shop within 30 tiles of each spawn and the pairs 24 tiles apart', () => {
    const spawns = cellsOf('@');
    const dropoffs = cellsOf('D');
    const shops = cellsOf('S');
    for (const s of spawns) {
      expect(Math.min(...dropoffs.map((d) => dist(s, d))), `dropoff near ${s.r},${s.c}`).toBeLessThanOrEqual(30);
      expect(Math.min(...shops.map((d) => dist(s, d))), `shop near ${s.r},${s.c}`).toBeLessThanOrEqual(30);
    }
    expect(dist(dropoffs[0], dropoffs[1])).toBeGreaterThanOrEqual(24);
    expect(dist(shops[0], shops[1])).toBeGreaterThanOrEqual(24);
  });

  it('parks cars only as pairs', () => {
    const cars = components('c');
    expect(cars.length).toBeGreaterThanOrEqual(4);
    for (const car of cars) expect(car.cells.length, `car at ${car.cells[0].r},${car.cells[0].c}`).toBe(2);
  });

  it('has lamps and trees', () => {
    expect(cellsOf('l').length).toBeGreaterThanOrEqual(10);
    expect(cellsOf('l').length).toBeLessThanOrEqual(16);
    expect(cellsOf('t').length).toBeGreaterThanOrEqual(20);
    expect(cellsOf('o').length).toBeGreaterThan(0);
  });
});

describe('city plan: soft obstacles', () => {
  it('makes every tree and lamp soft and not solid, and nothing else soft', () => {
    const { cols, solid, soft } = CITY_TILED_MAP;
    expect(soft).toBeDefined();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const i = r * cols + c;
        const isSoftChar = SOFT_CHARS.includes(at(r, c));
        expect(soft![i], `soft ${at(r, c)} at ${r},${c}`).toBe(isSoftChar);
        if (isSoftChar) expect(solid[i], `solid ${at(r, c)} at ${r},${c}`).toBe(false);
      }
    }
  });

  it('lets the player walk right next to a tree trunk but not into its core', () => {
    const m = CITY_TILED_MAP;
    const { r, c } = cellsOf('t')[0];
    const cx = c * TILE + TILE / 2;
    const cy = r * TILE + TILE / 2;
    expect(boxBlocked(m, cx, cy, CONFIG.playerHalf)).toBe(true);
    expect(boxBlocked(m, cx - CONFIG.softHalf - CONFIG.playerHalf, cy, CONFIG.playerHalf)).toBe(false);
  });
});

describe('city plan: soft obstacles do not block a straight approach', () => {
  it('lets the player walk straight past every free soft tile from all four sides', () => {
    const m = CITY_TILED_MAP;
    const half = CONFIG.playerHalf;
    let checked = 0;
    for (let r = 0; r < m.rows; r++) {
      for (let c = 0; c < m.cols; c++) {
        const idx = r * m.cols + c;
        if (!m.soft![idx]) continue;
        const cx = c * TILE + TILE / 2;
        const cy = r * TILE + TILE / 2;
        const others = { ...m, soft: m.soft!.map((v, i) => v && i !== idx) };
        for (const [ux, uy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          // Weg von 32 px vor der Mitte bis 12 px dahinter muss frei von Wänden und fremden Kernen sein
          let free = true;
          for (let d = -32; d <= 12 && free; d++) free = !boxBlocked(others, cx + ux * d, cy + uy * d, half);
          if (!free) continue;
          const state = createGame(1, m, ['p1']);
          const p = state.players.p1;
          p.x = cx - ux * 32;
          p.y = cy - uy * 32;
          let reached = false;
          for (let i = 0; i < 150 && !reached; i++) {
            walk(m, p, { ...NO_INPUT, moveX: ux, moveY: uy }, 20);
            reached = ux * (p.x - cx) + uy * (p.y - cy) >= 12;
          }
          expect(reached, `soft tile at ${r},${c} approached by ${ux},${uy}`).toBe(true);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(20);
  });
});

describe('city plan: buildings', () => {
  const blocks = components(BUILDINGS);

  it('has at least 8 blocks with at least 3 different letters and varied sizes', () => {
    expect(blocks.length).toBeGreaterThanOrEqual(8);
    expect(new Set(blocks.map((b) => b.ch)).size).toBeGreaterThanOrEqual(3);
    const sizes = new Set(blocks.map((b) => {
      const rs = b.cells.map((x) => x.r);
      const cs = b.cells.map((x) => x.c);
      return `${Math.max(...cs) - Math.min(...cs) + 1}x${Math.max(...rs) - Math.min(...rs) + 1}`;
    }));
    expect(sizes.size).toBeGreaterThanOrEqual(4);
  });

  it('makes every building at least 3 tiles wide and 3 tiles high everywhere', () => {
    for (const { r, c } of cellsOf(BUILDINGS)) {
      const ch = at(r, c);
      let w = 1;
      for (let x = c - 1; x >= 0 && at(r, x) === ch; x--) w++;
      for (let x = c + 1; x < COLS && at(r, x) === ch; x++) w++;
      let h = 1;
      for (let y = r - 1; y >= 0 && at(y, c) === ch; y--) h++;
      for (let y = r + 1; y < ROWS && at(y, c) === ch; y++) h++;
      expect(w, `width at ${r},${c}`).toBeGreaterThanOrEqual(3);
      expect(h, `height at ${r},${c}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('follows the district sketch: houses left, shops in the middle, offices right', () => {
    const lettersIn = (r0: number, r1: number, c0: number, c1: number) => {
      const s = new Set<string>();
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (BUILDINGS.includes(at(r, c))) s.add(at(r, c));
      return [...s].sort().join('');
    };
    expect(lettersIn(1, 17, 1, 12)).toBe('ER');
    expect(lettersIn(1, 17, 17, 29)).toBe('EY');
    expect(lettersIn(1, 17, 34, 46)).toBe('X');
  });
});

describe('city plan: streets', () => {
  const allRoad = (cells: Cell[]) => cells.every(({ r, c }) => ROAD_CHARS.includes(at(r, c)));

  it('has a through main street with a 3-tile carriageway around rows 18 to 22', () => {
    const row = (r: number) => Array.from({ length: COLS - 2 }, (_, i) => ({ r, c: i + 1 }));
    expect(allRoad(row(20))).toBe(true);
    for (let c = 1; c < COLS - 1; c++) {
      for (const r of [19, 21]) expect('=+Nc', `main street ${r},${c}`).toContain(at(r, c));
    }
  });

  it('has three north-south side streets near columns 14, 31 and 48 with zebra crossings', () => {
    for (const near of [14, 31, 48]) {
      const roadCols: number[] = [];
      for (let c = near - 2; c <= near + 2; c++) {
        const col = Array.from({ length: ROWS - 2 }, (_, i) => ({ r: i + 1, c }));
        if (allRoad(col)) roadCols.push(c);
      }
      expect(roadCols.length, `side street near ${near}`).toBeGreaterThanOrEqual(1);
      expect(roadCols.length, `side street near ${near}`).toBeLessThanOrEqual(3);
      const zebra = cellsOf('+').filter(({ r, c }) => Math.abs(c - near) <= 3 && r >= 16 && r <= 24);
      expect(zebra.length, `zebra near ${near}`).toBeGreaterThan(0);
    }
  });
});

describe('city plan: reachability', () => {
  const targets = cellsOf('@DSN' + SPOT_CHARS);

  it('puts every object of the generated map on a walkable tile', () => {
    const m = CITY_TILED_MAP;
    for (const p of [...m.spots, ...m.dropoffs, ...m.shops, ...m.spawns, ...m.npcSpawns]) {
      expect(isSolidAt(m, p.x, p.y), `object at ${p.x},${p.y}`).toBe(false);
    }
    expect(m.spots.length + m.dropoffs.length + m.shops.length + m.spawns.length + m.npcSpawns.length).toBe(
      targets.length,
    );
  });

  it('reaches every spot, dropoff, shop, spawn and NPC entrance from every spawn', () => {
    for (const s of cellsOf('@')) {
      const reach = reachable(s);
      for (const t of targets) {
        expect(reach.has(t.r * COLS + t.c), `${at(t.r, t.c)} at ${t.r},${t.c} from @ ${s.r},${s.c}`).toBe(true);
      }
    }
  });
});

describe('city zones', () => {
  it('defines stadium and concert', () => {
    expect(CITY_ZONES.map((z) => z.id)).toEqual(['stadium', 'concert']);
    expect(CITY_ZONES.map((z) => z.name)).toEqual(['Stadion', 'Konzert']);
  });

  it('are tile-aligned, at least 12 x 6 tiles, inside the map and fully walkable', () => {
    for (const z of CITY_ZONES) {
      const { x0, y0, x1, y1 } = z.area;
      for (const v of [x0, y0, x1, y1]) expect(v % TILE, z.id).toBe(0);
      expect(x0).toBeGreaterThanOrEqual(0);
      expect(y0).toBeGreaterThanOrEqual(0);
      expect(x1).toBeLessThanOrEqual(COLS * TILE);
      expect(y1).toBeLessThanOrEqual(ROWS * TILE);
      expect((x1 - x0) / TILE, z.id).toBeGreaterThanOrEqual(12);
      expect((y1 - y0) / TILE, z.id).toBeGreaterThanOrEqual(6);
      for (let r = y0 / TILE; r < y1 / TILE; r++) {
        for (let c = x0 / TILE; c < x1 / TILE; c++) expect(isWalk(r, c), `${z.id} tile ${r},${c}`).toBe(true);
      }
    }
  });

  it('hold at least 6 spots each', () => {
    for (const z of CITY_ZONES) {
      const { x0, y0, x1, y1 } = z.area;
      const inside = CITY_TILED_MAP.spots.filter((p) => p.x >= x0 && p.x < x1 && p.y >= y0 && p.y < y1);
      expect(inside.length, z.id).toBeGreaterThanOrEqual(6);
    }
  });

  it('puts the stadium top right and the concert bottom right', () => {
    const [stadium, concert] = CITY_ZONES.map((z) => z.area);
    expect(stadium.x0).toBeGreaterThanOrEqual(48 * TILE);
    expect(stadium.y1).toBeLessThanOrEqual(18 * TILE);
    expect(concert.x0).toBeGreaterThanOrEqual(48 * TILE);
    expect(concert.y0).toBeGreaterThanOrEqual(23 * TILE);
  });
});
