import { describe, expect, it } from 'vitest';
import { createGame } from '../src/game';
import { CITY_MAP } from '../src/maps/city';
import { step } from '../src/step';
import { NO_INPUT } from '../src/types';
import type { GameState, Input } from '../src/types';

function scripted(tick: number, shift: number): Input {
  const dirs = [-1, 0, 1] as const;
  return {
    moveX: dirs[(tick + shift) % 3],
    moveY: dirs[(Math.floor(tick / 5) + shift) % 3],
    action: (tick + shift) % 7 < 4,
    buy: tick % 400 === 0 ? 'upgrade' : null,
  };
}

function play(seed: number): GameState {
  const s = createGame(seed, CITY_MAP, ['a', 'b']);
  for (let t = 0; t < 3000; t++) {
    step(s, { a: scripted(t, 0), b: t % 2 === 0 ? scripted(t, 1) : NO_INPUT }, 16);
  }
  return s;
}

describe('determinism', () => {
  it('replays to the identical state for the same seed and inputs', () => {
    const first = play(42);
    const second = play(42);
    expect(first.tick).toBe(3000);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('diverges for a different seed', () => {
    expect(JSON.stringify(play(43).spots)).not.toBe(JSON.stringify(play(42).spots));
  });
});
