import { cleanMapName, MAX_LISTED_ROOMS, MAX_NAME_LENGTH, MAX_ROOM_NAME_LENGTH, MAX_ROOM_PLAYERS, ROOM_CODE_LENGTH } from '@pfandraiders/core';
import type { RoomInfo } from '@pfandraiders/core';
import { sanitizeRoomCode } from './onlineMenuLogic';

/** Spalten der Raumliste (Spec §5.3) */
export const ROOM_LIST_HEADER: readonly string[] = ['Raumname', 'Karte', 'Host', 'Spieler', 'Status'];
export const EMPTY_ROOM_LIST_TEXT = 'Keine öffentlichen Räume';
/** Der Server beantwortet höchstens eine Anfrage pro Sekunde */
export const ROOM_LIST_REFRESH_MS = 1000;

export interface RoomRow {
  code: string;
  name: string;
  /** Anzeigename der Karte, "?" wenn der Server keinen schickt */
  map: string;
  host: string;
  /** "3/8" */
  players: string;
  status: 'Lobby' | 'Voll' | 'Läuft';
  joinable: boolean;
  locked: boolean;
}

export type ListAction = { kind: 'join'; code: string } | { kind: 'password'; code: string; name: string } | null;

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function intIn(x: unknown, min: number, max: number): x is number {
  return typeof x === 'number' && Number.isInteger(x) && x >= min && x <= max;
}

/** Prüft die Raumliste vom Server: null = keine Liste; kaputte Einträge fallen weg; höchstens MAX_LISTED_ROOMS. */
export function parseRoomList(x: unknown): RoomInfo[] | null {
  if (!Array.isArray(x)) return null;
  const out: RoomInfo[] = [];
  for (const e of x) {
    if (out.length >= MAX_LISTED_ROOMS) break;
    if (!isObj(e)) continue;
    const { code, name, host, players, max, phase, locked, mapName } = e;
    if (typeof code !== 'string' || code.length !== ROOM_CODE_LENGTH || sanitizeRoomCode(code) !== code) continue;
    if (typeof name !== 'string' || name.length === 0 || name.length > MAX_ROOM_NAME_LENGTH) continue;
    if (typeof host !== 'string' || host.length === 0 || host.length > MAX_NAME_LENGTH) continue;
    if (!intIn(max, 1, MAX_ROOM_PLAYERS) || !intIn(players, 0, max)) continue;
    if (phase !== 'lobby' && phase !== 'playing' && phase !== 'shop') continue;
    if (typeof locked !== 'boolean') continue;
    // Ältere Server schicken keinen Kartennamen: Eintrag behalten, Name leer (die Zeile zeigt "?")
    out.push({ code, name, host, players, max, phase, locked, mapName: cleanMapName(mapName) ?? '' });
  }
  return out;
}

/** Beitretbar: Lobby mit freiem Platz (Spec §2.6). */
export function isJoinable(r: RoomInfo): boolean {
  return r.phase === 'lobby' && r.players < r.max;
}

export function roomRows(rooms: readonly RoomInfo[]): RoomRow[] {
  return rooms.map((r) => ({
    code: r.code,
    name: r.name,
    map: r.mapName || '?',
    host: r.host,
    players: `${r.players}/${r.max}`,
    status: r.phase !== 'lobby' ? 'Läuft' : r.players < r.max ? 'Lobby' : 'Voll',
    joinable: isJoinable(r),
    locked: r.locked,
  }));
}

/** Erste wählbare Zeile; -1 = keine. */
export function firstSelectable(rows: readonly RoomRow[]): number {
  return rows.findIndex((r) => r.joinable);
}

/** Nächste wählbare Zeile in Richtung `dir`; graue werden übersprungen; am Ende bleibt die Auswahl. */
export function moveSelection(rows: readonly RoomRow[], current: number, dir: 1 | -1): number {
  if (current < 0) return firstSelectable(rows);
  for (let i = current + dir; i >= 0 && i < rows.length; i += dir) {
    if (rows[i].joinable) return i;
  }
  return current;
}

/** Was Enter oder Klick auf einer Zeile auslöst: direkt beitreten, erst Passwort fragen oder nichts (grau). */
export function listAction(row: RoomRow | undefined): ListAction {
  if (!row || !row.joinable) return null;
  return row.locked ? { kind: 'password', code: row.code, name: row.name } : { kind: 'join', code: row.code };
}

/** Darf die Liste neu geladen werden? (höchstens einmal pro ROOM_LIST_REFRESH_MS) */
export function refreshAllowed(last: number, now: number): boolean {
  return now - last >= ROOM_LIST_REFRESH_MS;
}
