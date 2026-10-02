import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { step } from '../src/step';
import { input, newGame, openRows, runSteps } from './helpers';

describe('movement', () => {
  it('walks at the configured speed', () => {
    const s = newGame(openRows(20, 5));
    runSteps(s, { p1: input({ moveX: 1 }) }, 50, 20); // 1000 ms
    expect(s.players.p1.x).toBeCloseTo(24 + CONFIG.playerSpeed, 5);
    expect(s.players.p1.y).toBe(24);
  });

  it('does not walk faster diagonally', () => {
    const s = newGame(openRows(20, 10));
    runSteps(s, { p1: input({ moveX: 1, moveY: 1 }) }, 50, 20);
    const dx = s.players.p1.x - 24;
    const dy = s.players.p1.y - 24;
    expect(Math.hypot(dx, dy)).toBeCloseTo(CONFIG.playerSpeed, 5);
  });

  it('stops at walls', () => {
    const s = newGame(['#####', '#@.##', '#####']);
    runSteps(s, { p1: input({ moveX: 1 }) }, 100, 20);
    const maxX = 48 - CONFIG.playerHalf; // linke Kante der Wandkachel minus halbe Boxbreite
    expect(s.players.p1.x).toBeLessThanOrEqual(maxX);
    expect(s.players.p1.x).toBeGreaterThan(maxX - 3);
    expect(s.players.p1.y).toBe(24);
  });

  it('slides along a wall when moving diagonally into it', () => {
    const s = newGame(openRows(10, 5));
    runSteps(s, { p1: input({ moveX: -1, moveY: 1 }) }, 30, 20);
    expect(s.players.p1.x).toBeGreaterThanOrEqual(16 + CONFIG.playerHalf);
    expect(s.players.p1.y).toBeGreaterThan(24);
  });

  it('is slower with the shopping cart', () => {
    const s = newGame(openRows(20, 5));
    s.players.p1.containerLevel = 3;
    runSteps(s, { p1: input({ moveX: 1 }) }, 50, 20);
    expect(s.players.p1.x - 24).toBeCloseTo(CONFIG.playerSpeed * CONFIG.containers[3].speedMult, 5);
  });

  it('clamps a huge time step so the player cannot jump through walls', () => {
    const s = newGame(openRows(40, 5));
    step(s, { p1: input({ moveX: 1 }) }, 10000);
    expect(s.players.p1.x - 24).toBeCloseTo((CONFIG.playerSpeed * CONFIG.maxStepMs) / 1000, 5);
    expect(s.timeLeftMs).toBe(CONFIG.roundMs - CONFIG.maxStepMs);
  });

  it('ignores a player that has no input this tick', () => {
    const s = newGame(openRows(20, 5), ['p1', 'p2']);
    runSteps(s, { p1: input({ moveX: 1 }) }, 10, 20);
    expect(s.players.p2.x).toBe(24);
  });
});
