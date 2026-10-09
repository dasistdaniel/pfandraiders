import { freshProgress } from '@pfandraiders/core';
import { describe, expect, it } from 'vitest';
import { parseProgress, parseRanking } from '../src/shopGuard';

describe('parseProgress', () => {
  it('accepts a full progress and copies it', () => {
    const p = { ...freshProgress(), money: 120, earnedTotal: 50 };
    p.items = { bag: 4, backpack: 2, cart: 1, flashlight: 3, card: 1, card_plus: 1, punch: 3, dog_treat: 99 };
    const out = parseProgress(JSON.parse(JSON.stringify(p)));
    expect(out).toEqual(p);
    expect(out!.items).not.toBe(p.items);
  });

  it('ignores unknown keys in items', () => {
    const p = JSON.parse(JSON.stringify(freshProgress()));
    p.items.food = 3;
    expect(parseProgress(p)).toEqual(freshProgress());
  });

  it('rejects broken values', () => {
    const ok = freshProgress();
    const bad: unknown[] = [
      null,
      [],
      { ...ok, money: -1 },
      { ...ok, money: 1.5 },
      { ...ok, items: null },
      { ...ok, items: { ...ok.items, bag: 5 } },
      { ...ok, items: { ...ok.items, cart: 2 } },
      { ...ok, items: { ...ok.items, flashlight: 4 } },
      { ...ok, items: { ...ok.items, dog_treat: 100 } },
      { ...ok, items: { ...ok.items, card: -1 } },
      { ...ok, items: { bag: 0 } },
      { ...ok, earnedTotal: Number.NaN },
    ];
    for (const b of bad) expect(parseProgress(b)).toBeNull();
  });
});

describe('parseRanking', () => {
  it('accepts entries with id, money, round and total', () => {
    const e = [{ id: 'p1', money: 5, round: 3, total: 9 }];
    expect(parseRanking(e)).toEqual(e);
  });

  it('rejects anything else', () => {
    expect(parseRanking({})).toBeNull();
    expect(parseRanking([{ id: 'p1', money: 5, round: 3 }])).toBeNull();
    expect(parseRanking([{ id: 5, money: 5, round: 3, total: 1 }])).toBeNull();
  });
});
