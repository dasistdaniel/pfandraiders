import type { BottleKind, ShopCategory, ShopItemId, SpotType } from './types';

/** Kantenlänge einer Kachel in Pixeln */
export const TILE = 16;

export type Range = readonly [min: number, max: number];

/** level: Stufen (Preis je nächste Stufe), once: höchstens einmal, stack: Stückzahl bis CONFIG.shop.maxStack */
export type ShopKind = 'level' | 'once' | 'stack';

export interface ShopItemDef {
  category: ShopCategory;
  /** Anzeigename im Shop */
  name: string;
  kind: ShopKind;
  /** level: Preis in Cent von Stufe i auf i + 1; once/stack: [Preis je Stück] */
  prices: readonly number[];
  /** level: Wirkung je Stufe (Index = Stufe, Länge = prices.length + 1); sonst leer */
  values: readonly number[];
  /** false = wird grau mit "bald" angezeigt und ist nicht kaufbar */
  available: boolean;
}

/** Preis in Cent, um von Taschenstufe i auf i + 1 zu kommen */
const UPGRADE_PRICES: readonly number[] = [150, 400, 900];

export const CONFIG = {
  roundMs: 10 * 60 * 1000,
  /** größter Zeitschritt, den ein einzelner step verarbeitet */
  maxStepMs: 100,
  /** Pixel pro Sekunde */
  playerSpeed: 115,
  /** halbe Kantenlänge der Kollisionsbox */
  playerHalf: 5,
  /** halbe Kantenlänge des festen Kerns einer weichen Kachel (Baum, Laterne) um deren Mitte */
  softHalf: 3,
  /**
   * größter seitlicher Versatz, um den der Spieler an einer Kante vorbeigeschoben wird.
   * Muss >= playerHalf + softHalf + 1 sein, sonst blockiert ein weicher Kern bei mittigem Anlauf
   * (Kantenberührung zählt als blockiert, daher das +1).
   */
  slideMaxPx: 9,
  interactRadius: 20,
  searchMs: 1500,
  /** Am Pfandautomaten wird alle so viele ms eine Flasche abgegeben (die erste sofort beim Drücken) */
  depositEveryMs: 150,
  refillMs: 30000,
  /** Wahrscheinlichkeit, dass ein Spot zu Rundenbeginn gefüllt ist */
  spotActiveChance: 0.85,
  /** Cent pro Flasche */
  bottleValue: { plastic: 8, glass: 15, crate: 25 } as Record<BottleKind, number>,
  containers: [
    { name: 'Hände', capacity: 3, speedMult: 1 },
    { name: 'Tasche', capacity: 8, speedMult: 1 },
    { name: 'Rucksack', capacity: 15, speedMult: 0.95 },
    { name: 'Einkaufswagen', capacity: 30, speedMult: 0.75 },
  ],
  /** Preis in Cent, um von Stufe i auf i+1 zu kommen */
  upgradePrices: UPGRADE_PRICES,
  /** Diebstahl */
  steal: {
    /** größter Abstand Dieb zu Opfer in Pixeln */
    radius: 20,
    /** Anteil des Opfer-Containers */
    fraction: 0.5,
    /** Schutz des Opfers nach einem Diebstahl */
    shieldMs: 3000,
    /** so lange kann der Dieb nach einem Diebstahl nicht erneut klauen */
    cooldownMs: 6000,
  },
  /**
   * Shop-Phase (Spec §3). Reihenfolge der Einträge = Reihenfolge im Shop. Preise und Wirkungen sind
   * Startwerte für das spätere Balancing.
   */
  shop: {
    /** Höchster Bestand eines Verbrauchsguts */
    maxStack: 99,
    items: {
      bag: { category: 'bags', name: 'Größere Tasche', kind: 'level', prices: UPGRADE_PRICES, values: [], available: true },
      /** values: Knockout-Dauer in ms */
      knockout: { category: 'upgrades', name: 'Knockout kürzer', kind: 'level', prices: [200, 500, 1000], values: [20000, 15000, 10000, 5000], available: true },
      /** values: Faktor auf die Laufgeschwindigkeit */
      speed: { category: 'upgrades', name: 'Laufgeschwindigkeit', kind: 'level', prices: [200, 500, 1000], values: [1, 1.08, 1.16, 1.24], available: true },
      /** values: Faktor auf die Suchzeit */
      search: { category: 'upgrades', name: 'Schneller suchen', kind: 'level', prices: [200, 500, 1000], values: [1, 0.85, 0.7, 0.55], available: true },
      /** values: zusätzlicher Schaden je Schlag */
      punch: { category: 'attack', name: 'Stärkerer Schlag', kind: 'level', prices: [250, 600, 1200], values: [0, 5, 10, 15], available: true },
      bolt_cutters: { category: 'attack', name: 'Bolzenschneider', kind: 'once', prices: [600], values: [], available: true },
      sling: { category: 'attack', name: 'Steinschleuder', kind: 'once', prices: [800], values: [], available: false },
      pistol: { category: 'attack', name: 'Pistole', kind: 'once', prices: [2000], values: [], available: false },
      dog_treat: { category: 'defense', name: 'Leckerli', kind: 'stack', prices: [100], values: [], available: true },
      food: { category: 'defense', name: 'Essen', kind: 'stack', prices: [100], values: [], available: true },
      /** values: weniger Schaden je Schlag */
      armor: { category: 'defense', name: 'Rüstung', kind: 'level', prices: [250, 600, 1200], values: [0, 4, 8, 12], available: true },
    } as Record<ShopItemId, ShopItemDef>,
  },
  health: {
    max: 100,
    /** alle so viele ms verliert ein Spieler 1 Leben durch Hunger */
    hungerEveryMs: 8000,
    /** Eine Portion Essen aus dem Inventar heilt so viel */
    food: { heal: 30 },
    /** Leben nach dem Aufstehen */
    reviveHealth: 60,
    /** Schutz nach dem Aufstehen */
    spawnShieldMs: 3000,
  },
  npc: {
    /** Neue NPCs erscheinen nur, solange weniger als so viele jagen (sitzende und streunende zählen nicht) */
    maxCount: 3,
    /** Harte Obergrenze aller NPCs inklusive sitzender und streunender (NPCs verschwinden nie) */
    maxTotal: 6,
    /** Nach einem Biss, einer Kontrolle oder dem Aufgeben lässt der NPC diesen Spieler so lange in Ruhe */
    restMs: 20000,
    /** Streunen: Ziele liegen höchstens so weit von der aktuellen Position (px, 5 Kacheln) */
    wanderRadius: 80,
    /** So viele Zufallsversuche für ein begehbares Ziel, sonst bleibt er stehen */
    wanderTries: 6,
    /** So nah am Ziel gilt er als angekommen (px) */
    wanderArriveRadius: 6,
    /** Kommt er so lange nicht um wanderProgressPx näher, sucht er sich (nach einer Pause) ein neues Ziel */
    wanderStuckMs: 1200,
    wanderProgressPx: 4,
    /** Pause zwischen zwei Wegstücken */
    wanderPauseMs: [1500, 4000] as Range,
    /** Ist der direkte Weg zum Ziel verbaut, sucht der NPC höchstens so oft einen neuen Weg um die Wände (ms) */
    pathEveryMs: 300,
    /** So nah am Wegpunkt gilt er als erreicht, dann wird sofort der nächste gesucht (px) */
    pathArrivePx: 1.5,
    firstSpawnMs: 15000,
    spawnEveryMs: [20000, 40000] as Range,
    dogChance: 0.6,
    dog: {
      speed: 100,
      /** Streunen mit diesem Anteil der Geschwindigkeit */
      roamSpeedMult: 0.6,
      /** Ausdauer: so lange jagt er ohne Biss, dann gibt er auf (setzt sich) */
      lifeMs: 30000,
      senseRadius: 160,
      biteRadius: 12,
      biteDamage: 15,
      biteCooldownMs: 1500,
      distractedMs: 8000,
      /** Nach einem Biss (oder wenn er aufgibt) sitzt der Hund so lange, dann streunt er */
      sitMs: 8000,
    },
    police: {
      speed: 80,
      roamSpeedMult: 0.7,
      /** Ausdauer: so lange verfolgt er ohne Kontrolle, dann gibt er auf (streunt) */
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
    refillMs: 8000,
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
