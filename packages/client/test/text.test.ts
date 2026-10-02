import { CONFIG, createGame, parseMap } from '@pfandraiders/core';
import type { GameState } from '@pfandraiders/core';
import { describe, expect, it } from 'vitest';
import type { KeyLabels } from '../src/sources';
import { alertText, hintLines, playerName, resultLines, statusLines } from '../src/text';

const KEYS: KeyLabels = { action: 'E', upgrade: '1', item: '2', steal: 'Q', treat: '3', food: '4' };
const KEYS2: KeyLabels = { action: 'Enter', upgrade: ',', item: '.', steal: '/', treat: ';', food: "'" };

// p1 (24,24) steht 16 px vom Shop (40,24). p2 liegt weit weg am Ende des Ganges.
function shopGame(): GameState {
  return createGame(1, parseMap(['#########', '#@S....@#', '#########']), ['p1', 'p2']);
}

describe('playerName', () => {
  it('upper-cases the id', () => {
    expect(playerName('p1')).toBe('P1');
  });
});

describe('statusLines', () => {
  it('shows time, money, container and bottles', () => {
    const s = shopGame();
    s.players.p1.money = 150;
    s.players.p1.bottles = { plastic: 2, glass: 1, crate: 0 };
    const lines = statusLines(s, s.players.p1);
    expect(lines[0]).toContain('10:00');
    expect(lines[0]).toContain('1,50 €');
    expect(lines[1]).toContain('Hände 3/3');
    expect(lines[1]).toContain('Pl2');
    expect(lines[1]).toContain('Gl1');
    expect(lines).toHaveLength(2);
  });

  it('shows the item name when carrying one', () => {
    const s = shopGame();
    s.players.p1.item = 'bolt_cutters';
    expect(statusLines(s, s.players.p1)[2]).toBe('Item: Bolzenschneider');
  });
});

describe('hintLines', () => {
  it('offers upgrade and item at the shop', () => {
    const s = shopGame();
    const lines = hintLines(s, s.players.p1, KEYS);
    expect(lines.some((l) => l.startsWith('[1] Tasche'))).toBe(true);
    expect(lines.some((l) => l.startsWith('[2] Bolzenschneider'))).toBe(true);
  });

  it('says the item slot is taken instead of offering a second item', () => {
    const s = shopGame();
    s.players.p1.item = 'bolt_cutters';
    const lines = hintLines(s, s.players.p1, KEYS);
    expect(lines).toContain('Item-Slot belegt');
    expect(lines.some((l) => l.startsWith('[2]'))).toBe(false);
  });

  it('says fully upgraded at the last level', () => {
    const s = shopGame();
    s.players.p1.containerLevel = CONFIG.containers.length - 1;
    expect(hintLines(s, s.players.p1, KEYS)).toContain('Voll ausgebaut');
  });

  it('is empty away from everything', () => {
    const s = shopGame();
    expect(hintLines(s, s.players.p2, KEYS)).toEqual([]);
  });

  it('offers stealing next to a victim who carries bottles', () => {
    const s = createGame(1, parseMap(['#######', '#@@...#', '#######']), ['p1', 'p2']);
    s.players.p2.bottles = { plastic: 2, glass: 0, crate: 0 };
    expect(hintLines(s, s.players.p1, KEYS)).toContain('[Q halten] Klauen');
    s.players.p1.item = 'bolt_cutters';
    expect(hintLines(s, s.players.p1, KEYS)).toContain('[Q] Bolzenschneider einsetzen');
  });

  it('offers stealing even while the player is searching', () => {
    const s = createGame(1, parseMap(['#######', '#@@...#', '#######']), ['p1', 'p2']);
    s.players.p1.mode = 'searching';
    s.players.p2.bottles = { plastic: 2, glass: 0, crate: 0 };
    expect(hintLines(s, s.players.p1, KEYS)).toContain('[Q halten] Klauen');
  });

  it('does not offer stealing with a full container', () => {
    const s = createGame(1, parseMap(['#######', '#@@...#', '#######']), ['p1', 'p2']);
    s.players.p2.mode = 'searching';
    s.players.p2.bottles = { plastic: 2, glass: 0, crate: 0 };
    s.players.p1.bottles = { plastic: 3, glass: 0, crate: 0 };
    expect(hintLines(s, s.players.p1, KEYS).some((l) => l.includes('Klauen'))).toBe(false);
  });

  it('is empty after the round has ended', () => {
    const s = shopGame();
    s.phase = 'ended';
    expect(hintLines(s, s.players.p1, KEYS)).toEqual([]);
  });
});

describe('alertText', () => {
  it('warns while a theft against the player is in progress', () => {
    const s = shopGame();
    s.players.p2.stealTargetId = 'p1';
    s.players.p2.stealProgressMs = 40;
    expect(alertText(s, s.players.p1)).toBe('! DU WIRST BESTOHLEN !');
  });

  it('shows the shield after a theft and is empty otherwise', () => {
    const s = shopGame();
    expect(alertText(s, s.players.p1)).toBe('');
    s.players.p1.shieldMs = 2500;
    expect(alertText(s, s.players.p1)).toBe('Bestohlen! Schutz 3 s');
  });
});

describe('resultLines', () => {
  it('lists players by money with places', () => {
    const s = shopGame();
    s.players.p1.money = 500;
    s.players.p2.money = 1230;
    s.phase = 'ended';
    expect(resultLines(s, KEYS)).toEqual([
      'Runde vorbei!',
      '1. P2  12,30 €',
      '2. P1  5,00 €',
      '',
      'Neue Runde: R oder E',
    ]);
  });
});

describe('labels for other devices', () => {
  it('uses the given keys in shop hints', () => {
    const s = shopGame();
    const lines = hintLines(s, s.players.p1, KEYS2);
    expect(lines.some((l) => l.startsWith('[,] Tasche'))).toBe(true);
    expect(lines.some((l) => l.startsWith('[.] Bolzenschneider'))).toBe(true);
    expect(lines.some((l) => l.startsWith('[1]') || l.startsWith('[2]'))).toBe(false);
  });

  it('uses the steal key for stealing', () => {
    const s = createGame(1, parseMap(['#######', '#@@...#', '#######']), ['p1', 'p2']);
    s.players.p2.bottles = { plastic: 2, glass: 0, crate: 0 };
    expect(hintLines(s, s.players.p1, KEYS2)).toContain('[/ halten] Klauen');
    s.players.p1.item = 'bolt_cutters';
    expect(hintLines(s, s.players.p1, KEYS2)).toContain('[/] Bolzenschneider einsetzen');
  });

  it('names the action key in the last results line', () => {
    const s = shopGame();
    s.phase = 'ended';
    expect(resultLines(s, KEYS2).at(-1)).toBe('Neue Runde: R oder Enter');
  });
});
