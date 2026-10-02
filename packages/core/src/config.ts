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
  } as Record<ItemId, { name: string; price: number }>,
  /** Fundtabelle: pro Spot-Typ und Flaschenart [min, max] */
  spotTypes: {
    bus_stop: { plastic: [0, 2], glass: [0, 1], crate: [0, 0] },
    bench: { plastic: [0, 2], glass: [0, 1], crate: [0, 0] },
    bush: { plastic: [1, 3], glass: [0, 1], crate: [0, 0] },
    bin: { plastic: [1, 3], glass: [0, 2], crate: [0, 0] },
    park: { plastic: [0, 2], glass: [0, 2], crate: [0, 1] },
  } as Record<SpotType, Record<BottleKind, Range>>,
};
