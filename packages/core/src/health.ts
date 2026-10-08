import { CONFIG } from './config';
import { cancelSearch } from './search';
import { upgradeValue } from './shop';
import type { Player } from './types';

/** Dauer eines Knockouts nach der Stufe "Knockout kürzer": 20 s, 15 s, 10 s, 5 s. */
export function knockoutMsOf(p: Pick<Player, 'upgrades'>): number {
  return upgradeValue(p, 'knockout');
}

/**
 * Umfallen: Flaschen, Geld und Inventar bleiben. Der Spieler liegt knockoutMsOf(p) lang und kann
 * in dieser Zeit einmal ausgeraubt werden (robbed wird zurückgesetzt).
 */
export function knockOut(p: Player): void {
  p.health = 0;
  p.unconsciousMs = knockoutMsOf(p);
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

/** Isst eine Portion aus dem Inventar: heilt bis zum Maximum. Nicht bewusstlos, nicht bei vollem Leben. */
export function eatFood(p: Player): boolean {
  if (p.unconsciousMs > 0 || p.inventory.food <= 0 || p.health >= CONFIG.health.max) return false;
  p.inventory.food--;
  p.health = Math.min(CONFIG.health.max, p.health + CONFIG.health.food.heal);
  return true;
}
