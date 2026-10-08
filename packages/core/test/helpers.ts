import { createGame } from '../src/game';
import { parseMap } from '../src/map';
import { step } from '../src/step';
import { NO_INPUT } from '../src/types';
import type { Bottles, GameState, Input, Point } from '../src/types';

/** Karte mit Rand aus Wänden, Spawn bei Kachel (1,1). */
export function openRows(cols: number, rows: number): string[] {
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => {
      if (r === 0 || c === 0 || r === rows - 1 || c === cols - 1) return '#';
      return r === 1 && c === 1 ? '@' : '.';
    }).join(''),
  );
}

/** Spawn (24,24), Spot bei x=40, Pfandautomat bei x=72 */
export const SEARCH_ROWS = ['########', '#@b.D..#', '########'];

/** Spot (x=40) und Pfandautomat (x=56) liegen dicht beieinander: bei x=48 sind beide in Reichweite */
export const DEPOSIT_ROWS = ['########', '#@bD...#', '########'];

/** Zwei Spieler (x=24 und x=56) mit einem Spot dazwischen (x=40) */
export const TWO_PLAYER_ROWS = ['#########', '#@b@.D..#', '#########'];

/** p1 (x=24) steht 16 px neben p2 (x=40). Der Spot (x=56) liegt nur bei p2 in Reichweite. */
export const THIEF_ROWS = ['#########', '#@@b.D..#', '#########'];

export function newGame(rows: string[], ids: string[] = ['p1']): GameState {
  return createGame(1, parseMap(rows), ids);
}

export function input(partial: Partial<Input>): Input {
  return { ...NO_INPUT, ...partial };
}

/** n Schritte à stepMs mit denselben Eingaben */
export function runSteps(
  state: GameState,
  inputs: Record<string, Input>,
  n: number,
  stepMs = 20,
): void {
  for (let i = 0; i < n; i++) step(state, inputs, stepMs);
}

/** Läuft mindestens `ms` Millisekunden in 20-ms-Schritten */
export function runFor(state: GameState, inputs: Record<string, Input>, ms: number): void {
  runSteps(state, inputs, Math.ceil(ms / 20), 20);
}

export function teleport(state: GameState, id: string, to: Point): void {
  state.players[id].x = to.x;
  state.players[id].y = to.y;
}

/** Setzt Inhalt eines Spots fest und schaltet den Nachfüll-Timer ab */
export function setSpot(state: GameState, spotId: number, contents: Partial<Bottles>): void {
  state.spots[spotId].contents = { plastic: 0, glass: 0, crate: 0, ...contents };
  state.spots[spotId].refillInMs = 0;
}
