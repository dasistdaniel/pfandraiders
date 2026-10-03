import { describe, expect, it } from 'vitest';
import { CITY_MAP, DEFAULT_MAP_ID, isMapId, MAP_DEFS } from '../src/maps';
import { RETRO_MAP } from '../src/maps/retro';

describe('map registry', () => {
  it('isMapId accepts only city and retro', () => {
    expect(isMapId('city')).toBe(true);
    expect(isMapId('retro')).toBe(true);
    for (const v of ['x', '', 'CITY', null, undefined, 7, {}, [], '__proto__', 'constructor']) {
      expect(isMapId(v)).toBe(false);
    }
  });

  it('MAP_DEFS has both entries with valid map data', () => {
    expect(Object.keys(MAP_DEFS).sort()).toEqual(['city', 'retro']);
    for (const id of ['city', 'retro'] as const) {
      const def = MAP_DEFS[id];
      expect(def.id).toBe(id);
      expect(def.tileset).toBe(id);
      expect(def.name.length).toBeGreaterThan(0);
      expect(def.map.cols).toBeGreaterThan(0);
      expect(def.map.rows).toBeGreaterThan(0);
      expect(def.map.solid.length).toBe(def.map.cols * def.map.rows);
      expect(def.map.spawns.length).toBeGreaterThan(0);
    }
  });

  it('CITY_MAP is the default map', () => {
    expect(DEFAULT_MAP_ID).toBe('city');
    expect(CITY_MAP).toBe(MAP_DEFS[DEFAULT_MAP_ID].map);
  });

  it('retro points at RETRO_MAP', () => {
    expect(MAP_DEFS.retro.map).toBe(RETRO_MAP);
  });
});
