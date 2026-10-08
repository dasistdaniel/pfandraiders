import { describe, expect, it } from 'vitest';
import { ranking } from '../src/ranking';
import { newGame, SEARCH_ROWS } from './helpers';

describe('ranking', () => {
  it('sorts by round earnings, then total earnings, then id', () => {
    const s = newGame(SEARCH_ROWS, ['p3', 'p1', 'p2', 'p4']);
    s.players.p1.earnedRound = 5;
    s.players.p1.earnedTotal = 50;
    s.players.p2.earnedRound = 9;
    s.players.p2.earnedTotal = 9;
    s.players.p3.earnedRound = 5;
    s.players.p3.earnedTotal = 50;
    s.players.p4.earnedRound = 5;
    s.players.p4.earnedTotal = 80;
    s.players.p4.money = 3;
    expect(ranking(s)).toEqual([
      { id: 'p2', money: 0, round: 9, total: 9 },
      { id: 'p4', money: 3, round: 5, total: 80 },
      { id: 'p1', money: 0, round: 5, total: 50 },
      { id: 'p3', money: 0, round: 5, total: 50 },
    ]);
  });

  it('is not changed by money spent earlier (money is not the key)', () => {
    const s = newGame(SEARCH_ROWS, ['p1', 'p2']);
    s.players.p1.money = 10_000;
    s.players.p2.earnedRound = 1;
    expect(ranking(s)[0].id).toBe('p2');
  });
});
