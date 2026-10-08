import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { createGame } from '../src/game';
import { CITY_MAP } from '../src/maps';
import {
  BUY_REFUSAL_TEXT,
  checkShopBuy,
  freshProgress,
  isShopCategory,
  isShopItemId,
  maxOf,
  ownedOf,
  progressOf,
  SHOP_CATEGORIES,
  shopBuy,
  shopItemsOf,
  upgradeValue,
} from '../src/shop';
import type { Progress } from '../src/shop';

function rich(money = 100_000): Progress {
  return { ...freshProgress(), money };
}

describe('shop catalog', () => {
  it('has the four categories with their entries in menu order', () => {
    expect(SHOP_CATEGORIES).toEqual(['bags', 'upgrades', 'attack', 'defense']);
    expect(shopItemsOf('bags')).toEqual(['bag']);
    expect(shopItemsOf('upgrades')).toEqual(['knockout', 'speed', 'search']);
    expect(shopItemsOf('attack')).toEqual(['punch', 'bolt_cutters', 'sling', 'pistol']);
    expect(shopItemsOf('defense')).toEqual(['dog_treat', 'food', 'armor']);
  });

  it('prices the bags like upgradePrices and marks ranged weapons as not available', () => {
    expect(CONFIG.shop.items.bag.prices).toEqual(CONFIG.upgradePrices);
    expect(CONFIG.shop.items.sling.available).toBe(false);
    expect(CONFIG.shop.items.pistol.available).toBe(false);
    expect(CONFIG.shop.maxStack).toBe(99);
  });

  it('has a value for every level of every leveled upgrade', () => {
    for (const id of ['knockout', 'speed', 'search', 'punch', 'armor'] as const) {
      const def = CONFIG.shop.items[id];
      expect(def.kind).toBe('level');
      expect(def.values.length).toBe(def.prices.length + 1);
    }
    expect(CONFIG.shop.items.knockout.values).toEqual([20000, 15000, 10000, 5000]);
  });

  it('recognises categories and items and nothing else', () => {
    expect(isShopCategory('defense')).toBe(true);
    expect(isShopCategory('__proto__')).toBe(false);
    expect(isShopItemId('food')).toBe(true);
    expect(isShopItemId('toString')).toBe(false);
    expect(isShopItemId(5)).toBe(false);
  });

  it('has a German text for every refusal', () => {
    for (const text of Object.values(BUY_REFUSAL_TEXT)) expect(text.length).toBeGreaterThan(3);
  });
});

describe('shopBuy', () => {
  it('buys the next bag level for its price', () => {
    const p = rich(1000);
    expect(shopBuy(p, 'bags', 'bag', 1)).toEqual({ ok: true, cost: 150 });
    expect(p.containerLevel).toBe(1);
    expect(p.money).toBe(850);
    expect(shopBuy(p, 'bags', 'bag', 1)).toEqual({ ok: true, cost: 400 });
    expect(p.containerLevel).toBe(2);
  });

  it('refuses the bag beyond the shopping cart', () => {
    const p = rich();
    p.containerLevel = CONFIG.containers.length - 1;
    expect(shopBuy(p, 'bags', 'bag', 1)).toEqual({ ok: false, reason: 'maxed' });
  });

  it('raises an upgrade level and its value', () => {
    const p = rich();
    shopBuy(p, 'upgrades', 'knockout', 1);
    expect(p.upgrades.knockout).toBe(1);
    expect(upgradeValue(p, 'knockout')).toBe(15000);
    shopBuy(p, 'upgrades', 'knockout', 1);
    shopBuy(p, 'upgrades', 'knockout', 1);
    expect(upgradeValue(p, 'knockout')).toBe(5000);
    expect(shopBuy(p, 'upgrades', 'knockout', 1)).toEqual({ ok: false, reason: 'maxed' });
  });

  it('buys several consumables at once for quantity times price', () => {
    const p = rich(1000);
    expect(shopBuy(p, 'defense', 'food', 7)).toEqual({ ok: true, cost: 700 });
    expect(p.inventory.food).toBe(7);
    expect(p.money).toBe(300);
  });

  it('refuses without partial purchase when the money is short', () => {
    const p = rich(250);
    expect(shopBuy(p, 'defense', 'dog_treat', 3)).toEqual({ ok: false, reason: 'no_money' });
    expect(p.inventory.dog_treat).toBe(0);
    expect(p.money).toBe(250);
  });

  it('refuses more than 99 of a consumable in total, also at the border', () => {
    const p = rich();
    p.inventory.food = 98;
    expect(shopBuy(p, 'defense', 'food', 2)).toEqual({ ok: false, reason: 'maxed' });
    expect(p.inventory.food).toBe(98);
    expect(shopBuy(p, 'defense', 'food', 1)).toEqual({ ok: true, cost: 100 });
    expect(p.inventory.food).toBe(99);
    expect(maxOf('food')).toBe(99);
  });

  it('allows exactly one bolt cutters', () => {
    const p = rich();
    expect(shopBuy(p, 'attack', 'bolt_cutters', 1)).toEqual({ ok: true, cost: 600 });
    expect(p.inventory.bolt_cutters).toBe(true);
    expect(ownedOf(p, 'bolt_cutters')).toBe(1);
    expect(shopBuy(p, 'attack', 'bolt_cutters', 1)).toEqual({ ok: false, reason: 'maxed' });
  });

  it('refuses quantities other than one for leveled and single entries', () => {
    const p = rich();
    expect(shopBuy(p, 'bags', 'bag', 2)).toEqual({ ok: false, reason: 'bad_qty' });
    expect(shopBuy(p, 'attack', 'bolt_cutters', 2)).toEqual({ ok: false, reason: 'bad_qty' });
  });

  it('refuses bad quantities, unknown items, wrong categories and unavailable weapons', () => {
    const p = rich();
    for (const qty of [0, -1, 1.5, 100, Number.NaN, '3']) {
      expect(checkShopBuy(p, 'defense', 'food', qty)).toEqual({ ok: false, reason: 'bad_qty' });
    }
    expect(checkShopBuy(p, 'defense', 'cake', 1)).toEqual({ ok: false, reason: 'unknown_item' });
    expect(checkShopBuy(p, 'kitchen', 'food', 1)).toEqual({ ok: false, reason: 'unknown_item' });
    expect(checkShopBuy(p, 'attack', 'food', 1)).toEqual({ ok: false, reason: 'wrong_category' });
    expect(checkShopBuy(p, 'attack', 'sling', 1)).toEqual({ ok: false, reason: 'unavailable' });
    expect(p).toEqual(rich());
  });
});

describe('progress', () => {
  it('starts empty', () => {
    expect(freshProgress()).toEqual({
      money: 0,
      containerLevel: 0,
      upgrades: { knockout: 0, speed: 0, search: 0, punch: 0, armor: 0 },
      inventory: { dog_treat: 0, food: 0, bolt_cutters: false },
      earnedTotal: 0,
    });
  });

  it('copies deeply', () => {
    const a = rich(5);
    const b = progressOf(a);
    b.upgrades.speed = 2;
    b.inventory.food = 3;
    expect(a.upgrades.speed).toBe(0);
    expect(a.inventory.food).toBe(0);
  });

  it('is carried into a new game and only the per-round fields are fresh', () => {
    const prog = rich(777);
    prog.containerLevel = 2;
    prog.upgrades.armor = 1;
    prog.inventory.dog_treat = 4;
    prog.earnedTotal = 1234;
    const s = createGame(1, CITY_MAP, ['a', 'b'], { progress: { a: prog } });
    expect(s.players.a).toMatchObject({
      money: 777,
      containerLevel: 2,
      upgrades: { armor: 1 },
      inventory: { dog_treat: 4, food: 0, bolt_cutters: false },
      earnedTotal: 1234,
      earnedRound: 0,
      weapon: 'fist',
      health: CONFIG.health.max,
      bottles: { plastic: 0, glass: 0, crate: 0 },
    });
    expect(s.players.b.money).toBe(0);
    s.players.a.inventory.dog_treat = 0;
    expect(prog.inventory.dog_treat).toBe(4); // keine geteilten Objekte
  });
});
