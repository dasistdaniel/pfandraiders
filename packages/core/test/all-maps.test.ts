import { describe, expect, it } from 'vitest';
import { createGame } from '../src/game';
import { step } from '../src/step';
import { NO_INPUT } from '../src/types';
import type { Input } from '../src/types';
import { BUILTIN_MAP_RULES, CUSTOM_MAP_RULES, MAP_DEFS, MAP_LIST, MAP_SOURCES, validateTiledMap } from '../src/maps';
import { MAX_ROOM_PLAYERS } from '../src/protocol';

const jsonOf = (id: string): unknown => MAP_SOURCES.find((s) => s.id === id)?.json;
const DIRS = [-1, 0, 1] as const;

describe('every registered map', () => {
  it('has a Tiled source for each list entry, in list order', () => {
    expect(MAP_SOURCES.map((s) => s.id)).toEqual(MAP_LIST.map((m) => m.id));
  });

  for (const { id } of MAP_LIST) {
    it(`${id} passes its rules and matches its registry entry`, () => {
      const def = MAP_DEFS[id];
      const v = def.builtin
        ? validateTiledMap(jsonOf(id), { rules: BUILTIN_MAP_RULES, tileset: def.tileset })
        : validateTiledMap(jsonOf(id), { rules: CUSTOM_MAP_RULES });
      expect(v.problems).toEqual([]);
      expect(v.map).toEqual(def.map);
      expect(v.tileset).toBe(def.tileset);
    });

    it(`${id} survives a short game with a full room`, () => {
      const ids = Array.from({ length: MAX_ROOM_PLAYERS }, (_, i) => `p${i + 1}`);
      const s = createGame(7, MAP_DEFS[id].map, ids, { countdownMs: 0, roundMs: 60_000 });
      const inputs: Record<string, Input> = {};
      ids.forEach((p, i) => {
        inputs[p] = { ...NO_INPUT, moveX: DIRS[i % 3], moveY: DIRS[(i + 1) % 3], action: i % 2 === 0 };
      });
      for (let t = 0; t < 1300; t++) step(s, inputs, 50);
      expect(s.phase).toBe('ended');
    });
  }
});

describe('built-in exception (ruling R1)', () => {
  it('city also passes the strict custom rules', () => {
    expect(validateTiledMap(jsonOf('city'), { rules: CUSTOM_MAP_RULES, tileset: 'city' }).problems).toEqual([]);
  });

  it('retro fails the strict rules only on spawns and spots', () => {
    expect(validateTiledMap(jsonOf('retro'), { rules: CUSTOM_MAP_RULES, tileset: 'retro' }).problems).toEqual([
      'Startpunkte (spawn): 4, nötig sind genau 8.',
      'Spots (spot): 17, nötig sind mindestens 20.',
    ]);
  });
});
