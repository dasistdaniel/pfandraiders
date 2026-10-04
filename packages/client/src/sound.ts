import { DEFAULT_VOLUME, loadVolume, saveVolume } from './settings';
import type { SoundId } from './soundEvents';

export type { SoundId } from './soundEvents';

const MASTER_GAIN = 0.15;
const MIN_REPEAT_MS = 80;
const STORAGE_KEY = 'pfandraiders.muted';

type Wave = 'square' | 'triangle' | 'sawtooth' | 'sine';
/** Frequenz in Hz (0 = Pause), Dauer in s. `to` gleitet innerhalb der Note zu dieser Frequenz. */
interface Note {
  f: number;
  d: number;
  to?: number;
}
interface Recipe {
  wave: Wave;
  gain: number;
  notes: Note[];
  /** Rauschstoß (plus tiefer Schlag) statt Tonfolge */
  noise?: boolean;
}

const RECIPES: Record<SoundId, Recipe> = {
  pickup: { wave: 'square', gain: 0.5, notes: [{ f: 1200, d: 0.06 }] },
  sell: { wave: 'square', gain: 0.5, notes: [{ f: 988, d: 0.07 }, { f: 1319, d: 0.14 }] },
  buy: { wave: 'triangle', gain: 0.8, notes: [{ f: 400, d: 0.18, to: 900 }] },
  stealSuccess: { wave: 'square', gain: 0.5, notes: [{ f: 700, d: 0.3, to: 200 }] },
  bite: { wave: 'sawtooth', gain: 0.9, notes: [{ f: 0, d: 0.12 }], noise: true },
  knockout: { wave: 'triangle', gain: 0.9, notes: [{ f: 440, d: 0.7, to: 70 }] },
  policeCheck: {
    wave: 'square',
    gain: 0.4,
    notes: [{ f: 880, d: 0.12 }, { f: 660, d: 0.12 }, { f: 880, d: 0.12 }, { f: 660, d: 0.12 }],
  },
  zoneAnnounced: {
    wave: 'sine',
    gain: 0.8,
    notes: [{ f: 523, d: 0.14 }, { f: 659, d: 0.14 }, { f: 784, d: 0.3 }],
  },
  roundEnd: {
    wave: 'square',
    gain: 0.5,
    notes: [{ f: 523, d: 0.15 }, { f: 659, d: 0.15 }, { f: 784, d: 0.15 }, { f: 1047, d: 0.5 }],
  },
  tick: { wave: 'square', gain: 0.35, notes: [{ f: 1800, d: 0.02 }] },
};

export function loadMuted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function saveMuted(muted: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
  } catch {
    // Speicher gesperrt: Stummschaltung gilt nur für diese Sitzung
  }
}

function clampVolume(v: number): number {
  return Number.isFinite(v) ? Math.min(100, Math.max(0, Math.round(v))) : DEFAULT_VOLUME;
}

function defaultContext(): AudioContext | null {
  const w = globalThis as unknown as {
    AudioContext?: new () => AudioContext;
    webkitAudioContext?: new () => AudioContext;
  };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  return Ctor ? new Ctor() : null;
}

/**
 * Synthetisierte Soundeffekte per WebAudio. Ohne AudioContext sind alle Aufrufe stille No-Ops.
 * Der Kontext entsteht erst bei der ersten Nutzergeste (Autoplay-Richtlinie der Browser).
 */
export class SoundFx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private lastPlayed = new Map<SoundId, number>();
  private noiseBuffer: AudioBuffer | null = null;
  muted: boolean;
  volume: number;
  /** Wird nach jedem Umschalten der Stummschaltung aufgerufen (z. B. für die Musik). */
  onMuteChange: ((muted: boolean) => void) | null = null;

  constructor(
    private readonly createContext: () => AudioContext | null = defaultContext,
    private readonly now: () => number = () => performance.now(),
    muted: boolean = loadMuted(),
    volume: number = loadVolume(),
  ) {
    this.muted = muted;
    this.volume = clampVolume(volume);
  }

  /** Bei einer Nutzergeste aufrufen: legt den Kontext an bzw. setzt ihn fort. */
  unlock(): void {
    if (!this.ctx) {
      try {
        this.ctx = this.createContext();
      } catch {
        this.ctx = null;
      }
      if (!this.ctx) return;
      this.master = this.ctx.createGain();
      this.master.gain.value = this.masterGain();
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
  }

  /** Der freigeschaltete AudioContext (null vor der ersten Nutzergeste oder ohne WebAudio). */
  getContext(): AudioContext | null {
    return this.ctx;
  }

  /** Lautstärke in Prozent (0 bis 100): wirkt sofort und wird gespeichert. */
  setVolume(v: number): void {
    this.volume = clampVolume(v);
    saveVolume(this.volume);
    if (this.master) this.master.gain.value = this.masterGain();
  }

  private masterGain(): number {
    return (MASTER_GAIN * this.volume) / 100;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    saveMuted(this.muted);
    try {
      this.onMuteChange?.(this.muted);
    } catch {
      // Zuhörer dürfen das Umschalten nie verhindern
    }
    return this.muted;
  }

  play(id: SoundId): void {
    if (this.muted || !this.ctx || !this.master) return;
    const t = this.now();
    const last = this.lastPlayed.get(id);
    if (last !== undefined && t - last < MIN_REPEAT_MS) return;
    this.lastPlayed.set(id, t);
    try {
      this.synth(RECIPES[id]);
    } catch {
      // Audio darf das Spiel nie stören
    }
  }

  private synth(recipe: Recipe): void {
    const ctx = this.ctx!;
    const out = this.master!;
    let at = ctx.currentTime;
    if (recipe.noise) {
      const dur = recipe.notes[0].d;
      const src = ctx.createBufferSource();
      src.buffer = this.noise();
      const env = ctx.createGain();
      env.gain.setValueAtTime(recipe.gain, at);
      env.gain.exponentialRampToValueAtTime(0.001, at + dur);
      src.connect(env);
      env.connect(out);
      src.start(at);
      src.stop(at + dur);
      this.tone(recipe, { f: 160, d: dur, to: 60 }, at, out);
      return;
    }
    for (const note of recipe.notes) {
      if (note.f > 0) this.tone(recipe, note, at, out);
      at += note.d;
    }
  }

  private tone(recipe: Recipe, note: Note, at: number, out: AudioNode): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = recipe.wave;
    osc.frequency.setValueAtTime(note.f, at);
    if (note.to !== undefined) osc.frequency.exponentialRampToValueAtTime(note.to, at + note.d);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.linearRampToValueAtTime(recipe.gain, at + 0.005);
    env.gain.exponentialRampToValueAtTime(0.001, at + note.d);
    osc.connect(env);
    env.connect(out);
    osc.start(at);
    osc.stop(at + note.d + 0.02);
  }

  private noise(): AudioBuffer {
    if (this.noiseBuffer) return this.noiseBuffer;
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.2), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buf;
    return buf;
  }
}
