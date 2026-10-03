import { describe, expect, it } from 'vitest';
import { resolveServerUrl } from '../src/serverUrl';

describe('resolveServerUrl', () => {
  it('prefers the ?server= parameter', () => {
    expect(resolveServerUrl('?server=wss://x.example', 'ws://env')).toBe('wss://x.example');
  });

  it('falls back to the build-time URL, then to localhost', () => {
    expect(resolveServerUrl('', 'wss://env.example')).toBe('wss://env.example');
    expect(resolveServerUrl('', undefined)).toBe('ws://localhost:8080');
    expect(resolveServerUrl('', '')).toBe('ws://localhost:8080');
  });

  it('only accepts ws:// and wss:// addresses from the parameter', () => {
    expect(resolveServerUrl('?server=javascript:alert(1)', 'ws://env')).toBe('ws://env');
    expect(resolveServerUrl('?server=https://x.example', undefined)).toBe('ws://localhost:8080');
  });

  it('rejects malformed addresses and falls through to the next source', () => {
    for (const bad of ['foo', 'ws:/x', 'ws://', ' ws://x ', 'ws://x y']) {
      expect(resolveServerUrl(`?server=${encodeURIComponent(bad)}`, undefined)).toBe('ws://localhost:8080');
    }
    expect(resolveServerUrl('?server=', 'ws://env')).toBe('ws://env');
  });

  it('is case-sensitive: upper-case WS:// is rejected', () => {
    expect(resolveServerUrl('?server=WS://x', undefined)).toBe('ws://localhost:8080');
  });

  it('ignores an invalid build-time URL', () => {
    expect(resolveServerUrl('', 'http://env')).toBe('ws://localhost:8080');
    expect(resolveServerUrl('', 'garbage')).toBe('ws://localhost:8080');
  });
});
