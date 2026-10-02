import { totalBottles, transferBottles } from './bottles';
import { CONFIG } from './config';
import { capacityOf, distance } from './economy';
import { rollContents } from './loot';
import type { GameState, Player, Spot } from './types';

/** Nächster nicht leerer Spot in Reichweite, sonst null. Gleichstand: kleinste id. */
export function findSearchableSpot(state: GameState, p: Player): Spot | null {
  let best: Spot | null = null;
  let bestDist = Infinity;
  for (const spot of state.spots) {
    if (totalBottles(spot.contents) === 0) continue;
    const d = distance(p, spot);
    if (d <= CONFIG.interactRadius && d < bestDist) {
      best = spot;
      bestDist = d;
    }
  }
  return best;
}

export function cancelSearch(p: Player): void {
  p.mode = 'walking';
  p.searchSpotId = null;
  p.searchProgressMs = 0;
}

/**
 * Führt einen Suchschritt aus. Gibt true zurück, wenn der Spieler gerade sucht
 * (oder die Suche in diesem Schritt abgeschlossen hat), sonst false.
 */
export function updateSearch(state: GameState, p: Player, dtMs: number): boolean {
  if (totalBottles(p.bottles) >= capacityOf(p)) return false;
  const spot = findSearchableSpot(state, p);
  if (!spot) return false;

  if (p.searchSpotId !== spot.id) {
    p.searchSpotId = spot.id;
    p.searchProgressMs = 0;
  }
  p.mode = 'searching';
  p.searchProgressMs += dtMs;

  if (p.searchProgressMs >= CONFIG.searchMs) {
    transferBottles(spot.contents, p.bottles, capacityOf(p));
    if (totalBottles(spot.contents) === 0) spot.refillInMs = CONFIG.refillMs;
    cancelSearch(p);
  }
  return true;
}

/** Zählt den Nachfüll-Timer eines leeren Spots herunter und füllt ihn neu. */
export function refillSpot(state: GameState, spot: Spot, dtMs: number): void {
  if (totalBottles(spot.contents) > 0) return;
  spot.refillInMs -= dtMs;
  if (spot.refillInMs <= 0) {
    spot.contents = rollContents(state, spot.type);
    spot.refillInMs = 0;
  }
}
