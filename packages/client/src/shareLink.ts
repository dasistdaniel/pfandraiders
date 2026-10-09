import { ROOM_CODE_LENGTH } from '@pfandraiders/core';
import { sanitizeRoomCode } from './onlineMenuLogic';

/**
 * Teilen-Link der Online-Lobby: <Adresse des Clients>?join=CODE. Wer ihn öffnet, landet im Online-Dialog auf
 * "Beitreten" mit vorausgefülltem Raumcode (den Namen tippt er selbst). Ein vorhandenes ?server= bleibt erhalten,
 * damit der Link auf denselben Server zeigt. Reine Funktionen bis auf den Standard-Fallback von copyText.
 */

const JOIN_PARAM = 'join';
const SERVER_PARAM = 'server';

/** Link aus der aktuellen Adresse (`href`) und dem Raumcode; andere Parameter und der Anker fallen weg. */
export function buildJoinLink(href: string, code: string): string {
  const current = new URL(href);
  const params = new URLSearchParams();
  params.set(JOIN_PARAM, sanitizeRoomCode(code));
  const server = current.searchParams.get(SERVER_PARAM);
  if (server !== null && server !== '') params.set(SERVER_PARAM, server);
  return `${current.origin}${current.pathname}?${params.toString()}`;
}

/** Raumcode aus ?join=…, bereinigt wie im Eingabefeld; null, wenn keiner da oder er unvollständig ist. */
export function parseJoinParam(search: string): string | null {
  const raw = new URLSearchParams(search).get(JOIN_PARAM);
  if (raw === null) return null;
  const code = sanitizeRoomCode(raw);
  return code.length === ROOM_CODE_LENGTH ? code : null;
}

/** Dieselbe Adresse ohne ?join= (damit der Dialog nach dem Zurückkehren ins Menü nicht erneut aufgeht). */
export function withoutJoinParam(href: string): string {
  const url = new URL(href);
  url.searchParams.delete(JOIN_PARAM);
  return url.toString();
}

export interface ClipboardEnv {
  /** navigator.clipboard; fehlt ohne sichere Verbindung (etwa http im LAN) */
  clipboard?: { writeText(text: string): Promise<void> } | undefined;
  /** Ersatzweg, liefert true bei Erfolg */
  fallback: (text: string) => boolean;
}

/** Kopiert über ein unsichtbares Textfeld und execCommand('copy') (veraltet, klappt aber auch ohne https). */
function textareaCopy(text: string): boolean {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.setAttribute('style', 'position:fixed;left:-9999px;top:0;opacity:0');
  document.body.appendChild(area);
  try {
    area.select();
    return document.execCommand('copy');
  } finally {
    area.remove();
  }
}

function defaultEnv(): ClipboardEnv {
  let clipboard: ClipboardEnv['clipboard'];
  try {
    clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
  } catch {
    clipboard = undefined;
  }
  return { clipboard, fallback: textareaCopy };
}

/** Text in die Zwischenablage: erst navigator.clipboard, sonst der Ersatzweg. Wirft nie; true bei Erfolg. */
export async function copyText(text: string, env: ClipboardEnv = defaultEnv()): Promise<boolean> {
  if (env.clipboard && typeof env.clipboard.writeText === 'function') {
    try {
      await env.clipboard.writeText(text);
      return true;
    } catch {
      // abgelehnt (keine Berechtigung, kein Fokus): Ersatzweg versuchen
    }
  }
  try {
    return env.fallback(text);
  } catch {
    return false;
  }
}
