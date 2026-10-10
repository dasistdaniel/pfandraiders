import { describe, expect, it } from 'vitest';
import { buildRegistry, customMapDef, customMapDefs, customMapIdProblem, MAP_DEFS, mapProblemsText } from '../src/maps';
import type { CustomMapSource } from '../src/maps';
import { fixtureCityMap, fixtureMap } from './mapFixture';

const src = (id: string, json: unknown = fixtureMap()): CustomMapSource => ({ id, file: `${id}.tiled.json`, json });
const BUILTIN = new Set(['city', 'retro']);

describe('customMapIdProblem', () => {
  it('accepts a free, well-formed id', () => {
    expect(customMapIdProblem('park-2', BUILTIN)).toBeNull();
  });

  it('names bad ids, built-in ids and duplicates', () => {
    expect(customMapIdProblem('Park', BUILTIN)).toBe(
      'Kennung "Park" ist ungültig: erlaubt sind a-z, 0-9 und "-", 1 bis 24 Zeichen (Dateiname ohne .tiled.json).',
    );
    expect(customMapIdProblem('retro', BUILTIN)).toBe('Kennung "retro" gehört einer eingebauten Karte; bitte die Datei umbenennen.');
    expect(customMapIdProblem('park', new Set(['park']))).toBe('Kennung "park" gibt es doppelt.');
  });
});

describe('customMapDef', () => {
  it('turns a valid map into a registry entry with name and tileset from the properties', () => {
    const def = customMapDef(src('test-1'), BUILTIN);
    expect(def).toMatchObject({ id: 'test-1', name: 'Testkarte', tileset: 'retro', visuals: null, builtin: false });
    expect(def.map.spawns).toHaveLength(8);
  });

  it('keeps the visuals of a city map', () => {
    const def = customMapDef(src('stadt-2', fixtureCityMap()), BUILTIN);
    expect(def.tileset).toBe('city');
    expect(def.visuals?.cols).toBe(32);
  });

  it('falls back to the id as name', () => {
    const m = fixtureMap();
    m.properties = m.properties.filter((p) => p.name !== 'name');
    expect(customMapDef(src('ohne-name', m), BUILTIN).name).toBe('ohne-name');
  });

  it('rejects a custom map named like a built-in map', () => {
    expect(() => customMapDef(src('city'), BUILTIN)).toThrow(
      'Eigene Karte city.tiled.json ist ungültig:\n  - Kennung "city" gehört einer eingebauten Karte; bitte die Datei umbenennen.',
    );
  });

  it('names the file and lists every problem of an invalid map', () => {
    const m = fixtureMap();
    const objects = m.layers[1].objects as Record<string, unknown>[];
    m.layers[1].objects = objects.filter((o) => o.type !== 'spawn' && o.type !== 'dropoff');
    let message = '';
    try {
      customMapDef(src('kaputt', m), BUILTIN);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message.split('\n')).toEqual([
      'Eigene Karte kaputt.tiled.json ist ungültig:',
      '  - Startpunkte (spawn): 0, nötig sind genau 8.',
      '  - Pfandautomaten (dropoff): 0, nötig ist mindestens 1.',
    ]);
  });

  it('formats problem lists', () => {
    expect(mapProblemsText('a.tiled.json', ['eins', 'zwei'])).toBe('Eigene Karte a.tiled.json ist ungültig:\n  - eins\n  - zwei');
  });
});

describe('customMapDefs and buildRegistry', () => {
  it('keeps the given order and rejects duplicates', () => {
    expect(customMapDefs([src('b'), src('a')]).map((d) => d.id)).toEqual(['b', 'a']);
    expect(() => customMapDefs([src('a'), src('a')])).toThrow(/gibt es doppelt/);
  });

  it('puts the built-in maps first and protects their ids', () => {
    expect(buildRegistry([MAP_DEFS.city], [src('zz'), src('aa')]).map((d) => d.id)).toEqual(['city', 'zz', 'aa']);
    expect(() => buildRegistry([MAP_DEFS.city], [src('city')])).toThrow(/eingebauten Karte/);
  });
});
