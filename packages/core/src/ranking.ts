import type { GameState } from './types';

export interface RankEntry {
  id: string;
  /** Geld jetzt (Cent) */
  money: number;
  /** Rundenverdienst (Cent) */
  round: number;
  /** Gesamtverdienst der Serie (Cent) */
  total: number;
}

/**
 * Höchster Rundenverdienst zuerst, bei Gleichstand höherer Gesamtverdienst, dann nach id.
 * Flaschen im Container zählen nicht; ausgegebenes Geld mindert keinen Verdienst.
 */
export function ranking(state: GameState): RankEntry[] {
  return Object.values(state.players)
    .map((p) => ({ id: p.id, money: p.money, round: p.earnedRound, total: p.earnedTotal }))
    .sort((a, b) => b.round - a.round || b.total - a.total || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Endwertung der Serie: höchster Gesamtverdienst zuerst, bei Gleichstand nach id (deterministisch).
 * Liefert Kopien; die Eingabe bleibt unverändert.
 */
export function finalRanking(entries: readonly RankEntry[]): RankEntry[] {
  return entries
    .map((r) => ({ ...r }))
    .sort((a, b) => b.total - a.total || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
