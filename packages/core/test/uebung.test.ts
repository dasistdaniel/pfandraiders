import { describe, expect, it } from 'vitest';
import { isMapId, MAP_DEFS, MAP_LIST } from '../src/maps';

describe('example custom map', () => {
  it('uebung is registered after the built-in maps with name and tileset', () => {
    expect(isMapId('uebung')).toBe(true);
    expect(MAP_LIST.map((m) => m.id).slice(0, 3)).toEqual(['city', 'retro', 'uebung']);
    expect(MAP_DEFS.uebung).toMatchObject({ id: 'uebung', name: 'Übung', tileset: 'city', builtin: false });
    expect([MAP_DEFS.uebung.map.cols, MAP_DEFS.uebung.map.rows]).toEqual([40, 24]);
    expect(MAP_DEFS.uebung.map.spawns).toHaveLength(8);
    expect(MAP_DEFS.uebung.visuals?.ground).toHaveLength(40 * 24);
  });
});
