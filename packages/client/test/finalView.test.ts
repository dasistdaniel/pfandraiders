import type { RankEntry, RosterEntry } from '@pfandraiders/core';
import { describe, expect, it } from 'vitest';
import { finalFooter, finalRows, sceneForPhase, winnerText } from '../src/finalView';

const e = (id: string, total: number): RankEntry => ({ id, money: 0, round: 0, total });
const r = (id: string, name: string, avatar: number, color = 0x123456): RosterEntry => ({ id, name, color, connected: true, ready: false, avatar });

describe('finalRows', () => {
  it('sorts by total, shares places on ties and marks winners and the viewer', () => {
    const rows = finalRows([e('p3', 100), e('p1', 500), e('p2', 500)], [r('p1', 'Anna', 1), r('p2', 'Bob', 14), r('p3', 'Cara', 0)], 'p3');
    expect(rows.map((x) => [x.place, x.name, x.total, x.isWinner, x.isViewer])).toEqual([
      [1, 'Anna', 500, true, false],
      [1, 'Bob', 500, true, false],
      [3, 'Cara', 100, false, true],
    ]);
    expect(rows[0]).toMatchObject({ avatar: 1, color: 0x123456, left: false });
  });

  it('shows players who left as "(gegangen)" in grey without a figure', () => {
    const [row] = finalRows([e('p9', 50)], [], 'p1');
    expect(row).toMatchObject({ name: '(gegangen)', avatar: null, color: 0x888888, left: true });
  });
});

describe('winnerText', () => {
  it('names one, two or more overall winners', () => {
    const roster = [r('p1', 'Anna', 1), r('p2', 'Bob', 2), r('p3', 'Cara', 3)];
    expect(winnerText(finalRows([e('p1', 9), e('p2', 1)], roster, 'p1'))).toBe('Gesamtsieger: Anna');
    expect(winnerText(finalRows([e('p1', 9), e('p2', 9)], roster, 'p1'))).toBe('Gesamtsieger: Anna und Bob');
    expect(winnerText(finalRows([e('p1', 9), e('p2', 9), e('p3', 9)], roster, 'p1'))).toBe('Gesamtsieger: Anna, Bob und Cara');
    expect(winnerText([])).toBe('Keine Wertung');
  });
});

describe('finalFooter', () => {
  it('gives the host the way back and lets the others wait', () => {
    expect(finalFooter(true, 'E')).toEqual(['Zur Lobby: E oder Klick', 'Raum verlassen: Esc']);
    expect(finalFooter(false, 'E')).toEqual(['Warte auf den Host…', 'Raum verlassen: Esc']);
  });
});

describe('sceneForPhase', () => {
  it('picks the scene after the online dialog', () => {
    expect(sceneForPhase('final', false)).toBe('final');
    expect(sceneForPhase('shop', true)).toBe('shop');
    expect(sceneForPhase('shop', false)).toBe('game');
    expect(sceneForPhase('playing', false)).toBe('game');
  });
});
