import { CONFIG } from '@pfandraiders/core';
import { describe, expect, it } from 'vitest';
import { isSwinging, SWING_MS } from '../src/fightView';

describe('isSwinging', () => {
  it('is true only in the first moments after a punch', () => {
    expect(isSwinging({ attackCooldownMs: CONFIG.fight.cooldownMs })).toBe(true);
    expect(isSwinging({ attackCooldownMs: CONFIG.fight.cooldownMs - SWING_MS + 1 })).toBe(true);
    expect(isSwinging({ attackCooldownMs: CONFIG.fight.cooldownMs - SWING_MS })).toBe(false);
    expect(isSwinging({ attackCooldownMs: 0 })).toBe(false);
  });
});
