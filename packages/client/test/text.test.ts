import { CONFIG, createGame, parseMap } from '@pfandraiders/core';
import type { GameState } from '@pfandraiders/core';
import { describe, expect, it } from 'vitest';
import type { KeyLabels } from '../src/sources';
import { formatMoney } from '../src/format';
import { alertText, hintLines, playerName, resultFooter, resultLines, resultRows, seizeText, statusLines } from '../src/text';

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
    expect(lines[0]).toContain('Zeit 5:00');
    expect(lines[0]).toContain('1,50 €');
    expect(lines[1]).toContain('Hände 3/3');
    expect(lines[1]).toContain('Pl2');
    expect(lines[1]).toContain('Gl1');
    expect(lines).toHaveLength(3);
    expect(lines[2]).toBe('Leben 100/100');
  });

});

describe('hintLines', () => {
  it('is empty away from everything', () => {
    const s = shopGame();
    expect(hintLines(s, s.players.p2, KEYS)).toEqual([]);
  });

  it('offers stealing next to a victim who carries bottles', () => {
    const s = createGame(1, parseMap(['#######', '#@@...#', '#######']), ['p1', 'p2']);
    s.players.p2.bottles = { plastic: 2, glass: 0, crate: 0 };
    expect(hintLines(s, s.players.p1, KEYS)).toContain('[Q] Klauen');
    s.players.p1.inventory.bolt_cutters = true;
    expect(hintLines(s, s.players.p1, KEYS)).toContain('[Q] Bolzenschneider einsetzen');
  });

  it('shows the steal cooldown instead of the steal key while it runs', () => {
    const s = createGame(1, parseMap(['#######', '#@@...#', '#######']), ['p1', 'p2']);
    s.players.p2.bottles = { plastic: 2, glass: 0, crate: 0 };
    s.players.p1.stealCooldownMs = 4200;
    const lines = hintLines(s, s.players.p1, KEYS);
    expect(lines).toContain('Klauen in 5 s');
    expect(lines.some((l) => l.includes('[Q]'))).toBe(false);
    s.players.p1.inventory.bolt_cutters = true;
    expect(hintLines(s, s.players.p1, KEYS)).toContain('Klauen in 5 s');
  });

  it('shows no steal cooldown without a victim nearby', () => {
    const s = createGame(1, parseMap(['#######', '#@@...#', '#######']), ['p1', 'p2']);
    s.players.p1.stealCooldownMs = 4200;
    expect(hintLines(s, s.players.p1, KEYS).some((l) => l.includes('Klauen'))).toBe(false);
  });

  it('offers stealing even while the player is searching', () => {
    const s = createGame(1, parseMap(['#######', '#@@...#', '#######']), ['p1', 'p2']);
    s.players.p1.mode = 'searching';
    s.players.p2.bottles = { plastic: 2, glass: 0, crate: 0 };
    expect(hintLines(s, s.players.p1, KEYS)).toContain('[Q] Klauen');
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

describe('dropoff and search hints', () => {
  // p1 (24,24) steht 16 px vom Pfandautomaten (40,24); der Spot (104,24) liegt außer Reichweite
  function dropoffGame(): GameState {
    return createGame(1, parseMap(['########', '#@D...b#', '########']), ['p1']);
  }

  it('offers holding the key to deposit with the value of the carried bottles', () => {
    const s = dropoffGame();
    s.players.p1.bottles = { plastic: 2, glass: 1, crate: 0 };
    const value = 2 * CONFIG.bottleValue.plastic + CONFIG.bottleValue.glass;
    expect(hintLines(s, s.players.p1, KEYS)).toContain(`[E halten] Pfand abgeben (${formatMoney(value)})`);
    expect(hintLines(s, s.players.p1, KEYS2)).toContain(`[Enter halten] Pfand abgeben (${formatMoney(value)})`);
  });

  it('says there is nothing to deposit with an empty container', () => {
    const s = dropoffGame();
    expect(hintLines(s, s.players.p1, KEYS)).toContain('Pfandautomat: nichts zum Abgeben');
  });

  it('asks for a fresh press to search', () => {
    const s = createGame(1, parseMap(['######', '#@b..#', '######']), ['p1']);
    s.spots[0].contents = { plastic: 1, glass: 0, crate: 0 };
    expect(hintLines(s, s.players.p1, KEYS)).toContain('[E drücken, halten] Suchen');
    expect(hintLines(s, s.players.p1, KEYS2)).toContain('[Enter drücken, halten] Suchen');
  });
});

describe('alertText', () => {
  it('shows the shield after a theft and is empty otherwise', () => {
    const s = shopGame();
    expect(alertText(s, s.players.p1)).toBe('');
    s.players.p1.shieldMs = 2500;
    expect(alertText(s, s.players.p1)).toBe('Schutz 3 s');
  });
});

describe('resultLines', () => {
  it('lists players by round earnings with places', () => {
    const s = shopGame();
    s.players.p1.earnedRound = 500;
    s.players.p2.earnedRound = 1230;
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
  it('uses the steal key for stealing', () => {
    const s = createGame(1, parseMap(['#######', '#@@...#', '#######']), ['p1', 'p2']);
    s.players.p2.bottles = { plastic: 2, glass: 0, crate: 0 };
    expect(hintLines(s, s.players.p1, KEYS2)).toContain('[/] Klauen');
    s.players.p1.inventory.bolt_cutters = true;
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
    s.players.p1.earnedRound = 500;
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

});

describe('more alerts', () => {
  it('shows the remaining unconscious time', () => {
    const s = shopGame();
    s.players.p1.unconsciousMs = 4200;
    expect(alertText(s, s.players.p1)).toContain('Bewusstlos! Noch 5 s');
  });

  it('warns during a police check', () => {
    const s = shopGame();
    s.npcs.push({ id: 0, kind: 'police', x: 30, y: 24, lifeMs: 5000, mood: 'active', moodMs: 0, targetId: 'p1', restId: null, restMs: 0, pauseMs: 0, wanderX: 0, wanderY: 0, wanderRef: 0, cooldownMs: 0, distractedMs: 0, checkMs: 300, pathX: 0, pathY: 0, pathMs: 0 });
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
    s.players.p1.shieldMs = 2000;
    s.npcs.push({ id: 0, kind: 'police', x: 30, y: 24, lifeMs: 5000, mood: 'active', moodMs: 0, targetId: 'p1', restId: null, restMs: 0, pauseMs: 0, wanderX: 0, wanderY: 0, wanderRef: 0, cooldownMs: 0, distractedMs: 0, checkMs: 300, pathX: 0, pathY: 0, pathMs: 0 });
    s.zones[0].phase = 'announced';
    s.zones[0].timerMs = 5000;
    s.zones[1].phase = 'active';
    s.zones[1].timerMs = 9000;
    const lines = alertText(s, s.players.p1).split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('Bewusstlos! Noch 4 s');
  });
});

function moneyGame(amounts: number[]): GameState {
  const ids = amounts.map((_, i) => `p${i + 1}`);
  const s = createGame(1, parseMap(['#########', '#@......#', '#########']), ids);
  amounts.forEach((m, i) => {
    s.players[ids[i]].earnedRound = m;
    s.players[ids[i]].earnedTotal = m * 2;
  });
  s.phase = 'ended';
  return s;
}

describe('resultRows', () => {
  it('handles a single player', () => {
    const rows = resultRows(moneyGame([300]), 'p1');
    expect(rows).toEqual([{ place: 1, id: 'p1', name: 'P1', round: 300, total: 600, isWinner: true, isViewer: true }]);
  });

  it('orders two players by round earnings', () => {
    const rows = resultRows(moneyGame([500, 1230]), 'p1');
    expect(rows.map((r) => [r.id, r.place, r.isWinner])).toEqual([
      ['p2', 1, true],
      ['p1', 2, false],
    ]);
  });

  it('handles eight players', () => {
    const rows = resultRows(moneyGame([1, 8, 3, 7, 2, 6, 4, 5]), 'p3');
    expect(rows).toHaveLength(8);
    expect(rows.map((r) => r.place)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(rows[0].id).toBe('p2');
  });

  it('shares places on a tie and skips the next one', () => {
    const rows = resultRows(moneyGame([500, 500, 100]), 'p3');
    expect(rows.map((r) => r.place)).toEqual([1, 1, 3]);
    expect(rows.map((r) => r.isWinner)).toEqual([true, true, false]);
  });

  it('gives everyone place 1 when all have zero', () => {
    const rows = resultRows(moneyGame([0, 0, 0]), 'p1');
    expect(rows.every((r) => r.place === 1 && r.isWinner)).toBe(true);
  });

  it('marks the viewer exactly once, never for an unknown id', () => {
    const s = moneyGame([5, 4, 3]);
    expect(resultRows(s, 'p2').filter((r) => r.isViewer).map((r) => r.id)).toEqual(['p2']);
    expect(resultRows(s, 'nobody').some((r) => r.isViewer)).toBe(false);
  });

  it('truncates long names to 16 characters', () => {
    const rows = resultRows(moneyGame([1]), 'p1', () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ');
    expect(rows[0].name).toBe('ABCDEFGHIJKLMNOP');
  });
});

describe('resultFooter', () => {
  it('shows restart and menu locally', () => {
    expect(resultFooter('local', KEYS)).toEqual(['Neue Runde: R oder E', 'Menü: Esc']);
  });

  it('asks everybody online to get ready for the next round', () => {
    const expected = ['Bereit für die nächste Runde: R oder E', 'Menü: Esc'];
    expect(resultFooter('host', KEYS)).toEqual(expected);
    expect(resultFooter('guest', KEYS)).toEqual(expected);
  });
});

describe('seizure notice', () => {
  it('names the number of confiscated bottles', () => {
    expect(seizeText(1)).toBe('1 Flasche beschlagnahmt!');
    expect(seizeText(5)).toBe('5 Flaschen beschlagnahmt!');
  });

  it('shows notices first in the alert, before the other warnings', () => {
    const s = shopGame();
    s.players.p1.shieldMs = 2500;
    s.players.p1.unconsciousMs = 0;
    expect(alertText(s, s.players.p1, ['3 Flaschen beschlagnahmt!'])).toBe('3 Flaschen beschlagnahmt!\nSchutz 3 s');
    expect(alertText(s, s.players.p1, [])).toBe('Schutz 3 s');
  });

  it('hides notices after the round', () => {
    const s = shopGame();
    s.phase = 'ended';
    expect(alertText(s, s.players.p1, ['3 Flaschen beschlagnahmt!'])).toBe('');
  });
});
