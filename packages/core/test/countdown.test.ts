import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { createGame } from '../src/game';
import { parseMap } from '../src/map';
import { step } from '../src/step';
import { input, openRows, runSteps, SEARCH_ROWS } from './helpers';

describe('countdown before the round', () => {
  const map = parseMap(openRows(20, 5));

  it('lasts five seconds by default', () => {
    expect(CONFIG.countdownMs).toBe(5000);
    expect(createGame(1, map, ['p1']).countdownMs).toBe(CONFIG.countdownMs);
  });

  it('can be set per game (0 = no countdown)', () => {
    expect(createGame(1, map, ['p1'], { countdownMs: 0 }).countdownMs).toBe(0);
    expect(createGame(1, map, ['p1'], { countdownMs: 1200 }).countdownMs).toBe(1200);
  });

  it('only counts down: positions, round time and the world stay frozen', () => {
    const s = createGame(7, map, ['p1', 'p2'], { roundMs: 100 });
    s.nextNpcMs = 20;
    s.players.p1.health = 50;
    const before = JSON.parse(JSON.stringify({ ...s, map: null, tick: 0, countdownMs: 0 }));
    // länger als die Rundenzeit, aber kürzer als der Countdown: die Runde endet nicht
    runSteps(s, { p1: input({ moveX: 1, action: true, attack: true }), p2: input({ moveY: 1 }) }, 249, 20);
    expect(s.countdownMs).toBe(20);
    expect(s.phase).toBe('running');
    expect(s.tick).toBe(249);
    const after = JSON.parse(JSON.stringify({ ...s, map: null, tick: 0, countdownMs: 0 }));
    expect(after).toEqual(before);
  });

  it('keeps ticking during the countdown so snapshots stay in order', () => {
    const s = createGame(1, map, ['p1']);
    step(s, {}, 50);
    step(s, {}, 50);
    expect(s.tick).toBe(2);
    expect(s.countdownMs).toBe(CONFIG.countdownMs - 100);
  });

  it('drops the time left over when the countdown reaches zero; the round starts with the next step', () => {
    const s = createGame(1, map, ['p1'], { roundMs: 1000, countdownMs: 30 });
    step(s, { p1: input({ moveX: 1 }) }, 50);
    expect(s.countdownMs).toBe(0);
    expect(s.timeLeftMs).toBe(1000);
    expect(s.players.p1.x).toBe(24);
    step(s, { p1: input({ moveX: 1 }) }, 50);
    expect(s.timeLeftMs).toBe(950);
    expect(s.players.p1.x).toBeGreaterThan(24);
  });

  it('runs the round normally after the countdown', () => {
    const s = createGame(1, map, ['p1'], { roundMs: 1000, countdownMs: 100 });
    runSteps(s, {}, 5, 20);
    expect(s.countdownMs).toBe(0);
    runSteps(s, {}, 49, 20);
    expect(s.phase).toBe('running');
    runSteps(s, {}, 1, 20);
    expect(s.phase).toBe('ended');
  });

  it('allows no searching during the countdown', () => {
    const s = createGame(1, parseMap(SEARCH_ROWS), ['p1'], { countdownMs: 2000 });
    s.players.p1.x = 40;
    runSteps(s, { p1: input({ action: true }) }, 50, 20);
    expect(s.players.p1.searchSpotId).toBeNull();
    expect(s.players.p1.mode).toBe('walking');
  });

  it('is deterministic', () => {
    const run = () => {
      const s = createGame(42, map, ['p1', 'p2']);
      runSteps(s, { p1: input({ moveX: 1 }), p2: input({ moveY: 1 }) }, 400, 16);
      return JSON.stringify({ ...s, map: null });
    };
    expect(run()).toBe(run());
  });
});
