import { describe, expect, it } from 'vitest';
import type { SpotType } from '@pfandraiders/core';
import { decodeSprite } from '../src/pixelart';
import { OBJECT_SPRITES, SPOT_SPRITES, TILE_SPRITES } from '../src/sprites/tiles';
import type { TileKey } from '../src/tiles';

const TINT = 0xff0000;
const TILE_KEYS: TileKey[] = ['floor_0', 'floor_1', 'floor_2', 'wall_top_0', 'wall_top_1', 'wall_top_2', 'wall_front'];
const SPOT_TYPES: SpotType[] = ['bus_stop', 'bench', 'bush', 'bin', 'park'];

function check(rows: readonly string[], size: number, opaque: boolean) {
  const d = decodeSprite(rows, TINT);
  expect(d.w).toBe(size);
  expect(d.h).toBe(size);
  expect(d.px.some((p) => p !== null)).toBe(true);
  if (opaque) expect(d.px.every((p) => p !== null)).toBe(true);
}

describe('tile sprites', () => {
  it('has all seven tile keys', () => {
    for (const k of TILE_KEYS) expect(TILE_SPRITES[k], k).toBeDefined();
  });
  for (const k of TILE_KEYS) it(`${k} is 16x16 and fully opaque`, () => check(TILE_SPRITES[k], 16, true));
});

describe('spot sprites', () => {
  for (const t of SPOT_TYPES) {
    it(`${t} full and empty are 12x12 and differ`, () => {
      const s = SPOT_SPRITES[t];
      expect(s).toBeDefined();
      check(s.full, 12, false);
      check(s.empty, 12, false);
      expect(s.full).not.toEqual(s.empty);
    });
  }
});

describe('object sprites', () => {
  it('dropoff is 16x16', () => check(OBJECT_SPRITES.dropoff, 16, false));
  it('shop is 16x16', () => check(OBJECT_SPRITES.shop, 16, false));
});
