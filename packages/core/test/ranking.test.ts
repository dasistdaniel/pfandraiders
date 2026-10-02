import { describe, expect, it } from 'vitest';
import { ranking } from '../src/ranking';
import { newGame, SEARCH_ROWS } from './helpers';

describe('ranking', () => {
  it('sorts by money descending and breaks ties by id', () => {
    const s = newGame(SEARCH_ROWS, ['p3', 'p1', 'p2']);
    s.players.p1.money = 5;
    s.players.p2.money = 9;
    s.players.p3.money = 5;
    expect(ranking(s)).toEqual([
      { id: 'p2', money: 9 },
      { id: 'p1', money: 5 },
      { id: 'p3', money: 5 },
    ]);
  });
});
