import { maxOf, noItems, SHOP_ITEM_IDS } from '@pfandraiders/core';
import type { Progress, RankEntry } from '@pfandraiders/core';

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function nonNegInt(x: unknown): x is number {
  return typeof x === 'number' && Number.isInteger(x) && x >= 0;
}

/**
 * Prüft den eigenen Shop-Stand vom Server; null = verwerfen (alter Stand bleibt).
 * items braucht jede bekannte Kennung als ganze Zahl von 0 bis maxOf; unbekannte Schlüssel werden nicht übernommen.
 */
export function parseProgress(x: unknown): Progress | null {
  if (!isObj(x)) return null;
  const { money, items, earnedTotal } = x;
  if (!nonNegInt(money) || !nonNegInt(earnedTotal) || !isObj(items)) return null;
  const out = noItems();
  for (const id of SHOP_ITEM_IDS) {
    const v = items[id];
    if (!nonNegInt(v) || v > maxOf(id)) return null;
    out[id] = v;
  }
  return { money, items: out, earnedTotal };
}

/** Prüft die Rangliste vom Server; null = verwerfen. */
export function parseRanking(x: unknown): RankEntry[] | null {
  if (!Array.isArray(x)) return null;
  const out: RankEntry[] = [];
  for (const e of x) {
    if (!isObj(e) || typeof e.id !== 'string') return null;
    if (!nonNegInt(e.money) || !nonNegInt(e.round) || !nonNegInt(e.total)) return null;
    out.push({ id: e.id, money: e.money, round: e.round, total: e.total });
  }
  return out;
}
