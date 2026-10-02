import { CONFIG } from './config';
import { deposit, isNear, tryBuy } from './economy';
import { updateHealth } from './health';
import { walk } from './movement';
import { updateNpcs } from './npc';
import { cancelSearch, refillSpot, updateSearch } from './search';
import { cancelSteal, updateSteal } from './theft';
import { NO_INPUT } from './types';
import type { GameState, Input, Player } from './types';
import { updateZones } from './zones';

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
  updateZones(state, dt);
  updateNpcs(state, dt);

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
  const stealPressed = input.steal && !p.stealHeld;
  p.stealHeld = input.steal;
  p.shieldMs = Math.max(0, p.shieldMs - dt);

  if (updateHealth(p, dt)) {
    // Bewusstlos: keine Eingabe wirksam (die Tastenflanken oben sind schon nachgef�hrt)
    p.mode = 'unconscious';
    return;
  }

  if (input.buy !== null) tryBuy(state, p, input.buy);

  let deposited = false;
  if (pressed && isNear(state.map.dropoffs, p)) {
    deposit(p);
    deposited = true;
  }

  if (input.moveX !== 0 || input.moveY !== 0) {
    cancelSearch(p);
    cancelSteal(p);
    walk(state.map, p, input, dt);
  } else if (input.steal && updateSteal(state, p, stealPressed, dt)) {
    cancelSearch(p);
  } else if (input.action && !deposited && updateSearch(state, p, dt)) {
    cancelSteal(p);
  } else {
    cancelSearch(p);
    cancelSteal(p);
  }

  p.mode =
    p.stealTargetId !== null ? 'stealing' : p.searchSpotId !== null ? 'searching' : 'walking';
}
