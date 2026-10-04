import { MAX_NAME_LENGTH } from '@pfandraiders/core';
import type { ChatMessage, RosterEntry } from '@pfandraiders/core';

/** Längster Chattext, den der Client annimmt (Codepunkte; der Server schickt höchstens 140). */
export const MAX_CHAT_TEXT_CLIENT = 200;
/** So viele Chatnachrichten behält der Client. */
export const CLIENT_CHAT_SIZE = 50;
const MAX_ID_LENGTH = 32;
const FALLBACK_COLOR = '#ffffff';

/** Prüft eine Chatnachricht vom Server. null = verwerfen. */
export function parseChatMessage(raw: unknown): ChatMessage | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const { id, name, color, text, at } = raw as Record<string, unknown>;
  if (typeof id !== 'string' || id.length === 0 || id.length > MAX_ID_LENGTH) return null;
  if (typeof name !== 'string' || name.length === 0 || name.length > MAX_NAME_LENGTH) return null;
  if (typeof color !== 'number' || !Number.isFinite(color)) return null;
  if (typeof text !== 'string' || text.length === 0 || [...text].length > MAX_CHAT_TEXT_CLIENT) return null;
  if (typeof at !== 'number' || !Number.isFinite(at)) return null;
  return { id, name, color, text, at };
}

/** Farbe 0xRRGGBB als CSS-Hex; alles andere (keine ganze Zahl, außerhalb des Bereichs) wird weiß. */
export function chatColorHex(color: unknown): string {
  if (typeof color !== 'number' || !Number.isInteger(color) || color < 0 || color > 0xffffff) return FALLBACK_COLOR;
  return `#${color.toString(16).padStart(6, '0')}`;
}

/**
 * Systemzeilen aus dem Vergleich zweier Spielerlisten (nach id): erst Beitritte, dann Abgänge.
 * prev = null bedeutet: erste Liste, nichts melden.
 */
export function rosterDiff(prev: readonly RosterEntry[] | null, next: readonly RosterEntry[]): string[] {
  if (prev === null) return [];
  const before = new Set(prev.map((p) => p.id));
  const after = new Set(next.map((p) => p.id));
  const lines: string[] = [];
  for (const p of next) if (!before.has(p.id)) lines.push(`${p.name} ist beigetreten`);
  for (const p of prev) if (!after.has(p.id)) lines.push(`${p.name} hat den Raum verlassen`);
  return lines;
}
