import { describe, expect, it } from 'vitest';
import {
  ALL_LAYERS,
  BEAT_FROM,
  BPM_END,
  BPM_START,
  LAYER_GAIN,
  LAYER_POLYPHONY,
  LAYERS,
  MELODY_B_FROM,
  PATTERN_STEPS,
  STEPS_PER_BAR,
  layersFor,
  midiToHz,
  notesAtStep,
  smoothBpm,
  stepDurationSec,
  tempoFor,
} from '../src/music/score';
import type { LayerName } from '../src/music/score';

describe('tempoFor', () => {
  it('runs from 80 to 120 BPM', () => {
    expect(BPM_START).toBe(80);
    expect(BPM_END).toBe(120);
    expect(tempoFor(0)).toBe(80);
    expect(tempoFor(1)).toBe(120);
  });
  it('is monotonic non-decreasing', () => {
    let prev = tempoFor(0);
    for (let i = 1; i <= 1000; i++) {
      const t = tempoFor(i / 1000);
      expect(t).toBeGreaterThanOrEqual(prev);
      prev = t;
    }
  });
  it('rises gently early and steeper late', () => {
    expect(tempoFor(0.5) - tempoFor(0)).toBeLessThan(tempoFor(1) - tempoFor(0.5));
  });
  it('clamps and treats NaN as 0', () => {
    expect(tempoFor(-3)).toBe(80);
    expect(tempoFor(7)).toBe(120);
    expect(tempoFor(NaN)).toBe(80);
    expect(tempoFor(Infinity)).toBe(120);
  });
});

describe('layersFor', () => {
  it('menu: bass, chords and melody A, no beat', () => {
    const l = layersFor(0.9, 'menu');
    expect(l).toEqual({ bass: true, chords: true, melodyA: true, melodyB: false, hat: false, kick: false });
  });
  it('ended: bass and chords only', () => {
    const l = layersFor(1, 'ended');
    expect(l).toEqual({ bass: true, chords: true, melodyA: false, melodyB: false, hat: false, kick: false });
  });
  it('game: beat from the threshold, melody B in the last third', () => {
    expect(BEAT_FROM).toBe(0.45);
    expect(MELODY_B_FROM).toBe(0.66);
    const start = layersFor(0, 'game');
    expect(start).toEqual({ bass: true, chords: true, melodyA: true, melodyB: false, hat: false, kick: false });
    expect(layersFor(0.449, 'game').hat).toBe(false);
    const mid = layersFor(0.45, 'game');
    expect(mid.hat && mid.kick).toBe(true);
    expect(mid.melodyB).toBe(false);
    expect(layersFor(0.659, 'game').melodyB).toBe(false);
    const late = layersFor(0.66, 'game');
    expect(Object.values(late).every(Boolean)).toBe(true);
  });
  it('treats NaN progress as 0', () => {
    expect(layersFor(NaN, 'game')).toEqual(layersFor(0, 'game'));
  });
});

describe('smoothBpm', () => {
  it('limits the change to 6 BPM per second', () => {
    expect(smoothBpm(80, 120, 1)).toBeCloseTo(86);
    expect(smoothBpm(120, 80, 0.5)).toBeCloseTo(117);
  });
  it('does not overshoot', () => {
    expect(smoothBpm(80, 82, 1)).toBe(82);
    expect(smoothBpm(82, 80, 10)).toBe(80);
  });
  it('converges', () => {
    let bpm = 80;
    for (let i = 0; i < 1000; i++) bpm = smoothBpm(bpm, 120, 0.025);
    expect(bpm).toBe(120);
  });
  it('ignores dt <= 0 and NaN', () => {
    expect(smoothBpm(90, 120, 0)).toBe(90);
    expect(smoothBpm(90, 120, -1)).toBe(90);
    expect(smoothBpm(90, 120, NaN)).toBe(90);
    expect(smoothBpm(90, NaN, 1)).toBe(90);
  });
  it('recovers from a broken current value', () => {
    expect(smoothBpm(NaN, 100, 0.1)).toBe(100);
  });
});

describe('stepDurationSec and midiToHz', () => {
  it('sixteenth notes', () => {
    expect(stepDurationSec(120)).toBeCloseTo(0.125);
    expect(stepDurationSec(80)).toBeCloseTo(0.1875);
  });
  it('falls back to the start tempo for nonsense', () => {
    expect(stepDurationSec(0)).toBeCloseTo(stepDurationSec(BPM_START));
    expect(stepDurationSec(NaN)).toBeCloseTo(stepDurationSec(BPM_START));
  });
  it('A4 = 440 Hz', () => {
    expect(midiToHz(69)).toBeCloseTo(440);
    expect(midiToHz(81)).toBeCloseTo(880);
    expect(midiToHz(60)).toBeCloseTo(261.63, 1);
  });
});

const RANGES: Record<Exclude<LayerName, 'hat'>, [number, number]> = {
  bass: [36, 52],
  chords: [52, 72],
  melodyA: [64, 84],
  melodyB: [64, 84],
  kick: [24, 48],
};
const PENTATONIC = new Set([0, 2, 4, 7, 9]);

function only(layer: LayerName) {
  return { bass: false, chords: false, melodyA: false, melodyB: false, hat: false, kick: false, [layer]: true };
}

describe('notesAtStep', () => {
  it('has an 8 bar pattern of 16 steps', () => {
    expect(STEPS_PER_BAR).toBe(16);
    expect(PATTERN_STEPS).toBe(128);
  });
  it('keeps every layer in its range and only returns its own layer', () => {
    for (const layer of LAYERS) {
      let count = 0;
      for (let s = 0; s < PATTERN_STEPS; s++) {
        for (const n of notesAtStep(s, only(layer))) {
          count++;
          expect(n.layer).toBe(layer);
          expect(n.lengthSteps).toBeGreaterThan(0);
          expect(n.velocity).toBeGreaterThan(0);
          expect(n.velocity).toBeLessThanOrEqual(1);
          if (layer === 'hat') {
            expect(n.midi).toBeNull();
          } else {
            const [lo, hi] = RANGES[layer];
            expect(n.midi).not.toBeNull();
            expect(n.midi!).toBeGreaterThanOrEqual(lo);
            expect(n.midi!).toBeLessThanOrEqual(hi);
          }
        }
      }
      expect(count).toBeGreaterThan(0);
    }
  });
  it('melodies use the C major pentatonic scale', () => {
    for (const layer of ['melodyA', 'melodyB'] as const) {
      for (let s = 0; s < PATTERN_STEPS; s++) {
        for (const n of notesAtStep(s, only(layer))) expect(PENTATONIC.has(n.midi! % 12)).toBe(true);
      }
    }
  });
  it('returns nothing for disabled layers and for odd step values', () => {
    const none = { bass: false, chords: false, melodyA: false, melodyB: false, hat: false, kick: false };
    for (let s = 0; s < PATTERN_STEPS; s++) expect(notesAtStep(s, none)).toEqual([]);
    expect(notesAtStep(NaN, ALL_LAYERS)).toEqual([]);
    expect(notesAtStep(1.5, ALL_LAYERS)).toEqual([]);
  });
  it('repeats with the pattern period, also for negative steps', () => {
    for (let s = 0; s < PATTERN_STEPS; s++) {
      expect(notesAtStep(s + PATTERN_STEPS, ALL_LAYERS)).toEqual(notesAtStep(s, ALL_LAYERS));
      expect(notesAtStep(s + 5 * PATTERN_STEPS, ALL_LAYERS)).toEqual(notesAtStep(s, ALL_LAYERS));
    }
    expect(notesAtStep(-1, ALL_LAYERS)).toEqual(notesAtStep(PATTERN_STEPS - 1, ALL_LAYERS));
  });
  it('the two 4-bar phrases differ', () => {
    const half = PATTERN_STEPS / 2;
    let differs = false;
    for (let s = 0; s < half; s++) {
      if (JSON.stringify(notesAtStep(s, ALL_LAYERS)) !== JSON.stringify(notesAtStep(s + half, ALL_LAYERS))) differs = true;
    }
    expect(differs).toBe(true);
  });
  it('monophonic voices never overlap', () => {
    for (const layer of ['bass', 'melodyA', 'melodyB'] as const) {
      let busyUntil = 0;
      for (let s = 0; s < PATTERN_STEPS; s++) {
        const ns = notesAtStep(s, only(layer));
        expect(ns.length).toBeLessThanOrEqual(1);
        if (ns.length === 0) continue;
        expect(s).toBeGreaterThanOrEqual(busyUntil);
        busyUntil = s + ns[0].lengthSteps;
      }
      expect(busyUntil).toBeLessThanOrEqual(PATTERN_STEPS);
    }
  });
  it('chords are long and start on the bar', () => {
    for (let s = 0; s < PATTERN_STEPS; s++) {
      const ns = notesAtStep(s, only('chords'));
      if (s % STEPS_PER_BAR === 0) expect(ns.length).toBe(3);
      else expect(ns).toEqual([]);
      for (const n of ns) expect(n.lengthSteps).toBeGreaterThanOrEqual(8);
    }
  });
  it('the hi-hat plays on offbeat eighths', () => {
    for (let s = 0; s < PATTERN_STEPS; s++) {
      const ns = notesAtStep(s, only('hat'));
      if (s % 4 === 2) expect(ns.length).toBe(1);
      else if (ns.length > 0) expect(s % STEPS_PER_BAR).toBe(15); // kleiner Auftakt am Phrasenende
    }
  });
  it('polyphony table matches the pattern', () => {
    for (const layer of LAYERS) {
      let max = 0;
      for (let s = 0; s < PATTERN_STEPS; s++) max = Math.max(max, notesAtStep(s, only(layer)).length);
      expect(max).toBeLessThanOrEqual(LAYER_POLYPHONY[layer]);
    }
  });
});

describe('levels', () => {
  it('the loudest possible sum stays at or below full scale (twice the chords for release tails)', () => {
    let sum = 0;
    for (const layer of LAYERS) {
      const voices = LAYER_POLYPHONY[layer] * (layer === 'chords' ? 2 : 1);
      sum += LAYER_GAIN[layer] * voices;
    }
    expect(sum).toBeLessThanOrEqual(1);
  });
});
