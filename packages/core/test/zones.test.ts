import { describe, expect, it } from 'vitest';
import { totalBottles } from '../src/bottles';
import { CONFIG } from '../src/config';
import { createGame } from '../src/game';
import { parseMap } from '../src/map';
import { activeZoneAt, inArea } from '../src/zones';
import { input, runFor, runSteps, setSpot } from './helpers';

/** Spawn (24,24); Spot 0 bei x=40 liegt in der Zone, Spot 1 bei x=136 außerhalb */
const ROWS = ['##########', '#@b.....n#', '##########'];
const ZONES = [{ id: 'z', name: 'Zone', area: { x0: 32, y0: 16, x1: 64, y1: 32 } }];

function game() {
  const s = createGame(1, parseMap(ROWS, ZONES), ['p1']);
  s.nextNpcMs = 1e9;
  return s;
}

describe('zone phases', () => {
  it('goes idle -> announced -> active -> idle on its timers', () => {
    const s = game();
    const z = s.zones[0];
    z.timerMs = 100;
    runSteps(s, {}, 5, 20);
    expect(z.phase).toBe('announced');
    expect(z.timerMs).toBe(CONFIG.zone.announceMs);
    runFor(s, {}, CONFIG.zone.announceMs);
    expect(z.phase).toBe('active');
    expect(z.timerMs).toBeLessThanOrEqual(CONFIG.zone.activeMs);
    runFor(s, {}, CONFIG.zone.activeMs);
    expect(z.phase).toBe('idle');
    expect(z.timerMs).toBeGreaterThanOrEqual(CONFIG.zone.idleMs[0] - 40);
    expect(z.timerMs).toBeLessThanOrEqual(CONFIG.zone.idleMs[1]);
  });

  it('does not touch spots while only announced', () => {
    const s = game();
    setSpot(s, 0, { plastic: 1 });
    const z = s.zones[0];
    z.timerMs = 20;
    runSteps(s, {}, 2, 20);
    expect(z.phase).toBe('announced');
    expect(s.spots[0].contents).toEqual({ plastic: 1, glass: 0, crate: 0 });
  });
});

describe('zone boost', () => {
  it('refills the spots inside the zone with a multiplied amount when it becomes active', () => {
    const s = game();
    setSpot(s, 0, { plastic: 1 });
    setSpot(s, 1, { plastic: 1 });
    const z = s.zones[0];
    z.phase = 'announced';
    z.timerMs = 20;
    runSteps(s, {}, 2, 20);
    expect(z.phase).toBe('active');
    expect(totalBottles(s.spots[0].contents)).toBeGreaterThanOrEqual(CONFIG.zone.multiplier);
    expect(s.spots[1].contents).toEqual({ plastic: 1, glass: 0, crate: 0 }); // außerhalb unverändert
  });

  it('uses the short refill time for spots emptied inside an active zone', () => {
    const s = game();
    const z = s.zones[0];
    z.phase = 'active';
    z.timerMs = 100000;
    setSpot(s, 0, { plastic: 1 });
    runFor(s, { p1: input({ action: true }) }, CONFIG.searchMs + 100);
    expect(totalBottles(s.spots[0].contents)).toBe(0);
    expect(s.spots[0].refillInMs).toBeGreaterThan(0);
    expect(s.spots[0].refillInMs).toBeLessThanOrEqual(CONFIG.zone.refillMs);
  });

  it('uses the normal refill time when the zone is not active', () => {
    const s = game();
    setSpot(s, 0, { plastic: 1 });
    runFor(s, { p1: input({ action: true }) }, CONFIG.searchMs + 100);
    expect(s.spots[0].refillInMs).toBeGreaterThan(CONFIG.zone.refillMs);
  });

  it('refills an emptied spot in an active zone with a multiplied amount', () => {
    const s = game();
    const z = s.zones[0];
    z.phase = 'active';
    z.timerMs = 100000;
    setSpot(s, 0, {});
    s.spots[0].refillInMs = 40;
    runSteps(s, {}, 3, 20);
    expect(totalBottles(s.spots[0].contents)).toBeGreaterThanOrEqual(CONFIG.zone.multiplier);
  });
});

describe('activeZoneAt', () => {
  it('returns the zone only while it is active and the point is inside', () => {
    const s = game();
    const inside = { x: 40, y: 24 };
    const outside = { x: 136, y: 24 };
    expect(activeZoneAt(s, inside)).toBeNull();
    s.zones[0].phase = 'announced';
    expect(activeZoneAt(s, inside)).toBeNull();
    s.zones[0].phase = 'active';
    expect(activeZoneAt(s, inside)).toBe(s.zones[0]);
    expect(activeZoneAt(s, outside)).toBeNull();
  });

  it('treats the upper bounds as exclusive', () => {
    const area = { x0: 0, y0: 0, x1: 32, y1: 32 };
    expect(inArea(area, { x: 0, y: 0 })).toBe(true);
    expect(inArea(area, { x: 32, y: 10 })).toBe(false);
    expect(inArea(area, { x: 10, y: 32 })).toBe(false);
  });
});
