import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { findAttackTarget, punchDamage } from '../src/fight';
import { damage } from '../src/health';
import { input, newGame, runSteps, setSpot, teleport, THIEF_ROWS } from './helpers';

const PUNCH = { p1: input({ attack: true }) };
const IDLE = { p1: input({}) };

/** p1 (x=24) steht 16 px neben p2 (x=40), beide mit vollem Leben */
function setup() {
  return newGame(THIEF_ROWS, ['p1', 'p2']);
}

describe('punch', () => {
  it('hits the nearest awake player in reach for 20 health and starts the cooldown', () => {
    const s = setup();
    runSteps(s, PUNCH, 1);
    expect(s.players.p2.health).toBeCloseTo(CONFIG.health.max - CONFIG.fight.damage, 1);
    expect(s.players.p1.attackCooldownMs).toBe(CONFIG.fight.cooldownMs);
    expect(s.players.p1.health).toBeGreaterThan(CONFIG.health.max - 1);
  });

  it('acts on the press only, not while the key is held', () => {
    const s = setup();
    runSteps(s, PUNCH, 60); // 1200 ms gehalten
    expect(s.players.p2.health).toBeGreaterThan(CONFIG.health.max - CONFIG.fight.damage - 1);
  });

  it('does nothing during the 600 ms cooldown and hits again after it', () => {
    const s = setup();
    runSteps(s, PUNCH, 1);
    runSteps(s, IDLE, 1);
    runSteps(s, PUNCH, 1); // nach 40 ms
    expect(s.players.p2.health).toBeGreaterThan(CONFIG.health.max - CONFIG.fight.damage - 1);
    runSteps(s, IDLE, 30); // insgesamt über 600 ms
    runSteps(s, PUNCH, 1);
    expect(s.players.p2.health).toBeLessThan(CONFIG.health.max - 2 * CONFIG.fight.damage + 1);
  });

  it('misses beyond 20 px but still starts the cooldown', () => {
    const s = setup();
    teleport(s, 'p2', { x: 24 + CONFIG.fight.radius + 1, y: 24 });
    runSteps(s, PUNCH, 1);
    expect(s.players.p2.health).toBeGreaterThan(CONFIG.health.max - 1);
    expect(s.players.p1.attackCooldownMs).toBe(CONFIG.fight.cooldownMs);
  });

  it('deals no damage to a shielded player', () => {
    const s = setup();
    s.players.p2.shieldMs = 2000;
    runSteps(s, PUNCH, 1);
    expect(s.players.p2.health).toBeGreaterThan(CONFIG.health.max - 1);
  });

  it('adds the punch upgrade', () => {
    const s = setup();
    expect(punchDamage(s.players.p1)).toBe(CONFIG.fight.damage);
    s.players.p1.items.punch = 3;
    expect(punchDamage(s.players.p1)).toBe(CONFIG.fight.damage + 15);
  });

  it('knocks the victim out at zero health for the victim knockout time', () => {
    const s = setup();
    s.players.p2.health = 15;
    runSteps(s, PUNCH, 1);
    expect(s.players.p2.mode).toBe('unconscious');
    expect(s.players.p2.unconsciousMs).toBeGreaterThan(CONFIG.health.knockoutMs - 100);
  });

  it('ignores unconscious players as targets', () => {
    const s = setup();
    damage(s.players.p2, 1000);
    expect(findAttackTarget(s, s.players.p1)).toBeNull();
  });

  it('cannot punch while unconscious', () => {
    const s = setup();
    damage(s.players.p1, 1000);
    runSteps(s, PUNCH, 1);
    expect(s.players.p2.health).toBeGreaterThan(CONFIG.health.max - 1);
    expect(s.players.p1.attackCooldownMs).toBe(0);
  });

  it('cancels the own search and interrupts the search of the victim', () => {
    const s = setup();
    setSpot(s, 0, { plastic: 1 });
    runSteps(s, { p2: input({ action: true }) }, 5);
    expect(s.players.p2.mode).toBe('searching');
    runSteps(s, { p1: input({ attack: true }), p2: input({ action: true }) }, 1);
    expect(s.players.p2.searchSpotId).toBeNull();
  });

  it('works while walking', () => {
    const s = setup();
    runSteps(s, { p1: input({ attack: true, moveY: 1 }) }, 1);
    expect(s.players.p2.health).toBeLessThan(CONFIG.health.max - CONFIG.fight.damage + 1);
  });

  it('replays identically', () => {
    const run = () => {
      const s = setup();
      for (let t = 0; t < 300; t++) {
        runSteps(s, { p1: input({ attack: t % 7 < 2, moveX: t % 50 < 25 ? 1 : -1 }), p2: input({ attack: t % 11 < 3 }) }, 1);
      }
      return JSON.stringify(s);
    };
    expect(run()).toBe(run());
  });
});
