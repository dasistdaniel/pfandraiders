import { describe, expect, it } from 'vitest';
import { totalBottles } from '../src/bottles';
import { CONFIG } from '../src/config';
import { damage } from '../src/health';
import { input, newGame, runFor, runSteps, SEARCH_ROWS, teleport } from './helpers';

describe('hunger', () => {
  it('drains one health per hungerEveryMs', () => {
    const s = newGame(SEARCH_ROWS);
    runSteps(s, {}, CONFIG.health.hungerEveryMs / 20, 20);
    expect(s.players.p1.health).toBeCloseTo(CONFIG.health.max - 1, 5);
  });

  it('knocks the player out when hunger takes the last health', () => {
    const s = newGame(SEARCH_ROWS);
    s.players.p1.health = 0.05;
    runSteps(s, {}, 30, 20);
    expect(s.players.p1.mode).toBe('unconscious');
    expect(s.players.p1.unconsciousMs).toBeGreaterThan(0);
    expect(s.players.p1.health).toBe(0);
  });
});

describe('knock out', () => {
  function knocked() {
    const s = newGame(SEARCH_ROWS);
    const p = s.players.p1;
    p.money = 1001;
    p.bottles = { plastic: 2, glass: 1, crate: 0 };
    p.item = 'bolt_cutters';
    damage(p, 1000);
    return s;
  }

  it('drops bottles and item and loses a quarter of the money (rounded down)', () => {
    const p = knocked().players.p1;
    expect(totalBottles(p.bottles)).toBe(0);
    expect(p.item).toBeNull();
    expect(p.money).toBe(1001 - Math.floor(1001 * CONFIG.health.moneyLossFraction));
    expect(p.mode).toBe('unconscious');
    expect(p.health).toBe(0);
    expect(p.unconsciousMs).toBe(CONFIG.health.unconsciousMs);
  });

  it('cancels searching', () => {
    const s = newGame(SEARCH_ROWS);
    const p = s.players.p1;
    p.searchSpotId = 0;
    p.searchProgressMs = 500;
    damage(p, 1000);
    expect(p.searchSpotId).toBeNull();
    expect(p.searchProgressMs).toBe(0);
  });

  it('ignores all input while unconscious', () => {
    const s = knocked();
    runSteps(s, { p1: input({ moveX: 1, action: true, steal: true, attack: true, eat: true }) }, 50, 20);
    expect(s.players.p1.x).toBe(24);
    expect(s.players.p1.mode).toBe('unconscious');
    expect(s.players.p1.containerLevel).toBe(0);
  });

  it('takes no further damage and loses no more money while unconscious', () => {
    const s = knocked();
    const money = s.players.p1.money;
    const left = s.players.p1.unconsciousMs;
    damage(s.players.p1, 50);
    expect(s.players.p1.money).toBe(money);
    expect(s.players.p1.unconsciousMs).toBe(left);
  });

  it('respawns at the spawn point with revive health and shield after the unconscious time', () => {
    const s = knocked();
    teleport(s, 'p1', { x: 100, y: 24 });
    runFor(s, {}, CONFIG.health.unconsciousMs + 100);
    const p = s.players.p1;
    expect(p.x).toBe(24);
    expect(p.y).toBe(24);
    expect(p.mode).toBe('walking');
    expect(p.health).toBeGreaterThan(CONFIG.health.reviveHealth - 1);
    expect(p.health).toBeLessThanOrEqual(CONFIG.health.reviveHealth);
    expect(p.shieldMs).toBeGreaterThan(0);
  });

  it('never lets health go below zero or become NaN', () => {
    const s = newGame(SEARCH_ROWS);
    damage(s.players.p1, 250);
    expect(s.players.p1.health).toBe(0);
    runSteps(s, {}, 10, 20);
    expect(Number.isNaN(s.players.p1.health)).toBe(false);
    expect(s.players.p1.health).toBeGreaterThanOrEqual(0);
  });
});

describe('non-lethal damage', () => {
  it('interrupts searching, resets the mode and keeps the player conscious', () => {
    const s = newGame(SEARCH_ROWS);
    const p = s.players.p1;
    p.searchSpotId = 0;
    p.mode = 'searching';
    damage(p, 5);
    expect(p.mode).toBe('walking');
    expect(p.searchSpotId).toBeNull();
    expect(p.health).toBe(CONFIG.health.max - 5);
    expect(p.unconsciousMs).toBe(0);
  });
});
