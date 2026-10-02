import { emptyBottles, totalBottles, transferBottles } from './bottles';
import { CONFIG } from './config';
import { distance } from './economy';
import { damage } from './health';
import { boxBlocked } from './map';
import { nextRandom, randInt } from './rng';
import type { GameState, Npc, NpcKind, Player, Point } from './types';

/** Läuft geradeaus auf `to` zu, Achsen getrennt (rutscht an Wänden entlang). */
function moveToward(state: GameState, npc: Npc, to: Point, speed: number, dtMs: number): void {
  const d = distance(npc, to);
  if (d === 0) return;
  const step = Math.min((speed * dtMs) / 1000, d);
  const dx = ((to.x - npc.x) / d) * step;
  const dy = ((to.y - npc.y) / d) * step;
  if (!boxBlocked(state.map, npc.x + dx, npc.y, CONFIG.playerHalf)) npc.x += dx;
  if (!boxBlocked(state.map, npc.x, npc.y + dy, CONFIG.playerHalf)) npc.y += dy;
}

/** Behält das aktuelle Ziel, solange es gültig ist, sonst der nächste passende bewusste Spieler im Umkreis. */
function pickTarget(
  state: GameState,
  npc: Npc,
  radius: number,
  ok: (p: Player) => boolean,
): Player | null {
  const current = npc.targetId === null ? undefined : state.players[npc.targetId];
  if (current && current.unconsciousMs === 0 && ok(current) && distance(npc, current) <= radius) {
    return current;
  }
  let best: Player | null = null;
  let bestDist = Infinity;
  for (const p of Object.values(state.players)) {
    if (p.unconsciousMs > 0 || !ok(p)) continue;
    const d = distance(npc, p);
    if (d <= radius && d < bestDist) {
      best = p;
      bestDist = d;
    }
  }
  npc.targetId = best ? best.id : null;
  return best;
}

function updateDog(state: GameState, npc: Npc, dtMs: number): void {
  const cfg = CONFIG.npc.dog;
  npc.cooldownMs = Math.max(0, npc.cooldownMs - dtMs);
  if (npc.distractedMs > 0) {
    npc.distractedMs = Math.max(0, npc.distractedMs - dtMs);
    return;
  }
  const target = pickTarget(state, npc, cfg.senseRadius, () => true);
  if (!target) return;
  if (distance(npc, target) > cfg.biteRadius) {
    moveToward(state, npc, target, cfg.speed, dtMs);
    return;
  }
  if (npc.cooldownMs > 0) return;
  npc.cooldownMs = cfg.biteCooldownMs;
  if (target.item === 'dog_treat') {
    target.item = null;
    npc.distractedMs = cfg.distractedMs;
  } else {
    damage(target, cfg.biteDamage);
  }
}

function updatePolice(state: GameState, npc: Npc, dtMs: number): void {
  const cfg = CONFIG.npc.police;
  const target = pickTarget(state, npc, cfg.senseRadius, (p) => totalBottles(p.bottles) > 0);
  if (!target) {
    npc.checkMs = 0;
    return;
  }
  if (distance(npc, target) > cfg.controlRadius) {
    npc.checkMs = 0; // Spieler ist weg: Kontrolle beginnt von vorn
    moveToward(state, npc, target, cfg.speed, dtMs);
    return;
  }
  npc.checkMs += dtMs;
  if (npc.checkMs >= cfg.checkMs) {
    const count = Math.ceil(totalBottles(target.bottles) * cfg.fraction);
    transferBottles(target.bottles, emptyBottles(), count); // beschlagnahmt: verschwindet
    npc.lifeMs = 0;
  }
}

function trySpawn(state: GameState): void {
  if (state.npcs.length >= CONFIG.npc.maxCount || state.map.npcSpawns.length === 0) return;
  const kind: NpcKind = nextRandom(state) < CONFIG.npc.dogChance ? 'dog' : 'police';
  const at = state.map.npcSpawns[randInt(state, 0, state.map.npcSpawns.length - 1)];
  state.npcs.push({
    id: state.nextNpcId++,
    kind,
    x: at.x,
    y: at.y,
    lifeMs: kind === 'dog' ? CONFIG.npc.dog.lifeMs : CONFIG.npc.police.lifeMs,
    targetId: null,
    cooldownMs: 0,
    distractedMs: 0,
    checkMs: 0,
  });
}

/** Zufalls-Spawns, Bewegung und Wirkung aller NPCs für einen Tick. */
export function updateNpcs(state: GameState, dtMs: number): void {
  state.nextNpcMs -= dtMs;
  if (state.nextNpcMs <= 0) {
    state.nextNpcMs = randInt(state, ...CONFIG.npc.spawnEveryMs);
    trySpawn(state);
  }
  for (const npc of state.npcs) {
    npc.lifeMs -= dtMs;
    if (npc.lifeMs <= 0) continue;
    if (npc.kind === 'dog') updateDog(state, npc, dtMs);
    else updatePolice(state, npc, dtMs);
  }
  state.npcs = state.npcs.filter((n) => n.lifeMs > 0);
}

/** Läuft gerade eine Polizeikontrolle gegen diesen Spieler? Für die Warnung im Client. */
export function isBeingChecked(state: GameState, playerId: string): boolean {
  return state.npcs.some((n) => n.kind === 'police' && n.targetId === playerId && n.checkMs > 0);
}
