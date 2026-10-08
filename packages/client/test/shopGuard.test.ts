import { freshProgress } from '@pfandraiders/core';
import { describe, expect, it } from 'vitest';
import { parseProgress, parseRanking } from '../src/shopGuard';

describe('parseProgress', () => {
  it('accepts a valid progress and copies it', () => {
    const p = { ...freshProgress(), money: 120, containerLevel: 2 };
    p.upgrades.armor = 3;
    p.inventory.food = 99;
    const out = parseProgress(JSON.parse(JSON.stringify(p)));
    expect(out).toEqual(p);
  });

  it('rejects broken values', () => {
    const ok = freshProgress();
    const bad: unknown[] = [
      null,
      [],
      { ...ok, money: -1 },
      { ...ok, money: 1.5 },
      { ...ok, containerLevel: 4 },
      { ...ok, upgrades: { ...ok.upgrades, speed: 9 } },
      { ...ok, upgrades: { knockout: 0 } },
      { ...ok, inventory: { dog_treat: 0, food: 0 } },
      { ...ok, inventory: { dog_treat: 0, food: 'x', bolt_cutters: false } },
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
