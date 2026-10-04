import { sanitizeInput } from './sanitize';
import type { MapId } from './maps';
import type { GameState, Input, MapData } from './types';

/** Vom Server gesendeter Zustand ohne die (statische) Karte. */
export type Snapshot = Omit<GameState, 'map'>;

export const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 4;
export const MAX_ROOM_PLAYERS = 8;
export const MIN_START_PLAYERS = 2;
export const MAX_NAME_LENGTH = 16;
export const MAX_TOKEN_LENGTH = 64;
/** Größte erlaubte Nachricht vom Client in Bytes */
export const MAX_MESSAGE_BYTES = 4096;
/** Spielerfarben (0xRRGGBB), Index = Beitrittsreihenfolge */
export const ROOM_COLORS = [
  0xef5350, 0xab47bc, 0x26c6da, 0xec407a, 0xffa726, 0x66bb6a, 0x8d6e63, 0x5c6bc0,
];

/** Längste Chatnachricht in Unicode-Codepunkten (nach dem Bereinigen; Längeres wird gekürzt) */
export const MAX_CHAT_LENGTH = 140;
/** Längerer Rohtext einer Chatnachricht wird ganz verworfen */
export const MAX_CHAT_RAW_LENGTH = 1000;
/** So viele Chatnachrichten behält ein Raum für Nachzügler */
export const CHAT_HISTORY_SIZE = 30;

/** Größte Länge von Buildnummer und Kurz-Hash in der joined-Nachricht */
export const MAX_BUILD_FIELD_LENGTH = 16;

/** Build des Servers: Nummer (Commit-Anzahl oder "dev") und Kurz-Hash (leer = unbekannt). */
export interface ServerBuild {
  number: string;
  sha: string;
}

export type ErrorCode =
  | 'bad_message'
  | 'room_not_found'
  | 'room_full'
  | 'name_taken'
  | 'not_host'
  | 'already_started'
  | 'need_players'
  | 'not_in_room'
  | 'rate_limited'
  | 'too_many_rooms'
  | 'chat_too_fast'
  | 'chat_closed';

/** Eine Chatnachricht der Lobby; id, name und color stammen aus der Spielerliste des Servers. */
export interface ChatMessage {
  id: string;
  name: string;
  color: number;
  text: string;
  /** Serverzeit in ms */
  at: number;
}

export type ClientMessage =
  | { t: 'create'; name: string }
  | { t: 'join'; room: string; name: string; token?: string }
  | { t: 'start' }
  | { t: 'input'; seq: number; input: Input }
  /** Spieler verlässt den Raum absichtlich: sein Platz wird sofort frei, keine Rückkehr mit dem Token. */
  | { t: 'leave' }
  /** Chatnachricht, nur in der Lobby */
  | { t: 'chat'; text: string };

export interface RosterEntry {
  id: string;
  name: string;
  color: number;
  connected: boolean;
}

export type RoomPhase = 'lobby' | 'running' | 'ended';

export type ServerMessage =
  | { t: 'error'; code: ErrorCode; message: string }
  | { t: 'joined'; room: string; you: string; token: string; build?: ServerBuild }
  | { t: 'lobby'; room: string; host: string; players: RosterEntry[]; phase: RoomPhase }
  | { t: 'start'; mapId: MapId; map: MapData; you: string; players: RosterEntry[]; snap: Snapshot }
  | { t: 'snap'; snap: Snapshot; ack: number }
  | ({ t: 'chat' } & ChatMessage)
  /** Bisheriger Chat des Raums, direkt nach joined */
  | { t: 'chathistory'; messages: ChatMessage[] };

/**
 * Bereinigt eine Chatnachricht: Leerraum zu einem Leerzeichen, Steuer- und Formatzeichen
 * (\p{Cc}, \p{Cf}: Nullbreite, Richtungswechsel ...) entfernen, trimmen, auf MAX_CHAT_LENGTH
 * Codepunkte kürzen. null = keine Zeichenkette, leer oder Rohtext länger als MAX_CHAT_RAW_LENGTH.
 */
export function cleanChat(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > MAX_CHAT_RAW_LENGTH) return null;
  // Zeilenumbrüche und Tabs sind auch Steuerzeichen: erst zu Leerzeichen machen, dann entfernen
  const text = raw
    .replace(/\s+/gu, ' ')
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
  const cut = [...text].slice(0, MAX_CHAT_LENGTH).join('').trim();
  return cut.length === 0 ? null : cut;
}

function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  // Steuerzeichen entfernen, Ränder trimmen
  const name = raw.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (name.length === 0 || name.length > MAX_NAME_LENGTH) return null;
  return name;
}

function cleanRoom(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.toUpperCase();
  if (code.length !== ROOM_CODE_LENGTH) return null;
  for (const ch of code) if (!ROOM_CODE_CHARS.includes(ch)) return null;
  return code;
}

/** Prüft das build-Feld aus joined: zwei Zeichenketten, höchstens MAX_BUILD_FIELD_LENGTH lang. null = ungültig oder fehlend. */
export function parseServerBuild(raw: unknown): ServerBuild | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const { number, sha } = raw as Record<string, unknown>;
  if (typeof number !== 'string' || typeof sha !== 'string') return null;
  if (number.length > MAX_BUILD_FIELD_LENGTH || sha.length > MAX_BUILD_FIELD_LENGTH) return null;
  return { number, sha };
}

/** Prüft eine Client-Nachricht (bereits aus JSON geparst). null = ungültig. */
export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const m = raw as Record<string, unknown>;
  switch (m.t) {
    case 'create': {
      const name = cleanName(m.name);
      return name === null ? null : { t: 'create', name };
    }
    case 'join': {
      const name = cleanName(m.name);
      const room = cleanRoom(m.room);
      if (name === null || room === null) return null;
      if (m.token === undefined) return { t: 'join', room, name };
      if (typeof m.token !== 'string' || m.token.length === 0 || m.token.length > MAX_TOKEN_LENGTH) {
        return null;
      }
      return { t: 'join', room, name, token: m.token };
    }
    case 'start':
      return { t: 'start' };
    case 'input': {
      const seq = m.seq;
      if (typeof seq !== 'number' || !Number.isSafeInteger(seq) || seq < 0) return null;
      return { t: 'input', seq, input: sanitizeInput(m.input) };
    }
    case 'leave':
      return { t: 'leave' };
    case 'chat': {
      const text = cleanChat(m.text);
      return text === null ? null : { t: 'chat', text };
    }
    default:
      return null;
  }
}
