import { CONFIG } from './config';
import { rollContents } from './loot';
import { randInt } from './rng';
import type { Area, GameState, Point, Spot, ZoneState } from './types';

/** x1/y1 sind exklusiv */
export function inArea(a: Area, p: Point): boolean {
  return p.x >= a.x0 && p.x < a.x1 && p.y >= a.y0 && p.y < a.y1;
}

/** Aktive Zone, in der der Punkt liegt, sonst null. */
export function activeZoneAt(state: GameState, p: Point): ZoneState | null {
  return state.zones.find((z) => z.phase === 'active' && inArea(z.def.area, p)) ?? null;
}

export function spotMultiplier(state: GameState, spot: Spot): number {
  return activeZoneAt(state, spot) ? CONFIG.zone.multiplier : 1;
}

export function spotRefillMs(state: GameState, spot: Spot): number {
  return activeZoneAt(state, spot) ? CONFIG.zone.refillMs : CONFIG.refillMs;
}

function boostSpots(state: GameState, zone: ZoneState): void {
  for (const spot of state.spots) {
    if (!inArea(zone.def.area, spot)) continue;
    spot.contents = rollContents(state, spot.type, CONFIG.zone.multiplier);
    spot.refillInMs = 0;
  }
}

/** Phasenwechsel der Zonen: Pause -> angekündigt -> aktiv -> Pause. */
export function updateZones(state: GameState, dtMs: number): void {
  for (const zone of state.zones) {
    zone.timerMs -= dtMs;
    if (zone.timerMs > 0) continue;
    if (zone.phase === 'idle') {
      zone.phase = 'announced';
      zone.timerMs = CONFIG.zone.announceMs;
    } else if (zone.phase === 'announced') {
      zone.phase = 'active';
      zone.timerMs = CONFIG.zone.activeMs;
      boostSpots(state, zone);
    } else {
      zone.phase = 'idle';
      zone.timerMs = randInt(state, ...CONFIG.zone.idleMs);
    }
  }
}
