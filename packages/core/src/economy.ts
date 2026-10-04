import { totalBottles, VALUE_ORDER } from './bottles';
import { CONFIG } from './config';
import type { BuyCommand, GameState, Input, ItemId, Player, Point } from './types';

export function containerOf(p: Player) {
  return CONFIG.containers[p.containerLevel];
}

export function capacityOf(p: Player): number {
  return containerOf(p).capacity;
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Ist der Spieler innerhalb des Interaktionsradius eines der Punkte? */
export function isNear(points: readonly Point[], p: Point): boolean {
  return points.some((pt) => distance(pt, p) <= CONFIG.interactRadius);
}

/** Gibt die wertvollste Flasche ab und schreibt ihren Wert gut. Der Aufrufer prüft die Nähe. */
export function depositOne(p: Player): void {
  const kind = VALUE_ORDER.find((k) => p.bottles[k] > 0);
  if (kind === undefined) return;
  p.bottles[kind]--;
  p.money += CONFIG.bottleValue[kind];
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

export function nextUpgrade(
  p: Player,
): { name: string; price: number; capacity: number } | null {
  const next = CONFIG.containers[p.containerLevel + 1];
  if (!next) return null;
  return { name: next.name, price: CONFIG.upgradePrices[p.containerLevel], capacity: next.capacity };
}

/** Kauft die nächste Container-Stufe, wenn Shop in Reichweite, Stufe frei und Geld reicht. */
export function tryUpgrade(state: GameState, p: Player): boolean {
  if (!isNear(state.map.shops, p)) return false;
  const up = nextUpgrade(p);
  if (!up || p.money < up.price) return false;
  p.money -= up.price;
  p.containerLevel++;
  return true;
}

/** Kauft ein Special Item, wenn Shop in Reichweite, Slot frei und Geld reicht. */
export function tryBuyItem(state: GameState, p: Player, item: ItemId): boolean {
  if (!Object.hasOwn(CONFIG.items, item)) return false;
  if (!isNear(state.map.shops, p)) return false;
  if (p.item !== null) return false;
  const price = CONFIG.items[item].price;
  if (p.money < price) return false;
  p.money -= price;
  p.item = item;
  return true;
}

/** Kauft Essen: Shop in Reichweite und genug Geld. Heilt bis zum Maximum. */
export function tryEat(state: GameState, p: Player): boolean {
  if (!isNear(state.map.shops, p)) return false;
  if (p.money < CONFIG.health.food.price) return false;
  p.money -= CONFIG.health.food.price;
  p.health = Math.min(CONFIG.health.max, p.health + CONFIG.health.food.heal);
  return true;
}

export function tryBuy(state: GameState, p: Player, cmd: BuyCommand): boolean {
  if (cmd === 'upgrade') return tryUpgrade(state, p);
  if (cmd === 'food') return tryEat(state, p);
  return tryBuyItem(state, p, cmd);
}
