import { CONFIG, isBeingChecked, totalBottles } from '@pfandraiders/core';
import type { GameState, Player } from '@pfandraiders/core';

export type SoundId =
  | 'pickup'
  | 'sell'
  | 'buy'
  | 'stealStart'
  | 'stealSuccess'
  | 'bite'
  | 'knockout'
  | 'policeCheck'
  | 'zoneAnnounced'
  | 'roundEnd'
  | 'tick';

/** Hunger kostet pro Frame nur Bruchteile eines Lebens; ein Biss mindestens dies (minus Toleranz). */
const BITE_MIN_DROP = CONFIG.npc.dog.biteDamage - 1;
const BITE_NEAR = CONFIG.npc.dog.biteRadius + 6;

/**
 * Vergleicht zwei aufeinanderfolgende Zustände und liefert die Sounds, die dazu gehören.
 * Rein und ohne Phaser/WebAudio. Nur diskrete Felder werden verglichen (keine Positionen).
 * `ownIds`: Spieler, deren persönliche Sounds hörbar sind ('all' = alle, Splitscreen).
 * Jede Sound-ID kommt höchstens einmal vor.
 */
export function detectSounds(
  prev: GameState | null,
  next: GameState,
  ownIds: string[] | 'all',
): SoundId[] {
  if (prev === null) return [];
  const out = new Set<SoundId>();
  const audible = (id: string): boolean => ownIds === 'all' || ownIds.includes(id);

  // Diebstahl: Das Opfer verliert Flaschen und bekommt Schutz (takeLoot). Der Dieb ist, wer es anvisierte
  // (oder mit Bolzenschneider sein Item verbrauchte) und dabei Flaschen gewann.
  const thieves = new Set<string>();
  for (const v of Object.values(next.players)) {
    const pv = prev.players[v.id];
    if (!pv) continue;
    const robbed =
      pv.shieldMs === 0 &&
      v.shieldMs > 0 &&
      pv.unconsciousMs === 0 &&
      v.unconsciousMs === 0 &&
      totalBottles(v.bottles) < totalBottles(pv.bottles);
    if (!robbed) continue;
    let thiefId: string | null = null;
    for (const t of Object.values(next.players)) {
      const pt = prev.players[t.id];
      if (!pt || t.id === v.id) continue;
      if (totalBottles(t.bottles) <= totalBottles(pt.bottles)) continue;
      if (pt.stealTargetId === v.id || (pt.item === 'bolt_cutters' && t.item === null)) {
        thiefId = t.id;
        break;
      }
    }
    if (thiefId !== null) thieves.add(thiefId);
    if (audible(v.id) || (thiefId !== null && audible(thiefId))) out.add('stealSuccess');
  }

  for (const p of Object.values(next.players)) {
    const q = prev.players[p.id];
    if (!q) continue;
    const own = audible(p.id);

    if (p.stealTargetId !== null && q.stealTargetId === null) {
      if (own || audible(p.stealTargetId)) out.add('stealStart');
    }
    if (!own) continue;

    const bottlesNow = totalBottles(p.bottles);
    const bottlesBefore = totalBottles(q.bottles);
    if (bottlesNow > bottlesBefore && !thieves.has(p.id)) out.add('pickup');
    if (p.money > q.money && bottlesNow < bottlesBefore) out.add('sell');

    // Geld sinkt bei Bewusstsein nur durch Käufe (Umfallen verliert Geld, aber bewusstlos)
    const spent = p.money < q.money && q.unconsciousMs === 0 && p.unconsciousMs === 0;
    if (p.containerLevel > q.containerLevel || (q.item === null && p.item !== null) || spent) {
      out.add('buy');
    }

    const knockedOut = q.unconsciousMs === 0 && p.unconsciousMs > 0;
    if (knockedOut) out.add('knockout');
    if (q.unconsciousMs === 0) {
      const drop = q.health - p.health;
      // Ein Biss, der zum Umfallen führt, setzt Leben auf 0 und hat einen Hund in Reichweite.
      if (drop >= BITE_MIN_DROP || (knockedOut && dogNear(prev, q))) out.add('bite');
    }

    if (!isBeingChecked(prev, p.id) && isBeingChecked(next, p.id)) out.add('policeCheck');
  }

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

  return [...out];
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
    players[id] = { ...p, bottles: { ...p.bottles }, spawn: { ...p.spawn } };
  }
  return {
    ...state,
    players,
    spots: [],
    npcs: state.npcs.map((n) => ({ ...n })),
    zones: state.zones.map((z) => ({ ...z })),
  };
}
