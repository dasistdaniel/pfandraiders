import { cleanField, MAX_PASSWORD_LENGTH, MAX_ROOM_NAME_LENGTH, ROOM_CODE_CHARS, ROOM_CODE_LENGTH } from '@pfandraiders/core';
import type { RoomVisibility } from '@pfandraiders/core';

export type MenuTab = 'host' | 'join' | 'list';

export const TABS: readonly MenuTab[] = ['host', 'join', 'list'];

export const TAB_LABELS: Record<MenuTab, string> = { host: 'Raum erstellen', join: 'Beitreten', list: 'Raumliste' };

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
  return raw === 'join' || raw === 'list' ? raw : 'host';
}

/** Eingaben des Tabs "Raum erstellen" (roh) */
export interface CreateForm {
  roomName: string;
  visibility: RoomVisibility;
  password: string;
}

export type CreateRequest =
  | { ok: true; value: { roomName?: string; visibility: RoomVisibility; password?: string } }
  | { ok: false; error: string };

/** Bereinigt wie der Server (cleanField); leere Felder entfallen, zu lange ergeben einen deutschen Hinweis. */
export function createRequest(form: CreateForm): CreateRequest {
  const roomName = cleanField(form.roomName, MAX_ROOM_NAME_LENGTH);
  if (roomName === null) return { ok: false, error: `Raumname: höchstens ${MAX_ROOM_NAME_LENGTH} Zeichen.` };
  const password = cleanField(form.password, MAX_PASSWORD_LENGTH);
  if (password === null) return { ok: false, error: `Passwort: höchstens ${MAX_PASSWORD_LENGTH} Zeichen.` };
  const value: { roomName?: string; visibility: RoomVisibility; password?: string } = { visibility: form.visibility };
  if (roomName !== '') value.roomName = roomName;
  if (password !== '') value.password = password;
  return { ok: true, value };
}

/**
 * Verbindungsverlust melden? Ohne Raum schließt der Server ein ungenutztes Socket nach 30 s Leerlauf
 * (etwa beim Stöbern in der Raumliste); das ist kein Fehler, die nächste Aktion verbindet neu.
 */
export function shouldReportClose(room: string): boolean {
  return room !== '';
}
