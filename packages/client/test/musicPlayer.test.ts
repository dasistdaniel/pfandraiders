import { describe, expect, it, vi } from 'vitest';
import { MusicPlayer } from '../src/music/player';
import type { Timers } from '../src/music/player';
import { BPM_END, BPM_MENU, DUCK_LEVEL, ENDED_LEVEL, GUITAR_GATE_SEC, MUSIC_MAX_GAIN } from '../src/music/score';

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

function fakeContext() {
  const starts: number[] = [];
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
  const ctx = {
    state: 'running',
    currentTime: 0,
    sampleRate: 8000,
    destination: {},
    starts,
    createGain: vi.fn(() => ({ ...node(), gain: param(1) })),
    createOscillator: vi.fn(() => ({
      ...node(),
      type: 'sine',
      frequency: param(440),
      detune: param(0),
      onended: null as null | (() => void),
      start: vi.fn((t: number) => starts.push(t)),
      stop: vi.fn(),
    })),
    createBiquadFilter: vi.fn(() => ({ ...node(), type: 'lowpass', frequency: param(350), Q: param(1) })),
    createDynamicsCompressor: vi.fn(() => ({
      ...node(),
      threshold: param(-24),
      knee: param(30),
      ratio: param(12),
      attack: param(0.003),
      release: param(0.25),
    })),
    createBuffer: vi.fn(() => ({ getChannelData: () => new Float32Array(10) })),
    createBufferSource: vi.fn(() => ({ ...node(), buffer: null, start: vi.fn((t: number) => starts.push(t)), stop: vi.fn() })),
  };
  return ctx;
}

function fakeTimers() {
  const fns = new Map<number, () => void>();
  let next = 1;
  const timers = {
    setInterval: vi.fn((fn: () => void) => {
      fns.set(next, fn);
      return next++;
    }),
    clearInterval: vi.fn((id: unknown) => {
      fns.delete(id as number);
    }),
    fire() {
      for (const fn of [...fns.values()]) fn();
    },
    active: () => fns.size,
  };
  return timers;
}

function setup(opts: { volume?: number; muted?: boolean; noContext?: boolean } = {}) {
  const ctx = fakeContext();
  const timers = fakeTimers();
  let available = !opts.noContext;
  const player = new MusicPlayer(
    { getContext: () => (available ? (ctx as unknown as AudioContext) : null) },
    { volume: opts.volume ?? 40, muted: opts.muted ?? false, timers: timers as unknown as Timers },
  );
  /** Gain-Knoten der Musik: der erste, den der Spieler anlegt */
  const out = () => ctx.createGain.mock.results[0].value as { gain: ReturnType<typeof param> };
  return { ctx, timers, player, out, makeAvailable: () => (available = true) };
}

/** Lässt die Zeit in 25-ms-Schritten laufen und feuert den Takt. */
function run(ctx: ReturnType<typeof fakeContext>, timers: ReturnType<typeof fakeTimers>, seconds: number) {
  for (let i = 0; i < Math.round(seconds / 0.025); i++) {
    ctx.currentTime += 0.025;
    timers.fire();
  }
}

describe('MusicPlayer', () => {
  it('is a silent no-op without an AudioContext', () => {
    const { player, timers } = setup({ noContext: true });
    expect(() => {
      player.start();
      player.setMode('game');
      player.setProgress(0.5);
      player.setVolume(80);
      player.setMuted(true);
      player.setMuted(false);
      player.stop();
    }).not.toThrow();
    expect(timers.setInterval).not.toHaveBeenCalled();
  });

  it('survives a throwing context provider', () => {
    const player = new MusicPlayer({ getContext: () => { throw new Error('nope'); } }, { volume: 40, muted: false, timers: fakeTimers() });
    expect(() => { player.start(); player.setMode('game'); }).not.toThrow();
  });

  it('starts once the context appears later', () => {
    const { player, timers, ctx, makeAvailable } = setup({ noContext: true });
    player.start();
    expect(timers.setInterval).not.toHaveBeenCalled();
    makeAvailable();
    player.start();
    expect(timers.setInterval).toHaveBeenCalledTimes(1);
    expect(ctx.createOscillator).toHaveBeenCalled();
  });

  it('start is idempotent: one timer, one graph', () => {
    const { player, timers, ctx } = setup();
    player.start();
    // der erste start() plant schon Noten ein (Hüllkurven je Note); danach darf nichts mehr dazukommen
    const gains = ctx.createGain.mock.calls.length;
    const filters = ctx.createBiquadFilter.mock.calls.length;
    player.start();
    player.setMode('game');
    player.start();
    expect(timers.setInterval).toHaveBeenCalledTimes(1);
    expect(timers.active()).toBe(1);
    expect(ctx.createDynamicsCompressor).toHaveBeenCalledTimes(1);
    expect(ctx.createBiquadFilter.mock.calls.length).toBe(filters);
    expect(ctx.createGain.mock.calls.length).toBe(gains);
  });

  it('routes the music through a compressor to the destination', () => {
    const { player, ctx, out } = setup();
    player.start();
    const comp = ctx.createDynamicsCompressor.mock.results[0].value as { connect: ReturnType<typeof vi.fn> };
    expect((out() as unknown as { connect: ReturnType<typeof vi.fn> }).connect).toHaveBeenCalledWith(comp);
    expect(comp.connect).toHaveBeenCalledWith(ctx.destination);
  });

  it('fades the music in to its level and never above the budget', () => {
    const { player, out } = setup({ volume: 100 });
    player.start();
    const calls = out().gain.setTargetAtTime.mock.calls;
    expect(calls.at(-1)![0]).toBeCloseTo(MUSIC_MAX_GAIN);
    expect(out().gain.value).toBe(0); // beginnt still
  });

  it('volume 0 stops scheduling and a new volume resumes it', () => {
    const { player, timers, ctx } = setup();
    player.start();
    player.setVolume(0);
    expect(timers.active()).toBe(0);
    const n = ctx.createOscillator.mock.calls.length;
    run(ctx, timers, 2);
    expect(ctx.createOscillator.mock.calls.length).toBe(n);
    player.setVolume(30);
    expect(timers.active()).toBe(1);
    expect(player.volume).toBe(30);
  });

  it('clamps volume like the effects volume', () => {
    const { player } = setup();
    player.setVolume(250);
    expect(player.volume).toBe(100);
    player.setVolume(-4);
    expect(player.volume).toBe(0);
    player.setVolume(NaN);
    expect(player.volume).toBe(0);
  });

  it('setMuted silences and stops the timer, unmuting resumes', () => {
    const { player, timers, out } = setup();
    player.start();
    player.setMuted(true);
    expect(out().gain.setTargetAtTime.mock.calls.at(-1)![0]).toBe(0);
    expect(timers.active()).toBe(0);
    player.setMuted(false);
    expect(timers.active()).toBe(1);
    expect(out().gain.setTargetAtTime.mock.calls.at(-1)![0]).toBeGreaterThan(0);
  });

  it('starts muted without scheduling anything', () => {
    const { player, timers, ctx } = setup({ muted: true });
    player.start();
    expect(timers.active()).toBe(0);
    expect(ctx.starts.filter((t) => t > 0)).toEqual([]);
  });

  it('drops to the ended level and automates the gain only on changes', () => {
    const { player, out } = setup({ volume: 50 });
    player.start();
    player.setMode('game');
    const before = out().gain.setTargetAtTime.mock.calls.length;
    for (let i = 0; i < 100; i++) {
      player.setMode('ended');
      player.setProgress(1);
    }
    const calls = out().gain.setTargetAtTime.mock.calls;
    expect(calls.length).toBe(before + 1);
    expect(calls.at(-1)![0]).toBeCloseTo(MUSIC_MAX_GAIN * 0.5 * ENDED_LEVEL);
  });

  it('stop clears the timer and fades out', () => {
    const { player, timers, out } = setup();
    player.start();
    player.stop();
    expect(timers.clearInterval).toHaveBeenCalledTimes(1);
    expect(timers.active()).toBe(0);
    expect(out().gain.setTargetAtTime.mock.calls.at(-1)![0]).toBe(0);
    player.setMode('game'); // ohne start() kein neuer Takt
    expect(timers.active()).toBe(0);
  });

  it('never schedules notes in the past, also after a long stall', () => {
    const { player, timers, ctx } = setup();
    player.setMode('game');
    player.setProgress(0.9);
    player.start();
    let checked = 0;
    const check = () => {
      const now = ctx.currentTime;
      const from = checked;
      checked = ctx.starts.length;
      for (const t of ctx.starts.slice(from)) expect(t).toBeGreaterThanOrEqual(now);
    };
    check();
    run(ctx, timers, 3);
    checked = ctx.starts.length;
    ctx.currentTime += 7.3; // Tab im Hintergrund
    timers.fire();
    check();
    run(ctx, timers, 1);
    expect(ctx.starts.length).toBeGreaterThan(10);
  });

  it('schedules ahead but not too far', () => {
    const { player, timers, ctx } = setup();
    player.start();
    run(ctx, timers, 2);
    const max = Math.max(...ctx.starts);
    expect(max).toBeLessThanOrEqual(ctx.currentTime + 0.2);
  });

  it('glides the tempo up with the round progress', () => {
    const { player, timers, ctx } = setup();
    player.start();
    player.setMode('game');
    player.setProgress(1);
    run(ctx, timers, 1);
    expect(player.currentBpm).toBeGreaterThan(BPM_MENU);
    expect(player.currentBpm).toBeLessThanOrEqual(BPM_MENU + 8.5);
    run(ctx, timers, 10);
    expect(player.currentBpm).toBe(BPM_END);
    player.setMode('menu');
    run(ctx, timers, 1);
    expect(player.currentBpm).toBeLessThan(BPM_END);
  });

  it('plays no drums in the menu, but from the first second of a round (noise for hats and kick click)', () => {
    const { player, timers, ctx } = setup();
    player.start();
    run(ctx, timers, 4);
    expect(ctx.createBufferSource).not.toHaveBeenCalled();
    player.setMode('game');
    player.setProgress(0);
    run(ctx, timers, 1);
    expect(ctx.createBufferSource).toHaveBeenCalled();
  });

  it('builds the noise buffer once and reuses it', () => {
    const { player, timers, ctx } = setup();
    player.setMode('game');
    player.setProgress(1);
    player.start();
    run(ctx, timers, 3);
    expect(ctx.createBufferSource.mock.calls.length).toBeGreaterThan(10);
    expect(ctx.createBuffer).toHaveBeenCalledTimes(1);
  });

  it('pumps chords and melodies on every kick in a round, never in the menu', () => {
    const { player, timers, ctx } = setup();
    player.start();
    const duck = ctx.createGain.mock.results[1].value as { gain: ReturnType<typeof param> };
    run(ctx, timers, 3);
    expect(duck.gain.setTargetAtTime).not.toHaveBeenCalled();
    player.setMode('game');
    run(ctx, timers, 2);
    const calls = duck.gain.setTargetAtTime.mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(4);
    expect(calls.some((c) => c[0] === DUCK_LEVEL)).toBe(true);
    expect(calls.at(-1)![0]).toBe(1); // kommt immer zurück
    for (let i = 1; i < calls.length; i++) expect(calls[i][1]).toBeGreaterThanOrEqual(calls[i - 1][1]);
  });

  it('creates all filters once when attaching, none per note', () => {
    const { player, timers, ctx } = setup();
    player.setMode('game');
    player.setProgress(1);
    player.start();
    const filters = ctx.createBiquadFilter.mock.calls.length;
    expect(filters).toBeGreaterThanOrEqual(5);
    run(ctx, timers, 3);
    expect(ctx.createBiquadFilter.mock.calls.length).toBe(filters);
  });

  it('plays palm-muted power chords in a round, but no guitar in the menu', () => {
    const { player, timers, ctx } = setup();
    const saws = () =>
      ctx.createOscillator.mock.results.map((r) => r.value as { type: string; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }).filter((o) => o.type === 'sawtooth');
    player.start();
    run(ctx, timers, 3);
    const menuSaws = saws().length; // nur der Sägezahn-Anteil des Leads
    player.setMode('game');
    player.setProgress(0);
    run(ctx, timers, 2);
    const gameSaws = saws().slice(menuSaws);
    expect(gameSaws.length).toBeGreaterThan(20);
    // die meisten Gitarrentöne sind abgedämpft: Gate plus kurzer Ausklang
    const short = gameSaws.filter((o) => {
      const started = o.start.mock.calls[0]?.[0] as number;
      const stopped = o.stop.mock.calls[0]?.[0] as number;
      return stopped - started <= GUITAR_GATE_SEC + 0.06;
    });
    expect(short.length).toBeGreaterThan(gameSaws.length / 2);
  });

  it('schedules a sane number of voices at full intensity', () => {
    const { player, timers, ctx } = setup();
    player.setMode('game');
    player.setProgress(1);
    player.start();
    run(ctx, timers, 10); // Tempo erreicht 165 BPM
    const osc = ctx.createOscillator.mock.calls.length;
    const noise = ctx.createBufferSource.mock.calls.length;
    run(ctx, timers, 2);
    const steps = (2 * BPM_END * 4) / 60; // 22 Sechzehntel in zwei Sekunden
    const perStepOsc = (ctx.createOscillator.mock.calls.length - osc) / steps;
    const perStepNoise = (ctx.createBufferSource.mock.calls.length - noise) / steps;
    expect(perStepOsc).toBeGreaterThan(3); // Gitarre, Bass und Arpeggio laufen durch
    expect(perStepOsc).toBeLessThan(9);
    expect(perStepNoise).toBeGreaterThanOrEqual(1); // Hi-Hats in Sechzehnteln
    expect(perStepNoise).toBeLessThan(3);
  });

  it('keeps going when a node method throws', () => {
    const { player, timers, ctx } = setup();
    player.start();
    ctx.createOscillator.mockImplementation(() => { throw new Error('broken'); });
    expect(() => run(ctx, timers, 1)).not.toThrow();
  });
});
