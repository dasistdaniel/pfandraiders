import { CONFIG } from './config';
import type { Player, Point } from './types';

export function containerOf(p: Player) {
  return CONFIG.containers[p.containerLevel];
}

export function capacityOf(p: Player): number {
  return containerOf(p).capacity;
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Ist der Spieler innerhalb des Interaktionsradius eines der Punkte? */
export function isNear(points: readonly Point[], p: Point): boolean {
  return points.some((pt) => distance(pt, p) <= CONFIG.interactRadius);
}
