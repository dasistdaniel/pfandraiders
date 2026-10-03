import { describe, expect, it } from 'vitest';
import cityJson from '../src/maps/city.tiled.json';
import { CITY_TILED_MAP } from '../src/maps/city';
import { CITY_PLAN, CITY_ZONES } from '../src/maps/cityPlan';
import { MAP_DEFS } from '../src/maps';
import { RETRO_ASCII_MAP } from '../src/maps/retro';
import { parseTiledMap } from '../src/tiled';
import { planToTiled } from '../scripts/planToTiled';

describe('city map parity', () => {
  it('the Tiled map equals the plan', () => {
    expect(CITY_TILED_MAP).toEqual(parseTiledMap(planToTiled(CITY_PLAN, CITY_ZONES)));
  });
  it('the committed JSON is up to date with the plan', () => {
    expect(cityJson).toEqual(planToTiled(CITY_PLAN, CITY_ZONES));
  });
  it('planToTiled throws on an unknown character', () => {
    expect(() => planToTiled(['WxW'], [])).toThrow(/unknown map char/);
    expect(() => planToTiled(['W#W'], [])).toThrow(/unknown map char/);
  });
  it('planToTiled throws on rows of different length', () => {
    expect(() => planToTiled(['WWW', 'WW'], [])).toThrow(/length/);
  });
});

describe('map registry uses both parity-checked maps', () => {
  it('city is the new city', () => {
    expect(MAP_DEFS.city.map).toBe(CITY_TILED_MAP);
    expect(MAP_DEFS.city.name).toBe('Stadt');
    expect(MAP_DEFS.city.tileset).toBe('city');
    expect(MAP_DEFS.city.map.cols).toBe(64);
    expect(MAP_DEFS.city.map.rows).toBe(40);
  });
  it('retro is still the ASCII retro map', () => {
    expect(MAP_DEFS.retro.map).toEqual(RETRO_ASCII_MAP);
  });
});
