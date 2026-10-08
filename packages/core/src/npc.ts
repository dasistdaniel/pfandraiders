import { emptyBottles, totalBottles, transferBottles } from './bottles';
import { CONFIG } from './config';
import { distance } from './economy';
import { damage } from './health';
import { boxBlocked } from './map';
import { lineClear, nextWaypoint } from './path';
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

/**
 * Jagt `to` um Wände herum. Ist die gerade Linie frei, läuft er direkt hin (wie moveToward).
 * Sonst folgt er dem Wegpunkt aus der Breitensuche; neu gesucht wird höchstens alle pathEveryMs
 * oder sobald der Wegpunkt erreicht ist. Ohne Weg läuft er geradeaus (rutscht an der Wand entlang).
 */
function chase(state: GameState, npc: Npc, to: Point, speed: number, dtMs: number): void {
  npc.pathMs = Math.max(0, npc.pathMs - dtMs);
  if (lineClear(state.map, npc, to)) {
    npc.pathMs = 0; // verliert er die Sicht, sucht er sofort einen Weg
    moveToward(state, npc, to, speed, dtMs);
    return;
  }
  const way = { x: npc.pathX, y: npc.pathY };
  if (npc.pathMs === 0 || distance(npc, way) <= CONFIG.npc.pathArrivePx) {
    const next = nextWaypoint(state.map, npc, to) ?? to;
    npc.pathX = next.x;
    npc.pathY = next.y;
    npc.pathMs = CONFIG.npc.pathEveryMs;
  }
  moveToward(state, npc, { x: npc.pathX, y: npc.pathY }, speed, dtMs);
}

function senseRadius(npc: Npc): number {
  return npc.kind === 'dog' ? CONFIG.npc.dog.senseRadius : CONFIG.npc.police.senseRadius;
}

/**
 * Kommt dieser Spieler als Ziel in Frage? Bewusst, nicht der Spieler aus der Ruhe-Erinnerung,
 * Hund: ohne Schutz (nach dem Aufstehen), Polizei: trägt Flaschen.
 */
function wants(npc: Npc, p: Player): boolean {
  if (p.unconsciousMs > 0) return false;
  if (npc.restMs > 0 && p.id === npc.restId) return false;
  return npc.kind === 'dog' ? p.shieldMs === 0 : totalBottles(p.bottles) > 0;
}

/** Nächster passender Spieler im Umkreis (bei Gleichstand der erste), ohne etwas zu verändern. */
function nearestTarget(state: GameState, npc: Npc): Player | null {
  const radius = senseRadius(npc);
  let best: Player | null = null;
  let bestDist = Infinity;
  for (const p of Object.values(state.players)) {
    if (!wants(npc, p)) continue;
    const d = distance(npc, p);
    if (d <= radius && d < bestDist) {
      best = p;
      bestDist = d;
    }
  }
  return best;
}

/** Behält das aktuelle Ziel, solange es gültig ist, sonst der nächste passende Spieler im Umkreis. */
function pickTarget(state: GameState, npc: Npc): Player | null {
  const current = npc.targetId === null ? undefined : state.players[npc.targetId];
  if (current && wants(npc, current) && distance(npc, current) <= senseRadius(npc)) return current;
  const best = nearestTarget(state, npc);
  const id = best ? best.id : null;
  if (id !== npc.targetId) npc.pathMs = 0; // neues Ziel: alten Wegpunkt verwerfen
  npc.targetId = id;
  return best;
}

/** Diesen Spieler eine Weile in Ruhe lassen. */
function rest(npc: Npc, playerId: string): void {
  npc.restId = playerId;
  npc.restMs = CONFIG.npc.restMs;
}

/** Hund setzt sich (harmlos), danach streunt er. */
function sit(npc: Npc): void {
  npc.mood = 'idle';
  npc.moodMs = CONFIG.npc.dog.sitMs;
  npc.targetId = null;
  npc.checkMs = 0;
  npc.pauseMs = 0;
}

/** Neues Wegstück: zufälliger begehbarer Punkt im Umkreis, sonst bleibt er, wo er ist. */
function pickWander(state: GameState, npc: Npc): void {
  const r = CONFIG.npc.wanderRadius;
  npc.wanderX = npc.x;
  npc.wanderY = npc.y;
  for (let i = 0; i < CONFIG.npc.wanderTries; i++) {
    // Quadrat mit Verwerfung statt Winkel: keine Trigonometrie, damit es überall gleich rechnet.
    const dx = (nextRandom(state) * 2 - 1) * r;
    const dy = (nextRandom(state) * 2 - 1) * r;
    if (dx * dx + dy * dy > r * r) continue;
    // nur Ziele, die er auf gerader Linie erreicht: sonst hinge er an einer Wand fest
    if (!lineClear(state.map, npc, { x: npc.x + dx, y: npc.y + dy })) continue;
    npc.wanderX = npc.x + dx;
    npc.wanderY = npc.y + dy;
    break;
  }
  npc.moodMs = 0;
  npc.wanderRef = distance(npc, { x: npc.wanderX, y: npc.wanderY });
}

/** Stehenbleiben zwischen zwei Wegstücken. */
function pause(state: GameState, npc: Npc): void {
  npc.pauseMs = randInt(state, ...CONFIG.npc.wanderPauseMs);
  npc.moodMs = 0;
}

function startRoaming(state: GameState, npc: Npc): void {
  npc.mood = 'roaming';
  npc.targetId = null;
  npc.checkMs = 0;
  npc.pauseMs = 0;
  npc.pathMs = 0;
  pickWander(state, npc);
}

function staminaMs(kind: NpcKind): number {
  return kind === 'dog' ? CONFIG.npc.dog.lifeMs : CONFIG.npc.police.lifeMs;
}

/** Sieht ein streunender NPC einen passenden Spieler, jagt er wieder (mit voller Ausdauer). */
function tryEngage(state: GameState, npc: Npc): boolean {
  const target = nearestTarget(state, npc);
  if (!target) return false;
  npc.mood = 'active';
  npc.lifeMs = staminaMs(npc.kind);
  npc.moodMs = 0;
  npc.pauseMs = 0;
  npc.pathMs = 0;
  npc.targetId = target.id;
  return true;
}

/** Läuft zum Wegziel; bei Ankunft oder wenn er feststeckt, macht er Pause und sucht sich danach ein neues Ziel. */
function updateRoaming(state: GameState, npc: Npc, dtMs: number): void {
  if (npc.pauseMs > 0) {
    npc.pauseMs = Math.max(0, npc.pauseMs - dtMs);
    if (npc.pauseMs === 0) pickWander(state, npc);
    return;
  }
  const goal = { x: npc.wanderX, y: npc.wanderY };
  const cfg = npc.kind === 'dog' ? CONFIG.npc.dog : CONFIG.npc.police;
  if (distance(npc, goal) > CONFIG.npc.wanderArriveRadius) {
    moveToward(state, npc, goal, cfg.speed * cfg.roamSpeedMult, dtMs);
  }
  const d = distance(npc, goal);
  if (d <= CONFIG.npc.wanderArriveRadius) {
    pause(state, npc);
    return;
  }
  if (d <= npc.wanderRef - CONFIG.npc.wanderProgressPx) {
    npc.wanderRef = d;
    npc.moodMs = 0;
    return;
  }
  npc.moodMs += dtMs;
  if (npc.moodMs >= CONFIG.npc.wanderStuckMs) pause(state, npc);
}

function updateDog(state: GameState, npc: Npc, dtMs: number): void {
  const cfg = CONFIG.npc.dog;
  if (npc.distractedMs > 0) return; // beschäftigt mit dem Leckerli
  const target = pickTarget(state, npc);
  if (!target) {
    startRoaming(state, npc);
    return;
  }
  if (distance(npc, target) > cfg.biteRadius) {
    chase(state, npc, target, cfg.speed, dtMs);
    return;
  }
  if (npc.cooldownMs > 0) return;
  npc.cooldownMs = cfg.biteCooldownMs;
  if (target.inventory.dog_treat > 0) {
    target.inventory.dog_treat--;
    npc.distractedMs = cfg.distractedMs;
  } else {
    damage(target, cfg.biteDamage);
    rest(npc, target.id);
    sit(npc); // ein Biss reicht: Hund setzt sich und streunt danach
  }
}

function updatePolice(state: GameState, npc: Npc, dtMs: number): void {
  const cfg = CONFIG.npc.police;
  const previous = npc.targetId;
  const target = pickTarget(state, npc);
  if (!target) {
    startRoaming(state, npc);
    return;
  }
  if (target.id !== previous) npc.checkMs = 0;
  if (distance(npc, target) > cfg.controlRadius) {
    npc.checkMs = 0; // Spieler ist weg: Kontrolle beginnt von vorn
    chase(state, npc, target, cfg.speed, dtMs);
    return;
  }
  npc.checkMs += dtMs;
  if (npc.checkMs >= cfg.checkMs) {
    const count = Math.ceil(totalBottles(target.bottles) * cfg.fraction);
    transferBottles(target.bottles, emptyBottles(), count); // beschlagnahmt: verschwindet
    rest(npc, target.id);
    startRoaming(state, npc);
  }
}

/** Ausdauer verbraucht: lässt das Ziel eine Weile in Ruhe; Hund setzt sich, Polizei streunt. */
function giveUp(state: GameState, npc: Npc): void {
  if (npc.targetId !== null) rest(npc, npc.targetId);
  if (npc.kind === 'dog') sit(npc);
  else startRoaming(state, npc);
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
    lifeMs: staminaMs(kind),
    mood: 'active',
    moodMs: 0,
    targetId: null,
    restId: null,
    restMs: 0,
    pauseMs: 0,
    wanderX: at.x,
    wanderY: at.y,
    wanderRef: 0,
    cooldownMs: 0,
    distractedMs: 0,
    checkMs: 0,
    pathX: at.x,
    pathY: at.y,
    pathMs: 0,
  });
}

/** Zufalls-Spawns, Bewegung und Wirkung aller NPCs für einen Tick. NPCs verschwinden nie. */
export function updateNpcs(state: GameState, dtMs: number): void {
  state.nextNpcMs -= dtMs;
  if (state.nextNpcMs <= 0) {
    state.nextNpcMs = randInt(state, ...CONFIG.npc.spawnEveryMs);
    trySpawn(state);
  }
  for (const npc of state.npcs) {
    // Timer laufen in jeder Stimmung genau einmal pro Tick ab (sonst hinge die Animation im Client).
    npc.cooldownMs = Math.max(0, npc.cooldownMs - dtMs);
    npc.distractedMs = Math.max(0, npc.distractedMs - dtMs);
    if (npc.restMs > 0) {
      npc.restMs = Math.max(0, npc.restMs - dtMs);
      if (npc.restMs === 0) npc.restId = null;
    }
    if (npc.mood === 'idle') {
      npc.moodMs -= dtMs;
      if (npc.moodMs <= 0) startRoaming(state, npc);
      continue;
    }
    if (npc.mood === 'roaming' && !tryEngage(state, npc)) {
      updateRoaming(state, npc, dtMs);
      continue;
    }
    npc.lifeMs -= dtMs;
    if (npc.lifeMs <= 0) {
      giveUp(state, npc);
      continue;
    }
    if (npc.kind === 'dog') updateDog(state, npc, dtMs);
    else updatePolice(state, npc, dtMs);
  }
}

/** Läuft gerade eine Polizeikontrolle gegen diesen Spieler? Für die Warnung im Client. */
export function isBeingChecked(state: GameState, playerId: string): boolean {
  return state.npcs.some(
    (n) => n.kind === 'police' && n.mood === 'active' && n.targetId === playerId && n.checkMs > 0,
  );
}
