import { CONFIG } from '@pfandraiders/core';
import type { Npc } from '@pfandraiders/core';
import { dogTexture, npcSheetTexture, policeTexture, type NpcSheetName } from './textureKeys';

/**
 * Animation der NPCs aus den Spritesheets, rein (ohne Phaser), nur aus den Feldern des Zustands (läuft auch online).
 *
 * Hund ("Dog Spritesheets" von Jason of GDN, CC0, siehe assets/npc/CREDITS.txt): Bogen 96x80 = 6 Spalten x 5 Zeilen
 * zu 16x16 px, der Hund blickt nach RECHTS. Zeile 0 = Sitzen und Umschauen (6), 1 = Gehen (6), 2 Spalten 0-3 = Sitzen
 * mit Schwanzwedeln (4-5 Sprung), 3 Spalten 0-3 = Rennen (4-5 Sonstiges), 4 Spalten 0-3 = Biss/Ausfall (4-5 leer).
 * Drei Fellfarben mit identischem Aufbau (weiß, schwarz, braun).
 *
 * Polizist ("Officer Character" von Chasersgaming, CC0): Bogen 320x1313 = 10 Spalten zu 32x32 px, Spalten 0-6 sind
 * Bilder, 7-9 Beschriftungen. Die Figur ist etwa 30 px hoch und blickt schräg nach RECHTS. Zeile 0 = Stand (7),
 * 1 = Gehen (7), 2 = Rennen (7), 8 = Schlagstock schwingen (7).
 *
 * Beide Bögen blicken nach rechts: flipX aus npcFrame (true = zuletzt nach links gegangen) gilt direkt.
 */

export const DOG_FRAME = 16;
export const OFFICER_FRAME = 32;
export const DOG_SHEET_COLS = 6;
export const OFFICER_SHEET_COLS = 10;
/** Ursprung so, dass die Füße etwa 4 px unter der Position stehen (wie bei den Spielerfiguren). */
export const DOG_ORIGIN_Y = 0.75;
export const OFFICER_ORIGIN_Y = 0.85;

export interface NpcAnim {
  row: number;
  /** Bildnummern im Bogen (Zeile * Spalten + Spalte) */
  frames: readonly number[];
  frameMs: number;
}

function anim(cols: number, row: number, count: number, frameMs: number): NpcAnim {
  return { row, frames: Array.from({ length: count }, (_, c) => row * cols + c), frameMs };
}

export const DOG_ANIMS = {
  idle: anim(DOG_SHEET_COLS, 0, 6, 200),
  walk: anim(DOG_SHEET_COLS, 1, 6, 120),
  wag: anim(DOG_SHEET_COLS, 2, 4, 120),
  run: anim(DOG_SHEET_COLS, 3, 4, 90),
  attack: anim(DOG_SHEET_COLS, 4, 4, 100),
} as const satisfies Record<string, NpcAnim>;

export const OFFICER_ANIMS = {
  idle: anim(OFFICER_SHEET_COLS, 0, 7, 160),
  walk: anim(OFFICER_SHEET_COLS, 1, 7, 130),
  run: anim(OFFICER_SHEET_COLS, 2, 7, 100),
  baton: anim(OFFICER_SHEET_COLS, 8, 7, 120),
} as const satisfies Record<string, NpcAnim>;

/** So lange nach einem Biss (Beginn der Biss-Pause) zeigt der Hund den Ausfall: 4 Bilder zu 100 ms. */
export const ATTACK_WINDOW_MS = 400;

export const DOG_COATS = ['white', 'black', 'brown'] as const;
export type DogCoat = (typeof DOG_COATS)[number];

/** Fellfarbe fest aus der NPC-ID; aufeinanderfolgende IDs wechseln durch alle drei. NaN/Unendlich gelten als 0. */
export function dogCoat(npcId: number): DogCoat {
  const i = Number.isFinite(npcId) ? Math.trunc(npcId) : 0;
  const n = DOG_COATS.length;
  return DOG_COATS[((i % n) + n) % n];
}

/**
 * Stimmung vor Bewegung, damit ein sitzender Hund nicht durch Ruckeln der Interpolation losrennt:
 * Biss, Sitzen nach dem Biss (wag), Streunen (Pause: Sitzen und Umschauen, sonst walk), Jagen (run),
 * Ablenkung (wag), sonst Sitzen.
 */
export function dogAnim(npc: Npc, moving: boolean): NpcAnim {
  if (npc.cooldownMs > 0 && npc.cooldownMs > CONFIG.npc.dog.biteCooldownMs - ATTACK_WINDOW_MS) return DOG_ANIMS.attack;
  if (npc.mood === 'idle') return DOG_ANIMS.wag;
  if (npc.mood === 'roaming') return npc.pauseMs > 0 ? DOG_ANIMS.idle : DOG_ANIMS.walk;
  if (moving) return npc.targetId !== null ? DOG_ANIMS.run : DOG_ANIMS.walk;
  if (npc.distractedMs > 0) return DOG_ANIMS.wag;
  return DOG_ANIMS.idle;
}

export function policeAnim(npc: Npc, moving: boolean): NpcAnim {
  if (npc.checkMs > 0) return OFFICER_ANIMS.baton;
  if (npc.mood === 'roaming') return npc.pauseMs > 0 ? OFFICER_ANIMS.idle : OFFICER_ANIMS.walk;
  if (moving) return npc.targetId !== null ? OFFICER_ANIMS.run : OFFICER_ANIMS.walk;
  return OFFICER_ANIMS.idle;
}

/** Bild der Animation nach timeMs (läuft im Kreis); negativ, NaN und Unendlich gelten als 0. */
export function frameAt(a: NpcAnim, timeMs: number): number {
  const ms = Number.isFinite(timeMs) && timeMs > 0 ? timeMs : 0;
  return a.frames[Math.floor(ms / a.frameMs) % a.frames.length];
}

/** Uhr einer NPC-Animation: läuft weiter, solange die Zeile gleich bleibt, und beginnt bei 0, wenn sie wechselt. */
export interface AnimClock {
  row: number;
  ms: number;
}

export function advanceClock(prev: AnimClock | undefined, a: NpcAnim, dtMs: number): AnimClock {
  if (!prev || prev.row !== a.row) return { row: a.row, ms: 0 };
  const dt = Number.isFinite(dtMs) && dtMs > 0 ? dtMs : 0;
  return { row: a.row, ms: prev.ms + dt };
}

/** Texturschlüssel des Bogens für diesen NPC (Hund nach Fellfarbe). */
export function npcSheetKey(npc: Npc): string {
  const name: NpcSheetName = npc.kind === 'dog' ? `dog-${dogCoat(npc.id)}` : 'officer';
  return npcSheetTexture(name);
}

export type NpcLook =
  | { sheet: true; texture: string; frame: number; originY: number; bob: false }
  | { sheet: false; texture: string; bob: true };

/**
 * Bild eines NPCs: aus dem Bogen, wenn er geladen ist (die Bögen animieren selbst, daher kein Auf-und-ab),
 * sonst die gezeichnete Figur mit dem Bild a/b aus npcFrame und dem Auf-und-ab beim Gehen.
 */
export function npcLook(
  npc: Npc,
  moving: boolean,
  animMs: number,
  drawnFrame: 'a' | 'b',
  hasSheet: (key: string) => boolean,
): NpcLook {
  const key = npcSheetKey(npc);
  const dog = npc.kind === 'dog';
  if (!hasSheet(key)) return { sheet: false, texture: dog ? dogTexture(drawnFrame) : policeTexture(drawnFrame), bob: true };
  const a = dog ? dogAnim(npc, moving) : policeAnim(npc, moving);
  return { sheet: true, texture: key, frame: frameAt(a, animMs), originY: dog ? DOG_ORIGIN_Y : OFFICER_ORIGIN_Y, bob: false };
}
