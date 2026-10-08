import { createGame, NO_INPUT, parseMap } from '@pfandraiders/core';
import { describe, expect, it } from 'vitest';
import { LOCAL_STEP_MS, LocalConnection } from '../src/connection';

// Ein Spieler auf einem kurzen Gang
function soloGame() {
  const state = createGame(1, parseMap(['#####', '#@..#', '#####']), ['p1'], { countdownMs: 0 });
  state.players.p1.money = 1000;
  return state;
}

describe('LocalConnection', () => {
  it('runs fixed steps from the frame delta and keeps the remainder', () => {
    const conn = new LocalConnection(soloGame(), ['p1']);
    conn.update(LOCAL_STEP_MS * 10);
    expect(conn.getState().tick).toBe(10);
    conn.update(LOCAL_STEP_MS / 2);
    expect(conn.getState().tick).toBe(10);
    conn.update(LOCAL_STEP_MS / 2);
    expect(conn.getState().tick).toBe(11);
  });

  it('caps a huge frame delta instead of simulating minutes at once', () => {
    const conn = new LocalConnection(soloGame(), ['p1']);
    conn.update(60_000);
    expect(conn.getState().tick).toBeLessThanOrEqual(16);
  });

  it('passes the eat key to the step', () => {
    const state = soloGame();
    state.players.p1.health = 50;
    state.players.p1.inventory.food = 1;
    const conn = new LocalConnection(state, ['p1']);
    conn.setInput('p1', { ...NO_INPUT, eat: true });
    conn.update(LOCAL_STEP_MS);
    expect(conn.getState().players.p1.inventory.food).toBe(0);
  });
});
