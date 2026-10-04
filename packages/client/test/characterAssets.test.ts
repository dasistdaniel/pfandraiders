import { describe, expect, it } from 'vitest';
import { CHARACTER_URLS, charKeyFromPath } from '../src/characterAssets';
import { ALL_CHARACTERS, PLAYER_CHARACTERS } from '../src/playerChars';

describe('characterAssets', () => {
  it('derives the key from the file name', () => {
    expect(charKeyFromPath('../assets/characters/m01.png')).toBe('m01');
    expect(charKeyFromPath('./assets/characters/f12.png')).toBe('f12');
    expect(charKeyFromPath('readme.txt')).toBeNull();
  });

  it('imports every one of the 24 sheets and nothing else', () => {
    expect(Object.keys(CHARACTER_URLS).sort()).toEqual([...ALL_CHARACTERS].sort());
    for (const url of Object.values(CHARACTER_URLS)) {
      expect(typeof url).toBe('string');
      expect(url.length).toBeGreaterThan(0);
    }
  });

  it('has a sheet for every player character', () => {
    for (const c of PLAYER_CHARACTERS) expect(CHARACTER_URLS[c]).toBeTruthy();
  });
});
