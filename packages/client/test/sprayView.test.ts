import { CONFIG } from '@pfandraiders/core';
import { describe, expect, it } from 'vitest';
import { isSpraying, SPRAY_SHOW_MS, sprayCloudRadius } from '../src/sprayView';

describe('sprayView', () => {
  it('shows the cloud for the first 300 ms after spraying', () => {
    const cd = CONFIG.spray.cooldownMs;
    expect(SPRAY_SHOW_MS).toBe(300);
    expect(isSpraying({ sprayCooldownMs: cd })).toBe(true);
    expect(isSpraying({ sprayCooldownMs: cd - 299 })).toBe(true);
    expect(isSpraying({ sprayCooldownMs: cd - 300 })).toBe(false);
    expect(isSpraying({ sprayCooldownMs: 0 })).toBe(false);
  });

  it('grows the cloud from 40 % to the full spray radius', () => {
    const cd = CONFIG.spray.cooldownMs;
    expect(sprayCloudRadius({ sprayCooldownMs: cd })).toBeCloseTo(CONFIG.spray.radius * 0.4, 6);
    expect(sprayCloudRadius({ sprayCooldownMs: cd - SPRAY_SHOW_MS })).toBeCloseTo(CONFIG.spray.radius, 6);
    expect(sprayCloudRadius({ sprayCooldownMs: 0 })).toBeCloseTo(CONFIG.spray.radius, 6);
  });
});
