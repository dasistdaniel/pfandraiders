import { describe, expect, it, vi } from 'vitest';
import type { AssetState } from '../src/audioAssets';
import { MUSIC_CROSSFADE_SEC, MUSIC_FILE_GAIN, MusicPlayer, musicIdFor, musicSourceFor } from '../src/music/player';
import type { MusicAssets, Timers } from '../src/music/player';

function param(value = 0) {
  return {
    value,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    setTargetAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  };
}

type FakeSource = {
  buffer: { id: string } | null;
  loop: boolean;
  connect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
};
type FakeGain = { gain: ReturnType<typeof param>; connect: ReturnType<typeof vi.fn> };

function fakeContext() {
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
  return {
    state: 'running',
    currentTime: 0,
    sampleRate: 8000,
    destination: { dest: true },
    createGain: vi.fn(() => ({ ...node(), gain: param(1) })),
    createOscillator: vi.fn(() => ({
      ...node(),
      type: 'sine',
      frequency: param(440),
      detune: param(0),
      onended: null,
      start: vi.fn(),
      stop: vi.fn(),
    })),
    createBiquadFilter: vi.fn(() => ({ ...node(), type: 'lowpass', frequency: param(350), Q: param(1) })),
    createDynamicsCompressor: vi.fn(() => ({
      ...node(),
      threshold: param(),
      knee: param(),
      ratio: param(),
      attack: param(),
      release: param(),
    })),
    createBuffer: vi.fn(() => ({ getChannelData: () => new Float32Array(10) })),
    createBufferSource: vi.fn(() => ({ ...node(), buffer: null, loop: false, start: vi.fn(), stop: vi.fn() })),
  };
}

function fakeTimers() {
  const fns = new Map<number, () => void>();
  let next = 1;
  return {
    setInterval: vi.fn((fn: () => void) => {
      fns.set(next, fn);
      return next++;
    }),
    clearInterval: vi.fn((id: unknown) => {
      fns.delete(id as number);
    }),
    active: () => fns.size,
  };
}

/** Musikdateien-Ersatz: Zustand je ID, änderbar; meldet Änderungen wie AudioAssets. */
function fakeAssets(states: Record<string, AssetState>): MusicAssets & { set(id: string, s: AssetState): void } {
  const listeners: (() => void)[] = [];
  return {
    state: (id) => states[id] ?? 'none',
    buffer: (id) => (states[id] === 'ready' ? ({ id } as unknown as AudioBuffer) : null),
    onChange: (fn) => listeners.push(fn),
    set(id, s) {
      states[id] = s;
      for (const fn of listeners) fn();
    },
  };
}

function setup(states: Record<string, AssetState>, opts: { volume?: number; muted?: boolean } = {}) {
  const ctx = fakeContext();
  const timers = fakeTimers();
  const assets = fakeAssets(states);
  const player = new MusicPlayer(
    { getContext: () => ctx as unknown as AudioContext },
    { volume: opts.volume ?? 50, muted: opts.muted ?? false, timers: timers as unknown as Timers, assets },
  );
  const sources = () => ctx.createBufferSource.mock.results.map((r) => r.value as FakeSource);
  const loops = () => sources().filter((s) => s.loop);
  /** Gain eines Loops: der Knoten, an den die Quelle angeschlossen ist */
  const envOf = (s: FakeSource) => s.connect.mock.calls[0][0] as FakeGain;
  return { ctx, timers, assets, player, loops, envOf };
}

describe('musicSourceFor', () => {
  it('maps the file state to the music source', () => {
    expect(musicSourceFor(false, 'ready')).toBe('off');
    expect(musicSourceFor(true, 'ready')).toBe('file');
    expect(musicSourceFor(true, 'pending')).toBe('wait');
    expect(musicSourceFor(true, 'none')).toBe('synth');
    expect(musicSourceFor(true, 'failed')).toBe('synth');
  });

  it('uses one file id per state', () => {
    expect([musicIdFor('menu'), musicIdFor('game'), musicIdFor('ended')]).toEqual(['music_menu', 'music_game', 'music_ended']);
  });
});

describe('MusicPlayer with files', () => {
  it('plays a looping file instead of the generated music, faded in, at the file level', () => {
    const { player, timers, loops, envOf, ctx } = setup({ music_menu: 'ready' });
    player.start();
    expect(player.currentSource).toBe('file');
    expect(timers.active()).toBe(0); // kein Notentakt
    expect(ctx.createOscillator.mock.calls.length).toBeLessThanOrEqual(1); // nur der Vibrato-LFO
    const [loop] = loops();
    expect(loop.buffer).toEqual({ id: 'music_menu' });
    const env = envOf(loop);
    expect(env.gain.linearRampToValueAtTime).toHaveBeenCalledWith(1, MUSIC_CROSSFADE_SEC);
    const out = env.connect.mock.calls[0][0] as FakeGain;
    expect(out.connect).toHaveBeenCalledWith(ctx.destination);
    expect(out.gain.setTargetAtTime.mock.calls.at(-1)![0]).toBeCloseTo(MUSIC_FILE_GAIN * 0.5);
  });

  it('keeps a fixed tempo: progress does not touch the file', () => {
    const { player, loops } = setup({ music_game: 'ready' });
    player.setMode('game');
    player.start();
    for (let i = 0; i < 10; i++) player.setProgress(i / 10);
    expect(loops()).toHaveLength(1);
    expect(player.currentBpm).toBeGreaterThan(0);
  });

  it('crossfades between two files when the state changes and stops the old one', () => {
    const { player, loops, envOf, ctx } = setup({ music_menu: 'ready', music_game: 'ready' });
    player.start();
    ctx.currentTime = 10;
    player.setMode('game');
    player.setMode('game');
    const [menu, game] = loops();
    expect(loops()).toHaveLength(2);
    expect(game.buffer).toEqual({ id: 'music_game' });
    expect(envOf(menu).gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, 10 + MUSIC_CROSSFADE_SEC);
    expect(menu.stop).toHaveBeenCalledTimes(1);
    expect(envOf(game).gain.linearRampToValueAtTime).toHaveBeenCalledWith(1, 10 + MUSIC_CROSSFADE_SEC);
  });

  it('falls back to the generated music for a state without file, and back', () => {
    const { player, timers, loops } = setup({ music_menu: 'ready' });
    player.start();
    player.setMode('game');
    expect(player.currentSource).toBe('synth');
    expect(timers.active()).toBe(1);
    expect(loops()[0].stop).toHaveBeenCalled();
    player.setMode('menu');
    expect(player.currentSource).toBe('file');
    expect(timers.active()).toBe(0);
    expect(loops()).toHaveLength(2); // neu gestartet
  });

  it('waits silently while the file loads, then starts it', () => {
    const { player, timers, loops, assets } = setup({ music_menu: 'pending' });
    player.start();
    expect(player.currentSource).toBe('wait');
    expect(timers.active()).toBe(0);
    expect(loops()).toHaveLength(0);
    assets.set('music_menu', 'ready');
    expect(player.currentSource).toBe('file');
    expect(loops()).toHaveLength(1);
  });

  it('uses the generated music if the file fails', () => {
    const { player, timers, assets } = setup({ music_menu: 'pending' });
    player.start();
    assets.set('music_menu', 'failed');
    expect(player.currentSource).toBe('synth');
    expect(timers.active()).toBe(1);
  });

  it('mute and volume 0 stop the file, unmute restarts it; volume changes ramp the level', () => {
    const { player, loops, envOf } = setup({ music_menu: 'ready' }, { volume: 40 });
    player.start();
    player.setMuted(true);
    expect(player.currentSource).toBe('off');
    expect(loops()[0].stop).toHaveBeenCalled();
    player.setMuted(false);
    expect(loops()).toHaveLength(2);
    player.setVolume(80);
    const out = envOf(loops()[1]).connect.mock.calls[0][0] as FakeGain;
    expect(out.gain.setTargetAtTime.mock.calls.at(-1)![0]).toBeCloseTo(MUSIC_FILE_GAIN * 0.8);
    player.setVolume(0);
    expect(loops()[1].stop).toHaveBeenCalled();
    player.stop();
    expect(player.currentSource).toBe('off');
  });

  it('starts muted without any file source', () => {
    const { player, loops } = setup({ music_menu: 'ready' }, { muted: true });
    player.start();
    expect(loops()).toHaveLength(0);
  });

  it('does not apply the ended level to a music_ended file', () => {
    const { player, loops, envOf } = setup({ music_ended: 'ready' }, { volume: 100 });
    player.setMode('ended');
    player.start();
    const out = envOf(loops()[0]).connect.mock.calls[0][0] as FakeGain;
    expect(out.gain.setTargetAtTime.mock.calls.at(-1)![0]).toBeCloseTo(MUSIC_FILE_GAIN);
  });

  it('survives assets that throw', () => {
    const ctx = fakeContext();
    const bad: MusicAssets = {
      state: () => {
        throw new Error('x');
      },
      buffer: () => null,
      onChange: () => {
        throw new Error('y');
      },
    };
    const player = new MusicPlayer(
      { getContext: () => ctx as unknown as AudioContext },
      { volume: 50, timers: fakeTimers() as unknown as Timers, assets: bad },
    );
    expect(() => player.start()).not.toThrow();
    expect(player.currentSource).toBe('synth');
  });
});
