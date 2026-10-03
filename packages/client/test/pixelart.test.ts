import { describe, expect, it } from 'vitest';
import { PALETTE, decodeSprite, shade } from '../src/pixelart';

describe('shade', () => {
  it('keeps the color at factor 1', () => expect(shade(0x336699, 1)).toBe(0x336699));
  it('halves each channel at 0.5', () => expect(shade(0x80c040, 0.5)).toBe(0x406020));
  it('clamps to 255', () => expect(shade(0xf0f0f0, 2)).toBe(0xffffff));
});

describe('decodeSprite', () => {
  it('reports size and marks . as null', () => {
    const d = decodeSprite(['.k', 'w.', '..']);
    expect(d.w).toBe(2);
    expect(d.h).toBe(3);
    expect(d.px).toHaveLength(6);
    expect(d.px[0]).toBeNull();
    expect(d.px[1]).toBe(PALETTE.k);
    expect(d.px[2]).toBe(PALETTE.w);
  });
  it('maps P and Q with the tint', () => {
    const d = decodeSprite(['PQ'], 0x808080);
    expect(d.px).toEqual([0x808080, shade(0x808080, 0.7)]);
  });
  it('throws on P without tint', () => {
    expect(() => decodeSprite(['P'])).toThrow();
  });
  it('throws on unknown char and names it', () => {
    expect(() => decodeSprite(['k?'])).toThrow(/\?/);
  });
  it('throws on uneven rows', () => {
    expect(() => decodeSprite(['kk', 'k'])).toThrow();
  });
  it('throws on empty sprites', () => {
    expect(() => decodeSprite([])).toThrow();
    expect(() => decodeSprite([''])).toThrow();
  });
});
