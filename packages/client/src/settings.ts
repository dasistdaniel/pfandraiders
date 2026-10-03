export interface KeyValueStore {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

export const DEFAULT_VOLUME = 70;
const VOLUME_KEY = 'pfandraiders.volume';

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

/** Lautstärke in Prozent (0 bis 100). Wirft nie; ungültige Werte ergeben den Standard. */
export function loadVolume(store: KeyValueStore | undefined = defaultStore()): number {
  try {
    const raw = store?.getItem(VOLUME_KEY);
    if (raw === null || raw === undefined || raw.trim() === '') return DEFAULT_VOLUME;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > 100) return DEFAULT_VOLUME;
    return clampVolume(n);
  } catch {
    return DEFAULT_VOLUME;
  }
}

export function saveVolume(v: number, store: KeyValueStore | undefined = defaultStore()): void {
  try {
    if (!Number.isFinite(v)) return;
    store?.setItem(VOLUME_KEY, String(clampVolume(v)));
  } catch {
    // Speicher gesperrt: Lautstärke gilt nur für diese Sitzung
  }
}

/** Zehnerschritt, auf Vielfache von 10 ausgerichtet und auf 0 bis 100 begrenzt. */
export function stepVolume(v: number, dir: -1 | 1): number {
  if (!Number.isFinite(v)) return DEFAULT_VOLUME;
  const stepped = dir === 1 ? Math.floor(v / 10) * 10 + 10 : Math.ceil(v / 10) * 10 - 10;
  return clampVolume(stepped);
}
