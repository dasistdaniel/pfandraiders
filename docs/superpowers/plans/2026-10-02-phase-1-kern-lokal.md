# Pfandsammler Phase 1 (Kern lokal, 1 Spieler) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein im Browser spielbares Ein-Spieler-Pfandsammler: laufen, Spots 3 s durchsuchen, Flaschen abgeben, Container-Upgrades kaufen, 10-Minuten-Runde mit Ergebnis. Platzhalter-Grafik (Farbblöcke).

**Architecture:** Monorepo mit zwei Paketen. `@pfand/core` ist reines TypeScript ohne Browser/Netzwerk und enthält alle Regeln als deterministische Funktion `step(state, inputs, dtMs)`. `@pfand/client` ist Phaser 3 und rendert nur den Zustand. Der Client spricht über die Schnittstelle `GameConnection` mit dem Spielkern; Phase 1 hat nur `LocalConnection`. Der Zustand ist schon für mehrere Spieler gebaut (`players` als Map), damit Phase 2 (Splitscreen) keinen Umbau braucht.

**Tech Stack:** TypeScript 5, npm workspaces, Vitest 3, Vite 6, Phaser 3.

**Spec:** `docs/superpowers/specs/2026-10-02-pfandsammler-design.md` (Abschnitte 1–4, 6 Phase 1, 8, 10)

## Global Constraints

- `core` darf weder Phaser noch DOM noch Netzwerk importieren. Zufall nur über `rng.ts` (Seed im Zustand), nie `Math.random` in `core`.
- Alle Spielwerte (Preise, Kapazitäten, Zeiten, Geschwindigkeiten, Fundtabellen) stehen nur in `packages/core/src/config.ts`, nirgends sonst als Zahl im Code.
- Geld ist intern ganzzahlig in Cent. Anzeige formatiert nur der Client (`1,50 €`).
- `step` verändert den übergebenen Zustand direkt und gibt ihn zurück.
- Rundenlänge 600000 ms (10 min). Eine Suche dauert 3000 ms. Diebstahl, Health, Events, Essen sind NICHT Teil von Phase 1.
- Steuerung: WASD oder Pfeiltasten, Aktionstaste `E` oder `Leertaste`, Taste `1` kauft das nächste Container-Upgrade, `R` startet nach Rundenende neu.
- Container-Stufen: Hände 3, Tasche 8, Rucksack 15, Einkaufswagen 30 (Wagen langsamer). Flaschenwerte Plastik 8, Glas 15, Kasten-Glas 25 Cent.
- Commit-Nachrichten enden mit der Zeile `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- Container voll: Suche darf nicht starten, nichts geht verloren (Task 5).
- Fund größer als Restplatz im Container: Überschuss bleibt im Spot, nichts verschwindet (Task 5).
- Aktionstaste am Pfandautomat gehalten: nur einmal abgeben, nicht jeden Tick (Task 6).
- Riesiger Zeitsprung (Lag, Tab im Hintergrund): Spieler läuft nicht durch Wände, Rundenzeit springt nicht (Task 4, Task 8).
- Diagonal laufen ist nicht schneller als geradeaus (Task 4).
- Upgrade-Kauf mit zu wenig Geld, an letzter Stufe oder weit weg vom Shop wird abgelehnt, Geld bleibt (Task 6).
- Ein Tastendruck "kaufen" kauft genau einmal, auch wenn pro Frame mehrere Ticks laufen oder gar keiner (Task 8).

---

## File Structure

```
package.json                      Workspace-Root, Skripte
tsconfig.base.json                gemeinsame TS-Einstellungen
packages/core/
  package.json  tsconfig.json
  src/
    config.ts       alle Spielwerte (CONFIG, TILE)
    types.ts        Typen + NO_INPUT
    rng.ts          Seed-Zufall (mulberry32) auf state.rngState
    bottles.ts      Flaschen zählen, bewerten, umfüllen
    map.ts          parseMap, Kollision (isSolidAt, boxBlocked)
    maps/city.ts    die feste Stadtkarte (ASCII)
    loot.ts         rollContents (Fundtabelle -> Flaschen)
    game.ts         createGame
    movement.ts     walk (Geschwindigkeit, Diagonale, Kollision)
    search.ts       Suchen, Spot-Nachfüllen
    economy.ts      Container, Nähe, Abgeben, Upgrade
    ranking.ts      Rangliste
    step.ts         step + updatePlayer
    index.ts        Re-Exports
  test/
    helpers.ts  rng.test.ts  bottles.test.ts  map.test.ts  city.test.ts
    loot.test.ts  game.test.ts  movement.test.ts  timer.test.ts
    search.test.ts  economy.test.ts  ranking.test.ts  determinism.test.ts
packages/client/
  package.json  tsconfig.json  vite.config.ts  index.html
  src/
    main.ts  format.ts  input.ts  connection.ts
    scenes/GameScene.ts
  test/
    format.test.ts  input.test.ts  connection.test.ts
```

Konvention in allen Tests: Hilfsfunktionen aus `packages/core/test/helpers.ts`. Befehle laufen im Repo-Root `C:\Users\daniel\Desktop\dev\KI Projekte\Pfandsammler`.

---

### Task 1: Workspace, Typen, Config, Zufall, Flaschen

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `packages/core/package.json`, `packages/core/tsconfig.json`
- Create: `packages/core/src/config.ts`, `types.ts`, `rng.ts`, `bottles.ts`, `index.ts`
- Test: `packages/core/test/rng.test.ts`, `packages/core/test/bottles.test.ts`

**Interfaces:**
- Produces: `CONFIG`, `TILE`; Typen `BottleKind`, `Bottles`, `SpotType`, `Input`, `NO_INPUT`, `Point`, `SpotDef`, `MapData`, `Player`, `Spot`, `GameState`, `Mode`; `nextRandom(rng)`, `randInt(rng, min, max)`; `BOTTLE_KINDS`, `emptyBottles()`, `totalBottles(b)`, `bottlesValue(b)`, `transferBottles(from, to, capacity)`.

- [ ] **Step 1: Workspace-Dateien anlegen**

`package.json`:
```json
{
  "name": "pfandsammler",
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "test": "npm test --workspaces --if-present",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "dev": "npm run dev -w @pfand/client",
    "build": "npm run build -w @pfand/client"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "vitest": "^3.0.0"
  }
}
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true
  }
}
```

`packages/core/package.json`:
```json
{
  "name": "@pfand/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}
```

`packages/core/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "test"]
}
```

- [ ] **Step 2: Abhängigkeiten installieren**

Run: `npm install`
Expected: legt `node_modules` und `package-lock.json` an, keine Fehler.

- [ ] **Step 3: Typen und Config schreiben**

`packages/core/src/types.ts`:
```ts
export type BottleKind = 'plastic' | 'glass' | 'crate';
export type Bottles = Record<BottleKind, number>;
export type SpotType = 'bus_stop' | 'bench' | 'bush' | 'bin' | 'park';
export type Mode = 'walking' | 'searching';

export interface Point {
  x: number;
  y: number;
}

export interface Input {
  moveX: -1 | 0 | 1;
  moveY: -1 | 0 | 1;
  /** Aktionstaste gehalten */
  action: boolean;
  /** Einmaliger Kaufbefehl, null = nichts kaufen */
  buy: 'upgrade' | null;
}

export const NO_INPUT: Input = { moveX: 0, moveY: 0, action: false, buy: null };

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
```

`packages/core/src/config.ts`:
```ts
import type { BottleKind, SpotType } from './types';

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
  /** Fundtabelle: pro Spot-Typ und Flaschenart [min, max] */
  spotTypes: {
    bus_stop: { plastic: [0, 2], glass: [0, 1], crate: [0, 0] },
    bench: { plastic: [0, 2], glass: [0, 1], crate: [0, 0] },
    bush: { plastic: [1, 3], glass: [0, 1], crate: [0, 0] },
    bin: { plastic: [1, 3], glass: [0, 2], crate: [0, 0] },
    park: { plastic: [0, 2], glass: [0, 2], crate: [0, 1] },
  } as Record<SpotType, Record<BottleKind, Range>>,
};
```

- [ ] **Step 4: Failing Tests schreiben**

`packages/core/test/rng.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { nextRandom, randInt } from '../src/rng';

describe('rng', () => {
  it('gives the same sequence for the same seed', () => {
    const a = { rngState: 42 };
    const b = { rngState: 42 };
    const seqA = Array.from({ length: 10 }, () => nextRandom(a));
    const seqB = Array.from({ length: 10 }, () => nextRandom(b));
    expect(seqA).toEqual(seqB);
  });

  it('gives different sequences for different seeds', () => {
    const a = { rngState: 1 };
    const b = { rngState: 2 };
    expect(nextRandom(a)).not.toEqual(nextRandom(b));
  });

  it('returns values in [0, 1)', () => {
    const r = { rngState: 7 };
    for (let i = 0; i < 1000; i++) {
      const v = nextRandom(r);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('randInt stays within inclusive bounds and reaches both ends', () => {
    const r = { rngState: 99 };
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(randInt(r, 2, 4));
    expect([...seen].sort()).toEqual([2, 3, 4]);
  });
});
```

`packages/core/test/bottles.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { bottlesValue, emptyBottles, totalBottles, transferBottles } from '../src/bottles';

describe('bottles', () => {
  it('counts and values bottles in cents', () => {
    const b = { plastic: 2, glass: 1, crate: 1 };
    expect(totalBottles(b)).toBe(4);
    expect(bottlesValue(b)).toBe(2 * 8 + 15 + 25);
    expect(bottlesValue(emptyBottles())).toBe(0);
  });

  it('transfers highest value first when capacity is short', () => {
    const from = { plastic: 3, glass: 2, crate: 1 };
    const to = emptyBottles();
    transferBottles(from, to, 4);
    expect(to).toEqual({ plastic: 1, glass: 2, crate: 1 });
    expect(from).toEqual({ plastic: 2, glass: 0, crate: 0 });
  });

  it('moves nothing into a full container', () => {
    const from = { plastic: 2, glass: 0, crate: 0 };
    const to = { plastic: 3, glass: 0, crate: 0 };
    transferBottles(from, to, 3);
    expect(to.plastic).toBe(3);
    expect(from.plastic).toBe(2);
  });

  it('never loses bottles', () => {
    const from = { plastic: 5, glass: 4, crate: 3 };
    const to = { plastic: 1, glass: 0, crate: 0 };
    const before = totalBottles(from) + totalBottles(to);
    transferBottles(from, to, 6);
    expect(totalBottles(from) + totalBottles(to)).toBe(before);
    expect(totalBottles(to)).toBe(6);
  });
});
```

- [ ] **Step 5: Tests laufen lassen, Fehlschlag prüfen**

Run: `npm test -w @pfand/core`
Expected: FAIL, "Failed to resolve import ../src/rng" bzw. "../src/bottles".

- [ ] **Step 6: Minimal implementieren**

`packages/core/src/rng.ts`:
```ts
export interface RngState {
  rngState: number;
}

/** mulberry32. Verändert state.rngState, gibt Zahl in [0, 1) zurück. */
export function nextRandom(s: RngState): number {
  s.rngState = (s.rngState + 0x6d2b79f5) >>> 0;
  let t = s.rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Ganzzahl in [min, max], beide inklusive. */
export function randInt(s: RngState, min: number, max: number): number {
  return min + Math.floor(nextRandom(s) * (max - min + 1));
}
```

`packages/core/src/bottles.ts`:
```ts
import { CONFIG } from './config';
import type { BottleKind, Bottles } from './types';

export const BOTTLE_KINDS: readonly BottleKind[] = ['plastic', 'glass', 'crate'];

/** Wertvollstes zuerst, wird bei knapper Kapazität in dieser Reihenfolge umgefüllt */
const VALUE_ORDER: readonly BottleKind[] = ['crate', 'glass', 'plastic'];

export function emptyBottles(): Bottles {
  return { plastic: 0, glass: 0, crate: 0 };
}

export function totalBottles(b: Bottles): number {
  return b.plastic + b.glass + b.crate;
}

/** Wert in Cent */
export function bottlesValue(b: Bottles): number {
  return BOTTLE_KINDS.reduce((sum, kind) => sum + b[kind] * CONFIG.bottleValue[kind], 0);
}

/** Füllt `to` aus `from` bis `capacity` gesamt. Der Rest bleibt in `from`. */
export function transferBottles(from: Bottles, to: Bottles, capacity: number): void {
  let room = Math.max(capacity - totalBottles(to), 0);
  for (const kind of VALUE_ORDER) {
    const n = Math.min(from[kind], room);
    from[kind] -= n;
    to[kind] += n;
    room -= n;
  }
}
```

`packages/core/src/index.ts`:
```ts
export * from './config';
export * from './types';
export * from './rng';
export * from './bottles';
```

- [ ] **Step 7: Tests und Typecheck laufen lassen**

Run: `npm test -w @pfand/core && npm run typecheck -w @pfand/core`
Expected: PASS (8 Tests), Typecheck ohne Ausgabe.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.base.json packages/core
git commit -m "feat(core): add workspace, types, config, rng and bottle helpers

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Karte parsen, Kollision, Stadtkarte

**Files:**
- Create: `packages/core/src/map.ts`, `packages/core/src/maps/city.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/map.test.ts`, `packages/core/test/city.test.ts`

**Interfaces:**
- Consumes: `TILE`, Typen aus Task 1.
- Produces: `parseMap(rows: string[]): MapData`, `isSolidAt(map, px, py): boolean`, `boxBlocked(map, x, y, half): boolean`, `CITY_ROWS: string[]`, `CITY_MAP: MapData`.

Kartenzeichen: `#` Wand, `.` Boden, `@` Spawn, `D` Pfandautomat, `S` Shop, `b` Bushaltestelle, `n` Bank, `g` Gebüsch, `m` Mülleimer, `p` Park. Alles außer `#` ist begehbar. Pixelposition = Kachelmitte.

- [ ] **Step 1: Failing Tests schreiben**

`packages/core/test/map.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { boxBlocked, isSolidAt, parseMap } from '../src/map';

const ROWS = [
  '#######',
  '#@bnD.#',
  '#.gmpS#',
  '#######',
];

describe('parseMap', () => {
  it('reads size, solids and special tiles at tile centers', () => {
    const map = parseMap(ROWS);
    expect(map.cols).toBe(7);
    expect(map.rows).toBe(4);
    expect(map.solid[0]).toBe(true);
    expect(map.solid[1 * 7 + 1]).toBe(false);
    expect(map.spawns).toEqual([{ x: 24, y: 24 }]);
    expect(map.dropoffs).toEqual([{ x: 72, y: 24 }]);
    expect(map.shops).toEqual([{ x: 88, y: 40 }]);
  });

  it('numbers spots in reading order with their type', () => {
    const map = parseMap(ROWS);
    expect(map.spots.map((s) => [s.id, s.type])).toEqual([
      [0, 'bus_stop'],
      [1, 'bench'],
      [2, 'bush'],
      [3, 'bin'],
      [4, 'park'],
    ]);
    expect(map.spots[0]).toMatchObject({ x: 40, y: 24 });
  });

  it('rejects ragged rows', () => {
    expect(() => parseMap(['###', '##'])).toThrow(/row 1/);
  });

  it('rejects unknown characters', () => {
    expect(() => parseMap(['#?#'])).toThrow(/unknown map char/);
  });
});

describe('collision', () => {
  const map = parseMap(['####', '#..#', '####']);

  it('treats walls and everything outside the map as solid', () => {
    expect(isSolidAt(map, 8, 8)).toBe(true);
    expect(isSolidAt(map, 24, 24)).toBe(false);
    expect(isSolidAt(map, -1, 24)).toBe(true);
    expect(isSolidAt(map, 24, -1)).toBe(true);
    expect(isSolidAt(map, 1000, 24)).toBe(true);
  });

  it('blocks a box when any corner touches a wall', () => {
    expect(boxBlocked(map, 24, 24, 5)).toBe(false);
    expect(boxBlocked(map, 18, 24, 5)).toBe(true); // linke Kante x=13 liegt in der Wand
    expect(boxBlocked(map, 24, 18, 5)).toBe(true);
  });
});
```

`packages/core/test/city.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { TILE } from '../src/config';
import { CITY_MAP } from '../src/maps/city';

function reachableTiles(map: typeof CITY_MAP, startX: number, startY: number): Set<number> {
  const seen = new Set<number>();
  const stack = [Math.floor(startY / TILE) * map.cols + Math.floor(startX / TILE)];
  while (stack.length > 0) {
    const i = stack.pop()!;
    if (seen.has(i) || map.solid[i]) continue;
    seen.add(i);
    const c = i % map.cols;
    const r = Math.floor(i / map.cols);
    if (c > 0) stack.push(i - 1);
    if (c < map.cols - 1) stack.push(i + 1);
    if (r > 0) stack.push(i - map.cols);
    if (r < map.rows - 1) stack.push(i + map.cols);
  }
  return seen;
}

describe('city map', () => {
  it('has the expected content', () => {
    expect(CITY_MAP.cols).toBe(32);
    expect(CITY_MAP.rows).toBe(20);
    expect(CITY_MAP.spawns.length).toBe(4);
    expect(CITY_MAP.dropoffs.length).toBe(1);
    expect(CITY_MAP.shops.length).toBe(1);
    expect(CITY_MAP.spots.length).toBe(13);
  });

  it('is enclosed by walls', () => {
    const { cols, rows, solid } = CITY_MAP;
    for (let c = 0; c < cols; c++) {
      expect(solid[c]).toBe(true);
      expect(solid[(rows - 1) * cols + c]).toBe(true);
    }
    for (let r = 0; r < rows; r++) {
      expect(solid[r * cols]).toBe(true);
      expect(solid[r * cols + cols - 1]).toBe(true);
    }
  });

  it('lets a player walk from the first spawn to every spot, dropoff and shop', () => {
    const start = CITY_MAP.spawns[0];
    const reach = reachableTiles(CITY_MAP, start.x, start.y);
    const targets = [...CITY_MAP.spots, ...CITY_MAP.dropoffs, ...CITY_MAP.shops, ...CITY_MAP.spawns];
    for (const t of targets) {
      const tile = Math.floor(t.y / TILE) * CITY_MAP.cols + Math.floor(t.x / TILE);
      expect(reach.has(tile), `unreachable target at ${t.x},${t.y}`).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Tests laufen lassen, Fehlschlag prüfen**

Run: `npm test -w @pfand/core -- test/map.test.ts test/city.test.ts`
Expected: FAIL, "Failed to resolve import ../src/map".

- [ ] **Step 3: Implementieren**

`packages/core/src/map.ts`:
```ts
import { TILE } from './config';
import type { MapData, Point, SpotDef, SpotType } from './types';

const SPOT_CHARS: Record<string, SpotType> = {
  b: 'bus_stop',
  n: 'bench',
  g: 'bush',
  m: 'bin',
  p: 'park',
};

export function parseMap(rows: string[]): MapData {
  const cols = rows[0].length;
  const solid: boolean[] = [];
  const spots: SpotDef[] = [];
  const dropoffs: Point[] = [];
  const shops: Point[] = [];
  const spawns: Point[] = [];

  rows.forEach((row, r) => {
    if (row.length !== cols) {
      throw new Error(`map row ${r} has length ${row.length}, expected ${cols}`);
    }
    for (let c = 0; c < cols; c++) {
      const ch = row[c];
      const center = { x: c * TILE + TILE / 2, y: r * TILE + TILE / 2 };
      solid.push(ch === '#');
      if (ch === '#' || ch === '.') continue;
      if (ch === '@') spawns.push(center);
      else if (ch === 'D') dropoffs.push(center);
      else if (ch === 'S') shops.push(center);
      else if (ch in SPOT_CHARS) spots.push({ id: spots.length, type: SPOT_CHARS[ch], ...center });
      else throw new Error(`unknown map char '${ch}' at row ${r}, col ${c}`);
    }
  });

  return { cols, rows: rows.length, solid, spots, dropoffs, shops, spawns };
}

/** Wand oder außerhalb der Karte */
export function isSolidAt(map: MapData, px: number, py: number): boolean {
  const c = Math.floor(px / TILE);
  const r = Math.floor(py / TILE);
  if (c < 0 || r < 0 || c >= map.cols || r >= map.rows) return true;
  return map.solid[r * map.cols + c];
}

/** Quadrat mit halber Kantenlänge `half` um (x, y). Gilt für half < TILE / 2. */
export function boxBlocked(map: MapData, x: number, y: number, half: number): boolean {
  return (
    isSolidAt(map, x - half, y - half) ||
    isSolidAt(map, x + half, y - half) ||
    isSolidAt(map, x - half, y + half) ||
    isSolidAt(map, x + half, y + half)
  );
}
```

`packages/core/src/maps/city.ts`:
```ts
import { parseMap } from '../map';

/** 32 x 20 Kacheln. Legende siehe map.ts. */
export const CITY_ROWS: string[] = [
  '################################',
  '#..............................#',
  '#.@@..######....b.....######.g.#',
  '#.....######..........######...#',
  '#..n..######..........######.m.#',
  '#.....######..........######...#',
  '#..............................#',
  '#.g...........p..........n.....#',
  '#..............................#',
  '#.####....D.....S.....####.....#',
  '#.####........m.......####.....#',
  '#.####................####.....#',
  '#..............................#',
  '#...b.........g..........n.....#',
  '#..............................#',
  '#.@.@..........................#',
  '#.....#####............#####...#',
  '#.....#####.p..........#####.n.#',
  '#..............................#',
  '################################',
];

export const CITY_MAP = parseMap(CITY_ROWS);
```

`packages/core/src/index.ts` ergänzen:
```ts
export * from './map';
export * from './maps/city';
```

- [ ] **Step 4: Tests und Typecheck laufen lassen**

Run: `npm test -w @pfand/core && npm run typecheck -w @pfand/core`
Expected: PASS. Schlägt der Test "has the expected content" wegen Zeilenlänge fehl, die betroffene Zeile in `city.ts` auf exakt 32 Zeichen korrigieren (der Fehler nennt die Zeilennummer).

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): add ASCII map parser, collision and city map

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Fundtabelle und createGame

**Files:**
- Create: `packages/core/src/loot.ts`, `packages/core/src/game.ts`, `packages/core/test/helpers.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/loot.test.ts`, `packages/core/test/game.test.ts`

**Interfaces:**
- Consumes: `CONFIG`, `nextRandom`, `randInt`, `emptyBottles`, `totalBottles`, `parseMap`, `CITY_MAP`.
- Produces: `rollContents(rng: RngState, type: SpotType): Bottles`; `createGame(seed: number, map: MapData, playerIds: string[], options?: { roundMs?: number }): GameState`. Test-Helfer in `helpers.ts` (siehe unten), die spätere Tests nutzen.

- [ ] **Step 1: Test-Helfer schreiben**

`packages/core/test/helpers.ts`:
```ts
import { createGame } from '../src/game';
import { parseMap } from '../src/map';
import { step } from '../src/step';
import { NO_INPUT } from '../src/types';
import type { Bottles, GameState, Input, Point } from '../src/types';

/** Karte mit Rand aus Wänden, Spawn bei Kachel (1,1). */
export function openRows(cols: number, rows: number): string[] {
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => {
      if (r === 0 || c === 0 || r === rows - 1 || c === cols - 1) return '#';
      return r === 1 && c === 1 ? '@' : '.';
    }).join(''),
  );
}

/** Spawn (24,24), Spot bei x=40, Pfandautomat bei x=72, Shop bei x=104 */
export const SEARCH_ROWS = ['########', '#@b.D.S#', '########'];

/** Zwei Spieler (x=24 und x=56) mit einem Spot dazwischen (x=40) */
export const TWO_PLAYER_ROWS = ['#########', '#@b@.D.S#', '#########'];

export function newGame(rows: string[], ids: string[] = ['p1']): GameState {
  return createGame(1, parseMap(rows), ids);
}

export function input(partial: Partial<Input>): Input {
  return { ...NO_INPUT, ...partial };
}

/** n Schritte à stepMs mit denselben Eingaben */
export function runSteps(
  state: GameState,
  inputs: Record<string, Input>,
  n: number,
  stepMs = 20,
): void {
  for (let i = 0; i < n; i++) step(state, inputs, stepMs);
}

/** Läuft mindestens `ms` Millisekunden in 20-ms-Schritten */
export function runFor(state: GameState, inputs: Record<string, Input>, ms: number): void {
  runSteps(state, inputs, Math.ceil(ms / 20), 20);
}

export function teleport(state: GameState, id: string, to: Point): void {
  state.players[id].x = to.x;
  state.players[id].y = to.y;
}

/** Setzt Inhalt eines Spots fest und schaltet den Nachfüll-Timer ab */
export function setSpot(state: GameState, spotId: number, contents: Partial<Bottles>): void {
  state.spots[spotId].contents = { plastic: 0, glass: 0, crate: 0, ...contents };
  state.spots[spotId].refillInMs = 0;
}
```

Hinweis: `helpers.ts` importiert `step` aus Task 4. Bis dahin importieren Tests dieses Tasks nur `openRows`/`newGame` nicht; `game.test.ts` und `loot.test.ts` importieren `helpers.ts` bewusst NICHT.

- [ ] **Step 2: Failing Tests schreiben**

`packages/core/test/loot.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { totalBottles } from '../src/bottles';
import { CONFIG } from '../src/config';
import { rollContents } from '../src/loot';
import type { SpotType } from '../src/types';

describe('rollContents', () => {
  const types = Object.keys(CONFIG.spotTypes) as SpotType[];

  it('always returns at least one bottle and respects the table', () => {
    const rng = { rngState: 123 };
    for (const type of types) {
      const table = CONFIG.spotTypes[type];
      for (let i = 0; i < 300; i++) {
        const c = rollContents(rng, type);
        expect(totalBottles(c)).toBeGreaterThanOrEqual(1);
        expect(c.glass).toBeLessThanOrEqual(table.glass[1]);
        expect(c.crate).toBeLessThanOrEqual(table.crate[1]);
        // plastic darf auf 1 angehoben werden, wenn sonst nichts gefallen ist
        expect(c.plastic).toBeLessThanOrEqual(Math.max(table.plastic[1], 1));
      }
    }
  });

  it('is deterministic for the same rng state', () => {
    const a = { rngState: 5 };
    const b = { rngState: 5 };
    expect(rollContents(a, 'park')).toEqual(rollContents(b, 'park'));
  });
});
```

`packages/core/test/game.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { totalBottles } from '../src/bottles';
import { CONFIG } from '../src/config';
import { createGame } from '../src/game';
import { CITY_MAP } from '../src/maps/city';

describe('createGame', () => {
  it('puts players on spawn points in order and wraps around', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const s = createGame(1, CITY_MAP, ids);
    ids.forEach((id, i) => {
      const spawn = CITY_MAP.spawns[i % CITY_MAP.spawns.length];
      expect(s.players[id]).toMatchObject({
        x: spawn.x,
        y: spawn.y,
        money: 0,
        containerLevel: 0,
        mode: 'walking',
        searchSpotId: null,
      });
    });
  });

  it('starts a running round with the configured time', () => {
    const s = createGame(1, CITY_MAP, ['a']);
    expect(s.phase).toBe('running');
    expect(s.timeLeftMs).toBe(CONFIG.roundMs);
    expect(s.tick).toBe(0);
  });

  it('accepts a shorter round length', () => {
    const s = createGame(1, CITY_MAP, ['a'], { roundMs: 5000 });
    expect(s.timeLeftMs).toBe(5000);
  });

  it('gives every spot either contents or a refill timer', () => {
    const s = createGame(77, CITY_MAP, ['a']);
    expect(s.spots.length).toBe(CITY_MAP.spots.length);
    for (const spot of s.spots) {
      if (totalBottles(spot.contents) === 0) {
        expect(spot.refillInMs).toBeGreaterThanOrEqual(0);
        expect(spot.refillInMs).toBeLessThan(CONFIG.refillMs);
      }
    }
  });

  it('is reproducible per seed and differs between seeds', () => {
    const a = createGame(1, CITY_MAP, ['a']);
    const b = createGame(1, CITY_MAP, ['a']);
    const c = createGame(2, CITY_MAP, ['a']);
    expect(a.spots).toEqual(b.spots);
    expect(a.spots).not.toEqual(c.spots);
  });

  it('refuses a map without spawn points', () => {
    const noSpawn = { ...CITY_MAP, spawns: [] };
    expect(() => createGame(1, noSpawn, ['a'])).toThrow(/spawn/);
  });
});
```

- [ ] **Step 3: Tests laufen lassen, Fehlschlag prüfen**

Run: `npm test -w @pfand/core -- test/loot.test.ts test/game.test.ts`
Expected: FAIL, "Failed to resolve import ../src/loot".

- [ ] **Step 4: Implementieren**

`packages/core/src/loot.ts`:
```ts
import { BOTTLE_KINDS, emptyBottles, totalBottles } from './bottles';
import { CONFIG } from './config';
import { randInt } from './rng';
import type { RngState } from './rng';
import type { Bottles, SpotType } from './types';

/** Würfelt den Inhalt eines Spots nach der Fundtabelle. Mindestens eine Flasche. */
export function rollContents(rng: RngState, type: SpotType): Bottles {
  const table = CONFIG.spotTypes[type];
  const out = emptyBottles();
  for (const kind of BOTTLE_KINDS) {
    const [min, max] = table[kind];
    out[kind] = randInt(rng, min, max);
  }
  if (totalBottles(out) === 0) out.plastic = 1;
  return out;
}
```

`packages/core/src/game.ts`:
```ts
import { emptyBottles } from './bottles';
import { CONFIG } from './config';
import { rollContents } from './loot';
import { nextRandom } from './rng';
import type { GameState, MapData, Player, Point, Spot, SpotDef } from './types';

export interface GameOptions {
  roundMs?: number;
}

export function createGame(
  seed: number,
  map: MapData,
  playerIds: string[],
  options: GameOptions = {},
): GameState {
  if (map.spawns.length === 0) throw new Error('map has no spawn point');
  const state: GameState = {
    tick: 0,
    timeLeftMs: options.roundMs ?? CONFIG.roundMs,
    phase: 'running',
    rngState: seed >>> 0,
    map,
    players: {},
    spots: [],
  };
  playerIds.forEach((id, i) => {
    state.players[id] = newPlayer(id, map.spawns[i % map.spawns.length]);
  });
  for (const def of map.spots) state.spots.push(newSpot(state, def));
  return state;
}

function newPlayer(id: string, at: Point): Player {
  return {
    id,
    x: at.x,
    y: at.y,
    money: 0,
    bottles: emptyBottles(),
    containerLevel: 0,
    mode: 'walking',
    searchSpotId: null,
    searchProgressMs: 0,
    actionHeld: false,
  };
}

function newSpot(state: GameState, def: SpotDef): Spot {
  const spot: Spot = { ...def, contents: emptyBottles(), refillInMs: 0 };
  if (nextRandom(state) < CONFIG.spotActiveChance) {
    spot.contents = rollContents(state, def.type);
  } else {
    spot.refillInMs = Math.floor(nextRandom(state) * CONFIG.refillMs);
  }
  return spot;
}
```

`packages/core/src/index.ts` ergänzen:
```ts
export * from './loot';
export * from './game';
```

- [ ] **Step 5: Tests und Typecheck laufen lassen**

Run: `npm test -w @pfand/core -- test/loot.test.ts test/game.test.ts`
Expected: PASS. (Der Typecheck des ganzen Pakets schlägt hier noch fehl, weil `helpers.ts` das noch fehlende `step` importiert. Das wird in Task 4 behoben. Typecheck deshalb erst ab Task 4 wieder ausführen.)

- [ ] **Step 6: Commit**

```bash
git add packages/core
git commit -m "feat(core): add loot table and createGame

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Bewegung, step und Rundentimer

**Files:**
- Create: `packages/core/src/movement.ts`, `packages/core/src/step.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/movement.test.ts`, `packages/core/test/timer.test.ts`

**Interfaces:**
- Consumes: `boxBlocked`, `CONFIG`, `Input`, `NO_INPUT`, Helfer aus `helpers.ts`.
- Produces: `walk(map: MapData, p: Player, input: Input, dtMs: number): void`; `step(state: GameState, inputs: Record<string, Input>, dtMs: number): GameState`.

- [ ] **Step 1: Failing Tests schreiben**

`packages/core/test/movement.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { step } from '../src/step';
import { input, newGame, openRows, runSteps } from './helpers';

describe('movement', () => {
  it('walks at the configured speed', () => {
    const s = newGame(openRows(20, 5));
    runSteps(s, { p1: input({ moveX: 1 }) }, 50, 20); // 1000 ms
    expect(s.players.p1.x).toBeCloseTo(24 + CONFIG.playerSpeed, 5);
    expect(s.players.p1.y).toBe(24);
  });

  it('does not walk faster diagonally', () => {
    const s = newGame(openRows(20, 10));
    runSteps(s, { p1: input({ moveX: 1, moveY: 1 }) }, 50, 20);
    const dx = s.players.p1.x - 24;
    const dy = s.players.p1.y - 24;
    expect(Math.hypot(dx, dy)).toBeCloseTo(CONFIG.playerSpeed, 5);
  });

  it('stops at walls', () => {
    const s = newGame(['#####', '#@.##', '#####']);
    runSteps(s, { p1: input({ moveX: 1 }) }, 100, 20);
    const maxX = 48 - CONFIG.playerHalf; // linke Kante der Wandkachel minus halbe Boxbreite
    expect(s.players.p1.x).toBeLessThanOrEqual(maxX);
    expect(s.players.p1.x).toBeGreaterThan(maxX - 3);
    expect(s.players.p1.y).toBe(24);
  });

  it('slides along a wall when moving diagonally into it', () => {
    const s = newGame(openRows(10, 5));
    runSteps(s, { p1: input({ moveX: -1, moveY: 1 }) }, 30, 20);
    expect(s.players.p1.x).toBeGreaterThanOrEqual(16 + CONFIG.playerHalf);
    expect(s.players.p1.y).toBeGreaterThan(24);
  });

  it('is slower with the shopping cart', () => {
    const s = newGame(openRows(20, 5));
    s.players.p1.containerLevel = 3;
    runSteps(s, { p1: input({ moveX: 1 }) }, 50, 20);
    expect(s.players.p1.x - 24).toBeCloseTo(CONFIG.playerSpeed * CONFIG.containers[3].speedMult, 5);
  });

  it('clamps a huge time step so the player cannot jump through walls', () => {
    const s = newGame(openRows(40, 5));
    step(s, { p1: input({ moveX: 1 }) }, 10000);
    expect(s.players.p1.x - 24).toBeCloseTo((CONFIG.playerSpeed * CONFIG.maxStepMs) / 1000, 5);
    expect(s.timeLeftMs).toBe(CONFIG.roundMs - CONFIG.maxStepMs);
  });

  it('ignores a player that has no input this tick', () => {
    const s = newGame(openRows(20, 5), ['p1', 'p2']);
    runSteps(s, { p1: input({ moveX: 1 }) }, 10, 20);
    expect(s.players.p2.x).toBe(24);
  });
});
```

`packages/core/test/timer.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { createGame } from '../src/game';
import { parseMap } from '../src/map';
import { step } from '../src/step';
import { input, openRows, runSteps } from './helpers';

describe('round timer', () => {
  const map = parseMap(openRows(20, 5));

  it('counts down and ends the round at zero', () => {
    const s = createGame(1, map, ['p1'], { roundMs: 1000 });
    runSteps(s, {}, 49, 20);
    expect(s.phase).toBe('running');
    expect(s.timeLeftMs).toBe(20);
    runSteps(s, {}, 1, 20);
    expect(s.phase).toBe('ended');
    expect(s.timeLeftMs).toBe(0);
  });

  it('freezes the game after the round has ended', () => {
    const s = createGame(1, map, ['p1'], { roundMs: 100 });
    runSteps(s, {}, 5, 20);
    expect(s.phase).toBe('ended');
    const tick = s.tick;
    runSteps(s, { p1: input({ moveX: 1 }) }, 10, 20);
    expect(s.players.p1.x).toBe(24);
    expect(s.tick).toBe(tick);
  });

  it('uses the configured round length by default', () => {
    const s = createGame(1, map, ['p1']);
    expect(s.timeLeftMs).toBe(CONFIG.roundMs);
    step(s, {}, 20);
    expect(s.timeLeftMs).toBe(CONFIG.roundMs - 20);
  });

  it('ignores negative time steps', () => {
    const s = createGame(1, map, ['p1']);
    step(s, {}, -50);
    expect(s.timeLeftMs).toBe(CONFIG.roundMs);
  });
});
```

- [ ] **Step 2: Tests laufen lassen, Fehlschlag prüfen**

Run: `npm test -w @pfand/core -- test/movement.test.ts test/timer.test.ts`
Expected: FAIL, "Failed to resolve import ../src/step".

- [ ] **Step 3: Implementieren**

`packages/core/src/movement.ts`:
```ts
import { CONFIG } from './config';
import { boxBlocked } from './map';
import type { Input, MapData, Player } from './types';

/** Bewegt den Spieler gemäß Eingabe. Achsen getrennt, damit er an Wänden entlanggleitet. */
export function walk(map: MapData, p: Player, input: Input, dtMs: number): void {
  const speed = CONFIG.playerSpeed * CONFIG.containers[p.containerLevel].speedMult;
  const diagonal = input.moveX !== 0 && input.moveY !== 0 ? Math.SQRT1_2 : 1;
  const dist = (speed * dtMs * diagonal) / 1000;
  const dx = input.moveX * dist;
  const dy = input.moveY * dist;
  if (!boxBlocked(map, p.x + dx, p.y, CONFIG.playerHalf)) p.x += dx;
  if (!boxBlocked(map, p.x, p.y + dy, CONFIG.playerHalf)) p.y += dy;
}
```

`packages/core/src/step.ts`:
```ts
import { CONFIG } from './config';
import { walk } from './movement';
import { NO_INPUT } from './types';
import type { GameState, Input, Player } from './types';

/**
 * Ein Simulationsschritt. Verändert `state` direkt und gibt ihn zurück.
 * Spieler ohne Eintrag in `inputs` bekommen NO_INPUT.
 */
export function step(
  state: GameState,
  inputs: Record<string, Input>,
  dtMs: number,
): GameState {
  if (state.phase === 'ended') return state;
  const dt = Math.min(Math.max(dtMs, 0), CONFIG.maxStepMs);
  state.tick++;

  for (const id of Object.keys(state.players)) {
    updatePlayer(state, state.players[id], inputs[id] ?? NO_INPUT, dt);
  }

  state.timeLeftMs -= dt;
  if (state.timeLeftMs <= 0) {
    state.timeLeftMs = 0;
    state.phase = 'ended';
  }
  return state;
}

function updatePlayer(state: GameState, p: Player, input: Input, dt: number): void {
  if (input.moveX !== 0 || input.moveY !== 0) walk(state.map, p, input, dt);
}
```

`packages/core/src/index.ts` ergänzen:
```ts
export * from './movement';
export * from './step';
```

- [ ] **Step 4: Tests und Typecheck laufen lassen**

Run: `npm test -w @pfand/core && npm run typecheck -w @pfand/core`
Expected: PASS, Typecheck sauber (auch `helpers.ts` kompiliert jetzt).

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): add movement, step and round timer

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Suchen und Spot-Nachfüllen

**Files:**
- Create: `packages/core/src/economy.ts` (nur Teil 1: Nähe und Container), `packages/core/src/search.ts`
- Modify: `packages/core/src/step.ts` (Funktionen `step` und `updatePlayer`), `packages/core/src/index.ts`
- Test: `packages/core/test/search.test.ts`

**Interfaces:**
- Consumes: `transferBottles`, `totalBottles`, `rollContents`, `CONFIG`, Helfer.
- Produces: in `economy.ts`: `containerOf(p)`, `capacityOf(p)`, `distance(a, b)`, `isNear(points, p)`. In `search.ts`: `findSearchableSpot(state, p): Spot | null`, `cancelSearch(p)`, `updateSearch(state, p, dtMs): boolean`, `refillSpot(state, spot, dtMs)`.

Regeln: Suche läuft, solange Aktionstaste gehalten, Spieler steht still, ein nicht leerer Spot in `interactRadius` ist und der Container Platz hat. Loslassen, Bewegen oder Voll-werden bricht ab und setzt den Fortschritt auf 0. Nach 3000 ms wandert der Spot-Inhalt (so viel Platz da ist) in den Container. Ist der Spot danach leer, startet sein Nachfüll-Timer.

- [ ] **Step 1: Failing Tests schreiben**

`packages/core/test/search.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { totalBottles } from '../src/bottles';
import { CONFIG } from '../src/config';
import {
  input,
  newGame,
  runFor,
  runSteps,
  SEARCH_ROWS,
  setSpot,
  TWO_PLAYER_ROWS,
} from './helpers';

const HOLD = { p1: input({ action: true }) };

describe('searching', () => {
  it('moves the spot contents into the container after the search time', () => {
    const s = newGame(SEARCH_ROWS);
    setSpot(s, 0, { plastic: 2 });
    runFor(s, HOLD, CONFIG.searchMs + 100);
    expect(s.players.p1.bottles.plastic).toBe(2);
    expect(totalBottles(s.spots[0].contents)).toBe(0);
    expect(s.spots[0].refillInMs).toBeGreaterThan(0);
    expect(s.spots[0].refillInMs).toBeLessThanOrEqual(CONFIG.refillMs);
    expect(s.players.p1.mode).toBe('walking');
  });

  it('shows searching mode and progress while the key is held', () => {
    const s = newGame(SEARCH_ROWS);
    setSpot(s, 0, { plastic: 1 });
    runSteps(s, HOLD, 50, 20); // 1000 ms
    expect(s.players.p1.mode).toBe('searching');
    expect(s.players.p1.searchSpotId).toBe(0);
    expect(s.players.p1.searchProgressMs).toBe(1000);
  });

  it('resets progress when the key is released', () => {
    const s = newGame(SEARCH_ROWS);
    setSpot(s, 0, { plastic: 1 });
    runSteps(s, HOLD, 100, 20); // 2000 ms
    runSteps(s, { p1: input({}) }, 1, 20);
    expect(s.players.p1.mode).toBe('walking');
    expect(s.players.p1.searchProgressMs).toBe(0);
    runSteps(s, HOLD, 100, 20); // wieder 2000 ms, zusammen unter der Suchzeit pro Versuch
    expect(totalBottles(s.players.p1.bottles)).toBe(0);
    expect(s.players.p1.mode).toBe('searching');
  });

  it('cancels the search when the player moves', () => {
    const s = newGame(SEARCH_ROWS);
    setSpot(s, 0, { plastic: 1 });
    runSteps(s, HOLD, 50, 20);
    runSteps(s, { p1: input({ action: true, moveX: 1 }) }, 1, 20);
    expect(s.players.p1.mode).toBe('walking');
    expect(s.players.p1.searchProgressMs).toBe(0);
    expect(s.players.p1.x).toBeGreaterThan(24);
  });

  it('does not start when the container is full and loses nothing', () => {
    const s = newGame(SEARCH_ROWS);
    setSpot(s, 0, { plastic: 2 });
    s.players.p1.bottles = { plastic: 3, glass: 0, crate: 0 }; // Hände fassen 3
    runFor(s, HOLD, CONFIG.searchMs + 100);
    expect(s.players.p1.mode).toBe('walking');
    expect(s.players.p1.bottles.plastic).toBe(3);
    expect(s.spots[0].contents.plastic).toBe(2);
  });

  it('keeps the surplus in the spot when the find is bigger than the free room', () => {
    const s = newGame(SEARCH_ROWS);
    setSpot(s, 0, { plastic: 3 });
    s.players.p1.bottles = { plastic: 2, glass: 0, crate: 0 };
    runFor(s, HOLD, CONFIG.searchMs + 100);
    expect(s.players.p1.bottles.plastic).toBe(3);
    expect(s.spots[0].contents.plastic).toBe(2);
    expect(s.spots[0].refillInMs).toBe(0); // nicht leer, also kein Nachfüll-Timer gestartet
  });

  it('ignores empty spots', () => {
    const s = newGame(SEARCH_ROWS);
    setSpot(s, 0, {});
    s.spots[0].refillInMs = 99999;
    runSteps(s, HOLD, 10, 20);
    expect(s.players.p1.mode).toBe('walking');
  });

  it('ignores spots that are out of reach', () => {
    const s = newGame(SEARCH_ROWS);
    setSpot(s, 0, { plastic: 1 });
    s.players.p1.x = 104; // 64 px entfernt, weit über dem Interaktionsradius
    runSteps(s, HOLD, 10, 20);
    expect(s.players.p1.mode).toBe('walking');
  });

  it('refills an empty spot after its timer runs out', () => {
    const s = newGame(SEARCH_ROWS);
    setSpot(s, 0, {});
    s.spots[0].refillInMs = 1000;
    runFor(s, {}, 900);
    expect(totalBottles(s.spots[0].contents)).toBe(0);
    runFor(s, {}, 200);
    expect(totalBottles(s.spots[0].contents)).toBeGreaterThanOrEqual(1);
  });

  it('never duplicates bottles when two players search the same spot', () => {
    const s = newGame(TWO_PLAYER_ROWS, ['p1', 'p2']);
    setSpot(s, 0, { plastic: 1 });
    const both = { p1: input({ action: true }), p2: input({ action: true }) };
    runFor(s, both, CONFIG.searchMs + 100);
    const total = totalBottles(s.players.p1.bottles) + totalBottles(s.players.p2.bottles);
    expect(total).toBe(1);
    expect(s.players.p1.bottles.plastic).toBe(1); // wer in der Spielerreihenfolge zuerst fertig wird
    expect(s.players.p2.mode).toBe('walking');
  });
});
```

- [ ] **Step 2: Tests laufen lassen, Fehlschlag prüfen**

Run: `npm test -w @pfand/core -- test/search.test.ts`
Expected: FAIL (Suche passiert nicht, bzw. fehlende Module).

- [ ] **Step 3: `economy.ts` (Teil 1) und `search.ts` schreiben**

`packages/core/src/economy.ts`:
```ts
import { CONFIG } from './config';
import type { Player, Point } from './types';

export function containerOf(p: Player) {
  return CONFIG.containers[p.containerLevel];
}

export function capacityOf(p: Player): number {
  return containerOf(p).capacity;
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Ist der Spieler innerhalb des Interaktionsradius eines der Punkte? */
export function isNear(points: readonly Point[], p: Point): boolean {
  return points.some((pt) => distance(pt, p) <= CONFIG.interactRadius);
}
```

`packages/core/src/search.ts`:
```ts
import { totalBottles, transferBottles } from './bottles';
import { CONFIG } from './config';
import { capacityOf, distance } from './economy';
import { rollContents } from './loot';
import type { GameState, Player, Spot } from './types';

/** Nächster nicht leerer Spot in Reichweite, sonst null. Gleichstand: kleinste id. */
export function findSearchableSpot(state: GameState, p: Player): Spot | null {
  let best: Spot | null = null;
  let bestDist = Infinity;
  for (const spot of state.spots) {
    if (totalBottles(spot.contents) === 0) continue;
    const d = distance(p, spot);
    if (d <= CONFIG.interactRadius && d < bestDist) {
      best = spot;
      bestDist = d;
    }
  }
  return best;
}

export function cancelSearch(p: Player): void {
  p.mode = 'walking';
  p.searchSpotId = null;
  p.searchProgressMs = 0;
}

/**
 * Führt einen Suchschritt aus. Gibt true zurück, wenn der Spieler gerade sucht
 * (oder die Suche in diesem Schritt abgeschlossen hat), sonst false.
 */
export function updateSearch(state: GameState, p: Player, dtMs: number): boolean {
  if (totalBottles(p.bottles) >= capacityOf(p)) return false;
  const spot = findSearchableSpot(state, p);
  if (!spot) return false;

  if (p.searchSpotId !== spot.id) {
    p.searchSpotId = spot.id;
    p.searchProgressMs = 0;
  }
  p.mode = 'searching';
  p.searchProgressMs += dtMs;

  if (p.searchProgressMs >= CONFIG.searchMs) {
    transferBottles(spot.contents, p.bottles, capacityOf(p));
    if (totalBottles(spot.contents) === 0) spot.refillInMs = CONFIG.refillMs;
    cancelSearch(p);
  }
  return true;
}

/** Zählt den Nachfüll-Timer eines leeren Spots herunter und füllt ihn neu. */
export function refillSpot(state: GameState, spot: Spot, dtMs: number): void {
  if (totalBottles(spot.contents) > 0) return;
  spot.refillInMs -= dtMs;
  if (spot.refillInMs <= 0) {
    spot.contents = rollContents(state, spot.type);
    spot.refillInMs = 0;
  }
}
```

- [ ] **Step 4: `step.ts` anpassen**

In `packages/core/src/step.ts` die Imports und die zwei Funktionen ersetzen. Importe oben:
```ts
import { CONFIG } from './config';
import { walk } from './movement';
import { cancelSearch, refillSpot, updateSearch } from './search';
import { NO_INPUT } from './types';
import type { GameState, Input, Player } from './types';
```

In `step` nach der Spieler-Schleife und vor dem Timer einfügen:
```ts
  for (const spot of state.spots) refillSpot(state, spot, dt);
```

`updatePlayer` komplett ersetzen durch:
```ts
function updatePlayer(state: GameState, p: Player, input: Input, dt: number): void {
  p.actionHeld = input.action;

  if (input.moveX !== 0 || input.moveY !== 0) {
    cancelSearch(p);
    walk(state.map, p, input, dt);
    return;
  }
  if (input.action && updateSearch(state, p, dt)) return;
  cancelSearch(p);
}
```

`packages/core/src/index.ts` ergänzen:
```ts
export * from './economy';
export * from './search';
```

- [ ] **Step 5: Tests und Typecheck laufen lassen**

Run: `npm test -w @pfand/core && npm run typecheck -w @pfand/core`
Expected: PASS (alle bisherigen Tests inklusive `search.test.ts`).

- [ ] **Step 6: Commit**

```bash
git add packages/core
git commit -m "feat(core): add searching and spot refill

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Abgeben, Upgrade kaufen, Rangliste

**Files:**
- Modify: `packages/core/src/economy.ts`, `packages/core/src/step.ts`, `packages/core/src/index.ts`
- Create: `packages/core/src/ranking.ts`
- Test: `packages/core/test/economy.test.ts`, `packages/core/test/ranking.test.ts`

**Interfaces:**
- Consumes: Task 5 Funktionen, `bottlesValue`, `emptyBottles`.
- Produces: `deposit(p)`, `nextUpgrade(p): { name: string; price: number; capacity: number } | null`, `tryUpgrade(state, p): boolean`, `ranking(state): { id: string; money: number }[]`.

Regeln: Abgeben passiert beim Drücken (Flanke) der Aktionstaste nahe am Pfandautomaten, nicht beim Halten. Upgrade-Kauf verlangt Nähe zum Shop, Geld und eine nächste Stufe.

- [ ] **Step 1: Failing Tests schreiben**

`packages/core/test/economy.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { totalBottles } from '../src/bottles';
import { CONFIG } from '../src/config';
import { capacityOf, nextUpgrade } from '../src/economy';
import { input, newGame, SEARCH_ROWS, setSpot, teleport, runFor, runSteps } from './helpers';

const PRESS = { p1: input({ action: true }) };
const RELEASE = { p1: input({}) };
const BUY = { p1: input({ buy: 'upgrade' }) };

function atDropoff() {
  const s = newGame(SEARCH_ROWS);
  teleport(s, 'p1', s.map.dropoffs[0]);
  return s;
}

function atShop() {
  const s = newGame(SEARCH_ROWS);
  teleport(s, 'p1', s.map.shops[0]);
  return s;
}

describe('deposit', () => {
  it('turns all bottles into money when the key is pressed at the dropoff', () => {
    const s = atDropoff();
    s.players.p1.bottles = { plastic: 2, glass: 1, crate: 0 };
    runSteps(s, PRESS, 1);
    expect(s.players.p1.money).toBe(2 * CONFIG.bottleValue.plastic + CONFIG.bottleValue.glass);
    expect(totalBottles(s.players.p1.bottles)).toBe(0);
  });

  it('deposits only once while the key stays held', () => {
    const s = atDropoff();
    s.players.p1.bottles = { plastic: 1, glass: 0, crate: 0 };
    runSteps(s, PRESS, 1);
    const money = s.players.p1.money;
    s.players.p1.bottles = { plastic: 2, glass: 0, crate: 0 };
    runSteps(s, PRESS, 10);
    expect(s.players.p1.money).toBe(money);
    expect(s.players.p1.bottles.plastic).toBe(2);
  });

  it('deposits again after releasing and pressing again', () => {
    const s = atDropoff();
    s.players.p1.bottles = { plastic: 1, glass: 0, crate: 0 };
    runSteps(s, PRESS, 1);
    s.players.p1.bottles = { plastic: 1, glass: 0, crate: 0 };
    runSteps(s, RELEASE, 1);
    runSteps(s, PRESS, 1);
    expect(s.players.p1.money).toBe(2 * CONFIG.bottleValue.plastic);
  });

  it('does nothing with an empty container', () => {
    const s = atDropoff();
    runSteps(s, PRESS, 1);
    expect(s.players.p1.money).toBe(0);
  });

  it('does nothing away from the dropoff', () => {
    const s = newGame(SEARCH_ROWS); // Spawn ist 48 px vom Automaten entfernt
    setSpot(s, 0, {});
    s.spots[0].refillInMs = 99999;
    s.players.p1.bottles = { plastic: 2, glass: 0, crate: 0 };
    runSteps(s, PRESS, 1);
    expect(s.players.p1.money).toBe(0);
    expect(s.players.p1.bottles.plastic).toBe(2);
  });

  it('a full trip works: search, walk to the dropoff, deposit', () => {
    const s = newGame(SEARCH_ROWS);
    setSpot(s, 0, { plastic: 2, glass: 1 });
    runFor(s, PRESS, CONFIG.searchMs + 100);
    expect(totalBottles(s.players.p1.bottles)).toBe(3);
    teleport(s, 'p1', s.map.dropoffs[0]);
    runSteps(s, RELEASE, 1);
    runSteps(s, PRESS, 1);
    expect(s.players.p1.money).toBe(2 * CONFIG.bottleValue.plastic + CONFIG.bottleValue.glass);
  });
});

describe('container upgrade', () => {
  it('buys the next container at the shop', () => {
    const s = atShop();
    s.players.p1.money = CONFIG.upgradePrices[0];
    runSteps(s, BUY, 1);
    expect(s.players.p1.containerLevel).toBe(1);
    expect(s.players.p1.money).toBe(0);
    expect(capacityOf(s.players.p1)).toBe(CONFIG.containers[1].capacity);
  });

  it('refuses when money is short by one cent', () => {
    const s = atShop();
    s.players.p1.money = CONFIG.upgradePrices[0] - 1;
    runSteps(s, BUY, 1);
    expect(s.players.p1.containerLevel).toBe(0);
    expect(s.players.p1.money).toBe(CONFIG.upgradePrices[0] - 1);
  });

  it('refuses at the last level', () => {
    const s = atShop();
    s.players.p1.containerLevel = CONFIG.containers.length - 1;
    s.players.p1.money = 1_000_000;
    runSteps(s, BUY, 1);
    expect(s.players.p1.containerLevel).toBe(CONFIG.containers.length - 1);
    expect(s.players.p1.money).toBe(1_000_000);
  });

  it('refuses away from the shop', () => {
    const s = newGame(SEARCH_ROWS);
    s.players.p1.money = 1_000_000;
    runSteps(s, BUY, 1);
    expect(s.players.p1.containerLevel).toBe(0);
    expect(s.players.p1.money).toBe(1_000_000);
  });

  it('describes the next upgrade or null at the last level', () => {
    const s = newGame(SEARCH_ROWS);
    expect(nextUpgrade(s.players.p1)).toEqual({
      name: CONFIG.containers[1].name,
      price: CONFIG.upgradePrices[0],
      capacity: CONFIG.containers[1].capacity,
    });
    s.players.p1.containerLevel = CONFIG.containers.length - 1;
    expect(nextUpgrade(s.players.p1)).toBeNull();
  });
});
```

`packages/core/test/ranking.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { ranking } from '../src/ranking';
import { newGame, SEARCH_ROWS } from './helpers';

describe('ranking', () => {
  it('sorts by money descending and breaks ties by id', () => {
    const s = newGame(SEARCH_ROWS, ['p3', 'p1', 'p2']);
    s.players.p1.money = 5;
    s.players.p2.money = 9;
    s.players.p3.money = 5;
    expect(ranking(s)).toEqual([
      { id: 'p2', money: 9 },
      { id: 'p1', money: 5 },
      { id: 'p3', money: 5 },
    ]);
  });
});
```

- [ ] **Step 2: Tests laufen lassen, Fehlschlag prüfen**

Run: `npm test -w @pfand/core -- test/economy.test.ts test/ranking.test.ts`
Expected: FAIL, "nextUpgrade is not a function" bzw. fehlendes Modul `../src/ranking`.

- [ ] **Step 3: `economy.ts` erweitern**

Oben in `packages/core/src/economy.ts` die Imports ersetzen durch:
```ts
import { bottlesValue, emptyBottles } from './bottles';
import { CONFIG } from './config';
import type { GameState, Player, Point } from './types';
```

Am Dateiende anhängen:
```ts
/** Gibt alle Flaschen ab und schreibt den Wert gut. Der Aufrufer prüft die Nähe. */
export function deposit(p: Player): void {
  p.money += bottlesValue(p.bottles);
  p.bottles = emptyBottles();
}

export function nextUpgrade(
  p: Player,
): { name: string; price: number; capacity: number } | null {
  const next = CONFIG.containers[p.containerLevel + 1];
  if (!next) return null;
  return { name: next.name, price: CONFIG.upgradePrices[p.containerLevel], capacity: next.capacity };
}

/** Kauft die nächste Container-Stufe, wenn Shop in Reichweite, Stufe frei und Geld reicht. */
export function tryUpgrade(state: GameState, p: Player): boolean {
  if (!isNear(state.map.shops, p)) return false;
  const up = nextUpgrade(p);
  if (!up || p.money < up.price) return false;
  p.money -= up.price;
  p.containerLevel++;
  return true;
}
```

- [ ] **Step 4: `ranking.ts` schreiben**

`packages/core/src/ranking.ts`:
```ts
import type { GameState } from './types';

export interface RankEntry {
  id: string;
  money: number;
}

/** Meiste Geld zuerst, bei Gleichstand nach id. Flaschen im Container zählen nicht. */
export function ranking(state: GameState): RankEntry[] {
  return Object.values(state.players)
    .map((p) => ({ id: p.id, money: p.money }))
    .sort((a, b) => b.money - a.money || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
```

- [ ] **Step 5: `step.ts` auf die Endfassung bringen**

Imports in `packages/core/src/step.ts` ersetzen durch:
```ts
import { CONFIG } from './config';
import { deposit, isNear, tryUpgrade } from './economy';
import { walk } from './movement';
import { cancelSearch, refillSpot, updateSearch } from './search';
import { NO_INPUT } from './types';
import type { GameState, Input, Player } from './types';
```

`updatePlayer` komplett ersetzen durch:
```ts
function updatePlayer(state: GameState, p: Player, input: Input, dt: number): void {
  const pressed = input.action && !p.actionHeld;
  p.actionHeld = input.action;

  if (input.buy === 'upgrade') tryUpgrade(state, p);

  let deposited = false;
  if (pressed && isNear(state.map.dropoffs, p)) {
    deposit(p);
    deposited = true;
  }

  if (input.moveX !== 0 || input.moveY !== 0) {
    cancelSearch(p);
    walk(state.map, p, input, dt);
    return;
  }
  if (input.action && !deposited && updateSearch(state, p, dt)) return;
  cancelSearch(p);
}
```

`packages/core/src/index.ts` ergänzen:
```ts
export * from './ranking';
```

- [ ] **Step 6: Tests und Typecheck laufen lassen**

Run: `npm test -w @pfand/core && npm run typecheck -w @pfand/core`
Expected: PASS, alle Core-Tests.

- [ ] **Step 7: Commit**

```bash
git add packages/core
git commit -m "feat(core): add deposit, container upgrade and ranking

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Determinismus-Test

**Files:**
- Test: `packages/core/test/determinism.test.ts`

**Interfaces:**
- Consumes: `createGame`, `step`, `CITY_MAP`, `Input`.

Dieser Test sichert die Grundlage für Online-Betrieb: gleicher Seed plus gleiche Eingaben ergeben exakt denselben Endzustand. Er braucht keine neue Implementierung, nur den Beweis.

- [ ] **Step 1: Test schreiben**

`packages/core/test/determinism.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { createGame } from '../src/game';
import { CITY_MAP } from '../src/maps/city';
import { step } from '../src/step';
import { NO_INPUT } from '../src/types';
import type { GameState, Input } from '../src/types';

function scripted(tick: number, shift: number): Input {
  const dirs = [-1, 0, 1] as const;
  return {
    moveX: dirs[(tick + shift) % 3],
    moveY: dirs[(Math.floor(tick / 5) + shift) % 3],
    action: (tick + shift) % 7 < 4,
    buy: tick % 400 === 0 ? 'upgrade' : null,
  };
}

function play(seed: number): GameState {
  const s = createGame(seed, CITY_MAP, ['a', 'b']);
  for (let t = 0; t < 3000; t++) {
    step(s, { a: scripted(t, 0), b: t % 2 === 0 ? scripted(t, 1) : NO_INPUT }, 16);
  }
  return s;
}

describe('determinism', () => {
  it('replays to the identical state for the same seed and inputs', () => {
    const first = play(42);
    const second = play(42);
    expect(first.tick).toBe(3000);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('diverges for a different seed', () => {
    expect(JSON.stringify(play(43).spots)).not.toBe(JSON.stringify(play(42).spots));
  });
});
```

- [ ] **Step 2: Test laufen lassen**

Run: `npm test -w @pfand/core -- test/determinism.test.ts`
Expected: PASS. Schlägt der erste Test fehl, steckt irgendwo `Math.random`, `Date` oder eine Objektreihenfolge-Abhängigkeit im Core. Ursache beheben, nicht den Test lockern.

- [ ] **Step 3: Commit**

```bash
git add packages/core/test/determinism.test.ts
git commit -m "test(core): pin determinism of step for same seed and inputs

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Client-Paket, Eingabe, Format, LocalConnection

**Files:**
- Create: `packages/client/package.json`, `packages/client/tsconfig.json`, `packages/client/src/format.ts`, `packages/client/src/input.ts`, `packages/client/src/connection.ts`
- Test: `packages/client/test/format.test.ts`, `packages/client/test/input.test.ts`, `packages/client/test/connection.test.ts`

**Interfaces:**
- Consumes: `@pfand/core` (`Input`, `NO_INPUT`, `GameState`, `step`, `createGame`, `parseMap`).
- Produces: `formatMoney(cents)`, `formatTime(ms)`, `KeyState`, `buildInput(keys)`, `GameConnection`, `LocalConnection`, `LOCAL_STEP_MS`.

- [ ] **Step 1: Paketdateien anlegen**

`packages/client/package.json`:
```json
{
  "name": "@pfand/client",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@pfand/core": "*",
    "phaser": "^3.90.0"
  }
}
```

`packages/client/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "types": ["vite/client"] },
  "include": ["src", "test", "vite.config.ts"]
}
```

Run: `npm install`
Expected: installiert Phaser, verlinkt `@pfand/core` als Workspace, keine Fehler.

- [ ] **Step 2: Failing Tests schreiben**

`packages/client/test/format.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { formatMoney, formatTime } from '../src/format';

describe('formatMoney', () => {
  it('formats cents with comma and euro sign', () => {
    expect(formatMoney(0)).toBe('0,00 €');
    expect(formatMoney(8)).toBe('0,08 €');
    expect(formatMoney(150)).toBe('1,50 €');
    expect(formatMoney(12345)).toBe('123,45 €');
  });
});

describe('formatTime', () => {
  it('formats milliseconds as m:ss rounding up', () => {
    expect(formatTime(600000)).toBe('10:00');
    expect(formatTime(59001)).toBe('1:00');
    expect(formatTime(5000)).toBe('0:05');
    expect(formatTime(0)).toBe('0:00');
  });
});
```

`packages/client/test/input.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { buildInput } from '../src/input';

const NONE = { left: false, right: false, up: false, down: false, action: false, buy: false };

describe('buildInput', () => {
  it('maps directions to axes', () => {
    expect(buildInput({ ...NONE, left: true })).toMatchObject({ moveX: -1, moveY: 0 });
    expect(buildInput({ ...NONE, right: true, down: true })).toMatchObject({ moveX: 1, moveY: 1 });
    expect(buildInput({ ...NONE, up: true })).toMatchObject({ moveX: 0, moveY: -1 });
  });

  it('cancels opposite keys', () => {
    expect(buildInput({ ...NONE, left: true, right: true })).toMatchObject({ moveX: 0 });
    expect(buildInput({ ...NONE, up: true, down: true })).toMatchObject({ moveY: 0 });
  });

  it('passes action and buy through', () => {
    expect(buildInput({ ...NONE, action: true })).toMatchObject({ action: true, buy: null });
    expect(buildInput({ ...NONE, buy: true })).toMatchObject({ action: false, buy: 'upgrade' });
  });
});
```

`packages/client/test/connection.test.ts`:
```ts
import { createGame, NO_INPUT, parseMap } from '@pfand/core';
import { describe, expect, it } from 'vitest';
import { LOCAL_STEP_MS, LocalConnection } from '../src/connection';

// Spawn (24,24) steht 16 px neben dem Shop (40,24)
function shopGame() {
  const state = createGame(1, parseMap(['#####', '#@S.#', '#####']), ['p1']);
  state.players.p1.money = 1000;
  return state;
}

const BUY = { ...NO_INPUT, buy: 'upgrade' as const };

describe('LocalConnection', () => {
  it('runs fixed steps from the frame delta and keeps the remainder', () => {
    const conn = new LocalConnection(shopGame(), ['p1']);
    conn.update(LOCAL_STEP_MS * 10);
    expect(conn.getState().tick).toBe(10);
    conn.update(LOCAL_STEP_MS / 2);
    expect(conn.getState().tick).toBe(10);
    conn.update(LOCAL_STEP_MS / 2);
    expect(conn.getState().tick).toBe(11);
  });

  it('applies a buy command exactly once even if several steps run in one frame', () => {
    const conn = new LocalConnection(shopGame(), ['p1']);
    conn.setInput('p1', BUY);
    conn.update(LOCAL_STEP_MS * 3);
    expect(conn.getState().players.p1.containerLevel).toBe(1);
    expect(conn.getState().players.p1.money).toBe(1000 - 150);
  });

  it('keeps a buy command until a step actually runs', () => {
    const conn = new LocalConnection(shopGame(), ['p1']);
    conn.setInput('p1', BUY);
    conn.update(LOCAL_STEP_MS / 2); // zu kurz für einen Schritt
    conn.setInput('p1', NO_INPUT); // nächster Frame meldet "nicht gedrückt"
    conn.update(LOCAL_STEP_MS / 2);
    expect(conn.getState().players.p1.containerLevel).toBe(1);
  });

  it('caps a huge frame delta instead of simulating minutes at once', () => {
    const conn = new LocalConnection(shopGame(), ['p1']);
    conn.update(60_000);
    expect(conn.getState().tick).toBeLessThanOrEqual(16);
  });
});
```

- [ ] **Step 3: Tests laufen lassen, Fehlschlag prüfen**

Run: `npm test -w @pfand/client`
Expected: FAIL, "Failed to resolve import ../src/format" usw.

- [ ] **Step 4: Implementieren**

`packages/client/src/format.ts`:
```ts
/** Cent als "1,50 €" */
export function formatMoney(cents: number): string {
  const euros = Math.floor(cents / 100);
  const rest = cents % 100;
  return `${euros},${String(rest).padStart(2, '0')} €`;
}

/** Millisekunden als "m:ss", aufgerundet auf volle Sekunden */
export function formatTime(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
```

`packages/client/src/input.ts`:
```ts
import type { Input } from '@pfand/core';

export interface KeyState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  action: boolean;
  /** true nur im Frame, in dem die Kauftaste neu gedrückt wurde */
  buy: boolean;
}

function axis(negative: boolean, positive: boolean): -1 | 0 | 1 {
  return ((positive ? 1 : 0) - (negative ? 1 : 0)) as -1 | 0 | 1;
}

export function buildInput(k: KeyState): Input {
  return {
    moveX: axis(k.left, k.right),
    moveY: axis(k.up, k.down),
    action: k.action,
    buy: k.buy ? 'upgrade' : null,
  };
}
```

`packages/client/src/connection.ts`:
```ts
import { step } from '@pfand/core';
import type { GameState, Input } from '@pfand/core';

/** Fester Simulationsschritt im lokalen Modus */
export const LOCAL_STEP_MS = 16;
/** Größter Zeitsprung, den ein Frame nachholt (Tab im Hintergrund, Lag) */
const MAX_FRAME_MS = 250;

/** Schnittstelle zwischen Darstellung und Spielkern. Online kommt in Phase 4 dazu. */
export interface GameConnection {
  readonly localPlayerIds: string[];
  setInput(playerId: string, input: Input): void;
  update(deltaMs: number): void;
  getState(): GameState;
}

export class LocalConnection implements GameConnection {
  private inputs: Record<string, Input> = {};
  private accumulator = 0;

  constructor(
    private readonly state: GameState,
    readonly localPlayerIds: string[],
  ) {}

  setInput(playerId: string, input: Input): void {
    // Ein noch nicht verarbeiteter Kaufbefehl geht nicht durch einen Frame ohne Schritt verloren.
    const pendingBuy = this.inputs[playerId]?.buy ?? null;
    this.inputs[playerId] = { ...input, buy: input.buy ?? pendingBuy };
  }

  update(deltaMs: number): void {
    this.accumulator += Math.min(deltaMs, MAX_FRAME_MS);
    while (this.accumulator >= LOCAL_STEP_MS) {
      step(this.state, this.inputs, LOCAL_STEP_MS);
      this.accumulator -= LOCAL_STEP_MS;
      // Einmalige Befehle sind verbraucht
      for (const id of Object.keys(this.inputs)) {
        this.inputs[id] = { ...this.inputs[id], buy: null };
      }
    }
  }

  getState(): GameState {
    return this.state;
  }
}
```

- [ ] **Step 5: Tests und Typecheck laufen lassen**

Run: `npm test && npm run typecheck`
Expected: PASS in beiden Paketen, Typecheck sauber.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json packages/client
git commit -m "feat(client): add input mapping, formatters and LocalConnection

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Phaser-Szene, Seite, Handtest

**Files:**
- Create: `packages/client/vite.config.ts`, `packages/client/index.html`, `packages/client/src/main.ts`, `packages/client/src/scenes/GameScene.ts`, `README.md`

**Interfaces:**
- Consumes: alles aus `@pfand/core` und Task 8.
- Produces: lauffähige Seite. Optionaler URL-Parameter `?round=<Sekunden>` setzt die Rundenlänge (zum schnellen Testen des Rundenendes) und `?seed=<Zahl>` den Seed.

Für diesen Task gibt es keine Unit-Tests (reines Rendering). Die Prüfung ist der Handtest am Ende.

- [ ] **Step 1: Vite-Konfiguration und HTML**

`packages/client/vite.config.ts`:
```ts
import { defineConfig } from 'vite';

export default defineConfig({
  // relative Pfade, damit der Build später unter einem GitHub-Pages-Unterpfad läuft
  base: './',
});
```

`packages/client/index.html`:
```html
<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Pfandsammler</title>
    <style>
      html, body { margin: 0; height: 100%; background: #111; overflow: hidden; }
      #game { width: 100%; height: 100%; }
      canvas { image-rendering: pixelated; }
    </style>
  </head>
  <body>
    <div id="game"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: `main.ts`**

`packages/client/src/main.ts`:
```ts
import Phaser from 'phaser';
import { GameScene } from './scenes/GameScene';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 320,
  height: 180,
  backgroundColor: '#111111',
  pixelArt: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [GameScene],
});
```

- [ ] **Step 3: `GameScene.ts`**

`packages/client/src/scenes/GameScene.ts`:
```ts
import Phaser from 'phaser';
import {
  bottlesValue,
  capacityOf,
  CITY_MAP,
  CONFIG,
  containerOf,
  createGame,
  findSearchableSpot,
  isNear,
  nextUpgrade,
  ranking,
  TILE,
  totalBottles,
} from '@pfand/core';
import type { GameState, MapData, Player } from '@pfand/core';
import { LocalConnection } from '../connection';
import { formatMoney, formatTime } from '../format';
import { buildInput } from '../input';

const PLAYER_ID = 'p1';
const FONT = { fontFamily: 'monospace', fontSize: '8px', color: '#ffffff' };
const COLOR = {
  wall: 0x37474f,
  floor: 0x9e9e9e,
  spotFull: 0x66bb6a,
  spotEmpty: 0x616161,
  dropoff: 0x42a5f5,
  shop: 0xffca28,
  player: 0xef5350,
};
const BAR_WIDTH = 40;

export class GameScene extends Phaser.Scene {
  private conn!: LocalConnection;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private playerRect!: Phaser.GameObjects.Rectangle;
  private spotRects: Phaser.GameObjects.Rectangle[] = [];
  private hud!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private barBg!: Phaser.GameObjects.Rectangle;
  private bar!: Phaser.GameObjects.Rectangle;
  private banner!: Phaser.GameObjects.Text;

  constructor() {
    super('game');
  }

  create(): void {
    const params = new URLSearchParams(window.location.search);
    const seed = params.has('seed')
      ? Number(params.get('seed'))
      : (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
    const roundSec = Number(params.get('round'));
    const state = createGame(seed, CITY_MAP, [PLAYER_ID], {
      roundMs: roundSec > 0 ? roundSec * 1000 : undefined,
    });
    this.conn = new LocalConnection(state, [PLAYER_ID]);

    this.spotRects = [];
    this.drawMap(state.map);
    for (const spot of state.spots) {
      this.spotRects.push(this.add.rectangle(spot.x, spot.y, 10, 10, COLOR.spotFull));
    }
    const me = state.players[PLAYER_ID];
    this.playerRect = this.add.rectangle(me.x, me.y, CONFIG.playerHalf * 2, CONFIG.playerHalf * 2, COLOR.player);
    this.playerRect.setDepth(5);

    this.cameras.main.setBounds(0, 0, state.map.cols * TILE, state.map.rows * TILE);
    this.cameras.main.startFollow(this.playerRect, true, 0.15, 0.15);

    this.hud = this.add.text(4, 4, '', FONT).setScrollFactor(0).setDepth(10);
    this.hint = this.add.text(4, 176, '', FONT).setOrigin(0, 1).setScrollFactor(0).setDepth(10);
    this.barBg = this.add.rectangle(140, 156, BAR_WIDTH, 4, 0x000000).setOrigin(0, 0).setScrollFactor(0).setDepth(10);
    this.bar = this.add.rectangle(140, 156, 0, 4, 0xffee58).setOrigin(0, 0).setScrollFactor(0).setDepth(11);
    this.banner = this.add
      .text(160, 90, '', { ...FONT, fontSize: '10px', align: 'center', backgroundColor: '#000000cc' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(20);

    this.keys = this.input.keyboard!.addKeys(
      'W,A,S,D,UP,DOWN,LEFT,RIGHT,E,SPACE,ONE,R',
    ) as Record<string, Phaser.Input.Keyboard.Key>;
  }

  update(_time: number, delta: number): void {
    const k = this.keys;
    this.conn.setInput(
      PLAYER_ID,
      buildInput({
        left: k.A.isDown || k.LEFT.isDown,
        right: k.D.isDown || k.RIGHT.isDown,
        up: k.W.isDown || k.UP.isDown,
        down: k.S.isDown || k.DOWN.isDown,
        action: k.E.isDown || k.SPACE.isDown,
        buy: Phaser.Input.Keyboard.JustDown(k.ONE),
      }),
    );
    this.conn.update(delta);

    const state = this.conn.getState();
    if (state.phase === 'ended' && Phaser.Input.Keyboard.JustDown(k.R)) {
      this.scene.restart();
      return;
    }
    this.render(state, state.players[PLAYER_ID]);
  }

  private drawMap(map: MapData): void {
    const g = this.add.graphics();
    for (let r = 0; r < map.rows; r++) {
      for (let c = 0; c < map.cols; c++) {
        g.fillStyle(map.solid[r * map.cols + c] ? COLOR.wall : COLOR.floor, 1);
        g.fillRect(c * TILE, r * TILE, TILE, TILE);
      }
    }
    for (const d of map.dropoffs) this.marker(d.x, d.y, COLOR.dropoff, 'PFAND');
    for (const s of map.shops) this.marker(s.x, s.y, COLOR.shop, 'SHOP');
  }

  private marker(x: number, y: number, color: number, label: string): void {
    this.add.rectangle(x, y, TILE, TILE, color);
    this.add.text(x, y - TILE / 2, label, FONT).setOrigin(0.5, 1);
  }

  private render(state: GameState, p: Player): void {
    this.playerRect.setPosition(p.x, p.y);
    state.spots.forEach((spot, i) => {
      this.spotRects[i].setFillStyle(totalBottles(spot.contents) > 0 ? COLOR.spotFull : COLOR.spotEmpty);
    });

    this.hud.setText(
      `Zeit ${formatTime(state.timeLeftMs)}   Geld ${formatMoney(p.money)}\n` +
        `${containerOf(p).name} ${totalBottles(p.bottles)}/${capacityOf(p)}` +
        `   Pl${p.bottles.plastic} Gl${p.bottles.glass} Ka${p.bottles.crate}`,
    );
    this.hint.setText(this.hintFor(state, p));

    const progress = p.mode === 'searching' ? p.searchProgressMs / CONFIG.searchMs : 0;
    this.barBg.setVisible(progress > 0);
    this.bar.setVisible(progress > 0);
    this.bar.setSize(BAR_WIDTH * progress, 4);

    if (state.phase === 'ended') {
      const best = ranking(state)[0];
      this.banner.setText(`Runde vorbei!\nGeld: ${formatMoney(best.money)}\n\n[R] Neue Runde`);
    } else {
      this.banner.setText('');
    }
    this.banner.setVisible(state.phase === 'ended');
  }

  private hintFor(state: GameState, p: Player): string {
    if (state.phase === 'ended') return '';
    if (isNear(state.map.shops, p)) {
      const up = nextUpgrade(p);
      return up ? `[1] ${up.name} (${up.capacity} Plätze) ${formatMoney(up.price)}` : 'Voll ausgebaut';
    }
    if (isNear(state.map.dropoffs, p)) {
      return totalBottles(p.bottles) > 0
        ? `[E] Pfand abgeben ${formatMoney(bottlesValue(p.bottles))}`
        : 'Pfandautomat: nichts zum Abgeben';
    }
    if (findSearchableSpot(state, p)) {
      return totalBottles(p.bottles) >= capacityOf(p) ? 'Container voll' : '[E halten] Suchen';
    }
    return '';
  }
}
```

- [ ] **Step 4: README**

`README.md`:
```markdown
# Pfandsammler

Retro-Top-Down-Spiel: Pfandflaschen sammeln, abgeben, Container ausbauen. Design: `docs/superpowers/specs/`, Pläne: `docs/superpowers/plans/`.

## Entwickeln

    npm install
    npm run dev        # Spiel im Browser (Vite)
    npm test           # Tests aller Pakete
    npm run typecheck

Steuerung: WASD/Pfeile laufen, E oder Leertaste suchen (halten) und abgeben (drücken), 1 kauft das nächste Container-Upgrade am Shop, R startet nach Rundenende neu.

Testhilfen per URL: `?round=30` (Runde in Sekunden), `?seed=123` (feste Zufallsbefüllung).
```

- [ ] **Step 5: Typecheck und Build**

Run: `npm run typecheck && npm run build`
Expected: Typecheck sauber, Build erzeugt `packages/client/dist` ohne Fehler (Warnung über große Chunk-Größe von Phaser ist normal).

- [ ] **Step 6: Handtest im Browser**

Run: `npm run dev` (läuft im Hintergrund), öffne die ausgegebene URL, z. B. `http://localhost:5173/?seed=1&round=40`.

Prüfe der Reihe nach und notiere jedes Ergebnis:
1. Karte sichtbar, roter Spieler, Kamera scrollt beim Laufen (WASD und Pfeile). Spieler läuft nicht durch graue Wände.
2. Diagonal laufen fühlt sich nicht schneller an.
3. Zu einem grünen Spot laufen: unten steht "[E halten] Suchen". E halten: gelber Balken füllt sich in ca. 3 s, danach steigt die Flaschenanzahl im HUD und der Spot wird grau. Beim Loslassen oder Loslaufen vorher setzt sich der Balken zurück.
4. Mit vollen Händen (3/3) zeigt ein Spot "Container voll", keine Suche.
5. Zum blauen PFAND laufen, E einmal drücken: Flaschen weg, Geld steigt. E gedrückt halten gibt nicht erneut ab.
6. Genug Geld sammeln (1,50 €), zum gelben SHOP laufen, 1 drücken: Container wird "Tasche 0/8", Geld sinkt. Zweimal schnell 1 drücken kauft nicht doppelt ohne genug Geld.
7. Nach 40 s erscheint "Runde vorbei!" mit Geld; Bewegung ist eingefroren; R startet eine neue Runde mit Geld 0.
8. Graue Spots werden nach etwa 45 s wieder grün.

Erwartet: alle acht Punkte erfüllt. Weicht etwas ab, Ursache im Code suchen und beheben (kein Raten), dann Punkt wiederholen.

- [ ] **Step 7: Commit**

```bash
git add README.md packages/client
git commit -m "feat(client): add Phaser scene, page and README for single-player phase 1

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Ende von Phase 1: Abnahme

- [ ] `npm test` grün in beiden Paketen, `npm run typecheck` sauber, Handtest Punkte 1–8 erfüllt.
- [ ] Balancing-Eindruck notieren (zu schnell reich? Upgrades zu teuer? Suche zu lang?). Änderungen nur in `packages/core/src/config.ts`.
- [ ] Danach Plan für Phase 2 (Diebstahl und Splitscreen) schreiben.

## Self-Review (Spec-Abdeckung)

- Spec §4 Spieler/Container/Flaschen/Suchen/Spots/Shop/Abgabe: Tasks 1–6. Diebstahl, Special Item, Health, Events, Essen: bewusst Phase 2/3 (Spec §6).
- Spec §3 Aufbau `core`/`client`, `GameConnection`, `LocalConnection`: Tasks 1–9. `OnlineConnection`, `server`: Phase 4.
- Spec §1 Zeitlimit 10 min, meistes Geld gewinnt: Task 4 (Timer), Task 6 (`ranking`), Task 9 (Anzeige).
- Spec §8 Tests: Core-Unit-Tests und Determinismus-Test in Tasks 1–7. Client nur Hilfslogik (Task 8), Rendering per Handtest (Task 9).
- Abweichung von Spec §3 (Tiled) und Verschiebung von Essen sind in Spec §10 festgehalten.
- Typkonsistenz geprüft: `Input`, `NO_INPUT`, `GameState`, `Player`, `Spot`, `createGame(seed, map, ids, options?)`, `step(state, inputs, dtMs)`, `isNear`, `nextUpgrade`, `findSearchableSpot` haben in allen Tasks dieselben Signaturen.
