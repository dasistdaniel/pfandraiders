import { describe, expect, it } from 'vitest';
import { bottlesValue, emptyBottles, totalBottles, transferBottles } from '../src/bottles';

describe('bottles', () => {
  it('counts and values bottles in cents', () => {
    const b = { plastic: 2, glass: 1, crate: 1 };
    expect(totalBottles(b)).toBe(4);
    expect(bottlesValue(b)).toBe(2 * 8 + 15 + 25);
    expect(bottlesValue(emptyBottles())).toBe(0);
  });

  it('transfers highest value first when capacity is short', () => {
    const from = { plastic: 3, glass: 2, crate: 1 };
    const to = emptyBottles();
    transferBottles(from, to, 4);
    expect(to).toEqual({ plastic: 1, glass: 2, crate: 1 });
    expect(from).toEqual({ plastic: 2, glass: 0, crate: 0 });
  });

  it('moves nothing into a full container', () => {
    const from = { plastic: 2, glass: 0, crate: 0 };
    const to = { plastic: 3, glass: 0, crate: 0 };
    transferBottles(from, to, 3);
    expect(to.plastic).toBe(3);
    expect(from.plastic).toBe(2);
  });

  it('never loses bottles', () => {
    const from = { plastic: 5, glass: 4, crate: 3 };
    const to = { plastic: 1, glass: 0, crate: 0 };
    const before = totalBottles(from) + totalBottles(to);
    transferBottles(from, to, 6);
    expect(totalBottles(from) + totalBottles(to)).toBe(before);
    expect(totalBottles(to)).toBe(6);
  });
});
