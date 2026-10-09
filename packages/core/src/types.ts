export type BottleKind = 'plastic' | 'glass' | 'crate';
export type Bottles = Record<BottleKind, number>;
export type SpotType = 'bus_stop' | 'bench' | 'bush' | 'bin' | 'park';
export type Mode = 'walking' | 'searching' | 'unconscious';
export type ShopCategory = 'bags' | 'upgrades' | 'weapons' | 'defense';
export type ShopItemId =
  | 'bag'
  | 'backpack'
  | 'cart'
  | 'flashlight'
  | 'card'
  | 'card_plus'
  | 'glove'
  | 'pepper'
  | 'id_papers'
  | 'dog_treat';
/** Besitz je Shop-Artikel: Stückzahl, Stufe oder 0/1. Bleibt über Runden, außer Mietsachen (perRound). */
export type Items = Record<ShopItemId, number>;
/** Letzter Essensfund dieser Runde (privat): n zählt die Funde ab 1, text ist der Index in FOOD_TEXTS[spot]. */
export interface FoodFind {
  n: number;
  spot: SpotType;
  text: number;
  /** Leben war schon voll (aufgerundet): Text bekommt FOOD_FULL_SUFFIX */
  full: boolean;
}

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
  /** Ausrauben-Taste gehalten (wirkt beim Drücken, nur bei Ausgeknockten) */
  steal: boolean;
  /** Schlagen-Taste gehalten (wirkt beim Drücken) */
  attack: boolean;
  /** Pfefferspray-Taste gehalten (wirkt beim Drücken) */
  spray: boolean;
}

export const NO_INPUT: Input = { moveX: 0, moveY: 0, action: false, steal: false, attack: false, spray: false };

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
  /** Besitz aus dem Shop (Taschen, Upgrades, Boxhandschuh, Spray-Ladungen, Ausweis, Leckerli) */
  items: Items;
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
  /** Ausrauben-Taste im vorigen Tick gedrückt, für die Flanke (Ausrauben wirkt nur beim Drücken) */
  stealHeld: boolean;
  /** Schlagen-Taste im vorigen Tick gedrückt, für die Flanke */
  attackHeld: boolean;
  /** Pfefferspray-Taste im vorigen Tick gedrückt, für die Flanke */
  sprayHeld: boolean;
  /** Restzeit, bis der Spieler wieder schlagen kann, 0 = bereit */
  attackCooldownMs: number;
  /** Restzeit, bis der Spieler wieder sprühen kann, 0 = bereit (öffentlich: andere sehen die Wolke) */
  sprayCooldownMs: number;
  /** Restzeit des Schutzes nach dem Aufstehen aus einem Knockout, 0 = angreifbar */
  shieldMs: number;
  /** Leben, 0 = bewusstlos (kann zwischen Ticks Nachkommastellen haben) */
  health: number;
  /** Restzeit der Bewusstlosigkeit, 0 = bei Bewusstsein */
  unconsciousMs: number;
  /** In diesem Knockout schon ausgeraubt (einmal pro Knockout, Spec §4.4) */
  robbed: boolean;
  /** Letzter Essensfund dieser Runde, null = noch keiner (für den Hinweis im Client) */
  lastFood: FoodFind | null;
  /** Rundenverdienst in Cent (Pfand dieser Runde) */
  earnedRound: number;
  /** Gesamtverdienst der Serie in Cent (alle Runden, inklusive der laufenden) */
  earnedTotal: number;
  /** Startpunkt dieser Runde */
  spawn: Point;
}

export interface Spot extends SpotDef {
  contents: Bottles;
  /** Restzeit bis zum Nachfüllen, nur relevant solange contents leer ist */
  refillInMs: number;
}

export type NpcKind = 'dog' | 'police';

export type NpcMood = 'active' | 'idle' | 'alert' | 'roaming';

export interface Npc {
  id: number;
  kind: NpcKind;
  x: number;
  y: number;
  /** Restliche Ausdauer der Jagd (aktiv); läuft sie ab, gibt der NPC auf. Beim erneuten Jagen wieder voll. */
  lifeMs: number;
  /**
   * active = jagt/kontrolliert, idle = sitzt (nur Hund, harmlos), alert = hat sein Ziel verloren und steht
   * (jagt nur wieder los, wenn ein passender Spieler ganz nah kommt), roaming = streunt durch die Stadt
   */
  mood: NpcMood;
  /** idle/alert: Restzeit des Sitzens bzw. Stehens; roaming: wie lange er seinem Ziel schon nicht näher kommt */
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
  /** Restzeit des Countdowns vor der Runde; solange > 0, zählt step() nur ihn herunter (Rundenzeit steht) */
  countdownMs: number;
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
