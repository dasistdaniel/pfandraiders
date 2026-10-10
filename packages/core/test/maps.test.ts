import { describe, expect, it } from 'vitest';
import { CITY_MAP, DEFAULT_MAP_ID, isMapId, MAP_DEFS, MAP_LIST, mapName, stepMapId } from '../src/maps';
import { RETRO_MAP } from '../src/maps/retro';

describe('map registry', () => {
  it('isMapId accepts registered maps only', () => {
    expect(isMapId('city')).toBe(true);
    expect(isMapId('retro')).toBe(true);
    for (const v of ['x', '', 'CITY', null, undefined, 7, {}, [], '__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
      expect(isMapId(v)).toBe(false);
    }
  });

  it('MAP_DEFS has no prototype', () => {
    expect(Object.getPrototypeOf(MAP_DEFS)).toBeNull();
    expect(MAP_DEFS.constructor).toBeUndefined();
    expect(Object.isFrozen(MAP_DEFS)).toBe(true);
  });

  it('lists the built-in maps first and every entry with valid map data', () => {
    expect(MAP_LIST.slice(0, 2)).toEqual([
      { id: 'city', name: 'Stadt' },
      { id: 'retro', name: 'Retro' },
    ]);
    expect(Object.keys(MAP_DEFS).sort()).toEqual(MAP_LIST.map((m) => m.id).sort());
    for (const { id, name } of MAP_LIST) {
      const def = MAP_DEFS[id];
      expect(def.id).toBe(id);
      expect(def.name).toBe(name);
      expect(def.map.solid.length).toBe(def.map.cols * def.map.rows);
      expect(def.map.spawns.length).toBeGreaterThan(0);
    }
    expect(MAP_DEFS.city).toMatchObject({ tileset: 'city', builtin: true });
    expect(MAP_DEFS.retro).toMatchObject({ tileset: 'retro', builtin: true, visuals: null });
  });

  it('sorts custom maps by id after the built-in maps', () => {
    const custom = MAP_LIST.slice(2).map((m) => m.id);
    expect(custom).toEqual([...custom].sort());
    for (const id of custom) expect(MAP_DEFS[id].builtin).toBe(false);
  });

  it('CITY_MAP is the default map', () => {
    expect(DEFAULT_MAP_ID).toBe('city');
    expect(CITY_MAP).toBe(MAP_DEFS[DEFAULT_MAP_ID].map);
  });

  it('retro points at RETRO_MAP', () => {
    expect(MAP_DEFS.retro.map).toBe(RETRO_MAP);
  });

  it('mapName returns the display name or the id itself', () => {
    expect(mapName('city')).toBe('Stadt');
    expect(mapName('retro')).toBe('Retro');
    expect(mapName('moon')).toBe('moon');
  });

  it('stepMapId cycles through MAP_LIST and starts over for unknown ids', () => {
    const ids = MAP_LIST.map((m) => m.id);
    expect(stepMapId(ids[0], 1)).toBe(ids[1 % ids.length]);
    expect(stepMapId(ids[0], -1)).toBe(ids[ids.length - 1]);
    expect(stepMapId(ids[ids.length - 1], 1)).toBe(ids[0]);
    expect(stepMapId('moon', 1)).toBe(ids[0]);
    expect(stepMapId('moon', -1)).toBe(ids[0]);
  });
});
