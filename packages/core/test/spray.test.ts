import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { damage } from '../src/health';
import { boxBlocked } from '../src/map';
import { shove } from '../src/movement';
import { findSprayTarget, trySpray } from '../src/spray';
import type { GameState } from '../src/types';
import { input, newGame, runFor, runSteps, setSpot, teleport } from './helpers';

/** p1 (24,24), p2 (40,24): 16 px auseinander. Zeile 2 frei, Zeile 3 Wand (y ab 48), rechte Wand ab x = 176. */
const DUO = ['############', '#@@........#', '#..........#', '############'];

const SPRAY = { p1: input({ spray: true }) };
const RELEASE = { p1: input({}) };

function duo(): GameState {
  const s = newGame(DUO, ['p1', 'p2']);
  s.nextNpcMs = 1e9;
  s.players.p1.items.pepper = 10;
  return s;
}

describe('findSprayTarget', () => {
  it('takes the nearest awake other player within 30 px', () => {
    const s = newGame(['############', '#@@.@......#', '############'], ['p1', 'p2', 'p3']);
    expect(findSprayTarget(s, s.players.p1)?.id).toBe('p2');
    damage(s.players.p2, 1000);
    expect(findSprayTarget(s, s.players.p1)).toBeNull(); // p3 (x = 72) ist 48 px weg
    teleport(s, 'p3', { x: 54, y: 24 });
    expect(findSprayTarget(s, s.players.p1)?.id).toBe('p3');
  });
});

describe('spraying', () => {
  it('uses one charge, starts the cooldown, pushes the victim 40 px away and takes 2 health', () => {
    const s = duo();
    runSteps(s, SPRAY, 1);
    const [p1, p2] = [s.players.p1, s.players.p2];
    expect(p1.items.pepper).toBe(9);
    expect(p1.sprayCooldownMs).toBe(CONFIG.spray.cooldownMs);
    expect(p2.x).toBe(40 + CONFIG.spray.knockbackPx);
    expect(p2.y).toBe(24);
    expect(p2.health).toBeCloseTo(CONFIG.health.max - CONFIG.spray.damage, 1);
  });

  it('sprays only on the press, not while held, and not during the cooldown', () => {
    const s = duo();
    runSteps(s, SPRAY, 10);
    expect(s.players.p1.items.pepper).toBe(9);
    teleport(s, 'p2', { x: 40, y: 24 });
    runSteps(s, RELEASE, 1);
    runSteps(s, SPRAY, 1); // nach 220 ms: Abklingzeit läuft noch
    expect(s.players.p1.items.pepper).toBe(9);
    runFor(s, RELEASE, CONFIG.spray.cooldownMs);
    runSteps(s, SPRAY, 1);
    expect(s.players.p1.items.pepper).toBe(8);
  });

  it('does nothing without charges or without a target, and keeps the charge', () => {
    const s = duo();
    s.players.p1.items.pepper = 0;
    runSteps(s, SPRAY, 1);
    expect(s.players.p1.sprayCooldownMs).toBe(0);
    expect(s.players.p2.x).toBe(40);
    const t = duo();
    teleport(t, 'p2', { x: 120, y: 24 });
    runSteps(t, SPRAY, 1);
    expect(t.players.p1.items.pepper).toBe(10);
    expect(t.players.p1.sprayCooldownMs).toBe(0);
  });

  it('uses a charge but neither pushes nor hurts a shielded victim', () => {
    const s = duo();
    s.players.p2.shieldMs = 2000;
    runSteps(s, SPRAY, 1);
    expect(s.players.p1.items.pepper).toBe(9);
    expect(s.players.p1.sprayCooldownMs).toBe(CONFIG.spray.cooldownMs);
    expect(s.players.p2.x).toBe(40);
    expect(s.players.p2.health).toBeGreaterThan(CONFIG.health.max - 1);
  });

  it('stops the knockback at a wall', () => {
    const s = duo();
    teleport(s, 'p1', { x: 140, y: 24 });
    teleport(s, 'p2', { x: 160, y: 24 });
    runSteps(s, SPRAY, 1);
    expect(s.players.p2.x).toBe(170); // Box-Rand 175, die Wand beginnt bei 176
    expect(boxBlocked(s.map, s.players.p2.x, s.players.p2.y, CONFIG.playerHalf)).toBe(false);
  });

  it('slides along a wall on a diagonal knockback', () => {
    const s = duo();
    teleport(s, 'p2', { x: 40, y: 40 }); // 22,6 px schräg unter p1
    runSteps(s, SPRAY, 1);
    const p2 = s.players.p2;
    expect(p2.y).toBeGreaterThan(42);
    expect(p2.y).toBeLessThan(43); // Wand ab y = 48
    expect(p2.x).toBeCloseTo(40 + CONFIG.spray.knockbackPx * Math.SQRT1_2, 6);
    expect(boxBlocked(s.map, p2.x, p2.y, CONFIG.playerHalf)).toBe(false);
  });

  it('pushes to the right when both stand on the same point', () => {
    const s = duo();
    teleport(s, 'p2', { x: 24, y: 24 });
    runSteps(s, SPRAY, 1);
    expect(s.players.p2.x).toBe(24 + CONFIG.spray.knockbackPx);
    expect(s.players.p2.y).toBe(24);
    expect(Number.isNaN(s.players.p2.x)).toBe(false);
  });

  it('knocks a victim with 2 health out where he was pushed', () => {
    const s = duo();
    s.players.p2.health = 1.5;
    runSteps(s, SPRAY, 1);
    expect(s.players.p2.mode).toBe('unconscious');
    expect(s.players.p2.x).toBe(80);
  });

  it('cancels the own search and the search of the victim', () => {
    const s = newGame(['############', '#@b@.......#', '#..........#', '############'], ['p1', 'p2']);
    s.nextNpcMs = 1e9;
    s.players.p1.items.pepper = 10;
    teleport(s, 'p2', { x: 52, y: 24 }); // 12 px vom Spot (x = 40), 28 px von p1: in Sprühweite
    setSpot(s, 0, { plastic: 2 });
    runSteps(s, { p1: input({ action: true }), p2: input({ action: true }) }, 5);
    expect(s.players.p1.mode).toBe('searching');
    expect(s.players.p2.mode).toBe('searching');
    runSteps(s, { p1: input({ action: true, spray: true }), p2: input({ action: true }) }, 1);
    expect(s.players.p1.searchSpotId).toBeNull();
    expect(s.players.p2.searchSpotId).toBeNull();
  });

  it('ignores the spray key while unconscious', () => {
    const s = duo();
    damage(s.players.p1, 1000);
    runSteps(s, SPRAY, 1);
    expect(s.players.p1.items.pepper).toBe(10);
    expect(trySpray(s, s.players.p2)).toBe(false); // p2 hat keine Ladung
  });
});

describe('shove', () => {
  it('moves pixel by pixel and stops each axis at its wall', () => {
    const s = duo();
    // Oben: Box-Rand y − 5; die Wand (Zeile 0) reicht bis y = 16, also ist y = 21 die kleinste freie Mitte
    const p = { x: 40, y: 24 };
    shove(s.map, p, 0, -1, 40);
    expect(p).toEqual({ x: 40, y: 21 });
    const q = { x: 40, y: 24 };
    shove(s.map, q, 1, 0, 0);
    expect(q).toEqual({ x: 40, y: 24 });
  });
});
