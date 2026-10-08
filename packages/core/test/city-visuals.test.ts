import { describe, expect, it } from 'vitest';
import cityJson from '../src/maps/city.tiled.json';
import { CITY_PLAN, CITY_ZONES } from '../src/maps/cityPlan';
import { getCityVisuals } from '../src/maps/city';
import { MAP_DEFS, MAP_VISUALS } from '../src/maps';
import { parseTiledVisuals, SHEET_CELLS } from '../src/tiled';
import type { TiledMap } from '../src/tiled';
import { CITY_CELLS, gid, planToTiled } from '../scripts/planToTiled';

const COLS = 64;
const ROWS = 40;
const BUILDINGS = 'RYEX';
/** Zeichen ohne eigene Grafik in den Ebenen (Sprites im Client) */
const NO_GRAPHIC = '@DNbngmp';

const at = (r: number, c: number): string => CITY_PLAN[r][c];
const idx = (r: number, c: number): number => r * COLS + c;

function layerData(map: TiledMap, name: string): number[] {
  const l = map.layers.find((x) => x.name === name);
  if (!l || l.type !== 'tilelayer') throw new Error(`missing tilelayer ${name}`);
  return l.data;
}

const generated = planToTiled(CITY_PLAN, CITY_ZONES);
const ground = layerData(generated, 'ground');
const below = layerData(generated, 'below');
const softLayerData = layerData(generated, 'soft');
const above = layerData(generated, 'above');

function cellsOf(chars: string): { r: number; c: number }[] {
  const out: { r: number; c: number }[] = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (chars.includes(at(r, c))) out.push({ r, c });
  return out;
}

describe('city visuals: cell numbers', () => {
  it('numbers sheet cells row by row (gid = row * 37 + col + 1)', () => {
    expect(gid(0, 0)).toBe(1);
    expect(gid(11, 19)).toBe(715);
    expect(gid(36, 27)).toBe(SHEET_CELLS);
  });

  it('gives different letters disjoint roof cells and keeps roofs, facades and plain ground apart', () => {
    const roofs = BUILDINGS.split('').map((ch) => CITY_CELLS.roofs[ch]);
    roofs.forEach((set, i) => {
      expect(set.size, BUILDINGS[i]).toBeGreaterThan(0);
      roofs.forEach((other, j) => {
        if (i !== j) for (const g of set) expect(other.has(g), `${BUILDINGS[i]} vs ${BUILDINGS[j]}`).toBe(false);
      });
    });
    const allRoofs = new Set(roofs.flatMap((s) => [...s]));
    for (const g of CITY_CELLS.facades) {
      expect(allRoofs.has(g)).toBe(false);
      expect(CITY_CELLS.plainGround.has(g)).toBe(false);
    }
    for (const g of CITY_CELLS.plainGround) expect(allRoofs.has(g)).toBe(false);
  });
});

describe('city visuals: layers', () => {
  it('has three layers of 64 * 40 cells within the sheet', () => {
    for (const data of [ground, below, above]) {
      expect(data.length).toBe(COLS * ROWS);
      expect(data.filter((g) => !Number.isInteger(g) || g < 0 || g > SHEET_CELLS)).toEqual([]);
    }
  });

  it('has a ground cell on every tile', () => {
    expect(ground.flatMap((g, i) => (g === 0 ? [i] : []))).toEqual([]);
  });

  it('draws every building tile in below', () => {
    for (const { r, c } of cellsOf(BUILDINGS + 'W')) expect(below[idx(r, c)], `${r},${c}`).not.toBe(0);
  });

  it('puts the letter roof on every building tile above the bottom row and a facade on the bottom row', () => {
    for (const { r, c } of cellsOf(BUILDINGS)) {
      const ch = at(r, c);
      const bottom = r + 1 >= ROWS || at(r + 1, c) !== ch;
      if (bottom) {
        expect(CITY_CELLS.facades.has(below[idx(r, c)]), `facade ${r},${c}`).toBe(true);
        if (r > 0 && at(r - 1, c) === ch) expect(below[idx(r, c)], `${r},${c}`).not.toBe(below[idx(r - 1, c)]);
      } else {
        expect(CITY_CELLS.roofs[ch].has(below[idx(r, c)]), `roof ${ch} ${r},${c}`).toBe(true);
      }
    }
  });

  it('uses facade cells only on building tiles', () => {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if ((BUILDINGS + 'W').includes(at(r, c))) continue;
        expect(CITY_CELLS.facades.has(ground[idx(r, c)]), `ground ${r},${c}`).toBe(false);
        expect(CITY_CELLS.facades.has(below[idx(r, c)]), `below ${r},${c}`).toBe(false);
      }
    }
  });

  it('draws tree trunks in below and the crown one row above in above', () => {
    for (const { r, c } of cellsOf('t')) {
      expect(below[idx(r, c)], `trunk ${r},${c}`).not.toBe(0);
      if (r > 0) expect(above[idx(r - 1, c)], `crown ${r - 1},${c}`).not.toBe(0);
    }
  });

  it('has a soft layer with 1 on trees and lamps only, none of them in walls, and a visual for every soft tile', () => {
    const walls = layerData(generated, 'walls');
    expect(softLayerData.length).toBe(COLS * ROWS);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const i = idx(r, c);
        const isSoft = 'tl'.includes(at(r, c));
        expect(softLayerData[i], `soft ${r},${c}`).toBe(isSoft ? 1 : 0);
        if (!isSoft) continue;
        expect(walls[i], `walls ${r},${c}`).toBe(0);
        expect(below[i] !== 0 || above[i] !== 0, `visual ${r},${c}`).toBe(true);
      }
    }
  });

  it('draws lamps, cars and water in below', () => {
    for (const { r, c } of cellsOf('loc')) expect(below[idx(r, c)], `${at(r, c)} ${r},${c}`).not.toBe(0);
  });

  it('gives spots, dropoffs, spawns and NPC entrances no graphic, only plain ground', () => {
    for (const { r, c } of cellsOf(NO_GRAPHIC)) {
      expect(below[idx(r, c)], `below ${at(r, c)} ${r},${c}`).toBe(0);
      expect(CITY_CELLS.plainGround.has(ground[idx(r, c)]), `ground ${at(r, c)} ${r},${c}`).toBe(true);
    }
  });

  it('uses plain ground on all walkable tiles', () => {
    for (const { r, c } of cellsOf('=+.,')) {
      expect(CITY_CELLS.plainGround.has(ground[idx(r, c)]), `${r},${c}`).toBe(true);
    }
  });

  it('marks the roads: centre lines, zebra crossings and plain intersections', () => {
    // Hauptstraße Zeilen 19-21: Mittellinie in Zeile 20
    expect(ground[idx(20, 20)]).toBe(gid(13, 19));
    // Querstraße Spalten 14-15: geteilte Mittellinie
    expect(ground[idx(10, 14)]).toBe(gid(13, 21));
    expect(ground[idx(10, 15)]).toBe(gid(14, 21));
    // Kreuzung Hauptstraße x Querstraße: glatter Asphalt
    expect(ground[idx(20, 14)]).toBe(gid(11, 19));
    // Zebrastreifen: über die Hauptstraße (Spalte 13) waagerechte Balken, über die Querstraße senkrechte
    for (const r of [19, 20, 21]) expect(ground[idx(r, 13)]).toBe(gid(10, 22));
    for (const c of [14, 15]) {
      expect(ground[idx(18, c)]).toBe(gid(13, 22));
      expect(ground[idx(22, c)]).toBe(gid(13, 22));
    }
  });

  it('is deterministic', () => {
    expect(planToTiled(CITY_PLAN, CITY_ZONES)).toEqual(generated);
  });
});

describe('city visuals: committed JSON and registry', () => {
  it('the committed JSON equals the generator output', () => {
    expect(cityJson).toEqual(generated);
  });

  it('parses the visual layers of the committed JSON', () => {
    const v = parseTiledVisuals(cityJson);
    expect(v).not.toBeNull();
    expect(v?.cols).toBe(COLS);
    expect(v?.rows).toBe(ROWS);
    for (const data of [v!.ground, v!.below, v!.above]) expect(data.length).toBe(COLS * ROWS);
    expect(v?.ground).toEqual(ground);
  });

  it('registers the city visuals', () => {
    expect(getCityVisuals()).toEqual(parseTiledVisuals(cityJson));
    expect(MAP_VISUALS.city).toBe(getCityVisuals());
    expect(MAP_DEFS.city.visuals).toBe(getCityVisuals());
    expect(MAP_DEFS.retro.visuals).toBeNull();
  });

  it('parses the visuals lazily and only once', () => {
    // MAP_DEFS lässt sich lesen (Karte, Tileset), ohne die Ebenen anzufassen
    expect(MAP_DEFS.city.map.cols).toBe(COLS);
    expect(MAP_DEFS.city.tileset).toBe('city');
    expect(Object.keys(MAP_DEFS)).toEqual(['city', 'retro']);
    const a = MAP_DEFS.city.visuals;
    const b = MAP_DEFS.city.visuals;
    expect(a).not.toBeNull();
    expect(b).toBe(a);
    expect(MAP_VISUALS.city).toBe(a);
    expect(getCityVisuals()).toBe(a);
  });
});
