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
    expect(lines).toHaveLength(3);
    expect(lines[2]).toBe('Leben 100/100');
  });

  it('shows the item name when carrying one', () => {
    const s = shopGame();
    s.players.p1.item = 'bolt_cutters';
    expect(statusLines(s, s.players.p1)[2]).toBe('Leben 100/100   Item: Bolzenschneider');
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
    expect(alertText(s, s.players.p1)).toBe('Schutz 3 s');
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

  it('uses the given name resolver for the ranking', () => {
    const s = shopGame();
    s.phase = 'ended';
    s.players.p1.money = 500;
    expect(resultLines(s, KEYS2, (id) => (id === 'p1' ? 'Anna' : 'Bob'))[1]).toMatch(/^1\. Anna /);
    expect(resultLines(s, KEYS2)[1]).toMatch(/^1\. P1 /);
  });
});

describe('health and shop', () => {
  it('shows health rounded up, also with fractions', () => {
    const s = shopGame();
    s.players.p1.health = 87.2;
    expect(statusLines(s, s.players.p1)[2]).toBe('Leben 88/100');
  });

  it('offers food and the treat at the shop with the device keys', () => {
    const s = shopGame();
    const lines = hintLines(s, s.players.p1, KEYS);
    expect(lines).toContain('[4] Essen +30 Leben 1,00 €');
    expect(lines).toContain('[3] Leckerli 1,00 €');
    expect(hintLines(s, s.players.p1, KEYS2)).toContain(`[${KEYS2.food}] Essen +30 Leben 1,00 €`);
  });

  it('hides the treat offer when the item slot is taken but still offers food', () => {
    const s = shopGame();
    s.players.p1.item = 'bolt_cutters';
    const lines = hintLines(s, s.players.p1, KEYS);
    expect(lines).toContain('Item-Slot belegt');
    expect(lines.some((l) => l.startsWith('[3]'))).toBe(false);
    expect(lines.some((l) => l.startsWith('[4]'))).toBe(true);
  });
});

describe('more alerts', () => {
  it('shows the remaining unconscious time', () => {
    const s = shopGame();
    s.players.p1.unconsciousMs = 4200;
    expect(alertText(s, s.players.p1)).toContain('Bewusstlos! Noch 5 s');
  });

  it('warns during a police check', () => {
    const s = shopGame();
    s.npcs.push({ id: 0, kind: 'police', x: 30, y: 24, lifeMs: 5000, targetId: 'p1', cooldownMs: 0, distractedMs: 0, checkMs: 300 });
    expect(alertText(s, s.players.p1)).toContain('KONTROLLE! Lauf weg!');
  });

  it('announces zones and shows the active bonus time', () => {
    const s = createGame(1, parseMap(['#####', '#@..#', '#####'], [
      { id: 'a', name: 'Stadion', area: { x0: 0, y0: 0, x1: 10, y1: 10 } },
      { id: 'b', name: 'Konzert', area: { x0: 0, y0: 0, x1: 10, y1: 10 } },
    ]), ['p1']);
    s.zones[0].phase = 'announced';
    s.zones[0].timerMs = 14500;
    s.zones[1].phase = 'active';
    s.zones[1].timerMs = 31000;
    const text = alertText(s, s.players.p1);
    expect(text).toContain('Stadion in 15 s!');
    expect(text).toContain('Konzert: mehr Pfand! Noch 31 s');
  });

  it('puts personal alerts before zone lines', () => {
    const s = createGame(1, parseMap(['#####', '#@..#', '#####'], [
      { id: 'a', name: 'Stadion', area: { x0: 0, y0: 0, x1: 10, y1: 10 } },
    ]), ['p1']);
    s.zones[0].phase = 'announced';
    s.zones[0].timerMs = 5000;
    s.players.p1.shieldMs = 2000;
    const lines = alertText(s, s.players.p1).split('\n');
    expect(lines[0]).toBe('Schutz 2 s');
    expect(lines[1]).toBe('Stadion in 5 s!');
  });
});

describe('final review fixes', () => {
  const ZONES = [
    { id: 'a', name: 'Stadion', area: { x0: 0, y0: 0, x1: 10, y1: 10 } },
    { id: 'b', name: 'Konzert', area: { x0: 0, y0: 0, x1: 10, y1: 10 } },
  ];

  it('shows no alerts after the round has ended', () => {
    const s = createGame(1, parseMap(['#####', '#@..#', '#####'], ZONES), ['p1']);
    s.zones[0].phase = 'active';
    s.zones[0].timerMs = 23000;
    s.players.p1.unconsciousMs = 7000;
    s.players.p1.shieldMs = 2000;
    s.phase = 'ended';
    expect(alertText(s, s.players.p1)).toBe('');
  });

  it('gives no hints to an unconscious player', () => {
    const s = shopGame();
    s.players.p1.unconsciousMs = 3000;
    expect(hintLines(s, s.players.p1, KEYS)).toEqual([]);
  });

  it('shows at most three alert lines, personal ones first', () => {
    const s = createGame(1, parseMap(['#####', '#@..#', '#####'], ZONES), ['p1', 'p2']);
    s.players.p1.unconsciousMs = 4000;
    s.players.p2.stealTargetId = 'p1';
    s.players.p2.stealProgressMs = 40;
    s.npcs.push({ id: 0, kind: 'police', x: 30, y: 24, lifeMs: 5000, targetId: 'p1', cooldownMs: 0, distractedMs: 0, checkMs: 300 });
    s.zones[0].phase = 'announced';
    s.zones[0].timerMs = 5000;
    s.zones[1].phase = 'active';
    s.zones[1].timerMs = 9000;
    const lines = alertText(s, s.players.p1).split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('Bewusstlos! Noch 4 s');
  });
});
