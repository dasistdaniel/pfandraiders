import { loadMusicVolume, saveMusicVolume } from '../settings';
import {
  BASS_GATE_FRACTION,
  BASS_LOWPASS_HZ,
  BASS_SUB_MIX,
  BPM_ENDED,
  BPM_MENU,
  COMPRESSOR_ATTACK_SEC,
  COMPRESSOR_KNEE_DB,
  COMPRESSOR_RATIO,
  COMPRESSOR_RELEASE_SEC,
  COMPRESSOR_THRESHOLD_DB,
  CRASH_DECAY_SEC,
  CRASH_HIGHPASS_HZ,
  DUCK_ATTACK_SEC,
  DUCK_HOLD_SEC,
  DUCK_LEVEL,
  DUCK_RELEASE_SEC,
  ENDED_LEVEL,
  FADE_TIME_CONSTANT,
  FILL_DECAY_SEC,
  GUITAR_DETUNE_CENTS,
  GUITAR_GATE_SEC,
  GUITAR_LOWPASS_HZ,
  HAT_CLOSED_DECAY_SEC,
  HAT_HIGHPASS_HZ,
  HAT_OPEN_DECAY_SEC,
  KICK_CLICK_LEVEL,
  KICK_CLICK_SEC,
  KICK_DECAY_SEC,
  KICK_DROP_SEC,
  KICK_END_HZ,
  KICK_START_HZ,
  LEAD_SAW_DETUNE_CENTS,
  LEAD_SAW_MIX,
  LOWPASS_HZ,
  MUSIC_MAX_GAIN,
  SNARE_BANDPASS_HZ,
  SNARE_BANDPASS_Q,
  SNARE_BODY_HZ,
  SNARE_BODY_LEVEL,
  SNARE_BODY_SEC,
  SNARE_DECAY_SEC,
  VIBRATO_CENTS,
  VIBRATO_HZ,
  layerGain,
  layersFor,
  midiToHz,
  notesAtStep,
  smoothBpm,
  stepDurationSec,
  subOctaveMidi,
  tempoFor,
} from './score';
import type { LayerName, MusicMode, NoteEvent } from './score';

/** Liefert den gemeinsamen AudioContext (SoundFx), damit es nie einen zweiten gibt. */
export interface AudioProvider {
  getContext(): AudioContext | null;
}

export interface Timers {
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(id: unknown): void;
}

const TICK_MS = 25;
/** So weit im Voraus werden Noten auf der Audio-Uhr eingeplant. */
const LOOKAHEAD_SEC = 0.15;
/** Abstand der ersten Note nach Start oder nach einem Hänger, damit nichts in der Vergangenheit liegt. */
const RESYNC_DELAY_SEC = 0.05;
const MAX_STEPS_PER_TICK = 16;
/** Länge des einmal erzeugten Rauschpuffers (Becken, Snare, Hi-Hat, Kick-Klick); Startpunkte darin wechseln. */
const NOISE_SEC = 1.2;

interface Voice {
  wave: OscillatorType;
  /** zweiter Oszillator je Note (Wellenform, Verstimmung in Cent, Anteil am Pegel) */
  layer2?: { wave: OscillatorType; detune: number; mix: number };
  attack: number;
  release: number;
  /** Anteil der Spitze, auf den die Note bis zu ihrem Ende abklingt */
  sustain: number;
  /** true: Note endet samt Ausklang vor der nächsten Note derselben Stimme */
  mono: boolean;
  vibrato: boolean;
}

type ToneLayer = Extract<LayerName, 'guitar' | 'chords' | 'lead' | 'lead2' | 'arp'>;

/** Hüllkurven der Tonstimmen. Der Bass ist Rechteck plus Dreieck-Suboktave (siehe BASS_* in score.ts). */
const VOICES: Record<ToneLayer, Voice> = {
  guitar: {
    wave: 'sawtooth',
    layer2: { wave: 'sawtooth', detune: GUITAR_DETUNE_CENTS, mix: 0.5 },
    attack: 0.002,
    release: 0.03,
    sustain: 0.6,
    mono: false,
    vibrato: false,
  },
  chords: { wave: 'triangle', attack: 0.04, release: 0.2, sustain: 0.55, mono: false, vibrato: false },
  lead: {
    wave: 'square',
    layer2: { wave: 'sawtooth', detune: LEAD_SAW_DETUNE_CENTS, mix: LEAD_SAW_MIX },
    attack: 0.006,
    release: 0.06,
    sustain: 0.6,
    mono: true,
    vibrato: true,
  },
  lead2: { wave: 'triangle', attack: 0.006, release: 0.06, sustain: 0.5, mono: true, vibrato: true },
  arp: { wave: 'square', attack: 0.003, release: 0.03, sustain: 0.3, mono: true, vibrato: false },
};

const BASS_VOICE: Voice = { wave: 'square', attack: 0.003, release: 0.035, sustain: 0.55, mono: true, vibrato: false };

function clampVolume(v: number): number {
  return Number.isFinite(v) ? Math.min(100, Math.max(0, Math.round(v))) : 0;
}

const defaultTimers: Timers = {
  setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
  clearInterval: (id) => globalThis.clearInterval(id as ReturnType<typeof globalThis.setInterval>),
};

/**
 * Erzeugte Hintergrundmusik per WebAudio mit Vorausplanung: ein Takt alle 25 ms plant die nächsten
 * Sechzehntel auf der Audio-Uhr. Das Tempo gleitet mit dem Rundenfortschritt. Ohne AudioContext
 * sind alle Aufrufe stille No-Ops; Fehler dringen nie ins Spiel.
 *
 * Signalweg: Akkorde, Leads, Arpeggio → Tiefpass → Duck (pumpt mit dem Kick) → out;
 * Gitarre → Gitarren-Tiefpass → out; Bass → Bass-Tiefpass → out; Kick, Snare, Hi-Hat, Becken → out;
 * out → Kompressor → Ausgang. Alle Filter entstehen einmal beim Anschließen, nicht je Note.
 */
export class MusicPlayer {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private duck: GainNode | null = null;
  private lowpass: BiquadFilterNode | null = null;
  private guitarFilter: BiquadFilterNode | null = null;
  private bassFilter: BiquadFilterNode | null = null;
  private hatFilter: BiquadFilterNode | null = null;
  private crashFilter: BiquadFilterNode | null = null;
  private snareFilter: BiquadFilterNode | null = null;
  private vibratoDepth: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private timer: unknown = null;
  private readonly timers: Timers;
  private wanted = false;
  private mode: MusicMode = 'menu';
  private progress = 0;
  private bpm = BPM_MENU;
  private step = 0;
  private nextStepTime = 0;
  private lastTickTime: number | null = null;
  private appliedLevel: number | null = null;
  volume: number;
  muted: boolean;

  constructor(
    private readonly audio: AudioProvider,
    opts: { volume?: number; muted?: boolean; timers?: Timers } = {},
  ) {
    this.volume = clampVolume(opts.volume ?? loadMusicVolume());
    this.muted = opts.muted ?? false;
    this.timers = opts.timers ?? defaultTimers;
  }

  /** Aktuelles (geglättetes) Tempo in BPM. */
  get currentBpm(): number {
    return this.bpm;
  }

  /** Musik soll laufen. Idempotent; ohne AudioContext wird bei späteren Aufrufen erneut versucht. */
  start(): void {
    this.wanted = true;
    this.sync();
  }

  stop(): void {
    this.wanted = false;
    this.sync();
  }

  setMode(mode: MusicMode): void {
    this.mode = mode;
    this.sync();
  }

  /** Rundenfortschritt 0 bis 1 (nur im Modus 'game' wirksam). */
  setProgress(p: number): void {
    this.progress = Number.isFinite(p) ? Math.min(1, Math.max(0, p)) : 0;
  }

  /** Musiklautstärke in Prozent: wirkt sofort und wird gespeichert. */
  setVolume(v: number): void {
    this.volume = clampVolume(v);
    saveMusicVolume(this.volume);
    this.sync();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.sync();
  }

  private shouldRun(): boolean {
    return this.wanted && !this.muted && this.volume > 0;
  }

  private sync(): void {
    try {
      if (this.shouldRun() && !this.ctx) this.attach();
      this.applyLevel();
      if (this.shouldRun() && this.ctx) this.startTimer();
      else this.stopTimer();
    } catch {
      // Audio darf das Spiel nie stören
    }
  }

  private filter(ctx: AudioContext, type: BiquadFilterType, hz: number, q: number, dest: AudioNode): BiquadFilterNode {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = hz;
    f.Q.value = q;
    f.connect(dest);
    return f;
  }

  private attach(): void {
    const ctx = this.audio.getContext();
    if (!ctx) return;
    const out = ctx.createGain();
    out.gain.value = 0;
    if (typeof ctx.createDynamicsCompressor === 'function') {
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = COMPRESSOR_THRESHOLD_DB;
      comp.knee.value = COMPRESSOR_KNEE_DB;
      comp.ratio.value = COMPRESSOR_RATIO;
      comp.attack.value = COMPRESSOR_ATTACK_SEC;
      comp.release.value = COMPRESSOR_RELEASE_SEC;
      out.connect(comp);
      comp.connect(ctx.destination);
    } else {
      out.connect(ctx.destination);
    }
    const duck = ctx.createGain();
    duck.gain.value = 1;
    duck.connect(out);
    const lowpass = this.filter(ctx, 'lowpass', LOWPASS_HZ, 0.5, duck);
    const guitarFilter = this.filter(ctx, 'lowpass', GUITAR_LOWPASS_HZ, 0.7, out);
    const bassFilter = this.filter(ctx, 'lowpass', BASS_LOWPASS_HZ, 0.8, out);
    const hatFilter = this.filter(ctx, 'highpass', HAT_HIGHPASS_HZ, 0.7, out);
    const crashFilter = this.filter(ctx, 'highpass', CRASH_HIGHPASS_HZ, 0.5, out);
    const snareFilter = this.filter(ctx, 'bandpass', SNARE_BANDPASS_HZ, SNARE_BANDPASS_Q, out);
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = VIBRATO_HZ;
    const depth = ctx.createGain();
    depth.gain.value = VIBRATO_CENTS;
    lfo.connect(depth);
    lfo.start(0);
    // erst ganz am Ende zuweisen: scheitert vorher etwas, versucht ein späterer Aufruf es erneut
    this.ctx = ctx;
    this.lowpass = lowpass;
    this.guitarFilter = guitarFilter;
    this.bassFilter = bassFilter;
    this.hatFilter = hatFilter;
    this.crashFilter = crashFilter;
    this.snareFilter = snareFilter;
    this.out = out;
    this.duck = duck;
    this.vibratoDepth = depth;
    this.appliedLevel = 0;
  }

  private targetLevel(): number {
    if (!this.shouldRun()) return 0;
    return ((MUSIC_MAX_GAIN * this.volume) / 100) * (this.mode === 'ended' ? ENDED_LEVEL : 1);
  }

  /** Blendet nur bei geänderter Ziellautstärke, damit die Automationsliste nicht wächst. */
  private applyLevel(): void {
    const ctx = this.ctx;
    const out = this.out;
    if (!ctx || !out) return;
    const target = this.targetLevel();
    if (this.appliedLevel !== null && Math.abs(target - this.appliedLevel) < 1e-9) return;
    const now = ctx.currentTime;
    out.gain.cancelScheduledValues(now);
    out.gain.setValueAtTime(out.gain.value, now);
    out.gain.setTargetAtTime(target, now, FADE_TIME_CONSTANT);
    this.appliedLevel = target;
  }

  private startTimer(): void {
    if (this.timer !== null) return;
    this.lastTickTime = null;
    this.nextStepTime = 0; // erzwingt beim ersten Takt den Neuanfang auf der Audio-Uhr
    this.timer = this.timers.setInterval(() => this.tick(), TICK_MS);
    this.tick();
  }

  private stopTimer(): void {
    if (this.timer === null) return;
    this.timers.clearInterval(this.timer);
    this.timer = null;
  }

  private targetBpm(): number {
    if (this.mode === 'game') return tempoFor(this.progress);
    return this.mode === 'ended' ? BPM_ENDED : BPM_MENU;
  }

  private tick(): void {
    try {
      const ctx = this.ctx;
      if (!ctx) return;
      const now = ctx.currentTime;
      const dt = this.lastTickTime === null ? 0 : now - this.lastTickTime;
      this.lastTickTime = now;
      // Nach langen Hängern (Tab im Hintergrund) nicht um Minuten springen: höchstens ein Takt zählt
      this.bpm = smoothBpm(this.bpm, this.targetBpm(), Math.min(dt, 0.25));
      if (this.nextStepTime < now) this.nextStepTime = now + RESYNC_DELAY_SEC;
      const layers = layersFor(this.progress, this.mode);
      for (let i = 0; i < MAX_STEPS_PER_TICK && this.nextStepTime < now + LOOKAHEAD_SEC; i++) {
        const stepDur = stepDurationSec(this.bpm);
        for (const note of notesAtStep(this.step, layers)) {
          try {
            this.play(note, this.nextStepTime, stepDur);
          } catch {
            // eine kaputte Note hält die Musik nicht an
          }
        }
        this.nextStepTime += stepDur;
        this.step++;
      }
    } catch {
      // Audio darf das Spiel nie stören
    }
  }

  private play(note: NoteEvent, at: number, stepDur: number): void {
    const peak = layerGain(note.layer, this.mode) * note.velocity;
    const dur = note.lengthSteps * stepDur;
    switch (note.layer) {
      case 'kick':
        this.kick(at, peak);
        return;
      case 'snare':
        this.snare(at, peak, SNARE_DECAY_SEC);
        return;
      case 'fill':
        this.snare(at, peak, FILL_DECAY_SEC);
        return;
      case 'crash':
        this.noiseHit(this.crashFilter!, at, peak, 0.003, CRASH_DECAY_SEC);
        return;
      case 'hat':
        this.noiseHit(this.hatFilter!, at, peak, 0.002, HAT_OPEN_DECAY_SEC);
        return;
      case 'hat16':
        this.noiseHit(this.hatFilter!, at, peak, 0.001, HAT_CLOSED_DECAY_SEC);
        return;
      case 'bass':
        if (note.midi !== null) this.bass(note.midi, at, dur, peak);
        return;
      case 'guitar':
        // Achtel abgedämpft (kurzes Gate), lange Noten am Phrasenende klingen aus
        if (note.midi !== null) {
          const gate = note.lengthSteps >= 4 ? dur : Math.min(GUITAR_GATE_SEC, dur);
          this.tone(VOICES.guitar, note.midi, at, gate, peak, this.guitarFilter!);
        }
        return;
      default:
        if (note.midi !== null) this.tone(VOICES[note.layer], note.midi, at, dur, peak, this.lowpass!);
    }
  }

  /** Ende des gehaltenen Teils einer Note (Monostimmen klingen vor der nächsten Note aus). */
  private noteEnd(v: Voice, at: number, dur: number): number {
    return v.mono ? at + Math.max(v.attack + 0.02, dur - v.release) : at + dur;
  }

  private envelope(v: Voice, at: number, end: number, peak: number): GainNode {
    const env = this.ctx!.createGain();
    env.gain.value = 0;
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(peak, at + v.attack);
    env.gain.linearRampToValueAtTime(peak * v.sustain, end);
    env.gain.linearRampToValueAtTime(0, end + v.release);
    return env;
  }

  /** Eine Note mit einer Hüllkurve; optional ein zweiter, verstimmter Oszillator hinein (Lead, Gitarre). */
  private tone(v: Voice, midi: number, at: number, dur: number, peak: number, dest: AudioNode): void {
    const ctx = this.ctx!;
    const end = this.noteEnd(v, at, dur);
    const stopAt = end + v.release + 0.02;
    const env = this.envelope(v, at, end, peak);
    env.connect(dest);
    const parts: [OscillatorType, number, number][] = v.layer2
      ? [
          [v.wave, 0, 1 - v.layer2.mix],
          [v.layer2.wave, v.layer2.detune, v.layer2.mix],
        ]
      : [[v.wave, 0, 1]];
    for (const [wave, detune, level] of parts) {
      const osc = ctx.createOscillator();
      osc.type = wave;
      osc.frequency.setValueAtTime(midiToHz(midi), at);
      if (detune) osc.detune.value = detune;
      let into: AudioNode = env;
      if (level < 1) {
        const mix = ctx.createGain();
        mix.gain.value = level;
        mix.connect(env);
        into = mix;
      }
      osc.connect(into);
      if (v.vibrato && this.vibratoDepth) {
        const depth = this.vibratoDepth;
        depth.connect(osc.detune);
        osc.onended = () => {
          try {
            depth.disconnect(osc.detune);
          } catch {
            // schon getrennt
          }
        };
      }
      osc.start(at);
      osc.stop(stopAt);
    }
  }

  /** Abgedämpfter Punk-Bass: Rechteck plus Dreieck-Suboktave, kurz, durch den festen Bass-Tiefpass. */
  private bass(midi: number, at: number, dur: number, peak: number): void {
    const ctx = this.ctx!;
    const v = BASS_VOICE;
    const end = this.noteEnd(v, at, dur * BASS_GATE_FRACTION);
    const stopAt = end + v.release + 0.02;
    const parts: [OscillatorType, number, number][] = [
      [v.wave, midi, peak * (1 - BASS_SUB_MIX)],
      ['triangle', subOctaveMidi(midi), peak * BASS_SUB_MIX],
    ];
    for (const [wave, m, level] of parts) {
      const osc = ctx.createOscillator();
      osc.type = wave;
      osc.frequency.setValueAtTime(midiToHz(m), at);
      const env = this.envelope(v, at, end, level);
      osc.connect(env);
      env.connect(this.bassFilter!);
      osc.start(at);
      osc.stop(stopAt);
    }
  }

  /** Sinus mit schnellem Tonhöhenfall plus kurzer Klick; Akkorde, Leads und Arpeggio ducken sich dabei. */
  private kick(at: number, peak: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(KICK_START_HZ, at);
    osc.frequency.exponentialRampToValueAtTime(KICK_END_HZ, at + KICK_DROP_SEC);
    const env = ctx.createGain();
    env.gain.value = 0;
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(peak, at + 0.003);
    env.gain.linearRampToValueAtTime(peak * 0.6, at + KICK_DROP_SEC);
    env.gain.linearRampToValueAtTime(0, at + KICK_DECAY_SEC);
    osc.connect(env);
    env.connect(this.out!);
    osc.start(at);
    osc.stop(at + KICK_DECAY_SEC + 0.02);
    this.noiseHit(this.snareFilter!, at, peak * KICK_CLICK_LEVEL, 0.001, KICK_CLICK_SEC);
    this.duckAt(at);
  }

  /** Rauschstoß durch den Bandpass plus ein kurzer, fallender Ton als Körper (Snare und Wirbel). */
  private snare(at: number, peak: number, decay: number): void {
    const ctx = this.ctx!;
    this.noiseHit(this.snareFilter!, at, peak, 0.002, decay);
    const bodySec = Math.min(SNARE_BODY_SEC, decay);
    const body = ctx.createOscillator();
    body.type = 'triangle';
    body.frequency.setValueAtTime(SNARE_BODY_HZ, at);
    body.frequency.exponentialRampToValueAtTime(SNARE_BODY_HZ * 0.7, at + bodySec);
    const env = ctx.createGain();
    env.gain.value = 0;
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(peak * SNARE_BODY_LEVEL, at + 0.002);
    env.gain.linearRampToValueAtTime(0, at + bodySec);
    body.connect(env);
    env.connect(this.out!);
    body.start(at);
    body.stop(at + bodySec + 0.02);
  }

  /** Kurzer Rauschstoß aus dem gemeinsamen Puffer (ab wechselnder Stelle) in einen festen Filter. */
  private noiseHit(dest: AudioNode, at: number, peak: number, attack: number, decay: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise();
    const env = ctx.createGain();
    env.gain.value = 0;
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(peak, at + attack);
    env.gain.linearRampToValueAtTime(0, at + decay);
    src.connect(env);
    env.connect(dest);
    const offset = Math.random() * Math.max(0, NOISE_SEC - decay - 0.03);
    src.start(at, offset);
    src.stop(at + decay + 0.02);
  }

  /** Pumpen: der Duck-Knoten fällt beim Kick auf DUCK_LEVEL und steigt nach etwa 100 ms wieder auf 1. */
  private duckAt(at: number): void {
    const g = this.duck?.gain;
    if (!g) return;
    g.setTargetAtTime(DUCK_LEVEL, at, DUCK_ATTACK_SEC);
    g.setTargetAtTime(1, at + DUCK_HOLD_SEC, DUCK_RELEASE_SEC);
  }

  private noise(): AudioBuffer {
    if (this.noiseBuffer) return this.noiseBuffer;
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * NOISE_SEC), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buf;
    return buf;
  }
}
