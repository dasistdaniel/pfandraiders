import { totalBottles, transferBottles } from './bottles';
import { CONFIG } from './config';
import { capacityOf, distance } from './economy';
import type { GameState, Player } from './types';

export function cancelSteal(p: Player): void {
  p.stealTargetId = null;
  p.stealProgressMs = 0;
}

/** Kann `victim` jetzt von `thief` bestohlen werden? */
export function canBeRobbed(thief: Player, victim: Player): boolean {
  return (
    victim.id !== thief.id &&
    victim.mode === 'searching' &&
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

/** Läuft gerade ein Diebstahl gegen diesen Spieler? Für die Warnung im Client. */
export function isBeingRobbed(state: GameState, victimId: string): boolean {
  return Object.values(state.players).some(
    (p) => p.stealTargetId === victimId && p.stealProgressMs > 0,
  );
}

function takeLoot(thief: Player, victim: Player, fraction: number): void {
  const want = Math.ceil(totalBottles(victim.bottles) * fraction);
  const room = capacityOf(thief) - totalBottles(thief.bottles);
  const count = Math.max(0, Math.min(want, room));
  transferBottles(victim.bottles, thief.bottles, totalBottles(thief.bottles) + count);
  victim.shieldMs = CONFIG.steal.shieldMs;
}

/**
 * Ein Diebstahlschritt für einen Spieler, der die Aktionstaste hält und stillsteht.
 * Gibt true zurück, wenn er gerade klaut (oder in diesem Schritt fertig geworden ist).
 * `pressed` ist true im Schritt, in dem die Taste neu gedrückt wurde (löst den Bolzenschneider aus).
 * Bei false verändert die Funktion nichts außer einem veralteten Ziel, das der Aufrufer mit cancelSteal löscht.
 */
export function updateSteal(
  state: GameState,
  thief: Player,
  pressed: boolean,
  dtMs: number,
): boolean {
  if (totalBottles(thief.bottles) >= capacityOf(thief)) return false;

  const current = thief.stealTargetId === null ? undefined : state.players[thief.stealTargetId];
  let target: Player | null = null;
  if (current !== undefined && canBeRobbed(thief, current)) {
    target = current;
  } else if (thief.mode !== 'searching') {
    // Wer gerade selbst sucht, wechselt nicht zum Klauen.
    target = findStealTarget(state, thief);
  }
  if (target === null) return false;

  if (thief.item === 'bolt_cutters' && pressed) {
    takeLoot(thief, target, 1);
    thief.item = null;
    cancelSteal(thief);
    return true;
  }

  if (thief.stealTargetId !== target.id) {
    thief.stealTargetId = target.id;
    thief.stealProgressMs = 0;
  }
  thief.stealProgressMs += dtMs;
  if (thief.stealProgressMs >= CONFIG.steal.durationMs) {
    takeLoot(thief, target, CONFIG.steal.fraction);
    cancelSteal(thief);
  }
  return true;
}
