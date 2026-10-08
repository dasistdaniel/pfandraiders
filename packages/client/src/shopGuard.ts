import { CONFIG, noUpgrades } from '@pfandraiders/core';
import type { Progress, RankEntry, UpgradeId } from '@pfandraiders/core';

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function nonNegInt(x: unknown): x is number {
  return typeof x === 'number' && Number.isInteger(x) && x >= 0;
}

/** Prüft den eigenen Shop-Stand vom Server; null = verwerfen (alter Stand bleibt). */
export function parseProgress(x: unknown): Progress | null {
  if (!isObj(x)) return null;
  const { money, containerLevel, upgrades, inventory, earnedTotal } = x;
  if (!nonNegInt(money) || !nonNegInt(earnedTotal)) return null;
  if (!nonNegInt(containerLevel) || containerLevel >= CONFIG.containers.length) return null;
  if (!isObj(upgrades) || !isObj(inventory)) return null;
  const up = noUpgrades();
  for (const id of Object.keys(up) as UpgradeId[]) {
    const v = upgrades[id];
    if (!nonNegInt(v) || v > CONFIG.shop.items[id].prices.length) return null;
    up[id] = v;
  }
  const { dog_treat, food, bolt_cutters } = inventory;
  if (!nonNegInt(dog_treat) || !nonNegInt(food) || typeof bolt_cutters !== 'boolean') return null;
  if (dog_treat > CONFIG.shop.maxStack || food > CONFIG.shop.maxStack) return null;
  return { money, containerLevel, upgrades: up, inventory: { dog_treat, food, bolt_cutters }, earnedTotal };
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
