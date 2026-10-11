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

/** Tab um `d` Schritte weiter (-1 vorige, +1 nächste), mit Umbruch. */
export function stepTab(current: MenuTab, d: number): MenuTab {
  const i = TABS.indexOf(current);
  const n = TABS.length;
  return TABS[(((i + Math.sign(d)) % n) + n) % n];
}

/** Bild↑ = voriger Tab, Bild↓ = nächster Tab (überall im Dialog, auch in Eingabefeldern); sonst 0. */
export function pageTabStep(key: string): -1 | 0 | 1 {
  return key === 'PageUp' ? -1 : key === 'PageDown' ? 1 : 0;
}

/** Gamepad-Knöpfe im Standard-Layout: 4 = LB (L1), 5 = RB (R1). */
const PAD_LB = 4;
const PAD_RB = 5;

/** Was der Dialog von navigator.getGamepads() braucht. */
export interface PadLike {
  buttons: readonly { pressed: boolean }[];
}

/**
 * Erkennt neu gedrückte LB/RB auf allen Gamepads (-1 voriger Tab, +1 nächster, 0 nichts).
 * Ein Pad, das zum ersten Mal (oder nach dem Abziehen wieder) auftaucht, zählt erst nach dem Loslassen,
 * damit eine beim Öffnen des Dialogs gehaltene Taste nicht umschaltet.
 */
export class PadTabEdges {
  private prev = new Map<number, { lb: boolean; rb: boolean }>();

  update(pads: readonly (PadLike | null | undefined)[]): -1 | 0 | 1 {
    const next = new Map<number, { lb: boolean; rb: boolean }>();
    let step = 0;
    pads.forEach((pad, i) => {
      if (!pad) return;
      const now = { lb: pad.buttons[PAD_LB]?.pressed === true, rb: pad.buttons[PAD_RB]?.pressed === true };
      const before = this.prev.get(i);
      if (before) {
        if (now.lb && !before.lb) step -= 1;
        if (now.rb && !before.rb) step += 1;
      }
      next.set(i, now);
    });
    this.prev = next;
    return Math.sign(step) as -1 | 0 | 1;
  }
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
