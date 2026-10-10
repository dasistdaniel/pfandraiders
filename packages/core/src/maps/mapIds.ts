/**
 * Kennungen, Kachelsätze und Namensregeln der Karten. Blatt-Modul: importiert nichts aus `maps/index.ts`,
 * damit `npm run maps` auch dann läuft, wenn `custom/index.ts` gerade nicht zu den Dateien passt.
 */

/** Kennungen der eingebauten Karten, in der Reihenfolge der Auswahl. */
export const BUILTIN_MAP_IDS = ['city', 'retro'] as const;
export type BuiltinMapId = (typeof BUILTIN_MAP_IDS)[number];

/** Kachelsatz: `city` = Kenney-Bogen mit Grafikebenen, `retro` = selbst gezeichnete Kacheln aus den Kacheltypen. */
export const TILESET_IDS = ['city', 'retro'] as const;
export type TilesetId = (typeof TILESET_IDS)[number];

export function isTilesetId(v: unknown): v is TilesetId {
  return v === 'city' || v === 'retro';
}

/** Längste Kartenkennung (Dateiname ohne `.tiled.json`). */
export const MAX_MAP_ID_LENGTH = 24;
/** Längster Kartenname (Eigenschaft `name`), nach dem Bereinigen. */
export const MAX_MAP_NAME_LENGTH = 24;

const MAP_ID_SYNTAX = /^[a-z0-9-]+$/;

/** Schreibweise einer Kartenkennung: nur a-z, 0-9 und '-', 1 bis MAX_MAP_ID_LENGTH Zeichen. */
export function isMapIdSyntax(v: unknown): v is string {
  return typeof v === 'string' && v.length >= 1 && v.length <= MAX_MAP_ID_LENGTH && MAP_ID_SYNTAX.test(v);
}

/** Kartenname bereinigen: Steuer- und Formatzeichen raus, trimmen. null = kein Text, leer oder zu lang. */
export function cleanMapName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.replace(/[\p{Cc}\p{Cf}]/gu, '').trim();
  return name.length === 0 || name.length > MAX_MAP_NAME_LENGTH ? null : name;
}
