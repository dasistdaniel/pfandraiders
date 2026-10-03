import { loadMusicVolume, saveMusicVolume } from '../settings';
import {
  BPM_ENDED,
  BPM_MENU,
  ENDED_LEVEL,
  FADE_TIME_CONSTANT,
  LAYER_GAIN,
  LOWPASS_HZ,
  MUSIC_MAX_GAIN,
  VIBRATO_CENTS,
  VIBRATO_HZ,
  layersFor,
  midiToHz,
  notesAtStep,
  smoothBpm,
  stepDurationSec,
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
const HAT_HIGHPASS_HZ = 6000;

interface Voice {
  wave: OscillatorType;
  attack: number;
  release: number;
  /** Anteil der Spitze, auf den die Note bis zu ihrem Ende abklingt */
  sustain: number;
  /** true: Note endet samt Ausklang vor der nächsten Note derselben Stimme */
  mono: boolean;
  vibrato: boolean;
}

const VOICES: Record<Exclude<LayerName, 'hat' | 'kick'>, Voice> = {
  bass: { wave: 'triangle', attack: 0.008, release: 0.08, sustain: 0.6, mono: true, vibrato: false },
  chords: { wave: 'triangle', attack: 0.06, release: 0.25, sustain: 0.5, mono: false, vibrato: false },
  melodyA: { wave: 'square', attack: 0.008, release: 0.09, sustain: 0.55, mono: true, vibrato: true },
  melodyB: { wave: 'triangle', attack: 0.008, release: 0.09, sustain: 0.5, mono: true, vibrato: true },
};

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
 */
export class MusicPlayer {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private lowpass: BiquadFilterNode | null = null;
  private hatFilter: BiquadFilterNode | null = null;
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

  private attach(): void {
    const ctx = this.audio.getContext();
    if (!ctx) return;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(ctx.destination);
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = LOWPASS_HZ;
    lowpass.Q.value = 0.5;
    lowpass.connect(out);
    const hatFilter = ctx.createBiquadFilter();
    hatFilter.type = 'highpass';
    hatFilter.frequency.value = HAT_HIGHPASS_HZ;
    hatFilter.connect(out);
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = VIBRATO_HZ;
    const depth = ctx.createGain();
    depth.gain.value = VIBRATO_CENTS;
    lfo.connect(depth);
    lfo.start(0);
    this.ctx = ctx;
    this.out = out;
    this.lowpass = lowpass;
    this.hatFilter = hatFilter;
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
    const peak = LAYER_GAIN[note.layer] * note.velocity;
    if (note.layer === 'hat') this.hat(at, peak);
    else if (note.layer === 'kick') this.kick(note.midi ?? 36, at, peak);
    else if (note.midi !== null) this.tone(VOICES[note.layer], note.midi, at, note.lengthSteps * stepDur, peak);
  }

  private tone(v: Voice, midi: number, at: number, dur: number, peak: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = v.wave;
    osc.frequency.setValueAtTime(midiToHz(midi), at);
    const end = v.mono ? at + Math.max(v.attack + 0.02, dur - v.release) : at + dur;
    const env = ctx.createGain();
    env.gain.value = 0;
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(peak, at + v.attack);
    env.gain.linearRampToValueAtTime(peak * v.sustain, end);
    env.gain.linearRampToValueAtTime(0, end + v.release);
    osc.connect(env);
    env.connect(this.lowpass!);
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
    osc.stop(end + v.release + 0.02);
  }

  private kick(midi: number, at: number, peak: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    const base = midiToHz(midi);
    osc.frequency.setValueAtTime(base * 2.2, at);
    osc.frequency.exponentialRampToValueAtTime(base, at + 0.12);
    const env = ctx.createGain();
    env.gain.value = 0;
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(peak, at + 0.006);
    env.gain.linearRampToValueAtTime(0, at + 0.2);
    osc.connect(env);
    env.connect(this.lowpass!);
    osc.start(at);
    osc.stop(at + 0.22);
  }

  private hat(at: number, peak: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise();
    const env = ctx.createGain();
    env.gain.value = 0;
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(peak, at + 0.003);
    env.gain.linearRampToValueAtTime(0, at + 0.05);
    src.connect(env);
    env.connect(this.hatFilter!);
    src.start(at);
    src.stop(at + 0.07);
  }

  private noise(): AudioBuffer {
    if (this.noiseBuffer) return this.noiseBuffer;
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.1), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buf;
    return buf;
  }
}
