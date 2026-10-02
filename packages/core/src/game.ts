import { emptyBottles } from './bottles';
import { CONFIG } from './config';
import { rollContents } from './loot';
import { nextRandom } from './rng';
import type { GameState, MapData, Player, Point, Spot, SpotDef } from './types';

export interface GameOptions {
  roundMs?: number;
}

export function createGame(
  seed: number,
  map: MapData,
  playerIds: string[],
  options: GameOptions = {},
): GameState {
  if (map.spawns.length === 0) throw new Error('map has no spawn point');
  const state: GameState = {
    tick: 0,
    timeLeftMs: options.roundMs ?? CONFIG.roundMs,
    phase: 'running',
    rngState: seed >>> 0,
    map,
    players: {},
    spots: [],
  };
  playerIds.forEach((id, i) => {
    state.players[id] = newPlayer(id, map.spawns[i % map.spawns.length]);
  });
  for (const def of map.spots) state.spots.push(newSpot(state, def));
  return state;
}

function newPlayer(id: string, at: Point): Player {
  return {
    id,
    x: at.x,
    y: at.y,
    money: 0,
    bottles: emptyBottles(),
    containerLevel: 0,
    mode: 'walking',
    searchSpotId: null,
    searchProgressMs: 0,
    actionHeld: false,
  };
}

function newSpot(state: GameState, def: SpotDef): Spot {
  const spot: Spot = { ...def, contents: emptyBottles(), refillInMs: 0 };
  if (nextRandom(state) < CONFIG.spotActiveChance) {
    spot.contents = rollContents(state, def.type);
  } else {
    spot.refillInMs = Math.floor(nextRandom(state) * CONFIG.refillMs);
  }
  return spot;
}
