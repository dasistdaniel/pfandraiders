export interface RngState {
  rngState: number;
}

/** mulberry32. Verändert state.rngState, gibt Zahl in [0, 1) zurück. */
export function nextRandom(s: RngState): number {
  s.rngState = (s.rngState + 0x6d2b79f5) >>> 0;
  let t = s.rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Ganzzahl in [min, max], beide inklusive. */
export function randInt(s: RngState, min: number, max: number): number {
  return min + Math.floor(nextRandom(s) * (max - min + 1));
}
