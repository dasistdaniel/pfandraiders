import { describe, expect, it } from 'vitest';
import { AVATAR_COUNT, AVATAR_DEFAULT_ORDER, isAvatar, pickAvatar } from '../src/avatars';

describe('avatars', () => {
  it('has 24 avatars and a default order that is a permutation of 0..23', () => {
    expect(AVATAR_COUNT).toBe(24);
    expect(AVATAR_DEFAULT_ORDER).toHaveLength(24);
    expect([...AVATAR_DEFAULT_ORDER].sort((a, b) => a - b)).toEqual(Array.from({ length: 24 }, (_, i) => i));
    // die bisherigen PLAYER_CHARACTERS m02, f03, m01, f07, m05, f11, m06, f09 als Indizes
    expect(AVATAR_DEFAULT_ORDER.slice(0, 8)).toEqual([1, 14, 0, 18, 4, 22, 5, 20]);
  });

  it('accepts only integers from 0 to 23', () => {
    for (const ok of [0, 1, 23]) expect(isAvatar(ok)).toBe(true);
    for (const bad of [-1, 24, 1.5, NaN, Infinity, '3', null, undefined]) expect(isAvatar(bad)).toBe(false);
  });

  it('gives the wish when it is valid and free', () => {
    expect(pickAvatar(new Set(), 7)).toBe(7);
    expect(pickAvatar(new Set([1, 14]), 0)).toBe(0);
  });

  it('falls back to the first free avatar in the default order', () => {
    expect(pickAvatar(new Set())).toBe(1);
    expect(pickAvatar(new Set([1]))).toBe(14);
    expect(pickAvatar(new Set([1, 14]), 1)).toBe(0);
    expect(pickAvatar(new Set(), 99)).toBe(1);
    expect(pickAvatar(new Set(), -1)).toBe(1);
  });

  it('never fails, even when everything is taken', () => {
    expect(pickAvatar(new Set(AVATAR_DEFAULT_ORDER))).toBe(1);
  });
});
