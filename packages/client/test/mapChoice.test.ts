import { DEFAULT_MAP_ID } from '@pfandraiders/core';
import { describe, expect, it } from 'vitest';
import { chooseLocalMapId, mapLine } from '../src/mapChoice';

describe('chooseLocalMapId', () => {
  it('prefers ?map= over the lobby choice over the stored map', () => {
    expect(chooseLocalMapId('retro', 'city', 'city')).toBe('retro');
    expect(chooseLocalMapId(null, 'retro', 'city')).toBe('retro');
    expect(chooseLocalMapId(null, undefined, 'retro')).toBe('retro');
  });

  it('keeps the map of the series after the shop', () => {
    // Der Shop reicht die Karte als `chosen` weiter; eine inzwischen anders gespeicherte Wahl zählt nicht
    expect(chooseLocalMapId(null, 'retro', 'city')).toBe('retro');
  });

  it('skips unknown ids at every level', () => {
    expect(chooseLocalMapId('moon', 'retro', 'city')).toBe('retro');
    expect(chooseLocalMapId('moon', 'mars', 'retro')).toBe('retro');
    expect(chooseLocalMapId('moon', 'mars', 'venus')).toBe(DEFAULT_MAP_ID);
    expect(chooseLocalMapId('__proto__', {}, 'constructor')).toBe(DEFAULT_MAP_ID);
  });
});

describe('mapLine', () => {
  it('names the map with the up/down hint', () => {
    expect(mapLine('city')).toBe('Karte: ▲ Stadt ▼  (hoch/runter)');
    expect(mapLine('retro')).toBe('Karte: ▲ Retro ▼  (hoch/runter)');
  });
});
