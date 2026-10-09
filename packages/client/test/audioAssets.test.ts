import { describe, expect, it, vi } from 'vitest';
import { AudioAssets, decodeAudio } from '../src/audioAssets';
import type { Fetcher } from '../src/audioAssets';

const never = () => new Promise<void>(() => undefined);

/** fetch-Ersatz: Manifest plus Dateien (Inhalt = Name, damit decode ihn wiedererkennt). */
function fakeFetch(manifest: unknown, opts: { missing?: string[]; manifestStatus?: number } = {}) {
  return vi.fn<Fetcher>(async (url: string) => {
    if (url.endsWith('audio-manifest.json')) {
      return { ok: (opts.manifestStatus ?? 200) === 200, json: async () => manifest, arrayBuffer: async () => new ArrayBuffer(0) };
    }
    const ok = !(opts.missing ?? []).some((m) => url.endsWith(m));
    return { ok, json: async () => null, arrayBuffer: async () => new TextEncoder().encode(url).buffer as ArrayBuffer };
  });
}

function fakeCtx(fail: string[] = []) {
  return {
    decodeAudioData: vi.fn((data: ArrayBuffer) => {
      const name = new TextDecoder().decode(data);
      return fail.some((f) => name.endsWith(f)) ? Promise.reject(new Error('kaputt')) : Promise.resolve({ name } as unknown as AudioBuffer);
    }),
  } as unknown as AudioContext & { decodeAudioData: ReturnType<typeof vi.fn> };
}

const MANIFEST = {
  sounds: { pickup: 'sounds/pickup.ogg', revive: 'sounds/revive.wav', broken: 'sounds/broken.ogg' },
  music: { music_menu: 'music/music_menu.ogg' },
};

describe('AudioAssets', () => {
  it('loads manifest and decodes known files relative to the base', async () => {
    const f = fakeFetch(MANIFEST);
    const a = new AudioAssets(f, './', never);
    expect(a.state('pickup')).toBe('pending');
    await a.loadManifest();
    expect(a.state('pickup')).toBe('pending');
    expect(a.state('hit')).toBe('none');
    expect(a.has('pickup')).toBe(false);
    await a.load(fakeCtx());
    expect(f).toHaveBeenCalledWith('./audio-manifest.json');
    expect(f).toHaveBeenCalledWith('./sounds/pickup.ogg');
    expect(f).not.toHaveBeenCalledWith(expect.stringContaining('broken')); // unbekannte ID fällt im Manifest weg
    expect(a.state('pickup')).toBe('ready');
    expect(a.state('music_menu')).toBe('ready');
    expect((a.buffer('revive') as unknown as { name: string }).name).toBe('./sounds/revive.wav');
    expect(a.buffer('hit')).toBeNull();
  });

  it('loads every file only once even if load is called again', async () => {
    const f = fakeFetch(MANIFEST);
    const a = new AudioAssets(f, '/game/', never);
    const ctx = fakeCtx();
    await Promise.all([a.load(ctx), a.load(ctx)]);
    await a.load(ctx);
    expect(f).toHaveBeenCalledTimes(1 + 3);
    expect(f).toHaveBeenCalledWith('/game/music/music_menu.ogg');
  });

  it('marks a missing (404) or undecodable file as failed and keeps the rest', async () => {
    const a = new AudioAssets(fakeFetch(MANIFEST, { missing: ['revive.wav'] }), './', never);
    await a.load(fakeCtx(['music_menu.ogg']));
    expect(a.state('revive')).toBe('failed');
    expect(a.state('music_menu')).toBe('failed');
    expect(a.state('pickup')).toBe('ready');
  });

  it('treats a broken or missing manifest as empty', async () => {
    for (const f of [
      fakeFetch(null, { manifestStatus: 404 }),
      fakeFetch('kaputt'),
      vi.fn<Fetcher>(() => Promise.reject(new Error('offline'))),
    ]) {
      const a = new AudioAssets(f, './', never);
      await a.load(fakeCtx());
      expect(a.state('pickup')).toBe('none');
      expect(a.state('music_menu')).toBe('none');
    }
  });

  it('gives up on a hanging manifest after the timeout', async () => {
    const a = new AudioAssets(vi.fn<Fetcher>(() => new Promise(() => undefined)), './', () => Promise.resolve());
    await a.loadManifest();
    expect(a.state('pickup')).toBe('none');
  });

  it('without fetch everything is "none" and nothing throws', async () => {
    const a = new AudioAssets(null, './', never);
    expect(a.state('pickup')).toBe('none');
    await a.load(fakeCtx());
    expect(a.buffer('pickup')).toBeNull();
  });

  it('survives a context without decodeAudioData', async () => {
    const a = new AudioAssets(fakeFetch(MANIFEST), './', never);
    await a.load({} as AudioContext);
    expect(a.state('pickup')).toBe('failed');
  });

  it('notifies listeners on manifest and on each file, and a throwing listener is harmless', async () => {
    const a = new AudioAssets(fakeFetch(MANIFEST), './', never);
    const fn = vi.fn();
    a.onChange(() => {
      throw new Error('x');
    });
    const off = a.onChange(fn);
    await a.load(fakeCtx());
    expect(fn).toHaveBeenCalledTimes(1 + 3);
    off();
  });
});

describe('decodeAudio', () => {
  it('supports the old callback form', async () => {
    const ctx = {
      decodeAudioData: (_d: ArrayBuffer, ok: (b: AudioBuffer) => void) => {
        ok('buf' as unknown as AudioBuffer);
        return undefined;
      },
    } as unknown as AudioContext;
    await expect(decodeAudio(ctx, new ArrayBuffer(0))).resolves.toBe('buf');
  });

  it('rejects when decodeAudioData throws synchronously', async () => {
    const ctx = {
      decodeAudioData: () => {
        throw new Error('sync');
      },
    } as unknown as AudioContext;
    await expect(decodeAudio(ctx, new ArrayBuffer(0))).rejects.toThrow('sync');
  });
});
