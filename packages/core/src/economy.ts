import { totalBottles, VALUE_ORDER } from './bottles';
import { CONFIG } from './config';
import type { GameState, Input, Player, Point } from './types';

/** Plätze: Hände plus Taschen, Rucksäcke und Einkaufswagen (Spec §2.1). */
export function capacityOf(p: Pick<Player, 'items'>): number {
  const c = CONFIG.carry;
  return c.base + p.items.bag * c.perUnit.bag + p.items.backpack * c.perUnit.backpack + p.items.cart * c.perUnit.cart;
}

/** Faktor auf das Lauftempo: nur der Einkaufswagen bremst (Spec §2.2). */
export function speedMultOf(p: Pick<Player, 'items'>): number {
  return p.items.cart > 0 ? CONFIG.carry.cartSpeedMult : 1;
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Ist der Spieler innerhalb des Interaktionsradius eines der Punkte? */
export function isNear(points: readonly Point[], p: Point): boolean {
  return points.some((pt) => distance(pt, p) <= CONFIG.interactRadius);
}

/** Gibt die wertvollste Flasche ab und schreibt ihren Wert gut (Geld, Rundenverdienst, Gesamtverdienst). Der Aufrufer prüft die Nähe. */
export function depositOne(p: Player): void {
  const kind = VALUE_ORDER.find((k) => p.bottles[k] > 0);
  if (kind === undefined) return;
  const value = CONFIG.bottleValue[kind];
  p.bottles[kind]--;
  p.money += value;
  p.earnedRound += value;
  p.earnedTotal += value;
}

/**
 * Zeitgesteuerte Abgabe am Pfandautomaten für einen Tick. Sie beginnt nur mit dem Drücken der
 * Aktionstaste (`pressed`) im Stand neben einem Automaten, mit sofort der ersten Flasche, und läuft
 * weiter, solange die Taste gehalten wird, der Spieler steht und Flaschen hat: alle
 * CONFIG.depositEveryMs eine Flasche. Gibt true zurück, wenn in diesem Tick abgegeben wird
 * (dann beginnt keine Suche im selben Tick).
 */
export function updateDeposit(
  state: GameState,
  p: Player,
  input: Input,
  dtMs: number,
  pressed: boolean,
): boolean {
  const can =
    input.action &&
    input.moveX === 0 &&
    input.moveY === 0 &&
    totalBottles(p.bottles) > 0 &&
    isNear(state.map.dropoffs, p);
  if (!can || (p.depositMs === 0 && !pressed)) {
    p.depositMs = 0;
    return false;
  }
  if (p.depositMs === 0) {
    depositOne(p);
    p.depositMs = CONFIG.depositEveryMs;
  } else {
    p.depositMs -= dtMs;
    while (p.depositMs <= 0 && totalBottles(p.bottles) > 0) {
      depositOne(p);
      p.depositMs += CONFIG.depositEveryMs;
    }
  }
  if (totalBottles(p.bottles) === 0) p.depositMs = 0;
  return true;
}
