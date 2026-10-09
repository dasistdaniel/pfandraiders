import { describe, expect, it } from 'vitest';
import { HEALTH_COLORS, healthBar, healthLabel } from '../src/healthBar';

describe('healthBar', () => {
  it('is hidden at full health (rounded up like the HUD)', () => {
    expect(healthBar(100, 100).visible).toBe(false);
    expect(healthBar(99.2, 100).visible).toBe(false); // zeigt das HUD als 100/100
    expect(healthBar(98.9, 100).visible).toBe(true);
  });

  it('width follows the rounded health', () => {
    expect(healthBar(50, 100).fraction).toBe(0.5);
    expect(healthBar(49.1, 100).fraction).toBe(0.5);
    expect(healthBar(150, 100).fraction).toBe(1);
    expect(healthBar(-5, 100).fraction).toBe(0);
    expect(healthBar(30, 60).fraction).toBe(0.5);
  });

  it('green above 60 %, yellow above 30 %, red below', () => {
    expect(healthBar(61, 100).color).toBe(HEALTH_COLORS.good);
    expect(healthBar(60, 100).color).toBe(HEALTH_COLORS.mid);
    expect(healthBar(31, 100).color).toBe(HEALTH_COLORS.mid);
    expect(healthBar(30, 100).color).toBe(HEALTH_COLORS.low);
    expect(healthBar(1, 100).color).toBe(HEALTH_COLORS.low);
    expect(healthBar(100, 100).color).toBe(HEALTH_COLORS.good);
  });

  it('shows an empty red bar for an unconscious player (0 health)', () => {
    expect(healthBar(0, 100)).toEqual({ visible: true, fraction: 0, color: HEALTH_COLORS.low, value: 0 });
  });

  it('hides on broken values', () => {
    expect(healthBar(Number.NaN, 100).visible).toBe(false);
    expect(healthBar(50, 0).visible).toBe(false);
    expect(healthBar(50, Number.NaN).visible).toBe(false);
  });
});

describe('healthLabel', () => {
  it('shows the rounded value and the maximum', () => {
    expect(healthLabel(72.3, 100)).toBe('73/100');
    expect(healthLabel(0, 100)).toBe('0/100');
    expect(healthLabel(Number.NaN, 100)).toBe('0/100');
  });
});
