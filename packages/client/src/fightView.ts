import { CONFIG } from '@pfandraiders/core';
import type { Player } from '@pfandraiders/core';

/** So lange nach einem Schlag wirkt die Figur größer (Schlag sichtbar, auch für Fremde: attackCooldownMs ist öffentlich). */
export const SWING_MS = 150;

export function isSwinging(p: Pick<Player, 'attackCooldownMs'>): boolean {
  return p.attackCooldownMs > CONFIG.fight.cooldownMs - SWING_MS;
}
