import type { BottleKind, ShopCategory, ShopItemId, SpotType } from './types';

/** Kantenlänge einer Kachel in Pixeln */
export const TILE = 16;

export type Range = readonly [min: number, max: number];

/**
 * level: Stufen (Preis je nächste Stufe), once: höchstens einmal, count: Stückzahl bis max, je Kauf genau eins,
 * stack: Stückzahl bis max bzw. CONFIG.shop.maxStack, Menge im Shop wählbar
 */
export type ShopKind = 'level' | 'once' | 'count' | 'stack';

export interface ShopItemDef {
  category: ShopCategory;
  /** Anzeigename im Shop */
  name: string;
  kind: ShopKind;
  /** level: Preis in Cent von Stufe i auf i + 1; once/count/stack: [Preis je Stück] */
  prices: readonly number[];
  /** level: Wirkung je Stufe (Index = Stufe, Länge = prices.length + 1); sonst leer */
  values: readonly number[];
  /** count/stack: höchster Bestand (fehlt = CONFIG.shop.maxStack) */
  max?: number;
  /** stack: so viel Bestand bringt ein gekauftes Stück (Pfefferspray: 10 Ladungen je Flasche), fehlt = 1 */
  unit?: number;
  /** Miete: gilt nur für die Runde nach dem Kauf und ist am Rundenende weg (progressAfterRound) */
  perRound?: boolean;
  /** Kauf erst, wenn dieser Artikel vorhanden ist */
  requires?: ShopItemId;
}

export const CONFIG = {
  /** Standard-Rundenzeit (5 Minuten); der Host wählt in der Lobby 3, 5, 7 oder 10 Minuten */
  roundMs: 5 * 60 * 1000,
  /** Countdown vor jeder Runde (5, 4, 3, 2, 1, LOS!); solange er läuft, steht die Welt still */
  countdownMs: 5000,
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
  /** ... mit Kundenkarte */
  depositEveryMsCard: 100,
  refillMs: 30000,
  /** Wahrscheinlichkeit, dass ein Spot zu Rundenbeginn gefüllt ist */
  spotActiveChance: 0.85,
  /** Cent pro Flasche */
  bottleValue: { plastic: 8, glass: 15, crate: 25 } as Record<BottleKind, number>,
  /** Plätze: Hände plus je Tasche, Rucksack und Einkaufswagen (Spec §2.1); nur der Wagen bremst */
  carry: {
    base: 3,
    perUnit: { bag: 2, backpack: 5, cart: 10 },
    cartSpeedMult: 0.7,
  },
  /** Ausrauben eines Ausgeknockten (Spec §4.4) */
  steal: {
    /** größter Abstand Räuber zu Opfer in Pixeln */
    radius: 20,
    /** Anteil der Flaschen des Opfers (aufgerundet) */
    fraction: 0.5,
  },
  /** Schlagen (Spec §4.1) */
  fight: {
    /** größter Abstand zum Opfer in Pixeln */
    radius: 20,
    /** so lange nach einem Schlag (auch ohne Treffer) kein neuer */
    cooldownMs: 600,
    /** Grundschaden */
    damage: 20,
    /** zusätzlicher Schaden mit Boxhandschuh */
    gloveBonus: 10,
  },
  /** Pfefferspray (Spec §4.2): nächster wacher Spieler in radius, Stoß knockbackPx weg, damage Leben, cooldownMs Pause */
  spray: {
    radius: 30,
    knockbackPx: 40,
    damage: 2,
    cooldownMs: 1000,
  },
  /**
   * Shop-Phase (Spec 2026-10-09-shop-umbau §1). Reihenfolge der Einträge = Reihenfolge im Shop.
   * Alle Preise und Wirkungen sind erfundene Startwerte für das spätere Balancing.
   */
  shop: {
    /** Höchster Bestand eines Verbrauchsguts ohne eigenes max */
    maxStack: 99,
    /** Kundenkarte+: Aufschlag je Flasche in Prozent, kaufmännisch gerundet (Spec §3.3) */
    cardPlusBonusPct: 10,
    items: {
      bag: { category: 'bags', name: 'Tasche', kind: 'count', prices: [150], values: [], max: 4 },
      backpack: { category: 'bags', name: 'Rucksack', kind: 'count', prices: [400], values: [], max: 2 },
      cart: { category: 'bags', name: 'Einkaufswagen', kind: 'once', prices: [100], values: [], perRound: true },
      /** values: Faktor auf die Suchzeit */
      flashlight: { category: 'upgrades', name: 'Taschenlampe', kind: 'level', prices: [200, 500, 1000], values: [1, 0.85, 0.7, 0.55] },
      card: { category: 'upgrades', name: 'Kundenkarte', kind: 'once', prices: [300], values: [] },
      card_plus: { category: 'upgrades', name: 'Kundenkarte+', kind: 'once', prices: [600], values: [], requires: 'card' },
      glove: { category: 'weapons', name: 'Boxhandschuh', kind: 'once', prices: [400], values: [] },
      /** Bestand = Ladungen; eine gekaufte Flasche bringt unit Ladungen */
      pepper: { category: 'defense', name: 'Pfefferspray', kind: 'stack', prices: [300], values: [], max: 99, unit: 10 },
      id_papers: { category: 'defense', name: 'Ausweisdokumente', kind: 'once', prices: [300], values: [], perRound: true },
      dog_treat: { category: 'defense', name: 'Leckerli', kind: 'stack', prices: [100], values: [] },
    } as Record<ShopItemId, ShopItemDef>,
  },
  health: {
    max: 100,
    /** alle so viele ms verliert ein Spieler 1 Leben durch Hunger */
    hungerEveryMs: 8000,
    /** Dauer eines Knockouts */
    knockoutMs: 10000,
    /** Essensfund beim Suchen (Spec §5): heilt so viel, Chance je abgeschlossener Suche nach Spot-Art */
    food: {
      heal: 30,
      chance: { bin: 0.1, bus_stop: 0.04, bench: 0.04, bush: 0.04, park: 0.04 } as Record<SpotType, number>,
    },
    /** Leben nach dem Aufstehen */
    reviveHealth: 60,
    /** Schutz nach dem Aufstehen */
    spawnShieldMs: 3000,
  },
  npc: {
    /** Neue NPCs erscheinen nur, solange weniger als so viele jagen (sitzende, stehende und streunende zählen nicht) */
    maxCount: 3,
    /** Harte Obergrenze aller NPCs inklusive sitzender, stehender und streunender (NPCs verschwinden nie) */
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
    /**
     * Verliert ein jagender NPC sein Ziel (zu weit weg oder nicht mehr passend), bleibt er so lange stehen
     * (Hund sitzt und schaut sich um), statt gleich in der Nähe des Spielers herumzustreunen; danach streunt er.
     */
    lostTrackIdleMs: 8000,
    /** Während dieses Stehens jagt er nur wieder los, wenn ein passender Spieler so nah kommt (px) */
    idleEngageRadius: 60,
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
