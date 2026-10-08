import { CONFIG } from './config';
import type { Inventory, Player, ShopCategory, ShopItemId, UpgradeId, Upgrades } from './types';

/** Was ein Spieler von Runde zu Runde mitnimmt (Spec §1.2). */
export type Progress = Pick<Player, 'money' | 'containerLevel' | 'upgrades' | 'inventory' | 'earnedTotal'>;

export const SHOP_CATEGORIES: readonly ShopCategory[] = ['bags', 'upgrades', 'attack', 'defense'];

export const SHOP_CATEGORY_NAMES: Record<ShopCategory, string> = {
  bags: 'Taschen',
  upgrades: 'Upgrades',
  attack: 'Angriff',
  defense: 'Verteidigung',
};

const UPGRADE_IDS: readonly string[] = ['knockout', 'speed', 'search', 'punch', 'armor'];

export function isShopCategory(v: unknown): v is ShopCategory {
  return typeof v === 'string' && (SHOP_CATEGORIES as readonly string[]).includes(v);
}

export function isShopItemId(v: unknown): v is ShopItemId {
  return typeof v === 'string' && Object.hasOwn(CONFIG.shop.items, v);
}

function isUpgradeId(v: ShopItemId): v is UpgradeId {
  return UPGRADE_IDS.includes(v);
}

/** Einträge einer Kategorie in Katalogreihenfolge */
export function shopItemsOf(category: ShopCategory): ShopItemId[] {
  return (Object.keys(CONFIG.shop.items) as ShopItemId[]).filter((id) => CONFIG.shop.items[id].category === category);
}

export function noUpgrades(): Upgrades {
  return { knockout: 0, speed: 0, search: 0, punch: 0, armor: 0 };
}

export function emptyInventory(): Inventory {
  return { dog_treat: 0, food: 0, bolt_cutters: false };
}

/** Fortschritt eines neuen Spielers: nichts. */
export function freshProgress(): Progress {
  return { money: 0, containerLevel: 0, upgrades: noUpgrades(), inventory: emptyInventory(), earnedTotal: 0 };
}

/** Tiefe Kopie, damit Runde, Raum und Nachrichten keine Objekte teilen. */
export function progressOf(p: Progress): Progress {
  return {
    money: p.money,
    containerLevel: p.containerLevel,
    upgrades: { ...p.upgrades },
    inventory: { ...p.inventory },
    earnedTotal: p.earnedTotal,
  };
}

/** Wirkung der aktuellen Stufe eines Upgrades (values[Stufe] aus CONFIG.shop). */
export function upgradeValue(p: Pick<Player, 'upgrades'>, id: UpgradeId): number {
  return CONFIG.shop.items[id].values[p.upgrades[id]];
}

/** Besitz: Stufe (Tasche, Upgrades), 0 oder 1 (einmalige Dinge) oder Stückzahl (Verbrauchsgüter). */
export function ownedOf(p: Progress, item: ShopItemId): number {
  if (item === 'bag') return p.containerLevel;
  if (isUpgradeId(item)) return p.upgrades[item];
  if (item === 'bolt_cutters') return p.inventory.bolt_cutters ? 1 : 0;
  if (item === 'dog_treat' || item === 'food') return p.inventory[item];
  return 0; // Fernkampf: noch nicht kaufbar
}

/** Höchster Besitz: Zahl der Stufen, 1 oder CONFIG.shop.maxStack. */
export function maxOf(item: ShopItemId): number {
  const def = CONFIG.shop.items[item];
  if (def.kind === 'level') return def.prices.length;
  if (def.kind === 'once') return 1;
  return CONFIG.shop.maxStack;
}

export type BuyRefusal = 'unknown_item' | 'wrong_category' | 'unavailable' | 'bad_qty' | 'maxed' | 'no_money';

export type BuyResult = { ok: true; cost: number } | { ok: false; reason: BuyRefusal };

export const BUY_REFUSAL_TEXT: Record<BuyRefusal, string> = {
  unknown_item: 'Unbekannter Artikel.',
  wrong_category: 'Der Artikel gehört nicht in diese Kategorie.',
  unavailable: 'Gibt es noch nicht.',
  bad_qty: 'Ungültige Menge.',
  maxed: 'Mehr geht nicht.',
  no_money: 'Nicht genug Geld.',
};

/**
 * Prüft einen Kauf, ohne etwas zu ändern. Stufen und einmalige Dinge nur einzeln, Verbrauchsgüter
 * bis zum Bestand CONFIG.shop.maxStack. Kein Teilkauf: reicht das Geld nicht für alles, wird abgelehnt.
 */
export function checkShopBuy(p: Progress, category: unknown, item: unknown, qty: unknown): BuyResult {
  if (!isShopCategory(category) || !isShopItemId(item)) return { ok: false, reason: 'unknown_item' };
  const def = CONFIG.shop.items[item];
  if (def.category !== category) return { ok: false, reason: 'wrong_category' };
  if (!def.available) return { ok: false, reason: 'unavailable' };
  if (typeof qty !== 'number' || !Number.isInteger(qty) || qty < 1 || qty > CONFIG.shop.maxStack) {
    return { ok: false, reason: 'bad_qty' };
  }
  if (def.kind !== 'stack' && qty !== 1) return { ok: false, reason: 'bad_qty' };
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
  const id = item as ShopItemId;
  p.money -= r.cost;
  if (id === 'bag') p.containerLevel++;
  else if (isUpgradeId(id)) p.upgrades[id]++;
  else if (id === 'bolt_cutters') p.inventory.bolt_cutters = true;
  else if (id === 'dog_treat' || id === 'food') p.inventory[id] += qty as number;
  return r;
}
