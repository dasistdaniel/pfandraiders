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
    moveX: dirs[(Math.floor(tick / 8) + shift) % 3],
    moveY: dirs[(Math.floor(tick / 13) + shift) % 3],
    action: (tick + shift) % 9 < 5,
    steal: tick % 211 < 6,
    attack: tick % 97 < 3,
    eat: tick % 300 === 0,
  };
}

interface Stats {
  maxNpcs: number;
  sawDog: boolean;
  sawPolice: boolean;
  sawRoaming: boolean;
  zoneActive: boolean;
  minHealth: number;
  someUnconscious: boolean;
}

function play(seed: number): { state: GameState; stats: Stats } {
  const s = createGame(seed, CITY_MAP, ['a', 'b', 'c'], { roundMs: 400000, countdownMs: 0 });
  const stats: Stats = {
    maxNpcs: 0,
    sawDog: false,
    sawPolice: false,
    sawRoaming: false,
    zoneActive: false,
    minHealth: 100,
    someUnconscious: false,
  };
  for (let t = 0; t < 4000; t++) {
    step(s, { a: scripted(t, 0), b: scripted(t, 1), c: scripted(t, 2) }, 100);
    stats.maxNpcs = Math.max(stats.maxNpcs, s.npcs.length);
    if (s.npcs.some((n) => n.kind === 'dog')) stats.sawDog = true;
    if (s.npcs.some((n) => n.kind === 'police')) stats.sawPolice = true;
    if (s.npcs.some((n) => n.mood === 'roaming')) stats.sawRoaming = true;
    if (s.zones.some((z) => z.phase === 'active')) stats.zoneActive = true;
    for (const p of Object.values(s.players)) {
      stats.minHealth = Math.min(stats.minHealth, p.health);
      if (p.mode === 'unconscious') stats.someUnconscious = true;
    }
  }
  return { state: s, stats };
}

describe('determinism with events', () => {
  it('replays to the identical state for the same seed and inputs', () => {
    const a = play(5);
    const b = play(5);
    expect(a.state.tick).toBe(4000);
    expect(JSON.stringify(b.state)).toBe(JSON.stringify(a.state));
    expect(JSON.stringify(b.stats)).toBe(JSON.stringify(a.stats));
  });

  it('really exercises npcs and zones in that scenario', () => {
    const { stats } = play(5);
    expect(stats.maxNpcs).toBeGreaterThan(0);
    expect(stats.sawRoaming).toBe(true);
    expect(stats.zoneActive).toBe(true);
    expect(stats.minHealth).toBeLessThan(100); // players take damage in that scenario
  });

  it('diverges for a different seed', () => {
    expect(JSON.stringify(play(6).state.zones)).not.toBe(JSON.stringify(play(5).state.zones));
  });

  it('applies hunger inside the full step pipeline', () => {
    const s = createGame(5, CITY_MAP, ['a', 'b'], { roundMs: 400000, countdownMs: 0 });
    s.nextNpcMs = 1e9;
    s.zones.forEach((z) => {
      z.timerMs = 1e9;
    });
    const idle: Input = { ...NO_INPUT };
    for (let t = 0; t < 100; t++) step(s, { a: idle, b: idle }, 100);
    for (const p of Object.values(s.players)) {
      expect(p.health).toBeCloseTo(CONFIG.health.max - 10000 / CONFIG.health.hungerEveryMs, 5);
    }
  });
});
