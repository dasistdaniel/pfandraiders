import { bottlesValue, emptyBottles } from './bottles';
import { CONFIG } from './config';
import type { BuyCommand, GameState, ItemId, Player, Point } from './types';

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

/** Gibt alle Flaschen ab und schreibt den Wert gut. Der Aufrufer prüft die Nähe. */
export function deposit(p: Player): void {
  p.money += bottlesValue(p.bottles);
  p.bottles = emptyBottles();
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

export function tryBuy(state: GameState, p: Player, cmd: BuyCommand): boolean {
  return cmd === 'upgrade' ? tryUpgrade(state, p) : tryBuyItem(state, p, cmd);
}
