import { describe, expect, it, vi } from 'vitest';
import { PLING_GAP_SEC, SoundFx } from '../src/sound';

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
    createBufferSource: vi.fn(() => ({ buffer: null, connect: vi.fn(), start: vi.fn(), stop: vi.fn() })),
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
    for (const id of ['pickup', 'pling', 'buy', 'stealSuccess', 'bite', 'knockout', 'policeCheck', 'zoneAnnounced', 'roundEnd', 'tick', 'countdownGo', 'punch', 'hit'] as const) {
      expect(() => fx.play(id)).not.toThrow();
    }
    expect(ctx.createBufferSource).toHaveBeenCalledTimes(2); // bite und punch
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
