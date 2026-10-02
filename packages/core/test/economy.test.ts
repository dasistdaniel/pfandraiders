import { describe, expect, it } from 'vitest';
import { totalBottles } from '../src/bottles';
import { CONFIG } from '../src/config';
import { capacityOf, nextUpgrade } from '../src/economy';
import { input, newGame, SEARCH_ROWS, setSpot, teleport, runFor, runSteps } from './helpers';

const PRESS = { p1: input({ action: true }) };
const RELEASE = { p1: input({}) };
const BUY = { p1: input({ buy: 'upgrade' }) };

function atDropoff() {
  const s = newGame(SEARCH_ROWS);
  teleport(s, 'p1', s.map.dropoffs[0]);
  return s;
}

function atShop() {
  const s = newGame(SEARCH_ROWS);
  teleport(s, 'p1', s.map.shops[0]);
  return s;
}

describe('deposit', () => {
  it('turns all bottles into money when the key is pressed at the dropoff', () => {
    const s = atDropoff();
    s.players.p1.bottles = { plastic: 2, glass: 1, crate: 0 };
    runSteps(s, PRESS, 1);
    expect(s.players.p1.money).toBe(2 * CONFIG.bottleValue.plastic + CONFIG.bottleValue.glass);
    expect(totalBottles(s.players.p1.bottles)).toBe(0);
  });

  it('deposits only once while the key stays held', () => {
    const s = atDropoff();
    s.players.p1.bottles = { plastic: 1, glass: 0, crate: 0 };
    runSteps(s, PRESS, 1);
    const money = s.players.p1.money;
    s.players.p1.bottles = { plastic: 2, glass: 0, crate: 0 };
    runSteps(s, PRESS, 10);
    expect(s.players.p1.money).toBe(money);
    expect(s.players.p1.bottles.plastic).toBe(2);
  });

  it('deposits again after releasing and pressing again', () => {
    const s = atDropoff();
    s.players.p1.bottles = { plastic: 1, glass: 0, crate: 0 };
    runSteps(s, PRESS, 1);
    s.players.p1.bottles = { plastic: 1, glass: 0, crate: 0 };
    runSteps(s, RELEASE, 1);
    runSteps(s, PRESS, 1);
    expect(s.players.p1.money).toBe(2 * CONFIG.bottleValue.plastic);
  });

  it('does nothing with an empty container', () => {
    const s = atDropoff();
    runSteps(s, PRESS, 1);
    expect(s.players.p1.money).toBe(0);
  });

  it('does nothing away from the dropoff', () => {
    const s = newGame(SEARCH_ROWS); // Spawn ist 48 px vom Automaten entfernt
    setSpot(s, 0, {});
    s.spots[0].refillInMs = 99999;
    s.players.p1.bottles = { plastic: 2, glass: 0, crate: 0 };
    runSteps(s, PRESS, 1);
    expect(s.players.p1.money).toBe(0);
    expect(s.players.p1.bottles.plastic).toBe(2);
  });

  it('a full trip works: search, walk to the dropoff, deposit', () => {
    const s = newGame(SEARCH_ROWS);
    setSpot(s, 0, { plastic: 2, glass: 1 });
    runFor(s, PRESS, CONFIG.searchMs + 100);
    expect(totalBottles(s.players.p1.bottles)).toBe(3);
    teleport(s, 'p1', s.map.dropoffs[0]);
    runSteps(s, RELEASE, 1);
    runSteps(s, PRESS, 1);
    expect(s.players.p1.money).toBe(2 * CONFIG.bottleValue.plastic + CONFIG.bottleValue.glass);
  });
});

describe('container upgrade', () => {
  it('buys the next container at the shop', () => {
    const s = atShop();
    s.players.p1.money = CONFIG.upgradePrices[0];
    runSteps(s, BUY, 1);
    expect(s.players.p1.containerLevel).toBe(1);
    expect(s.players.p1.money).toBe(0);
    expect(capacityOf(s.players.p1)).toBe(CONFIG.containers[1].capacity);
  });

  it('refuses when money is short by one cent', () => {
    const s = atShop();
    s.players.p1.money = CONFIG.upgradePrices[0] - 1;
    runSteps(s, BUY, 1);
    expect(s.players.p1.containerLevel).toBe(0);
    expect(s.players.p1.money).toBe(CONFIG.upgradePrices[0] - 1);
  });

  it('refuses at the last level', () => {
    const s = atShop();
    s.players.p1.containerLevel = CONFIG.containers.length - 1;
    s.players.p1.money = 1_000_000;
    runSteps(s, BUY, 1);
    expect(s.players.p1.containerLevel).toBe(CONFIG.containers.length - 1);
    expect(s.players.p1.money).toBe(1_000_000);
  });

  it('refuses away from the shop', () => {
    const s = newGame(SEARCH_ROWS);
    s.players.p1.money = 1_000_000;
    runSteps(s, BUY, 1);
    expect(s.players.p1.containerLevel).toBe(0);
    expect(s.players.p1.money).toBe(1_000_000);
  });

  it('describes the next upgrade or null at the last level', () => {
    const s = newGame(SEARCH_ROWS);
    expect(nextUpgrade(s.players.p1)).toEqual({
      name: CONFIG.containers[1].name,
      price: CONFIG.upgradePrices[0],
      capacity: CONFIG.containers[1].capacity,
    });
    s.players.p1.containerLevel = CONFIG.containers.length - 1;
    expect(nextUpgrade(s.players.p1)).toBeNull();
  });
});

describe('special item', () => {
  it('ignores unknown buy commands without throwing', () => {
    const s = atShop();
    s.players.p1.money = 100000;
    for (const bogus of ['nonsense', '__proto__']) {
      expect(() => runSteps(s, { p1: input({ buy: bogus as never }) }, 1)).not.toThrow();
    }
    expect(s.players.p1.money).toBe(100000);
    expect(s.players.p1.item).toBeNull();
  });

  const BUY_ITEM = { p1: input({ buy: 'bolt_cutters' }) };

  it('buys the bolt cutters at the shop', () => {
    const s = atShop();
    s.players.p1.money = CONFIG.items.bolt_cutters.price + 50;
    runSteps(s, BUY_ITEM, 1);
    expect(s.players.p1.item).toBe('bolt_cutters');
    expect(s.players.p1.money).toBe(50);
  });

  it('refuses when money is short by one cent', () => {
    const s = atShop();
    s.players.p1.money = CONFIG.items.bolt_cutters.price - 1;
    runSteps(s, BUY_ITEM, 1);
    expect(s.players.p1.item).toBeNull();
    expect(s.players.p1.money).toBe(CONFIG.items.bolt_cutters.price - 1);
  });

  it('refuses when the item slot is already taken', () => {
    const s = atShop();
    s.players.p1.item = 'bolt_cutters';
    s.players.p1.money = 100_000;
    runSteps(s, BUY_ITEM, 1);
    expect(s.players.p1.money).toBe(100_000);
  });

  it('refuses away from the shop', () => {
    const s = newGame(SEARCH_ROWS); // Spawn ist weit vom Shop
    s.players.p1.money = 100_000;
    runSteps(s, BUY_ITEM, 1);
    expect(s.players.p1.item).toBeNull();
    expect(s.players.p1.money).toBe(100_000);
  });

  it('keeps the container upgrade working next to the item purchase', () => {
    const s = atShop();
    s.players.p1.money = 100_000;
    runSteps(s, { p1: input({ buy: 'upgrade' }) }, 1);
    expect(s.players.p1.containerLevel).toBe(1);
    expect(s.players.p1.item).toBeNull();
  });
});

describe('dog treat', () => {
  const BUY = { p1: input({ buy: 'dog_treat' }) };

  it('buys the treat at the shop', () => {
    const s = atShop();
    s.players.p1.money = CONFIG.items.dog_treat.price + 7;
    runSteps(s, BUY, 1);
    expect(s.players.p1.item).toBe('dog_treat');
    expect(s.players.p1.money).toBe(7);
  });

  it('shares the item slot with the bolt cutters', () => {
    const s = atShop();
    s.players.p1.item = 'bolt_cutters';
    s.players.p1.money = 100_000;
    runSteps(s, BUY, 1);
    expect(s.players.p1.item).toBe('bolt_cutters');
    expect(s.players.p1.money).toBe(100_000);
  });
});
