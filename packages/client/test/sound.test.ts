import { describe, expect, it, vi } from 'vitest';
import { EVENT_IDS, SYNTH_IDS } from '../src/audioIds';
import { effectSource, PLING_GAP_SEC, PLING_SEMITONES, plingChoice, SoundFx } from '../src/sound';

function fakeContext() {
  const osc = () => ({
    type: 'square',
    frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  });
  const gain = () => ({
    gain: { value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    connect: vi.fn(),
  });
  return {
    state: 'suspended',
    currentTime: 0,
    sampleRate: 8000,
    destination: {},
    resume: vi.fn(() => Promise.resolve()),
    createOscillator: vi.fn(osc),
    createGain: vi.fn(gain),
    createBuffer: vi.fn(() => ({ getChannelData: () => new Float32Array(10) })),
    createBufferSource: vi.fn(() => ({
      buffer: null as unknown,
      loop: false,
      playbackRate: { value: 1 },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    })),
  };
}

describe('SoundFx', () => {
  it('is a silent no-op when no AudioContext is available', () => {
    const fx = new SoundFx(() => null, () => 0, false);
    expect(() => {
      fx.unlock();
      fx.play('pickup');
    }).not.toThrow();
  });

  it('survives a throwing AudioContext constructor', () => {
    const fx = new SoundFx(() => { throw new Error('nope'); }, () => 0, false);
    expect(() => { fx.unlock(); fx.play('pling'); }).not.toThrow();
  });

  it('creates the context only on unlock and resumes it', () => {
    const ctx = fakeContext();
    const create = vi.fn(() => ctx as unknown as AudioContext);
    const fx = new SoundFx(create, () => 0, false);
    fx.play('pickup');
    expect(create).not.toHaveBeenCalled();
    expect(ctx.createOscillator).not.toHaveBeenCalled();
    fx.unlock();
    expect(create).toHaveBeenCalledTimes(1);
    expect(ctx.resume).toHaveBeenCalled();
    fx.unlock();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('rate-limits identical ids to once per 80 ms', () => {
    const ctx = fakeContext();
    let t = 0;
    const fx = new SoundFx(() => ctx as unknown as AudioContext, () => t, false);
    fx.unlock();
    fx.play('pickup');
    t = 50;
    fx.play('pickup');
    expect(ctx.createOscillator).toHaveBeenCalledTimes(1);
    fx.play('pling'); // andere ID ist nicht betroffen (zwei Noten)
    expect(ctx.createOscillator).toHaveBeenCalledTimes(3);
    t = 100;
    fx.play('pickup');
    expect(ctx.createOscillator).toHaveBeenCalledTimes(4);
  });

  it('plays every sound id without throwing, and nothing when muted', () => {
    const ctx = fakeContext();
    const muted = new SoundFx(() => ctx as unknown as AudioContext, () => 0, true);
    muted.unlock();
    muted.play('pickup');
    expect(ctx.createOscillator).not.toHaveBeenCalled();

    let t = 0;
    const fx = new SoundFx(() => ctx as unknown as AudioContext, () => (t += 1000), false);
    fx.unlock();
    for (const id of ['pickup', 'pling', 'buy', 'stealSuccess', 'bite', 'knockout', 'policeCheck', 'zoneAnnounced', 'roundEnd', 'tick', 'countdownGo', 'punch', 'hit', 'spray'] as const) {
      expect(() => fx.play(id)).not.toThrow();
    }
    expect(ctx.createBufferSource).toHaveBeenCalledTimes(3); // bite, punch und spray
  });
  it('uses master gain 0.15 * 0.7 at the default volume', () => {
    const ctx = fakeContext();
    const fx = new SoundFx(() => ctx as unknown as AudioContext, () => 0, false);
    fx.unlock();
    const master = ctx.createGain.mock.results[0].value;
    expect(fx.volume).toBe(70);
    expect(master.gain.value).toBeCloseTo(0.15 * 0.7);
  });

  it('setVolume(0) silences the master gain and play stays harmless', () => {
    const ctx = fakeContext();
    const fx = new SoundFx(() => ctx as unknown as AudioContext, () => 0, false);
    fx.unlock();
    fx.setVolume(0);
    const master = ctx.createGain.mock.results[0].value;
    expect(master.gain.value).toBe(0);
    expect(() => fx.play('pickup')).not.toThrow();
  });

  it('exposes the unlocked context and switches the effects off and on', () => {
    const ctx = fakeContext();
    const fx = new SoundFx(() => ctx as unknown as AudioContext, () => 0, false);
    expect(fx.getContext()).toBeNull();
    fx.unlock();
    expect(fx.getContext()).toBe(ctx);
    const before = ctx.createOscillator.mock.calls.length;
    fx.setMuted(true);
    expect(fx.muted).toBe(true);
    fx.play('pickup');
    expect(ctx.createOscillator.mock.calls.length).toBe(before);
    fx.setMuted(false);
    fx.play('pickup');
    expect(ctx.createOscillator.mock.calls.length).toBeGreaterThan(before);
  });

  it('setVolume before unlock applies after unlock', () => {
    const ctx = fakeContext();
    const fx = new SoundFx(() => ctx as unknown as AudioContext, () => 0, false);
    fx.setVolume(50);
    fx.unlock();
    const master = ctx.createGain.mock.results[0].value;
    expect(master.gain.value).toBeCloseTo(0.15 * 0.5);
  });
});

describe('SoundFx delay and pling', () => {
  type Osc = { start: ReturnType<typeof vi.fn>; frequency: { setValueAtTime: ReturnType<typeof vi.fn> } };
  const oscs = (ctx: ReturnType<typeof fakeContext>): Osc[] =>
    ctx.createOscillator.mock.results.map((r) => r.value as Osc);

  it('schedules a sound delaySec after the current audio time', () => {
    const ctx = fakeContext();
    ctx.currentTime = 2;
    const fx = new SoundFx(() => ctx as unknown as AudioContext, () => 0, false);
    fx.unlock();
    fx.play('pickup', 0.25);
    expect(oscs(ctx)[0].start).toHaveBeenCalledWith(2.25);
  });

  it('plays a burst of four plings from one frame, spaced by the gap', () => {
    expect(PLING_GAP_SEC * 1000).toBeGreaterThanOrEqual(80); // sonst schluckt die Sperre die Folgetöne
    const ctx = fakeContext();
    const fx = new SoundFx(() => ctx as unknown as AudioContext, () => 1000, false);
    fx.unlock();
    for (let k = 0; k < 4; k++) fx.play('pling', k * PLING_GAP_SEC);
    const starts = oscs(ctx).map((o) => o.start.mock.calls[0][0] as number);
    expect(starts).toHaveLength(8); // zwei Noten je Pling
    for (let k = 0; k < 4; k++) expect(starts[2 * k]).toBeCloseTo(k * PLING_GAP_SEC);
  });

  it('raises the pitch of consecutive plings and resets after a pause', () => {
    const ctx = fakeContext();
    let t = 0;
    const fx = new SoundFx(() => ctx as unknown as AudioContext, () => t, false);
    fx.unlock();
    const firstFreq = (i: number): number => oscs(ctx)[2 * i].frequency.setValueAtTime.mock.calls[0][0] as number;
    fx.play('pling');
    t = 150;
    fx.play('pling');
    t = 300;
    fx.play('pling');
    expect(firstFreq(1)).toBeGreaterThan(firstFreq(0));
    expect(firstFreq(2)).toBeGreaterThan(firstFreq(1));
    t = 2000;
    fx.play('pling');
    expect(firstFreq(3)).toBeCloseTo(firstFreq(0));
  });

  it('does not advance the pitch for a swallowed pling', () => {
    const ctx = fakeContext();
    let t = 0;
    const fx = new SoundFx(() => ctx as unknown as AudioContext, () => t, false);
    fx.unlock();
    const firstFreq = (i: number): number => oscs(ctx)[2 * i].frequency.setValueAtTime.mock.calls[0][0] as number;
    fx.play('pling');
    t = 10;
    fx.play('pling'); // innerhalb der Sperre: verschluckt
    t = 150;
    fx.play('pling');
    expect(oscs(ctx)).toHaveLength(4);
    const semitone = firstFreq(1) / firstFreq(0);
    expect(semitone).toBeCloseTo(2 ** (2 / 12)); // genau ein Schritt der Pentatonik höher
  });
});

/** Puffer-Ersatz: nur die genannten IDs haben eine Datei. */
function assets(ids: string[]) {
  const load = vi.fn((_ctx: AudioContext) => Promise.resolve());
  return {
    load,
    buffer: (id: string) => (ids.includes(id) ? ({ id } as unknown as AudioBuffer) : null),
  };
}
type Src = {
  buffer: { id: string } | null;
  loop: boolean;
  playbackRate: { value: number };
  connect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
};
const sources = (ctx: ReturnType<typeof fakeContext>): Src[] => ctx.createBufferSource.mock.results.map((r) => r.value as Src);

describe('effectSource and plingChoice', () => {
  it('file beats synth, new ids without file stay silent', () => {
    for (const id of SYNTH_IDS) {
      expect(effectSource(id, false)).toBe('synth');
      expect(effectSource(id, true)).toBe('file');
    }
    for (const id of EVENT_IDS) {
      expect(effectSource(id, false)).toBe('none');
      expect(effectSource(id, true)).toBe('file');
    }
  });

  it('prefers pling_N, then pling with the semitone ladder as playback rate, else synth', () => {
    expect(plingChoice(0, () => false)).toBeNull();
    expect(plingChoice(3, (id) => id === 'pling')).toEqual({ id: 'pling', rate: 2 ** (7 / 12) });
    const partial = (id: string) => id === 'pling_1' || id === 'pling_4' || id === 'pling';
    expect(plingChoice(0, partial)).toEqual({ id: 'pling_1', rate: 1 });
    expect(plingChoice(3, partial)).toEqual({ id: 'pling_4', rate: 1 });
    expect(plingChoice(1, partial)).toEqual({ id: 'pling', rate: 2 ** (2 / 12) });
    expect(plingChoice(7, (id) => id === 'pling')?.rate).toBeCloseTo(2 ** (PLING_SEMITONES[7] / 12));
    expect(plingChoice(99, (id) => id === 'pling_8')).toEqual({ id: 'pling_8', rate: 1 });
  });
});

describe('SoundFx with files', () => {
  it('starts loading the files on unlock with the new context', () => {
    const ctx = fakeContext();
    const a = assets([]);
    const fx = new SoundFx(() => ctx as unknown as AudioContext, () => 0, false, 70, a);
    expect(a.load).not.toHaveBeenCalled();
    fx.unlock();
    fx.unlock();
    expect(a.load).toHaveBeenCalledTimes(1);
    expect(a.load).toHaveBeenCalledWith(ctx);
  });

  it('plays a present file instead of the synth, through the master gain, with delay', () => {
    const ctx = fakeContext();
    ctx.currentTime = 1;
    const fx = new SoundFx(() => ctx as unknown as AudioContext, () => 0, false, 70, assets(['knockout']));
    fx.unlock();
    fx.play('knockout', 0.5);
    expect(ctx.createOscillator).not.toHaveBeenCalled();
    const [src] = sources(ctx);
    expect(src.buffer).toEqual({ id: 'knockout' });
    expect(src.start).toHaveBeenCalledWith(1.5);
    expect(src.connect).toHaveBeenCalledWith(ctx.createGain.mock.results[0].value);
  });

  it('falls back to the synth for old ids and stays silent for new ids without file', () => {
    const ctx = fakeContext();
    let t = 0;
    const fx = new SoundFx(() => ctx as unknown as AudioContext, () => (t += 1000), false, 70, assets([]));
    fx.unlock();
    fx.play('pickup');
    expect(ctx.createOscillator).toHaveBeenCalledTimes(1);
    fx.play('revive');
    fx.play('ui_move');
    expect(ctx.createOscillator).toHaveBeenCalledTimes(1);
    expect(ctx.createBufferSource).not.toHaveBeenCalled();
  });

  it('plays new ids when their file is there, still rate-limited and muted', () => {
    const ctx = fakeContext();
    let t = 0;
    const fx = new SoundFx(() => ctx as unknown as AudioContext, () => t, false, 70, assets(['revive']));
    fx.unlock();
    fx.play('revive');
    t = 40;
    fx.play('revive');
    expect(ctx.createBufferSource).toHaveBeenCalledTimes(1);
    fx.setMuted(true);
    t = 1000;
    fx.play('revive');
    expect(ctx.createBufferSource).toHaveBeenCalledTimes(1);
  });

  it('pitches a single pling file by playback rate along the ladder', () => {
    const ctx = fakeContext();
    let t = 0;
    const fx = new SoundFx(() => ctx as unknown as AudioContext, () => t, false, 70, assets(['pling']));
    fx.unlock();
    for (let k = 0; k < 3; k++) {
      fx.play('pling');
      t += 150;
    }
    expect(sources(ctx).map((s) => s.playbackRate.value)).toEqual([1, 2 ** (2 / 12), 2 ** (4 / 12)]);
    expect(ctx.createOscillator).not.toHaveBeenCalled();
  });

  it('uses pling_N files at their own pitch', () => {
    const ctx = fakeContext();
    let t = 0;
    const fx = new SoundFx(() => ctx as unknown as AudioContext, () => t, false, 70, assets(['pling_1', 'pling_2']));
    fx.unlock();
    fx.play('pling');
    t = 150;
    fx.play('pling');
    t = 300;
    fx.play('pling'); // Stufe 3 ohne Datei und ohne pling: erzeugter Klang
    expect(sources(ctx).map((s) => [s.buffer?.id, s.playbackRate.value])).toEqual([
      ['pling_1', 1],
      ['pling_2', 1],
    ]);
    expect(ctx.createOscillator).toHaveBeenCalledTimes(2);
  });

  it('survives assets that throw', () => {
    const ctx = fakeContext();
    const bad = {
      buffer: (): AudioBuffer | null => {
        throw new Error('x');
      },
      load: (): Promise<void> => {
        throw new Error('y');
      },
    };
    const fx = new SoundFx(() => ctx as unknown as AudioContext, () => 0, false, 70, bad);
    expect(() => {
      fx.unlock();
      fx.play('pickup');
      fx.startLoop('search');
    }).not.toThrow();
    expect(ctx.createOscillator).toHaveBeenCalledTimes(1);
  });
});

describe('SoundFx loops', () => {
  it('starts a looping source once per key and stops it with a short fade', () => {
    const ctx = fakeContext();
    const fx = new SoundFx(() => ctx as unknown as AudioContext, () => 0, false, 70, assets(['search']));
    fx.unlock();
    fx.startLoop('search', 'search:a');
    fx.startLoop('search', 'search:a');
    expect(ctx.createBufferSource).toHaveBeenCalledTimes(1);
    expect(fx.isLooping('search:a')).toBe(true);
    const [src] = sources(ctx);
    expect(src.loop).toBe(true);
    fx.startLoop('search', 'search:b'); // zweiter Spieler im Splitscreen
    expect(ctx.createBufferSource).toHaveBeenCalledTimes(2);
    fx.stopLoop('search:a');
    fx.stopLoop('search:a');
    expect(src.stop).toHaveBeenCalledTimes(1);
    expect(fx.isLooping('search:a')).toBe(false);
    expect(fx.isLooping('search:b')).toBe(true);
    fx.stopAllLoops();
    expect(fx.isLooping('search:b')).toBe(false);
  });

  it('stays silent without file, before unlock and when muted; muting stops running loops', () => {
    const ctx = fakeContext();
    const none = new SoundFx(() => ctx as unknown as AudioContext, () => 0, false, 70, assets([]));
    none.startLoop('search');
    none.unlock();
    none.startLoop('search');
    expect(none.isLooping('search')).toBe(false);

    const fx = new SoundFx(() => ctx as unknown as AudioContext, () => 0, true, 70, assets(['search']));
    fx.unlock();
    fx.startLoop('search');
    expect(fx.isLooping('search')).toBe(false);
    fx.setMuted(false);
    fx.startLoop('search');
    expect(fx.isLooping('search')).toBe(true);
    fx.setMuted(true);
    expect(fx.isLooping('search')).toBe(false);
    expect(sources(ctx)[0].stop).toHaveBeenCalled();
  });
});

describe('SoundFx gaps', () => {
  it('keeps longer gaps for spammy ids', () => {
    const ctx = fakeContext();
    let t = 0;
    const fx = new SoundFx(() => ctx as unknown as AudioContext, () => t, false, 70, assets(['ui_move', 'dog_bark']));
    fx.unlock();
    expect(fx.hasFile('ui_move')).toBe(true);
    expect(fx.hasFile('chat')).toBe(false);
    fx.play('ui_move');
    t = 85;
    fx.play('ui_move');
    t = 100;
    fx.play('ui_move');
    fx.play('dog_bark');
    t = 2000;
    fx.play('dog_bark');
    expect(sources(ctx).map((s) => s.buffer?.id)).toEqual(['ui_move', 'ui_move', 'dog_bark']);
  });
});
