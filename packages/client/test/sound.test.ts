import { describe, expect, it, vi } from 'vitest';
import { SoundFx } from '../src/sound';

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
    expect(() => { fx.unlock(); fx.play('sell'); }).not.toThrow();
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
    fx.play('sell'); // andere ID ist nicht betroffen (zwei Noten)
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
    for (const id of ['pickup', 'sell', 'buy', 'stealStart', 'stealSuccess', 'bite', 'knockout', 'policeCheck', 'zoneAnnounced', 'roundEnd', 'tick'] as const) {
      expect(() => fx.play(id)).not.toThrow();
    }
    expect(ctx.createBufferSource).toHaveBeenCalledTimes(1); // nur bite
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

  it('exposes the unlocked context and reports mute changes', () => {
    const ctx = fakeContext();
    const fx = new SoundFx(() => ctx as unknown as AudioContext, () => 0, false);
    expect(fx.getContext()).toBeNull();
    fx.unlock();
    expect(fx.getContext()).toBe(ctx);
    const seen: boolean[] = [];
    fx.onMuteChange = (m) => seen.push(m);
    fx.toggleMute();
    fx.toggleMute();
    expect(seen).toEqual([true, false]);
    fx.onMuteChange = () => { throw new Error('listener'); };
    expect(() => fx.toggleMute()).not.toThrow();
    expect(fx.muted).toBe(true);
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
