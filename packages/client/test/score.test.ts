import { describe, expect, it } from 'vitest';
import {
  ALL_LAYERS,
  ARP_FROM,
  BARS,
  BASS_SUB_MIX,
  BPM_END,
  BPM_ENDED,
  BPM_MENU,
  BPM_START,
  HAT16_FROM,
  LAYER_GAIN,
  LAYER_POLYPHONY,
  LAYERS,
  LEAD2_FROM,
  MAX_BPM_CHANGE_PER_SEC,
  MENU_BASS_LEVEL,
  PATTERN_STEPS,
  PHRASE_BARS,
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
  it('runs from 125 to 165 BPM', () => {
    expect(BPM_START).toBe(125);
    expect(BPM_END).toBe(165);
    expect(tempoFor(0)).toBe(125);
    expect(tempoFor(1)).toBe(165);
  });
  it('menu and ended play at 125 BPM', () => {
    expect(BPM_MENU).toBe(125);
    expect(BPM_ENDED).toBe(125);
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
    expect(tempoFor(-3)).toBe(125);
    expect(tempoFor(7)).toBe(165);
    expect(tempoFor(NaN)).toBe(125);
    expect(tempoFor(Infinity)).toBe(165);
  });
});

const NONE: LayerSet = {
  guitar: false,
  bass: false,
  chords: false,
  lead: false,
  lead2: false,
  arp: false,
  kick: false,
  snare: false,
  fill: false,
  crash: false,
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
  it('menu: quiet bass, chords and lead, no guitar and no drums', () => {
    expect(on(layersFor(0.9, 'menu'))).toEqual(['bass', 'chords', 'lead']);
  });
  it('ended: bass and chords only, no drums', () => {
    expect(on(layersFor(1, 'ended'))).toEqual(['bass', 'chords']);
  });
  it('game: the full punk band from the start', () => {
    expect(on(layersFor(0, 'game'))).toEqual(['guitar', 'bass', 'chords', 'lead', 'kick', 'snare', 'fill', 'crash', 'hat']);
  });
  it('game: the thresholds add arp, sixteenth hats and the second lead', () => {
    expect(ARP_FROM).toBe(0.45);
    expect(HAT16_FROM).toBe(0.5);
    expect(LEAD2_FROM).toBe(0.66);
    expect(layersFor(0.449, 'game').arp).toBe(false);
    expect(layersFor(0.45, 'game').arp).toBe(true);
    expect(layersFor(0.499, 'game').hat16).toBe(false);
    const mid = layersFor(0.5, 'game');
    expect(mid.arp && mid.hat16).toBe(true);
    expect(mid.lead2).toBe(false);
    expect(layersFor(0.659, 'game').lead2).toBe(false);
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
  it('limits the change to 8 BPM per second', () => {
    expect(MAX_BPM_CHANGE_PER_SEC).toBe(8);
    expect(smoothBpm(80, 120, 1)).toBeCloseTo(88);
    expect(smoothBpm(120, 80, 0.5)).toBeCloseTo(116);
  });
  it('does not overshoot', () => {
    expect(smoothBpm(80, 82, 1)).toBe(82);
    expect(smoothBpm(82, 80, 10)).toBe(80);
  });
  it('converges', () => {
    let bpm = 125;
    for (let i = 0; i < 1000; i++) bpm = smoothBpm(bpm, 165, 0.025);
    expect(bpm).toBe(165);
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

const DRUMS: readonly LayerName[] = ['kick', 'snare', 'fill', 'crash', 'hat', 'hat16'];
const RANGES: Partial<Record<LayerName, [number, number]>> = {
  guitar: [50, 66],
  bass: [38, 59],
  chords: [60, 76],
  lead: [69, 88],
  lead2: [81, 100],
  arp: [60, 84],
};
/** Tonarten-Tonleitern als Tonklassen. */
const D_MAJOR = new Set([2, 4, 6, 7, 9, 11, 1]); // D E F# G A H C#
const D_PENTATONIC = new Set([2, 4, 6, 9, 11]); // D E F# A H

/** Schritte (0 bis PATTERN_STEPS-1), auf denen die Stimme einsetzt. */
function onsets(layer: LayerName): number[] {
  const out: number[] = [];
  for (let s = 0; s < PATTERN_STEPS; s++) if (notesAtStep(s, only(layer)).length > 0) out.push(s);
  return out;
}

function stepInBar(s: number): number {
  return s % STEPS_PER_BAR;
}

function barOf(s: number): number {
  return Math.floor(s / STEPS_PER_BAR);
}

describe('notesAtStep', () => {
  it('has an 8 bar pattern of 16 steps in two 4-bar phrases', () => {
    expect(STEPS_PER_BAR).toBe(16);
    expect(BARS).toBe(8);
    expect(PHRASE_BARS).toBe(4);
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
  it('all pitched layers stay in D major', () => {
    for (const layer of LAYERS) {
      if (DRUMS.includes(layer)) continue;
      for (let s = 0; s < PATTERN_STEPS; s++) {
        for (const n of notesAtStep(s, only(layer))) expect(D_MAJOR.has(n.midi! % 12)).toBe(true);
      }
    }
  });
  it('both leads use the D major pentatonic scale', () => {
    for (const layer of ['lead', 'lead2'] as const) {
      for (let s = 0; s < PATTERN_STEPS; s++) {
        for (const n of notesAtStep(s, only(layer))) expect(D_PENTATONIC.has(n.midi! % 12)).toBe(true);
      }
    }
  });
  it('the lead moves in eighths and sixteenths and its second phrase varies the first', () => {
    const lead = onsets('lead');
    expect(lead.some((s) => s % 2 === 1)).toBe(true);
    for (const s of lead) expect(notesAtStep(s, only('lead'))[0].lengthSteps).toBeLessThanOrEqual(4);
    const half = PATTERN_STEPS / 2;
    let same = 0;
    let differs = false;
    for (let s = 0; s < half; s++) {
      const a = JSON.stringify(notesAtStep(s, only('lead')));
      const b = JSON.stringify(notesAtStep(s + half, only('lead')));
      if (a !== b) differs = true;
      else if (a !== '[]') same++;
    }
    expect(differs).toBe(true);
    expect(same).toBeGreaterThan(4); // der Hook kehrt wieder
  });
  it('the second lead doubles the hook an octave higher', () => {
    for (let s = 0; s < PATTERN_STEPS; s++) {
      const a = notesAtStep(s, only('lead'));
      const b = notesAtStep(s, only('lead2'));
      expect(b.length).toBe(a.length);
      if (a.length) expect(b[0].midi).toBe(a[0].midi! + 12);
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
  it('only repeats after the full 8 bars', () => {
    const all = (s: number) => JSON.stringify(notesAtStep(s, ALL_LAYERS));
    for (const period of [STEPS_PER_BAR, 2 * STEPS_PER_BAR, 4 * STEPS_PER_BAR]) {
      let differs = false;
      for (let s = 0; s < PATTERN_STEPS; s++) if (all(s) !== all(s + period)) differs = true;
      expect(differs).toBe(true);
    }
  });
  it('monophonic voices never overlap', () => {
    for (const layer of ['bass', 'lead', 'lead2', 'arp'] as const) {
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

describe('guitar', () => {
  it('plays power chords (root plus fifth) on every eighth, accented on the off-beats', () => {
    const at = onsets('guitar');
    expect(at[0]).toBe(0);
    for (const s of at) {
      expect(s % 2).toBe(0);
      const ns = notesAtStep(s, only('guitar'));
      expect(ns.length).toBe(2);
      expect(ns[1].midi! - ns[0].midi!).toBe(7);
      if (stepInBar(s) % 4 === 2) expect(ns[0].velocity).toBeGreaterThan(notesAtStep(s - 2, only('guitar'))[0].velocity);
    }
    // jede Achtel bis auf den ausklingenden Schluss jeder Phrase
    expect(at.length).toBeGreaterThanOrEqual(PATTERN_STEPS / 2 - 2 * BARS / PHRASE_BARS);
  });
  it('the eighths are palm-muted (one step), only the phrase end rings', () => {
    for (const s of onsets('guitar')) {
      const len = notesAtStep(s, only('guitar'))[0].lengthSteps;
      if (len > 1) expect(barOf(s) % PHRASE_BARS).toBe(PHRASE_BARS - 1);
      expect(s + len).toBeLessThanOrEqual(PATTERN_STEPS);
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
  it('pushes with sixteenths only at the end of each phrase', () => {
    const odd = onsets('bass').filter((s) => s % 2 === 1);
    expect(odd.length).toBeGreaterThan(0);
    for (const s of odd) expect(barOf(s) % PHRASE_BARS).toBe(PHRASE_BARS - 1);
  });
  it('roots sit low (D2 to H2)', () => {
    for (let bar = 0; bar < BARS; bar++) {
      const first = notesAtStep(bar * STEPS_PER_BAR, only('bass'))[0];
      expect(first.midi!).toBeGreaterThanOrEqual(38);
      expect(first.midi!).toBeLessThanOrEqual(50);
    }
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
  it('the kick plays four on the floor: on every beat and only there', () => {
    for (let s = 0; s < PATTERN_STEPS; s++) expect(notesAtStep(s, only('kick')).length).toBe(s % 4 === 0 ? 1 : 0);
  });
  it('the open hat plays on every off-beat and only there', () => {
    for (let s = 0; s < PATTERN_STEPS; s++) expect(notesAtStep(s, only('hat')).length).toBe(s % 4 === 2 ? 1 : 0);
  });
  it('the closed hats fill the remaining sixteenths', () => {
    for (let s = 0; s < PATTERN_STEPS; s++) expect(notesAtStep(s, only('hat16')).length).toBe(s % 4 === 2 ? 0 : 1);
  });
  it('the snare plays on beats 2 and 4 of every bar, nowhere else', () => {
    for (let s = 0; s < PATTERN_STEPS; s++) {
      const beat = stepInBar(s);
      expect(notesAtStep(s, only('snare')).length).toBe(beat === 4 || beat === 12 ? 1 : 0);
    }
  });
  it('a sixteenth snare fill rolls into the end of every phrase', () => {
    for (let bar = 0; bar < BARS; bar++) {
      const steps = onsets('fill').filter((s) => barOf(s) === bar).map(stepInBar);
      if (bar % PHRASE_BARS !== PHRASE_BARS - 1) {
        expect(steps).toEqual([]);
        continue;
      }
      expect(steps.length).toBeGreaterThanOrEqual(6);
      expect(steps.at(-1)).toBe(15);
      // lückenlose Sechzehntel zusammen mit der Snare
      const roll = new Set([...steps, 12]);
      for (let s = steps[0]; s < STEPS_PER_BAR; s++) expect(roll.has(s)).toBe(true);
      // wird lauter
      const vel = steps.map((s) => notesAtStep(bar * STEPS_PER_BAR + s, only('fill'))[0].velocity);
      for (let i = 1; i < vel.length; i++) expect(vel[i]).toBeGreaterThan(vel[i - 1]);
    }
  });
  it('the crash hits only at the start of the 8-bar cycle', () => {
    expect(onsets('crash')).toEqual([0]);
  });
  it('the arpeggio runs in sixteenths', () => {
    expect(onsets('arp').length).toBe(PATTERN_STEPS);
  });
});

/** Stimmen, die nie auf demselben Schritt einsetzen, teilen sich ein Budget. */
const SHARED: [LayerName, LayerName][] = [
  ['snare', 'fill'],
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
