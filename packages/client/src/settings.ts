export interface KeyValueStore {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

export const DEFAULT_VOLUME = 70;
const VOLUME_KEY = 'pfandraiders.volume';
export const DEFAULT_MUSIC_VOLUME = 40;
const MUSIC_VOLUME_KEY = 'pfandraiders.musicVolume';

function defaultStore(): KeyValueStore | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

function clampVolume(v: number): number {
  return Math.min(100, Math.max(0, Math.round(v)));
}

function loadPercent(key: string, fallback: number, store: KeyValueStore | undefined): number {
  try {
    const raw = store?.getItem(key);
    if (raw === null || raw === undefined || raw.trim() === '') return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > 100) return fallback;
    return clampVolume(n);
  } catch {
    return fallback;
  }
}

function savePercent(key: string, v: number, store: KeyValueStore | undefined): void {
  try {
    if (!Number.isFinite(v)) return;
    store?.setItem(key, String(clampVolume(v)));
  } catch {
    // Speicher gesperrt: Wert gilt nur für diese Sitzung
  }
}

/** Lautstärke in Prozent (0 bis 100). Wirft nie; ungültige Werte ergeben den Standard. */
export function loadVolume(store: KeyValueStore | undefined = defaultStore()): number {
  return loadPercent(VOLUME_KEY, DEFAULT_VOLUME, store);
}

export function saveVolume(v: number, store: KeyValueStore | undefined = defaultStore()): void {
  savePercent(VOLUME_KEY, v, store);
}

/** Musiklautstärke in Prozent (0 bis 100), gleiche Regeln wie die Effektlautstärke. */
export function loadMusicVolume(store: KeyValueStore | undefined = defaultStore()): number {
  return loadPercent(MUSIC_VOLUME_KEY, DEFAULT_MUSIC_VOLUME, store);
}

export function saveMusicVolume(v: number, store: KeyValueStore | undefined = defaultStore()): void {
  savePercent(MUSIC_VOLUME_KEY, v, store);
}

/** Zehnerschritt, auf Vielfache von 10 ausgerichtet und auf 0 bis 100 begrenzt. */
export function stepVolume(v: number, dir: -1 | 1): number {
  if (!Number.isFinite(v)) return DEFAULT_VOLUME;
  const stepped = dir === 1 ? Math.floor(v / 10) * 10 + 10 : Math.ceil(v / 10) * 10 - 10;
  return clampVolume(stepped);
}
