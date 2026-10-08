export type BottleKind = 'plastic' | 'glass' | 'crate';
export type Bottles = Record<BottleKind, number>;
export type SpotType = 'bus_stop' | 'bench' | 'bush' | 'bin' | 'park';
export type Mode = 'walking' | 'searching' | 'unconscious';
/** Upgrades mit Stufen (die Tasche ist containerLevel) */
export type UpgradeId = 'knockout' | 'speed' | 'search' | 'punch' | 'armor';
/** Stufe je Upgrade, 0 = nicht gekauft */
export type Upgrades = Record<UpgradeId, number>;
/** Verbrauchsgüter (Stückzahl) und der Bolzenschneider (höchstens einer) */
export interface Inventory {
  dog_treat: number;
  food: number;
  bolt_cutters: boolean;
}
/** Waffe; bisher nur die Faust, Fernkampf folgt in einem späteren Plan */
export type WeaponId = 'fist' | 'sling' | 'pistol';
export type ShopCategory = 'bags' | 'upgrades' | 'attack' | 'defense';
export type ShopItemId =
  | 'bag'
  | 'knockout'
  | 'speed'
  | 'search'
  | 'punch'
  | 'bolt_cutters'
  | 'sling'
  | 'pistol'
  | 'dog_treat'
  | 'food'
  | 'armor';

export interface Point {
  x: number;
  y: number;
}

/** Rechteck in Pixeln, x1/y1 exklusiv */
export interface Area {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface ZoneDef {
  id: string;
  name: string;
  area: Area;
}

export interface Input {
  moveX: -1 | 0 | 1;
  moveY: -1 | 0 | 1;
  /** Aktionstaste gehalten */
  action: boolean;
  /** Klauen-Taste gehalten (wirkt beim Drücken: klauen oder ausrauben) */
  steal: boolean;
  /** Schlagen-Taste gehalten (wirkt beim Drücken) */
  attack: boolean;
  /** Essen-Taste gehalten (wirkt beim Drücken: eine Portion aus dem Inventar) */
  eat: boolean;
}

export const NO_INPUT: Input = { moveX: 0, moveY: 0, action: false, steal: false, attack: false, eat: false };

export interface SpotDef extends Point {
  id: number;
  type: SpotType;
}

export interface MapData {
  cols: number;
  rows: number;
  /** flach, Index = row * cols + col */
  solid: boolean[];
  /** weiche Kacheln (Baum, Laterne): blockieren nur im Kern (CONFIG.softHalf); fehlt = keine */
  soft?: boolean[];
  spots: SpotDef[];
  dropoffs: Point[];
  shops: Point[];
  spawns: Point[];
  /** Eingänge, an denen Hunde und Polizisten erscheinen */
  npcSpawns: Point[];
  zones: ZoneDef[];
}

export interface Player {
  id: string;
  x: number;
  y: number;
  /** Cent */
  money: number;
  bottles: Bottles;
  containerLevel: number;
  mode: Mode;
  searchSpotId: number | null;
  searchProgressMs: number;
  /**
   * Abgabe am Pfandautomaten: Restzeit bis zur nächsten Flasche (Countdown, der Rest eines Schritts
   * wird übertragen). 0 = gibt gerade nicht ab; während der Abgabe immer > 0.
   */
  depositMs: number;
  /** Aktionstaste im vorigen Tick gedrückt, für Flankenerkennung */
  actionHeld: boolean;
  /** Klauen-Taste im vorigen Tick gedrückt, für die Flanke (Klauen wirkt nur beim Drücken) */
  stealHeld: boolean;
  /** Verbrauchsgüter und Bolzenschneider (bleiben über Runden) */
  inventory: Inventory;
  /** Upgrade-Stufen (bleiben über Runden) */
  upgrades: Upgrades;
  /** Waffe, bisher immer 'fist' */
  weapon: WeaponId;
  /** Restzeit, bis der Spieler wieder klauen kann, 0 = bereit */
  stealCooldownMs: number;
  /** Restzeit des Schutzes nach einem Diebstahl, 0 = angreifbar */
  shieldMs: number;
  /** Leben, 0 = bewusstlos (kann zwischen Ticks Nachkommastellen haben) */
  health: number;
  /** Restzeit der Bewusstlosigkeit, 0 = bei Bewusstsein */
  unconsciousMs: number;
  /** Rundenverdienst in Cent (Pfand dieser Runde) */
  earnedRound: number;
  /** Gesamtverdienst der Serie in Cent (alle Runden, inklusive der laufenden) */
  earnedTotal: number;
  /** Startpunkt, hier erscheint der Spieler nach der Bewusstlosigkeit */
  spawn: Point;
}

export interface Spot extends SpotDef {
  contents: Bottles;
  /** Restzeit bis zum Nachfüllen, nur relevant solange contents leer ist */
  refillInMs: number;
}

export type NpcKind = 'dog' | 'police';

export type NpcMood = 'active' | 'idle' | 'roaming';

export interface Npc {
  id: number;
  kind: NpcKind;
  x: number;
  y: number;
  /** Restliche Ausdauer der Jagd (aktiv); läuft sie ab, gibt der NPC auf. Beim erneuten Jagen wieder voll. */
  lifeMs: number;
  /** active = jagt/kontrolliert, idle = sitzt (nur Hund, harmlos), roaming = streunt durch die Stadt */
  mood: NpcMood;
  /** idle: Restzeit des Sitzens; roaming: wie lange er seinem Ziel schon nicht näher kommt */
  moodMs: number;
  targetId: string | null;
  /** Diesen Spieler lässt der NPC noch restMs lang in Ruhe (nach Biss, Kontrolle oder Aufgeben) */
  restId: string | null;
  restMs: number;
  /** roaming: Restzeit der Pause zwischen zwei Wegstücken (> 0 = steht) */
  pauseMs: number;
  /** roaming: Ziel des aktuellen Wegstücks */
  wanderX: number;
  wanderY: number;
  /** roaming: Abstand zum Ziel beim letzten Fortschritt (für die Erkennung "steckt fest") */
  wanderRef: number;
  /** Hund: Pause bis zum nächsten Biss */
  cooldownMs: number;
  /** Hund: Restzeit, in der ein Leckerli ihn beschäftigt */
  distractedMs: number;
  /** Polizei: wie lange die laufende Kontrolle schon dauert */
  checkMs: number;
  /** Jagd um Wände herum: aktueller Wegpunkt (Kachelmitte) und Zeit bis zur nächsten Wegsuche (0 = sofort) */
  pathX: number;
  pathY: number;
  pathMs: number;
}

export type ZonePhase = 'idle' | 'announced' | 'active';

export interface ZoneState {
  def: ZoneDef;
  phase: ZonePhase;
  /** Restzeit der aktuellen Phase */
  timerMs: number;
}

export interface GameState {
  tick: number;
  timeLeftMs: number;
  phase: 'running' | 'ended';
  rngState: number;
  map: MapData;
  players: Record<string, Player>;
  spots: Spot[];
  npcs: Npc[];
  nextNpcId: number;
  /** Zeit bis zum nächsten NPC-Spawn-Versuch */
  nextNpcMs: number;
  zones: ZoneState[];
}
