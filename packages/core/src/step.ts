import { CONFIG } from './config';
import { deposit, isNear, tryBuy } from './economy';
import { walk } from './movement';
import { cancelSearch, refillSpot, updateSearch } from './search';
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

  for (const spot of state.spots) refillSpot(state, spot, dt);

  state.timeLeftMs -= dt;
  if (state.timeLeftMs <= 0) {
    state.timeLeftMs = 0;
    state.phase = 'ended';
  }
  return state;
}

function updatePlayer(state: GameState, p: Player, input: Input, dt: number): void {
  const pressed = input.action && !p.actionHeld;
  p.actionHeld = input.action;

  if (input.buy !== null) tryBuy(state, p, input.buy);

  let deposited = false;
  if (pressed && isNear(state.map.dropoffs, p)) {
    deposit(p);
    deposited = true;
  }

  if (input.moveX !== 0 || input.moveY !== 0) {
    cancelSearch(p);
    walk(state.map, p, input, dt);
    return;
  }
  if (input.action && !deposited && updateSearch(state, p, dt)) return;
  cancelSearch(p);
}
