import { CONFIG } from './config';
import { nextRandom, randInt } from './rng';
import type { FoodFind, GameState, Player, SpotType } from './types';

/** Texte zum Essensfund je Spot-Art (Spec §5.3); FoodFind.text ist der Index. */
export const FOOD_TEXTS: Record<SpotType, readonly string[]> = {
  bin: ['Cheeseburger im Müll gefunden! +30 Leben', 'Halber Döner aus der Tonne. Schmeckt erstaunlich okay.'],
  bench: ['Angebissene Currywurst auf der Bank. Egal, Hunger!'],
  bush: ['Kalte Pizza unterm Busch gefunden. Lecker!'],
  bus_stop: ['Vergessene Brezel an der Haltestelle. Noch knusprig.'],
  park: ['Halbes Eis im Gras. Noch nicht geschmolzen!'],
};

/** Wird angehängt, wenn das Leben schon voll war (Spec §5.4) */
export const FOOD_FULL_SUFFIX = ' Aber du bist schon satt.';

/** Hinweistext zu einem Fund; ein unbekannter Index fällt auf den ersten Text zurück. */
export function foodText(f: Pick<FoodFind, 'spot' | 'text' | 'full'>): string {
  const texts = FOOD_TEXTS[f.spot] ?? [];
  const base = texts[f.text] ?? texts[0] ?? '';
  return f.full ? base + FOOD_FULL_SUFFIX : base;
}

/**
 * Essensfund beim Abschluss einer Suche (Spec §5): genau ein Wurf gegen die Chance der Spot-Art,
 * bei einem Fund mit mehreren Texten ein zweiter für den Text. Heilt sofort bis zum Maximum; war das Leben
 * schon voll (aufgerundet wie im HUD), ist das Essen trotzdem weg. Gibt true zurück bei einem Fund.
 */
export function rollFood(state: GameState, p: Player, spot: SpotType): boolean {
  if (nextRandom(state) >= CONFIG.health.food.chance[spot]) return false;
  const count = FOOD_TEXTS[spot].length;
  const text = count > 1 ? randInt(state, 0, count - 1) : 0;
  const full = Math.ceil(p.health) >= CONFIG.health.max;
  p.health = Math.min(CONFIG.health.max, p.health + CONFIG.health.food.heal);
  p.lastFood = { n: (p.lastFood?.n ?? 0) + 1, spot, text, full };
  return true;
}
