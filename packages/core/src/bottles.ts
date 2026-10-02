import { CONFIG } from './config';
import type { BottleKind, Bottles } from './types';

export const BOTTLE_KINDS: readonly BottleKind[] = ['plastic', 'glass', 'crate'];

/** Wertvollstes zuerst, wird bei knapper Kapazität in dieser Reihenfolge umgefüllt */
const VALUE_ORDER: readonly BottleKind[] = ['crate', 'glass', 'plastic'];

export function emptyBottles(): Bottles {
  return { plastic: 0, glass: 0, crate: 0 };
}

export function totalBottles(b: Bottles): number {
  return b.plastic + b.glass + b.crate;
}

/** Wert in Cent */
export function bottlesValue(b: Bottles): number {
  return BOTTLE_KINDS.reduce((sum, kind) => sum + b[kind] * CONFIG.bottleValue[kind], 0);
}

/** Füllt `to` aus `from` bis `capacity` gesamt. Der Rest bleibt in `from`. */
export function transferBottles(from: Bottles, to: Bottles, capacity: number): void {
  let room = Math.max(capacity - totalBottles(to), 0);
  for (const kind of VALUE_ORDER) {
    const n = Math.min(from[kind], room);
    from[kind] -= n;
    to[kind] += n;
    room -= n;
  }
}
