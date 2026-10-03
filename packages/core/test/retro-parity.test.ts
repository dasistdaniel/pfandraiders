import { describe, expect, it } from 'vitest';
import retroJson from '../src/maps/retro.tiled.json';
import { RETRO_MAP, RETRO_ASCII_MAP } from '../src/maps/retro';
import { RETRO_ROWS, RETRO_ZONES } from '../src/maps/retro-ascii';
import { asciiToTiled } from '../scripts/asciiToTiled';

describe('retro map parity', () => {
  it('the Tiled map equals the ASCII map', () => {
    expect(RETRO_MAP).toEqual(RETRO_ASCII_MAP);
  });
  it('the committed JSON is up to date with the ASCII source', () => {
    expect(retroJson).toEqual(asciiToTiled(RETRO_ROWS, RETRO_ZONES));
  });
  it('asciiToTiled throws on an unknown character', () => {
    expect(() => asciiToTiled(['#x#'], [])).toThrow(/unknown map char/);
  });
});
