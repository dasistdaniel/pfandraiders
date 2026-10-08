import { emptyBottles } from './bottles';
import { CONFIG } from './config';
import { rollContents } from './loot';
import { nextRandom, randInt } from './rng';
import { freshProgress, progressOf } from './shop';
import type { Progress } from './shop';
import type { GameState, MapData, Player, Point, Spot, SpotDef } from './types';

export interface GameOptions {
  roundMs?: number;
  /** Fortschritt aus früheren Runden der Serie je Spieler-id; fehlt ein Spieler, beginnt er leer. */
  progress?: Record<string, Progress>;
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
  const progress = options.progress ?? {};
  playerIds.forEach((id, i) => {
    const own = Object.hasOwn(progress, id) ? progress[id] : freshProgress();
    state.players[id] = newPlayer(id, map.spawns[i % map.spawns.length], own);
  });
  for (const def of map.spots) state.spots.push(newSpot(state, def));
  state.zones = map.zones.map((def) => ({
    def,
    phase: 'idle' as const,
    timerMs: randInt(state, ...CONFIG.zone.firstIdleMs),
  }));
  return state;
}

function newPlayer(id: string, at: Point, prog: Progress): Player {
  // Kopie: die Runde verändert Geld und Inventar, der Aufrufer behält seinen Stand
  const own = progressOf(prog);
  return {
    id,
    x: at.x,
    y: at.y,
    money: own.money,
    bottles: emptyBottles(),
    containerLevel: own.containerLevel,
    mode: 'walking',
    searchSpotId: null,
    searchProgressMs: 0,
    depositMs: 0,
    actionHeld: false,
    stealHeld: false,
    inventory: own.inventory,
    upgrades: own.upgrades,
    weapon: 'fist',
    stealCooldownMs: 0,
    shieldMs: 0,
    health: CONFIG.health.max,
    unconsciousMs: 0,
    earnedRound: 0,
    earnedTotal: own.earnedTotal,
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
