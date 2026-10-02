import { BOTTLE_KINDS, emptyBottles, totalBottles } from './bottles';
import { CONFIG } from './config';
import { randInt } from './rng';
import type { RngState } from './rng';
import type { Bottles, SpotType } from './types';

/** Würfelt den Inhalt eines Spots nach der Fundtabelle. Mindestens eine Flasche. */
export function rollContents(rng: RngState, type: SpotType, multiplier = 1): Bottles {
  const table = CONFIG.spotTypes[type];
  const out = emptyBottles();
  for (const kind of BOTTLE_KINDS) {
    const [min, max] = table[kind];
    out[kind] = randInt(rng, min, max);
  }
  if (totalBottles(out) === 0) out.plastic = 1;
  if (multiplier !== 1) {
    for (const kind of BOTTLE_KINDS) out[kind] *= multiplier;
  }
  return out;
}
