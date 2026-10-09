import { isAvatar } from '@pfandraiders/core';
import type { Facing } from './pose';

/**
 * Spielerfiguren aus dem "Tiny Characters Set" von Fleurman (CC0, nach GrafxKid), siehe assets/characters/CREDITS.txt.
 *
 * Aufbau jedes Bogens (64x51 px, durch Ansehen und Pixelvergleich ermittelt):
 * 4 Spalten x 3 Zeilen zu je 16x17 px. Die SPALTE ist die Richtung, die ZEILE das Gehbild:
 *   Spalte 0 = vorn (nach unten), 1 = Seite mit Blick nach RECHTS, 2 = hinten (nach oben), 3 = Seite mit Blick nach LINKS.
 *   Zeile 0 = Stand (Beine zusammen), 1 = Schritt, 2 = Schritt mit dem anderen Bein.
 * Spalte 3 ist in 22 der 24 Bögen das exakte Spiegelbild von Spalte 1 (Ausnahmen f01, f10). Wir nutzen beide Spalten
 * direkt, die Figur wird also nie per flipX gespiegelt. Die Füße stehen in der untersten Pixelzeile (y = 16).
 */

export const CHAR_FRAME_W = 16;
export const CHAR_FRAME_H = 17;
/** Ursprung y: oberste 12 Pixel über der Position, Füße (unterste Zeile) 5 px darunter = Unterkante der Hitbox. */
export const CHAR_ORIGIN_Y = 12 / CHAR_FRAME_H;

const range12 = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
/** Alle 24 Bögen: m01..m12 (Males/M_xx), f01..f12 (Females/F_xx). */
export const ALL_CHARACTERS: readonly string[] = [...range12.map((n) => `m${n}`), ...range12.map((n) => `f${n}`)];

/**
 * Feste Reihenfolge der Spielerfiguren, gut unterscheidbar (Haare/Kleidung):
 * blond/grün, rote Zöpfe/blau, türkis/gelb, pinke Haare/oliv, Glatze/weiß, rotbraun lang/türkis, schwarzer Afro/pink,
 * grüne Haare/lila.
 */
export const PLAYER_CHARACTERS: readonly string[] = ['m02', 'f03', 'm01', 'f07', 'm05', 'f11', 'm06', 'f09'];

/** Figur für die Position eines Spielers (Slot- bzw. Raumlistenindex), modulo 8. NaN/Unendlich gelten als 0. */
export function characterFor(index: number): string {
  const n = PLAYER_CHARACTERS.length;
  const i = Number.isFinite(index) ? Math.trunc(index) : 0;
  return PLAYER_CHARACTERS[((i % n) + n) % n];
}

/** Position eines Spielers: zuerst in der Raumliste (online), sonst in der Spielerreihenfolge des Zustands, sonst 0. */
export function characterIndex(id: string, rosterIds: readonly string[], playerIds: readonly string[]): number {
  const r = rosterIds.indexOf(id);
  if (r >= 0) return r;
  const p = playerIds.indexOf(id);
  return p >= 0 ? p : 0;
}

/**
 * Figur eines Online-Spielers: Bogen zum Avatar aus der Raumliste (Index in ALL_CHARACTERS).
 * Fehlt der Avatar oder ist er ungültig (älterer Server), wie bisher nach Position (characterFor).
 */
export function characterOfAvatar(avatar: unknown, fallbackIndex: number): string {
  return isAvatar(avatar) ? ALL_CHARACTERS[avatar] : characterFor(fallbackIndex);
}

export type CharDir = 'down' | 'right' | 'up' | 'left';

const DIR_COLUMN: Record<CharDir, number> = { down: 0, right: 1, up: 2, left: 3 };
/** Gehzyklus über 4 Schritte: Stand, Schritt, Stand, anderer Schritt (Zeilen des Bogens). */
const STEP_ROW = [0, 1, 0, 2] as const;

/** Richtung im Bogen aus Blickrichtung und flipX der Pose (side + flipX = links). */
export function charDir(facing: Facing, flipX: boolean): CharDir {
  if (facing === 'side') return flipX ? 'left' : 'right';
  return facing;
}

/** Bildnummer im Spritesheet (Zeile * 4 + Spalte) für Richtung und Schritt 0..3 (wird umgebrochen, NaN/negativ = 0). */
export function charFrameIndex(dir: CharDir, step: number): number {
  const s = Number.isFinite(step) && step > 0 ? Math.floor(step) % STEP_ROW.length : 0;
  return STEP_ROW[s] * 4 + DIR_COLUMN[dir];
}
