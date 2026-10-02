import { CONFIG } from './config';
import { boxBlocked } from './map';
import type { Input, MapData, Player } from './types';

/** Bewegt den Spieler gemäß Eingabe. Achsen getrennt, damit er an Wänden entlanggleitet. */
export function walk(map: MapData, p: Player, input: Input, dtMs: number): void {
  const speed = CONFIG.playerSpeed * CONFIG.containers[p.containerLevel].speedMult;
  const diagonal = input.moveX !== 0 && input.moveY !== 0 ? Math.SQRT1_2 : 1;
  const dist = (speed * dtMs * diagonal) / 1000;
  const dx = input.moveX * dist;
  const dy = input.moveY * dist;
  if (!boxBlocked(map, p.x + dx, p.y, CONFIG.playerHalf)) p.x += dx;
  if (!boxBlocked(map, p.x, p.y + dy, CONFIG.playerHalf)) p.y += dy;
}
