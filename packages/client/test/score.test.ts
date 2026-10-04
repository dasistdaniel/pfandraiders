import { describe, expect, it } from 'vitest';
import {
  ALL_LAYERS,
  ARP_FROM,
  BASS_SUB_MIX,
  BPM_END,
  BPM_ENDED,
  BPM_MENU,
  BPM_START,
  HAT16_FROM,
  KICK_SYNC_FROM,
  LAYER_GAIN,
  LAYER_POLYPHONY,
  LAYERS,
  MELODY_B_FROM,
  MENU_BASS_LEVEL,
  PATTERN_STEPS,
  SNARE_FROM,
  STEPS_PER_BAR,
  layerGain,
  layersFor,
  midiToHz,
  notesAtStep,
  smoothBpm,
  stepDurationSec,
  subOctaveMidi,
  tempoFor,
} from '../src/music/score';
import type { LayerName, LayerSet } from '../src/music/score';

describe('tempoFor', () => {
  it('runs from 90 to 132 BPM', () => {
    expect(BPM_START).toBe(90);
    expect(BPM_END).toBe(132);
    expect(tempoFor(0)).toBe(90);
    expect(tempoFor(1)).toBe(132);
  });
  it('menu and ended stay calm at 90 BPM', () => {
    expect(BPM_MENU).toBe(90);
    expect(BPM_ENDED).toBe(90);
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
    expect(tempoFor(-3)).toBe(90);
    expect(tempoFor(7)).toBe(132);
    expect(tempoFor(NaN)).toBe(90);
    expect(tempoFor(Infinity)).toBe(132);
  });
});

const NONE: LayerSet = {
  bass: false,
  chords: false,
  melodyA: false,
  melodyB: false,
  arp: false,
  kick: false,
  kickSync: false,
  snare: false,
  hat: false,
  hat16: false,
};

function only(layer: LayerName): LayerSet {
  return { ...NONE, [layer]: true };
}

function on(set: LayerSet): LayerName[] {
  return LAYERS.filter((l) => set[l]);
}

describe('layersFor', () => {
  it('menu: quiet bass, chords and melody A, no drums', () => {
    expect(on(layersFor(0.9, 'menu'))).toEqual(['bass', 'chords', 'melodyA']);
  });
  it('ended: bass and chords only, no drums', () => {
    expect(on(layersFor(1, 'ended'))).toEqual(['bass', 'chords']);
  });
  it('game: kick, eighth hats and bass from the start', () => {
    expect(on(layersFor(0, 'game'))).toEqual(['bass', 'chords', 'melodyA', 'kick', 'hat']);
  });
  it('game: the thresholds add snare, syncopated kicks, arp, sixteenth hats and melody B', () => {
    expect(SNARE_FROM).toBe(0.3);
    expect(KICK_SYNC_FROM).toBe(0.45);
    expect(ARP_FROM).toBe(0.45);
    expect(HAT16_FROM).toBe(0.66);
    expect(MELODY_B_FROM).toBe(0.66);
    expect(layersFor(0.299, 'game').snare).toBe(false);
    expect(layersFor(0.3, 'game').snare).toBe(true);
    expect(layersFor(0.449, 'game').kickSync).toBe(false);
    expect(layersFor(0.449, 'game').arp).toBe(false);
    const mid = layersFor(0.45, 'game');
    expect(mid.kickSync && mid.arp && mid.snare).toBe(true);
    expect(mid.hat16 || mid.melodyB).toBe(false);
    expect(layersFor(0.659, 'game').hat16).toBe(false);
    const late = layersFor(0.66, 'game');
    expect(Object.values(late).every(Boolean)).toBe(true);
  });
  it('treats NaN progress as 0', () => {
    expect(layersFor(NaN, 'game')).toEqual(layersFor(0, 'game'));
  });
});

describe('layerGain', () => {
  it('the bass is quieter in the menu, everything else unchanged', () => {
    expect(MENU_BASS_LEVEL).toBeGreaterThan(0);
    expect(MENU_BASS_LEVEL).toBeLessThan(1);
    expect(layerGain('bass', 'menu')).toBeCloseTo(LAYER_GAIN.bass * MENU_BASS_LEVEL);
    expect(layerGain('bass', 'game')).toBe(LAYER_GAIN.bass);
    expect(layerGain('chords', 'menu')).toBe(LAYER_GAIN.chords);
  });
});

describe('subOctaveMidi', () => {
  it('drops an octave unless that falls below the audible floor', () => {
    expect(subOctaveMidi(45)).toBe(33);
    expect(subOctaveMidi(33)).toBe(21);
    expect(subOctaveMidi(29)).toBe(29); // 22 Hz wären nur Rumpeln
    for (let m = 28; m <= 45; m++) expect(midiToHz(subOctaveMidi(m))).toBeGreaterThanOrEqual(27);
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
    let bpm = 90;
    for (let i = 0; i < 1000; i++) bpm = smoothBpm(bpm, 132, 0.025);
    expect(bpm).toBe(132);
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

const DRUMS: readonly LayerName[] = ['kick', 'kickSync', 'snare', 'hat', 'hat16'];
const RANGES: Partial<Record<LayerName, [number, number]>> = {
  bass: [28, 45],
  chords: [52, 72],
  melodyA: [64, 84],
  melodyB: [64, 84],
  arp: [55, 76],
};
const PENTATONIC = new Set([0, 2, 4, 7, 9]); // A-Moll-Pentatonik: A C D E G

/** Schritte (0 bis PATTERN_STEPS-1), auf denen die Stimme einsetzt. */
function onsets(layer: LayerName): number[] {
  const out: number[] = [];
  for (let s = 0; s < PATTERN_STEPS; s++) if (notesAtStep(s, only(layer)).length > 0) out.push(s);
  return out;
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
          if (DRUMS.includes(layer)) {
            expect(n.midi).toBeNull();
          } else {
            const [lo, hi] = RANGES[layer]!;
            expect(n.midi).not.toBeNull();
            expect(n.midi!).toBeGreaterThanOrEqual(lo);
            expect(n.midi!).toBeLessThanOrEqual(hi);
          }
        }
      }
      expect(count).toBeGreaterThan(0);
    }
  });
  it('melodies use the A minor pentatonic scale', () => {
    for (const layer of ['melodyA', 'melodyB'] as const) {
      for (let s = 0; s < PATTERN_STEPS; s++) {
        for (const n of notesAtStep(s, only(layer))) expect(PENTATONIC.has(n.midi! % 12)).toBe(true);
      }
    }
  });
  it('returns nothing for disabled layers and for odd step values', () => {
    for (let s = 0; s < PATTERN_STEPS; s++) expect(notesAtStep(s, NONE)).toEqual([]);
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
    for (const layer of ['bass', 'melodyA', 'melodyB', 'arp'] as const) {
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
  it('polyphony table matches the pattern', () => {
    for (const layer of LAYERS) {
      let max = 0;
      for (let s = 0; s < PATTERN_STEPS; s++) max = Math.max(max, notesAtStep(s, only(layer)).length);
      expect(max).toBeLessThanOrEqual(LAYER_POLYPHONY[layer]);
    }
  });
});

describe('bass line', () => {
  it('drives in eighths: never more than an eighth between two notes, short notes', () => {
    const at = onsets('bass');
    expect(at[0]).toBe(0);
    for (let i = 1; i < at.length; i++) expect(at[i] - at[i - 1]).toBeLessThanOrEqual(2);
    expect(PATTERN_STEPS - at.at(-1)!).toBeLessThanOrEqual(2);
    for (const s of at) expect(notesAtStep(s, only('bass'))[0].lengthSteps).toBeLessThanOrEqual(2);
  });
  it('is syncopated: some notes start between the eighths', () => {
    expect(onsets('bass').some((s) => s % 2 === 1)).toBe(true);
  });
  it('jumps octaves', () => {
    const midis = onsets('bass').map((s) => notesAtStep(s, only('bass'))[0].midi!);
    let jumps = 0;
    for (let i = 1; i < midis.length; i++) if (Math.abs(midis[i] - midis[i - 1]) === 12) jumps++;
    expect(jumps).toBeGreaterThan(4);
  });
  it('only repeats after the full 8 bars', () => {
    const bass = (s: number) => JSON.stringify(notesAtStep(s, only('bass')));
    for (const period of [STEPS_PER_BAR, 2 * STEPS_PER_BAR, 4 * STEPS_PER_BAR]) {
      let differs = false;
      for (let s = 0; s < PATTERN_STEPS; s++) if (bass(s) !== bass(s + period)) differs = true;
      expect(differs).toBe(true);
    }
  });
});

describe('drums', () => {
  it('the kick plays on every beat and only there', () => {
    for (let s = 0; s < PATTERN_STEPS; s++) expect(notesAtStep(s, only('kick')).length).toBe(s % 4 === 0 ? 1 : 0);
  });
  it('the syncopated kicks fall between the beats', () => {
    const at = onsets('kickSync');
    expect(at.length).toBeGreaterThanOrEqual(8);
    for (const s of at) expect(s % 4).not.toBe(0);
  });
  it('the snare plays on beats 2 and 4 of every bar, nowhere else', () => {
    for (let s = 0; s < PATTERN_STEPS; s++) {
      const beat = s % STEPS_PER_BAR;
      expect(notesAtStep(s, only('snare')).length).toBe(beat === 4 || beat === 12 ? 1 : 0);
    }
  });
  it('hats: eighths, plus the sixteenths in between', () => {
    for (let s = 0; s < PATTERN_STEPS; s++) {
      expect(notesAtStep(s, only('hat')).length).toBe(s % 2 === 0 ? 1 : 0);
      expect(notesAtStep(s, only('hat16')).length).toBe(s % 2 === 1 ? 1 : 0);
    }
  });
  it('the arpeggio runs in sixteenths', () => {
    expect(onsets('arp').length).toBe(PATTERN_STEPS);
  });
});

/** Stimmen, die nie auf demselben Schritt einsetzen, teilen sich ein Budget. */
const SHARED: [LayerName, LayerName][] = [
  ['kick', 'kickSync'],
  ['hat', 'hat16'],
];

describe('levels', () => {
  it('layers sharing a budget never start on the same step', () => {
    for (const [a, b] of SHARED) {
      const bs = new Set(onsets(b));
      for (const s of onsets(a)) expect(bs.has(s)).toBe(false);
    }
  });
  it('the loudest possible sum stays at or below full scale (twice the chords for release tails)', () => {
    expect(BASS_SUB_MIX).toBeGreaterThan(0);
    expect(BASS_SUB_MIX).toBeLessThan(1);
    let sum = 0;
    for (const layer of LAYERS) {
      const shared = SHARED.find(([, b]) => b === layer);
      if (shared) continue; // zählt beim Partner mit
      const partner = SHARED.find(([a]) => a === layer);
      const gain = partner ? Math.max(LAYER_GAIN[layer], LAYER_GAIN[partner[1]]) : LAYER_GAIN[layer];
      const voices = LAYER_POLYPHONY[layer] * (layer === 'chords' ? 2 : 1);
      sum += gain * voices;
    }
    expect(sum).toBeLessThanOrEqual(1);
  });
});
