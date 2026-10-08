import { totalBottles } from './bottles';
import type { Snapshot } from './protocol';
import { noUpgrades } from './shop';
import type { GameState, MapData, Player, Spot } from './types';

/**
 * Der Zustand, den ein bestimmter Spieler sehen darf (Spec §5).
 * Fremdes Geld und fremde Verdienste (bis Rundenende), fremder Container-Inhalt, fremdes Inventar und
 * fremde Upgrades, Such-, Abgabe- und Tastenzustände, die Klau-Abklingzeit und der Zufalls-Zustand werden entfernt.
 * Vom fremden Container bleibt nur "hat Flaschen" (als eine Plastikflasche).
 */
export function projectSnapshot(state: GameState, viewerId: string): Snapshot {
  const { map: _map, ...rest } = state;
  // JSON-Kopie: kein Aliasing mit dem Serverzustand
  const src = JSON.parse(JSON.stringify(rest)) as Omit<GameState, 'map'>;
  const revealMoney = src.phase === 'ended';

  // Allow-List: jedes Feld wird einzeln aufgeführt. Ein neues Feld in Player,
  // Spot oder GameState lässt die Kompilierung scheitern, bis hier bewusst
  // entschieden ist, ob es öffentlich ist.
  const players: Record<string, Player> = {};
  for (const [id, p] of Object.entries(src.players)) {
    if (id === viewerId) {
      players[id] = p;
      continue;
    }
    const foreign: Player = {
      id: p.id,
      x: p.x,
      y: p.y,
      money: revealMoney ? p.money : 0,
      bottles: { plastic: totalBottles(p.bottles) > 0 ? 1 : 0, glass: 0, crate: 0 },
      containerLevel: p.containerLevel,
      mode: p.mode,
      searchSpotId: null,
      searchProgressMs: 0,
      depositMs: 0,
      actionHeld: false,
      stealHeld: false,
      inventory: { dog_treat: 0, food: 0, bolt_cutters: false },
      upgrades: noUpgrades(),
      weapon: p.weapon,
      stealCooldownMs: 0,
      shieldMs: p.shieldMs,
      health: p.health,
      unconsciousMs: p.unconsciousMs,
      earnedRound: revealMoney ? p.earnedRound : 0,
      earnedTotal: revealMoney ? p.earnedTotal : 0,
      spawn: p.spawn,
    };
    players[id] = foreign;
  }

  const spots = src.spots.map(
    (s): Spot => ({
      id: s.id,
      type: s.type,
      x: s.x,
      y: s.y,
      contents: { plastic: totalBottles(s.contents) > 0 ? 1 : 0, glass: 0, crate: 0 },
      refillInMs: 0,
    }),
  );

  const snap: Snapshot = {
    tick: src.tick,
    timeLeftMs: src.timeLeftMs,
    phase: src.phase,
    rngState: 0,
    players,
    spots,
    npcs: src.npcs,
    nextNpcId: 0,
    nextNpcMs: 0,
    zones: src.zones,
  };
  return snap;
}

/**
 * Setzt aus Karte und Snapshot einen vollständigen GameState zusammen (für Anzeige und Hinweise im Client).
 * rngState, nextNpcMs und nextNpcId sind genullt: nur für Anzeige und Hinweise verwenden, nie mit step() weiterrechnen.
 */
export function stateFromSnapshot(map: MapData, snap: Snapshot): GameState {
  return { ...snap, map };
}
