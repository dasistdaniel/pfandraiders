/**
 * Die Partitur der Hintergrundmusik: reine Daten und Rechenregeln, ohne Phaser und ohne WebAudio.
 * Fröhlicher Techno-Punk in D-Dur (Akkorde D A Hm G, also I V vi IV), 8 Takte zu je 16 Sechzehnteln
 * (zwei Phrasen zu 4 Takten): abgedämpfte Achtel-Powerchords, treibender Achtelbass, Four-on-the-floor-Kick
 * mit Offbeat-Hi-Hat, Snare auf 2 und 4 mit Wirbel am Phrasenende, Becken zu Beginn jeder 8-Takt-Runde,
 * eine pentatonische Leadmelodie und später Arpeggio und eine zweite Leadstimme eine Oktave höher.
 */

// ---- Stellschrauben (alles, was man nach Gehör nachjustieren möchte) ----
//
// Tempo:      BPM_START/BPM_END (Runde), BPM_MENU, BPM_ENDED, TEMPO_CURVE, MAX_BPM_CHANGE_PER_SEC
// Aufbau:     *_FROM = Rundenfortschritt (0 bis 1), ab dem eine Stimme im Spiel einsetzt
// Pegel:      MUSIC_MAX_GAIN (Regler 100 %), LAYER_GAIN (Anteile je Stimme), MENU_BASS_LEVEL, ENDED_LEVEL
// Bass:       BASS_SUB_MIX (Anteil der Dreieck-Suboktave), SUB_MIN_MIDI (tiefer klingt die Suboktave nicht),
//             BASS_LOWPASS_HZ (fester Tiefpass), BASS_GATE_FRACTION (wie kurz die Bassnoten abgedämpft sind)
// Gitarre:    GUITAR_GATE_SEC (Palm-Mute-Länge), GUITAR_LOWPASS_HZ, GUITAR_DETUNE_CENTS
// Schlagzeug: KICK_* (Sinus mit Tonhöhenfall plus Klick), SNARE_* (Rauschen durch Bandpass plus Körper),
//             HAT_* (offene und geschlossene Hi-Hat), CRASH_* (Becken)
// Pumpen:     DUCK_* (Akkorde, Leads und Arpeggio ducken sich bei jedem Kick)
// Klang:      LOWPASS_HZ (Akkorde, Leads, Arpeggio), VIBRATO_*, LEAD_SAW_*, COMPRESSOR_* (Begrenzer)
// Die Hüllkurven der Tonstimmen stehen in VOICES in player.ts.

/** Tempo zu Rundenbeginn und kurz vor Schluss (Schläge pro Minute). */
export const BPM_START = 125;
export const BPM_END = 165;
/** Tempo im Hauptmenü und nach Rundenende. */
export const BPM_MENU = 125;
export const BPM_ENDED = 125;
/** Exponent der Tempokurve: > 1 heißt anfangs sanft, gegen Ende steiler. */
export const TEMPO_CURVE = 1.6;
/** Höchste Tempoänderung pro Sekunde, damit Wechsel gleiten statt springen. */
export const MAX_BPM_CHANGE_PER_SEC = 8;

/**
 * Rundenfortschritt (0 bis 1), ab dem die Stimmen im Spiel einsetzen. Gitarre, Bass, Akkorde, Lead, Kick,
 * Offbeat-Hi-Hat, Snare, Wirbel und Becken spielen von Anfang an.
 */
export const ARP_FROM = 0.45;
export const HAT16_FROM = 0.5;
export const LEAD2_FROM = 0.66;

/** Lautstärke der Musik am Regler 100 % (Summe aller Stimmen an der Spitze). */
export const MUSIC_MAX_GAIN = 0.14;
/** Anteil der Musiklautstärke nach Rundenende, damit die Fanfare gut hörbar bleibt. */
export const ENDED_LEVEL = 0.3;
/** Der Bass ist im Menü leiser, damit es ruhig bleibt. */
export const MENU_BASS_LEVEL = 0.6;
/** Zeitkonstante der Ein- und Ausblendungen in Sekunden (nach etwa 3 Konstanten ist die Blende fertig). */
export const FADE_TIME_CONSTANT = 0.27;

/** Bass: Rechteck plus Dreieck eine Oktave tiefer; BASS_SUB_MIX ist der Anteil der Suboktave am Bass-Pegel. */
export const BASS_SUB_MIX = 0.45;
/** Tiefste Suboktave (MIDI 21 = A0, 27,5 Hz); darunter spielt das Dreieck in der Tonhöhe des Rechtecks. */
export const SUB_MIN_MIDI = 21;
/** Fester Tiefpass über dem Bass (rund, aber mit Biss). */
export const BASS_LOWPASS_HZ = 1100;
/** Anteil der Notenlänge, den eine Bassnote klingt (kurz = abgedämpft und punchy). */
export const BASS_GATE_FRACTION = 0.6;

/** Gitarre: Powerchords (Grundton plus Quinte) als Sägezahn; Achtel sind abgedämpft (kurzes Gate). */
export const GUITAR_GATE_SEC = 0.06;
export const GUITAR_LOWPASS_HZ = 1800;
/** Zweiter, leicht verstimmter Sägezahn je Gitarrenton für mehr Breite. */
export const GUITAR_DETUNE_CENTS = 9;

/** Kick: Sinus fällt von START auf END in DROP_SEC, klingt in DECAY_SEC aus; dazu ein kurzer Klick aus Rauschen. */
export const KICK_START_HZ = 150;
export const KICK_END_HZ = 45;
export const KICK_DROP_SEC = 0.08;
export const KICK_DECAY_SEC = 0.25;
export const KICK_CLICK_LEVEL = 0.3;
export const KICK_CLICK_SEC = 0.012;
/** Snare: Rauschen durch einen Bandpass plus ein kurzer tonaler Körper (auch für den Wirbel). */
export const SNARE_BANDPASS_HZ = 1900;
export const SNARE_BANDPASS_Q = 0.8;
export const SNARE_DECAY_SEC = 0.14;
export const SNARE_BODY_HZ = 200;
export const SNARE_BODY_LEVEL = 0.45;
export const SNARE_BODY_SEC = 0.07;
/** Wirbel: kürzere Schläge, damit die Sechzehntel nicht verschwimmen. */
export const FILL_DECAY_SEC = 0.08;
/** Hi-Hat: hochpassgefiltertes Rauschen; offen auf den Offbeats, geschlossen in Sechzehnteln. */
export const HAT_HIGHPASS_HZ = 7000;
export const HAT_OPEN_DECAY_SEC = 0.11;
export const HAT_CLOSED_DECAY_SEC = 0.035;
/** Becken: langes Rauschen durch einen etwas tieferen Hochpass. */
export const CRASH_HIGHPASS_HZ = 4500;
export const CRASH_DECAY_SEC = 0.9;

/** Pumpen: bei jedem Kick sinken Akkorde, Leads und Arpeggio auf DUCK_LEVEL und kommen nach etwa 100 ms zurück. */
export const DUCK_LEVEL = 0.5;
export const DUCK_ATTACK_SEC = 0.005;
export const DUCK_HOLD_SEC = 0.03;
export const DUCK_RELEASE_SEC = 0.025;

/** Tiefpass über Akkorden, Leads und Arpeggio (hell, aber nicht kratzig). */
export const LOWPASS_HZ = 3600;
/** Vibrato der Leadstimmen. */
export const VIBRATO_HZ = 5.5;
export const VIBRATO_CENTS = 6;
/** Lead: Rechteck plus Sägezahn; SAW_MIX ist der Anteil des Sägezahns, leicht verstimmt um DETUNE_CENTS. */
export const LEAD_SAW_MIX = 0.4;
export const LEAD_SAW_DETUNE_CENTS = 7;
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
/** Takte je Phrase; der letzte Takt jeder Phrase hat einen Snare-Wirbel. */
export const PHRASE_BARS = 4;
export const PATTERN_STEPS = STEPS_PER_BAR * BARS;

export type LayerName =
  | 'guitar'
  | 'bass'
  | 'chords'
  | 'lead'
  | 'lead2'
  | 'arp'
  | 'kick'
  | 'snare'
  | 'fill'
  | 'crash'
  | 'hat'
  | 'hat16';
export const LAYERS: readonly LayerName[] = [
  'guitar',
  'bass',
  'chords',
  'lead',
  'lead2',
  'arp',
  'kick',
  'snare',
  'fill',
  'crash',
  'hat',
  'hat16',
];
export type LayerSet = Record<LayerName, boolean>;
export type MusicMode = 'menu' | 'game' | 'ended';

export const ALL_LAYERS: LayerSet = {
  guitar: true,
  bass: true,
  chords: true,
  lead: true,
  lead2: true,
  arp: true,
  kick: true,
  snare: true,
  fill: true,
  crash: true,
  hat: true,
  hat16: true,
};

/**
 * Anteil jeder Stimme an MUSIC_MAX_GAIN, pro Note bei Velocity 1. snare und fill sowie hat und hat16
 * setzen nie auf demselben Schritt ein und teilen sich ihr Budget.
 */
export const LAYER_GAIN: Record<LayerName, number> = {
  guitar: 0.05,
  bass: 0.14,
  chords: 0.025,
  lead: 0.085,
  lead2: 0.04,
  arp: 0.035,
  kick: 0.2,
  snare: 0.085,
  fill: 0.07,
  crash: 0.05,
  hat: 0.03,
  hat16: 0.022,
};
/** Höchstzahl gleichzeitiger Noten je Stimme laut Partitur. */
export const LAYER_POLYPHONY: Record<LayerName, number> = {
  guitar: 2,
  bass: 1,
  chords: 3,
  lead: 1,
  lead2: 1,
  arp: 1,
  kick: 1,
  snare: 1,
  fill: 1,
  crash: 1,
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

/**
 * Welche Stimmen spielen: im Menü fröhlich, aber ruhig (Bass, Akkorde, Lead, ohne Schlagzeug und Gitarre),
 * im Spiel von Anfang an mit voller Punk-Band und immer dichter, nach Rundenende nur Bass und Akkorde.
 */
export function layersFor(progress: number, mode: MusicMode): LayerSet {
  const p = clamp01(progress);
  const none: LayerSet = { ...ALL_LAYERS };
  for (const l of LAYERS) none[l] = false;
  if (mode === 'menu') return { ...none, bass: true, chords: true, lead: true };
  if (mode === 'ended') return { ...none, bass: true, chords: true };
  return {
    guitar: true,
    bass: true,
    chords: true,
    lead: true,
    lead2: p >= LEAD2_FROM,
    arp: p >= ARP_FROM,
    kick: true,
    snare: true,
    fill: true,
    crash: true,
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
  /** Grundton des Basses (D2 bis H2) */
  root: number;
  /** Terz über dem Grundton in Halbtönen (Dur 4, Moll 3) */
  third: number;
  /** Akkordflächen in der Mittellage */
  voicing: [number, number, number];
}
const D: Chord = { root: 38, third: 4, voicing: [62, 66, 69] };
const A: Chord = { root: 45, third: 4, voicing: [61, 64, 69] };
const BM: Chord = { root: 47, third: 3, voicing: [62, 66, 71] };
const G: Chord = { root: 43, third: 4, voicing: [62, 67, 71] };
const D2: Chord = { ...D, voicing: [66, 69, 74] };
const A2: Chord = { ...A, voicing: [64, 69, 73] };
const BM2: Chord = { ...BM, voicing: [66, 71, 74] };
const G2: Chord = { ...G, voicing: [67, 71, 74] };
const PROGRESSION: Chord[] = [D, A, BM, G, D2, A2, BM2, G2];

/** Basstöne im Muster: R = Grundton, O = Oktave darüber, Q = Quinte darüber. */
type BassTone = 'R' | 'O' | 'Q';
type BassCell = [number, BassTone, number, number];

const EIGHTHS: BassCell[] = [0, 2, 4, 6, 8, 10, 12, 14].map((s) => [s, 'R', 2, s % 4 === 0 ? 1 : 0.8]);
/** Gerade Punk-Achtel, Oktavsprünge im zweiten Teil, Sechzehntel-Anschub am Ende jeder Phrase. */
const BASS_GROOVES: Record<'A' | 'B' | 'F1' | 'F2', BassCell[]> = {
  A: EIGHTHS,
  B: EIGHTHS.map(([s, t, l, v]) => [s, s === 6 || s === 14 ? 'O' : t, l, v]),
  F1: [...EIGHTHS.slice(0, 6), [12, 'R', 1, 0.9], [13, 'R', 1, 0.75], [14, 'Q', 1, 0.85], [15, 'O', 1, 0.9]],
  F2: [...EIGHTHS.slice(0, 4), [8, 'O', 2, 0.9], [10, 'Q', 2, 0.8], [12, 'R', 1, 0.9], [13, 'Q', 1, 0.8], [14, 'O', 1, 0.9], [15, 'Q', 1, 0.85]],
};
const BASS_BARS: (keyof typeof BASS_GROOVES)[] = ['A', 'A', 'A', 'F1', 'A', 'B', 'B', 'F2'];

function bassBar(bar: number, ch: Chord): Cell[] {
  const pitch = { R: ch.root, O: ch.root + 12, Q: ch.root + 7 };
  return BASS_GROOVES[BASS_BARS[bar]].map(([step, tone, len, vel]) => [step, pitch[tone], len, vel]);
}

/**
 * Powerchords (Grundton plus Quinte, tiefe Lage G2 bis D3) auf jeder Achtel, betont auf den Offbeats.
 * Am Ende jeder Phrase klingt der letzte Akkord offen aus.
 */
function guitarBar(bar: number, ch: Chord): Cell[] {
  const root = ch.root + 12 <= 50 ? ch.root + 12 : ch.root;
  const out: Cell[] = [];
  const last = bar % PHRASE_BARS === PHRASE_BARS - 1;
  for (let s = 0; s < STEPS_PER_BAR; s += 2) {
    if (last && s > 12) break;
    const ring = last && s === 12;
    const vel = ring ? 1 : s % 4 === 2 ? 1 : 0.75;
    const len = ring ? 4 : 1;
    out.push([s, root, len, vel], [s, root + 7, len, vel]);
  }
  return out;
}

/** Sechzehntel-Arpeggio über Grundton, Terz, Quinte und Oktave (D-A-F#-A-D …). */
const ARP_ORDER = [0, 2, 1, 2, 3, 2, 1, 2, 0, 2, 1, 2, 3, 2, 1, 2];

function arpBar(ch: Chord): Cell[] {
  const r = ch.root + 24 - (ch.root + 24 > 71 ? 12 : 0);
  const tones = [r, r + ch.third, r + 7, r + 12];
  return ARP_ORDER.map((idx, step) => [step, tones[idx], 1, step % 4 === 0 ? 0.9 : step % 2 === 0 ? 0.7 : 0.55]);
}

/** Der Hook: D-Dur-Pentatonik (D E F# A H), zweite Phrase greift ihn auf und steigt höher. */
const LEAD: Cell[][] = [
  [[0, 78, 2, 0.9], [2, 81, 2, 0.8], [4, 78, 2, 0.8], [6, 74, 2, 0.75], [8, 76, 2, 0.85], [10, 78, 2, 0.8], [12, 81, 4, 0.9]],
  [[0, 76, 2, 0.85], [2, 81, 2, 0.8], [4, 76, 1, 0.75], [5, 74, 1, 0.7], [6, 76, 2, 0.8], [8, 81, 3, 0.85], [11, 83, 1, 0.75], [12, 81, 4, 0.85]],
  [[0, 78, 2, 0.85], [2, 83, 2, 0.8], [4, 81, 2, 0.8], [6, 78, 2, 0.75], [8, 74, 2, 0.8], [10, 78, 2, 0.75], [12, 76, 4, 0.85]],
  [[0, 74, 2, 0.85], [2, 76, 2, 0.75], [4, 78, 4, 0.85], [8, 74, 2, 0.75], [10, 71, 2, 0.7], [12, 74, 1, 0.8], [13, 76, 1, 0.8], [14, 78, 2, 0.9]],
  [[0, 78, 2, 0.9], [2, 81, 2, 0.8], [4, 78, 2, 0.8], [6, 74, 2, 0.75], [8, 76, 1, 0.8], [9, 78, 1, 0.8], [10, 81, 2, 0.85], [12, 86, 4, 0.95]],
  [[0, 76, 2, 0.85], [2, 81, 2, 0.8], [4, 76, 1, 0.75], [5, 74, 1, 0.7], [6, 76, 2, 0.8], [8, 81, 2, 0.85], [10, 83, 2, 0.85], [12, 81, 4, 0.9]],
  [[0, 83, 3, 0.9], [3, 81, 1, 0.75], [4, 78, 2, 0.8], [6, 83, 2, 0.8], [8, 86, 2, 0.9], [10, 83, 2, 0.8], [12, 81, 2, 0.8], [14, 78, 2, 0.8]],
  [[0, 83, 2, 0.85], [2, 81, 2, 0.8], [4, 78, 2, 0.8], [6, 76, 2, 0.75], [8, 74, 4, 0.85], [12, 76, 1, 0.8], [13, 78, 1, 0.85], [14, 81, 2, 0.9]],
];

/** Zweite Leadstimme: der Hook eine Oktave höher (leiser, als heller Glanz darüber). */
const LEAD2: Cell[][] = LEAD.map((bar) => bar.map(([s, m, l, v]) => [s, m + 12, l, v * 0.85]));

/** Sechzehntel-Wirbel im letzten Takt jeder Phrase (die Snare auf 4 und 12 spielt dabei weiter). */
function fillSteps(bar: number): number[] {
  if (bar % PHRASE_BARS !== PHRASE_BARS - 1) return [];
  const from = bar === BARS - 1 ? 5 : 8;
  const out: number[] = [];
  for (let s = from; s < STEPS_PER_BAR; s++) if (s !== 12) out.push(s);
  return out;
}

const OFFBEATS = [2, 6, 10, 14];

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
    for (const cell of guitarBar(bar, ch)) put(bar, 'guitar', cell);
    for (const cell of bassBar(bar, ch)) put(bar, 'bass', cell);
    for (const midi of ch.voicing) put(bar, 'chords', [0, midi, STEPS_PER_BAR, 0.8]);
    for (const cell of LEAD[bar]) put(bar, 'lead', cell);
    for (const cell of LEAD2[bar]) put(bar, 'lead2', cell);
    for (const cell of arpBar(ch)) put(bar, 'arp', cell);
    for (const s of [0, 4, 8, 12]) drum(bar, 'kick', s, s === 0 ? 1 : 0.92);
    for (const s of [4, 12]) drum(bar, 'snare', s, 0.9);
    const fill = fillSteps(bar);
    fill.forEach((s, i) => drum(bar, 'fill', s, 0.45 + (0.5 * (i + 1)) / fill.length));
    if (bar === 0) drum(bar, 'crash', 0, 1);
    for (const s of OFFBEATS) drum(bar, 'hat', s, 0.9);
    for (let s = 0; s < STEPS_PER_BAR; s++) if (!OFFBEATS.includes(s)) drum(bar, 'hat16', s, s % 4 === 0 ? 0.7 : 0.5);
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
