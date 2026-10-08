import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { boxBlocked, parseMap } from '../src/map';
import { CITY_MAP } from '../src/maps';
import { lineClear, nextWaypoint } from '../src/path';
import { openRows } from './helpers';

/** Wand in Spalte 4 (Zeilen 2 bis 5), Lücke oben in Zeile 1. */
const WALL = parseMap([
  '##########',
  '#........#',
  '#...#....#',
  '#@..#....#',
  '#...#....#',
  '#...#....#',
  '##########',
]);
const LEFT = { x: 40, y: 56 }; // Kachel (2,3)
const RIGHT = { x: 104, y: 56 }; // Kachel (6,3)

describe('lineClear', () => {
  it('is true on an open line and false through a wall', () => {
    const open = parseMap(openRows(10, 5));
    expect(lineClear(open, { x: 24, y: 24 }, { x: 136, y: 40 })).toBe(true);
    expect(lineClear(WALL, LEFT, RIGHT)).toBe(false);
  });
});

describe('nextWaypoint', () => {
  it('returns null on the same tile', () => {
    expect(nextWaypoint(WALL, LEFT, { x: 44, y: 60 })).toBeNull();
  });

  it('leads around the wall through the gap', () => {
    const map = WALL;
    let at = { ...LEFT };
    for (let i = 0; i < 20; i++) {
      const wp = nextWaypoint(map, at, RIGHT);
      if (!wp) break;
      // jeder Wegpunkt ist auf gerader Linie erreichbar
      expect(lineClear(map, at, wp)).toBe(true);
      at = wp;
    }
    expect(Math.floor(at.x / 16)).toBe(6);
    expect(Math.floor(at.y / 16)).toBe(3);
  });

  it('returns null when the target is walled in', () => {
    const map = parseMap(['#######', '#@.#..#', '#..#..#', '#######']);
    expect(nextWaypoint(map, { x: 24, y: 24 }, { x: 72, y: 24 })).toBeNull();
  });

  it('avoids soft tiles and walls on the city map and stays deterministic', () => {
    const from = CITY_MAP.spawns[0];
    const to = { x: from.x + 120, y: from.y + 60 };
    const a = nextWaypoint(CITY_MAP, from, to);
    expect(a).toEqual(nextWaypoint(CITY_MAP, from, to));
    if (a) expect(boxBlocked(CITY_MAP, a.x, a.y, CONFIG.playerHalf)).toBe(false);
  });

  it('is cheap enough for 6 npcs at 20 Hz', () => {
    const from = CITY_MAP.spawns[0];
    const t0 = performance.now();
    for (let i = 0; i < 600; i++) nextWaypoint(CITY_MAP, from, { x: from.x + ((i * 37) % 200) - 100, y: from.y + ((i * 53) % 200) - 100 });
    // 600 Suchen entsprechen 30 s Spiel mit 6 NPCs bei einer Suche alle 300 ms
    expect(performance.now() - t0).toBeLessThan(1500);
  });
});
