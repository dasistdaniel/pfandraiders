import { describe, expect, it } from 'vitest';
import { totalBottles } from '../src/bottles';
import { CONFIG } from '../src/config';
import { rollContents } from '../src/loot';
import type { SpotType } from '../src/types';

describe('rollContents', () => {
  const types = Object.keys(CONFIG.spotTypes) as SpotType[];

  it('always returns at least one bottle and respects the table', () => {
    const rng = { rngState: 123 };
    for (const type of types) {
      const table = CONFIG.spotTypes[type];
      for (let i = 0; i < 300; i++) {
        const c = rollContents(rng, type);
        expect(totalBottles(c)).toBeGreaterThanOrEqual(1);
        expect(c.glass).toBeLessThanOrEqual(table.glass[1]);
        expect(c.crate).toBeLessThanOrEqual(table.crate[1]);
        // plastic darf auf 1 angehoben werden, wenn sonst nichts gefallen ist
        expect(c.plastic).toBeLessThanOrEqual(Math.max(table.plastic[1], 1));
      }
    }
  });

  it('is deterministic for the same rng state', () => {
    const a = { rngState: 5 };
    const b = { rngState: 5 };
    expect(rollContents(a, 'park')).toEqual(rollContents(b, 'park'));
  });
});
