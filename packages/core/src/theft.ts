import { totalBottles, transferBottles } from './bottles';
import { CONFIG } from './config';
import { capacityOf, distance } from './economy';
import type { GameState, Player } from './types';

/** Kann der ausgeknockte `victim` jetzt von `thief` ausgeraubt werden? Einmal pro Knockout, Schutz zählt nicht. */
export function canBeLooted(thief: Player, victim: Player): boolean {
  return (
    victim.id !== thief.id &&
    thief.unconsciousMs === 0 &&
    victim.unconsciousMs > 0 &&
    !victim.robbed &&
    totalBottles(victim.bottles) > 0 &&
    distance(thief, victim) <= CONFIG.steal.radius
  );
}

/** Nächster Spieler, für den `ok` gilt. Gleichstand: Reihenfolge der Spieler. */
function nearest(state: GameState, thief: Player, ok: (thief: Player, victim: Player) => boolean): Player | null {
  let best: Player | null = null;
  let bestDist = Infinity;
  for (const id of Object.keys(state.players)) {
    const victim = state.players[id];
    if (!ok(thief, victim)) continue;
    const d = distance(thief, victim);
    if (d < bestDist) {
      best = victim;
      bestDist = d;
    }
  }
  return best;
}

/** Nächster ausraubbarer Ausgeknockter in Reichweite. */
export function findLootTarget(state: GameState, thief: Player): Player | null {
  return nearest(state, thief, canBeLooted);
}

/** Überträgt fraction der Flaschen des Opfers (aufgerundet), begrenzt durch den freien Platz des Diebs. */
function moveLoot(thief: Player, victim: Player, fraction: number): void {
  const want = Math.ceil(totalBottles(victim.bottles) * fraction);
  const room = capacityOf(thief) - totalBottles(thief.bottles);
  const count = Math.max(0, Math.min(want, room));
  transferBottles(victim.bottles, thief.bottles, totalBottles(thief.bottles) + count);
}

/**
 * Ausrauben im Schritt, in dem die Ausrauben-Taste (Eingabe `steal`) neu gedrückt wurde (Spec §4.4): nimmt dem nächsten
 * Ausgeknockten CONFIG.steal.fraction seiner Flaschen (aufgerundet, begrenzt durch den freien Platz)
 * und setzt `robbed`. Ohne Abklingzeit, ohne Schutz. Mit vollem Container passiert nichts (der Ausgeknockte
 * bleibt ausraubbar). Gibt true zurück, wenn ausgeraubt wurde.
 */
export function tryLoot(state: GameState, thief: Player): boolean {
  if (totalBottles(thief.bottles) >= capacityOf(thief)) return false;
  const target = findLootTarget(state, thief);
  if (target === null) return false;
  moveLoot(thief, target, CONFIG.steal.fraction);
  target.robbed = true;
  return true;
}
