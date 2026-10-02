import { describe, expect, it } from 'vitest';
import { totalBottles } from '../src/bottles';
import { createGame } from '../src/game';
import { parseMap } from '../src/map';
import { step } from '../src/step';
import type { GameState } from '../src/types';
import { input, THIEF_ROWS } from './helpers';

function base(seed: number): GameState {
  const s = createGame(seed, parseMap(THIEF_ROWS), ['p1', 'p2'], { roundMs: 60000 });
  s.spots[0].contents = { plastic: 1, glass: 0, crate: 0 };
  s.spots[0].refillInMs = 0;
  s.players.p2.containerLevel = 1;
  s.players.p2.bottles = { plastic: 4, glass: 0, crate: 0 };
  return s;
}

/** Normaler Diebstahl über 2 Sekunden */
function normalTheft(seed: number): GameState {
  const s = base(seed);
  for (let t = 0; t < 200; t++) {
    step(s, { p1: input({ action: true }), p2: input({ action: true }) }, 20);
  }
  return s;
}

/** Sofort-Diebstahl mit dem Bolzenschneider */
function cutters(seed: number): GameState {
  const s = base(seed);
  s.players.p1.containerLevel = 3;
  s.players.p1.item = 'bolt_cutters';
  step(s, { p2: input({ action: true }) }, 20);
  for (let t = 0; t < 200; t++) {
    step(s, { p1: input({ action: t === 0 }), p2: input({ action: true }) }, 20);
  }
  return s;
}

describe('determinism with theft', () => {
  it('replays a normal theft identically and the theft really happened', () => {
    const a = normalTheft(7);
    const b = normalTheft(7);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(totalBottles(a.players.p1.bottles)).toBe(2);
    expect(a.players.p2.shieldMs).toBeGreaterThan(0);
  });

  it('replays a bolt cutters theft identically and the item was used', () => {
    const a = cutters(7);
    const b = cutters(7);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(totalBottles(a.players.p1.bottles)).toBe(4);
    expect(a.players.p1.item).toBeNull();
  });
});
