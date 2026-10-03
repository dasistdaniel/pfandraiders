import { describe, expect, it } from 'vitest';
import { dogTexture, objectTexture, playerTexture, policeTexture, spotTexture, tileTexture } from '../src/textureKeys';

describe('textureKeys', () => {
  it('formats tile, spot and object keys', () => {
    expect(tileTexture('floor_0')).toBe('tile:floor_0');
    expect(tileTexture('wall_front')).toBe('tile:wall_front');
    expect(spotTexture('bin', true)).toBe('spot:bin:full');
    expect(spotTexture('bin', false)).toBe('spot:bin:empty');
    expect(objectTexture('dropoff')).toBe('object:dropoff');
    expect(objectTexture('shop')).toBe('object:shop');
  });
  it('formats player keys with 6-digit hex', () => {
    expect(playerTexture(0xef5350, 'down_a')).toBe('player:ef5350:down_a');
    expect(playerTexture(0xff, 'lying')).toBe('player:0000ff:lying');
  });
  it('formats npc keys', () => {
    expect(dogTexture('a')).toBe('dog:a');
    expect(policeTexture('b')).toBe('police:b');
  });
});
