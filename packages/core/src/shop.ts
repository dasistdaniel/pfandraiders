import { CONFIG } from './config';
import type { Items, Player, ShopCategory, ShopItemId } from './types';

/** Was ein Spieler von Runde zu Runde mitnimmt (Spec §7.1). */
export type Progress = Pick<Player, 'money' | 'items' | 'earnedTotal'>;

export const SHOP_CATEGORIES: readonly ShopCategory[] = ['bags', 'upgrades', 'weapons', 'defense'];

export const SHOP_CATEGORY_NAMES: Record<ShopCategory, string> = {
  bags: 'Taschen',
  upgrades: 'Upgrades',
  weapons: 'Waffen',
  defense: 'Verteidigung',
};

/** Alle Artikel in Katalogreihenfolge (Reihenfolge von CONFIG.shop.items). */
export const SHOP_ITEM_IDS: readonly ShopItemId[] = Object.keys(CONFIG.shop.items) as ShopItemId[];

/** Artikel mit Stufen und einer Wirkung je Stufe */
export type LevelItemId = 'flashlight' | 'punch';

export function isShopCategory(v: unknown): v is ShopCategory {
  return typeof v === 'string' && (SHOP_CATEGORIES as readonly string[]).includes(v);
}

export function isShopItemId(v: unknown): v is ShopItemId {
  return typeof v === 'string' && Object.hasOwn(CONFIG.shop.items, v);
}

/** Einträge einer Kategorie in Katalogreihenfolge */
export function shopItemsOf(category: ShopCategory): ShopItemId[] {
  return SHOP_ITEM_IDS.filter((id) => CONFIG.shop.items[id].category === category);
}

/** Kein Besitz. Als Literal, damit ein neuer Artikel hier die Kompilierung scheitern lässt. */
export function noItems(): Items {
  return { bag: 0, backpack: 0, cart: 0, flashlight: 0, card: 0, card_plus: 0, punch: 0, dog_treat: 0 };
}

/** Fortschritt eines neuen Spielers: nichts. */
export function freshProgress(): Progress {
  return { money: 0, items: noItems(), earnedTotal: 0 };
}

/** Tiefe Kopie, damit Runde, Raum und Nachrichten keine Objekte teilen. */
export function progressOf(p: Progress): Progress {
  return { money: p.money, items: { ...p.items }, earnedTotal: p.earnedTotal };
}

/** Fortschritt nach dem Ende einer Runde: Kopie ohne Mietsachen (perRound, etwa der Einkaufswagen). */
export function progressAfterRound(p: Progress): Progress {
  const out = progressOf(p);
  for (const id of SHOP_ITEM_IDS) if (CONFIG.shop.items[id].perRound) out.items[id] = 0;
  return out;
}

/** Wirkung der aktuellen Stufe (values[Stufe] aus CONFIG.shop). */
export function upgradeValue(p: Pick<Player, 'items'>, id: LevelItemId): number {
  return CONFIG.shop.items[id].values[p.items[id]];
}

/** Besitz: Stufe, Stückzahl oder 0/1. */
export function ownedOf(p: Pick<Progress, 'items'>, item: ShopItemId): number {
  return p.items[item];
}

/** Höchster Besitz: Zahl der Stufen, 1 oder max bzw. CONFIG.shop.maxStack (count, stack). */
export function maxOf(item: ShopItemId): number {
  const def = CONFIG.shop.items[item];
  if (def.kind === 'level') return def.prices.length;
  if (def.kind === 'once') return 1;
  return def.max ?? CONFIG.shop.maxStack;
}

export type BuyRefusal = 'unknown_item' | 'wrong_category' | 'bad_qty' | 'requires' | 'maxed' | 'no_money';

export type BuyResult = { ok: true; cost: number } | { ok: false; reason: BuyRefusal };

export const BUY_REFUSAL_TEXT: Record<BuyRefusal, string> = {
  unknown_item: 'Unbekannter Artikel.',
  wrong_category: 'Der Artikel gehört nicht in diese Kategorie.',
  bad_qty: 'Ungültige Menge.',
  // Bisher hat nur die Kundenkarte+ eine Voraussetzung
  requires: 'Erst die Kundenkarte kaufen.',
  maxed: 'Mehr geht nicht.',
  no_money: 'Nicht genug Geld.',
};

/**
 * Prüft einen Kauf, ohne etwas zu ändern. Stufen, einmalige Dinge und count-Artikel (Tasche, Rucksack) nur einzeln,
 * stack-Ware in Mengen bis max bzw. CONFIG.shop.maxStack. Kein Teilkauf: reicht das Geld nicht für alles, wird abgelehnt.
 */
export function checkShopBuy(p: Progress, category: unknown, item: unknown, qty: unknown): BuyResult {
  if (!isShopCategory(category) || !isShopItemId(item)) return { ok: false, reason: 'unknown_item' };
  const def = CONFIG.shop.items[item];
  if (def.category !== category) return { ok: false, reason: 'wrong_category' };
  if (typeof qty !== 'number' || !Number.isInteger(qty) || qty < 1 || qty > CONFIG.shop.maxStack) {
    return { ok: false, reason: 'bad_qty' };
  }
  if (def.kind !== 'stack' && qty !== 1) return { ok: false, reason: 'bad_qty' };
  if (def.requires !== undefined && p.items[def.requires] === 0) return { ok: false, reason: 'requires' };
  const owned = ownedOf(p, item);
  if (owned + qty > maxOf(item)) return { ok: false, reason: 'maxed' };
  const cost = def.kind === 'level' ? def.prices[owned] : def.prices[0] * qty;
  if (p.money < cost) return { ok: false, reason: 'no_money' };
  return { ok: true, cost };
}

/** Kauft (wenn checkShopBuy zustimmt) und bucht Geld und Besitz. Verändert `p` nur bei Erfolg. */
export function shopBuy(p: Progress, category: unknown, item: unknown, qty: unknown): BuyResult {
  const r = checkShopBuy(p, category, item, qty);
  if (!r.ok) return r;
  p.money -= r.cost;
  p.items[item as ShopItemId] += qty as number;
  return r;
}
