import type { Mode } from '@pfandraiders/core';
import type { PlayerFrame } from './sprites/characters';
import { charDir, type CharDir } from './playerChars';

export const MOVE_EPSILON = 0.05;
export const WALK_FRAME_MS = 150;
export const ACTION_FRAME_MS = 250;
/** Gehzyklus der Bogenfiguren: 4 Schritte zu je WALK_FRAME_MS (siehe charFrameIndex). */
export const WALK_STEPS = 4;
/**
 * Suchen im Stand: Wechsel zwischen Stand (Schritt 0) und Schritt (1) der Vorderansicht alle ACTION_FRAME_MS.
 * Schritt 0 und 2 wären im Bogen dasselbe Standbild, daher 0 und 1.
 */
export const ACTION_STEPS = [0, 1] as const;
/** Hoehe des Auf-und-ab beim Gehen in Weltpixeln (2 Bildschirmpixel bei Zoom 2). */
export const BOB_PX = 1;

export type Facing = 'down' | 'up' | 'side';

export interface PoseState {
  x: number;
  y: number;
  facing: Facing;
  flipX: boolean;
  walkMs: number;
}

export interface Pose {
  frame: PlayerFrame;
  flipX: boolean;
}

export function initialPose(x: number, y: number): PoseState {
  return { x, y, facing: 'down', flipX: false, walkMs: 0 };
}

function safeDt(dtMs: number): number {
  return Number.isFinite(dtMs) && dtMs > 0 ? dtMs : 0;
}

function ab(ms: number, period: number): 'a' | 'b' {
  return Math.floor(ms / period) % 2 === 0 ? 'a' : 'b';
}

/** Vertikaler Versatz in Weltpixeln: Fuesse unten auf Frame a, Koerper BOB_PX hoeher auf Frame b. */
export function bobOffset(walkMs: number, moving: boolean): number {
  if (!moving) return 0;
  const ms = Number.isFinite(walkMs) && walkMs > 0 ? walkMs : 0;
  return ab(ms, WALK_FRAME_MS) === 'a' ? 0 : -BOB_PX;
}

/** Schritt 0..3 im Gehzyklus der Bogenfiguren; NaN, Unendlich und negativ gelten als 0. */
export function walkStepIndex(walkMs: number): number {
  const ms = Number.isFinite(walkMs) && walkMs > 0 ? walkMs : 0;
  return Math.floor(ms / WALK_FRAME_MS) % WALK_STEPS;
}

/**
 * Ein Frame Spielerpose. `pose` ist das Bild der gezeichneten Figur (Rückfall), `dir` und `step` wählen das Bild
 * der Bogenfigur (charFrameIndex). Bewusstlos: Stand vorn (die Szene dreht es um 90 Grad).
 */
export function stepPose(
  prev: PoseState,
  x: number,
  y: number,
  mode: Mode,
  dtMs: number,
): { state: PoseState; pose: Pose; moving: boolean; dir: CharDir; step: number } {
  const r = stepDrawnPose(prev, x, y, mode, dtMs);
  const { state, moving } = r;
  if (mode === 'unconscious') return { ...r, dir: 'down', step: 0 };
  if (moving) return { ...r, dir: charDir(state.facing, state.flipX), step: walkStepIndex(state.walkMs) };
  if (mode === 'searching') {
    return { ...r, dir: 'down', step: ACTION_STEPS[ab(state.walkMs, ACTION_FRAME_MS) === 'a' ? 0 : 1] };
  }
  return { ...r, dir: charDir(state.facing, state.flipX), step: 0 };
}

function stepDrawnPose(
  prev: PoseState,
  x: number,
  y: number,
  mode: Mode,
  dtMs: number,
): { state: PoseState; pose: Pose; moving: boolean } {
  const dt = safeDt(dtMs);
  const dx = x - prev.x;
  const dy = y - prev.y;
  const moving = Math.hypot(dx, dy) > MOVE_EPSILON;
  const acting = mode === 'searching';

  let facing = prev.facing;
  let flipX = prev.flipX;
  if (moving) {
    if (Math.abs(dx) > Math.abs(dy)) {
      facing = 'side';
      flipX = dx < 0;
    } else {
      facing = dy > 0 ? 'down' : 'up';
      flipX = false;
    }
  }

  let walkMs = moving || acting ? prev.walkMs + dt : 0;
  if (mode === 'unconscious') walkMs = 0;
  const state: PoseState = { x, y, facing, flipX, walkMs };

  if (mode === 'unconscious') return { state, pose: { frame: 'lying', flipX }, moving: false };
  if (moving) return { state, pose: { frame: `${facing}_${ab(walkMs, WALK_FRAME_MS)}`, flipX }, moving };
  if (acting) return { state, pose: { frame: `down_${ab(walkMs, ACTION_FRAME_MS)}`, flipX: false }, moving };
  return { state, pose: { frame: `${facing}_a`, flipX }, moving };
}

export function npcFrame(
  prev: PoseState,
  x: number,
  y: number,
  dtMs: number,
): { state: PoseState; frame: 'a' | 'b'; flipX: boolean; moving: boolean } {
  const dt = safeDt(dtMs);
  const dx = x - prev.x;
  const moving = Math.hypot(dx, y - prev.y) > MOVE_EPSILON;
  let flipX = prev.flipX;
  if (dx < 0) flipX = true;
  else if (dx > 0) flipX = false;
  const walkMs = moving ? prev.walkMs + dt : 0;
  return {
    state: { x, y, facing: prev.facing, flipX, walkMs },
    frame: moving ? ab(walkMs, WALK_FRAME_MS) : 'a',
    flipX,
    moving,
  };
}
