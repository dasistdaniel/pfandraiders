import type { Mode } from '@pfandraiders/core';
import type { PlayerFrame } from './sprites/characters';

export const MOVE_EPSILON = 0.05;
export const WALK_FRAME_MS = 150;
export const ACTION_FRAME_MS = 250;

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

export function stepPose(
  prev: PoseState,
  x: number,
  y: number,
  mode: Mode,
  dtMs: number,
): { state: PoseState; pose: Pose } {
  const dt = safeDt(dtMs);
  const dx = x - prev.x;
  const dy = y - prev.y;
  const moving = Math.hypot(dx, dy) > MOVE_EPSILON;
  const acting = mode === 'searching' || mode === 'stealing';

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

  if (mode === 'unconscious') return { state, pose: { frame: 'lying', flipX } };
  if (moving) return { state, pose: { frame: `${facing}_${ab(walkMs, WALK_FRAME_MS)}`, flipX } };
  if (acting) return { state, pose: { frame: `down_${ab(walkMs, ACTION_FRAME_MS)}`, flipX: false } };
  return { state, pose: { frame: `${facing}_a`, flipX } };
}

export function npcFrame(
  prev: PoseState,
  x: number,
  y: number,
  dtMs: number,
): { state: PoseState; frame: 'a' | 'b'; flipX: boolean } {
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
  };
}
