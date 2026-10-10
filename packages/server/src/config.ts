import { DEFAULT_MAP_ID, isMapId, MAP_LIST } from '@pfandraiders/core';
import type { MapId } from '@pfandraiders/core';

/** Serverwerte (Spielwerte stehen in core/config.ts). */
export const SERVER_CONFIG = {
  /** Tickdauer in ms: 20 Ticks pro Sekunde */
  stepMs: 50,
  /** So lange kann ein getrennter Spieler mit seinem Token zurückkehren (Umgebungsvariable GRACE_MS) */
  graceMs: 120_000,
  /** Raum ohne verbundenen Spieler wird nach so langer Zeit gelöscht */
  emptyRoomMs: 120_000,
  maxRooms: 100,
  /** Höchstens so viele Nachrichten pro Sekunde und Verbindung */
  maxMessagesPerSecond: 120,
  pingEveryMs: 15_000,
  /** Mehr als so viele ungesendete Bytes pro Socket: Snapshots werden verworfen */
  maxBufferedBytes: 256 * 1024,
  /** Bleibt ein Socket so lange über der Grenze, wird er getrennt */
  bufferedStaleMs: 5000,
  maxConnections: 400,
  /** Höchstens eine rate_limited-Antwort pro Socket in diesem Abstand */
  rateNoticeMs: 1000,
  /** So lange dauerhaft über dem Limit: Verbindung schliessen (1008) */
  rateCloseMs: 5000,
  /** So viele Handler-Ausnahmen pro Socket, dann wird er geschlossen */
  maxHandlerErrors: 5,
  /** So viele Tick-Fehler in Folge, dann wird der Raum entfernt */
  maxTickFailures: 3,
  /** Lobby-Chat: Mindestabstand zwischen zwei Nachrichten eines Spielers */
  chatMinGapMs: 1000,
  /** Lobby-Chat: höchstens chatMaxPerWindow Nachrichten pro Spieler in diesem Zeitfenster */
  chatWindowMs: 10_000,
  chatMaxPerWindow: 5,
  /** Raumliste: mindestens so viele ms zwischen zwei Anfragen einer Verbindung */
  listRoomsMinGapMs: 1000,
  /** Falsche Passwörter: höchstens wrongPasswordMax je Verbindung in diesem gleitenden Fenster, danach rate_limited */
  wrongPasswordWindowMs: 60_000,
  wrongPasswordMax: 5,
};

/** Kleinste zulässige Frist für GRACE_MS in ms. */
export const MIN_GRACE_MS = 5000;
/** Größte zulässige Frist für GRACE_MS in ms (eine Stunde). */
export const MAX_GRACE_MS = 3_600_000;

/**
 * Wertet GRACE_MS aus: ganze Zahl in ms, zwischen MIN_GRACE_MS und MAX_GRACE_MS.
 * Alles andere (fehlend, leer, keine Zahl, zu klein, zu groß) ergibt den Standardwert.
 */
export function parseGraceMs(raw: string | undefined, fallback: number): number {
  const text = raw?.trim();
  if (!text) return fallback;
  const n = Number(text);
  return Number.isInteger(n) && n >= MIN_GRACE_MS && n <= MAX_GRACE_MS ? n : fallback;
}

/** Kleinste zulässige Rundenlänge für ROUND_MS in ms. */
export const MIN_ROUND_MS = 1000;

/**
 * Wertet ROUND_MS aus. Fehlend, leer oder nur Leerzeichen: nicht gesetzt (Standardlänge, keine Warnung).
 * Sonst muss es eine endliche Zahl ab MIN_ROUND_MS sein; alles andere ist ungültig (invalid = true).
 */
export function parseRoundMs(raw: string | undefined): { value: number | undefined; invalid: boolean } {
  const text = raw?.trim();
  if (!text) return { value: undefined, invalid: false };
  const n = Number(text);
  return Number.isFinite(n) && n >= MIN_ROUND_MS ? { value: n, invalid: false } : { value: undefined, invalid: true };
}

/** Wertet MAP_ID aus. Fehlend oder leer: Standardkarte ohne Warnung; unbekannt: Standardkarte, invalid = true. */
export function parseMapId(raw: string | undefined): { value: MapId; invalid: boolean } {
  const text = raw?.trim();
  if (!text) return { value: DEFAULT_MAP_ID, invalid: false };
  return isMapId(text) ? { value: text, invalid: false } : { value: DEFAULT_MAP_ID, invalid: true };
}

/** Warnung für eine unbekannte MAP_ID mit der Liste der bekannten Kennungen (eingebaute und eigene Karten). */
export function mapIdWarning(raw: string | undefined): string {
  const known = MAP_LIST.map((m) => m.id).join(', ');
  return `MAP_ID=${raw?.trim() ?? ''} ist ungültig (bekannt: ${known}), Standardwert ${DEFAULT_MAP_ID} wird genutzt.`;
}
