import { describe, expect, it } from 'vitest';
import { CONFIG, TILE } from '../src/config';

describe('robbing and shop config', () => {
  it('has sane robbing values', () => {
    expect(CONFIG.steal.radius).toBeGreaterThan(0);
    expect(CONFIG.steal.radius).toBeLessThanOrEqual(2 * CONFIG.interactRadius); // Räuber und Opfer müssen sich sehen können
    expect(CONFIG.steal.fraction).toBeGreaterThan(0);
    expect(CONFIG.steal.fraction).toBeLessThanOrEqual(1);
  });

  it('has no theft cooldown or theft shield any more', () => {
    expect(Object.keys(CONFIG.steal).sort()).toEqual(['fraction', 'radius']);
  });

  it('has priced bolt cutters in the attack category', () => {
    expect(CONFIG.shop.items.bolt_cutters.prices[0]).toBeGreaterThan(0);
    expect(CONFIG.shop.items.bolt_cutters.name).toBe('Bolzenschneider');
    expect(CONFIG.shop.items.bolt_cutters.category).toBe('attack');
  });

  it('keeps the steal radius within a tile and a half so players must really be next to each other', () => {
    expect(CONFIG.steal.radius).toBeLessThanOrEqual(TILE * 1.5);
  });
});
