import { DEFAULT_VOLUME, loadAudioToggles, loadVolume, saveVolume } from './settings';
import { plingStep } from './soundEvents';
import type { LoopId, SoundId, SynthId } from './audioIds';

export type { SoundId } from './audioIds';

const MASTER_GAIN = 0.15;
const MIN_REPEAT_MS = 80;
/** Abstand der Plings eines Frames in s; mindestens MIN_REPEAT_MS, sonst schluckt die Sperre sie. */
export const PLING_GAP_SEC = 0.09;
/** Pling-Tonleiter: Halbtöne über dem Grundton je Stufe (Dur-Pentatonik) */
export const PLING_SEMITONES = [0, 2, 4, 7, 9, 12, 14, 16];
/** Ausblenden eines Loops beim Stoppen (gegen Knacken), in s */
const LOOP_FADE_SEC = 0.04;

/** Puffer der eigenen Audiodateien (AudioAssets); null = keine Datei, dann gilt der erzeugte Klang. */
export interface SoundAssets {
  buffer(id: string): AudioBuffer | null;
  /** Nach der ersten Nutzergeste: Dateien laden und dekodieren */
  load?(ctx: AudioContext): Promise<void>;
}

/** Woher ein Effekt kommt: eigene Datei, erzeugter Klang (nur die 15 alten IDs) oder gar nicht (stumm). */
export type EffectSource = 'file' | 'synth' | 'none';

export function effectSource(id: SoundId, hasFile: boolean): EffectSource {
  if (hasFile) return 'file';
  return Object.prototype.hasOwnProperty.call(RECIPES, id) ? 'synth' : 'none';
}

/**
 * Datei und Abspielrate für einen Pling der Stufe `step` (0 bis 7): zuerst die eigene Datei pling_<step+1>
 * (unverändert), sonst pling mit der Tonleiter als Abspielrate, sonst null (erzeugter Klang).
 */
export function plingChoice(step: number, has: (id: string) => boolean): { id: string; rate: number } | null {
  const s = Math.min(PLING_SEMITONES.length - 1, Math.max(0, Math.floor(step)));
  const variant = `pling_${s + 1}`;
  if (has(variant)) return { id: variant, rate: 1 };
  if (has('pling')) return { id: 'pling', rate: 2 ** (PLING_SEMITONES[s] / 12) };
  return null;
}

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

const RECIPES: Record<SynthId, Recipe> = {
  pickup: { wave: 'square', gain: 0.5, notes: [{ f: 1200, d: 0.06 }] },
  /** eine Flasche am Pfandautomaten: kurzer heller Münz-Blip, Tonhöhe steigt pro Flasche */
  pling: { wave: 'triangle', gain: 0.55, notes: [{ f: 1047, d: 0.035 }, { f: 1568, d: 0.09 }] },
  buy: { wave: 'triangle', gain: 0.8, notes: [{ f: 400, d: 0.18, to: 900 }] },
  stealSuccess: { wave: 'square', gain: 0.5, notes: [{ f: 700, d: 0.3, to: 200 }] },
  bite: { wave: 'sawtooth', gain: 0.9, notes: [{ f: 0, d: 0.12 }], noise: true },
  knockout: { wave: 'triangle', gain: 0.9, notes: [{ f: 440, d: 0.7, to: 70 }] },
  /** eigener Schlag: kurzer dumpfer Luftzug */
  punch: { wave: 'sawtooth', gain: 0.6, notes: [{ f: 0, d: 0.06 }], noise: true },
  /** selbst getroffen: tiefer Schlag mit Abfall */
  hit: { wave: 'square', gain: 0.8, notes: [{ f: 220, d: 0.15, to: 90 }] },
  /** Pfefferspray: längerer zischender Rauschstoß */
  spray: { wave: 'sawtooth', gain: 0.5, notes: [{ f: 0, d: 0.25 }], noise: true },
  policeCheck: {
    wave: 'square',
    gain: 0.4,
    notes: [{ f: 880, d: 0.12 }, { f: 660, d: 0.12 }, { f: 880, d: 0.12 }, { f: 660, d: 0.12 }],
  },
  /** Polizei hat Flaschen beschlagnahmt: zwei tiefe, absteigende Töne */
  policeSeize: {
    wave: 'square',
    gain: 0.45,
    notes: [{ f: 392, d: 0.16 }, { f: 330, d: 0.16 }, { f: 262, d: 0.35, to: 180 }],
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
  /** Ende des Countdowns ("LOS!"): höherer, längerer Ton */
  countdownGo: { wave: 'square', gain: 0.45, notes: [{ f: 1568, d: 0.06 }, { f: 2093, d: 0.3 }] },
};

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
 * Soundeffekte per WebAudio: eigene Datei (AudioAssets), sonst der erzeugte Klang, sonst nichts.
 * Ohne AudioContext sind alle Aufrufe stille No-Ops. Der Kontext entsteht erst bei der ersten Nutzergeste
 * (Autoplay-Richtlinie der Browser); dann beginnt auch das Laden der Dateien.
 */
export class SoundFx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private lastPlayed = new Map<SoundId, number>();
  private noiseBuffer: AudioBuffer | null = null;
  private plingLastMs: number | null = null;
  private plingPrevStep = 0;
  /** Laufende Loops je Schlüssel (z. B. "search:p1" im Splitscreen) */
  private loops = new Map<string, { src: AudioBufferSourceNode; env: GainNode }>();
  /** Effekte aus (die Musik schaltet getrennt, siehe sfx.ts). */
  muted: boolean;
  volume: number;

  constructor(
    private readonly createContext: () => AudioContext | null = defaultContext,
    private readonly now: () => number = () => performance.now(),
    muted: boolean = !loadAudioToggles().effects,
    volume: number = loadVolume(),
    private readonly assets: SoundAssets | null = null,
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
      try {
        void this.assets?.load?.(this.ctx)?.catch(() => undefined);
      } catch {
        // ohne Dateien geht es mit den erzeugten Klängen weiter
      }
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

  /** Effekte stumm schalten oder wieder an; gespeichert wird in sfx.ts (zusammen mit der Musik). */
  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) this.stopAllLoops();
  }

  private bufferFor(id: string): AudioBuffer | null {
    try {
      return this.assets?.buffer(id) ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Spielt einen Sound, auf Wunsch `delaySec` Sekunden später (für mehrere Plings aus einem Frame).
   * Die Wiederholsperre rechnet mit dem geplanten Zeitpunkt.
   */
  play(id: SoundId, delaySec = 0): void {
    if (this.muted || !this.ctx || !this.master) return;
    const delay = Number.isFinite(delaySec) ? Math.max(0, delaySec) : 0;
    const t = this.now() + delay * 1000;
    const last = this.lastPlayed.get(id);
    if (last !== undefined && t - last < MIN_REPEAT_MS) return;
    this.lastPlayed.set(id, t);
    try {
      if (id === 'pling') {
        const step = plingStep(this.plingLastMs, t, this.plingPrevStep);
        this.plingLastMs = t;
        this.plingPrevStep = step;
        const file = plingChoice(step, (v) => this.bufferFor(v) !== null);
        if (file) this.playBuffer(this.bufferFor(file.id)!, delay, file.rate);
        else this.synth(RECIPES.pling, delay, 2 ** (PLING_SEMITONES[step] / 12));
        return;
      }
      const buf = this.bufferFor(id);
      const source = effectSource(id, buf !== null);
      if (source === 'file') this.playBuffer(buf!, delay, 1);
      else if (source === 'synth') this.synth(RECIPES[id as SynthId], delay);
    } catch {
      // Audio darf das Spiel nie stören
    }
  }

  /** Eine Datei einmal abspielen, über den Master (Effekt-Lautstärke). */
  private playBuffer(buf: AudioBuffer, delaySec: number, rate: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    if (rate !== 1 && src.playbackRate) src.playbackRate.value = rate;
    src.connect(this.master!);
    src.start(ctx.currentTime + delaySec);
  }

  /**
   * Startet einen Loop-Sound (nur mit Datei; ohne Datei bleibt er stumm). `key` trennt gleichzeitige Loops,
   * z. B. je Spieler im Splitscreen. Läuft unter dem Schlüssel schon einer, passiert nichts.
   */
  startLoop(id: LoopId, key: string = id): void {
    if (this.muted || !this.ctx || !this.master || this.loops.has(key)) return;
    const buf = this.bufferFor(id);
    if (!buf) return;
    try {
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const env = ctx.createGain();
      env.gain.value = 1;
      src.connect(env);
      env.connect(this.master);
      src.start(ctx.currentTime);
      this.loops.set(key, { src, env });
    } catch {
      // Audio darf das Spiel nie stören
    }
  }

  /** Stoppt den Loop unter `key` (kurz ausgeblendet). Ohne laufenden Loop ein No-Op. */
  stopLoop(key: string): void {
    const loop = this.loops.get(key);
    if (!loop) return;
    this.loops.delete(key);
    try {
      const at = this.ctx?.currentTime ?? 0;
      loop.env.gain.setValueAtTime(loop.env.gain.value, at);
      loop.env.gain.linearRampToValueAtTime(0, at + LOOP_FADE_SEC);
      loop.src.stop(at + LOOP_FADE_SEC + 0.01);
    } catch {
      // schon gestoppt
    }
  }

  stopAllLoops(): void {
    for (const key of [...this.loops.keys()]) this.stopLoop(key);
  }

  /** Läuft unter `key` gerade ein Loop? */
  isLooping(key: string): boolean {
    return this.loops.has(key);
  }

  private synth(recipe: Recipe, delaySec = 0, ratio = 1): void {
    const ctx = this.ctx!;
    const out = this.master!;
    let at = ctx.currentTime + delaySec;
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
      if (note.f > 0) {
        const scaled = ratio === 1 ? note : { ...note, f: note.f * ratio, to: note.to === undefined ? undefined : note.to * ratio };
        this.tone(recipe, scaled, at, out);
      }
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
