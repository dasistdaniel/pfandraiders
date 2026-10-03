import { describe, expect, it } from 'vitest';
import cityJson from '../src/maps/city.tiled.json';
import { CITY_MAP, CITY_ASCII_MAP } from '../src/maps/city';
import { CITY_ROWS, CITY_ZONES } from '../src/maps/city-ascii';
import { asciiToTiled } from '../scripts/asciiToTiled';

describe('city map parity', () => {
  it('the Tiled map equals the ASCII map', () => {
    expect(CITY_MAP).toEqual(CITY_ASCII_MAP);
  });
  it('the committed JSON is up to date with the ASCII source', () => {
    expect(cityJson).toEqual(asciiToTiled(CITY_ROWS, CITY_ZONES));
  });
  it('asciiToTiled throws on an unknown character', () => {
    expect(() => asciiToTiled(['#x#'], [])).toThrow(/unknown map char/);
  });
});
