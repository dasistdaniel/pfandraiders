import { CITY_MAP, createGame, projectSnapshot } from '@pfandraiders/core';
import { describe, expect, it } from 'vitest';
import { isValidSnapshot } from '../src/snapshotGuard';

function snap(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(projectSnapshot(createGame(1, CITY_MAP, ['p1', 'p2']), 'p1')));
}

describe('isValidSnapshot and the countdown', () => {
  it('accepts a snapshot with a running or finished countdown', () => {
    const s = snap();
    expect(s.countdownMs).toBeGreaterThan(0);
    expect(isValidSnapshot(s)).toBe(true);
    s.countdownMs = 0;
    expect(isValidSnapshot(s)).toBe(true);
  });

  it('accepts a snapshot without the field (older server: no countdown)', () => {
    const s = snap();
    delete s.countdownMs;
    expect(isValidSnapshot(s)).toBe(true);
  });

  it('rejects a broken countdown', () => {
    for (const bad of [-1, 'x', null, Number.POSITIVE_INFINITY]) {
      const s = snap();
      s.countdownMs = bad;
      expect(isValidSnapshot(s)).toBe(false);
    }
  });
});
