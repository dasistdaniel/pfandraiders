import { CONFIG } from './config';
import { walk } from './movement';
import { NO_INPUT } from './types';
import type { GameState, Input, Player } from './types';

/**
 * Ein Simulationsschritt. Verändert `state` direkt und gibt ihn zurück.
 * Spieler ohne Eintrag in `inputs` bekommen NO_INPUT.
 */
export function step(
  state: GameState,
  inputs: Record<string, Input>,
  dtMs: number,
): GameState {
  if (state.phase === 'ended') return state;
  const dt = Math.min(Math.max(dtMs, 0), CONFIG.maxStepMs);
  state.tick++;

  for (const id of Object.keys(state.players)) {
    updatePlayer(state, state.players[id], inputs[id] ?? NO_INPUT, dt);
  }

  state.timeLeftMs -= dt;
  if (state.timeLeftMs <= 0) {
    state.timeLeftMs = 0;
    state.phase = 'ended';
  }
  return state;
}

function updatePlayer(state: GameState, p: Player, input: Input, dt: number): void {
  if (input.moveX !== 0 || input.moveY !== 0) walk(state.map, p, input, dt);
}
