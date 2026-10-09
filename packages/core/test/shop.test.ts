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
  noItems,
  ownedOf,
  progressAfterRound,
  progressOf,
  SHOP_CATEGORIES,
  SHOP_CATEGORY_NAMES,
  SHOP_ITEM_IDS,
  shopBuy,
  shopItemsOf,
  unitOf,
  upgradeValue,
} from '../src/shop';
import type { Progress } from '../src/shop';

function rich(money = 100_000): Progress {
  return { ...freshProgress(), money };
}

describe('shop catalog', () => {
  it('has the four categories with their entries in menu order', () => {
    expect(SHOP_CATEGORIES).toEqual(['bags', 'upgrades', 'weapons', 'defense']);
    expect(SHOP_CATEGORIES.map((c) => SHOP_CATEGORY_NAMES[c])).toEqual(['Taschen', 'Upgrades', 'Waffen', 'Verteidigung']);
    expect(shopItemsOf('bags')).toEqual(['bag', 'backpack', 'cart']);
    expect(shopItemsOf('upgrades')).toEqual(['flashlight', 'card', 'card_plus']);
    expect(shopItemsOf('weapons')).toEqual(['glove']);
    expect(shopItemsOf('defense')).toEqual(['pepper', 'id_papers', 'dog_treat']);
    expect(SHOP_ITEM_IDS).toEqual(['bag', 'backpack', 'cart', 'flashlight', 'card', 'card_plus', 'glove', 'pepper', 'id_papers', 'dog_treat']);
  });

  it('pins the start prices and limits', () => {
    const items = CONFIG.shop.items;
    expect([items.bag.prices[0], items.bag.kind, items.bag.max]).toEqual([150, 'count', 4]);
    expect([items.backpack.prices[0], items.backpack.kind, items.backpack.max]).toEqual([400, 'count', 2]);
    expect([items.cart.prices[0], items.cart.kind, items.cart.perRound]).toEqual([100, 'once', true]);
    expect(items.flashlight).toMatchObject({ name: 'Taschenlampe', kind: 'level', prices: [200, 500, 1000], values: [1, 0.85, 0.7, 0.55] });
    expect(items.card).toMatchObject({ name: 'Kundenkarte', kind: 'once', prices: [300] });
    expect(items.card_plus).toMatchObject({ name: 'Kundenkarte+', kind: 'once', prices: [600], requires: 'card' });
    expect(items.dog_treat).toMatchObject({ name: 'Leckerli', kind: 'stack', prices: [100] });
    expect(CONFIG.shop.maxStack).toBe(99);
    expect(CONFIG.shop.cardPlusBonusPct).toBe(10);
    expect(items.glove).toMatchObject({ category: 'weapons', name: 'Boxhandschuh', kind: 'once', prices: [400] });
    expect(items.pepper).toMatchObject({ category: 'defense', name: 'Pfefferspray', kind: 'stack', prices: [300], max: 99, unit: 10 });
    expect(items.id_papers).toMatchObject({ category: 'defense', name: 'Ausweisdokumente', kind: 'once', prices: [300], perRound: true });
    expect(CONFIG.fight.gloveBonus).toBe(10);
    expect(CONFIG.spray).toEqual({ radius: 30, knockbackPx: 40, damage: 2, cooldownMs: 1000 });
  });

  it('has a value for every level of every leveled entry', () => {
    for (const id of SHOP_ITEM_IDS) {
      const def = CONFIG.shop.items[id];
      if (def.kind === 'level') expect(def.values.length).toBe(def.prices.length + 1);
    }
  });

  it('recognises categories and items and nothing else', () => {
    expect(isShopCategory('weapons')).toBe(true);
    expect(isShopCategory('attack')).toBe(false);
    expect(isShopCategory('__proto__')).toBe(false);
    expect(isShopItemId('cart')).toBe(true);
    for (const gone of ['food', 'armor', 'speed', 'knockout', 'search', 'bolt_cutters', 'sling', 'pistol', 'punch', 'toString', 5]) {
      expect(isShopItemId(gone)).toBe(false);
    }
  });

  it('has a German text for every refusal', () => {
    for (const text of Object.values(BUY_REFUSAL_TEXT)) expect(text.length).toBeGreaterThan(3);
    expect(BUY_REFUSAL_TEXT.requires).toBe('Erst die Kundenkarte kaufen.');
  });
});

describe('shopBuy', () => {
  it('stacks bags up to four, one per purchase', () => {
    const p = rich(1000);
    expect(shopBuy(p, 'bags', 'bag', 2)).toEqual({ ok: false, reason: 'bad_qty' });
    for (let i = 0; i < 4; i++) expect(shopBuy(p, 'bags', 'bag', 1)).toEqual({ ok: true, cost: 150 });
    expect(p.items.bag).toBe(4);
    expect(shopBuy(p, 'bags', 'bag', 1)).toEqual({ ok: false, reason: 'maxed' });
    expect(maxOf('bag')).toBe(4);
    expect(p.money).toBe(400);
  });

  it('stacks backpacks up to two', () => {
    const p = rich();
    expect(shopBuy(p, 'bags', 'backpack', 1)).toEqual({ ok: true, cost: 400 });
    expect(shopBuy(p, 'bags', 'backpack', 1)).toEqual({ ok: true, cost: 400 });
    expect(shopBuy(p, 'bags', 'backpack', 1)).toEqual({ ok: false, reason: 'maxed' });
    expect(maxOf('backpack')).toBe(2);
  });

  it('rents one cart', () => {
    const p = rich();
    expect(shopBuy(p, 'bags', 'cart', 1)).toEqual({ ok: true, cost: 100 });
    expect(ownedOf(p, 'cart')).toBe(1);
    expect(shopBuy(p, 'bags', 'cart', 1)).toEqual({ ok: false, reason: 'maxed' });
    expect(shopBuy(rich(), 'bags', 'cart', 2)).toEqual({ ok: false, reason: 'bad_qty' });
  });

  it('raises the flashlight level and its value', () => {
    const p = rich();
    expect(upgradeValue(p, 'flashlight')).toBe(1);
    expect(shopBuy(p, 'upgrades', 'flashlight', 1)).toEqual({ ok: true, cost: 200 });
    expect(upgradeValue(p, 'flashlight')).toBe(0.85);
    expect(shopBuy(p, 'upgrades', 'flashlight', 1)).toEqual({ ok: true, cost: 500 });
    expect(shopBuy(p, 'upgrades', 'flashlight', 1)).toEqual({ ok: true, cost: 1000 });
    expect(upgradeValue(p, 'flashlight')).toBe(0.55);
    expect(shopBuy(p, 'upgrades', 'flashlight', 1)).toEqual({ ok: false, reason: 'maxed' });
  });

  it('sells Kundenkarte+ only after the Kundenkarte', () => {
    const p = rich();
    expect(shopBuy(p, 'upgrades', 'card_plus', 1)).toEqual({ ok: false, reason: 'requires' });
    expect(p).toEqual(rich());
    expect(shopBuy(p, 'upgrades', 'card', 1)).toEqual({ ok: true, cost: 300 });
    expect(shopBuy(p, 'upgrades', 'card_plus', 1)).toEqual({ ok: true, cost: 600 });
    expect(shopBuy(p, 'upgrades', 'card_plus', 1)).toEqual({ ok: false, reason: 'maxed' });
  });

  it('sells the glove once', () => {
    const p = rich();
    expect(shopBuy(p, 'weapons', 'glove', 1)).toEqual({ ok: true, cost: 400 });
    expect(shopBuy(p, 'weapons', 'glove', 1)).toEqual({ ok: false, reason: 'maxed' });
  });

  it('sells pepper spray by the bottle, ten charges each, up to 99 charges', () => {
    const p = rich();
    expect(unitOf('pepper')).toBe(10);
    expect(unitOf('dog_treat')).toBe(1);
    expect(shopBuy(p, 'defense', 'pepper', 2)).toEqual({ ok: true, cost: 600 });
    expect(p.items.pepper).toBe(20);
    expect(shopBuy(p, 'defense', 'pepper', 8)).toEqual({ ok: false, reason: 'maxed' });
    expect(shopBuy(p, 'defense', 'pepper', 7)).toEqual({ ok: true, cost: 2100 });
    expect(p.items.pepper).toBe(90);
    expect(shopBuy(p, 'defense', 'pepper', 1)).toEqual({ ok: false, reason: 'maxed' });
    p.items.pepper = 89;
    expect(shopBuy(p, 'defense', 'pepper', 1)).toEqual({ ok: true, cost: 300 });
    expect(p.items.pepper).toBe(99);
  });

  it('sells id papers once for one round', () => {
    const p = rich();
    expect(shopBuy(p, 'defense', 'id_papers', 1)).toEqual({ ok: true, cost: 300 });
    expect(shopBuy(p, 'defense', 'id_papers', 1)).toEqual({ ok: false, reason: 'maxed' });
    p.items.cart = 1;
    expect(progressAfterRound(p).items).toMatchObject({ id_papers: 0, cart: 0 });
  });

  it('refuses without partial purchase when the money is short', () => {
    const p = rich(250);
    expect(shopBuy(p, 'defense', 'dog_treat', 3)).toEqual({ ok: false, reason: 'no_money' });
    expect(p.items.dog_treat).toBe(0);
    expect(p.money).toBe(250);
  });

  it('refuses more than 99 treats in total, also at the border', () => {
    const p = rich();
    p.items.dog_treat = 98;
    expect(shopBuy(p, 'defense', 'dog_treat', 2)).toEqual({ ok: false, reason: 'maxed' });
    expect(shopBuy(p, 'defense', 'dog_treat', 1)).toEqual({ ok: true, cost: 100 });
    expect(p.items.dog_treat).toBe(99);
    expect(maxOf('dog_treat')).toBe(99);
  });

  it('refuses bad quantities, unknown items and wrong categories', () => {
    const p = rich();
    for (const qty of [0, -1, 1.5, 100, Number.NaN, '3']) {
      expect(checkShopBuy(p, 'defense', 'dog_treat', qty)).toEqual({ ok: false, reason: 'bad_qty' });
    }
    expect(checkShopBuy(p, 'upgrades', 'flashlight', 2)).toEqual({ ok: false, reason: 'bad_qty' });
    expect(checkShopBuy(p, 'defense', 'food', 1)).toEqual({ ok: false, reason: 'unknown_item' });
    expect(checkShopBuy(p, 'attack', 'punch', 1)).toEqual({ ok: false, reason: 'unknown_item' });
    expect(checkShopBuy(p, 'bags', 'dog_treat', 1)).toEqual({ ok: false, reason: 'wrong_category' });
    expect(p).toEqual(rich());
  });
});

describe('progress', () => {
  it('starts empty', () => {
    expect(freshProgress()).toEqual({ money: 0, items: noItems(), earnedTotal: 0 });
    expect(noItems()).toEqual({ bag: 0, backpack: 0, cart: 0, flashlight: 0, card: 0, card_plus: 0, glove: 0, pepper: 0, id_papers: 0, dog_treat: 0 });
  });

  it('copies deeply', () => {
    const a = rich(5);
    const b = progressOf(a);
    b.items.bag = 2;
    expect(a.items.bag).toBe(0);
  });

  it('drops the rented cart and the id papers after a round and keeps everything else', () => {
    const p = rich(500);
    p.items = { ...noItems(), bag: 4, backpack: 2, cart: 1, flashlight: 2, card: 1, card_plus: 1, glove: 1, pepper: 30, id_papers: 1, dog_treat: 7 };
    const after = progressAfterRound(p);
    expect(after.items).toEqual({ ...p.items, cart: 0, id_papers: 0 });
    expect(after.money).toBe(500);
    expect(p.items.cart).toBe(1); // das Original bleibt
  });

  it('is carried into a new game and only the per-round fields are fresh', () => {
    const prog = rich(777);
    prog.items.bag = 2;
    prog.items.dog_treat = 4;
    prog.earnedTotal = 1234;
    const s = createGame(1, CITY_MAP, ['a', 'b'], { progress: { a: prog } });
    expect(s.players.a).toMatchObject({
      money: 777,
      items: { bag: 2, dog_treat: 4, cart: 0 },
      earnedTotal: 1234,
      earnedRound: 0,
      lastFood: null,
      health: CONFIG.health.max,
      bottles: { plastic: 0, glass: 0, crate: 0 },
    });
    expect(s.players.b.money).toBe(0);
    s.players.a.items.dog_treat = 0;
    expect(prog.items.dog_treat).toBe(4); // keine geteilten Objekte
  });
});
