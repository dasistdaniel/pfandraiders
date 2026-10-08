import { describe, expect, it } from 'vitest';
import { totalBottles } from '../src/bottles';
import { CONFIG } from '../src/config';
import { createGame } from '../src/game';
import { CITY_MAP } from '../src/maps';

describe('createGame', () => {
  it('puts players on spawn points in order and wraps around', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const s = createGame(1, CITY_MAP, ids);
    ids.forEach((id, i) => {
      const spawn = CITY_MAP.spawns[i % CITY_MAP.spawns.length];
      expect(s.players[id]).toMatchObject({
        x: spawn.x,
        y: spawn.y,
        money: 0,
        containerLevel: 0,
        mode: 'walking',
        searchSpotId: null,
      });
    });
  });

  it('starts a running round with the configured time', () => {
    const s = createGame(1, CITY_MAP, ['a']);
    expect(s.phase).toBe('running');
    expect(s.timeLeftMs).toBe(CONFIG.roundMs);
    expect(s.tick).toBe(0);
  });

  it('accepts a shorter round length', () => {
    const s = createGame(1, CITY_MAP, ['a'], { roundMs: 5000 });
    expect(s.timeLeftMs).toBe(5000);
  });

  it('gives every spot either contents or a refill timer', () => {
    const s = createGame(77, CITY_MAP, ['a']);
    expect(s.spots.length).toBe(CITY_MAP.spots.length);
    for (const spot of s.spots) {
      if (totalBottles(spot.contents) === 0) {
        expect(spot.refillInMs).toBeGreaterThanOrEqual(0);
        expect(spot.refillInMs).toBeLessThan(CONFIG.refillMs);
      }
    }
  });

  it('is reproducible per seed and differs between seeds', () => {
    const a = createGame(1, CITY_MAP, ['a']);
    const b = createGame(1, CITY_MAP, ['a']);
    const c = createGame(2, CITY_MAP, ['a']);
    expect(a.spots).toEqual(b.spots);
    expect(a.spots).not.toEqual(c.spots);
  });

  it('refuses a map without spawn points', () => {
    const noSpawn = { ...CITY_MAP, spawns: [] };
    expect(() => createGame(1, noSpawn, ['a'])).toThrow(/spawn/);
  });

  it('starts players with an empty inventory, the fist and without cooldown or shield', () => {
    const s = createGame(1, CITY_MAP, ['a']);
    expect(s.players.a).toMatchObject({
      inventory: { dog_treat: 0, food: 0, bolt_cutters: false },
      upgrades: { knockout: 0, speed: 0, search: 0, punch: 0, armor: 0 },
      weapon: 'fist',
      earnedRound: 0,
      earnedTotal: 0,
      stealCooldownMs: 0,
      shieldMs: 0,
    });
  });

  it('refuses duplicate player ids', () => {
    expect(() => createGame(1, CITY_MAP, ['a', 'a'])).toThrow(/duplicate/);
  });

  it('starts players healthy and records their spawn point', () => {
    const s = createGame(1, CITY_MAP, ['a', 'b']);
    expect(s.players.a).toMatchObject({ health: CONFIG.health.max, unconsciousMs: 0 });
    expect(s.players.a.spawn).toEqual(CITY_MAP.spawns[0]);
    expect(s.players.b.spawn).toEqual(CITY_MAP.spawns[1]);
  });

  it('starts with no npcs, a first npc timer and idle zones with their first pause', () => {
    const s = createGame(3, CITY_MAP, ['a']);
    expect(s.npcs).toEqual([]);
    expect(s.nextNpcMs).toBe(CONFIG.npc.firstSpawnMs);
    expect(s.zones.map((z) => z.def.id)).toEqual(['stadium', 'concert']);
    for (const z of s.zones) {
      expect(z.phase).toBe('idle');
      expect(z.timerMs).toBeGreaterThanOrEqual(CONFIG.zone.firstIdleMs[0]);
      expect(z.timerMs).toBeLessThanOrEqual(CONFIG.zone.firstIdleMs[1]);
    }
  });
});
