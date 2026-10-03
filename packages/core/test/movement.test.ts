import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { boxBlocked } from '../src/map';
import { step } from '../src/step';
import { input, newGame, openRows, runSteps } from './helpers';

describe('movement', () => {
  it('walks at the configured speed', () => {
    const s = newGame(openRows(20, 5));
    runSteps(s, { p1: input({ moveX: 1 }) }, 50, 20); // 1000 ms
    expect(s.players.p1.x).toBeCloseTo(24 + CONFIG.playerSpeed, 5);
    expect(s.players.p1.y).toBe(24);
  });

  it('does not walk faster diagonally', () => {
    const s = newGame(openRows(20, 10));
    runSteps(s, { p1: input({ moveX: 1, moveY: 1 }) }, 50, 20);
    const dx = s.players.p1.x - 24;
    const dy = s.players.p1.y - 24;
    expect(Math.hypot(dx, dy)).toBeCloseTo(CONFIG.playerSpeed, 5);
  });

  it('stops at walls', () => {
    const s = newGame(['#####', '#@.##', '#####']);
    runSteps(s, { p1: input({ moveX: 1 }) }, 100, 20);
    const maxX = 48 - CONFIG.playerHalf; // linke Kante der Wandkachel minus halbe Boxbreite
    expect(s.players.p1.x).toBeLessThanOrEqual(maxX);
    expect(s.players.p1.x).toBeGreaterThan(maxX - 3);
    expect(s.players.p1.y).toBe(24);
  });

  it('slides along a wall when moving diagonally into it', () => {
    const s = newGame(openRows(10, 5));
    runSteps(s, { p1: input({ moveX: -1, moveY: 1 }) }, 30, 20);
    expect(s.players.p1.x).toBeGreaterThanOrEqual(16 + CONFIG.playerHalf);
    expect(s.players.p1.y).toBeGreaterThan(24);
  });

  it('is slower with the shopping cart', () => {
    const s = newGame(openRows(20, 5));
    s.players.p1.containerLevel = 3;
    runSteps(s, { p1: input({ moveX: 1 }) }, 50, 20);
    expect(s.players.p1.x - 24).toBeCloseTo(CONFIG.playerSpeed * CONFIG.containers[3].speedMult, 5);
  });

  it('clamps a huge time step so the player cannot jump through walls', () => {
    const s = newGame(openRows(40, 5));
    step(s, { p1: input({ moveX: 1 }) }, 10000);
    expect(s.players.p1.x - 24).toBeCloseTo((CONFIG.playerSpeed * CONFIG.maxStepMs) / 1000, 5);
    expect(s.timeLeftMs).toBe(CONFIG.roundMs - CONFIG.maxStepMs);
  });

  it('ignores a player that has no input this tick', () => {
    const s = newGame(openRows(20, 5), ['p1', 'p2']);
    runSteps(s, { p1: input({ moveX: 1 }) }, 10, 20);
    expect(s.players.p2.x).toBe(24);
  });
});

describe('corner sliding', () => {
  const T = 16;
  const HALF = CONFIG.playerHalf;
  /** 16 x 9 Karte mit Randwand und Wandkacheln an den angegebenen (Zeile, Spalte)-Paaren */
  function world(...walls: [number, number][]): string[] {
    const rows = openRows(16, 9);
    for (const [r, c] of walls) rows[r] = rows[r].slice(0, c) + '#' + rows[r].slice(c + 1);
    return rows;
  }
  /**
   * Spieler fährt nach rechts auf eine Wandkachel in Spalte 6 zu. Die Box ragt so weit in die
   * Wandzeile, dass der kleinste Versatz um die Ecke genau k px beträgt.
   */
  function runPast(k: number, wallBelow: boolean) {
    const s = newGame(world(wallBelow ? [4, 6] : [3, 6]));
    s.players.p1.x = 40;
    s.players.p1.y = wallBelow ? 4 * T - HALF + k - 0.5 : 4 * T + HALF - k + 0.5;
    runSteps(s, { p1: input({ moveX: 1 }) }, 100, 20);
    return s;
  }

  for (const wallBelow of [true, false]) {
    const side = wallBelow ? 'below' : 'above';
    it(`slides around a corner that overlaps by 3 px (wall ${side})`, () => {
      expect(runPast(3, wallBelow).players.p1.x).toBeGreaterThan(160);
    });
    it(`slides around a corner that overlaps by 6 px (wall ${side})`, () => {
      expect(runPast(6, wallBelow).players.p1.x).toBeGreaterThan(160);
    });
    it(`does not slide around a corner that overlaps by 7 px (wall ${side})`, () => {
      const p = runPast(7, wallBelow).players.p1;
      expect(p.x).toBeLessThanOrEqual(6 * T - HALF);
      expect(p.y).toBe(wallBelow ? 4 * T - HALF + 7 - 0.5 : 4 * T + HALF - 7 + 0.5);
    });
  }

  it('never ends up inside a wall while sliding', () => {
    for (const k of [1, 3, 6, 7]) {
      const s = newGame(world([4, 6], [4, 7]));
      s.players.p1.x = 40;
      s.players.p1.y = 4 * T - HALF + k - 0.5;
      for (let i = 0; i < 100; i++) {
        runSteps(s, { p1: input({ moveX: 1, moveY: i % 3 === 0 ? 1 : 0 }) }, 1, 20);
        expect(boxBlocked(s.map, s.players.p1.x, s.players.p1.y, HALF), `k=${k} tick ${i}`).toBe(false);
      }
    }
  });

  it('moves at most one step sideways per tick and not forward while nudging', () => {
    const s = newGame(world([4, 6]));
    s.players.p1.x = 6 * T - HALF - 0.5;
    s.players.p1.y = 4 * T - HALF + 6 - 0.5;
    const x0 = s.players.p1.x;
    const y0 = s.players.p1.y;
    runSteps(s, { p1: input({ moveX: 1 }) }, 1, 20);
    expect(s.players.p1.x).toBe(x0);
    expect(y0 - s.players.p1.y).toBeCloseTo((CONFIG.playerSpeed * 20) / 1000, 9);
  });

  it('slides vertically around a corner too', () => {
    const s = newGame(world([4, 6], [3, 6], [2, 6]));
    s.players.p1.x = 6 * T - HALF + 4 - 0.5; // Box ragt 4 px in Spalte 6
    s.players.p1.y = 7 * T;
    runSteps(s, { p1: input({ moveY: -1 }) }, 60, 20);
    expect(s.players.p1.y).toBeLessThan(40);
  });

  it('slides around a corner with diagonal input when both axes are blocked', () => {
    const s = newGame(world([4, 6]));
    s.players.p1.x = 6 * T - HALF - 1; // rechte Kante knapp links der Wand
    s.players.p1.y = 4 * T - HALF - 2;  // Unterkante 2 px über der Wand: nur Ecke im Weg
    runSteps(s, { p1: input({ moveX: 1, moveY: 1 }) }, 5, 20);
    expect(boxBlocked(s.map, s.players.p1.x, s.players.p1.y, HALF)).toBe(false);
  });

  it('keeps a one-tile corridor passable', () => {
    const s = newGame(['##########', '#@.......#', '##########']);
    runSteps(s, { p1: input({ moveX: 1 }) }, 100, 20);
    expect(s.players.p1.x).toBeGreaterThan(110);
    expect(s.players.p1.y).toBe(24);
  });

  it('does not slide into walls or through a gap narrower than the box', () => {
    // 1-Kachel-Gang: seitlich nur Wand, in Gehrichtung eine Wand davor
    const s = newGame(['#####', '#@..#', '#####']);
    runSteps(s, { p1: input({ moveY: 1 }) }, 50, 20);
    const y = s.players.p1.y; // an der unteren Wand
    expect(y).toBeLessThan(32 - HALF);
    runSteps(s, { p1: input({ moveX: 1 }) }, 100, 20);
    expect(s.players.p1.y).toBe(y);
    expect(boxBlocked(s.map, s.players.p1.x, s.players.p1.y, HALF)).toBe(false);
    // Engstelle: zwei weiche Kerne lassen genau 10 px, der Spieler darf nur mittig durch
    const w = newGame(world());
    w.map.soft = new Array<boolean>(w.map.cols * w.map.rows).fill(false);
    w.map.soft[3 * 16 + 6] = true; // Mitte y = 56
    w.map.soft[5 * 16 + 6] = true; // Mitte y = 88, Lücke 59..85 = 26 px
    w.players.p1.x = 40;
    w.players.p1.y = 72;
    runSteps(w, { p1: input({ moveX: 1 }) }, 100, 20);
    expect(w.players.p1.x).toBeGreaterThan(160);
  });

  it('slides past a tree core (soft tile)', () => {
    const s = newGame(world());
    s.map.soft = new Array<boolean>(s.map.cols * s.map.rows).fill(false);
    s.map.soft[4 * s.map.cols + 6] = true; // Mitte (104, 72)
    s.players.p1.x = 40;
    s.players.p1.y = 72 + 2;
    runSteps(s, { p1: input({ moveX: 1 }) }, 100, 20);
    expect(s.players.p1.x).toBeGreaterThan(160);
  });
});
