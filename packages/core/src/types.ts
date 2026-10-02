export type BottleKind = 'plastic' | 'glass' | 'crate';
export type Bottles = Record<BottleKind, number>;
export type SpotType = 'bus_stop' | 'bench' | 'bush' | 'bin' | 'park';
export type Mode = 'walking' | 'searching' | 'stealing' | 'unconscious';
export type ItemId = 'bolt_cutters' | 'dog_treat';
/** Kaufbefehl: Container-Upgrade, Essen oder ein Special Item */
export type BuyCommand = 'upgrade' | 'food' | ItemId;

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
  /** Klauen-Taste gehalten */
  steal: boolean;
  /** Einmaliger Kaufbefehl, null = nichts kaufen */
  buy: BuyCommand | null;
}

export const NO_INPUT: Input = { moveX: 0, moveY: 0, action: false, steal: false, buy: null };

export interface SpotDef extends Point {
  id: number;
  type: SpotType;
}

export interface MapData {
  cols: number;
  rows: number;
  /** flach, Index = row * cols + col */
  solid: boolean[];
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
  /** Aktionstaste im vorigen Tick gedrückt, für Flankenerkennung */
  actionHeld: boolean;
  /** Klauen-Taste im vorigen Tick gedrückt, für die Flanke (Bolzenschneider) */
  stealHeld: boolean;
  /** Special Item im einzigen Slot, null = keins */
  item: ItemId | null;
  /** Opfer, das gerade bestohlen wird */
  stealTargetId: string | null;
  stealProgressMs: number;
  /** Restzeit des Schutzes nach einem Diebstahl, 0 = angreifbar */
  shieldMs: number;
  /** Leben, 0 = bewusstlos (kann zwischen Ticks Nachkommastellen haben) */
  health: number;
  /** Restzeit der Bewusstlosigkeit, 0 = bei Bewusstsein */
  unconsciousMs: number;
  /** Startpunkt, hier erscheint der Spieler nach der Bewusstlosigkeit */
  spawn: Point;
}

export interface Spot extends SpotDef {
  contents: Bottles;
  /** Restzeit bis zum Nachfüllen, nur relevant solange contents leer ist */
  refillInMs: number;
}

export type NpcKind = 'dog' | 'police';

export interface Npc {
  id: number;
  kind: NpcKind;
  x: number;
  y: number;
  /** Restlebensdauer */
  lifeMs: number;
  targetId: string | null;
  /** Hund: Pause bis zum nächsten Biss */
  cooldownMs: number;
  /** Hund: Restzeit, in der ein Leckerli ihn beschäftigt */
  distractedMs: number;
  /** Polizei: wie lange die laufende Kontrolle schon dauert */
  checkMs: number;
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
