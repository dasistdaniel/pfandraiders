/**
 * Die Partitur der Hintergrundmusik: reine Daten und Rechenregeln, ohne Phaser und ohne WebAudio.
 * Ein Chiptune im Lofi-Stil in C-Dur (Akkorde C Am F G | Am F C G), 8 Takte zu je 16 Sechzehnteln.
 */

// ---- Stellschrauben (alles, was man nach Gehör nachjustieren möchte) ----

/** Tempo zu Rundenbeginn und kurz vor Schluss (Schläge pro Minute). */
export const BPM_START = 80;
export const BPM_END = 120;
/** Tempo im Hauptmenü und nach Rundenende. */
export const BPM_MENU = 80;
export const BPM_ENDED = 80;
/** Exponent der Tempokurve: > 1 heißt anfangs sanft, gegen Ende steiler. */
export const TEMPO_CURVE = 1.6;
/** Höchste Tempoänderung pro Sekunde, damit Wechsel gleiten statt springen. */
export const MAX_BPM_CHANGE_PER_SEC = 6;
/** Rundenfortschritt (0 bis 1), ab dem die Stimmen im Spiel einsetzen. */
export const MELODY_A_FROM = 0;
export const BEAT_FROM = 0.45;
export const MELODY_B_FROM = 0.66;
/** Lautstärke der Musik am Regler 100 % (Summe aller Stimmen an der Spitze). */
export const MUSIC_MAX_GAIN = 0.08;
/** Anteil der Musiklautstärke nach Rundenende, damit die Fanfare gut hörbar bleibt. */
export const ENDED_LEVEL = 0.3;
/** Zeitkonstante der Ein- und Ausblendungen in Sekunden (nach etwa 3 Konstanten ist die Blende fertig). */
export const FADE_TIME_CONSTANT = 0.27;
/** Warmer Tiefpass über Bass, Akkorden und Melodien. */
export const LOWPASS_HZ = 2400;
/** Vibrato der Melodiestimmen. */
export const VIBRATO_HZ = 5;
export const VIBRATO_CENTS = 7;

// ---- Grundlagen ----

export const STEPS_PER_BAR = 16;
export const BARS = 8;
export const PATTERN_STEPS = STEPS_PER_BAR * BARS;

export type LayerName = 'bass' | 'chords' | 'melodyA' | 'melodyB' | 'hat' | 'kick';
export const LAYERS: readonly LayerName[] = ['bass', 'chords', 'melodyA', 'melodyB', 'hat', 'kick'];
export type LayerSet = Record<LayerName, boolean>;
export type MusicMode = 'menu' | 'game' | 'ended';

export const ALL_LAYERS: LayerSet = { bass: true, chords: true, melodyA: true, melodyB: true, hat: true, kick: true };

/** Anteil jeder Stimme an MUSIC_MAX_GAIN, pro Note bei Velocity 1. */
export const LAYER_GAIN: Record<LayerName, number> = {
  bass: 0.2,
  chords: 0.065,
  melodyA: 0.14,
  melodyB: 0.1,
  hat: 0.05,
  kick: 0.09,
};
/** Höchstzahl gleichzeitiger Noten je Stimme laut Partitur. */
export const LAYER_POLYPHONY: Record<LayerName, number> = { bass: 1, chords: 3, melodyA: 1, melodyB: 1, hat: 1, kick: 1 };

export interface NoteEvent {
  layer: LayerName;
  /** MIDI-Notennummer, null = Rauschen (Hi-Hat) */
  midi: number | null;
  lengthSteps: number;
  /** 0 bis 1 */
  velocity: number;
}

function clamp01(p: number): number {
  if (Number.isNaN(p)) return 0;
  return Math.min(1, Math.max(0, p));
}

export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Tempo zum Rundenfortschritt (0 bis 1): monoton steigend von BPM_START bis BPM_END. */
export function tempoFor(progress: number): number {
  const p = clamp01(progress);
  return BPM_START + (BPM_END - BPM_START) * Math.pow(p, TEMPO_CURVE);
}

/** Welche Stimmen spielen: im Menü ruhig, im Spiel immer dichter, nach Rundenende nur Bass und Akkorde. */
export function layersFor(progress: number, mode: MusicMode): LayerSet {
  const p = clamp01(progress);
  if (mode === 'menu') return { bass: true, chords: true, melodyA: true, melodyB: false, hat: false, kick: false };
  if (mode === 'ended') return { bass: true, chords: true, melodyA: false, melodyB: false, hat: false, kick: false };
  const beat = p >= BEAT_FROM;
  return { bass: true, chords: true, melodyA: p >= MELODY_A_FROM, melodyB: p >= MELODY_B_FROM, hat: beat, kick: beat };
}

/** Nähert das Tempo dem Ziel mit höchstens MAX_BPM_CHANGE_PER_SEC an, ohne Überschwingen. */
export function smoothBpm(current: number, target: number, dtSec: number, maxPerSec = MAX_BPM_CHANGE_PER_SEC): number {
  if (!Number.isFinite(target)) return current;
  if (!Number.isFinite(current)) return target;
  if (!(dtSec > 0)) return current;
  const maxStep = maxPerSec * dtSec;
  const diff = target - current;
  if (Math.abs(diff) <= maxStep) return target;
  return current + Math.sign(diff) * maxStep;
}

/** Dauer eines Sechzehntels in Sekunden. */
export function stepDurationSec(bpm: number): number {
  const b = Number.isFinite(bpm) && bpm > 0 ? bpm : BPM_START;
  return 60 / b / 4;
}

// ---- Partitur ----

/** [Schritt im Takt, MIDI, Länge in Schritten, Velocity] */
type Cell = [number, number, number, number];

interface Chord {
  voicing: [number, number, number];
  root: number;
  fifth: number;
}
const C: Chord = { voicing: [60, 64, 67], root: 48, fifth: 43 };
const C2: Chord = { voicing: [55, 60, 64], root: 48, fifth: 43 };
const AM: Chord = { voicing: [57, 60, 64], root: 45, fifth: 40 };
const F: Chord = { voicing: [57, 60, 65], root: 41, fifth: 36 };
const G: Chord = { voicing: [55, 59, 62], root: 43, fifth: 38 };
const PROGRESSION: Chord[] = [C, AM, F, G, AM, F, C2, G];

function bassBar(bar: number, ch: Chord): Cell[] {
  switch (bar) {
    case 1:
    case 5:
      return [[0, ch.root, 8, 0.9], [12, ch.fifth, 3, 0.7]];
    case 3:
      return [[0, ch.root, 6, 0.9], [8, ch.fifth, 4, 0.7], [14, ch.root, 2, 0.6]];
    case 7:
      return [[0, ch.root, 6, 0.9], [10, ch.fifth, 2, 0.7], [12, ch.root, 4, 0.7]];
    default:
      return [[0, ch.root, 6, 0.9], [10, ch.fifth, 4, 0.7]];
  }
}

const MELODY_A: Cell[][] = [
  [[0, 72, 4, 0.9], [4, 76, 2, 0.75], [6, 79, 4, 0.8], [12, 76, 4, 0.75]],
  [[0, 76, 6, 0.85], [8, 72, 2, 0.7], [10, 69, 6, 0.75]],
  [[0, 72, 3, 0.85], [4, 69, 2, 0.7], [6, 72, 2, 0.7], [8, 74, 4, 0.8], [12, 72, 4, 0.75]],
  [[0, 74, 8, 0.85], [10, 67, 6, 0.75]],
  [[0, 76, 4, 0.9], [4, 79, 2, 0.75], [6, 81, 4, 0.8], [12, 79, 4, 0.75]],
  [[0, 81, 6, 0.85], [8, 79, 2, 0.7], [10, 76, 6, 0.75]],
  [[0, 72, 3, 0.85], [4, 76, 2, 0.7], [6, 79, 2, 0.7], [8, 76, 4, 0.8], [12, 74, 4, 0.75]],
  [[0, 79, 4, 0.85], [4, 76, 4, 0.75], [8, 74, 8, 0.8]],
];

const MELODY_B: Cell[][] = [
  [[2, 67, 2, 0.7], [10, 72, 2, 0.7]],
  [[2, 69, 2, 0.7], [10, 72, 2, 0.7]],
  [[2, 69, 2, 0.7], [10, 72, 2, 0.7]],
  [[2, 67, 2, 0.7], [10, 74, 2, 0.7]],
  [[2, 72, 2, 0.7], [6, 69, 2, 0.6], [10, 76, 2, 0.7]],
  [[2, 72, 2, 0.7], [10, 69, 2, 0.6], [14, 72, 2, 0.6]],
  [[2, 76, 2, 0.7], [10, 79, 2, 0.7]],
  [[2, 74, 2, 0.7], [6, 79, 2, 0.6], [10, 74, 4, 0.7]],
];

const KICK_MIDI = 36;

function buildPattern(): NoteEvent[][] {
  const steps: NoteEvent[][] = Array.from({ length: PATTERN_STEPS }, () => []);
  const put = (bar: number, layer: LayerName, [step, midi, len, vel]: Cell): void => {
    steps[bar * STEPS_PER_BAR + step].push({ layer, midi, lengthSteps: len, velocity: vel });
  };
  for (let bar = 0; bar < BARS; bar++) {
    const ch = PROGRESSION[bar];
    const phraseEnd = bar % 4 === 3;
    for (const cell of bassBar(bar, ch)) put(bar, 'bass', cell);
    for (const midi of ch.voicing) put(bar, 'chords', [0, midi, STEPS_PER_BAR, 0.8]);
    for (const cell of MELODY_A[bar]) put(bar, 'melodyA', cell);
    for (const cell of MELODY_B[bar]) put(bar, 'melodyB', cell);
    const kicks: Cell[] = [[0, KICK_MIDI, 2, 0.9], [8, KICK_MIDI, 2, 0.7]];
    if (phraseEnd) kicks.push([11, KICK_MIDI, 2, 0.6]);
    for (const cell of kicks) put(bar, 'kick', cell);
    for (const s of [2, 6, 10, 14]) {
      steps[bar * STEPS_PER_BAR + s].push({ layer: 'hat', midi: null, lengthSteps: 1, velocity: s % 8 === 2 ? 0.6 : 0.45 });
    }
    if (phraseEnd) steps[bar * STEPS_PER_BAR + 15].push({ layer: 'hat', midi: null, lengthSteps: 1, velocity: 0.35 });
  }
  return steps;
}

const PATTERN: readonly NoteEvent[][] = buildPattern();

/** Noten, die auf diesem (fortlaufenden) Sechzehntel beginnen, gefiltert nach aktiven Stimmen. */
export function notesAtStep(stepIndex: number, layers: LayerSet): NoteEvent[] {
  if (!Number.isInteger(stepIndex)) return [];
  const i = ((stepIndex % PATTERN_STEPS) + PATTERN_STEPS) % PATTERN_STEPS;
  return PATTERN[i].filter((n) => layers[n.layer]).map((n) => ({ ...n }));
}
