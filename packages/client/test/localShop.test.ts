import { CITY_MAP, createGame, freshProgress } from '@pfandraiders/core';
import { describe, expect, it } from 'vitest';
import { LocalShop } from '../src/localShop';

describe('LocalShop', () => {
  it('takes the progress of each local player from the ended round', () => {
    const s = createGame(1, CITY_MAP, ['p1', 'p2']);
    s.players.p1.money = 500;
    s.players.p1.earnedTotal = 500;
    s.players.p2.inventory.food = 2;
    const prog = LocalShop.fromState(s, ['p1', 'p2']);
    expect(prog.p1).toMatchObject({ money: 500, earnedTotal: 500 });
    expect(prog.p2.inventory.food).toBe(2);
    s.players.p2.inventory.food = 0;
    expect(prog.p2.inventory.food).toBe(2);
  });

  it('buys per player with the core rules', () => {
    const shop = new LocalShop(['p1', 'p2'], { p1: { ...freshProgress(), money: 300 } });
    expect(shop.buy('p1', 'defense', 'food', 3)).toEqual({ ok: true, cost: 300 });
    expect(shop.progress('p1').inventory.food).toBe(3);
    expect(shop.buy('p2', 'defense', 'food', 1)).toEqual({ ok: false, reason: 'no_money' });
    expect(shop.buy('p1', 'defense', 'food', 1)).toEqual({ ok: false, reason: 'no_money' });
  });

  it('starts only when every local player is ready, and ready can be taken back', () => {
    const shop = new LocalShop(['p1', 'p2'], {});
    expect(shop.allReady()).toBe(false);
    shop.setReady('p1', true);
    expect(shop.allReady()).toBe(false);
    shop.setReady('p2', true);
    expect(shop.allReady()).toBe(true);
    shop.setReady('p1', false);
    expect(shop.allReady()).toBe(false);
    expect(shop.isReady('p2')).toBe(true);
  });

  it('gives a deep copy of the result for the next round', () => {
    const shop = new LocalShop(['p1'], { p1: { ...freshProgress(), money: 100 } });
    const out = shop.result();
    out.p1.money = 0;
    expect(shop.progress('p1').money).toBe(100);
  });

  it('ignores unknown players', () => {
    const shop = new LocalShop(['p1'], {});
    shop.setReady('nobody', true);
    expect(shop.buy('nobody', 'defense', 'food', 1)).toEqual({ ok: false, reason: 'unknown_item' });
    expect(shop.allReady()).toBe(false);
  });
});
