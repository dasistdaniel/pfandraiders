import { describe, expect, it } from 'vitest';
import { totalBottles } from '../src/bottles';
import { createGame } from '../src/game';
import { damage } from '../src/health';
import { parseMap } from '../src/map';
import { step } from '../src/step';
import type { GameState } from '../src/types';
import { input, THIEF_ROWS } from './helpers';

/** p2 trägt 4 Plastik und liegt ausgeknockt neben p1 */
function base(seed: number): GameState {
  const s = createGame(seed, parseMap(THIEF_ROWS), ['p1', 'p2'], { roundMs: 60000, countdownMs: 0 });
  s.spots[0].contents = { plastic: 1, glass: 0, crate: 0 };
  s.spots[0].refillInMs = 0;
  s.players.p2.items.bag = 3;
  s.players.p2.bottles = { plastic: 4, glass: 0, crate: 0 };
  damage(s.players.p2, 1000);
  return s;
}

/** Ausrauben mit wiederholten Tastendrücken: nur der erste wirkt (einmal pro Knockout) */
function loot(seed: number): GameState {
  const s = base(seed);
  for (let t = 0; t < 400; t++) {
    step(s, { p1: input({ steal: t % 100 < 2 }) }, 20);
  }
  return s;
}

describe('determinism with robbing', () => {
  it('replays a robbery identically and it happened exactly once', () => {
    const a = loot(7);
    const b = loot(7);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(totalBottles(a.players.p1.bottles)).toBe(2);
    expect(a.players.p2.robbed).toBe(true);
  });
});
