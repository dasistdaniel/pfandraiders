import { CONFIG } from '@pfandraiders/core';
import type { Player } from '@pfandraiders/core';

/** So lange nach dem Sprühen ist die Wolke zu sehen (auch für Fremde: sprayCooldownMs ist öffentlich). */
export const SPRAY_SHOW_MS = 300;
/** Farbe der Wolke (orange) */
export const SPRAY_COLOR = 0xff7043;

export function isSpraying(p: Pick<Player, 'sprayCooldownMs'>): boolean {
  return p.sprayCooldownMs > CONFIG.spray.cooldownMs - SPRAY_SHOW_MS;
}

/** Radius der Wolke: wächst in SPRAY_SHOW_MS von 40 % auf den vollen Sprühradius. */
export function sprayCloudRadius(p: Pick<Player, 'sprayCooldownMs'>): number {
  const t = Math.min(1, Math.max(0, (CONFIG.spray.cooldownMs - p.sprayCooldownMs) / SPRAY_SHOW_MS));
  return CONFIG.spray.radius * (0.4 + 0.6 * t);
}
