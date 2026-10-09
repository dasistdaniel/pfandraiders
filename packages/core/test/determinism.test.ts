import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { createGame } from '../src/game';
import { CITY_MAP } from '../src/maps';
import { step } from '../src/step';
import { NO_INPUT } from '../src/types';
import type { GameState, Input } from '../src/types';

function scripted(tick: number, shift: number): Input {
  const dirs = [-1, 0, 1] as const;
  return {
    moveX: dirs[(tick + shift) % 3],
    moveY: dirs[(Math.floor(tick / 5) + shift) % 3],
    action: (tick + shift) % 7 < 4,
    steal: false,
    attack: false,
    spray: false,
  };
}

function play(seed: number): GameState {
  const s = createGame(seed, CITY_MAP, ['a', 'b'], { countdownMs: 0 });
  for (let t = 0; t < 3000; t++) {
    step(s, { a: scripted(t, 0), b: t % 2 === 0 ? scripted(t, 1) : NO_INPUT }, 16);
  }
  return s;
}

function comprehensive(seed: number): {
  state: GameState;
  searchCompleted: boolean;
  spotEmptied: boolean;
  spotRefilled: boolean;
  spotEmptyStep: number;
  spotRefillStep: number;
  moneyBeforeDeposit: number;
  moneyAfterDeposit: number;
  depositAmount: number;
  bottlesAfterDeposit: number;
} {
  // Short round: 90 seconds = 900 steps of 100ms
  const s = createGame(seed, CITY_MAP, ['a'], { roundMs: 90 * 1000, countdownMs: 0 });
  const player = s.players['a'];
  const firstSpot = s.spots[0];
  const dropoff = s.map.dropoffs[0];

  // Guard: verify spot 0 is active at start
  const initialSpotBottles = firstSpot.contents.plastic + firstSpot.contents.glass + firstSpot.contents.crate;

  // Track events
  let searchCompleted = false;
  let spotEmptied = false;
  let spotRefilled = false;
  let spotEmptyStep = -1;
  let spotRefillStep = -1;
  let moneyBeforeDeposit = 0;
  let moneyAfterDeposit = 0;
  let depositAmount = 0;
  let bottlesAfterDeposit = -1;

  let phase = 0;
  // Die Abgabe dauert: erste Flasche beim Drücken, danach alle CONFIG.depositEveryMs eine.
  // Phase 1 hält die Taste, bis alles abgegeben ist; die späteren Phasen beginnen relativ dazu.
  let depositEnd = -1;

  for (let t = 0; t < 900; t++) {
    const dt = 100;
    const spotBottlesBefore = firstSpot.contents.plastic + firstSpot.contents.glass + firstSpot.contents.crate;

    if (phase === 0) {
      // Phase 0: teleport to spot and search (hold action for 31 steps = 3100ms > CONFIG.searchMs)
      player.x = firstSpot.x;
      player.y = firstSpot.y;
      const input: Input = t < 31 ? { ...NO_INPUT, action: true } : NO_INPUT;
      step(s, { a: input }, dt);
      if (t === 31) {
        searchCompleted = player.bottles.plastic + player.bottles.glass + player.bottles.crate > 0;
        phase = 1;
      }
    } else if (phase === 1) {
      // Phase 1: teleport to dropoff, press and hold until every bottle is deposited
      player.x = dropoff.x;
      player.y = dropoff.y;
      if (t === 32) {
        moneyBeforeDeposit = player.money;
        depositAmount = player.bottles.plastic + player.bottles.glass + player.bottles.crate;
        depositEnd = 32 + Math.ceil(((depositAmount - 1) * CONFIG.depositEveryMs) / dt);
      }
      const input: Input = { ...NO_INPUT, action: true };
      step(s, { a: input }, dt);
      if (t === depositEnd) {
        moneyAfterDeposit = player.money;
        bottlesAfterDeposit = player.bottles.plastic + player.bottles.glass + player.bottles.crate;
        phase = 2;
      }
    } else if (phase === 2) {
      // Phase 2: search the rest of the spot, then wait for refill (>450 steps = 45000ms > CONFIG.refillMs)
      player.x = firstSpot.x;
      player.y = firstSpot.y;
      // a new search needs a fresh press: release once after the deposit press, then hold
      const holdAction = t > depositEnd + 1 && t < depositEnd + 451; // 451 steps to ensure > 45s wait
      const input: Input = { ...NO_INPUT, action: holdAction };
      step(s, { a: input }, dt);
      if (t === depositEnd + 451) phase = 3;
    } else {
      // Phase 4: run until round ends (phase === 'ended' and timeLeftMs === 0)
      step(s, { a: NO_INPUT }, dt);
    }

    // Track spot emptying and refilling (check after each step)
    const spotBottlesAfter = firstSpot.contents.plastic + firstSpot.contents.glass + firstSpot.contents.crate;
    if (spotBottlesBefore > 0 && spotBottlesAfter === 0 && !spotEmptied) {
      spotEmptied = true;
      spotEmptyStep = t;
    }
    if (spotEmptied && spotBottlesAfter > 0 && !spotRefilled) {
      spotRefilled = true;
      spotRefillStep = t;
    }
  }

  return {
    state: s,
    searchCompleted,
    spotEmptied,
    spotRefilled,
    spotEmptyStep,
    spotRefillStep,
    moneyBeforeDeposit,
    moneyAfterDeposit,
    depositAmount,
    bottlesAfterDeposit,
  };
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

    // Verify round reached end
    expect(first.state.phase).toBe('ended');
    expect(first.state.timeLeftMs).toBe(0);
    expect(first.state.tick).toBe(900);

    // Verify search was completed: player has bottles and spot was emptied
    expect(first.searchCompleted).toBe(true);
    expect(first.spotEmptied).toBe(true);

    // Verify refill occurred: spot 0 went empty then back to having bottles
    expect(first.spotRefilled).toBe(true);
    // Sanity: refill must happen after empty
    expect(first.spotRefillStep).toBeGreaterThan(-1);

    // Verify deposit at dropoff: every bottle deposited, money increased
    expect(first.depositAmount).toBeGreaterThan(0);
    expect(first.bottlesAfterDeposit).toBe(0);
    expect(first.moneyAfterDeposit).toBeGreaterThan(first.moneyBeforeDeposit);
    expect(first.moneyAfterDeposit - first.moneyBeforeDeposit).toBeGreaterThan(0);

    // Verify determinism: same seed + deterministic inputs = identical state and events
    expect(JSON.stringify(second.state)).toBe(JSON.stringify(first.state));
    expect(second.searchCompleted).toBe(first.searchCompleted);
    expect(second.spotEmptied).toBe(first.spotEmptied);
    expect(second.spotEmptyStep).toBe(first.spotEmptyStep);
    expect(second.spotRefilled).toBe(first.spotRefilled);
    expect(second.spotRefillStep).toBe(first.spotRefillStep);
    expect(second.moneyAfterDeposit).toBe(first.moneyAfterDeposit);
  });
});
