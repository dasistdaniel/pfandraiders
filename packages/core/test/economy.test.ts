import { describe, expect, it } from 'vitest';
import { totalBottles } from '../src/bottles';
import { CONFIG } from '../src/config';
import { capacityOf, nextUpgrade, tryBuy } from '../src/economy';
import { DEPOSIT_ROWS, input, newGame, SEARCH_ROWS, setSpot, teleport, runFor, runSteps } from './helpers';

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

/** Nach dem Druck so viele 20-ms-Schritte, bis die n-te Flasche (0-basiert) abgegeben ist */
function stepsUntilBottle(n: number): number {
  return Math.ceil((n * CONFIG.depositEveryMs) / 20);
}

const MOVE_HELD = { p1: input({ action: true, moveX: 1 }) };

describe('timed deposit', () => {
  it('deposits the most valuable bottle right on the press', () => {
    const s = atDropoff();
    s.players.p1.bottles = { plastic: 1, glass: 1, crate: 1 };
    runSteps(s, PRESS, 1);
    expect(s.players.p1.money).toBe(CONFIG.bottleValue.crate);
    expect(s.players.p1.bottles).toEqual({ plastic: 1, glass: 1, crate: 0 });
    expect(s.players.p1.depositMs).toBeGreaterThan(0);
    expect(s.players.p1.mode).toBe('walking');
  });

  it('deposits one bottle every depositEveryMs while held, in value order', () => {
    const s = atDropoff();
    s.players.p1.bottles = { plastic: 1, glass: 1, crate: 1 };
    runSteps(s, PRESS, 1);
    runSteps(s, PRESS, stepsUntilBottle(1) - 1);
    expect(s.players.p1.money).toBe(CONFIG.bottleValue.crate);
    runSteps(s, PRESS, 1);
    expect(s.players.p1.money).toBe(CONFIG.bottleValue.crate + CONFIG.bottleValue.glass);
    expect(s.players.p1.bottles).toEqual({ plastic: 1, glass: 0, crate: 0 });
    runSteps(s, PRESS, stepsUntilBottle(2) - stepsUntilBottle(1) - 1);
    expect(s.players.p1.bottles.plastic).toBe(1);
    runSteps(s, PRESS, 1);
    expect(s.players.p1.money).toBe(
      CONFIG.bottleValue.crate + CONFIG.bottleValue.glass + CONFIG.bottleValue.plastic,
    );
    expect(totalBottles(s.players.p1.bottles)).toBe(0);
    expect(s.players.p1.depositMs).toBe(0);
  });

  it('needs exactly 29 intervals for a full shopping cart of 30 bottles', () => {
    const s = atDropoff();
    s.players.p1.containerLevel = CONFIG.containers.length - 1;
    s.players.p1.bottles = { plastic: 30, glass: 0, crate: 0 };
    runSteps(s, PRESS, 1);
    runSteps(s, PRESS, stepsUntilBottle(29) - 1);
    expect(totalBottles(s.players.p1.bottles)).toBe(1);
    runSteps(s, PRESS, 1);
    expect(totalBottles(s.players.p1.bottles)).toBe(0);
    expect(s.players.p1.money).toBe(30 * CONFIG.bottleValue.plastic);
    expect(stepsUntilBottle(29) * 20).toBeGreaterThanOrEqual(29 * CONFIG.depositEveryMs);
    expect(stepsUntilBottle(29) * 20).toBeLessThan(29 * CONFIG.depositEveryMs + 20);
  });

  it('stops when the key is released and goes on only after a new press', () => {
    const s = atDropoff();
    s.players.p1.bottles = { plastic: 5, glass: 0, crate: 0 };
    runSteps(s, PRESS, 1);
    runSteps(s, RELEASE, 20);
    expect(s.players.p1.bottles.plastic).toBe(4);
    expect(s.players.p1.depositMs).toBe(0);
    runSteps(s, PRESS, 1);
    expect(s.players.p1.bottles.plastic).toBe(3);
  });

  it('stops when moving and needs a fresh press after moving with the key held', () => {
    const s = atDropoff();
    s.players.p1.bottles = { plastic: 5, glass: 0, crate: 0 };
    runSteps(s, PRESS, 1);
    runSteps(s, MOVE_HELD, 1);
    expect(s.players.p1.depositMs).toBe(0);
    teleport(s, 'p1', s.map.dropoffs[0]);
    runSteps(s, PRESS, 30);
    expect(s.players.p1.bottles.plastic).toBe(4);
    runSteps(s, RELEASE, 1);
    runSteps(s, PRESS, 1);
    expect(s.players.p1.bottles.plastic).toBe(3);
  });

  it('stops when the container is empty and does not restart without a new press', () => {
    const s = atDropoff();
    s.players.p1.bottles = { plastic: 1, glass: 0, crate: 0 };
    runSteps(s, PRESS, 1);
    expect(s.players.p1.depositMs).toBe(0);
    s.players.p1.bottles = { plastic: 2, glass: 0, crate: 0 };
    runSteps(s, PRESS, 30);
    expect(s.players.p1.bottles.plastic).toBe(2);
    expect(s.players.p1.money).toBe(CONFIG.bottleValue.plastic);
  });

  it('does nothing with an empty container', () => {
    const s = atDropoff();
    runSteps(s, PRESS, 1);
    expect(s.players.p1.money).toBe(0);
    expect(s.players.p1.depositMs).toBe(0);
  });

  it('does nothing away from the dropoff', () => {
    const s = newGame(SEARCH_ROWS); // Spawn ist 48 px vom Automaten entfernt
    setSpot(s, 0, {});
    s.spots[0].refillInMs = 99999;
    s.players.p1.bottles = { plastic: 2, glass: 0, crate: 0 };
    runSteps(s, PRESS, 10);
    expect(s.players.p1.money).toBe(0);
    expect(s.players.p1.bottles.plastic).toBe(2);
  });

  it('does not start a search in the press tick next to a dropoff and a spot', () => {
    const s = newGame(DEPOSIT_ROWS);
    setSpot(s, 0, { plastic: 2 });
    teleport(s, 'p1', { x: 48, y: 24 }); // 8 px vom Spot und 8 px vom Automaten
    s.players.p1.bottles = { plastic: 1, glass: 0, crate: 0 };
    runSteps(s, PRESS, 1);
    expect(s.players.p1.searchSpotId).toBeNull();
    expect(s.players.p1.money).toBe(CONFIG.bottleValue.plastic);
    // weiter gehalten: Container leer, aber ohne neuen Druck beginnt keine Suche
    runFor(s, PRESS, CONFIG.searchMs + 100);
    expect(s.players.p1.searchSpotId).toBeNull();
    expect(s.spots[0].contents.plastic).toBe(2);
  });

  it('searches as before when pressing with an empty container next to a dropoff and a spot', () => {
    const s = newGame(DEPOSIT_ROWS);
    setSpot(s, 0, { plastic: 2 });
    teleport(s, 'p1', { x: 48, y: 24 });
    runSteps(s, PRESS, 1);
    expect(s.players.p1.searchSpotId).toBe(0);
    expect(s.players.p1.mode).toBe('searching');
  });

  it('leaves other players alone', () => {
    const s = newGame(SEARCH_ROWS, ['p1', 'p2']);
    teleport(s, 'p1', s.map.dropoffs[0]);
    teleport(s, 'p2', s.map.dropoffs[0]);
    s.players.p1.bottles = { plastic: 3, glass: 0, crate: 0 };
    s.players.p2.bottles = { plastic: 3, glass: 0, crate: 0 };
    runSteps(s, PRESS, 1 + stepsUntilBottle(2));
    expect(s.players.p1.money).toBe(3 * CONFIG.bottleValue.plastic);
    expect(s.players.p2.money).toBe(0);
    expect(s.players.p2.bottles.plastic).toBe(3);
    expect(s.players.p2.depositMs).toBe(0);
  });

  it('resets the deposit when the player is knocked out', () => {
    const s = atDropoff();
    s.players.p1.bottles = { plastic: 5, glass: 0, crate: 0 };
    runSteps(s, PRESS, 1);
    s.players.p1.unconsciousMs = 5000;
    runSteps(s, PRESS, 1);
    expect(s.players.p1.depositMs).toBe(0);
  });

  it('a full trip works: search, walk to the dropoff, hold to deposit everything', () => {
    const s = newGame(SEARCH_ROWS);
    setSpot(s, 0, { plastic: 2, glass: 1 });
    runFor(s, PRESS, CONFIG.searchMs + 100);
    expect(totalBottles(s.players.p1.bottles)).toBe(3);
    teleport(s, 'p1', s.map.dropoffs[0]);
    runSteps(s, RELEASE, 1);
    runSteps(s, PRESS, 1 + stepsUntilBottle(2));
    expect(s.players.p1.money).toBe(2 * CONFIG.bottleValue.plastic + CONFIG.bottleValue.glass);
    expect(totalBottles(s.players.p1.bottles)).toBe(0);
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

describe('tryBuy with bogus commands', () => {
  it('neither throws nor changes money', () => {
    const s = newGame(SEARCH_ROWS);
    s.players.p1.money = 5000;
    for (const cmd of ['nonsense', '__proto__', 'food']) {
      expect(() => tryBuy(s, s.players.p1, cmd as never)).not.toThrow();
      expect(s.players.p1.money).toBe(5000);
    }
  });
});
