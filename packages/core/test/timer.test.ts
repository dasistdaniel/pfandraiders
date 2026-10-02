import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { createGame } from '../src/game';
import { parseMap } from '../src/map';
import { step } from '../src/step';
import { input, openRows, runSteps } from './helpers';

describe('round timer', () => {
  const map = parseMap(openRows(20, 5));

  it('counts down and ends the round at zero', () => {
    const s = createGame(1, map, ['p1'], { roundMs: 1000 });
    runSteps(s, {}, 49, 20);
    expect(s.phase).toBe('running');
    expect(s.timeLeftMs).toBe(20);
    runSteps(s, {}, 1, 20);
    expect(s.phase).toBe('ended');
    expect(s.timeLeftMs).toBe(0);
  });

  it('freezes the game after the round has ended', () => {
    const s = createGame(1, map, ['p1'], { roundMs: 100 });
    runSteps(s, {}, 5, 20);
    expect(s.phase).toBe('ended');
    const tick = s.tick;
    runSteps(s, { p1: input({ moveX: 1 }) }, 10, 20);
    expect(s.players.p1.x).toBe(24);
    expect(s.tick).toBe(tick);
  });

  it('uses the configured round length by default', () => {
    const s = createGame(1, map, ['p1']);
    expect(s.timeLeftMs).toBe(CONFIG.roundMs);
    step(s, {}, 20);
    expect(s.timeLeftMs).toBe(CONFIG.roundMs - 20);
  });

  it('ignores negative time steps', () => {
    const s = createGame(1, map, ['p1']);
    step(s, {}, -50);
    expect(s.timeLeftMs).toBe(CONFIG.roundMs);
  });

  it('ignores non-finite time steps instead of poisoning the state', () => {
    const s = createGame(1, map, ['p1']);
    step(s, {}, Number.NaN);
    step(s, {}, Number.POSITIVE_INFINITY);
    expect(Number.isNaN(s.timeLeftMs)).toBe(false);
    expect(s.timeLeftMs).toBeGreaterThan(CONFIG.roundMs - 200);
    expect(Number.isNaN(s.players.p1.health)).toBe(false);
  });
});
