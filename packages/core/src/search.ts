import { totalBottles, transferBottles } from './bottles';
import { CONFIG } from './config';
import { capacityOf, distance } from './economy';
import { rollFood } from './food';
import { rollContents } from './loot';
import { upgradeValue } from './shop';
import { spotMultiplier, spotRefillMs } from './zones';
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
  p.searchSpotId = null;
  p.searchProgressMs = 0;
}

/** Suchdauer nach der Stufe der Taschenlampe (ganze ms). */
export function searchMsOf(p: Pick<Player, 'items'>): number {
  return Math.round(CONFIG.searchMs * upgradeValue(p, 'flashlight'));
}

/**
 * Führt einen Suchschritt aus. Gibt true zurück, wenn der Spieler gerade sucht
 * (oder die Suche in diesem Schritt abgeschlossen hat), sonst false.
 * `canStart` ist true im Schritt, in dem die Aktionstaste neu gedrückt wurde: Nur dann
 * beginnt eine neue Suche; eine laufende Suche geht ohne neuen Druck weiter.
 */
export function updateSearch(state: GameState, p: Player, dtMs: number, canStart: boolean): boolean {
  if (totalBottles(p.bottles) >= capacityOf(p)) return false;
  // Ziel bleibt "klebrig": solange der aktuelle Spot gefüllt und in Reichweite ist, wird nicht gewechselt.
  const current = p.searchSpotId === null ? undefined : state.spots.find((x) => x.id === p.searchSpotId);
  const stillValid =
    current !== undefined &&
    totalBottles(current.contents) > 0 &&
    distance(p, current) <= CONFIG.interactRadius;
  const spot = stillValid ? current : canStart ? findSearchableSpot(state, p) : null;
  if (!spot) return false;

  if (p.searchSpotId !== spot.id) {
    p.searchSpotId = spot.id;
    p.searchProgressMs = 0;
  }
  p.searchProgressMs += dtMs;

  if (p.searchProgressMs >= searchMsOf(p)) {
    transferBottles(spot.contents, p.bottles, capacityOf(p));
    if (totalBottles(spot.contents) === 0) spot.refillInMs = spotRefillMs(state, spot);
    // Genau ein Wurf je abgeschlossener Suche: vielleicht liegt auch etwas zu essen dort
    rollFood(state, p, spot.type);
    cancelSearch(p);
  }
  return true;
}

/** Zählt den Nachfüll-Timer eines leeren Spots herunter und füllt ihn neu. */
export function refillSpot(state: GameState, spot: Spot, dtMs: number): void {
  if (totalBottles(spot.contents) > 0) return;
  spot.refillInMs -= dtMs;
  if (spot.refillInMs <= 0) {
    spot.contents = rollContents(state, spot.type, spotMultiplier(state, spot));
    spot.refillInMs = 0;
  }
}
