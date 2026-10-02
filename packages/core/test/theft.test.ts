import { describe, expect, it } from 'vitest';
import { totalBottles } from '../src/bottles';
import { CONFIG } from '../src/config';
import { isBeingRobbed } from '../src/theft';
import { input, newGame, runFor, runSteps, teleport, setSpot, THIEF_ROWS } from './helpers';

const STEAL = { p1: input({ steal: true }) };

/** p2 trägt 4 Plastik (Tasche, 8 Plätze), p1 ist Dieb mit leeren Händen (3 Plätze). p2 steht 16 px neben p1. */
function setup() {
  const s = newGame(THIEF_ROWS, ['p1', 'p2']);
  setSpot(s, 0, { plastic: 1 });
  s.players.p2.containerLevel = 1;
  s.players.p2.bottles = { plastic: 4, glass: 0, crate: 0 };
  return s;
}

describe('stealing', () => {
  it('takes half of the victim container after the steal time, even if the victim just stands there', () => {
    const s = setup();
    runFor(s, STEAL, CONFIG.steal.durationMs + 300);
    expect(s.players.p1.bottles.plastic).toBe(2);
    expect(s.players.p2.bottles.plastic).toBe(2);
    expect(s.players.p2.shieldMs).toBeGreaterThan(0);
    expect(s.players.p1.mode).toBe('walking');
  });

  it('also works while the victim is searching and leaves the victim search running', () => {
    const s = setup();
    runFor(s, { p1: input({ steal: true }), p2: input({ action: true }) }, CONFIG.steal.durationMs + 300);
    expect(s.players.p1.bottles.plastic).toBe(2);
    expect(s.players.p2.bottles.plastic).toBe(2);
    expect(s.players.p2.mode).toBe('searching');
  });

  it('warns the victim while the steal is in progress', () => {
    const s = setup();
    runSteps(s, STEAL, 50);
    expect(s.players.p1.mode).toBe('stealing');
    expect(s.players.p1.stealTargetId).toBe('p2');
    expect(isBeingRobbed(s, 'p2')).toBe(true);
    expect(isBeingRobbed(s, 'p1')).toBe(false);
  });

  it('rounds the stolen amount up', () => {
    const s = setup();
    s.players.p2.bottles = { plastic: 3, glass: 0, crate: 0 };
    runFor(s, STEAL, CONFIG.steal.durationMs + 300);
    expect(s.players.p1.bottles.plastic).toBe(2);
    expect(s.players.p2.bottles.plastic).toBe(1);
  });

  it('takes the most valuable bottles first', () => {
    const s = setup();
    s.players.p2.bottles = { plastic: 2, glass: 1, crate: 1 };
    runFor(s, STEAL, CONFIG.steal.durationMs + 300);
    expect(s.players.p1.bottles).toEqual({ plastic: 0, glass: 1, crate: 1 });
  });

  it('steals nothing from a victim with an empty container', () => {
    const s = setup();
    s.players.p2.bottles = { plastic: 0, glass: 0, crate: 0 };
    runFor(s, STEAL, CONFIG.steal.durationMs + 300);
    expect(totalBottles(s.players.p1.bottles)).toBe(0);
    expect(s.players.p2.shieldMs).toBe(0);
    expect(s.players.p1.stealTargetId).toBeNull();
  });

  it('does not start with a full thief container and loses nothing', () => {
    const s = setup();
    s.players.p1.bottles = { plastic: 3, glass: 0, crate: 0 };
    runFor(s, STEAL, CONFIG.steal.durationMs + 300);
    expect(s.players.p1.bottles.plastic).toBe(3);
    expect(s.players.p2.bottles.plastic).toBe(4);
    expect(s.players.p1.stealTargetId).toBeNull();
    expect(s.players.p1.mode).toBe('walking');
  });

  it('limits the loot to the free room of the thief', () => {
    const s = setup();
    s.players.p1.bottles = { plastic: 2, glass: 0, crate: 0 };
    runFor(s, STEAL, CONFIG.steal.durationMs + 300);
    expect(s.players.p1.bottles.plastic).toBe(3);
    expect(s.players.p2.bottles.plastic).toBe(3);
  });

  it('aborts when the thief walks away and steals nothing', () => {
    const s = setup();
    runSteps(s, STEAL, 50);
    runSteps(s, { p1: input({ steal: true, moveX: -1 }) }, 1);
    expect(s.players.p1.stealProgressMs).toBe(0);
    expect(s.players.p1.stealTargetId).toBeNull();
    expect(s.players.p1.mode).toBe('walking');
    expect(totalBottles(s.players.p1.bottles)).toBe(0);
  });

  it('aborts when the thief releases the steal key', () => {
    const s = setup();
    runSteps(s, STEAL, 50);
    runSteps(s, { p1: input({}) }, 1);
    expect(s.players.p1.stealProgressMs).toBe(0);
    expect(s.players.p1.mode).toBe('walking');
    expect(isBeingRobbed(s, 'p2')).toBe(false);
  });

  it('aborts when the victim runs out of reach', () => {
    const s = setup();
    runSteps(s, STEAL, 50);
    runSteps(s, { p1: input({ steal: true }), p2: input({ moveX: 1 }) }, 120);
    expect(totalBottles(s.players.p1.bottles)).toBe(0);
    expect(s.players.p2.bottles.plastic).toBe(4);
    expect(s.players.p1.stealProgressMs).toBe(0);
  });

  it('shields the victim so a second theft cannot follow at once', () => {
    const s = setup();
    runFor(s, STEAL, CONFIG.steal.durationMs + 300);
    expect(s.players.p1.bottles.plastic).toBe(2);
    runSteps(s, STEAL, 50);
    expect(s.players.p1.bottles.plastic).toBe(2);
    expect(s.players.p1.mode).not.toBe('stealing');
  });

  it('counts the shield down to zero', () => {
    const s = setup();
    s.players.p2.shieldMs = 100;
    runSteps(s, {}, 10, 20);
    expect(s.players.p2.shieldMs).toBe(0);
  });

  it('never steals with the action key alone', () => {
    const s = setup();
    runFor(s, { p1: input({ action: true }), p2: input({ action: true }) }, CONFIG.steal.durationMs + 300);
    expect(totalBottles(s.players.p1.bottles)).toBe(0);
    expect(s.players.p1.mode).not.toBe('stealing');
    expect(s.players.p2.bottles.plastic).toBe(4);
  });

  it('never steals from itself', () => {
    const s = setup();
    runFor(s, { p2: input({ steal: true }) }, CONFIG.steal.durationMs + 300);
    expect(s.players.p2.stealTargetId).toBeNull();
    expect(s.players.p2.bottles.plastic).toBe(4);
  });

  it('lets the steal key win over searching and cancels the thief search', () => {
    const s = setup();
    teleport(s, 'p1', { x: 44, y: 24 }); // jetzt liegt auch der Spot (x=56) in Reichweite von p1
    runSteps(s, { p1: input({ action: true }) }, 20);
    expect(s.players.p1.mode).toBe('searching');
    runSteps(s, { p1: input({ action: true, steal: true }) }, 1);
    expect(s.players.p1.mode).toBe('stealing');
    expect(s.players.p1.searchSpotId).toBeNull();
  });
});

describe('bolt cutters', () => {
  it('steals everything at once on the first press of the steal key and is used up', () => {
    const s = setup();
    s.players.p1.containerLevel = 3;
    s.players.p1.item = 'bolt_cutters';
    runSteps(s, STEAL, 1);
    expect(s.players.p1.bottles.plastic).toBe(4);
    expect(s.players.p2.bottles.plastic).toBe(0);
    expect(s.players.p1.item).toBeNull();
    expect(s.players.p2.shieldMs).toBeGreaterThan(0);
  });

  it('is limited by the free room of the thief', () => {
    const s = setup();
    s.players.p1.item = 'bolt_cutters';
    runSteps(s, STEAL, 1);
    expect(s.players.p1.bottles.plastic).toBe(3);
    expect(s.players.p2.bottles.plastic).toBe(1);
    expect(s.players.p1.item).toBeNull();
  });

  it('is kept when the victim has no bottles', () => {
    const s = setup();
    s.players.p1.item = 'bolt_cutters';
    s.players.p2.bottles = { plastic: 0, glass: 0, crate: 0 };
    runSteps(s, STEAL, 1);
    expect(s.players.p1.item).toBe('bolt_cutters');
  });

  it('is kept when the victim is shielded', () => {
    const s = setup();
    s.players.p1.item = 'bolt_cutters';
    s.players.p2.shieldMs = 5000;
    runSteps(s, STEAL, 1);
    expect(s.players.p1.item).toBe('bolt_cutters');
    expect(s.players.p2.bottles.plastic).toBe(4);
  });

  it('is not used when the key was already held before the victim came into reach', () => {
    const s = setup();
    s.players.p1.item = 'bolt_cutters';
    teleport(s, 'p2', { x: 120, y: 24 }); // weit weg
    runSteps(s, STEAL, 5); // Taste gedrückt, kein Opfer in Reichweite
    teleport(s, 'p2', { x: 40, y: 24 });
    runSteps(s, STEAL, 5);
    expect(s.players.p1.item).toBe('bolt_cutters');
    expect(s.players.p1.mode).toBe('stealing'); // normaler Diebstahl läuft stattdessen
  });

  it('is not triggered by the action key', () => {
    const s = setup();
    s.players.p1.item = 'bolt_cutters';
    runSteps(s, { p1: input({ action: true }) }, 5);
    expect(s.players.p1.item).toBe('bolt_cutters');
    expect(s.players.p2.bottles.plastic).toBe(4);
  });
});
