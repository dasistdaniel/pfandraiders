import type { GameState } from './types';

export interface RankEntry {
  id: string;
  money: number;
}

/** Meiste Geld zuerst, bei Gleichstand nach id. Flaschen im Container zählen nicht. */
export function ranking(state: GameState): RankEntry[] {
  return Object.values(state.players)
    .map((p) => ({ id: p.id, money: p.money }))
    .sort((a, b) => b.money - a.money || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
