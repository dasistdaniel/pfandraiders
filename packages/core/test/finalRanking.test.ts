import { describe, expect, it } from 'vitest';
import { finalRanking } from '../src/ranking';
import type { RankEntry } from '../src/ranking';

const e = (id: string, total: number, round = 0, money = 0): RankEntry => ({ id, money, round, total });

describe('finalRanking', () => {
  it('sorts by total earnings, highest first', () => {
    expect(finalRanking([e('p1', 100), e('p2', 500), e('p3', 300)]).map((r) => r.id)).toEqual(['p2', 'p3', 'p1']);
  });

  it('breaks ties by id, not by round earnings or money', () => {
    expect(finalRanking([e('p3', 200, 200, 0), e('p1', 200, 0, 999)]).map((r) => r.id)).toEqual(['p1', 'p3']);
  });

  it('copies the entries and leaves the input alone', () => {
    const input = [e('p2', 1), e('p1', 2)];
    const out = finalRanking(input);
    expect(input.map((r) => r.id)).toEqual(['p2', 'p1']);
    out[0].total = 99;
    expect(input[1].total).toBe(2);
  });

  it('handles an empty list', () => {
    expect(finalRanking([])).toEqual([]);
  });
});
