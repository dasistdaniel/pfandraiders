import { describe, expect, it } from 'vitest';
import { nextRandom, randInt } from '../src/rng';

describe('rng', () => {
  it('gives the same sequence for the same seed', () => {
    const a = { rngState: 42 };
    const b = { rngState: 42 };
    const seqA = Array.from({ length: 10 }, () => nextRandom(a));
    const seqB = Array.from({ length: 10 }, () => nextRandom(b));
    expect(seqA).toEqual(seqB);
  });

  it('gives different sequences for different seeds', () => {
    const a = { rngState: 1 };
    const b = { rngState: 2 };
    expect(nextRandom(a)).not.toEqual(nextRandom(b));
  });

  it('returns values in [0, 1)', () => {
    const r = { rngState: 7 };
    for (let i = 0; i < 1000; i++) {
      const v = nextRandom(r);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('randInt stays within inclusive bounds and reaches both ends', () => {
    const r = { rngState: 99 };
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(randInt(r, 2, 4));
    expect([...seen].sort()).toEqual([2, 3, 4]);
  });
});
