import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { FOOD_FULL_SUFFIX, FOOD_TEXTS, foodText, rollFood } from '../src/food';
import { nextRandom } from '../src/rng';
import type { GameState } from '../src/types';
import { input, newGame, runFor, SEARCH_ROWS, seedWhere, setSpot } from './helpers';

function hungry(): GameState {
  const s = newGame(SEARCH_ROWS);
  s.players.p1.health = 50;
  return s;
}

/** rngState nach `n` Würfen ab `seed` */
function after(seed: number, n: number): number {
  const r = { rngState: seed };
  for (let i = 0; i < n; i++) nextRandom(r);
  return r.rngState;
}

describe('food texts', () => {
  it('has the texts of the spec per spot type', () => {
    expect(FOOD_TEXTS).toEqual({
      bin: ['Cheeseburger im Müll gefunden! +30 Leben', 'Halber Döner aus der Tonne. Schmeckt erstaunlich okay.'],
      bench: ['Angebissene Currywurst auf der Bank. Egal, Hunger!'],
      bush: ['Kalte Pizza unterm Busch gefunden. Lecker!'],
      bus_stop: ['Vergessene Brezel an der Haltestelle. Noch knusprig.'],
      park: ['Halbes Eis im Gras. Noch nicht geschmolzen!'],
    });
  });

  it('appends the full suffix and falls back to the first text', () => {
    expect(FOOD_FULL_SUFFIX).toBe(' Aber du bist schon satt.');
    expect(foodText({ spot: 'park', text: 0, full: true })).toBe('Halbes Eis im Gras. Noch nicht geschmolzen! Aber du bist schon satt.');
    expect(foodText({ spot: 'bin', text: 1, full: false })).toBe('Halber Döner aus der Tonne. Schmeckt erstaunlich okay.');
    expect(foodText({ spot: 'bench', text: 7, full: false })).toBe('Angebissene Currywurst auf der Bank. Egal, Hunger!');
  });
});

describe('rollFood', () => {
  it('finds food below the chance, heals 30 and counts the find', () => {
    const s = hungry();
    s.rngState = seedWhere((r) => r < CONFIG.health.food.chance.bench);
    expect(rollFood(s, s.players.p1, 'bench')).toBe(true);
    expect(s.players.p1.health).toBe(80);
    expect(s.players.p1.lastFood).toEqual({ n: 1, spot: 'bench', text: 0, full: false });
  });

  it('finds nothing at or above the chance and draws exactly one number', () => {
    const s = hungry();
    const seed = seedWhere((r) => r >= CONFIG.health.food.chance.bin);
    s.rngState = seed;
    expect(rollFood(s, s.players.p1, 'bin')).toBe(false);
    expect(s.players.p1.health).toBe(50);
    expect(s.players.p1.lastFood).toBeNull();
    expect(s.rngState).toBe(after(seed, 1));
  });

  it('uses 10 % for bins and 4 % elsewhere', () => {
    const seed = seedWhere((r) => r >= 0.04 && r < 0.1);
    const bin = hungry();
    bin.rngState = seed;
    expect(rollFood(bin, bin.players.p1, 'bin')).toBe(true);
    for (const type of ['bench', 'bush', 'bus_stop', 'park'] as const) {
      const s = hungry();
      s.rngState = seed;
      expect(rollFood(s, s.players.p1, type)).toBe(false);
    }
  });

  it('draws a second number for the text only for a bin find', () => {
    const seed = seedWhere((r) => r < 0.04);
    const bin = hungry();
    bin.rngState = seed;
    rollFood(bin, bin.players.p1, 'bin');
    expect([0, 1]).toContain(bin.players.p1.lastFood!.text);
    expect(bin.rngState).toBe(after(seed, 2));
    const park = hungry();
    park.rngState = seed;
    rollFood(park, park.players.p1, 'park');
    expect(park.rngState).toBe(after(seed, 1));
  });

  it('caps the health, marks a full player and uses the food anyway', () => {
    const seed = seedWhere((r) => r < 0.04);
    for (const [health, full, healed] of [[100, true, 100], [99.5, true, 100], [99, false, 100], [80, false, 100]] as const) {
      const s = hungry();
      s.players.p1.health = health;
      s.rngState = seed;
      expect(rollFood(s, s.players.p1, 'bush')).toBe(true);
      expect(s.players.p1.health).toBe(healed);
      expect(s.players.p1.lastFood!.full).toBe(full);
    }
  });

  it('counts the finds of the round', () => {
    const s = hungry();
    const seed = seedWhere((r) => r < 0.04);
    s.rngState = seed;
    rollFood(s, s.players.p1, 'park');
    s.rngState = seed;
    rollFood(s, s.players.p1, 'park');
    expect(s.players.p1.lastFood!.n).toBe(2);
  });
});

describe('food while searching', () => {
  const HOLD = { p1: input({ action: true }) };

  it('rolls when a search completes and leaves the bottles alone', () => {
    const s = hungry();
    setSpot(s, 0, { plastic: 2 });
    runFor(s, HOLD, CONFIG.searchMs - 100);
    expect(s.players.p1.lastFood).toBeNull();
    s.rngState = seedWhere((r) => r < CONFIG.health.food.chance[s.spots[0].type]);
    runFor(s, HOLD, 200);
    expect(s.players.p1.bottles.plastic).toBe(2);
    expect(s.players.p1.lastFood).toMatchObject({ n: 1, spot: s.spots[0].type });
    expect(s.players.p1.health).toBeGreaterThan(79);
    expect(s.players.p1.health).toBeLessThan(80);
  });

  it('finds nothing when the roll misses', () => {
    const s = hungry();
    setSpot(s, 0, { plastic: 2 });
    runFor(s, HOLD, CONFIG.searchMs - 100);
    s.rngState = seedWhere((r) => r >= 0.1);
    runFor(s, HOLD, 200);
    expect(s.players.p1.bottles.plastic).toBe(2);
    expect(s.players.p1.lastFood).toBeNull();
    expect(s.players.p1.health).toBeLessThan(50);
  });
});
