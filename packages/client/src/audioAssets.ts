import { MANIFEST_FILE, parseManifest } from './audioManifest';
import type { AudioManifest } from './audioManifest';

/** Zustand einer Audiodatei: none = keine Datei (Ersatzklang), pending = wird geladen, ready = Puffer da, failed = kaputt. */
export type AssetState = 'none' | 'pending' | 'ready' | 'failed';

/** Das Nötigste von fetch(), damit Tests es ersetzen können. */
export type Fetcher = (url: string) => Promise<{
  ok: boolean;
  json(): Promise<unknown>;
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

/** So lange darf das Manifest höchstens brauchen; danach gilt es als leer (Ersatzklänge). */
export const MANIFEST_TIMEOUT_MS = 4000;

const EMPTY: AudioManifest = { sounds: {}, music: {} };

function defaultFetch(): Fetcher | null {
  const f = (globalThis as { fetch?: Fetcher }).fetch;
  return typeof f === 'function' ? (url) => f(url) : null;
}

function defaultBase(): string {
  try {
    return import.meta.env.BASE_URL ?? './';
  } catch {
    return './';
  }
}

/** decodeAudioData als Promise, auch für ältere Browser mit reiner Callback-Form. Wirft nie synchron. */
export function decodeAudio(ctx: AudioContext, data: ArrayBuffer): Promise<AudioBuffer> {
  return new Promise<AudioBuffer>((resolve, reject) => {
    try {
      if (typeof ctx.decodeAudioData !== 'function') throw new Error('kein decodeAudioData');
      const p = ctx.decodeAudioData(data, resolve, reject) as Promise<AudioBuffer> | undefined;
      if (p && typeof p.then === 'function') p.then(resolve, reject);
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Lädt die eigenen Audiodateien laut Manifest (audio-manifest.json, siehe vite-audio.ts) und hält die
 * dekodierten Puffer. Das Manifest kommt sofort, die Dateien erst nach der ersten Nutzergeste (load mit dem
 * freigeschalteten AudioContext). Jeder Fehler (Netz, kaputte Datei, fehlendes WebAudio) lässt nur die betroffene
 * Datei weg: dann gilt der Ersatzklang. Nichts hier wirft.
 */
export class AudioAssets {
  private manifest: AudioManifest | null = null;
  private manifestPromise: Promise<AudioManifest> | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private failed = new Set<string>();
  private loading: Promise<void> | null = null;
  private listeners = new Set<() => void>();

  constructor(
    private readonly fetchFn: Fetcher | null = defaultFetch(),
    private readonly base: string = defaultBase(),
    private readonly timeout: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  private url(path: string): string {
    return this.base.endsWith('/') ? this.base + path : `${this.base}/${path}`;
  }

  /** Lädt das Manifest (einmal); bei jedem Fehler ist es leer. */
  loadManifest(): Promise<AudioManifest> {
    if (!this.manifestPromise) {
      const fetchFn = this.fetchFn;
      const load = async (): Promise<AudioManifest> => {
        if (!fetchFn) return EMPTY;
        const res = await fetchFn(this.url(MANIFEST_FILE));
        return res.ok ? parseManifest(await res.json()) : EMPTY;
      };
      const timedOut = this.timeout(MANIFEST_TIMEOUT_MS).then(() => EMPTY);
      this.manifestPromise = Promise.race([load(), timedOut])
        .catch(() => EMPTY)
        .then((m) => {
          this.manifest = m;
          this.emit();
          return m;
        });
    }
    return this.manifestPromise;
  }

  /** Nach der ersten Nutzergeste: alle Dateien des Manifests laden und dekodieren (einmal). */
  load(ctx: AudioContext): Promise<void> {
    if (!this.loading) {
      this.loading = this.loadManifest()
        .then(async (m) => {
          const entries = [...Object.entries(m.music), ...Object.entries(m.sounds)];
          await Promise.all(entries.map(([id, path]) => this.loadOne(ctx, id, path)));
        })
        .catch(() => undefined);
    }
    return this.loading;
  }

  private async loadOne(ctx: AudioContext, id: string, path: string): Promise<void> {
    try {
      if (!this.fetchFn) throw new Error('kein fetch');
      const res = await this.fetchFn(this.url(path));
      if (!res.ok) throw new Error(`HTTP-Fehler bei ${path}`);
      const buf = await decodeAudio(ctx, await res.arrayBuffer());
      this.buffers.set(id, buf);
    } catch {
      this.failed.add(id);
    }
    this.emit();
  }

  /** Dekodierter Puffer einer ID oder null (keine Datei, noch nicht geladen oder kaputt). */
  buffer(id: string): AudioBuffer | null {
    return this.buffers.get(id) ?? null;
  }

  has(id: string): boolean {
    return this.buffers.has(id);
  }

  /** Vor dem Manifest ist alles 'pending', danach je Datei. */
  state(id: string): AssetState {
    if (this.buffers.has(id)) return 'ready';
    if (this.failed.has(id)) return 'failed';
    const m = this.manifest;
    if (!m) return this.fetchFn ? 'pending' : 'none';
    return id in m.sounds || id in m.music ? 'pending' : 'none';
  }

  /** Meldet jede Änderung (Manifest da, Datei geladen oder gescheitert). Liefert die Abmeldung. */
  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) {
      try {
        fn();
      } catch {
        // ein kaputter Zuhörer hält die anderen nicht auf
      }
    }
  }
}
