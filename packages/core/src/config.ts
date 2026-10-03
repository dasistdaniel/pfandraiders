import type { BottleKind, ItemId, SpotType } from './types';

/** Kantenlänge einer Kachel in Pixeln */
export const TILE = 16;

export type Range = readonly [min: number, max: number];

export const CONFIG = {
  roundMs: 10 * 60 * 1000,
  /** größter Zeitschritt, den ein einzelner step verarbeitet */
  maxStepMs: 100,
  /** Pixel pro Sekunde */
  playerSpeed: 90,
  /** halbe Kantenlänge der Kollisionsbox */
  playerHalf: 5,
  /** halbe Kantenlänge des festen Kerns einer weichen Kachel (Baum, Laterne) um deren Mitte */
  softHalf: 3,
  /** größter seitlicher Versatz, um den der Spieler an einer Kante vorbeigeschoben wird */
  slideMaxPx: 6,
  interactRadius: 20,
  searchMs: 3000,
  refillMs: 45000,
  /** Wahrscheinlichkeit, dass ein Spot zu Rundenbeginn gefüllt ist */
  spotActiveChance: 0.7,
  /** Cent pro Flasche */
  bottleValue: { plastic: 8, glass: 15, crate: 25 } as Record<BottleKind, number>,
  containers: [
    { name: 'Hände', capacity: 3, speedMult: 1 },
    { name: 'Tasche', capacity: 8, speedMult: 1 },
    { name: 'Rucksack', capacity: 15, speedMult: 0.95 },
    { name: 'Einkaufswagen', capacity: 30, speedMult: 0.75 },
  ],
  /** Preis in Cent, um von Stufe i auf i+1 zu kommen */
  upgradePrices: [150, 400, 900],
  /** Diebstahl */
  steal: {
    /** größter Abstand Dieb zu Opfer in Pixeln */
    radius: 20,
    /** so lange hält der Dieb die Taste */
    durationMs: 2000,
    /** Anteil des Opfer-Containers */
    fraction: 0.5,
    /** Schutz des Opfers nach einem Diebstahl */
    shieldMs: 3000,
  },
  items: {
    bolt_cutters: { name: 'Bolzenschneider', price: 600 },
    dog_treat: { name: 'Leckerli', price: 100 },
  } as Record<ItemId, { name: string; price: number }>,
  health: {
    max: 100,
    /** alle so viele ms verliert ein Spieler 1 Leben durch Hunger */
    hungerEveryMs: 8000,
    food: { price: 100, heal: 30 },
    unconsciousMs: 10000,
    /** Leben nach dem Respawn */
    reviveHealth: 60,
    /** Anteil des Geldes, der beim Umfallen verloren geht (abgerundet) */
    moneyLossFraction: 0.25,
    /** Schutz gegen Diebstahl nach dem Respawn */
    spawnShieldMs: 3000,
  },
  npc: {
    maxCount: 3,
    firstSpawnMs: 15000,
    spawnEveryMs: [20000, 40000] as Range,
    dogChance: 0.6,
    dog: {
      speed: 70,
      lifeMs: 30000,
      senseRadius: 160,
      biteRadius: 12,
      biteDamage: 15,
      biteCooldownMs: 1500,
      distractedMs: 8000,
      /** Nach einem Biss lässt der Hund genau diesen Spieler so lange in Ruhe */
      biteRestMs: 10000,
    },
    police: {
      speed: 55,
      lifeMs: 20000,
      senseRadius: 140,
      controlRadius: 22,
      checkMs: 2000,
      fraction: 0.5,
    },
  },
  zone: {
    announceMs: 20000,
    activeMs: 60000,
    firstIdleMs: [60000, 120000] as Range,
    idleMs: [90000, 150000] as Range,
    multiplier: 3,
    /** Nachfüllzeit eines Spots in einer aktiven Zone */
    refillMs: 12000,
  },
  /** Fundtabelle: pro Spot-Typ und Flaschenart [min, max] */
  spotTypes: {
    bus_stop: { plastic: [0, 2], glass: [0, 1], crate: [0, 0] },
    bench: { plastic: [0, 2], glass: [0, 1], crate: [0, 0] },
    bush: { plastic: [1, 3], glass: [0, 1], crate: [0, 0] },
    bin: { plastic: [1, 3], glass: [0, 2], crate: [0, 0] },
    park: { plastic: [0, 2], glass: [0, 2], crate: [0, 1] },
  } as Record<SpotType, Record<BottleKind, Range>>,
};
