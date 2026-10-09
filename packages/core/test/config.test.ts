import { describe, expect, it } from 'vitest';
import { CONFIG, TILE } from '../src/config';

describe('config sanity', () => {
  it('plays five minutes per round by default', () => {
    expect(CONFIG.roundMs).toBe(5 * 60 * 1000);
  });

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

  it('carries 3 in the hands and 31 with every bag, backpack and the cart', () => {
    expect(CONFIG.carry.base).toBe(3);
    expect(CONFIG.carry.perUnit).toEqual({ bag: 2, backpack: 5, cart: 10 });
    const max = CONFIG.shop.items;
    expect(
      CONFIG.carry.base +
        (max.bag.max ?? 0) * CONFIG.carry.perUnit.bag +
        (max.backpack.max ?? 0) * CONFIG.carry.perUnit.backpack +
        CONFIG.carry.perUnit.cart,
    ).toBe(31);
  });

  it('slows only with the cart, by a factor in (0, 1]', () => {
    expect(CONFIG.carry.cartSpeedMult).toBe(0.7);
    expect(CONFIG.carry.cartSpeedMult).toBeGreaterThan(0);
  });

  it('knocks out for a fixed 10 s and finds food in bins more often', () => {
    expect(CONFIG.health.knockoutMs).toBe(10000);
    expect(CONFIG.health.food.chance).toEqual({ bin: 0.1, bus_stop: 0.04, bench: 0.04, bush: 0.04, park: 0.04 });
  });
});

describe('soft collision config', () => {
  it('pins the soft core and the slide limit', () => {
    expect(CONFIG.softHalf).toBe(3);
    expect(CONFIG.slideMaxPx).toBe(9);
  });

  it('lets the player slide off a soft core hit dead-centre', () => {
    expect(CONFIG.slideMaxPx).toBeGreaterThanOrEqual(CONFIG.playerHalf + CONFIG.softHalf + 1);
  });

  it('keeps the soft core smaller than a tile and the slide limit below the box width', () => {
    expect(CONFIG.softHalf).toBeLessThan(TILE / 2);
    expect(CONFIG.slideMaxPx).toBeLessThan(CONFIG.playerHalf * 2);
  });
});

describe('dog chase config', () => {
  it('is slower than the player so a dog can be outrun, and gives up within seconds', () => {
    expect(CONFIG.npc.dog.speed).toBeLessThan(CONFIG.playerSpeed);
    // Vorsprung pro Sekunde reicht, um den Radius der Jagd in unter 8 s zu verlassen
    const gain = CONFIG.playerSpeed - CONFIG.npc.dog.speed;
    expect(CONFIG.npc.dog.senseRadius / gain).toBeLessThan(8);
    expect(CONFIG.npc.dog.lifeMs).toBeLessThanOrEqual(12000);
  });
});
