import { CONFIG } from './config';
import { distance } from './economy';
import { damage } from './health';
import { upgradeValue } from './shop';
import type { GameState, Player } from './types';

/** Schaden eines Schlags: Grundschaden plus Schlag-Upgrade minus Rüstung des Opfers, mindestens minDamage. */
export function punchDamage(attacker: Player, victim: Player): number {
  const raw = CONFIG.fight.damage + upgradeValue(attacker, 'punch') - upgradeValue(victim, 'armor');
  return Math.max(CONFIG.fight.minDamage, raw);
}

/**
 * Nächster wacher Mitspieler in Schlagweite. Schutz zählt hier nicht (er verhindert nur den Schaden).
 * Gleichstand: Reihenfolge der Spieler.
 */
export function findAttackTarget(state: GameState, attacker: Player): Player | null {
  let best: Player | null = null;
  let bestDist = Infinity;
  for (const id of Object.keys(state.players)) {
    const victim = state.players[id];
    if (victim.id === attacker.id || victim.unconsciousMs > 0) continue;
    const d = distance(attacker, victim);
    if (d <= CONFIG.fight.radius && d < bestDist) {
      best = victim;
      bestDist = d;
    }
  }
  return best;
}

/**
 * Schlag im Schritt, in dem die Schlagen-Taste neu gedrückt wurde. Während der Abklingzeit passiert
 * nichts. Sonst beginnt die Abklingzeit (auch ohne Treffer), und der nächste wache Spieler in
 * Reichweite verliert punchDamage Leben, außer er hat Schutz. Gibt true zurück, wenn geschlagen wurde.
 */
export function tryAttack(state: GameState, attacker: Player): boolean {
  if (attacker.attackCooldownMs > 0) return false;
  attacker.attackCooldownMs = CONFIG.fight.cooldownMs;
  const target = findAttackTarget(state, attacker);
  if (target && target.shieldMs === 0) damage(target, punchDamage(attacker, target));
  return true;
}
