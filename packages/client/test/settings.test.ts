import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_VOLUME, loadVolume, saveVolume, stepVolume, type KeyValueStore } from '../src/settings';

function memStore(initial?: string): KeyValueStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  if (initial !== undefined) map.set('pfandraiders.volume', initial);
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => { map.set(k, v); },
  };
}

describe('loadVolume', () => {
  it('returns the default for an empty store', () => {
    expect(loadVolume(memStore())).toBe(DEFAULT_VOLUME);
    expect(DEFAULT_VOLUME).toBe(70);
  });
  it('reads a stored value', () => {
    expect(loadVolume(memStore('40'))).toBe(40);
    expect(loadVolume(memStore('0'))).toBe(0);
    expect(loadVolume(memStore('100'))).toBe(100);
  });
  it.each(['abc', '', 'NaN', '-5', '150'])('falls back to the default for %j', (raw) => {
    expect(loadVolume(memStore(raw))).toBe(DEFAULT_VOLUME);
  });
  it('rounds decimals', () => {
    expect(loadVolume(memStore('12.6'))).toBe(13);
  });
  it('survives a throwing store', () => {
    const store: KeyValueStore = { getItem: () => { throw new Error('locked'); }, setItem: vi.fn() };
    expect(loadVolume(store)).toBe(DEFAULT_VOLUME);
  });
  it('returns the default without a store and without localStorage', () => {
    expect(typeof localStorage).toBe('undefined');
    expect(loadVolume()).toBe(DEFAULT_VOLUME);
  });
});

describe('saveVolume', () => {
  it('writes rounded and clamped values', () => {
    const s = memStore();
    saveVolume(42.4, s);
    expect(s.map.get('pfandraiders.volume')).toBe('42');
    saveVolume(250, s);
    expect(s.map.get('pfandraiders.volume')).toBe('100');
    saveVolume(-3, s);
    expect(s.map.get('pfandraiders.volume')).toBe('0');
  });
  it('swallows storage errors', () => {
    const store: KeyValueStore = { getItem: () => null, setItem: () => { throw new Error('full'); } };
    expect(() => saveVolume(50, store)).not.toThrow();
  });
  it('does not throw without localStorage', () => {
    expect(() => saveVolume(50)).not.toThrow();
  });
});

describe('stepVolume', () => {
  it.each([
    [75, 1, 80],
    [75, -1, 70],
    [100, 1, 100],
    [0, -1, 0],
    [70, 1, 80],
    [70, -1, 60],
    [5, -1, 0],
    [95, 1, 100],
  ] as const)('stepVolume(%d, %d) = %d', (v, dir, expected) => {
    expect(stepVolume(v, dir)).toBe(expected);
  });
  it('returns the default for NaN', () => {
    expect(stepVolume(NaN, 1)).toBe(DEFAULT_VOLUME);
  });
});
