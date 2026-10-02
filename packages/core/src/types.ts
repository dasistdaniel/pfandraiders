export type BottleKind = 'plastic' | 'glass' | 'crate';
export type Bottles = Record<BottleKind, number>;
export type SpotType = 'bus_stop' | 'bench' | 'bush' | 'bin' | 'park';
export type Mode = 'walking' | 'searching' | 'stealing';
export type ItemId = 'bolt_cutters';
/** Kaufbefehl: 'upgrade' = nächste Container-Stufe, sonst ein Special Item */
export type BuyCommand = 'upgrade' | ItemId;

export interface Point {
  x: number;
  y: number;
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
}

export interface Spot extends SpotDef {
  contents: Bottles;
  /** Restzeit bis zum Nachfüllen, nur relevant solange contents leer ist */
  refillInMs: number;
}

export interface GameState {
  tick: number;
  timeLeftMs: number;
  phase: 'running' | 'ended';
  rngState: number;
  map: MapData;
  players: Record<string, Player>;
  spots: Spot[];
}
