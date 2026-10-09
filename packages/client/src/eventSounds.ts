import { capacityOf, CONFIG, distance, isNear, totalBottles } from '@pfandraiders/core';
import type { ChatMessage, ErrorCode, GameState, Npc, Player, RosterEntry } from '@pfandraiders/core';
import type { SoundId } from './audioIds';
import { countdownLeft } from './countdown';
import { sprayedNear } from './soundEvents';

/**
 * Auslöser der "Weiteren Ereignisse" (docs/SOUNDLISTE.md). Alles rein und nur aus Zustandsunterschieden bzw.
 * Nachrichten abgeleitet, damit es lokal, im Splitscreen und online gleich funktioniert. Ohne Datei sind die IDs
 * stumm (SoundFx), die Erkennung läuft trotzdem.
 */

/** Unter diesem Anteil am Höchstleben warnt low_health (einmal je Unterschreiten). */
export const LOW_HEALTH_FRACTION = 0.25;
/** Schlüssel-Präfix des Such-Loops je Spieler (SoundFx.startLoop). */
export const SEARCH_LOOP_PREFIX = 'search:';

const PUNCH_NEAR = CONFIG.fight.radius + 6;
const POLICE_SENSE = CONFIG.npc.police.senseRadius;

/** Neu gedrückt zwischen zwei Zuständen (Flanke). Online kann ein sehr kurzer Druck zwischen zwei Snapshots fehlen. */
const pressed = (before: boolean, now: boolean): boolean => !before && now;

/** Mindestens ein Spot in Reichweite, und welcher Art (gefüllt/leer)? */
function spotsInReach(state: GameState, p: Player): { full: boolean; empty: boolean } {
  let full = false;
  let empty = false;
  for (const s of state.spots) {
    if (distance(p, s) > CONFIG.interactRadius) continue;
    if (totalBottles(s.contents) > 0) full = true;
    else empty = true;
  }
  return { full, empty };
}

/** Hat ein anderer Spieler in diesem Schritt durch einen Schlag Leben verloren (oder ihn mit Schutz abgefangen)? */
function punchLanded(prev: GameState, next: GameState, attacker: Player): boolean {
  return Object.values(next.players).some((o) => {
    const before = prev.players[o.id];
    if (o.id === attacker.id || !before || before.unconsciousMs > 0) return false;
    if (before.health - o.health >= CONFIG.fight.damage - 1) return true;
    // Schutz nach dem Aufstehen: Treffer ohne Schaden zählt als Treffer
    return o.shieldMs > 0 && Math.hypot(o.x - attacker.x, o.y - attacker.y) <= PUNCH_NEAR;
  });
}

/** Startete dieser NPC gerade die Jagd auf `id` (vorher nicht aktiv auf ihn)? */
function startsChase(prev: GameState, n: Npc, id: string): boolean {
  if (n.mood !== 'active' || n.targetId !== id) return false;
  const before = prev.npcs.find((m) => m.id === n.id);
  return !before || before.mood !== 'active' || before.targetId !== id;
}

/**
 * Sounds der "Weiteren Ereignisse" zwischen zwei Zuständen (ohne den Such-Loop, siehe searchLoopKeys).
 * `ownIds` wie bei detectSounds: Ereignisse mit "du" nur für diese Spieler ('all' = Splitscreen, alle).
 * Jede ID höchstens einmal. Für 'punch_miss' bleibt 'punch' aus detectSounds stehen; preferAlternatives entscheidet.
 */
export function detectEventSounds(prev: GameState | null, next: GameState, ownIds: string[] | 'all'): SoundId[] {
  if (prev === null) return [];
  const out = new Set<SoundId>();
  const running = next.phase === 'running' && countdownLeft(next) === 0;
  const audible = (id: string): boolean => ownIds === 'all' || ownIds.includes(id);
  const max = CONFIG.health.max;

  for (const p of Object.values(next.players)) {
    const q = prev.players[p.id];
    if (!q || !audible(p.id)) continue;
    const awake = p.unconsciousMs === 0;

    // Spieler und Kampf
    if (q.unconsciousMs > 0 && awake) out.add('revive');
    if (!q.robbed && p.robbed && p.unconsciousMs > 0) out.add('robbed');
    if (q.unconsciousMs === 0 && sprayedNear(prev, next, q) && q.health - p.health >= CONFIG.spray.damage - 0.5) out.add('spray_hit');
    if (awake && pressed(q.sprayHeld, p.sprayHeld) && p.items.pepper <= 0) out.add('spray_empty');
    if (p.attackCooldownMs > q.attackCooldownMs && !punchLanded(prev, next, p)) out.add('punch_miss');
    if (awake && p.health > 0 && q.health >= max * LOW_HEALTH_FRACTION && p.health < max * LOW_HEALTH_FRACTION) out.add('low_health');
    if (p.lastFood !== null && p.lastFood.n > (q.lastFood?.n ?? 0)) out.add(p.lastFood.full ? 'eat_full' : 'eat');

    // Suchen und Pfand
    const bottlesNow = totalBottles(p.bottles);
    const bottlesBefore = totalBottles(q.bottles);
    const full = bottlesNow >= capacityOf(p);
    const actionPressed = running && awake && pressed(q.actionHeld, p.actionHeld) && p.mode !== 'searching';
    if (actionPressed && p.depositMs === 0 && !isNear(next.map.dropoffs, p)) {
      const reach = spotsInReach(next, p);
      if (full && reach.full) out.add('bag_full');
      else if (!full && reach.empty && !reach.full) out.add('search_empty');
    }
    if (bottlesNow > bottlesBefore && full) out.add('bag_full');
    const deposited = p.money > q.money && bottlesNow < bottlesBefore;
    if (q.depositMs === 0 && (p.depositMs > 0 || deposited)) out.add('deposit_start');
    if (deposited && bottlesNow === 0) out.add('deposit_done');

    // NPCs
    for (const n of next.npcs) {
      if (n.kind === 'dog' && startsChase(prev, n, p.id)) out.add('dog_bark');
      if (n.kind === 'police' && startsChase(prev, n, p.id)) out.add('siren_start');
      if (n.kind === 'dog' && n.distractedMs > 0 && n.targetId === p.id) {
        const before = prev.npcs.find((m) => m.id === n.id);
        if (!before || before.distractedMs === 0) out.add('dog_treat');
      }
      if (n.kind === 'police' && awake && p.items.id_papers > 0 && bottlesNow > 0 && n.targetId !== p.id) {
        const before = prev.npcs.find((m) => m.id === n.id);
        if (before && distance(before, q) > POLICE_SENSE && distance(n, p) <= POLICE_SENSE) out.add('id_shown');
      }
    }
  }

  // Events (für alle hörbar)
  for (let i = 0; i < next.zones.length; i++) {
    const before = prev.zones[i];
    if (!before) continue;
    if (before.phase !== 'active' && next.zones[i].phase === 'active') out.add('zoneStart');
    if (before.phase === 'active' && next.zones[i].phase !== 'active') out.add('zoneEnd');
  }
  return [...out];
}

/**
 * Schlüssel der Such-Loops, die gerade laufen sollen: eigene Spieler im Modus 'searching' während der laufenden
 * Runde (nicht im Countdown, nicht in der lokalen Pause). Der Aufrufer startet fehlende und stoppt übrige Loops.
 */
export function searchLoopKeys(state: GameState, ownIds: string[] | 'all', paused: boolean): string[] {
  if (paused || state.phase !== 'running' || countdownLeft(state) > 0) return [];
  return Object.values(state.players)
    .filter((p) => (ownIds === 'all' || ownIds.includes(p.id)) && p.mode === 'searching')
    .map((p) => SEARCH_LOOP_PREFIX + p.id);
}

/**
 * Führt zwei Listen eines Frames zusammen: jede ID einmal, außer 'pling' (eine je Flasche, Reihenfolge bleibt,
 * damit der Aufrufer sie nacheinander abspielen kann).
 */
export function mergeSounds(...lists: SoundId[][]): SoundId[] {
  const seen = new Set<SoundId>();
  const out: SoundId[] = [];
  for (const id of lists.flat()) {
    if (id !== 'pling') {
      if (seen.has(id)) continue;
      seen.add(id);
    }
    out.push(id);
  }
  return out;
}

/** Spezielle IDs, die einen allgemeinen Klang ersetzen, sobald es für sie eine Datei gibt. */
export const ALTERNATIVES: readonly (readonly [special: SoundId, general: SoundId])[] = [
  ['punch_miss', 'punch'],
  ['cart_rent', 'buy'],
];

/**
 * Hat die spezielle ID eine Datei, fällt die allgemeine weg (z. B. 'punch_miss' statt 'punch'). Ohne Datei bleibt
 * die allgemeine (mit Ersatzklang), die spezielle ist ohnehin stumm.
 */
export function preferAlternatives(ids: SoundId[], hasFile: (id: string) => boolean): SoundId[] {
  const drop = new Set<SoundId>();
  for (const [special, general] of ALTERNATIVES) if (ids.includes(special) && hasFile(special)) drop.add(general);
  return drop.size === 0 ? ids : ids.filter((id) => !drop.has(id));
}

/**
 * Lobby online: 'join', wenn ein anderer Spieler neu dazukommt oder wieder verbunden ist; 'leave', wenn einer
 * den Raum verlässt oder die Verbindung verliert. Die erste Liste nach dem Beitritt (prev null) bleibt still.
 */
export function rosterSounds(prev: readonly RosterEntry[] | null, next: readonly RosterEntry[], you: string): SoundId[] {
  if (prev === null) return [];
  const before = new Map(prev.map((p) => [p.id, p]));
  const after = new Map(next.map((p) => [p.id, p]));
  const out: SoundId[] = [];
  for (const p of next) {
    if (p.id === you) continue;
    const b = before.get(p.id);
    if ((!b && p.connected) || (b && !b.connected && p.connected)) {
      out.push('join');
      break;
    }
  }
  for (const p of prev) {
    if (p.id === you) continue;
    const a = after.get(p.id);
    if ((!a && p.connected) || (a && p.connected && !a.connected)) {
      out.push('leave');
      break;
    }
  }
  return out;
}

/** Neue Chatnachricht (nicht der Verlauf): 'chat' nur für fremde Nachrichten; die eigene klingt beim Senden. */
export function chatSound(msg: Pick<ChatMessage, 'id'>, you: string): SoundId | null {
  return msg.id === you ? null : 'chat';
}

/** Fehlermeldung des Servers: abgelehnter Kauf ist 'buy_denied', alles andere 'error'. */
export function errorSound(code: ErrorCode): SoundId {
  return code === 'cannot_buy' ? 'buy_denied' : 'error';
}
