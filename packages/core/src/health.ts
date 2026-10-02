import { emptyBottles } from './bottles';
import { CONFIG } from './config';
import { cancelSearch } from './search';
import { cancelSteal } from './theft';
import type { Player } from './types';

/** Umfallen: Flaschen, Item und ein Teil des Geldes gehen verloren. */
export function knockOut(p: Player): void {
  p.health = 0;
  p.unconsciousMs = CONFIG.health.unconsciousMs;
  p.bottles = emptyBottles();
  p.money -= Math.floor(p.money * CONFIG.health.moneyLossFraction);
  p.item = null;
  cancelSearch(p);
  cancelSteal(p);
  p.mode = 'unconscious';
}

/** Schaden. Bewusstlose nehmen keinen Schaden. Unterbricht Suchen und Klauen. */
export function damage(p: Player, amount: number): void {
  if (p.unconsciousMs > 0) return;
  cancelSearch(p);
  cancelSteal(p);
  p.health = Math.max(0, p.health - amount);
  if (p.health <= 0) knockOut(p);
}

/**
 * Hunger, Bewusstlosigkeit und Respawn für einen Tick.
 * Gibt true zurück, wenn der Spieler in diesem Tick bewusstlos ist und keine Eingabe wirkt.
 */
export function updateHealth(p: Player, dtMs: number): boolean {
  if (p.unconsciousMs > 0) {
    p.unconsciousMs = Math.max(0, p.unconsciousMs - dtMs);
    if (p.unconsciousMs > 0) return true;
    p.x = p.spawn.x;
    p.y = p.spawn.y;
    p.health = CONFIG.health.reviveHealth;
    p.shieldMs = CONFIG.health.spawnShieldMs;
    return false;
  }
  p.health -= dtMs / CONFIG.health.hungerEveryMs;
  if (p.health <= 0) {
    knockOut(p);
    return true;
  }
  return false;
}
