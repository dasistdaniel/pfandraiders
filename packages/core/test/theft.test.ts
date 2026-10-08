import { describe, expect, it } from 'vitest';
import { totalBottles } from '../src/bottles';
import { CONFIG } from '../src/config';
import { damage } from '../src/health';
import { canBeLooted, canBeRobbed } from '../src/theft';
import { input, newGame, runFor, runSteps, teleport, setSpot, THIEF_ROWS } from './helpers';

const STEAL = { p1: input({ steal: true }) };
const RELEASE = { p1: input({}) };

/** p2 trägt 4 Plastik (Tasche, 8 Plätze), p1 ist Dieb mit leeren Händen (3 Plätze). p2 steht 16 px neben p1. */
function setup() {
  const s = newGame(THIEF_ROWS, ['p1', 'p2']);
  setSpot(s, 0, { plastic: 1 });
  s.players.p2.containerLevel = 1;
  s.players.p2.bottles = { plastic: 4, glass: 0, crate: 0 };
  return s;
}

describe('stealing', () => {
  it('takes half of the victim container at once on the key press', () => {
    const s = setup();
    runSteps(s, STEAL, 1);
    expect(s.players.p1.bottles.plastic).toBe(2);
    expect(s.players.p2.bottles.plastic).toBe(2);
    expect(s.players.p2.shieldMs).toBeGreaterThan(CONFIG.steal.shieldMs - 100); // p2 zählt im selben Tick schon herunter
    expect(s.players.p1.stealCooldownMs).toBe(CONFIG.steal.cooldownMs);
    expect(s.players.p1.mode).toBe('walking');
  });

  it('also works while the victim is searching and leaves the victim search running', () => {
    const s = setup();
    runSteps(s, { p2: input({ action: true }) }, 5);
    expect(s.players.p2.mode).toBe('searching');
    runSteps(s, { p1: input({ steal: true }), p2: input({ action: true }) }, 1);
    expect(s.players.p1.bottles.plastic).toBe(2);
    expect(s.players.p2.bottles.plastic).toBe(2);
    expect(s.players.p2.mode).toBe('searching');
  });

  it('rounds the stolen amount up', () => {
    const s = setup();
    s.players.p2.bottles = { plastic: 3, glass: 0, crate: 0 };
    runSteps(s, STEAL, 1);
    expect(s.players.p1.bottles.plastic).toBe(2);
    expect(s.players.p2.bottles.plastic).toBe(1);
  });

  it('takes the most valuable bottles first', () => {
    const s = setup();
    s.players.p2.bottles = { plastic: 2, glass: 1, crate: 1 };
    runSteps(s, STEAL, 1);
    expect(s.players.p1.bottles).toEqual({ plastic: 0, glass: 1, crate: 1 });
  });

  it('steals nothing from a victim with an empty container and starts no cooldown', () => {
    const s = setup();
    s.players.p2.bottles = { plastic: 0, glass: 0, crate: 0 };
    runSteps(s, STEAL, 1);
    expect(totalBottles(s.players.p1.bottles)).toBe(0);
    expect(s.players.p2.shieldMs).toBe(0);
    expect(s.players.p1.stealCooldownMs).toBe(0);
  });

  it('does nothing with a full thief container', () => {
    const s = setup();
    s.players.p1.bottles = { plastic: 3, glass: 0, crate: 0 };
    runSteps(s, STEAL, 1);
    expect(s.players.p1.bottles.plastic).toBe(3);
    expect(s.players.p2.bottles.plastic).toBe(4);
    expect(s.players.p2.shieldMs).toBe(0);
    expect(s.players.p1.stealCooldownMs).toBe(0);
  });

  it('limits the loot to the free room of the thief', () => {
    const s = setup();
    s.players.p1.bottles = { plastic: 2, glass: 0, crate: 0 };
    runSteps(s, STEAL, 1);
    expect(s.players.p1.bottles.plastic).toBe(3);
    expect(s.players.p2.bottles.plastic).toBe(3);
  });

  it('does not steal while the key is only held without a fresh press', () => {
    const s = setup();
    teleport(s, 'p2', { x: 120, y: 24 }); // weit weg
    runSteps(s, STEAL, 5);
    teleport(s, 'p2', { x: 40, y: 24 });
    runFor(s, STEAL, 1000);
    expect(totalBottles(s.players.p1.bottles)).toBe(0);
    expect(s.players.p2.bottles.plastic).toBe(4);
    runSteps(s, RELEASE, 1);
    runSteps(s, STEAL, 1);
    expect(s.players.p1.bottles.plastic).toBe(2);
  });

  it('does not steal while moving', () => {
    const s = setup();
    runSteps(s, { p1: input({ steal: true, moveY: 1 }) }, 1);
    expect(totalBottles(s.players.p1.bottles)).toBe(0);
    expect(s.players.p1.stealCooldownMs).toBe(0);
  });

  it('blocks a second theft during the cooldown and allows it afterwards', () => {
    const s = setup();
    runSteps(s, STEAL, 1);
    expect(s.players.p1.bottles.plastic).toBe(2);
    runSteps(s, RELEASE, 1);
    runFor(s, RELEASE, CONFIG.steal.shieldMs + 100); // Schutz des Opfers ist vorbei
    expect(s.players.p2.shieldMs).toBe(0);
    expect(s.players.p1.stealCooldownMs).toBeGreaterThan(0);
    runSteps(s, STEAL, 1);
    expect(s.players.p1.bottles.plastic).toBe(2);
    expect(s.players.p2.bottles.plastic).toBe(2);
    runSteps(s, RELEASE, 1);
    runFor(s, RELEASE, CONFIG.steal.cooldownMs);
    expect(s.players.p1.stealCooldownMs).toBe(0);
    runSteps(s, STEAL, 1);
    expect(s.players.p1.bottles.plastic).toBe(3);
    expect(s.players.p2.bottles.plastic).toBe(1);
  });

  it('counts the cooldown and the shield down to zero', () => {
    const s = setup();
    s.players.p1.stealCooldownMs = 100;
    s.players.p2.shieldMs = 100;
    runSteps(s, {}, 10, 20);
    expect(s.players.p1.stealCooldownMs).toBe(0);
    expect(s.players.p2.shieldMs).toBe(0);
  });

  it('shields the victim against a second thief', () => {
    const s = newGame(['##########', '#@@@b.D..#', '##########'], ['p1', 'p2', 'p3']);
    s.players.p2.containerLevel = 1;
    s.players.p2.bottles = { plastic: 4, glass: 0, crate: 0 };
    runSteps(s, STEAL, 1);
    expect(s.players.p1.bottles.plastic).toBe(2);
    runSteps(s, { p3: input({ steal: true }) }, 1);
    expect(totalBottles(s.players.p3.bottles)).toBe(0);
    expect(s.players.p2.bottles.plastic).toBe(2);
    expect(s.players.p3.stealCooldownMs).toBe(0);
  });

  it('never steals with the action key alone', () => {
    const s = setup();
    runFor(s, { p1: input({ action: true }) }, 1000);
    expect(totalBottles(s.players.p1.bottles)).toBe(0);
    expect(s.players.p2.bottles.plastic).toBe(4);
  });

  it('never steals from itself', () => {
    const s = setup();
    runSteps(s, { p2: input({ steal: true }) }, 1);
    expect(s.players.p2.bottles.plastic).toBe(4);
    expect(s.players.p2.stealCooldownMs).toBe(0);
  });

  it('cancels the own search of the thief on a successful theft', () => {
    const s = setup();
    teleport(s, 'p1', { x: 44, y: 24 }); // jetzt liegt auch der Spot (x=56) in Reichweite von p1
    runSteps(s, { p1: input({ action: true }) }, 5);
    expect(s.players.p1.mode).toBe('searching');
    runSteps(s, { p1: input({ action: true, steal: true }) }, 1);
    expect(s.players.p1.bottles.plastic).toBe(2);
    expect(s.players.p1.searchSpotId).toBeNull();
    expect(s.players.p1.mode).toBe('walking');
  });

  it('lets an unconscious thief steal nothing', () => {
    const s = setup();
    s.players.p1.unconsciousMs = 5000;
    runSteps(s, STEAL, 1);
    expect(totalBottles(s.players.p1.bottles)).toBe(0);
    expect(s.players.p2.bottles.plastic).toBe(4);
  });

  it('never robs an unconscious player', () => {
    const s = setup();
    s.players.p2.unconsciousMs = 5000;
    s.players.p2.bottles = { plastic: 0, glass: 0, crate: 0 }; // Umfallen leert den Container
    runSteps(s, STEAL, 1);
    expect(totalBottles(s.players.p1.bottles)).toBe(0);
    expect(s.players.p1.stealCooldownMs).toBe(0);
  });
});

describe('bolt cutters', () => {
  it('steals everything at once on the press, is used up and starts the cooldown', () => {
    const s = setup();
    s.players.p1.containerLevel = 3;
    s.players.p1.inventory.bolt_cutters = true;
    runSteps(s, STEAL, 1);
    expect(s.players.p1.bottles.plastic).toBe(4);
    expect(s.players.p2.bottles.plastic).toBe(0);
    expect(s.players.p1.inventory.bolt_cutters).toBe(false);
    expect(s.players.p2.shieldMs).toBeGreaterThan(CONFIG.steal.shieldMs - 100); // p2 zählt im selben Tick schon herunter
    expect(s.players.p1.stealCooldownMs).toBe(CONFIG.steal.cooldownMs);
  });

  it('is limited by the free room of the thief', () => {
    const s = setup();
    s.players.p1.inventory.bolt_cutters = true;
    runSteps(s, STEAL, 1);
    expect(s.players.p1.bottles.plastic).toBe(3);
    expect(s.players.p2.bottles.plastic).toBe(1);
    expect(s.players.p1.inventory.bolt_cutters).toBe(false);
  });

  it('is kept when the victim has no bottles', () => {
    const s = setup();
    s.players.p1.inventory.bolt_cutters = true;
    s.players.p2.bottles = { plastic: 0, glass: 0, crate: 0 };
    runSteps(s, STEAL, 1);
    expect(s.players.p1.inventory.bolt_cutters).toBe(true);
  });

  it('is kept when the victim is shielded', () => {
    const s = setup();
    s.players.p1.inventory.bolt_cutters = true;
    s.players.p2.shieldMs = 5000;
    runSteps(s, STEAL, 1);
    expect(s.players.p1.inventory.bolt_cutters).toBe(true);
    expect(s.players.p2.bottles.plastic).toBe(4);
  });

  it('is kept and steals nothing during the cooldown', () => {
    const s = setup();
    s.players.p1.inventory.bolt_cutters = true;
    s.players.p1.stealCooldownMs = 3000;
    runSteps(s, STEAL, 1);
    expect(s.players.p1.inventory.bolt_cutters).toBe(true);
    expect(s.players.p2.bottles.plastic).toBe(4);
  });

  it('is not used when the key was already held before the victim came into reach', () => {
    const s = setup();
    s.players.p1.inventory.bolt_cutters = true;
    teleport(s, 'p2', { x: 120, y: 24 }); // weit weg
    runSteps(s, STEAL, 5); // Taste gedrückt, kein Opfer in Reichweite
    teleport(s, 'p2', { x: 40, y: 24 });
    runSteps(s, STEAL, 5);
    expect(s.players.p1.inventory.bolt_cutters).toBe(true);
    expect(s.players.p2.bottles.plastic).toBe(4);
  });

  it('is not triggered by the action key', () => {
    const s = setup();
    s.players.p1.inventory.bolt_cutters = true;
    runSteps(s, { p1: input({ action: true }) }, 5);
    expect(s.players.p1.inventory.bolt_cutters).toBe(true);
    expect(s.players.p2.bottles.plastic).toBe(4);
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

  it('neither needs nor starts the steal cooldown and gives no shield', () => {
    const s = knockedSetup();
    s.players.p1.stealCooldownMs = 4000;
    runSteps(s, STEAL, 1);
    expect(s.players.p1.bottles.plastic).toBe(2);
    expect(s.players.p1.stealCooldownMs).toBeLessThan(4000);
    expect(s.players.p1.stealCooldownMs).toBeGreaterThan(3900);
    expect(s.players.p2.shieldMs).toBe(0);
  });

  it('takes all bottles with the bolt cutters and uses them up', () => {
    const s = knockedSetup();
    s.players.p1.containerLevel = 3;
    s.players.p1.inventory.bolt_cutters = true;
    runSteps(s, STEAL, 1);
    expect(s.players.p1.bottles.plastic).toBe(4);
    expect(s.players.p2.bottles.plastic).toBe(0);
    expect(s.players.p1.inventory.bolt_cutters).toBe(false);
    expect(s.players.p2.robbed).toBe(true);
  });

  it('limits the bolt cutters loot to the free room of the robber', () => {
    const s = knockedSetup();
    s.players.p1.inventory.bolt_cutters = true; // Hände: 3 Plätze
    runSteps(s, STEAL, 1);
    expect(s.players.p1.bottles.plastic).toBe(3);
    expect(s.players.p2.bottles.plastic).toBe(1);
    expect(s.players.p1.inventory.bolt_cutters).toBe(false);
    expect(s.players.p2.robbed).toBe(true);
  });

  it('keeps the bolt cutters when the container of the robber is full', () => {
    const s = knockedSetup();
    s.players.p1.inventory.bolt_cutters = true;
    s.players.p1.bottles = { plastic: 3, glass: 0, crate: 0 };
    runSteps(s, STEAL, 1);
    expect(s.players.p1.inventory.bolt_cutters).toBe(true);
    expect(s.players.p2.bottles.plastic).toBe(4);
    expect(s.players.p2.robbed).toBe(false);
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

  it('never lets the normal theft hit an unconscious player', () => {
    const s = knockedSetup();
    s.players.p2.robbed = true;
    expect(canBeRobbed(s.players.p1, s.players.p2)).toBe(false);
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
