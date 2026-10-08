import { CONFIG } from './config';
import { updateDeposit } from './economy';
import { tryAttack } from './fight';
import { eatFood, updateHealth } from './health';
import { walk } from './movement';
import { updateNpcs } from './npc';
import { cancelSearch, refillSpot, updateSearch } from './search';
import { tryLoot } from './theft';
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
  const dt = Number.isFinite(dtMs) ? Math.min(Math.max(dtMs, 0), CONFIG.maxStepMs) : 0;
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
  const eatPressed = input.eat && !p.eatHeld;
  p.eatHeld = input.eat;
  const attackPressed = input.attack && !p.attackHeld;
  p.attackHeld = input.attack;
  p.shieldMs = Math.max(0, p.shieldMs - dt);
  p.attackCooldownMs = Math.max(0, p.attackCooldownMs - dt);

  if (updateHealth(p, dt)) {
    // Bewusstlos: keine Eingabe wirksam (die Tastenflanken oben sind schon nachgeführt)
    p.mode = 'unconscious';
    p.depositMs = 0;
    return;
  }

  if (eatPressed) eatFood(p);
  // Schlagen geht auch im Laufen; die eigene Suche bricht ab
  if (attackPressed && tryAttack(state, p)) cancelSearch(p);

  // Abgabe hat Vorrang: wer mit Flaschen am Automaten drückt, beginnt im selben Tick keine Suche
  const depositing = updateDeposit(state, p, input, dt, pressed);

  if (input.moveX !== 0 || input.moveY !== 0) {
    cancelSearch(p);
    walk(state.map, p, input, dt);
  } else if (stealPressed && tryLoot(state, p)) {
    cancelSearch(p);
  } else if (input.action && !depositing && updateSearch(state, p, dt, pressed)) {
    // sucht: eine neue Suche beginnt nur beim Drücken, eine laufende geht beim Halten weiter
  } else {
    cancelSearch(p);
  }

  p.mode = p.searchSpotId !== null ? 'searching' : 'walking';
}
