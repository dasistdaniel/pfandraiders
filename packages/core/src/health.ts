import { CONFIG } from './config';
import { cancelSearch } from './search';
import type { Player } from './types';

/**
 * Umfallen: Flaschen, Geld und Besitz bleiben. Der Spieler liegt CONFIG.health.knockoutMs lang und kann
 * in dieser Zeit einmal ausgeraubt werden (robbed wird zurückgesetzt).
 */
export function knockOut(p: Player): void {
  p.health = 0;
  p.unconsciousMs = CONFIG.health.knockoutMs;
  p.robbed = false;
  cancelSearch(p);
  p.depositMs = 0;
  p.mode = 'unconscious';
}

/** Schaden. Bewusstlose nehmen keinen Schaden. Unterbricht das Suchen. */
export function damage(p: Player, amount: number): void {
  if (p.unconsciousMs > 0) return;
  cancelSearch(p);
  p.mode = 'walking';
  p.health = Math.max(0, p.health - amount);
  if (p.health <= 0) knockOut(p);
}

/**
 * Hunger, Bewusstlosigkeit und Aufstehen für einen Tick. Aufgestanden wird an derselben Stelle.
 * Gibt true zurück, wenn der Spieler in diesem Tick bewusstlos ist und keine Eingabe wirkt.
 */
export function updateHealth(p: Player, dtMs: number): boolean {
  if (p.unconsciousMs > 0) {
    p.unconsciousMs = Math.max(0, p.unconsciousMs - dtMs);
    if (p.unconsciousMs > 0) return true;
    p.health = CONFIG.health.reviveHealth;
    p.shieldMs = CONFIG.health.spawnShieldMs;
    p.robbed = false;
    return false;
  }
  p.health -= dtMs / CONFIG.health.hungerEveryMs;
  if (p.health <= 0) {
    knockOut(p);
    return true;
  }
  return false;
}
