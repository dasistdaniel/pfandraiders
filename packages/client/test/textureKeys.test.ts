import { describe, expect, it } from 'vitest';
import { dogTexture, mapTexture, objectTexture, playerTexture, policeTexture, spotTexture, tileTexture } from '../src/textureKeys';

describe('textureKeys', () => {
  it('prefixes tile, spot and object keys with the tileset', () => {
    expect(tileTexture('retro', 'floor_0')).toBe('retro:tile:floor_0');
    expect(tileTexture('city', 'wall_front')).toBe('city:tile:wall_front');
    expect(spotTexture('city', 'bin', true)).toBe('city:spot:bin:full');
    expect(spotTexture('retro', 'bin', false)).toBe('retro:spot:bin:empty');
    expect(objectTexture('city', 'dropoff')).toBe('city:object:dropoff');
    expect(objectTexture('retro', 'shop')).toBe('retro:object:shop');
  });
  it('keeps the tilesets apart', () => {
    expect(tileTexture('city', 'floor_0')).not.toBe(tileTexture('retro', 'floor_0'));
    expect(spotTexture('city', 'bin', true)).not.toBe(spotTexture('retro', 'bin', true));
    expect(objectTexture('city', 'shop')).not.toBe(objectTexture('retro', 'shop'));
  });
  it('formats map image keys', () => {
    expect(mapTexture('city', 'ground-below')).toBe('map:city:ground-below');
    expect(mapTexture('city', 'above')).toBe('map:city:above');
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
