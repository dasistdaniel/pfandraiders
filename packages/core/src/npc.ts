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

/** Hund setzt sich (verliert das Interesse), Polizei geht direkt. */
function loseInterest(npc: Npc): void {
  npc.targetId = null;
  npc.checkMs = 0;
  if (npc.kind === 'dog') {
    npc.mood = 'idle';
    npc.moodMs = CONFIG.npc.dog.sitMs;
  } else {
    npc.mood = 'leaving';
    npc.moodMs = 0;
  }
}

function updateDog(state: GameState, npc: Npc, dtMs: number): void {
  const cfg = CONFIG.npc.dog;
  npc.cooldownMs = Math.max(0, npc.cooldownMs - dtMs);
  if (npc.distractedMs > 0) {
    npc.distractedMs = Math.max(0, npc.distractedMs - dtMs);
    return;
  }
  // Wer Schutz hat (nach Respawn oder Diebstahl), wird vom Hund in Ruhe gelassen.
  const target = pickTarget(state, npc, cfg.senseRadius, (p) => p.shieldMs === 0);
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
    loseInterest(npc); // ein Biss reicht: Hund setzt sich und geht danach
  }
}

function updatePolice(state: GameState, npc: Npc, dtMs: number): void {
  const cfg = CONFIG.npc.police;
  const previous = npc.targetId;
  const target = pickTarget(state, npc, cfg.senseRadius, (p) => totalBottles(p.bottles) > 0);
  if (target && target.id !== previous) npc.checkMs = 0;
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
    loseInterest(npc);
  }
}

/** Nächster Eingang (Luftlinie, bei Gleichstand der erste), oder null, wenn die Karte keinen hat. */
function nearestEntrance(state: GameState, npc: Npc): Point | null {
  let best: Point | null = null;
  let bestDist = Infinity;
  for (const e of state.map.npcSpawns) {
    const d = distance(npc, e);
    if (d < bestDist) {
      best = e;
      bestDist = d;
    }
  }
  return best;
}

/** Geht zum nächsten Eingang; true, sobald er angekommen ist oder zu lange unterwegs war (verschwindet). */
function updateLeaving(state: GameState, npc: Npc, dtMs: number): boolean {
  npc.moodMs += dtMs;
  const exit = nearestEntrance(state, npc);
  if (exit) {
    const speed = npc.kind === 'dog' ? CONFIG.npc.dog.speed * 0.6 : CONFIG.npc.police.speed;
    moveToward(state, npc, exit, speed, dtMs);
    if (distance(npc, exit) <= CONFIG.npc.leaveArriveRadius) return true;
  }
  return npc.moodMs >= CONFIG.npc.leaveMs;
}

function trySpawn(state: GameState): void {
  if (state.map.npcSpawns.length === 0 || state.npcs.length >= CONFIG.npc.maxTotal) return;
  const active = state.npcs.filter((n) => n.mood === 'active').length;
  if (active >= CONFIG.npc.maxCount) return;
  const kind: NpcKind = nextRandom(state) < CONFIG.npc.dogChance ? 'dog' : 'police';
  const at = state.map.npcSpawns[randInt(state, 0, state.map.npcSpawns.length - 1)];
  state.npcs.push({
    id: state.nextNpcId++,
    kind,
    x: at.x,
    y: at.y,
    lifeMs: kind === 'dog' ? CONFIG.npc.dog.lifeMs : CONFIG.npc.police.lifeMs,
    mood: 'active',
    moodMs: 0,
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
  const gone = new Set<Npc>();
  for (const npc of state.npcs) {
    if (npc.mood === 'active') {
      npc.lifeMs -= dtMs;
      if (npc.lifeMs <= 0) {
        loseInterest(npc);
        continue;
      }
      if (npc.kind === 'dog') updateDog(state, npc, dtMs);
      else updatePolice(state, npc, dtMs);
      continue;
    }
    // Biss-Pause und Ablenkung laufen auch beim Sitzen und Gehen ab (sonst hinge die Animation im Client).
    npc.cooldownMs = Math.max(0, npc.cooldownMs - dtMs);
    npc.distractedMs = Math.max(0, npc.distractedMs - dtMs);
    if (npc.mood === 'idle') {
      npc.moodMs -= dtMs;
      if (npc.moodMs <= 0) {
        npc.mood = 'leaving';
        npc.moodMs = 0;
      }
    } else if (updateLeaving(state, npc, dtMs)) {
      gone.add(npc);
    }
  }
  if (gone.size > 0) state.npcs = state.npcs.filter((n) => !gone.has(n));
}

/** Läuft gerade eine Polizeikontrolle gegen diesen Spieler? Für die Warnung im Client. */
export function isBeingChecked(state: GameState, playerId: string): boolean {
  return state.npcs.some(
    (n) => n.kind === 'police' && n.mood === 'active' && n.targetId === playerId && n.checkMs > 0,
  );
}
