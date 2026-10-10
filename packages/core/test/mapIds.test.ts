import { describe, expect, it } from 'vitest';
import {
  BUILTIN_MAP_IDS,
  cleanMapName,
  isMapIdSyntax,
  isTilesetId,
  MAX_MAP_ID_LENGTH,
  MAX_MAP_NAME_LENGTH,
  TILESET_IDS,
} from '../src/maps/mapIds';

describe('map id syntax', () => {
  it('accepts a-z, 0-9 and dashes up to 24 characters', () => {
    expect(MAX_MAP_ID_LENGTH).toBe(24);
    for (const id of ['uebung', 'a', 'park-2', '2024', 'x'.repeat(24)]) expect(isMapIdSyntax(id), id).toBe(true);
  });

  it('rejects everything else', () => {
    for (const id of ['', 'Uebung', 'über', 'a_b', 'a b', 'a.b', 'x'.repeat(25), '__proto__', 7, null, undefined]) {
      expect(isMapIdSyntax(id), String(id)).toBe(false);
    }
  });

  it('knows the built-in maps and the two tilesets', () => {
    expect(BUILTIN_MAP_IDS).toEqual(['city', 'retro']);
    expect(TILESET_IDS).toEqual(['city', 'retro']);
    expect(isTilesetId('city')).toBe(true);
    expect(isTilesetId('retro')).toBe(true);
    for (const v of ['Retro', '', 'kenney', null, 1]) expect(isTilesetId(v)).toBe(false);
  });
});

describe('cleanMapName', () => {
  it('trims and removes control and format characters', () => {
    expect(cleanMapName('  Übung  ')).toBe('Übung');
    expect(cleanMapName('Park​\u0007platz')).toBe('Parkplatz');
  });

  it('rejects empty, too long and non-text names', () => {
    expect(MAX_MAP_NAME_LENGTH).toBe(24);
    expect(cleanMapName('   ')).toBeNull();
    expect(cleanMapName('x'.repeat(24))).toBe('x'.repeat(24));
    expect(cleanMapName('x'.repeat(25))).toBeNull();
    expect(cleanMapName(7)).toBeNull();
    expect(cleanMapName(undefined)).toBeNull();
  });
});
