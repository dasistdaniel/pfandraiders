import type { DeviceRef } from './devices';

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

// ---- Steuerung online ----

const ONLINE_DEVICE_KEY = 'pfandraiders.onlineDevice';
const AUTO_SWITCH_KEY = 'pfandraiders.autoSwitch';

/** Wählbare Geräte für den einen Online-Platz, in der Reihenfolge des Menüs. */
export const ONLINE_DEVICES: readonly DeviceRef[] = [
  { kind: 'keyboard', layout: 0 },
  { kind: 'keyboard', layout: 1 },
  { kind: 'pad', index: 0 },
  { kind: 'pad', index: 1 },
  { kind: 'pad', index: 2 },
  { kind: 'pad', index: 3 },
];

export const DEFAULT_ONLINE_DEVICE: DeviceRef = { kind: 'keyboard', layout: 0 };

const sameDevice = (a: DeviceRef, b: DeviceRef): boolean =>
  a.kind === 'keyboard' ? b.kind === 'keyboard' && a.layout === b.layout : b.kind === 'pad' && a.index === b.index;

/** Kopie, damit niemand die Einträge von ONLINE_DEVICES verändert. */
const copy = (d: DeviceRef): DeviceRef => ({ ...d });

/** "kb:0", "kb:1", "pad:0" bis "pad:3". */
export function serializeDevice(d: DeviceRef): string {
  return d.kind === 'keyboard' ? `kb:${d.layout}` : `pad:${d.index}`;
}

/** Gegenstück zu serializeDevice; alles Unbekannte ergibt Tastatur 1. */
export function parseDevice(raw: string | null | undefined): DeviceRef {
  const found = ONLINE_DEVICES.find((d) => serializeDevice(d) === raw);
  return copy(found ?? DEFAULT_ONLINE_DEVICE);
}

/** Anzeige im Menü: "Tastatur 1", "Gamepad 3". */
export function deviceLabel(d: DeviceRef): string {
  return d.kind === 'keyboard' ? `Tastatur ${d.layout + 1}` : `Gamepad ${d.index + 1}`;
}

/** Nächstes oder voriges Gerät, zyklisch. */
export function stepDevice(d: DeviceRef, dir: -1 | 1): DeviceRef {
  const n = ONLINE_DEVICES.length;
  const i = Math.max(0, ONLINE_DEVICES.findIndex((x) => sameDevice(x, d)));
  return copy(ONLINE_DEVICES[(i + dir + n) % n]);
}

/** Gerät für das Online-Spiel. Wirft nie; ungültige Werte ergeben Tastatur 1. */
export function loadOnlineDevice(store: KeyValueStore | undefined = defaultStore()): DeviceRef {
  try {
    return parseDevice(store?.getItem(ONLINE_DEVICE_KEY));
  } catch {
    return copy(DEFAULT_ONLINE_DEVICE);
  }
}

export function saveOnlineDevice(d: DeviceRef, store: KeyValueStore | undefined = defaultStore()): void {
  try {
    store?.setItem(ONLINE_DEVICE_KEY, serializeDevice(d));
  } catch {
    // Speicher gesperrt: Wahl gilt nur für diese Sitzung
  }
}

/** Auto-Wechsel aufs Gamepad (Standard an). Wirft nie. */
export function loadAutoSwitch(store: KeyValueStore | undefined = defaultStore()): boolean {
  try {
    return store?.getItem(AUTO_SWITCH_KEY) !== '0';
  } catch {
    return true;
  }
}

export function saveAutoSwitch(on: boolean, store: KeyValueStore | undefined = defaultStore()): void {
  try {
    store?.setItem(AUTO_SWITCH_KEY, on ? '1' : '0');
  } catch {
    // Speicher gesperrt: Wahl gilt nur für diese Sitzung
  }
}

/**
 * Online mit Tastatur gespielt und eine Gamepad-Taste gedrückt: auf dieses Gamepad wechseln?
 * Liefert das neue Gerät oder null (Auto-Wechsel aus, schon ein Gamepad gewählt, unbekanntes Pad).
 */
export function autoSwitchTarget(current: DeviceRef, enabled: boolean, padIndex: number): DeviceRef | null {
  if (!enabled || current.kind !== 'keyboard') return null;
  const target = ONLINE_DEVICES.find((d) => d.kind === 'pad' && d.index === padIndex);
  return target ? copy(target) : null;
}
