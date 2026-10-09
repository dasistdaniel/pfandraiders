import { describe, expect, it } from 'vitest';
import { totalBottles } from '../src/bottles';
import { CONFIG } from '../src/config';
import { bottleValueFor, bottlesValueFor, depositEveryMsOf } from '../src/economy';
import { DEPOSIT_ROWS, input, newGame, SEARCH_ROWS, setSpot, teleport, runFor, runSteps } from './helpers';

const PRESS = { p1: input({ action: true }) };
const RELEASE = { p1: input({}) };

function atDropoff() {
  const s = newGame(SEARCH_ROWS);
  teleport(s, 'p1', s.map.dropoffs[0]);
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
    s.players.p1.items = { ...s.players.p1.items, bag: 4, backpack: 2, cart: 1 }; // 31 Plätze
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

  it('adds every deposited bottle to money, round earnings and total earnings', () => {
    const s = atDropoff();
    s.players.p1.money = 40;
    s.players.p1.earnedTotal = 1000;
    s.players.p1.bottles = { plastic: 1, glass: 1, crate: 0 };
    runFor(s, PRESS, CONFIG.depositEveryMs + 40);
    const value = CONFIG.bottleValue.plastic + CONFIG.bottleValue.glass;
    expect(s.players.p1.money).toBe(40 + value);
    expect(s.players.p1.earnedRound).toBe(value);
    expect(s.players.p1.earnedTotal).toBe(1000 + value);
  });
});

describe('Kundenkarte', () => {
  it('deposits every 100 ms instead of 150 ms', () => {
    const s = atDropoff();
    expect(depositEveryMsOf(s.players.p1)).toBe(150);
    s.players.p1.items.card = 1;
    expect(depositEveryMsOf(s.players.p1)).toBe(100);
    s.players.p1.bottles = { plastic: 3, glass: 0, crate: 0 };
    runSteps(s, PRESS, 1); // erste Flasche sofort
    runSteps(s, PRESS, 4); // 80 ms: noch keine zweite
    expect(totalBottles(s.players.p1.bottles)).toBe(2);
    runSteps(s, PRESS, 1); // 100 ms
    expect(totalBottles(s.players.p1.bottles)).toBe(1);
    runSteps(s, PRESS, 5);
    expect(totalBottles(s.players.p1.bottles)).toBe(0);
  });
});

describe('Kundenkarte+', () => {
  it('adds the Kundenkarte+ bonus per bottle, rounded', () => {
    const s = atDropoff();
    const p = s.players.p1;
    expect([bottleValueFor(p, 'plastic'), bottleValueFor(p, 'glass'), bottleValueFor(p, 'crate')]).toEqual([8, 15, 25]);
    p.items.card = 1;
    p.items.card_plus = 1;
    expect([bottleValueFor(p, 'plastic'), bottleValueFor(p, 'glass'), bottleValueFor(p, 'crate')]).toEqual([9, 17, 28]);
    expect(bottlesValueFor(p, { plastic: 2, glass: 1, crate: 1 })).toBe(2 * 9 + 17 + 28);
    p.bottles = { plastic: 1, glass: 1, crate: 1 };
    p.earnedTotal = 100;
    runFor(s, PRESS, 400);
    expect(totalBottles(p.bottles)).toBe(0);
    expect(p.money).toBe(9 + 17 + 28);
    expect(p.earnedRound).toBe(9 + 17 + 28);
    expect(p.earnedTotal).toBe(100 + 9 + 17 + 28);
  });
});
