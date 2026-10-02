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
    runSteps(s, HOLD, 50, 20); // 1000 ms
    expect(s.players.p1.mode).toBe('searching');
    expect(s.players.p1.searchSpotId).toBe(0);
    expect(s.players.p1.searchProgressMs).toBe(1000);
  });

  it('resets progress when the key is released', () => {
    const s = newGame(SEARCH_ROWS);
    setSpot(s, 0, { plastic: 1 });
    runSteps(s, HOLD, 100, 20); // 2000 ms
    runSteps(s, { p1: input({}) }, 1, 20);
    expect(s.players.p1.mode).toBe('walking');
    expect(s.players.p1.searchProgressMs).toBe(0);
    runSteps(s, HOLD, 100, 20); // wieder 2000 ms, zusammen unter der Suchzeit pro Versuch
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
});
