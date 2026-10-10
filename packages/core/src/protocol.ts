import { CONFIG } from './config';
import { sanitizeInput } from './sanitize';
import { isAvatar } from './avatars';
import { isShopCategory, isShopItemId } from './shop';
import type { Progress } from './shop';
import type { RankEntry } from './ranking';
import { isMapId } from './maps';
import type { MapId } from './maps';
import type { GameState, Input, MapData, ShopCategory, ShopItemId } from './types';

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

/** Längster Raumname nach dem Bereinigen (UTF-16-Einheiten wie bei Namen) */
export const MAX_ROOM_NAME_LENGTH = 24;
/** Längstes Raum-Passwort nach dem Bereinigen */
export const MAX_PASSWORD_LENGTH = 16;
/** Erlaubte Rundenzahlen einer Serie; 0 = offen (der Host beendet die Serie) */
export const ROUNDS_CHOICES: readonly number[] = [1, 3, 5, 0];
/** Standard-Rundenzahl */
export const DEFAULT_ROUNDS = 3;
/** Höchstens so viele Einträge hat die Raumliste */
export const MAX_LISTED_ROOMS = 50;

export function isRounds(v: unknown): v is number {
  return typeof v === 'number' && ROUNDS_CHOICES.includes(v);
}

/** public = in der Raumliste, private = nur per Code */
export type RoomVisibility = 'public' | 'private';

export function isVisibility(v: unknown): v is RoomVisibility {
  return v === 'public' || v === 'private';
}

/** Eintrag der Raumliste: ohne Token, Passwörter und Spieler-IDs. */
export interface RoomInfo {
  code: string;
  name: string;
  /** Name des Hosts */
  host: string;
  /** Mitglieder (auch getrennte in der Rückkehrfrist) */
  players: number;
  max: number;
  /** Phase 'final' wird als 'shop' gemeldet (läuft, nicht beitretbar) */
  phase: 'lobby' | 'playing' | 'shop';
  /** Raum hat ein Passwort */
  locked: boolean;
  /** Anzeigename der gewählten Karte */
  mapName: string;
}

/** Standard-Raumname "<Name>s Raum"; auf s, ß, x, z endende Namen bekommen den Apostroph ("Klaus' Raum"). */
export function defaultRoomName(name: string): string {
  return /[sßxz]$/i.test(name) ? `${name}' Raum` : `${name}s Raum`;
}

/** Erlaubte Rundenzeiten in ms: 3, 5, 7, 10 Minuten (Spec §2) */
export const ROUND_MS_CHOICES: readonly number[] = [180_000, 300_000, 420_000, 600_000];
/** Standard-Rundenzeit: 5 Minuten */
export const DEFAULT_ROUND_MS = CONFIG.roundMs;

export function isRoundMs(v: unknown): v is number {
  return typeof v === 'number' && ROUND_MS_CHOICES.includes(v);
}

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
  | 'chat_closed'
  /** Nachricht passt nicht zur Phase des Raums (etwa Kaufen während der Runde) */
  | 'wrong_phase'
  /** Kauf abgelehnt (Geld, Bestand, Artikel) */
  | 'cannot_buy'
  /** Raum hat ein Passwort und es fehlt oder ist falsch */
  | 'wrong_password'
  /** Figur ist im Raum schon vergeben */
  | 'avatar_taken';

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
  /** Raum anlegen; roomName fehlt = Standardname, visibility fehlt = public, password fehlt = keins, avatar = Wunschfigur */
  | { t: 'create'; name: string; roomName?: string; visibility?: RoomVisibility; password?: string; avatar?: number }
  /** Raum betreten; password nur für Räume mit Passwort nötig (nicht bei Rückkehr mit gültigem Token) */
  | { t: 'join'; room: string; name: string; token?: string; password?: string; avatar?: number }
  /** Serie starten (nur Host, nur Lobby); roundMs optional, der Server prüft ihn gegen ROUND_MS_CHOICES */
  | { t: 'start'; roundMs?: number }
  | { t: 'input'; seq: number; input: Input }
  /** Spieler verlässt den Raum absichtlich: sein Platz wird sofort frei, keine Rückkehr mit dem Token. */
  | { t: 'leave' }
  /** Chatnachricht, nur in der Lobby */
  | { t: 'chat'; text: string }
  /** Shop-Phase: bereit oder nicht mehr bereit */
  | { t: 'ready'; ready: boolean }
  /** Shop-Phase: kaufen (Menge 1 bis 99; der Server lehnt ohne Teilkauf ab) */
  | { t: 'shopBuy'; category: ShopCategory; item: ShopItemId; qty: number }
  /** Rundenzeit setzen (nur Host, nicht während einer Runde) */
  | { t: 'setRoundMs'; roundMs: number }
  /** Serie vorzeitig beenden, weiter zur Endwertung (nur Host, nur Shop) */
  | { t: 'endSeries' }
  /** Öffentliche Räume abfragen (jederzeit, auch ohne Raum; höchstens einmal pro Sekunde) */
  | { t: 'listRooms' }
  /** Eigene Figur wählen (nur Lobby) */
  | { t: 'setAvatar'; avatar: number }
  /** Rundenzahl setzen (nur Host, nur Lobby): 1, 3, 5 oder 0 = offen */
  | { t: 'setRounds'; rounds: number }
  /** Karte wählen (nur Host, nur Lobby); unbekannte Kennungen machen die Nachricht ungültig */
  | { t: 'setMap'; mapId: MapId }
  /** Nach der Endwertung zurück in die Lobby (nur Host, nur Phase final) */
  | { t: 'toLobby' };

export interface RosterEntry {
  id: string;
  name: string;
  color: number;
  connected: boolean;
  /** Shop-Phase: hat "Bereit" gedrückt (sonst immer false) */
  ready: boolean;
  /** Figur (Index 0 bis AVATAR_COUNT - 1), im Raum eindeutig */
  avatar: number;
}

/** lobby = Warteraum, playing = Runde läuft, shop = Rangliste und Einkaufen zwischen den Runden, final = Endwertung der Serie */
export type RoomPhase = 'lobby' | 'playing' | 'shop' | 'final';

export type ServerMessage =
  | { t: 'error'; code: ErrorCode; message: string }
  | { t: 'joined'; room: string; you: string; token: string; build?: ServerBuild }
  | {
      t: 'lobby';
      room: string;
      roomName: string;
      visibility: RoomVisibility;
      /** Raum hat ein Passwort (das Passwort selbst wird nie gesendet) */
      locked: boolean;
      host: string;
      players: RosterEntry[];
      phase: RoomPhase;
      roundMs: number;
      /** Rundenzahl der Serie (0 = offen) */
      rounds: number;
      /** Gewählte Karte für den nächsten Serienstart und ihr Anzeigename */
      mapId: MapId;
      mapName: string;
    }
  | {
      t: 'start';
      mapId: MapId;
      map: MapData;
      you: string;
      players: RosterEntry[];
      snap: Snapshot;
      roundMs: number;
      rounds: number;
      /** Nummer der laufenden Runde ab 1 */
      round: number;
    }
  | { t: 'snap'; snap: Snapshot; ack: number }
  | ({ t: 'chat' } & ChatMessage)
  /** Bisheriger Chat des Raums, direkt nach joined */
  | { t: 'chathistory'; messages: ChatMessage[] }
  /** Phase des Raums hat gewechselt (auch nach einer Rückkehr in die Shop-Phase) */
  | { t: 'phase'; phase: RoomPhase }
  /** Eigener Stand in der Shop-Phase (nur an diesen Spieler) */
  | { t: 'shopState'; you: Progress; ready: boolean }
  /** Rangliste: in der Shop-Phase die der letzten Runde, in der Phase final die Endwertung nach Gesamtverdienst */
  | { t: 'ranking'; entries: RankEntry[] }
  /** Antwort auf listRooms */
  | { t: 'rooms'; rooms: RoomInfo[] };

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

/**
 * Bereinigt Raumname und Passwort: Steuer- und Formatzeichen (\p{Cc}, \p{Cf}) entfernen, trimmen.
 * null = keine Zeichenkette oder danach länger als `max` (UTF-16-Einheiten); '' = leer (gilt als fehlend).
 */
export function cleanField(raw: unknown, max: number): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw.replace(/[\p{Cc}\p{Cf}]/gu, '').trim();
  return text.length > max ? null : text;
}

/**
 * Optionales Textfeld: fehlt = undefined (ok), ungültig = null (Nachricht verwerfen), leer = undefined.
 */
function optionalField(raw: unknown, max: number): string | undefined | null {
  if (raw === undefined) return undefined;
  const text = cleanField(raw, max);
  if (text === null) return null;
  return text === '' ? undefined : text;
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
      if (name === null) return null;
      const roomName = optionalField(m.roomName, MAX_ROOM_NAME_LENGTH);
      const password = optionalField(m.password, MAX_PASSWORD_LENGTH);
      if (roomName === null || password === null) return null;
      const visibility = m.visibility;
      if (visibility !== undefined && !isVisibility(visibility)) return null;
      const msg: Extract<ClientMessage, { t: 'create' }> = { t: 'create', name };
      if (roomName !== undefined) msg.roomName = roomName;
      if (visibility !== undefined) msg.visibility = visibility;
      if (password !== undefined) msg.password = password;
      // Ungültiger Wunsch wird still verworfen (der Server vergibt dann selbst)
      if (isAvatar(m.avatar)) msg.avatar = m.avatar;
      return msg;
    }
    case 'join': {
      const name = cleanName(m.name);
      const room = cleanRoom(m.room);
      if (name === null || room === null) return null;
      const msg: Extract<ClientMessage, { t: 'join' }> = { t: 'join', room, name };
      if (m.token !== undefined) {
        if (typeof m.token !== 'string' || m.token.length === 0 || m.token.length > MAX_TOKEN_LENGTH) return null;
        msg.token = m.token;
      }
      const password = optionalField(m.password, MAX_PASSWORD_LENGTH);
      if (password === null) return null;
      if (password !== undefined) msg.password = password;
      if (isAvatar(m.avatar)) msg.avatar = m.avatar;
      return msg;
    }
    case 'start':
      // Ungültige Zahlen setzt der Raum auf den Standard; Nicht-Zahlen gelten als "nicht angegeben"
      return typeof m.roundMs === 'number' && Number.isFinite(m.roundMs)
        ? { t: 'start', roundMs: m.roundMs }
        : { t: 'start' };
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
    case 'ready':
      return typeof m.ready === 'boolean' ? { t: 'ready', ready: m.ready } : null;
    case 'shopBuy': {
      const qty = m.qty;
      if (!isShopCategory(m.category) || !isShopItemId(m.item)) return null;
      if (typeof qty !== 'number' || !Number.isInteger(qty) || qty < 1 || qty > CONFIG.shop.maxStack) return null;
      return { t: 'shopBuy', category: m.category, item: m.item, qty };
    }
    case 'setRoundMs':
      return isRoundMs(m.roundMs) ? { t: 'setRoundMs', roundMs: m.roundMs } : null;
    case 'endSeries':
      return { t: 'endSeries' };
    case 'listRooms':
      return { t: 'listRooms' };
    case 'setAvatar':
      return isAvatar(m.avatar) ? { t: 'setAvatar', avatar: m.avatar } : null;
    case 'setRounds':
      return isRounds(m.rounds) ? { t: 'setRounds', rounds: m.rounds } : null;
    case 'setMap':
      return isMapId(m.mapId) ? { t: 'setMap', mapId: m.mapId } : null;
    case 'toLobby':
      return { t: 'toLobby' };
    default:
      return null;
  }
}
