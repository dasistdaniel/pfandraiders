import { describe, expect, it } from 'vitest';
import { totalBottles } from '../src/bottles';
import { CONFIG } from '../src/config';
import { isBeingRobbed } from '../src/theft';
import { input, newGame, runFor, runSteps, setSpot, teleport, THIEF_ROWS } from './helpers';

const BOTH_HOLD = { p1: input({ action: true }), p2: input({ action: true }) };

/** p2 sucht und trägt 4 Plastik (Tasche, 8 Plätze). p1 ist Dieb mit leeren Händen (3 Plätze). */
function setup() {
  const s = newGame(THIEF_ROWS, ['p1', 'p2']);
  setSpot(s, 0, { plastic: 1 });
  s.players.p2.containerLevel = 1;
  s.players.p2.bottles = { plastic: 4, glass: 0, crate: 0 };
  return s;
}

describe('stealing', () => {
  it('takes half of the victim container after the steal time', () => {
    const s = setup();
    runFor(s, BOTH_HOLD, CONFIG.steal.durationMs + 300);
    expect(s.players.p1.bottles.plastic).toBe(2);
    expect(s.players.p2.bottles.plastic).toBe(2);
    expect(s.players.p2.shieldMs).toBeGreaterThan(0);
    expect(s.players.p1.mode).toBe('walking');
    expect(s.players.p2.mode).toBe('searching'); // seine Suche läuft weiter
  });

  it('warns the victim while the steal is in progress', () => {
    const s = setup();
    runSteps(s, BOTH_HOLD, 50);
    expect(s.players.p1.mode).toBe('stealing');
    expect(s.players.p1.stealTargetId).toBe('p2');
    expect(isBeingRobbed(s, 'p2')).toBe(true);
    expect(isBeingRobbed(s, 'p1')).toBe(false);
  });

  it('rounds the stolen amount up', () => {
    const s = setup();
    s.players.p2.bottles = { plastic: 3, glass: 0, crate: 0 };
    runFor(s, BOTH_HOLD, CONFIG.steal.durationMs + 300);
    expect(s.players.p1.bottles.plastic).toBe(2); // ceil(1.5)
    expect(s.players.p2.bottles.plastic).toBe(1);
  });

  it('takes the most valuable bottles first', () => {
    const s = setup();
    s.players.p2.bottles = { plastic: 2, glass: 1, crate: 1 };
    runFor(s, BOTH_HOLD, CONFIG.steal.durationMs + 300);
    expect(s.players.p1.bottles).toEqual({ plastic: 0, glass: 1, crate: 1 });
  });

  it('steals nothing from a victim who is not searching', () => {
    const s = setup();
    runFor(s, { p1: input({ action: true }), p2: input({}) }, CONFIG.steal.durationMs + 300);
    expect(totalBottles(s.players.p1.bottles)).toBe(0);
    expect(s.players.p2.bottles.plastic).toBe(4);
  });

  it('steals nothing from a victim with an empty container', () => {
    const s = setup();
    s.players.p2.bottles = { plastic: 0, glass: 0, crate: 0 };
    runFor(s, BOTH_HOLD, CONFIG.steal.durationMs + 300);
    expect(totalBottles(s.players.p1.bottles)).toBe(0);
    expect(s.players.p2.shieldMs).toBe(0);
    expect(s.players.p1.stealTargetId).toBeNull();
  });

  it('does not start with a full thief container and loses nothing', () => {
    const s = setup();
    s.players.p1.bottles = { plastic: 3, glass: 0, crate: 0 }; // Hände fassen 3
    runFor(s, BOTH_HOLD, CONFIG.steal.durationMs + 300);
    expect(s.players.p1.bottles.plastic).toBe(3);
    expect(s.players.p2.bottles.plastic).toBe(4);
    expect(s.players.p1.stealTargetId).toBeNull();
    expect(s.players.p1.mode).toBe('walking');
  });

  it('limits the loot to the free room of the thief', () => {
    const s = setup();
    s.players.p1.bottles = { plastic: 2, glass: 0, crate: 0 }; // 1 Platz frei
    runFor(s, BOTH_HOLD, CONFIG.steal.durationMs + 300);
    expect(s.players.p1.bottles.plastic).toBe(3);
    expect(s.players.p2.bottles.plastic).toBe(3);
  });

  it('aborts when the thief walks away and steals nothing', () => {
    const s = setup();
    runSteps(s, BOTH_HOLD, 50);
    runSteps(s, { p1: input({ action: true, moveX: -1 }), p2: input({ action: true }) }, 1);
    expect(s.players.p1.stealProgressMs).toBe(0);
    expect(s.players.p1.stealTargetId).toBeNull();
    expect(s.players.p1.mode).toBe('walking');
    expect(totalBottles(s.players.p1.bottles)).toBe(0);
  });

  it('aborts when the thief releases the key', () => {
    const s = setup();
    runSteps(s, BOTH_HOLD, 50);
    runSteps(s, { p1: input({}), p2: input({ action: true }) }, 1);
    expect(s.players.p1.stealProgressMs).toBe(0);
    expect(s.players.p1.mode).toBe('walking');
    expect(isBeingRobbed(s, 'p2')).toBe(false);
  });

  it('aborts when the victim stops searching', () => {
    const s = setup();
    runSteps(s, BOTH_HOLD, 50);
    runSteps(s, { p1: input({ action: true }), p2: input({}) }, 120); // Opfer lässt los
    expect(totalBottles(s.players.p1.bottles)).toBe(0);
    expect(s.players.p2.bottles.plastic).toBe(4);
    expect(s.players.p1.stealProgressMs).toBe(0);
  });

  it('aborts when the victim walks out of reach', () => {
    const s = setup();
    runSteps(s, BOTH_HOLD, 50);
    runSteps(s, { p1: input({ action: true }), p2: input({ moveX: 1, action: true }) }, 120);
    expect(totalBottles(s.players.p1.bottles)).toBe(0);
    expect(s.players.p2.bottles.plastic).toBe(4);
  });

  it('shields the victim so a second theft cannot follow at once', () => {
    const s = setup();
    runFor(s, BOTH_HOLD, CONFIG.steal.durationMs + 300);
    expect(s.players.p1.bottles.plastic).toBe(2);
    runSteps(s, BOTH_HOLD, 50); // weitere 1000 ms, Schutz dauert 3000 ms
    expect(s.players.p1.bottles.plastic).toBe(2);
    expect(s.players.p1.mode).not.toBe('stealing');
  });

  it('counts the shield down to zero', () => {
    const s = setup();
    s.players.p2.shieldMs = 100;
    runSteps(s, {}, 10, 20);
    expect(s.players.p2.shieldMs).toBe(0);
  });

  it('does not let two players who both search the same spot rob each other', () => {
    const s = setup();
    teleport(s, 'p1', { x: 44, y: 24 }); // jetzt auch p1 in Reichweite des Spots (x=56)
    for (let i = 0; i < 155; i++) {
      runSteps(s, BOTH_HOLD, 1);
      expect(s.players.p1.mode).not.toBe('stealing');
      expect(s.players.p2.mode).not.toBe('stealing');
    }
    expect(s.players.p2.bottles.plastic).toBeGreaterThanOrEqual(4); // nichts verloren
  });

  it('never steals from itself', () => {
    const s = setup();
    runFor(s, { p2: input({ action: true }) }, CONFIG.steal.durationMs + 300);
    expect(s.players.p2.stealTargetId).toBeNull();
  });
});

describe('bolt cutters', () => {
  /** p2 beginnt zu suchen (Schritt 1), p1 drückt die Aktionstaste neu (Schritt 2) */
  function useCutters(s: ReturnType<typeof setup>) {
    runSteps(s, { p2: input({ action: true }) }, 1);
    runSteps(s, BOTH_HOLD, 1);
  }

  it('steals everything at once and is used up', () => {
    const s = setup();
    s.players.p1.containerLevel = 3; // 30 Plätze
    s.players.p1.item = 'bolt_cutters';
    useCutters(s);
    expect(s.players.p1.bottles.plastic).toBe(4);
    expect(s.players.p2.bottles.plastic).toBe(0);
    expect(s.players.p1.item).toBeNull();
    expect(s.players.p2.shieldMs).toBeGreaterThan(0);
  });

  it('is limited by the free room of the thief', () => {
    const s = setup();
    s.players.p1.item = 'bolt_cutters'; // Hände: 3 Plätze
    useCutters(s);
    expect(s.players.p1.bottles.plastic).toBe(3);
    expect(s.players.p2.bottles.plastic).toBe(1);
    expect(s.players.p1.item).toBeNull();
  });

  it('is kept when there is no valid victim', () => {
    const s = setup();
    s.players.p1.item = 'bolt_cutters';
    s.players.p2.bottles = { plastic: 0, glass: 0, crate: 0 };
    useCutters(s);
    expect(s.players.p1.item).toBe('bolt_cutters');
  });

  it('is kept when the victim is shielded', () => {
    const s = setup();
    s.players.p1.item = 'bolt_cutters';
    s.players.p2.shieldMs = 5000;
    useCutters(s);
    expect(s.players.p1.item).toBe('bolt_cutters');
    expect(s.players.p2.bottles.plastic).toBe(4);
  });

  it('is not used when the key is only held and not pressed', () => {
    const s = setup();
    s.players.p1.item = 'bolt_cutters';
    // p1 hält die Taste von Anfang an, drückt sie also nie "neu" während p2 sucht
    runSteps(s, BOTH_HOLD, 10);
    expect(s.players.p1.item).toBe('bolt_cutters');
    expect(s.players.p1.mode).toBe('stealing'); // normaler Diebstahl läuft stattdessen
  });
});
