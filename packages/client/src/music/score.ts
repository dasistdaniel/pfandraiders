/**
 * Die Partitur der Hintergrundmusik: reine Daten und Rechenregeln, ohne Phaser und ohne WebAudio.
 * Ein treibender Chiptune in a-Moll (Akkorde Am F C G, also i VI III VII), 8 Takte zu je 16 Sechzehnteln:
 * durchgehender Achtelbass mit Oktavsprüngen, synthetisches Schlagzeug, Sechzehntel-Arpeggio und
 * pentatonische Melodien. Im Lauf der Runde kommen Stimmen dazu und das Tempo zieht an.
 */

// ---- Stellschrauben (alles, was man nach Gehör nachjustieren möchte) ----
//
// Tempo:      BPM_START/BPM_END (Runde), BPM_MENU, BPM_ENDED, TEMPO_CURVE, MAX_BPM_CHANGE_PER_SEC
// Aufbau:     *_FROM = Rundenfortschritt (0 bis 1), ab dem eine Stimme im Spiel einsetzt
// Pegel:      MUSIC_MAX_GAIN (Regler 100 %), LAYER_GAIN (Anteile je Stimme), MENU_BASS_LEVEL, ENDED_LEVEL
// Bass:       BASS_SUB_MIX (Anteil der Dreieck-Suboktave), SUB_MIN_MIDI (tiefer klingt die Suboktave nicht),
//             BASS_FILTER_* (Tiefpass-„Wub“ je Note: öffnet von FROM auf PEAK und schließt in CLOSE_SEC)
// Schlagzeug: KICK_* (Sinus mit Tonhöhenfall plus Klick), SNARE_* (Rauschen durch Bandpass plus Körper), HAT_*
// Pumpen:     DUCK_* (Akkorde, Melodien und Arpeggio ducken sich bei jedem Kick)
// Klang:      LOWPASS_HZ (Akkorde, Melodien, Arpeggio), VIBRATO_*, COMPRESSOR_* (Begrenzer gegen Übersteuern)
// Die Hüllkurven der Tonstimmen stehen in VOICES in player.ts.

/** Tempo zu Rundenbeginn und kurz vor Schluss (Schläge pro Minute). */
export const BPM_START = 90;
export const BPM_END = 132;
/** Tempo im Hauptmenü und nach Rundenende. */
export const BPM_MENU = 90;
export const BPM_ENDED = 90;
/** Exponent der Tempokurve: > 1 heißt anfangs sanft, gegen Ende steiler. */
export const TEMPO_CURVE = 1.6;
/** Höchste Tempoänderung pro Sekunde, damit Wechsel gleiten statt springen. */
export const MAX_BPM_CHANGE_PER_SEC = 6;

/** Rundenfortschritt (0 bis 1), ab dem die Stimmen im Spiel einsetzen. Kick, Achtel-Hi-Hat und Bass spielen von Anfang an. */
export const SNARE_FROM = 0.3;
export const KICK_SYNC_FROM = 0.45;
export const ARP_FROM = 0.45;
export const HAT16_FROM = 0.66;
export const MELODY_B_FROM = 0.66;

/** Lautstärke der Musik am Regler 100 % (Summe aller Stimmen an der Spitze). */
export const MUSIC_MAX_GAIN = 0.14;
/** Anteil der Musiklautstärke nach Rundenende, damit die Fanfare gut hörbar bleibt. */
export const ENDED_LEVEL = 0.3;
/** Der Bass ist im Menü leiser, damit es ruhig bleibt. */
export const MENU_BASS_LEVEL = 0.5;
/** Zeitkonstante der Ein- und Ausblendungen in Sekunden (nach etwa 3 Konstanten ist die Blende fertig). */
export const FADE_TIME_CONSTANT = 0.27;

/** Bass: Rechteck plus Dreieck eine Oktave tiefer; BASS_SUB_MIX ist der Anteil der Suboktave am Bass-Pegel. */
export const BASS_SUB_MIX = 0.45;
/** Tiefste Suboktave (MIDI 21 = A0, 27,5 Hz); darunter spielt das Dreieck in der Tonhöhe des Rechtecks. */
export const SUB_MIN_MIDI = 21;
/** Tiefpass-Hüllkurve je Bassnote: öffnet schnell von FROM auf PEAK und schließt in CLOSE_SEC. */
export const BASS_FILTER_FROM_HZ = 300;
export const BASS_FILTER_PEAK_HZ = 1200;
export const BASS_FILTER_OPEN_SEC = 0.008;
export const BASS_FILTER_CLOSE_SEC = 0.12;
/** Resonanz des Bassfilters; zu hoch hebt die Spitzen über das Pegelbudget. */
export const BASS_FILTER_Q = 3;

/** Kick: Sinus fällt von START auf END in DROP_SEC, klingt in DECAY_SEC aus; dazu ein kurzer Klick aus Rauschen. */
export const KICK_START_HZ = 150;
export const KICK_END_HZ = 45;
export const KICK_DROP_SEC = 0.08;
export const KICK_DECAY_SEC = 0.28;
export const KICK_CLICK_LEVEL = 0.3;
export const KICK_CLICK_SEC = 0.012;
/** Snare/Clap: Rauschen durch einen Bandpass plus ein kurzer tonaler Körper. */
export const SNARE_BANDPASS_HZ = 1800;
export const SNARE_BANDPASS_Q = 0.9;
export const SNARE_DECAY_SEC = 0.16;
export const SNARE_BODY_HZ = 190;
export const SNARE_BODY_LEVEL = 0.45;
export const SNARE_BODY_SEC = 0.08;
/** Hi-Hat: hochpassgefiltertes Rauschen. */
export const HAT_HIGHPASS_HZ = 7000;
export const HAT_DECAY_SEC = 0.045;

/** Pumpen: bei jedem Kick sinken Akkorde, Melodien und Arpeggio auf DUCK_LEVEL und kommen nach etwa 100 ms zurück. */
export const DUCK_LEVEL = 0.45;
export const DUCK_ATTACK_SEC = 0.005;
export const DUCK_HOLD_SEC = 0.03;
export const DUCK_RELEASE_SEC = 0.025;

/** Warmer Tiefpass über Akkorden, Melodien und Arpeggio. */
export const LOWPASS_HZ = 2400;
/** Vibrato der Melodiestimmen. */
export const VIBRATO_HZ = 5;
export const VIBRATO_CENTS = 7;
/**
 * Kompressor hinter der Musik als fast unhörbarer Begrenzer, damit Kick und Bass zusammen nie übersteuern.
 * WebAudio hebt den Ausgang automatisch um (1 / Pegel bei 0 dBFS)^0,6 an; mit hoher Schwelle bleibt diese
 * Anhebung bei etwa 1,6 dB. Eine niedrige Schwelle (z. B. -18 dB) machte die Musik deutlich lauter als MUSIC_MAX_GAIN.
 */
export const COMPRESSOR_THRESHOLD_DB = -3;
export const COMPRESSOR_KNEE_DB = 3;
export const COMPRESSOR_RATIO = 12;
export const COMPRESSOR_ATTACK_SEC = 0.003;
export const COMPRESSOR_RELEASE_SEC = 0.1;

// ---- Grundlagen ----

export const STEPS_PER_BAR = 16;
export const BARS = 8;
export const PATTERN_STEPS = STEPS_PER_BAR * BARS;

export type LayerName =
  | 'bass'
  | 'chords'
  | 'melodyA'
  | 'melodyB'
  | 'arp'
  | 'kick'
  | 'kickSync'
  | 'snare'
  | 'hat'
  | 'hat16';
export const LAYERS: readonly LayerName[] = [
  'bass',
  'chords',
  'melodyA',
  'melodyB',
  'arp',
  'kick',
  'kickSync',
  'snare',
  'hat',
  'hat16',
];
export type LayerSet = Record<LayerName, boolean>;
export type MusicMode = 'menu' | 'game' | 'ended';

export const ALL_LAYERS: LayerSet = {
  bass: true,
  chords: true,
  melodyA: true,
  melodyB: true,
  arp: true,
  kick: true,
  kickSync: true,
  snare: true,
  hat: true,
  hat16: true,
};

/**
 * Anteil jeder Stimme an MUSIC_MAX_GAIN, pro Note bei Velocity 1. Kick und kickSync sowie hat und hat16
 * setzen nie auf demselben Schritt ein und teilen sich ihr Budget.
 */
export const LAYER_GAIN: Record<LayerName, number> = {
  bass: 0.2,
  chords: 0.045,
  melodyA: 0.1,
  melodyB: 0.06,
  arp: 0.045,
  kick: 0.17,
  kickSync: 0.17,
  snare: 0.08,
  hat: 0.03,
  hat16: 0.03,
};
/** Höchstzahl gleichzeitiger Noten je Stimme laut Partitur. */
export const LAYER_POLYPHONY: Record<LayerName, number> = {
  bass: 1,
  chords: 3,
  melodyA: 1,
  melodyB: 1,
  arp: 1,
  kick: 1,
  kickSync: 1,
  snare: 1,
  hat: 1,
  hat16: 1,
};

export interface NoteEvent {
  layer: LayerName;
  /** MIDI-Notennummer, null = Schlagzeug (Klang steckt im Spieler) */
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

/** Tonhöhe der Dreieck-Suboktave zur Bassnote: eine Oktave tiefer, aber nie unter SUB_MIN_MIDI. */
export function subOctaveMidi(midi: number): number {
  return midi - 12 >= SUB_MIN_MIDI ? midi - 12 : midi;
}

/** Tempo zum Rundenfortschritt (0 bis 1): monoton steigend von BPM_START bis BPM_END. */
export function tempoFor(progress: number): number {
  const p = clamp01(progress);
  return BPM_START + (BPM_END - BPM_START) * Math.pow(p, TEMPO_CURVE);
}

/** Welche Stimmen spielen: im Menü ruhig ohne Schlagzeug, im Spiel immer dichter, nach Rundenende nur Bass und Akkorde. */
export function layersFor(progress: number, mode: MusicMode): LayerSet {
  const p = clamp01(progress);
  const none: LayerSet = { ...ALL_LAYERS };
  for (const l of LAYERS) none[l] = false;
  if (mode === 'menu') return { ...none, bass: true, chords: true, melodyA: true };
  if (mode === 'ended') return { ...none, bass: true, chords: true };
  return {
    bass: true,
    chords: true,
    melodyA: true,
    melodyB: p >= MELODY_B_FROM,
    arp: p >= ARP_FROM,
    kick: true,
    kickSync: p >= KICK_SYNC_FROM,
    snare: p >= SNARE_FROM,
    hat: true,
    hat16: p >= HAT16_FROM,
  };
}

/** Spitzenpegel einer Stimme (Anteil an MUSIC_MAX_GAIN) im jeweiligen Modus. */
export function layerGain(layer: LayerName, mode: MusicMode): number {
  return LAYER_GAIN[layer] * (layer === 'bass' && mode === 'menu' ? MENU_BASS_LEVEL : 1);
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
  /** Basstöne: tiefer Grundton, hoher Ton (meist die Oktave darüber), Quinte */
  lo: number;
  hi: number;
  fifth: number;
}
const AM: Chord = { voicing: [57, 60, 64], lo: 33, hi: 45, fifth: 40 };
const F: Chord = { voicing: [57, 60, 65], lo: 29, hi: 41, fifth: 36 };
const C: Chord = { voicing: [55, 60, 64], lo: 36, hi: 43, fifth: 31 };
const G: Chord = { voicing: [55, 59, 62], lo: 31, hi: 43, fifth: 38 };
const AM2: Chord = { ...AM, voicing: [60, 64, 69] };
const F2: Chord = { ...F, voicing: [60, 65, 69] };
const C2: Chord = { ...C, voicing: [60, 64, 67] };
const G2: Chord = { ...G, voicing: [59, 62, 67] };
const PROGRESSION: Chord[] = [AM, F, C, G, AM2, F2, C2, G2];

/** Basstöne im Muster: L = tiefer Grundton, H = hoch, Q = Quinte. */
type BassTone = 'L' | 'H' | 'Q';
type BassCell = [number, BassTone, number, number];

/** Treibende Achtel mit Oktavpumpen, Synkopen auf Sechzehnteln und Fills am Phrasenende. */
const BASS_GROOVES: Record<'A' | 'B' | 'C' | 'D' | 'E', BassCell[]> = {
  A: [[0, 'L', 2, 1], [2, 'H', 2, 0.7], [4, 'L', 2, 0.85], [6, 'H', 2, 0.7], [8, 'L', 2, 0.9], [10, 'H', 1, 0.65], [11, 'L', 1, 0.75], [12, 'H', 2, 0.8], [14, 'L', 2, 0.75]],
  B: [[0, 'L', 2, 1], [2, 'L', 2, 0.7], [4, 'H', 2, 0.85], [6, 'L', 1, 0.7], [7, 'L', 1, 0.75], [8, 'L', 2, 0.9], [10, 'Q', 2, 0.75], [12, 'H', 2, 0.8], [14, 'L', 2, 0.7]],
  C: [[0, 'L', 2, 1], [2, 'L', 1, 0.6], [3, 'H', 1, 0.8], [4, 'L', 2, 0.85], [6, 'H', 2, 0.75], [8, 'L', 2, 0.9], [10, 'L', 1, 0.65], [11, 'H', 2, 0.8], [13, 'L', 1, 0.7], [14, 'Q', 2, 0.75]],
  D: [[0, 'L', 2, 1], [2, 'H', 2, 0.75], [4, 'L', 2, 0.85], [6, 'H', 2, 0.75], [8, 'Q', 2, 0.85], [10, 'H', 2, 0.75], [12, 'L', 1, 0.8], [13, 'L', 1, 0.7], [14, 'H', 1, 0.8], [15, 'Q', 1, 0.75]],
  E: [[0, 'L', 2, 1], [2, 'H', 2, 0.75], [4, 'L', 1, 0.85], [5, 'L', 1, 0.7], [6, 'H', 2, 0.8], [8, 'L', 2, 0.9], [10, 'Q', 1, 0.75], [11, 'H', 1, 0.8], [12, 'L', 1, 0.8], [13, 'Q', 1, 0.75], [14, 'H', 1, 0.85], [15, 'H', 1, 0.7]],
};
const BASS_BARS: (keyof typeof BASS_GROOVES)[] = ['A', 'B', 'C', 'D', 'B', 'A', 'C', 'E'];

function bassBar(bar: number, ch: Chord): Cell[] {
  const pitch = { L: ch.lo, H: ch.hi, Q: ch.fifth };
  return BASS_GROOVES[BASS_BARS[bar]].map(([step, tone, len, vel]) => [step, pitch[tone], len, vel]);
}

/** Sechzehntel-Arpeggio über die Akkordtöne (Index 3 = tiefster Ton eine Oktave höher). */
const ARP_ORDER = [0, 1, 2, 3, 2, 1, 0, 1, 0, 1, 2, 3, 2, 3, 2, 1];

function arpBar(ch: Chord): Cell[] {
  const tones = [...ch.voicing, ch.voicing[0] + 12];
  return ARP_ORDER.map((idx, step) => [step, tones[idx], 1, step % 4 === 0 ? 0.9 : step % 2 === 0 ? 0.7 : 0.55]);
}

const MELODY_A: Cell[][] = [
  [[0, 69, 2, 0.9], [2, 72, 2, 0.75], [4, 76, 4, 0.85], [10, 74, 2, 0.7], [12, 72, 4, 0.8]],
  [[0, 72, 3, 0.85], [4, 69, 2, 0.7], [6, 72, 2, 0.75], [8, 76, 4, 0.8], [12, 74, 4, 0.75]],
  [[0, 79, 4, 0.9], [4, 76, 2, 0.75], [6, 74, 2, 0.7], [8, 72, 6, 0.85]],
  [[0, 74, 4, 0.85], [4, 79, 2, 0.75], [6, 76, 2, 0.7], [8, 74, 8, 0.8]],
  [[0, 81, 3, 0.9], [4, 79, 2, 0.75], [6, 76, 2, 0.75], [8, 81, 4, 0.85], [12, 84, 4, 0.8]],
  [[0, 84, 4, 0.85], [4, 81, 2, 0.75], [6, 79, 2, 0.7], [8, 76, 6, 0.8]],
  [[0, 79, 3, 0.85], [4, 76, 2, 0.7], [6, 72, 2, 0.7], [8, 76, 4, 0.8], [12, 74, 4, 0.75]],
  [[0, 74, 6, 0.85], [8, 67, 2, 0.7], [10, 69, 6, 0.8]],
];

const MELODY_B: Cell[][] = [
  [[2, 64, 2, 0.7], [10, 67, 2, 0.7]],
  [[2, 69, 2, 0.7], [10, 72, 2, 0.7]],
  [[2, 67, 2, 0.7], [10, 72, 2, 0.7]],
  [[2, 67, 2, 0.7], [10, 74, 2, 0.7]],
  [[2, 72, 2, 0.7], [6, 69, 2, 0.6], [10, 76, 2, 0.7]],
  [[2, 72, 2, 0.7], [10, 69, 2, 0.6], [14, 72, 2, 0.6]],
  [[2, 76, 2, 0.7], [10, 79, 2, 0.7]],
  [[2, 74, 2, 0.7], [6, 79, 2, 0.6], [10, 74, 4, 0.7]],
];

/** Synkopierte Zusatz-Kicks zwischen den Schlägen, im letzten Takt ein kleiner Fill. */
function kickSyncSteps(bar: number): number[] {
  if (bar === BARS - 1) return [10, 14, 15];
  return bar % 2 === 1 ? [7, 10] : [10];
}

function buildPattern(): NoteEvent[][] {
  const steps: NoteEvent[][] = Array.from({ length: PATTERN_STEPS }, () => []);
  const put = (bar: number, layer: LayerName, [step, midi, len, vel]: Cell): void => {
    steps[bar * STEPS_PER_BAR + step].push({ layer, midi, lengthSteps: len, velocity: vel });
  };
  const drum = (bar: number, layer: LayerName, step: number, velocity: number): void => {
    steps[bar * STEPS_PER_BAR + step].push({ layer, midi: null, lengthSteps: 1, velocity });
  };
  for (let bar = 0; bar < BARS; bar++) {
    const ch = PROGRESSION[bar];
    for (const cell of bassBar(bar, ch)) put(bar, 'bass', cell);
    for (const midi of ch.voicing) put(bar, 'chords', [0, midi, STEPS_PER_BAR, 0.8]);
    for (const cell of MELODY_A[bar]) put(bar, 'melodyA', cell);
    for (const cell of MELODY_B[bar]) put(bar, 'melodyB', cell);
    for (const cell of arpBar(ch)) put(bar, 'arp', cell);
    for (const s of [0, 4, 8, 12]) drum(bar, 'kick', s, s === 0 ? 1 : 0.9);
    for (const s of kickSyncSteps(bar)) drum(bar, 'kickSync', s, 0.75);
    for (const s of [4, 12]) drum(bar, 'snare', s, 0.9);
    for (let s = 0; s < STEPS_PER_BAR; s += 2) drum(bar, 'hat', s, s % 4 === 2 ? 0.85 : 0.5);
    for (let s = 1; s < STEPS_PER_BAR; s += 2) drum(bar, 'hat16', s, 0.45);
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
