import { describe, expect, it } from 'vitest';
import { CONFIG, TILE } from '../src/config';

describe('steal and item config', () => {
  it('has sane theft values', () => {
    expect(CONFIG.steal.radius).toBeGreaterThan(0);
    expect(CONFIG.steal.radius).toBeLessThanOrEqual(2 * CONFIG.interactRadius); // Dieb und Opfer müssen sich sehen können
    expect(CONFIG.steal.cooldownMs).toBeGreaterThan(0);
    // die Abklingzeit des Diebs ist länger als der Schutz des Opfers: kein Dauerklauen am selben Opfer
    expect(CONFIG.steal.cooldownMs).toBeGreaterThan(CONFIG.steal.shieldMs);
    expect(CONFIG.steal.fraction).toBeGreaterThan(0);
    expect(CONFIG.steal.fraction).toBeLessThanOrEqual(1);
    expect(CONFIG.steal.shieldMs).toBeGreaterThan(0);
  });

  it('has a priced bolt cutters item', () => {
    expect(CONFIG.items.bolt_cutters.price).toBeGreaterThan(0);
    expect(CONFIG.items.bolt_cutters.name.length).toBeGreaterThan(0);
  });

  it('keeps the steal radius within a tile and a half so players must really be next to each other', () => {
    expect(CONFIG.steal.radius).toBeLessThanOrEqual(TILE * 1.5);
  });
});
