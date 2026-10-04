import { loadMusicVolume, saveMusicVolume } from '../settings';
import {
  BASS_FILTER_CLOSE_SEC,
  BASS_FILTER_FROM_HZ,
  BASS_FILTER_OPEN_SEC,
  BASS_FILTER_PEAK_HZ,
  BASS_FILTER_Q,
  BASS_SUB_MIX,
  BPM_ENDED,
  BPM_MENU,
  COMPRESSOR_ATTACK_SEC,
  COMPRESSOR_KNEE_DB,
  COMPRESSOR_RATIO,
  COMPRESSOR_RELEASE_SEC,
  COMPRESSOR_THRESHOLD_DB,
  DUCK_ATTACK_SEC,
  DUCK_HOLD_SEC,
  DUCK_LEVEL,
  DUCK_RELEASE_SEC,
  ENDED_LEVEL,
  FADE_TIME_CONSTANT,
  HAT_DECAY_SEC,
  HAT_HIGHPASS_HZ,
  KICK_CLICK_LEVEL,
  KICK_CLICK_SEC,
  KICK_DECAY_SEC,
  KICK_DROP_SEC,
  KICK_END_HZ,
  KICK_START_HZ,
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
/** Länge des einmal erzeugten Rauschpuffers (Snare, Hi-Hat, Kick-Klick); Startpunkte darin wechseln. */
const NOISE_SEC = 0.5;

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

type ToneLayer = Extract<LayerName, 'bass' | 'chords' | 'melodyA' | 'melodyB' | 'arp'>;

/** Hüllkurven der Tonstimmen. Der Bass ist Rechteck plus Dreieck-Suboktave (siehe BASS_* in score.ts). */
const VOICES: Record<ToneLayer, Voice> = {
  bass: { wave: 'square', attack: 0.004, release: 0.05, sustain: 0.45, mono: true, vibrato: false },
  chords: { wave: 'triangle', attack: 0.06, release: 0.25, sustain: 0.5, mono: false, vibrato: false },
  melodyA: { wave: 'square', attack: 0.008, release: 0.09, sustain: 0.55, mono: true, vibrato: true },
  melodyB: { wave: 'triangle', attack: 0.008, release: 0.09, sustain: 0.5, mono: true, vibrato: true },
  arp: { wave: 'square', attack: 0.003, release: 0.03, sustain: 0.3, mono: true, vibrato: false },
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
 *
 * Signalweg: Akkorde, Melodien, Arpeggio → Tiefpass → Duck (pumpt mit dem Kick) → out;
 * Bass (eigener Filter je Note), Kick, Snare, Hi-Hat → out; out → Kompressor → Ausgang.
 */
export class MusicPlayer {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private duck: GainNode | null = null;
  private lowpass: BiquadFilterNode | null = null;
  private hatFilter: BiquadFilterNode | null = null;
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
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = LOWPASS_HZ;
    lowpass.Q.value = 0.5;
    lowpass.connect(duck);
    const hatFilter = ctx.createBiquadFilter();
    hatFilter.type = 'highpass';
    hatFilter.frequency.value = HAT_HIGHPASS_HZ;
    hatFilter.connect(out);
    const snareFilter = ctx.createBiquadFilter();
    snareFilter.type = 'bandpass';
    snareFilter.frequency.value = SNARE_BANDPASS_HZ;
    snareFilter.Q.value = SNARE_BANDPASS_Q;
    snareFilter.connect(out);
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = VIBRATO_HZ;
    const depth = ctx.createGain();
    depth.gain.value = VIBRATO_CENTS;
    lfo.connect(depth);
    lfo.start(0);
    this.ctx = ctx;
    this.out = out;
    this.duck = duck;
    this.lowpass = lowpass;
    this.hatFilter = hatFilter;
    this.snareFilter = snareFilter;
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
    switch (note.layer) {
      case 'kick':
      case 'kickSync':
        this.kick(at, peak);
        return;
      case 'snare':
        this.snare(at, peak);
        return;
      case 'hat':
      case 'hat16':
        this.hat(at, peak);
        return;
      case 'bass':
        if (note.midi !== null) this.bass(note.midi, at, note.lengthSteps * stepDur, peak);
        return;
      default:
        if (note.midi !== null) this.tone(VOICES[note.layer], note.midi, at, note.lengthSteps * stepDur, peak);
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

  private tone(v: Voice, midi: number, at: number, dur: number, peak: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = v.wave;
    osc.frequency.setValueAtTime(midiToHz(midi), at);
    const end = this.noteEnd(v, at, dur);
    const env = this.envelope(v, at, end, peak);
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

  /** Rechteck plus Dreieck-Suboktave durch einen Tiefpass, der sich je Note kurz öffnet („Wub“). */
  private bass(midi: number, at: number, dur: number, peak: number): void {
    const ctx = this.ctx!;
    const v = VOICES.bass;
    const end = this.noteEnd(v, at, dur);
    const stopAt = end + v.release + 0.02;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = BASS_FILTER_Q;
    filter.frequency.setValueAtTime(BASS_FILTER_FROM_HZ, at);
    filter.frequency.exponentialRampToValueAtTime(BASS_FILTER_PEAK_HZ, at + BASS_FILTER_OPEN_SEC);
    filter.frequency.exponentialRampToValueAtTime(BASS_FILTER_FROM_HZ, at + BASS_FILTER_OPEN_SEC + BASS_FILTER_CLOSE_SEC);
    filter.connect(this.out!);
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
      env.connect(filter);
      osc.start(at);
      osc.stop(stopAt);
    }
  }

  /** Sinus mit schnellem Tonhöhenfall plus kurzer Klick; Akkorde und Melodien ducken sich dabei. */
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

  /** Rauschstoß durch den Bandpass plus ein kurzer, fallender Ton als Körper. */
  private snare(at: number, peak: number): void {
    const ctx = this.ctx!;
    this.noiseHit(this.snareFilter!, at, peak, 0.002, SNARE_DECAY_SEC);
    const body = ctx.createOscillator();
    body.type = 'triangle';
    body.frequency.setValueAtTime(SNARE_BODY_HZ, at);
    body.frequency.exponentialRampToValueAtTime(SNARE_BODY_HZ * 0.7, at + SNARE_BODY_SEC);
    const env = ctx.createGain();
    env.gain.value = 0;
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(peak * SNARE_BODY_LEVEL, at + 0.002);
    env.gain.linearRampToValueAtTime(0, at + SNARE_BODY_SEC);
    body.connect(env);
    env.connect(this.out!);
    body.start(at);
    body.stop(at + SNARE_BODY_SEC + 0.02);
  }

  private hat(at: number, peak: number): void {
    this.noiseHit(this.hatFilter!, at, peak, 0.002, HAT_DECAY_SEC);
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
