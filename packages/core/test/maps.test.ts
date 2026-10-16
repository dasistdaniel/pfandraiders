import { describe, expect, it } from 'vitest';
import { CITY_MAP, DEFAULT_MAP_ID, isMapId, isSelectableMapId, MAP_DEFS, MAP_LIST, mapName, SELECTABLE_MAPS, stepMapId } from '../src/maps';
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
      { id: 'city', name: 'Stadt', hidden: false },
      { id: 'retro', name: 'Retro', hidden: false },
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

  it('stepMapId cycles through the selectable maps and starts over for unknown ids', () => {
    const ids = SELECTABLE_MAPS.map((m) => m.id);
    expect(stepMapId(ids[0], 1)).toBe(ids[1 % ids.length]);
    expect(stepMapId(ids[0], -1)).toBe(ids[ids.length - 1]);
    expect(stepMapId(ids[ids.length - 1], 1)).toBe(ids[0]);
    expect(stepMapId('moon', 1)).toBe(ids[0]);
    expect(stepMapId('moon', -1)).toBe(ids[0]);
  });

  it('hides maps with the property hidden from the selection, but keeps them registered', () => {
    expect(SELECTABLE_MAPS.map((m) => m.id)).toEqual(MAP_LIST.filter((m) => !m.hidden).map((m) => m.id));
    expect(isMapId('uebung')).toBe(true);
    expect(isSelectableMapId('uebung')).toBe(false);
    expect(isSelectableMapId('city')).toBe(true);
    expect(isSelectableMapId('moon')).toBe(false);
    expect(MAP_DEFS.city.hidden).toBe(false);
  });

  it('stepMapId skips hidden maps; from a hidden map it goes to the first selectable one', () => {
    const list = [
      { id: 'a', name: 'A', hidden: false },
      { id: 'h', name: 'H', hidden: true },
      { id: 'b', name: 'B', hidden: false },
    ];
    expect(stepMapId('a', 1, list)).toBe('b');
    expect(stepMapId('b', -1, list)).toBe('a');
    expect(stepMapId('b', 1, list)).toBe('a');
    expect(stepMapId('h', 1, list)).toBe('a');
    expect(stepMapId('h', -1, list)).toBe('a');
    // die Übungskarte ist versteckt: von retro geht es zurück zur Stadt
    expect(stepMapId('retro', 1)).toBe('city');
    expect(stepMapId('uebung', 1)).toBe('city');
  });
});
