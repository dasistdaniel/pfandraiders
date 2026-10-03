import { describe, expect, it } from 'vitest';
import type { SpotType } from '@pfandraiders/core';
import { decodeSprite } from '../src/pixelart';
import { DOG_SPRITES, PLAYER_SPRITES, POLICE_SPRITES, type PlayerFrame } from '../src/sprites/characters';
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

describe('character sprites', () => {
  const frames = Object.keys(PLAYER_SPRITES) as PlayerFrame[];

  it('has all seven player frames', () => {
    expect(frames.sort()).toEqual(['down_a', 'down_b', 'lying', 'side_a', 'side_b', 'up_a', 'up_b']);
  });

  for (const f of frames) {
    it(`player ${f} is 12x12, uses P and decodes with tint`, () => {
      const rows = PLAYER_SPRITES[f];
      expect(rows.join('')).toContain('P');
      check(rows, 12, false);
    });
  }

  for (const d of ['down', 'up', 'side']) {
    it(`player ${d}_a and ${d}_b differ`, () => {
      expect(PLAYER_SPRITES[`${d}_a` as PlayerFrame]).not.toEqual(PLAYER_SPRITES[`${d}_b` as PlayerFrame]);
    });
  }

  it('upright player sprites leave the outermost rows and columns empty', () => {
    for (const f of frames.filter((n) => n !== 'lying')) {
      const rows = PLAYER_SPRITES[f];
      for (const row of [rows[0], rows[rows.length - 1]]) expect(row, f).toBe('.'.repeat(12));
      for (const row of rows) {
        expect(row[0], f).toBe('.');
        expect(row[11], f).toBe('.');
      }
    }
  });

  it('lying player is wider than tall', () => {
    const rows = PLAYER_SPRITES.lying;
    const filled = rows.map((r, i) => (/[^.]/.test(r) ? i : -1)).filter((i) => i >= 0);
    expect(filled.length).toBeLessThan(12);
    expect(rows.some((r) => r[0] !== '.' || r[11] !== '.')).toBe(true);
  });

  it('dog frames are 12x8 and differ', () => {
    for (const k of ['a', 'b'] as const) {
      const d = decodeSprite(DOG_SPRITES[k], TINT);
      expect([d.w, d.h]).toEqual([12, 8]);
    }
    expect(DOG_SPRITES.a).not.toEqual(DOG_SPRITES.b);
  });

  it('police frames are 10x14 and differ', () => {
    for (const k of ['a', 'b'] as const) {
      const d = decodeSprite(POLICE_SPRITES[k], TINT);
      expect([d.w, d.h]).toEqual([10, 14]);
    }
    expect(POLICE_SPRITES.a).not.toEqual(POLICE_SPRITES.b);
  });
});
