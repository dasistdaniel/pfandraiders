import { totalBottles, transferBottles } from './bottles';
import { CONFIG } from './config';
import { capacityOf, distance } from './economy';
import type { GameState, Player } from './types';

/** Kann `victim` jetzt von `thief` bestohlen werden? */
export function canBeRobbed(thief: Player, victim: Player): boolean {
  return (
    victim.id !== thief.id &&
    victim.shieldMs === 0 &&
    totalBottles(victim.bottles) > 0 &&
    distance(thief, victim) <= CONFIG.steal.radius
  );
}

/** Nächstes gültiges Opfer in Reichweite. Gleichstand: Reihenfolge der Spieler. */
export function findStealTarget(state: GameState, thief: Player): Player | null {
  let best: Player | null = null;
  let bestDist = Infinity;
  for (const id of Object.keys(state.players)) {
    const victim = state.players[id];
    if (!canBeRobbed(thief, victim)) continue;
    const d = distance(thief, victim);
    if (d < bestDist) {
      best = victim;
      bestDist = d;
    }
  }
  return best;
}

function takeLoot(thief: Player, victim: Player, fraction: number): void {
  const want = Math.ceil(totalBottles(victim.bottles) * fraction);
  const room = capacityOf(thief) - totalBottles(thief.bottles);
  const count = Math.max(0, Math.min(want, room));
  transferBottles(victim.bottles, thief.bottles, totalBottles(thief.bottles) + count);
  victim.shieldMs = CONFIG.steal.shieldMs;
}

/**
 * Sofort-Diebstahl im Schritt, in dem die Klauen-Taste neu gedrückt wurde.
 * Nimmt dem nächsten gültigen Opfer CONFIG.steal.fraction seines Containers ab (aufgerundet,
 * begrenzt durch den freien Platz); mit Bolzenschneider alles, das Item wird verbraucht.
 * Das Opfer bekommt Schutz, der Dieb eine Abklingzeit. Gibt true zurück, wenn geklaut wurde.
 * Während der Abklingzeit, mit vollem Container oder ohne Opfer passiert nichts.
 */
export function tryInstantSteal(state: GameState, thief: Player): boolean {
  if (thief.stealCooldownMs > 0) return false;
  if (totalBottles(thief.bottles) >= capacityOf(thief)) return false;
  const target = findStealTarget(state, thief);
  if (target === null) return false;

  if (thief.item === 'bolt_cutters') {
    takeLoot(thief, target, 1);
    thief.item = null;
  } else {
    takeLoot(thief, target, CONFIG.steal.fraction);
  }
  thief.stealCooldownMs = CONFIG.steal.cooldownMs;
  return true;
}
