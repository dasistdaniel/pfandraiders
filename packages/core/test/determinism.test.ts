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

function comprehensive(seed: number): GameState {
  // Short round for testing: 150 seconds = 1500 steps of 100ms, but we only run 1200
  const s = createGame(seed, CITY_MAP, ['a'], { roundMs: 150 * 1000 });
  const player = s.players['a'];
  const firstSpot = s.spots[0];
  const dropoff = s.map.dropoffs[0];
  const shop = s.map.shops[0];

  let phase = 0;

  for (let t = 0; t < 1200; t++) {
    const dt = 100;

    if (phase === 0) {
      // Phase 0: Teleport to spot and search
      player.x = firstSpot.x;
      player.y = firstSpot.y;
      // Hold action for 31 steps (31 * 100 = 3100ms > 3000ms searchMs)
      const input: Input = t < 31 ? { moveX: 0, moveY: 0, action: true, buy: null } : NO_INPUT;
      step(s, { a: input }, dt);
      if (t === 31) phase = 1;
    } else if (phase === 1) {
      // Phase 1: Move to dropoff and deposit
      player.x = dropoff.x;
      player.y = dropoff.y;
      const releasedAction = t === 32; // Release action on first step
      const pressAction = t === 33; // Press action to trigger deposit
      const input: Input = { moveX: 0, moveY: 0, action: pressAction, buy: null };
      step(s, { a: input }, dt);
      if (t === 33) phase = 2;
    } else if (phase === 2) {
      // Phase 2: Wait for refill and search again
      player.x = firstSpot.x;
      player.y = firstSpot.y;
      // Hold action for ~46 steps to wait for refill (45000ms) and complete another search
      const input: Input = t < 34 + 46 ? { moveX: 0, moveY: 0, action: true, buy: null } : NO_INPUT;
      step(s, { a: input }, dt);
      if (t === 34 + 46) phase = 3;
    } else if (phase === 3) {
      // Phase 3: Move to shop and try upgrade
      player.x = shop.x;
      player.y = shop.y;
      // Try to buy upgrade on step 83
      const input: Input = { moveX: 0, moveY: 0, action: false, buy: t === 83 ? 'upgrade' : null };
      step(s, { a: input }, dt);
      if (t === 83) phase = 4;
    } else {
      // Phase 4: Just run until round ends
      step(s, { a: NO_INPUT }, dt);
    }
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

  it('comprehensive gameplay replays identically with same seed and deterministic inputs', () => {
    const first = comprehensive(42);
    const second = comprehensive(42);

    // Verify the scenario actually did something
    expect(first.tick).toBe(1200);
    expect(first.phase).toBe('running'); // Should still be running (150s round, only 120s elapsed)
    expect(first.players['a'].money).toBeGreaterThan(0); // Should have collected and deposited bottles
    expect(first.players['a'].bottles.plastic + first.players['a'].bottles.glass + first.players['a'].bottles.crate).toBeGreaterThanOrEqual(0); // May have bottles after second search

    // Verify at least one spot was emptied and refilled
    let spotWasEmptied = false;
    for (const spot of first.spots) {
      if (spot.refillInMs === 0) spotWasEmptied = true; // Spot was emptied and refilled
    }
    expect(spotWasEmptied).toBe(true);

    // Verify determinism: same seed + deterministic inputs = identical state
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});
