import { checkShopBuy, CONFIG, maxOf, ownedOf, SHOP_CATEGORIES, SHOP_CATEGORY_NAMES, shopItemsOf } from '@pfandraiders/core';
import type { BuyRefusal, Progress, ShopCategory, ShopItemId } from '@pfandraiders/core';
import { formatMoney } from './format';

export type ShopDir = 'up' | 'down' | 'left' | 'right';

export type ShopAction =
  | { kind: 'buy'; category: ShopCategory; item: ShopItemId; qty: number }
  | { kind: 'refused'; reason: BuyRefusal }
  | { kind: 'ready'; ready: boolean }
  | { kind: 'endSeries' };

export interface ShopRowView {
  kind: 'item' | 'ready' | 'end';
  item: ShopItemId | null;
  name: string;
  detail: string;
  /** Preis der gewählten Menge, leer wenn nichts zu kaufen ist */
  price: string;
  /** grey = nicht kaufbar (Geld, Grenze, Voraussetzung, Besitz) */
  state: 'normal' | 'grey';
  selected: boolean;
}

export interface ShopCategoryView {
  category: ShopCategory;
  name: string;
  selected: boolean;
}

/** Maus im Shop nur online (Spec §3.3); lokal bleibt alles bei den Bewegungstasten. */
export function shopPointerEnabled(online: boolean): boolean {
  return online;
}

/** Wirkung einer Stufe als kurzer Text. */
function effectText(item: ShopItemId, level: number): string {
  const v = CONFIG.shop.items[item].values[level];
  switch (item) {
    case 'flashlight':
      return `−${Math.round((1 - v) * 100)} % Suchzeit`;
    case 'punch':
      return `+${v} Schaden`;
    default:
      return '';
  }
}

/** Sekunden mit zwei Nachkommastellen und Komma ("0,15"). */
function secs(ms: number): string {
  return (ms / 1000).toFixed(2).replace('.', ',');
}

/** Kurzbeschreibung eines Artikels ohne Stufen (vor Menge und Besitz). */
function infoText(item: ShopItemId): string {
  switch (item) {
    case 'bag':
      return `+${CONFIG.carry.perUnit.bag} Plätze`;
    case 'backpack':
      return `+${CONFIG.carry.perUnit.backpack} Plätze`;
    case 'cart':
      // kurz, damit die Zeile mit Preis auch im Viertel-Splitscreen nicht umbricht
      return `mieten: +${CONFIG.carry.perUnit.cart} Plätze, −${Math.round((1 - CONFIG.carry.cartSpeedMult) * 100)} % Tempo`;
    case 'card':
      return `Abgabe alle ${secs(CONFIG.depositEveryMsCard)} s statt ${secs(CONFIG.depositEveryMs)} s`;
    case 'card_plus':
      return `+${CONFIG.shop.cardPlusBonusPct} % Pfand je Flasche`;
    default:
      return '';
  }
}

/**
 * Auswahl im Shop eines Spielers. Rein, ohne Phaser: Kategorie, Zeile, Menge und "bereit".
 * Zeilen: Einträge der Kategorie, dann "Bereit", optional "Serie beenden".
 */
export class ShopModel {
  categoryIndex = 0;
  row = 0;
  qty = 1;
  ready = false;
  private readonly canEndSeries: boolean;

  constructor(opts: { canEndSeries?: boolean } = {}) {
    this.canEndSeries = opts.canEndSeries ?? false;
  }

  get category(): ShopCategory {
    return SHOP_CATEGORIES[this.categoryIndex];
  }

  private items(): ShopItemId[] {
    return shopItemsOf(this.category);
  }

  rowCount(): number {
    return this.items().length + 1 + (this.canEndSeries ? 1 : 0);
  }

  /** Eintrag der aktuellen Zeile oder null ("Bereit", "Serie beenden"). */
  private currentItem(): ShopItemId | null {
    return this.items()[this.row] ?? null;
  }

  private rowKind(i: number): ShopRowView['kind'] {
    const n = this.items().length;
    return i < n ? 'item' : i === n ? 'ready' : 'end';
  }

  categories(): ShopCategoryView[] {
    return SHOP_CATEGORIES.map((c, i) => ({ category: c, name: SHOP_CATEGORY_NAMES[c], selected: i === this.categoryIndex }));
  }

  /** Größte wählbare Menge auf der aktuellen Zeile: freier Rest bis zur Grenze bei Stückware, sonst 1. */
  maxQty(p: Progress): number {
    const item = this.currentItem();
    if (!item || CONFIG.shop.items[item].kind !== 'stack') return 1;
    return Math.max(1, maxOf(item) - ownedOf(p, item));
  }

  private onStackRow(): boolean {
    const item = this.currentItem();
    return item !== null && CONFIG.shop.items[item].kind === 'stack';
  }

  move(dir: ShopDir, p: Progress): void {
    if (dir === 'up' || dir === 'down') {
      const n = this.rowCount();
      this.row = (this.row + (dir === 'down' ? 1 : -1) + n) % n;
      this.qty = 1;
      return;
    }
    const d = dir === 'right' ? 1 : -1;
    if (this.onStackRow()) {
      this.changeQty(d, p);
      return;
    }
    const n = SHOP_CATEGORIES.length;
    this.selectCategory((this.categoryIndex + d + n) % n);
  }

  /** Maus und Tastatur: Kategorie wählen (erste Zeile, Menge 1). Außerhalb des Bereichs wirkungslos. */
  selectCategory(i: number): void {
    if (!Number.isInteger(i) || i < 0 || i >= SHOP_CATEGORIES.length) return;
    this.categoryIndex = i;
    this.row = 0;
    this.qty = 1;
  }

  /** Maus: Zeile wählen. Außerhalb des Bereichs wirkungslos. */
  selectRow(i: number): void {
    if (!Number.isInteger(i) || i < 0 || i >= this.rowCount()) return;
    if (i !== this.row) this.qty = 1;
    this.row = i;
  }

  /** Menge ändern, begrenzt auf 1 bis maxQty. */
  changeQty(delta: number, p: Progress): void {
    if (!this.onStackRow() || !Number.isFinite(delta)) return;
    this.qty = Math.min(this.maxQty(p), Math.max(1, Math.round(this.qty + delta)));
  }

  /** Kauf der aktuellen Zeile (Knopf "Kaufen"); null, wenn die Zeile kein Eintrag ist. */
  buyAction(p: Progress): ShopAction | null {
    const item = this.currentItem();
    if (!item) return null;
    const qty = Math.min(this.qty, this.maxQty(p));
    const check = checkShopBuy(p, this.category, item, qty);
    if (!check.ok) return { kind: 'refused', reason: check.reason };
    this.qty = 1;
    return { kind: 'buy', category: this.category, item, qty };
  }

  /** "Bereit" umschalten (Knopf oder Zeile). */
  toggleReady(): ShopAction {
    this.ready = !this.ready;
    return { kind: 'ready', ready: this.ready };
  }

  /** Stand vom Server oder vom lokalen Shop übernehmen. */
  setReady(ready: boolean): void {
    this.ready = ready;
  }

  /** Aktionstaste auf der aktuellen Zeile. */
  activate(p: Progress): ShopAction | null {
    const kind = this.rowKind(this.row);
    if (kind === 'item') return this.buyAction(p);
    if (kind === 'ready') return this.toggleReady();
    return { kind: 'endSeries' };
  }

  rows(p: Progress): ShopRowView[] {
    const out: ShopRowView[] = this.items().map((item, i) => this.itemRow(p, item, i === this.row));
    const n = out.length;
    out.push({
      kind: 'ready',
      item: null,
      name: this.ready ? 'Bereit ✓ (nochmal: zurücknehmen)' : 'Bereit',
      detail: '',
      price: '',
      state: 'normal',
      selected: this.row === n,
    });
    if (this.canEndSeries) {
      out.push({ kind: 'end', item: null, name: 'Serie beenden', detail: '', price: '', state: 'normal', selected: this.row === n + 1 });
    }
    return out;
  }

  private itemRow(p: Progress, item: ShopItemId, selected: boolean): ShopRowView {
    const def = CONFIG.shop.items[item];
    const owned = ownedOf(p, item);
    const max = maxOf(item);
    const row: ShopRowView = { kind: 'item', item, name: def.name, detail: '', price: '', state: 'normal', selected };
    const info = infoText(item);
    if (def.kind === 'level') {
      if (owned >= max) return { ...row, detail: `Stufe ${max} (max)`, state: 'grey' };
      row.detail = `Stufe ${owned} → ${owned + 1}: ${effectText(item, owned + 1)}`;
    } else if (def.kind === 'once') {
      if (owned >= max) return { ...row, detail: def.perRound ? 'gemietet für die nächste Runde' : 'vorhanden', state: 'grey' };
      const missing = def.requires !== undefined && ownedOf(p, def.requires) === 0;
      row.detail = missing ? `braucht ${CONFIG.shop.items[def.requires!].name}` : info;
    } else if (def.kind === 'count') {
      // Tasche, Rucksack: je Kauf eins, ohne Mengenwahl
      row.detail = `${info}  (hast ${owned}/${max})`;
      if (owned >= max) return { ...row, state: 'grey' };
    } else {
      const qty = selected ? `◄ ${this.qty} ►  ` : '';
      row.detail = `${info ? `${info}  ` : ''}${qty}(hast ${owned})`;
    }
    const qty = selected && def.kind === 'stack' ? Math.min(this.qty, this.maxQty(p)) : 1;
    const check = checkShopBuy(p, def.category, item, qty);
    const cost = def.kind === 'level' ? def.prices[owned] : def.prices[0] * qty;
    row.price = formatMoney(cost);
    if (!check.ok) row.state = 'grey';
    return row;
  }
}
