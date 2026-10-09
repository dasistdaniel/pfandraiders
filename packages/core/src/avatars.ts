/**
 * Figuren (Avatare) der Spieler. Die Kennung ist der Index 0 bis 23 in der Reihenfolge von ALL_CHARACTERS
 * im Client (m01..m12, f01..f12); die Namen der Bögen kennt nur der Client.
 */

/** Zahl der Figuren */
export const AVATAR_COUNT = 24;

/**
 * Vergabereihenfolge ohne (freien) Wunsch: die bisherigen PLAYER_CHARACTERS des Clients
 * (m02, f03, m01, f07, m05, f11, m06, f09) als Indizes, danach die übrigen aufsteigend.
 */
export const AVATAR_DEFAULT_ORDER: readonly number[] = [
  1, 14, 0, 18, 4, 22, 5, 20, 2, 3, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 17, 19, 21, 23,
];

/** Gültige Figur: ganze Zahl von 0 bis AVATAR_COUNT - 1. */
export function isAvatar(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < AVATAR_COUNT;
}

/**
 * Figur für einen neuen Spieler: der Wunsch, wenn er gültig und frei ist, sonst die erste freie Figur
 * in AVATAR_DEFAULT_ORDER. Sind alle vergeben (bei höchstens 8 Spielern unmöglich), die erste der Reihenfolge.
 */
export function pickAvatar(taken: ReadonlySet<number>, wish?: number): number {
  if (isAvatar(wish) && !taken.has(wish)) return wish;
  return AVATAR_DEFAULT_ORDER.find((a) => !taken.has(a)) ?? AVATAR_DEFAULT_ORDER[0];
}
