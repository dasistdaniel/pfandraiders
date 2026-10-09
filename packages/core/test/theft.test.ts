import { describe, expect, it } from 'vitest';
import { totalBottles } from '../src/bottles';
import { CONFIG } from '../src/config';
import { damage } from '../src/health';
import { canBeLooted } from '../src/theft';
import { input, newGame, runFor, runSteps, teleport, setSpot, THIEF_ROWS } from './helpers';

const STEAL = { p1: input({ steal: true }) };
const RELEASE = { p1: input({}) };

/** p2 trägt 4 Plastik (3 Taschen, 9 Plätze), p1 ist Dieb mit leeren Händen (3 Plätze). p2 steht 16 px neben p1. */
function setup() {
  const s = newGame(THIEF_ROWS, ['p1', 'p2']);
  setSpot(s, 0, { plastic: 1 });
  s.players.p2.items.bag = 3;
  s.players.p2.bottles = { plastic: 4, glass: 0, crate: 0 };
  return s;
}

describe('awake players', () => {
  it('cannot be robbed with the key: nothing happens', () => {
    const s = setup();
    runSteps(s, STEAL, 1);
    expect(totalBottles(s.players.p1.bottles)).toBe(0);
    expect(s.players.p2.bottles.plastic).toBe(4);
    expect(s.players.p2.shieldMs).toBe(0);
    expect(s.players.p2.robbed).toBe(false);
    expect(s.players.p1.mode).toBe('walking');
  });

  it('keep their bottles even when the robber has a big container', () => {
    const s = setup();
    s.players.p1.items.cart = 1;
    runSteps(s, STEAL, 1);
    runSteps(s, RELEASE, 1);
    runSteps(s, STEAL, 1);
    expect(totalBottles(s.players.p1.bottles)).toBe(0);
    expect(s.players.p2.bottles.plastic).toBe(4);
  });

  it('are not robbed while searching and the key does not cancel the own search', () => {
    const s = setup();
    teleport(s, 'p1', { x: 44, y: 24 }); // der Spot (x=56) liegt in Reichweite von p1
    runSteps(s, { p1: input({ action: true }), p2: input({ action: true }) }, 5);
    expect(s.players.p1.mode).toBe('searching');
    runSteps(s, { p1: input({ action: true, steal: true }), p2: input({ action: true }) }, 1);
    expect(totalBottles(s.players.p1.bottles)).toBe(0);
    expect(s.players.p2.bottles.plastic).toBe(4);
    expect(s.players.p1.mode).toBe('searching');
  });

  it('are never looted by canBeLooted', () => {
    const s = setup();
    expect(canBeLooted(s.players.p1, s.players.p2)).toBe(false);
  });
});

describe('robbing a knocked-out player', () => {
  /** p2 (Tasche) trägt 4 Plastik und liegt ausgeknockt 16 px neben p1 */
  function knockedSetup() {
    const s = setup();
    damage(s.players.p2, 1000);
    return s;
  }

  it('takes half of the bottles once and marks the victim as robbed', () => {
    const s = knockedSetup();
    runSteps(s, STEAL, 1);
    expect(s.players.p1.bottles.plastic).toBe(2);
    expect(s.players.p2.bottles.plastic).toBe(2);
    expect(s.players.p2.robbed).toBe(true);
    runSteps(s, RELEASE, 1);
    runSteps(s, STEAL, 1);
    expect(s.players.p1.bottles.plastic).toBe(2);
    expect(s.players.p2.bottles.plastic).toBe(2);
  });

  it('needs a fresh press: holding the key from before the knockout robs nothing', () => {
    const s = setup();
    runFor(s, STEAL, 200); // Taste gedrückt, p2 noch wach
    damage(s.players.p2, 1000);
    runFor(s, STEAL, 1000);
    expect(totalBottles(s.players.p1.bottles)).toBe(0);
    expect(s.players.p2.robbed).toBe(false);
    runSteps(s, RELEASE, 1);
    runSteps(s, STEAL, 1);
    expect(s.players.p1.bottles.plastic).toBe(2);
    expect(s.players.p2.robbed).toBe(true);
  });

  it('rounds up and takes the most valuable bottles first', () => {
    const s = knockedSetup();
    s.players.p2.bottles = { plastic: 1, glass: 1, crate: 1 };
    runSteps(s, STEAL, 1);
    expect(s.players.p1.bottles).toEqual({ plastic: 0, glass: 1, crate: 1 });
    expect(s.players.p2.bottles).toEqual({ plastic: 1, glass: 0, crate: 0 });
  });

  it('cancels the own search of the robber', () => {
    const s = knockedSetup();
    teleport(s, 'p1', { x: 44, y: 24 }); // der Spot (x=56) liegt in Reichweite von p1
    runSteps(s, { p1: input({ action: true }) }, 5);
    expect(s.players.p1.mode).toBe('searching');
    runSteps(s, { p1: input({ action: true, steal: true }) }, 1);
    expect(s.players.p1.bottles.plastic).toBe(2);
    expect(s.players.p1.searchSpotId).toBeNull();
    expect(s.players.p1.mode).toBe('walking');
  });

  it('lets an unconscious robber rob nothing', () => {
    const s = knockedSetup();
    s.players.p1.unconsciousMs = 5000;
    runSteps(s, STEAL, 1);
    expect(totalBottles(s.players.p1.bottles)).toBe(0);
    expect(s.players.p2.robbed).toBe(false);
  });

  it('gives the victim no shield', () => {
    const s = knockedSetup();
    runSteps(s, STEAL, 1);
    expect(s.players.p1.bottles.plastic).toBe(2);
    expect(s.players.p2.shieldMs).toBe(0);
  });

  it('ignores the shield of the knocked-out player', () => {
    const s = knockedSetup();
    s.players.p2.shieldMs = 5000;
    runSteps(s, STEAL, 1);
    expect(s.players.p1.bottles.plastic).toBe(2);
    expect(s.players.p2.robbed).toBe(true);
  });

  it('always takes half, also with a big container', () => {
    const s = knockedSetup();
    s.players.p1.items.cart = 1;
    runSteps(s, STEAL, 1);
    expect(s.players.p1.bottles.plastic).toBe(2);
    expect(s.players.p2.bottles.plastic).toBe(2);
    expect(s.players.p2.robbed).toBe(true);
  });

  it('is limited by the room of the robber and does nothing with a full container', () => {
    const s = knockedSetup();
    s.players.p1.bottles = { plastic: 3, glass: 0, crate: 0 }; // Hände voll
    runSteps(s, STEAL, 1);
    expect(s.players.p2.bottles.plastic).toBe(4);
    expect(s.players.p2.robbed).toBe(false);
    s.players.p1.bottles = { plastic: 2, glass: 0, crate: 0 }; // ein Platz frei
    runSteps(s, RELEASE, 1);
    runSteps(s, STEAL, 1);
    expect(s.players.p1.bottles.plastic).toBe(3);
    expect(s.players.p2.bottles.plastic).toBe(3);
    expect(s.players.p2.robbed).toBe(true);
  });

  it('is possible again after the next knockout', () => {
    const s = knockedSetup();
    runSteps(s, STEAL, 1);
    expect(s.players.p2.robbed).toBe(true);
    s.players.p2.unconsciousMs = 0;
    s.players.p2.health = 50;
    s.players.p2.robbed = false;
    damage(s.players.p2, 1000);
    expect(s.players.p2.robbed).toBe(false);
    s.players.p1.bottles = { plastic: 0, glass: 0, crate: 0 };
    runSteps(s, RELEASE, 1);
    runSteps(s, STEAL, 1);
    expect(s.players.p1.bottles.plastic).toBe(1);
  });

  it('does nothing once the knocked-out player was robbed', () => {
    const s = knockedSetup();
    s.players.p2.robbed = true;
    expect(canBeLooted(s.players.p1, s.players.p2)).toBe(false);
    runSteps(s, STEAL, 1);
    expect(s.players.p2.bottles.plastic).toBe(4);
  });

  it('is out of reach beyond the steal radius', () => {
    const s = knockedSetup();
    teleport(s, 'p2', { x: 24 + CONFIG.steal.radius + 1, y: 24 });
    expect(canBeLooted(s.players.p1, s.players.p2)).toBe(false);
  });
});
