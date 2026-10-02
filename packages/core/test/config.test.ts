import { describe, expect, it } from 'vitest';
import { CONFIG, TILE } from '../src/config';

describe('config sanity', () => {
  it('keeps the collision box smaller than one tile (boxBlocked precondition)', () => {
    expect(CONFIG.playerHalf).toBeLessThan(TILE / 2);
  });

  it('keeps one step shorter than a tile so walls (one tile thick) cannot be tunneled', () => {
    expect((CONFIG.playerSpeed * CONFIG.maxStepMs) / 1000).toBeLessThan(TILE);
  });

  it('has positive interaction radius and search time', () => {
    expect(CONFIG.interactRadius).toBeGreaterThan(0);
    expect(CONFIG.searchMs).toBeGreaterThan(0);
  });

  it('has speed multipliers in (0, 1] so containers never stop or speed up the player', () => {
    for (const c of CONFIG.containers) {
      expect(c.speedMult).toBeGreaterThan(0);
      expect(c.speedMult).toBeLessThanOrEqual(1);
    }
  });

  it('has exactly one upgrade price per container step', () => {
    expect(CONFIG.upgradePrices.length).toBe(CONFIG.containers.length - 1);
  });

  it('has strictly increasing capacities so every upgrade is an improvement', () => {
    for (let i = 1; i < CONFIG.containers.length; i++) {
      expect(CONFIG.containers[i].capacity).toBeGreaterThan(CONFIG.containers[i - 1].capacity);
    }
  });
});
