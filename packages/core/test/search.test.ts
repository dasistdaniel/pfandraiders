import { describe, expect, it } from 'vitest';
import { totalBottles } from '../src/bottles';
import { CONFIG } from '../src/config';
import {
  input,
  newGame,
  runFor,
  runSteps,
  SEARCH_ROWS,
  setSpot,
  teleport,
  TWO_PLAYER_ROWS,
} from './helpers';

const HOLD = { p1: input({ action: true }) };

describe('searching', () => {
  it('moves the spot contents into the container after the search time', () => {
    const s = newGame(SEARCH_ROWS);
    setSpot(s, 0, { plastic: 2 });
    runFor(s, HOLD, CONFIG.searchMs + 100);
    expect(s.players.p1.bottles.plastic).toBe(2);
    expect(totalBottles(s.spots[0].contents)).toBe(0);
    expect(s.spots[0].refillInMs).toBeGreaterThan(0);
    expect(s.spots[0].refillInMs).toBeLessThanOrEqual(CONFIG.refillMs);
    expect(s.players.p1.mode).toBe('walking');
  });

  it('shows searching mode and progress while the key is held', () => {
    const s = newGame(SEARCH_ROWS);
    setSpot(s, 0, { plastic: 1 });
    runSteps(s, HOLD, 25, 20); // 500 ms
    expect(s.players.p1.mode).toBe('searching');
    expect(s.players.p1.searchSpotId).toBe(0);
    expect(s.players.p1.searchProgressMs).toBe(500);
  });

  it('resets progress when the key is released', () => {
    const s = newGame(SEARCH_ROWS);
    setSpot(s, 0, { plastic: 1 });
    const part = Math.floor((CONFIG.searchMs * 2) / 3 / 20); // zwei Drittel der Suchzeit
    runSteps(s, HOLD, part, 20);
    runSteps(s, { p1: input({}) }, 1, 20);
    expect(s.players.p1.mode).toBe('walking');
    expect(s.players.p1.searchProgressMs).toBe(0);
    runSteps(s, HOLD, part, 20); // wieder zwei Drittel, zusammen über der Suchzeit, je Versuch darunter
    expect(totalBottles(s.players.p1.bottles)).toBe(0);
    expect(s.players.p1.mode).toBe('searching');
  });

  it('cancels the search when the player moves', () => {
    const s = newGame(SEARCH_ROWS);
    setSpot(s, 0, { plastic: 1 });
    runSteps(s, HOLD, 50, 20);
    runSteps(s, { p1: input({ action: true, moveX: 1 }) }, 1, 20);
    expect(s.players.p1.mode).toBe('walking');
    expect(s.players.p1.searchProgressMs).toBe(0);
    expect(s.players.p1.x).toBeGreaterThan(24);
  });

  it('does not start when the container is full and loses nothing', () => {
    const s = newGame(SEARCH_ROWS);
    setSpot(s, 0, { plastic: 2 });
    s.players.p1.bottles = { plastic: 3, glass: 0, crate: 0 }; // Hände fassen 3
    runFor(s, HOLD, CONFIG.searchMs + 100);
    expect(s.players.p1.mode).toBe('walking');
    expect(s.players.p1.bottles.plastic).toBe(3);
    expect(s.spots[0].contents.plastic).toBe(2);
  });

  it('keeps the surplus in the spot when the find is bigger than the free room', () => {
    const s = newGame(SEARCH_ROWS);
    setSpot(s, 0, { plastic: 3 });
    s.players.p1.bottles = { plastic: 2, glass: 0, crate: 0 };
    runFor(s, HOLD, CONFIG.searchMs + 100);
    expect(s.players.p1.bottles.plastic).toBe(3);
    expect(s.spots[0].contents.plastic).toBe(2);
    expect(s.spots[0].refillInMs).toBe(0); // nicht leer, also kein Nachfüll-Timer gestartet
  });

  it('ignores empty spots', () => {
    const s = newGame(SEARCH_ROWS);
    setSpot(s, 0, {});
    s.spots[0].refillInMs = 99999;
    runSteps(s, HOLD, 10, 20);
    expect(s.players.p1.mode).toBe('walking');
  });

  it('ignores spots that are out of reach', () => {
    const s = newGame(SEARCH_ROWS);
    setSpot(s, 0, { plastic: 1 });
    s.players.p1.x = 104; // 64 px entfernt, weit über dem Interaktionsradius
    runSteps(s, HOLD, 10, 20);
    expect(s.players.p1.mode).toBe('walking');
  });

  it('refills an empty spot after its timer runs out', () => {
    const s = newGame(SEARCH_ROWS);
    setSpot(s, 0, {});
    s.spots[0].refillInMs = 1000;
    runFor(s, {}, 900);
    expect(totalBottles(s.spots[0].contents)).toBe(0);
    runFor(s, {}, 200);
    expect(totalBottles(s.spots[0].contents)).toBeGreaterThanOrEqual(1);
  });

  it('never duplicates bottles when two players search the same spot', () => {
    const s = newGame(TWO_PLAYER_ROWS, ['p1', 'p2']);
    setSpot(s, 0, { plastic: 1 });
    const both = { p1: input({ action: true }), p2: input({ action: true }) };
    runFor(s, both, CONFIG.searchMs + 100);
    const total = totalBottles(s.players.p1.bottles) + totalBottles(s.players.p2.bottles);
    expect(total).toBe(1);
    expect(s.players.p1.bottles.plastic).toBe(1); // wer in der Spielerreihenfolge zuerst fertig wird
    expect(s.players.p2.mode).toBe('walking');
  });

  it('keeps the current search target when a nearer spot refills mid-search', () => {
    // Spots bei x=24 (id 0) und x=56 (id 1); Spieler bei x=36: id 0 ist näher (12 px), id 1 noch in Reichweite (20 px)
    const s = newGame(['######', '#b.m@#']);
    teleport(s, 'p1', { x: 36, y: 24 });
    setSpot(s, 0, {});
    s.spots[0].refillInMs = 99999;
    setSpot(s, 1, { plastic: 2 });
    const half = Math.floor(CONFIG.searchMs / 2 / 20);
    runSteps(s, HOLD, half, 20); // halbe Suchzeit am fernen Spot
    expect(s.players.p1.searchSpotId).toBe(1);
    expect(s.players.p1.searchProgressMs).toBe(half * 20);
    setSpot(s, 0, { glass: 1 }); // der nähere Spot füllt sich nach
    runSteps(s, HOLD, 1, 20);
    expect(s.players.p1.searchSpotId).toBe(1);
    expect(s.players.p1.searchProgressMs).toBe(half * 20 + 20);
    runSteps(s, HOLD, CONFIG.searchMs / 20 - half - 1, 20); // insgesamt die volle Suchzeit
    expect(s.players.p1.bottles.plastic).toBe(2);
    expect(s.players.p1.bottles.glass).toBe(0);
    expect(s.spots[0].contents.glass).toBe(1);
  });
});

describe('search needs a fresh key press', () => {
  const RELEASE = { p1: input({}) };

  it('does not start a search when the key was already held while walking up to the spot', () => {
    const s = newGame(SEARCH_ROWS);
    setSpot(s, 0, { plastic: 1 });
    teleport(s, 'p1', { x: 20, y: 24 });
    runSteps(s, { p1: input({ action: true, moveX: 1 }) }, 2, 20);
    runFor(s, HOLD, CONFIG.searchMs + 100);
    expect(s.players.p1.mode).toBe('walking');
    expect(s.players.p1.searchSpotId).toBeNull();
    expect(totalBottles(s.players.p1.bottles)).toBe(0);
  });

  it('starts the search after the key is released and pressed again', () => {
    const s = newGame(SEARCH_ROWS);
    setSpot(s, 0, { plastic: 1 });
    teleport(s, 'p1', { x: 20, y: 24 });
    runSteps(s, { p1: input({ action: true, moveX: 1 }) }, 2, 20);
    runSteps(s, HOLD, 5, 20);
    runSteps(s, RELEASE, 1, 20);
    runSteps(s, HOLD, 1, 20);
    expect(s.players.p1.mode).toBe('searching');
    expect(s.players.p1.searchSpotId).toBe(0);
    runFor(s, HOLD, CONFIG.searchMs);
    expect(s.players.p1.bottles.plastic).toBe(1);
  });

  it('continues an ongoing search while the key stays held', () => {
    const s = newGame(SEARCH_ROWS);
    setSpot(s, 0, { plastic: 1 });
    runSteps(s, HOLD, 1, 20);
    runSteps(s, HOLD, 10, 20);
    expect(s.players.p1.mode).toBe('searching');
    expect(s.players.p1.searchProgressMs).toBe(220);
  });

  it('does not resume a search interrupted by moving without a new press', () => {
    const s = newGame(SEARCH_ROWS);
    setSpot(s, 0, { plastic: 1 });
    runSteps(s, HOLD, 10, 20);
    runSteps(s, { p1: input({ action: true, moveX: 1 }) }, 1, 20);
    runFor(s, HOLD, CONFIG.searchMs + 100);
    expect(s.players.p1.mode).toBe('walking');
    expect(s.players.p1.searchProgressMs).toBe(0);
    expect(totalBottles(s.players.p1.bottles)).toBe(0);
    runSteps(s, RELEASE, 1, 20);
    runFor(s, HOLD, CONFIG.searchMs + 100);
    expect(s.players.p1.bottles.plastic).toBe(1);
  });

  it('does not start the next search while the key is still held after a completed one', () => {
    const s = newGame(SEARCH_ROWS);
    setSpot(s, 0, { plastic: 1 });
    runFor(s, HOLD, CONFIG.searchMs + 100);
    expect(s.players.p1.bottles.plastic).toBe(1);
    setSpot(s, 0, { plastic: 1 });
    runFor(s, HOLD, CONFIG.searchMs + 100);
    expect(s.players.p1.bottles.plastic).toBe(1);
    expect(s.players.p1.mode).toBe('walking');
  });

  it('does not switch to another spot without a press when the current one is emptied', () => {
    // Spots bei x=24 (id 0) und x=56 (id 1); Spieler bei x=36: id 0 ist näher
    const s = newGame(['######', '#b.m@#']);
    teleport(s, 'p1', { x: 36, y: 24 });
    setSpot(s, 0, { plastic: 1 });
    setSpot(s, 1, { plastic: 1 });
    runSteps(s, HOLD, 10, 20);
    expect(s.players.p1.searchSpotId).toBe(0);
    setSpot(s, 0, {});
    s.spots[0].refillInMs = 99999;
    runFor(s, HOLD, CONFIG.searchMs + 100);
    expect(s.players.p1.searchSpotId).toBeNull();
    expect(totalBottles(s.players.p1.bottles)).toBe(0);
  });
});
