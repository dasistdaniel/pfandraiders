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

describe('isValidSnapshot and the player shape', () => {
  it('accepts a real projected snapshot with items', () => {
    const state = createGame(1, CITY_MAP, ['p1', 'p2']);
    state.players.p1.items.cart = 1;
    state.players.p1.lastFood = { n: 1, spot: 'bin', text: 0, full: false };
    const s = JSON.parse(JSON.stringify(projectSnapshot(state, 'p1')));
    expect(isValidSnapshot(s)).toBe(true);
    expect(s.players.p2.items.cart).toBe(0);
  });

  it('rejects a player without items', () => {
    const s = snap();
    delete (s.players as Record<string, Record<string, unknown>>).p2.items;
    expect(isValidSnapshot(s)).toBe(false);
  });
});
