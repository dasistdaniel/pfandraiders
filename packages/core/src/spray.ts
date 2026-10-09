import { CONFIG } from './config';
import { distance } from './economy';
import { damage } from './health';
import { shove } from './movement';
import type { GameState, Player } from './types';

/** Nächster wacher anderer Spieler höchstens CONFIG.spray.radius entfernt. Schutz zählt nicht. Gleichstand: Reihenfolge der Spieler. */
export function findSprayTarget(state: GameState, sprayer: Player): Player | null {
  let best: Player | null = null;
  let bestDist = Infinity;
  for (const id of Object.keys(state.players)) {
    const victim = state.players[id];
    if (victim.id === sprayer.id || victim.unconsciousMs > 0) continue;
    const d = distance(sprayer, victim);
    if (d <= CONFIG.spray.radius && d < bestDist) {
      best = victim;
      bestDist = d;
    }
  }
  return best;
}

/**
 * Sprühen im Schritt, in dem die Spray-Taste neu gedrückt wurde (Spec §4.2). Nur mit Ladung, ohne Abklingzeit
 * und mit Ziel; sonst passiert nichts (keine Ladung, keine Abklingzeit). Dann: eine Ladung weg, Abklingzeit,
 * und das Opfer wird (ohne Schutz) knockbackPx weggestoßen und verliert CONFIG.spray.damage Leben.
 * Stehen beide auf demselben Punkt, geht der Stoß nach rechts. Gibt true zurück, wenn gesprüht wurde.
 */
export function trySpray(state: GameState, sprayer: Player): boolean {
  if (sprayer.sprayCooldownMs > 0 || sprayer.items.pepper <= 0) return false;
  const target = findSprayTarget(state, sprayer);
  if (target === null) return false;
  sprayer.items.pepper--;
  sprayer.sprayCooldownMs = CONFIG.spray.cooldownMs;
  if (target.shieldMs > 0) return true;
  const d = distance(sprayer, target);
  const ux = d > 0 ? (target.x - sprayer.x) / d : 1;
  const uy = d > 0 ? (target.y - sprayer.y) / d : 0;
  shove(state.map, target, ux, uy, CONFIG.spray.knockbackPx);
  damage(target, CONFIG.spray.damage);
  return true;
}
