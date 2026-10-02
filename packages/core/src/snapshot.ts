import { totalBottles } from './bottles';
import type { Snapshot } from './protocol';
import type { GameState, MapData } from './types';

/**
 * Der Zustand, den ein bestimmter Spieler sehen darf (Spec §5).
 * Fremdes Geld (bis Rundenende), fremder Container-Inhalt, fremde Items,
 * Such- und Tastenzustände und der Zufalls-Zustand werden entfernt.
 * Vom fremden Container bleibt nur "hat Flaschen" (als eine Plastikflasche).
 */
export function projectSnapshot(state: GameState, viewerId: string): Snapshot {
  const { map: _map, ...rest } = state;
  // JSON-Kopie: kein Aliasing mit dem Serverzustand
  const snap = JSON.parse(JSON.stringify(rest)) as Snapshot;
  const revealMoney = snap.phase === 'ended';

  for (const p of Object.values(snap.players)) {
    if (p.id === viewerId) continue;
    p.bottles = { plastic: totalBottles(p.bottles) > 0 ? 1 : 0, glass: 0, crate: 0 };
    p.item = null;
    if (!revealMoney) p.money = 0;
    p.searchSpotId = null;
    p.searchProgressMs = 0;
    p.actionHeld = false;
    p.stealHeld = false;
  }
  for (const spot of snap.spots) {
    spot.contents = { plastic: totalBottles(spot.contents) > 0 ? 1 : 0, glass: 0, crate: 0 };
    spot.refillInMs = 0;
  }
  snap.rngState = 0;
  snap.nextNpcMs = 0;
  snap.nextNpcId = 0;
  return snap;
}

/** Setzt aus Karte und Snapshot einen vollständigen GameState zusammen (für Anzeige und Hinweise im Client). */
export function stateFromSnapshot(map: MapData, snap: Snapshot): GameState {
  return { ...snap, map };
}
