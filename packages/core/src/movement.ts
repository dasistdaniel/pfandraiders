import { CONFIG } from './config';
import { boxBlocked } from './map';
import type { Input, MapData, Player } from './types';

const free = (map: MapData, x: number, y: number): boolean => !boxBlocked(map, x, y, CONFIG.playerHalf);

/**
 * Kleinster seitlicher Versatz s (1..slideMaxPx) in Richtung `sign`, bei dem die Box nach dem
 * Vorwärtsschritt frei ist. Der Weg dorthin muss Pixel für Pixel frei sein, damit man sich nie
 * durch eine Lücke zwängt, die schmaler ist als die Box. 0 = kein Versatz gefunden.
 */
function slideOffset(map: MapData, p: Player, fx: number, fy: number, perpX: boolean, sign: number): number {
  for (let s = 1; s <= CONFIG.slideMaxPx; s++) {
    const ox = perpX ? sign * s : 0;
    const oy = perpX ? 0 : sign * s;
    if (!free(map, p.x + ox, p.y + oy)) return 0;
    if (free(map, fx + ox, fy + oy)) return s;
  }
  return 0;
}

/**
 * Bewegt den Spieler gemäß Eingabe. Achsen getrennt, damit er an Wänden entlanggleitet.
 * Ist eine Achse blockiert, wird der Spieler um eine Ecke herumgeschoben, die ihn höchstens
 * `slideMaxPx` Pixel überlappt (in dem Tick dann ohne Vorwärtsbewegung).
 */
export function walk(map: MapData, p: Player, input: Input, dtMs: number): void {
  const speed = CONFIG.playerSpeed * CONFIG.containers[p.containerLevel].speedMult;
  const diagonal = input.moveX !== 0 && input.moveY !== 0 ? Math.SQRT1_2 : 1;
  const dist = (speed * dtMs * diagonal) / 1000;
  const dx = input.moveX * dist;
  const dy = input.moveY * dist;
  let movedX = false;
  let movedY = false;
  if (dx !== 0 && free(map, p.x + dx, p.y)) {
    p.x += dx;
    movedX = true;
  }
  if (dy !== 0 && free(map, p.x, p.y + dy)) {
    p.y += dy;
    movedY = true;
  }

  // Ecke: blockierte Achse, deren Querachse nicht gerade selbst vorankommt
  const blockedX = dx !== 0 && !movedX && !movedY;
  const blockedY = dy !== 0 && !movedY && !movedX;
  if (!blockedX && !blockedY) return;

  let best = 0;
  let bestSign = 0;
  let bestPerpX = false;
  const consider = (perpX: boolean, preferred: number) => {
    const fx = perpX ? p.x : p.x + dx;
    const fy = perpX ? p.y + dy : p.y;
    const pos = slideOffset(map, p, fx, fy, perpX, 1);
    const neg = slideOffset(map, p, fx, fy, perpX, -1);
    let s = 0;
    let sign = 0;
    if (pos > 0 && (neg === 0 || pos < neg)) [s, sign] = [pos, 1];
    else if (neg > 0 && (pos === 0 || neg < pos)) [s, sign] = [neg, -1];
    else if (pos > 0) [s, sign] = [pos, preferred < 0 ? -1 : 1];
    if (s > 0 && (best === 0 || s < best)) [best, bestSign, bestPerpX] = [s, sign, perpX];
  };
  // x blockiert: Versatz in y (Vorwärts: dx); y blockiert: Versatz in x (Vorwärts: dy)
  if (blockedX) consider(false, input.moveY);
  if (blockedY) consider(true, input.moveX);
  if (best === 0) return;
  const m = Math.min(best, dist);
  if (bestPerpX) p.x += bestSign * m;
  else p.y += bestSign * m;
}
