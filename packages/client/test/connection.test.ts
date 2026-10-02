import { createGame, NO_INPUT, parseMap } from '@pfand/core';
import { describe, expect, it } from 'vitest';
import { LOCAL_STEP_MS, LocalConnection } from '../src/connection';

// Spawn (24,24) steht 16 px neben dem Shop (40,24)
function shopGame() {
  const state = createGame(1, parseMap(['#####', '#@S.#', '#####']), ['p1']);
  state.players.p1.money = 1000;
  return state;
}

const BUY = { ...NO_INPUT, buy: 'upgrade' as const };

describe('LocalConnection', () => {
  it('runs fixed steps from the frame delta and keeps the remainder', () => {
    const conn = new LocalConnection(shopGame(), ['p1']);
    conn.update(LOCAL_STEP_MS * 10);
    expect(conn.getState().tick).toBe(10);
    conn.update(LOCAL_STEP_MS / 2);
    expect(conn.getState().tick).toBe(10);
    conn.update(LOCAL_STEP_MS / 2);
    expect(conn.getState().tick).toBe(11);
  });

  it('applies a buy command exactly once even if several steps run in one frame', () => {
    const conn = new LocalConnection(shopGame(), ['p1']);
    conn.setInput('p1', BUY);
    conn.update(LOCAL_STEP_MS * 3);
    expect(conn.getState().players.p1.containerLevel).toBe(1);
    expect(conn.getState().players.p1.money).toBe(1000 - 150);
  });

  it('keeps a buy command until a step actually runs', () => {
    const conn = new LocalConnection(shopGame(), ['p1']);
    conn.setInput('p1', BUY);
    conn.update(LOCAL_STEP_MS / 2); // zu kurz für einen Schritt
    conn.setInput('p1', NO_INPUT); // nächster Frame meldet "nicht gedrückt"
    conn.update(LOCAL_STEP_MS / 2);
    expect(conn.getState().players.p1.containerLevel).toBe(1);
  });

  it('caps a huge frame delta instead of simulating minutes at once', () => {
    const conn = new LocalConnection(shopGame(), ['p1']);
    conn.update(60_000);
    expect(conn.getState().tick).toBeLessThanOrEqual(16);
  });
});
