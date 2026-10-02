import { emptyBottles } from './bottles';
import { CONFIG } from './config';
import { rollContents } from './loot';
import { nextRandom, randInt } from './rng';
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
  if (new Set(playerIds).size !== playerIds.length) throw new Error('duplicate player id');
  const state: GameState = {
    tick: 0,
    timeLeftMs: options.roundMs ?? CONFIG.roundMs,
    phase: 'running',
    rngState: seed >>> 0,
    map,
    players: {},
    spots: [],
    npcs: [],
    nextNpcId: 0,
    nextNpcMs: CONFIG.npc.firstSpawnMs,
    zones: [],
  };
  playerIds.forEach((id, i) => {
    state.players[id] = newPlayer(id, map.spawns[i % map.spawns.length]);
  });
  for (const def of map.spots) state.spots.push(newSpot(state, def));
  state.zones = map.zones.map((def) => ({
    def,
    phase: 'idle' as const,
    timerMs: randInt(state, ...CONFIG.zone.firstIdleMs),
  }));
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
    stealHeld: false,
    item: null,
    stealTargetId: null,
    stealProgressMs: 0,
    shieldMs: 0,
    health: CONFIG.health.max,
    unconsciousMs: 0,
    spawn: { x: at.x, y: at.y },
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
