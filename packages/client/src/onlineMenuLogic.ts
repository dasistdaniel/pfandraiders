import { ROOM_CODE_CHARS, ROOM_CODE_LENGTH } from '@pfandraiders/core';

export type MenuTab = 'host' | 'join';

const TABS: MenuTab[] = ['host', 'join'];

/** Raumcode bereinigen: Großbuchstaben, nur erlaubte Zeichen, höchstens ROOM_CODE_LENGTH. */
export function sanitizeRoomCode(raw: string): string {
  let out = '';
  for (const ch of raw.toUpperCase()) {
    if (ROOM_CODE_CHARS.includes(ch)) out += ch;
    if (out.length >= ROOM_CODE_LENGTH) break;
  }
  return out;
}

/** Tab nach Pfeiltaste; ArrowLeft/ArrowRight wechseln (mit Umbruch), andere Tasten ändern nichts. */
export function nextTab(current: MenuTab, key: string): MenuTab {
  if (key !== 'ArrowLeft' && key !== 'ArrowRight') return current;
  const i = TABS.indexOf(current);
  const step = key === 'ArrowRight' ? 1 : -1;
  return TABS[(i + step + TABS.length) % TABS.length];
}

/** Gespeicherten Tab lesen; alles Unbekannte ergibt 'host'. */
export function parseTab(raw: unknown): MenuTab {
  return raw === 'join' ? 'join' : 'host';
}
