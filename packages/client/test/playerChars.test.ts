import { describe, expect, it } from 'vitest';
import {
  ALL_CHARACTERS,
  CHAR_FRAME_H,
  CHAR_FRAME_W,
  CHAR_ORIGIN_Y,
  PLAYER_CHARACTERS,
  charDir,
  charFrameIndex,
  characterFor,
  characterIndex,
} from '../src/playerChars';

describe('character list', () => {
  it('knows all 24 sheets m01..m12 and f01..f12', () => {
    expect(ALL_CHARACTERS).toHaveLength(24);
    expect(new Set(ALL_CHARACTERS).size).toBe(24);
    expect(ALL_CHARACTERS).toContain('m01');
    expect(ALL_CHARACTERS).toContain('m12');
    expect(ALL_CHARACTERS).toContain('f01');
    expect(ALL_CHARACTERS).toContain('f12');
  });

  it('PLAYER_CHARACTERS has 8 distinct keys from the 24 sheets, mixed male and female', () => {
    expect(PLAYER_CHARACTERS).toHaveLength(8);
    expect(new Set(PLAYER_CHARACTERS).size).toBe(8);
    for (const c of PLAYER_CHARACTERS) expect(ALL_CHARACTERS).toContain(c);
    expect(PLAYER_CHARACTERS.filter((c) => c.startsWith('m')).length).toBe(4);
    expect(PLAYER_CHARACTERS.filter((c) => c.startsWith('f')).length).toBe(4);
  });

  it('frame geometry: 16x17, feet (bottom row) 5 px below the position', () => {
    expect(CHAR_FRAME_W).toBe(16);
    expect(CHAR_FRAME_H).toBe(17);
    expect(CHAR_FRAME_H * (1 - CHAR_ORIGIN_Y)).toBeCloseTo(5);
    expect(CHAR_FRAME_H * CHAR_ORIGIN_Y).toBeCloseTo(12);
  });
});

describe('characterFor', () => {
  it('maps index 0..7 to the list in order', () => {
    PLAYER_CHARACTERS.forEach((c, i) => expect(characterFor(i)).toBe(c));
  });

  it('wraps modulo 8', () => {
    expect(characterFor(8)).toBe(PLAYER_CHARACTERS[0]);
    expect(characterFor(9)).toBe(PLAYER_CHARACTERS[1]);
    expect(characterFor(23)).toBe(PLAYER_CHARACTERS[7]);
  });

  it('negative indices wrap into range', () => {
    expect(characterFor(-1)).toBe(PLAYER_CHARACTERS[7]);
    expect(characterFor(-8)).toBe(PLAYER_CHARACTERS[0]);
  });

  it('NaN, Infinity and fractions are safe', () => {
    expect(characterFor(NaN)).toBe(PLAYER_CHARACTERS[0]);
    expect(characterFor(Infinity)).toBe(PLAYER_CHARACTERS[0]);
    expect(characterFor(2.7)).toBe(PLAYER_CHARACTERS[2]);
  });
});

describe('characterIndex', () => {
  it('uses the position in the roster first', () => {
    expect(characterIndex('c', ['a', 'b', 'c'], ['c', 'a', 'b'])).toBe(2);
  });

  it('falls back to the player id order when the roster lacks the id', () => {
    expect(characterIndex('c', ['a', 'b'], ['c', 'a', 'b'])).toBe(0);
    expect(characterIndex('b', [], ['c', 'a', 'b'])).toBe(2);
  });

  it('is 0 when the id is unknown everywhere', () => {
    expect(characterIndex('x', ['a'], ['b'])).toBe(0);
  });
});

describe('charDir', () => {
  it('maps facing and flipX to a sheet direction', () => {
    expect(charDir('down', false)).toBe('down');
    expect(charDir('up', false)).toBe('up');
    expect(charDir('side', false)).toBe('right');
    expect(charDir('side', true)).toBe('left');
  });

  it('ignores flipX for down and up', () => {
    expect(charDir('down', true)).toBe('down');
    expect(charDir('up', true)).toBe('up');
  });
});

describe('charFrameIndex', () => {
  // Spalte = Richtung (0 vorn, 1 rechts, 2 hinten, 3 links), Zeile = Gehbild (0 Stand, 1 Schritt, 2 anderer Schritt).
  // Gehzyklus über 4 Schritte: Zeilen 0, 1, 0, 2. Bildnummer = Zeile * 4 + Spalte.
  const cases: [Parameters<typeof charFrameIndex>[0], number[]][] = [
    ['down', [0, 4, 0, 8]],
    ['right', [1, 5, 1, 9]],
    ['up', [2, 6, 2, 10]],
    ['left', [3, 7, 3, 11]],
  ];
  for (const [dir, frames] of cases) {
    it(`${dir}: steps 0..3 -> ${frames.join(', ')}`, () => {
      frames.forEach((f, step) => expect(charFrameIndex(dir, step)).toBe(f));
    });
  }

  it('wraps the step and treats NaN or negative as 0', () => {
    expect(charFrameIndex('down', 4)).toBe(0);
    expect(charFrameIndex('down', 5)).toBe(4);
    expect(charFrameIndex('up', NaN)).toBe(2);
    expect(charFrameIndex('up', -1)).toBe(2);
  });

  it('stays inside the 12 frames of a sheet', () => {
    for (const dir of ['down', 'right', 'up', 'left'] as const) {
      for (let s = 0; s < 4; s++) {
        const f = charFrameIndex(dir, s);
        expect(f).toBeGreaterThanOrEqual(0);
        expect(f).toBeLessThan(12);
      }
    }
  });
});
