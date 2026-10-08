import { CONFIG, isBeingChecked, totalBottles } from '@pfandraiders/core';
import type { GameState, Player } from '@pfandraiders/core';

export type SoundId =
  | 'pickup'
  | 'pling'
  | 'buy'
  | 'stealSuccess'
  | 'bite'
  | 'knockout'
  | 'policeCheck'
  | 'policeSeize'
  | 'zoneAnnounced'
  | 'roundEnd'
  | 'tick'
  | 'punch'
  | 'hit';

/** Hunger kostet pro Frame nur Bruchteile eines Lebens; ein Biss mindestens dies (minus Toleranz). */
const BITE_MIN_DROP = CONFIG.npc.dog.biteDamage - 1;
const BITE_NEAR = CONFIG.npc.dog.biteRadius + 6;
const PUNCH_NEAR = CONFIG.fight.radius + 6;

/** Höchstens so viele Plings pro Frame (online kann ein Snapshot mehrere Abgaben enthalten). */
export const PLING_MAX_PER_FRAME = 4;
/** Nach so langer Pause ohne Pling beginnt die Tonleiter wieder unten. */
export const PLING_RESET_MS = 700;
/** Höchste Stufe der Pling-Tonleiter (Stufen 0 bis PLING_MAX_STEP). */
export const PLING_MAX_STEP = 7;

/**
 * Tonstufe des nächsten Plings: folgt er innerhalb von PLING_RESET_MS auf den vorigen, eine Stufe
 * höher (bis PLING_MAX_STEP), sonst wieder Stufe 0. `lastMs` null = noch kein Pling.
 */
export function plingStep(lastMs: number | null, nowMs: number, prevStep: number): number {
  if (lastMs === null || nowMs - lastMs > PLING_RESET_MS) return 0;
  return Math.min(prevStep + 1, PLING_MAX_STEP);
}

/**
 * Vergleicht zwei aufeinanderfolgende Zustände und liefert die Sounds, die dazu gehören.
 * Rein und ohne Phaser/WebAudio. Nur diskrete Felder werden verglichen (keine Positionen).
 * `ownIds`: Spieler, deren persönliche Sounds hörbar sind ('all' = alle, Splitscreen).
 * Jede Sound-ID kommt höchstens einmal vor, außer 'pling': einmal pro abgegebener Flasche
 * (höchstens PLING_MAX_PER_FRAME), damit der Aufrufer die Töne nacheinander abspielen kann.
 */
export function detectSounds(
  prev: GameState | null,
  next: GameState,
  ownIds: string[] | 'all',
): SoundId[] {
  if (prev === null) return [];
  const out = new Set<SoundId>();
  let plings = 0;
  const audible = (id: string): boolean => ownIds === 'all' || ownIds.includes(id);

  // Ausrauben: ein Ausgeknockter wird "robbed" und verliert Flaschen; Räuber ist, wer dabei Flaschen gewann
  // (mit oder ohne Bolzenschneider). Für ihn gibt es stealSuccess statt pickup.
  const thieves = new Set<string>();
  for (const v of Object.values(next.players)) {
    const pv = prev.players[v.id];
    if (!pv || pv.robbed || !v.robbed || v.unconsciousMs === 0) continue;
    if (totalBottles(v.bottles) >= totalBottles(pv.bottles)) continue;
    for (const t of Object.values(next.players)) {
      const pt = prev.players[t.id];
      if (!pt || t.id === v.id || totalBottles(t.bottles) <= totalBottles(pt.bottles)) continue;
      thieves.add(t.id);
      if (audible(t.id)) out.add('stealSuccess');
      break;
    }
  }

  for (const p of Object.values(next.players)) {
    const q = prev.players[p.id];
    if (!q) continue;
    const own = audible(p.id);

    if (!own) continue;

    const bottlesNow = totalBottles(p.bottles);
    const bottlesBefore = totalBottles(q.bottles);
    if (bottlesNow > bottlesBefore && !thieves.has(p.id)) out.add('pickup');
    // Abgabe am Pfandautomaten: pro Flasche ein Pling
    if (p.money > q.money && bottlesNow < bottlesBefore) plings += bottlesBefore - bottlesNow;

    // Geld sinkt bei Bewusstsein nur durch Käufe
    const spent = p.money < q.money && q.unconsciousMs === 0 && p.unconsciousMs === 0;
    if (p.containerLevel > q.containerLevel || spent) {
      out.add('buy');
    }

    const knockedOut = q.unconsciousMs === 0 && p.unconsciousMs > 0;
    if (knockedOut) out.add('knockout');
    if (p.attackCooldownMs > q.attackCooldownMs) out.add('punch');
    if (q.unconsciousMs === 0) {
      const drop = q.health - p.health;
      const punched = punchedNear(prev, next, q);
      if (punched && drop >= CONFIG.fight.minDamage - 1) out.add('hit');
      // Ein Biss, der zum Umfallen führt, setzt Leben auf 0 und hat einen Hund in Reichweite.
      else if (drop >= BITE_MIN_DROP || (knockedOut && dogNear(prev, q))) out.add('bite');
    }

    if (!isBeingChecked(prev, p.id) && isBeingChecked(next, p.id)) out.add('policeCheck');
  }
  if (detectSeizures(prev, next, ownIds).length > 0) out.add('policeSeize');

  for (let i = 0; i < next.zones.length; i++) {
    const before = prev.zones[i];
    if (before && before.phase === 'idle' && next.zones[i].phase === 'announced') {
      out.add('zoneAnnounced');
      break;
    }
  }

  if (prev.phase === 'running' && next.phase === 'ended') out.add('roundEnd');

  if (prev.phase === 'running' && next.phase === 'running') {
    const a = Math.ceil(prev.timeLeftMs / 1000);
    const b = Math.ceil(next.timeLeftMs / 1000);
    if (b < a && b <= 10 && b >= 1) out.add('tick');
  }

  const plingIds: SoundId[] = Array.from({ length: Math.min(plings, PLING_MAX_PER_FRAME) }, () => 'pling');
  return [...out, ...plingIds];
}

export interface Seizure {
  /** Spieler, dem die Polizei Flaschen abgenommen hat */
  id: string;
  /** so viele Flaschen */
  count: number;
}

/**
 * Beschlagnahmen zwischen zwei Zuständen. Rein und nur aus Zustandsunterschieden, damit es lokal und
 * online gleich funktioniert. Erkennungszeichen: Am Ende einer Kontrolle lässt der Polizist den
 * Spieler in Ruhe (restId wechselt auf ihn) und dessen Flaschen werden weniger. Ausrauben und Abgabe
 * senken die Flaschen auch, setzen aber keinen Polizisten in Ruhe.
 */
export function detectSeizures(prev: GameState | null, next: GameState, ownIds: string[] | 'all'): Seizure[] {
  if (prev === null) return [];
  const out: Seizure[] = [];
  for (const p of Object.values(next.players)) {
    if (ownIds !== 'all' && !ownIds.includes(p.id)) continue;
    const q = prev.players[p.id];
    if (!q) continue;
    const count = totalBottles(q.bottles) - totalBottles(p.bottles);
    if (count <= 0) continue;
    const byPolice = next.npcs.some((n) => {
      if (n.kind !== 'police' || n.restId !== p.id) return false;
      const before = prev.npcs.find((m) => m.id === n.id);
      return before !== undefined && before.restId !== p.id;
    });
    if (byPolice) out.push({ id: p.id, count });
  }
  return out;
}

/** Hat ein anderer Spieler in Schlagweite von `p` in diesem Schritt geschlagen (Abklingzeit sprang hoch)? */
function punchedNear(prev: GameState, next: GameState, p: Player): boolean {
  return Object.values(next.players).some((o) => {
    const before = prev.players[o.id];
    return (
      o.id !== p.id &&
      before !== undefined &&
      o.attackCooldownMs > before.attackCooldownMs &&
      Math.hypot(o.x - p.x, o.y - p.y) <= PUNCH_NEAR
    );
  });
}

function dogNear(state: GameState, p: Player): boolean {
  return state.npcs.some((n) => n.kind === 'dog' && Math.hypot(n.x - p.x, n.y - p.y) <= BITE_NEAR);
}

/**
 * Tiefe Kopie der Felder, die detectSounds braucht. Nötig, weil der lokale Modus ein und dasselbe
 * veränderliche GameState-Objekt in jedem Frame liefert. Karte wird geteilt, Spots werden weggelassen.
 */
export function snapshotForSound(state: GameState): GameState {
  const players: GameState['players'] = {};
  for (const [id, p] of Object.entries(state.players)) {
    players[id] = { ...p, bottles: { ...p.bottles }, inventory: { ...p.inventory }, upgrades: { ...p.upgrades }, spawn: { ...p.spawn } };
  }
  return {
    ...state,
    players,
    spots: [],
    npcs: state.npcs.map((n) => ({ ...n })),
    zones: state.zones.map((z) => ({ ...z })),
  };
}
