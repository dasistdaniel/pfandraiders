# PfandRaiders Phase 3 (Health, Hunger, Essen, Hunde, Polizei, Event-Zonen) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das Spiel bekommt Leben (Health) mit Hunger und Essen im Shop, Bewusstlosigkeit mit Verlust und Respawn, zufällige Hunde- und Polizei-Events und zeitlich begrenzte Event-Zonen (Stadion, Konzert) mit mehr Pfand.

**Architecture:** Alles Neue ist deterministische Logik in `core` (`health.ts`, `npc.ts`, `zones.ts`), eingehängt in `step`. NPCs (Hunde, Polizisten) und Zonen sind Teil des `GameState`. Die Karte bekommt NPC-Eingänge (`N`) und Zonenrechtecke. Der Client zeigt nur an: Leben im HUD, Warnungen, NPC-Figuren, Zonenmarkierungen, zwei neue Kauftasten (Leckerli, Essen).

**Tech Stack:** wie Phase 2.

**Spec:** `docs/superpowers/specs/2026-10-02-pfandraiders-design.md` §4 (Health, Zufallsevents, Event-Zonen), §6 Phase 3.

**Vorarbeit:** Phase 2 ist auf `master`. Arbeit auf Branch `phase-3-health-events` (bereits angelegt).

## Entscheidungen zum Plan (Spec ist dort still, bitte beim Lesen prüfen)

1. **Hunger:** 1 Leben pro 8 s (über die 10-Minuten-Runde ca. 75 Leben). Wer nicht isst, wird irgendwann bewusstlos.
2. **Essen:** im Shop, 1,00 €, heilt 30 Leben (Maximum 100). Eigene Kauftaste. Kauf auch bei vollem Leben erlaubt (verschwendet Geld, kein Sonderfall, weil der Hunger Leben fast immer unter dem Maximum hält).
3. **Bewusstlos (Leben 0):** 10 s regungslos (keine Eingabe, kein Schaden, kein Klauen-Opfer, weil der Container leer ist). Beim Umfallen gehen alle Flaschen im Container und das Item verloren, 25 % des Geldes (abgerundet) ebenfalls. Danach Respawn am eigenen Startpunkt mit 60 Leben und 3 s Schutz gegen Diebstahl.
4. **Hund:** Zufalls-Event. Er erscheint an einem NPC-Eingang, läuft mit 70 px/s (Spieler 90, Einkaufswagen 67,5, also holt er Wagenfahrer ein) auf den nächsten bewussten Spieler im Umkreis von 160 px zu, beißt bei 12 px Abstand für 15 Leben, mit 1,5 s Pause zwischen Bissen. Ein Biss unterbricht Suchen und Klauen des Opfers. Verschwindet nach 30 s. Läuft ohne Wegfindung geradeaus (bleibt an Wänden hängen).
5. **Leckerli:** zweites Special Item (gleicher Item-Slot wie der Bolzenschneider), 1,00 €. Wird automatisch eingesetzt, wenn ein Hund beißen würde: kein Schaden, der Hund bleibt 8 s stehen.
6. **Polizei:** Zufalls-Event. Ein Polizist (55 px/s, langsamer als alle Spieler) läuft auf den nächsten bewussten Spieler mit Flaschen im Container im Umkreis von 140 px zu. Steht der Spieler 2 s lang höchstens 22 px entfernt, konfisziert er 50 % der Flaschen (aufgerundet, wertvollste zuerst, sie verschwinden) und geht. Wer sich weiter als 22 px entfernt ("flieht"), setzt die Kontrolle zurück. Kein Leben-Verlust (Spec nennt Strafen und Konfiszieren als Alternativen, Phase 3 nimmt nur das Konfiszieren). Verschwindet nach 20 s.
7. **Event-Zeitplan:** erster NPC nach 15 s, danach alle 20 bis 40 s (zufällig), höchstens 3 NPCs gleichzeitig, 60 % Hund, 40 % Polizei. Fehlen NPC-Eingänge auf der Karte, gibt es keine NPCs.
8. **Event-Zonen:** Stadion und Konzert (Rechtecke auf der Karte mit je 3 Spots). Jede Zone durchläuft: Pause (60 bis 120 s zu Beginn, später 90 bis 150 s) → angekündigt (20 s, Hinweis in jedem HUD) → aktiv (60 s) → Pause. Bei Beginn der aktiven Phase werden alle Spots in der Zone sofort dreifach neu gefüllt. Solange sie aktiv ist, füllen sich dort geleerte Spots schon nach 12 s (statt 45 s) mit dreifacher Menge nach.
9. **Karte:** vier neue Spots (zwei je Zone), vier NPC-Eingänge (`N`, begehbare Bodenkachel), `parseMap` bekommt die Zonenrechtecke als zweiten Parameter. Die Stadtkarte hat danach 17 Spots.
10. **Kauftasten:** Tastatur 1: `3` Leckerli, `4` Essen. Tastatur 2: `;` Leckerli, `'` Essen. Gamepad: `RB` Leckerli, `LB` Essen.
11. **Nicht in Phase 3:** aktive Abwehr beim Klauen, Sound, Wegfindung der NPCs, Items finden statt kaufen.

## Global Constraints

- `core` darf weder Phaser noch DOM noch Netzwerk importieren, kein `Math.random` (nur `rng.ts`). Alle Spielwerte nur in `packages/core/src/config.ts`.
- Geld ganzzahlig in Cent, Anzeige nur im Client. Leben ist eine Zahl mit Nachkommastellen, der Client zeigt aufgerundet.
- Der Client enthält keine Regeln, Client-Logiktests dürfen Phaser nicht importieren.
- `step` ist deterministisch (gleicher Seed plus gleiche Eingaben ergibt gleichen Zustand), `step` verändert den Zustand direkt.
- Bewusstlose Spieler: keine Eingabe wirksam, kein Schaden, kein Ziel für Hund und Polizei.
- Commit-Nachrichten enden mit der Zeile `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Alle bestehenden Tests außer den hier ausdrücklich geänderten bleiben grün.

## Review Focus

- Bewusstlos: Flaschen, Item, 25 % Geld weg; Eingabe wirkungslos; nach 10 s Respawn am Startpunkt mit 60 Leben und Schutz; keine doppelte Bestrafung bei weiterem Schaden (Task 2).
- Hunger kann Leben nie negativ oder NaN machen, Essen nur im Shop (Task 2).
- Biss unterbricht Suchen und Klauen, Leckerli verhindert den Biss genau einmal und verbraucht sich nur dabei (Task 4).
- Polizei: Flucht setzt die Kontrolle zurück, nichts wird ohne volle 2 s konfisziert, Spieler ohne Flaschen werden ignoriert (Task 4).
- NPC-Obergrenze 3, kein Spawn ohne Eingänge, Lebensdauer läuft ab (Task 4).
- Zone: Phasenfolge, Boost nur innerhalb der Zone und nur während "aktiv", Nachfüllzeit korrekt (Task 3).
- Determinismus mit NPCs und Zonen über eine lange Runde (Task 5).
- Neue Tasten kollidieren nicht mit bestehenden und haben gültige Phaser-Namen (Task 6).

---

## File Structure

```
packages/core/src/
  types.ts     ändern: Mode 'unconscious', ItemId dog_treat, BuyCommand food, Area, ZoneDef, Npc, ZoneState, Player-/MapData-/GameState-Felder
  config.ts    ändern: items.dog_treat, health, npc, zone
  map.ts       ändern: 'N' = NPC-Eingang, parseMap(rows, zones)
  maps/city.ts ändern: 4 neue Spots, 4 N, CITY_ZONES
  game.ts      ändern: neue Startwerte, Zonen und NPC-Timer
  loot.ts      ändern: rollContents(rng, type, multiplier = 1)
  health.ts    neu: damage, knockOut, updateHealth
  economy.ts   ändern: tryEat, tryBuy('food')
  zones.ts     neu
  npc.ts       neu
  search.ts    ändern: Zonen-Hooks für Nachfüllen
  step.ts      ändern
  index.ts     ändern: Exporte
packages/core/test/
  map.test.ts city.test.ts game.test.ts economy.test.ts  ändern
  health.test.ts zones.test.ts npc.test.ts determinism-events.test.ts  neu
packages/client/src/
  input.ts sources.ts devices.ts text.ts hud.ts scenes/GameScene.ts  ändern
packages/client/test/
  input.test.ts sources.test.ts text.test.ts  ändern
README.md  ändern
```

---

### Task 1: Datenmodell, Karte, Konfiguration

**Files:**
- Modify: `packages/core/src/types.ts`, `config.ts`, `map.ts`, `maps/city.ts`, `game.ts`, `loot.ts`
- Modify (Tests): `packages/core/test/map.test.ts`, `city.test.ts`, `game.test.ts`

**Interfaces:**
- Produces: Typen `Area { x0, y0, x1, y1 }` (Pixel, x1/y1 exklusiv), `ZoneDef { id, name, area }`, `NpcKind = 'dog' | 'police'`, `Npc { id, kind, x, y, lifeMs, targetId, cooldownMs, distractedMs, checkMs }`, `ZonePhase`, `ZoneState { def, phase, timerMs }`; `Mode` um `'unconscious'`; `ItemId` um `'dog_treat'`; `BuyCommand` um `'food'`; `Player.health/unconsciousMs/spawn`; `MapData.npcSpawns/zones`; `GameState.npcs/nextNpcId/nextNpcMs/zones`; `CONFIG.health/npc/zone`, `CONFIG.items.dog_treat`; `parseMap(rows, zones = [])`; `rollContents(rng, type, multiplier = 1)`.

- [ ] **Step 1: Failing Tests schreiben**

An `packages/core/test/map.test.ts` im `describe('parseMap', ...)` zwei Tests anhängen:
```ts
  it('reads npc spawn tiles as walkable floor', () => {
    const map = parseMap(['####', '#N@#', '####']);
    expect(map.npcSpawns).toEqual([{ x: 24, y: 24 }]);
    expect(map.spawns).toEqual([{ x: 40, y: 24 }]);
    expect(map.solid[1 * 4 + 1]).toBe(false);
    expect(map.zones).toEqual([]);
  });

  it('passes zones through', () => {
    const zones = [{ id: 'z', name: 'Zone', area: { x0: 0, y0: 0, x1: 32, y1: 32 } }];
    expect(parseMap(['@'], zones).zones).toEqual(zones);
  });
```

`packages/core/test/city.test.ts`: im Test 'has the expected content' `expect(CITY_MAP.spots.length).toBe(13);` ersetzen durch `toBe(17)` und ergänzen:
```ts
    expect(CITY_MAP.npcSpawns.length).toBe(4);
    expect(CITY_MAP.zones.map((z) => z.id)).toEqual(['stadium', 'concert']);
```
Im Erreichbarkeitstest die Zielliste erweitern: `[...CITY_MAP.spots, ...CITY_MAP.dropoffs, ...CITY_MAP.shops, ...CITY_MAP.spawns, ...CITY_MAP.npcSpawns]`. Einen weiteren Test im `describe('city map', ...)` anhängen:
```ts
  it('puts at least three spots into each event zone', () => {
    for (const zone of CITY_MAP.zones) {
      const inside = CITY_MAP.spots.filter(
        (s) => s.x >= zone.area.x0 && s.x < zone.area.x1 && s.y >= zone.area.y0 && s.y < zone.area.y1,
      );
      expect(inside.length, zone.id).toBeGreaterThanOrEqual(3);
    }
  });
```

An `packages/core/test/game.test.ts` im `describe('createGame', ...)` anhängen:
```ts
  it('starts players healthy and records their spawn point', () => {
    const s = createGame(1, CITY_MAP, ['a', 'b']);
    expect(s.players.a).toMatchObject({ health: CONFIG.health.max, unconsciousMs: 0 });
    expect(s.players.a.spawn).toEqual(CITY_MAP.spawns[0]);
    expect(s.players.b.spawn).toEqual(CITY_MAP.spawns[1]);
  });

  it('starts with no npcs, a first npc timer and idle zones with their first pause', () => {
    const s = createGame(3, CITY_MAP, ['a']);
    expect(s.npcs).toEqual([]);
    expect(s.nextNpcMs).toBe(CONFIG.npc.firstSpawnMs);
    expect(s.zones.map((z) => z.def.id)).toEqual(['stadium', 'concert']);
    for (const z of s.zones) {
      expect(z.phase).toBe('idle');
      expect(z.timerMs).toBeGreaterThanOrEqual(CONFIG.zone.firstIdleMs[0]);
      expect(z.timerMs).toBeLessThanOrEqual(CONFIG.zone.firstIdleMs[1]);
    }
  });
```

An `packages/core/test/loot.test.ts` im `describe('rollContents', ...)` anhängen:
```ts
  it('multiplies the rolled counts', () => {
    const a = { rngState: 11 };
    const b = { rngState: 11 };
    const single = rollContents(a, 'park');
    const triple = rollContents(b, 'park', 3);
    expect(triple).toEqual({
      plastic: single.plastic * 3,
      glass: single.glass * 3,
      crate: single.crate * 3,
    });
  });
```
(Der Test ist gültig, solange `rollContents` bei gleichem Seed für beide Aufrufe dieselben Würfe macht. Die Mindestens-eine-Flasche-Regel hebt `plastic` nur an, wenn alles 0 ist: gilt für beide Aufrufe gleich, weil sie vor dem Multiplizieren angewendet wird. Siehe Step 5.)

Run: `npm test -w @pfandraiders/core -- test/map.test.ts test/city.test.ts test/game.test.ts test/loot.test.ts`
Expected: FAIL.

- [ ] **Step 2: Typen ändern**

In `packages/core/src/types.ts`:
- `export type Mode = 'walking' | 'searching' | 'stealing';` ersetzen durch `export type Mode = 'walking' | 'searching' | 'stealing' | 'unconscious';`
- `export type ItemId = 'bolt_cutters';` ersetzen durch `export type ItemId = 'bolt_cutters' | 'dog_treat';`
- `export type BuyCommand = 'upgrade' | ItemId;` ersetzen durch `export type BuyCommand = 'upgrade' | 'food' | ItemId;` und den Kommentar darüber durch `/** Kaufbefehl: Container-Upgrade, Essen oder ein Special Item */`.
- Nach `interface Point` einfügen:
```ts
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
```
- Im Interface `MapData` nach `spawns: Point[];` einfügen:
```ts
  /** Eingänge, an denen Hunde und Polizisten erscheinen */
  npcSpawns: Point[];
  zones: ZoneDef[];
```
- Im Interface `Player` nach `shieldMs: number;` einfügen:
```ts
  /** Leben, 0 = bewusstlos (kann zwischen Ticks Nachkommastellen haben) */
  health: number;
  /** Restzeit der Bewusstlosigkeit, 0 = bei Bewusstsein */
  unconsciousMs: number;
  /** Startpunkt, hier erscheint der Spieler nach der Bewusstlosigkeit */
  spawn: Point;
```
- Vor `export interface GameState` einfügen:
```ts
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
```
- Im Interface `GameState` nach `spots: Spot[];` einfügen:
```ts
  npcs: Npc[];
  nextNpcId: number;
  /** Zeit bis zum nächsten NPC-Spawn-Versuch */
  nextNpcMs: number;
  zones: ZoneState[];
```

- [ ] **Step 3: Config ändern**

In `packages/core/src/config.ts` im Objekt `items` die Zeile `bolt_cutters: ...` ergänzen um:
```ts
    dog_treat: { name: 'Leckerli', price: 100 },
```
Direkt nach dem `items`-Block (nach `} as Record<ItemId, { name: string; price: number }>,`) einfügen:
```ts
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
```

- [ ] **Step 4: Karte und Stadtkarte**

`packages/core/src/map.ts`: Import ändern auf `import type { MapData, Point, SpotDef, SpotType, ZoneDef } from './types';`. Signatur ersetzen durch `export function parseMap(rows: string[], zones: ZoneDef[] = []): MapData {`. Nach `const spawns: Point[] = [];` einfügen `const npcSpawns: Point[] = [];`. Nach der Zeile `else if (ch === 'S') shops.push(center);` einfügen `else if (ch === 'N') npcSpawns.push(center);`. Rückgabe ersetzen durch `return { cols, rows: rows.length, solid, spots, dropoffs, shops, spawns, npcSpawns, zones };`.

`packages/core/src/maps/city.ts` komplett ersetzen:
```ts
import { parseMap } from '../map';
import type { ZoneDef } from '../types';

/** 32 x 20 Kacheln. Legende siehe map.ts. N = Eingang für Hunde und Polizisten. */
export const CITY_ROWS: string[] = [
  '################################',
  '#.............................N#',
  '#.@@..######....b.....######.g.#',
  '#.....######..........######...#',
  '#..n..######..........######.m.#',
  '#.....######..........######...#',
  '#.................b............#',
  '#.g...........p..........n.....#',
  '#....................m........N#',
  '#.####....D.....S.....####.....#',
  '#.####........m.......####.....#',
  '#.####................####.....#',
  '#.................n............#',
  '#...b.........g..........n.....#',
  '#....................m........N#',
  '#.@.@..........................#',
  '#.....#####............#####...#',
  '#.....#####.p..........#####.n.#',
  '#N.............................#',
  '################################',
];

/** Pixelrechtecke (Spalten 11 bis 24, je 3 Zeilen) */
export const CITY_ZONES: ZoneDef[] = [
  { id: 'stadium', name: 'Stadion', area: { x0: 176, y0: 96, x1: 400, y1: 144 } },
  { id: 'concert', name: 'Konzert', area: { x0: 176, y0: 192, x1: 400, y1: 240 } },
];

export const CITY_MAP = parseMap(CITY_ROWS, CITY_ZONES);
```

- [ ] **Step 5: `loot.ts` und `game.ts`**

`packages/core/src/loot.ts`: Signatur ersetzen durch `export function rollContents(rng: RngState, type: SpotType, multiplier = 1): Bottles {` und die Zeile `out[kind] = randInt(rng, min, max);` durch `out[kind] = randInt(rng, min, max);` belassen, aber **direkt vor** der Zeile `return out;` (nach der Mindestens-eine-Flasche-Regel) einfügen:
```ts
  if (multiplier !== 1) {
    for (const kind of BOTTLE_KINDS) out[kind] *= multiplier;
  }
```
Die Reihenfolge ist wichtig: erst Würfeln, dann Mindestens-eine-Regel, dann Multiplizieren (so ist im Test `triple = single * 3` exakt).

`packages/core/src/game.ts`: Import `import { nextRandom } from './rng';` ersetzen durch `import { nextRandom, randInt } from './rng';`. Im Zustand-Literal nach `spots: [],` einfügen:
```ts
    npcs: [],
    nextNpcId: 0,
    nextNpcMs: CONFIG.npc.firstSpawnMs,
    zones: [],
```
Nach der Zeile `for (const def of map.spots) state.spots.push(newSpot(state, def));` einfügen:
```ts
  state.zones = map.zones.map((def) => ({
    def,
    phase: 'idle' as const,
    timerMs: randInt(state, ...CONFIG.zone.firstIdleMs),
  }));
```
In `newPlayer` nach `shieldMs: 0,` einfügen:
```ts
    health: CONFIG.health.max,
    unconsciousMs: 0,
    spawn: { x: at.x, y: at.y },
```

- [ ] **Step 6: Tests, Typecheck**

Run: `npm test -w @pfandraiders/core && npm run typecheck -w @pfandraiders/core`
Expected: PASS. Schlägt ein bestehender Test fehl, weil er auf feste Spot-Indizes oder die Zahl 13 der Stadtkarte baut, den Test auf die neue Karte anpassen (Spot 0 und 1 behalten ihre Position) und im Bericht nennen. Der Client-Typecheck darf wegen `Mode`/`BuyCommand` noch brechen, das wird in den Client-Tasks behoben.

- [ ] **Step 7: Commit**

```bash
git add packages/core
git commit -m "feat(core): add health, npc and zone data model and the extended city map

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Leben, Hunger, Bewusstlosigkeit, Essen

**Files:**
- Create: `packages/core/src/health.ts`, `packages/core/test/health.test.ts`
- Modify: `packages/core/src/economy.ts`, `step.ts`, `index.ts`, `packages/core/test/economy.test.ts`

**Interfaces:**
- Produces: `knockOut(p)`, `damage(p, amount)`, `updateHealth(p, dtMs): boolean` (true = Spieler ist bewusstlos und ignoriert diesen Tick die Eingabe) in `health.ts`; `tryEat(state, p): boolean` in `economy.ts`; `tryBuy` verarbeitet `'food'`.

- [ ] **Step 1: Failing Tests schreiben**

`packages/core/test/health.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { totalBottles } from '../src/bottles';
import { CONFIG } from '../src/config';
import { damage } from '../src/health';
import { input, newGame, runFor, runSteps, SEARCH_ROWS, teleport } from './helpers';

describe('hunger', () => {
  it('drains one health per hungerEveryMs', () => {
    const s = newGame(SEARCH_ROWS);
    runSteps(s, {}, CONFIG.health.hungerEveryMs / 20, 20);
    expect(s.players.p1.health).toBeCloseTo(CONFIG.health.max - 1, 5);
  });

  it('knocks the player out when hunger takes the last health', () => {
    const s = newGame(SEARCH_ROWS);
    s.players.p1.health = 0.05;
    runSteps(s, {}, 30, 20);
    expect(s.players.p1.mode).toBe('unconscious');
    expect(s.players.p1.unconsciousMs).toBeGreaterThan(0);
    expect(s.players.p1.health).toBe(0);
  });
});

describe('knock out', () => {
  function knocked() {
    const s = newGame(SEARCH_ROWS);
    const p = s.players.p1;
    p.money = 1001;
    p.bottles = { plastic: 2, glass: 1, crate: 0 };
    p.item = 'bolt_cutters';
    damage(p, 1000);
    return s;
  }

  it('drops bottles and item and loses a quarter of the money (rounded down)', () => {
    const p = knocked().players.p1;
    expect(totalBottles(p.bottles)).toBe(0);
    expect(p.item).toBeNull();
    expect(p.money).toBe(1001 - Math.floor(1001 * CONFIG.health.moneyLossFraction));
    expect(p.mode).toBe('unconscious');
    expect(p.health).toBe(0);
    expect(p.unconsciousMs).toBe(CONFIG.health.unconsciousMs);
  });

  it('cancels searching and stealing', () => {
    const s = newGame(SEARCH_ROWS);
    const p = s.players.p1;
    p.searchSpotId = 0;
    p.searchProgressMs = 500;
    p.stealTargetId = 'x';
    p.stealProgressMs = 500;
    damage(p, 1000);
    expect(p.searchSpotId).toBeNull();
    expect(p.searchProgressMs).toBe(0);
    expect(p.stealTargetId).toBeNull();
    expect(p.stealProgressMs).toBe(0);
  });

  it('ignores all input while unconscious', () => {
    const s = knocked();
    runSteps(s, { p1: input({ moveX: 1, action: true, steal: true, buy: 'upgrade' }) }, 50, 20);
    expect(s.players.p1.x).toBe(24);
    expect(s.players.p1.mode).toBe('unconscious');
    expect(s.players.p1.containerLevel).toBe(0);
  });

  it('takes no further damage and loses no more money while unconscious', () => {
    const s = knocked();
    const money = s.players.p1.money;
    const left = s.players.p1.unconsciousMs;
    damage(s.players.p1, 50);
    expect(s.players.p1.money).toBe(money);
    expect(s.players.p1.unconsciousMs).toBe(left);
  });

  it('respawns at the spawn point with revive health and shield after the unconscious time', () => {
    const s = knocked();
    teleport(s, 'p1', { x: 100, y: 24 });
    runFor(s, {}, CONFIG.health.unconsciousMs + 100);
    const p = s.players.p1;
    expect(p.x).toBe(24);
    expect(p.y).toBe(24);
    expect(p.mode).toBe('walking');
    expect(p.health).toBeGreaterThan(CONFIG.health.reviveHealth - 1);
    expect(p.health).toBeLessThanOrEqual(CONFIG.health.reviveHealth);
    expect(p.shieldMs).toBeGreaterThan(0);
  });

  it('never lets health go below zero or become NaN', () => {
    const s = newGame(SEARCH_ROWS);
    damage(s.players.p1, 250);
    expect(s.players.p1.health).toBe(0);
    runSteps(s, {}, 10, 20);
    expect(Number.isNaN(s.players.p1.health)).toBe(false);
    expect(s.players.p1.health).toBeGreaterThanOrEqual(0);
  });
});

describe('food', () => {
  const EAT = { p1: input({ buy: 'food' }) };

  function atShop() {
    const s = newGame(SEARCH_ROWS);
    teleport(s, 'p1', s.map.shops[0]);
    return s;
  }

  it('heals and costs money at the shop', () => {
    const s = atShop();
    s.players.p1.health = 50;
    s.players.p1.money = CONFIG.health.food.price + 5;
    runSteps(s, EAT, 1);
    expect(s.players.p1.health).toBeCloseTo(50 + CONFIG.health.food.heal, 1);
    expect(s.players.p1.money).toBe(5);
  });

  it('caps health at the maximum', () => {
    const s = atShop();
    s.players.p1.health = 95;
    s.players.p1.money = 1000;
    runSteps(s, EAT, 1);
    expect(s.players.p1.health).toBe(CONFIG.health.max);
  });

  it('refuses when money is short by one cent', () => {
    const s = atShop();
    s.players.p1.health = 50;
    s.players.p1.money = CONFIG.health.food.price - 1;
    runSteps(s, EAT, 1);
    expect(s.players.p1.health).toBeLessThan(50);
    expect(s.players.p1.money).toBe(CONFIG.health.food.price - 1);
  });

  it('refuses away from the shop', () => {
    const s = newGame(SEARCH_ROWS);
    s.players.p1.health = 50;
    s.players.p1.money = 1000;
    runSteps(s, EAT, 1);
    expect(s.players.p1.money).toBe(1000);
  });
});
```

Am Ende von `packages/core/test/economy.test.ts` anhängen (die Hilfsfunktion `atShop()` und die Imports stehen dort bereits):
```ts
describe('dog treat', () => {
  const BUY = { p1: input({ buy: 'dog_treat' }) };

  it('buys the treat at the shop', () => {
    const s = atShop();
    s.players.p1.money = CONFIG.items.dog_treat.price + 7;
    runSteps(s, BUY, 1);
    expect(s.players.p1.item).toBe('dog_treat');
    expect(s.players.p1.money).toBe(7);
  });

  it('shares the item slot with the bolt cutters', () => {
    const s = atShop();
    s.players.p1.item = 'bolt_cutters';
    s.players.p1.money = 100_000;
    runSteps(s, BUY, 1);
    expect(s.players.p1.item).toBe('bolt_cutters');
    expect(s.players.p1.money).toBe(100_000);
  });
});
```

Run: `npm test -w @pfandraiders/core -- test/health.test.ts test/economy.test.ts`
Expected: FAIL (`../src/health` fehlt, `health` wird nicht verändert).

- [ ] **Step 2: `health.ts` schreiben**

`packages/core/src/health.ts`:
```ts
import { emptyBottles } from './bottles';
import { CONFIG } from './config';
import { cancelSearch } from './search';
import { cancelSteal } from './theft';
import type { Player } from './types';

/** Umfallen: Flaschen, Item und ein Teil des Geldes gehen verloren. */
export function knockOut(p: Player): void {
  p.health = 0;
  p.unconsciousMs = CONFIG.health.unconsciousMs;
  p.bottles = emptyBottles();
  p.money -= Math.floor(p.money * CONFIG.health.moneyLossFraction);
  p.item = null;
  cancelSearch(p);
  cancelSteal(p);
  p.mode = 'unconscious';
}

/** Schaden. Bewusstlose nehmen keinen Schaden. Unterbricht Suchen und Klauen. */
export function damage(p: Player, amount: number): void {
  if (p.unconsciousMs > 0) return;
  cancelSearch(p);
  cancelSteal(p);
  p.health = Math.max(0, p.health - amount);
  if (p.health <= 0) knockOut(p);
}

/**
 * Hunger, Bewusstlosigkeit und Respawn für einen Tick.
 * Gibt true zurück, wenn der Spieler in diesem Tick bewusstlos ist und keine Eingabe wirkt.
 */
export function updateHealth(p: Player, dtMs: number): boolean {
  if (p.unconsciousMs > 0) {
    p.unconsciousMs = Math.max(0, p.unconsciousMs - dtMs);
    if (p.unconsciousMs > 0) return true;
    p.x = p.spawn.x;
    p.y = p.spawn.y;
    p.health = CONFIG.health.reviveHealth;
    p.shieldMs = CONFIG.health.spawnShieldMs;
    return false;
  }
  p.health -= dtMs / CONFIG.health.hungerEveryMs;
  if (p.health <= 0) {
    knockOut(p);
    return true;
  }
  return false;
}
```

- [ ] **Step 3: `economy.ts` erweitern**

Am Ende von `packages/core/src/economy.ts` die Funktion `tryBuy` ersetzen durch:
```ts
/** Kauft Essen: Shop in Reichweite und genug Geld. Heilt bis zum Maximum. */
export function tryEat(state: GameState, p: Player): boolean {
  if (!isNear(state.map.shops, p)) return false;
  if (p.money < CONFIG.health.food.price) return false;
  p.money -= CONFIG.health.food.price;
  p.health = Math.min(CONFIG.health.max, p.health + CONFIG.health.food.heal);
  return true;
}

export function tryBuy(state: GameState, p: Player, cmd: BuyCommand): boolean {
  if (cmd === 'upgrade') return tryUpgrade(state, p);
  if (cmd === 'food') return tryEat(state, p);
  return tryBuyItem(state, p, cmd);
}
```

- [ ] **Step 4: `step.ts` anpassen**

In `packages/core/src/step.ts` den Import `import { cancelSteal, updateSteal } from './theft';` ergänzen um darunter `import { updateHealth } from './health';` (alphabetisch passend nach `./economy`: Zeile `import { updateHealth } from './health';` direkt nach `import { deposit, isNear, tryBuy } from './economy';`). In `updatePlayer` die Zeile `p.shieldMs = Math.max(0, p.shieldMs - dt);` ersetzen durch:
```ts
  p.shieldMs = Math.max(0, p.shieldMs - dt);

  if (updateHealth(p, dt)) {
    // Bewusstlos: keine Eingabe wirksam, Tastenflanken aber nachführen
    p.actionHeld = input.action;
    p.stealHeld = input.steal;
    p.mode = 'unconscious';
    return;
  }
```
und die beiden Zeilen
```ts
  const pressed = input.action && !p.actionHeld;
  p.actionHeld = input.action;
  const stealPressed = input.steal && !p.stealHeld;
  p.stealHeld = input.steal;
```
**vor** den neuen Block `if (updateHealth(...))` unverändert stehen lassen. Reihenfolge am Ende also: `pressed`/`stealPressed` berechnen und `actionHeld`/`stealHeld` setzen, dann `shieldMs`, dann der `updateHealth`-Block (der bei Bewusstlosigkeit `actionHeld`/`stealHeld` erneut gleich setzt), dann der Rest wie bisher.

`packages/core/src/index.ts` ergänzen: `export * from './health';`

- [ ] **Step 5: Tests und Typecheck**

Run: `npm test -w @pfandraiders/core && npm run typecheck -w @pfandraiders/core`
Expected: PASS. Ein bestehender Test, der exakte Lebenswerte annimmt, existiert nicht. Schlägt trotzdem einer fehl, Ursache klären (Hunger verändert `health` in jedem Tick), nicht die Regel lockern.

- [ ] **Step 6: Commit**

```bash
git add packages/core
git commit -m "feat(core): add health, hunger, knock out with respawn and food

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Event-Zonen

**Files:**
- Create: `packages/core/src/zones.ts`, `packages/core/test/zones.test.ts`
- Modify: `packages/core/src/search.ts`, `step.ts`, `index.ts`

**Interfaces:**
- Produces: `inArea(area, p)`, `activeZoneAt(state, p): ZoneState | null`, `spotMultiplier(state, spot)`, `spotRefillMs(state, spot)`, `updateZones(state, dtMs)` in `zones.ts`.

- [ ] **Step 1: Failing Tests schreiben**

`packages/core/test/zones.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { totalBottles } from '../src/bottles';
import { CONFIG } from '../src/config';
import { createGame } from '../src/game';
import { parseMap } from '../src/map';
import { activeZoneAt, inArea } from '../src/zones';
import { input, runFor, runSteps, setSpot } from './helpers';

/** Spawn (24,24); Spot 0 bei x=40 liegt in der Zone, Spot 1 bei x=136 außerhalb */
const ROWS = ['##########', '#@b.....n#', '##########'];
const ZONES = [{ id: 'z', name: 'Zone', area: { x0: 32, y0: 16, x1: 64, y1: 32 } }];

function game() {
  const s = createGame(1, parseMap(ROWS, ZONES), ['p1']);
  s.nextNpcMs = 1e9;
  return s;
}

describe('zone phases', () => {
  it('goes idle -> announced -> active -> idle on its timers', () => {
    const s = game();
    const z = s.zones[0];
    z.timerMs = 100;
    runSteps(s, {}, 5, 20);
    expect(z.phase).toBe('announced');
    expect(z.timerMs).toBe(CONFIG.zone.announceMs);
    runFor(s, {}, CONFIG.zone.announceMs);
    expect(z.phase).toBe('active');
    expect(z.timerMs).toBeLessThanOrEqual(CONFIG.zone.activeMs);
    runFor(s, {}, CONFIG.zone.activeMs);
    expect(z.phase).toBe('idle');
    expect(z.timerMs).toBeGreaterThanOrEqual(CONFIG.zone.idleMs[0] - 40);
    expect(z.timerMs).toBeLessThanOrEqual(CONFIG.zone.idleMs[1]);
  });

  it('does not touch spots while only announced', () => {
    const s = game();
    setSpot(s, 0, { plastic: 1 });
    const z = s.zones[0];
    z.timerMs = 20;
    runSteps(s, {}, 2, 20);
    expect(z.phase).toBe('announced');
    expect(s.spots[0].contents).toEqual({ plastic: 1, glass: 0, crate: 0 });
  });
});

describe('zone boost', () => {
  it('refills the spots inside the zone with a multiplied amount when it becomes active', () => {
    const s = game();
    setSpot(s, 0, { plastic: 1 });
    setSpot(s, 1, { plastic: 1 });
    const z = s.zones[0];
    z.phase = 'announced';
    z.timerMs = 20;
    runSteps(s, {}, 2, 20);
    expect(z.phase).toBe('active');
    expect(totalBottles(s.spots[0].contents)).toBeGreaterThanOrEqual(CONFIG.zone.multiplier);
    expect(s.spots[1].contents).toEqual({ plastic: 1, glass: 0, crate: 0 }); // außerhalb unverändert
  });

  it('uses the short refill time for spots emptied inside an active zone', () => {
    const s = game();
    const z = s.zones[0];
    z.phase = 'active';
    z.timerMs = 100000;
    setSpot(s, 0, { plastic: 1 });
    runFor(s, { p1: input({ action: true }) }, CONFIG.searchMs + 100);
    expect(totalBottles(s.spots[0].contents)).toBe(0);
    expect(s.spots[0].refillInMs).toBeGreaterThan(0);
    expect(s.spots[0].refillInMs).toBeLessThanOrEqual(CONFIG.zone.refillMs);
  });

  it('uses the normal refill time when the zone is not active', () => {
    const s = game();
    setSpot(s, 0, { plastic: 1 });
    runFor(s, { p1: input({ action: true }) }, CONFIG.searchMs + 100);
    expect(s.spots[0].refillInMs).toBeGreaterThan(CONFIG.zone.refillMs);
  });

  it('refills an emptied spot in an active zone with a multiplied amount', () => {
    const s = game();
    const z = s.zones[0];
    z.phase = 'active';
    z.timerMs = 100000;
    setSpot(s, 0, {});
    s.spots[0].refillInMs = 40;
    runSteps(s, {}, 3, 20);
    expect(totalBottles(s.spots[0].contents)).toBeGreaterThanOrEqual(CONFIG.zone.multiplier);
  });
});

describe('activeZoneAt', () => {
  it('returns the zone only while it is active and the point is inside', () => {
    const s = game();
    const inside = { x: 40, y: 24 };
    const outside = { x: 136, y: 24 };
    expect(activeZoneAt(s, inside)).toBeNull();
    s.zones[0].phase = 'announced';
    expect(activeZoneAt(s, inside)).toBeNull();
    s.zones[0].phase = 'active';
    expect(activeZoneAt(s, inside)).toBe(s.zones[0]);
    expect(activeZoneAt(s, outside)).toBeNull();
  });

  it('treats the upper bounds as exclusive', () => {
    const area = { x0: 0, y0: 0, x1: 32, y1: 32 };
    expect(inArea(area, { x: 0, y: 0 })).toBe(true);
    expect(inArea(area, { x: 32, y: 10 })).toBe(false);
    expect(inArea(area, { x: 10, y: 32 })).toBe(false);
  });
});
```

Run: `npm test -w @pfandraiders/core -- test/zones.test.ts`
Expected: FAIL (`../src/zones` fehlt).

- [ ] **Step 2: `zones.ts` schreiben**

`packages/core/src/zones.ts`:
```ts
import { CONFIG } from './config';
import { rollContents } from './loot';
import { randInt } from './rng';
import type { Area, GameState, Point, Spot, ZoneState } from './types';

/** x1/y1 sind exklusiv */
export function inArea(a: Area, p: Point): boolean {
  return p.x >= a.x0 && p.x < a.x1 && p.y >= a.y0 && p.y < a.y1;
}

/** Aktive Zone, in der der Punkt liegt, sonst null. */
export function activeZoneAt(state: GameState, p: Point): ZoneState | null {
  return state.zones.find((z) => z.phase === 'active' && inArea(z.def.area, p)) ?? null;
}

export function spotMultiplier(state: GameState, spot: Spot): number {
  return activeZoneAt(state, spot) ? CONFIG.zone.multiplier : 1;
}

export function spotRefillMs(state: GameState, spot: Spot): number {
  return activeZoneAt(state, spot) ? CONFIG.zone.refillMs : CONFIG.refillMs;
}

function boostSpots(state: GameState, zone: ZoneState): void {
  for (const spot of state.spots) {
    if (!inArea(zone.def.area, spot)) continue;
    spot.contents = rollContents(state, spot.type, CONFIG.zone.multiplier);
    spot.refillInMs = 0;
  }
}

/** Phasenwechsel der Zonen: Pause -> angekündigt -> aktiv -> Pause. */
export function updateZones(state: GameState, dtMs: number): void {
  for (const zone of state.zones) {
    zone.timerMs -= dtMs;
    if (zone.timerMs > 0) continue;
    if (zone.phase === 'idle') {
      zone.phase = 'announced';
      zone.timerMs = CONFIG.zone.announceMs;
    } else if (zone.phase === 'announced') {
      zone.phase = 'active';
      zone.timerMs = CONFIG.zone.activeMs;
      boostSpots(state, zone);
    } else {
      zone.phase = 'idle';
      zone.timerMs = randInt(state, ...CONFIG.zone.idleMs);
    }
  }
}
```

- [ ] **Step 3: `search.ts` und `step.ts` einhängen**

`packages/core/src/search.ts`: `import { rollContents } from './loot';` ergänzen um darunter `import { spotMultiplier, spotRefillMs } from './zones';`. In `updateSearch` die Zeile `if (totalBottles(spot.contents) === 0) spot.refillInMs = CONFIG.refillMs;` ersetzen durch `if (totalBottles(spot.contents) === 0) spot.refillInMs = spotRefillMs(state, spot);`. In `refillSpot` die Zeile `spot.contents = rollContents(state, spot.type);` ersetzen durch `spot.contents = rollContents(state, spot.type, spotMultiplier(state, spot));`.

`packages/core/src/step.ts`: `import { updateHealth } from './health';` ergänzen um `import { updateZones } from './zones';` (nach den anderen Imports) und in `step` nach der Zeile `for (const spot of state.spots) refillSpot(state, spot, dt);` einfügen `updateZones(state, dt);`.

`packages/core/src/index.ts` ergänzen: `export * from './zones';`

- [ ] **Step 4: Tests und Typecheck**

Run: `npm test -w @pfandraiders/core && npm run typecheck -w @pfandraiders/core`
Expected: PASS (auch die Suchtests aus Phase 1, deren Karten keine Zonen haben).

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): add event zones with announcement, boost and short refill

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Hunde und Polizei

**Files:**
- Create: `packages/core/src/npc.ts`, `packages/core/test/npc.test.ts`
- Modify: `packages/core/src/step.ts`, `index.ts`

**Interfaces:**
- Produces: `updateNpcs(state, dtMs)`, `isBeingChecked(state, playerId): boolean`.
- Consumes: `damage` aus `health.ts`, `Npc` aus Task 1.

- [ ] **Step 1: Failing Tests schreiben**

`packages/core/test/npc.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { totalBottles } from '../src/bottles';
import { CONFIG } from '../src/config';
import { createGame } from '../src/game';
import { damage } from '../src/health';
import { parseMap } from '../src/map';
import { isBeingChecked } from '../src/npc';
import type { GameState, NpcKind } from '../src/types';
import { input, newGame, openRows, runFor, runSteps, SEARCH_ROWS } from './helpers';

function quiet(s: GameState): GameState {
  s.nextNpcMs = 1e9; // keine Zufalls-Spawns in diesem Test
  return s;
}

function addNpc(s: GameState, kind: NpcKind, x: number, y: number) {
  const npc = {
    id: s.nextNpcId++,
    kind,
    x,
    y,
    lifeMs: 30000,
    targetId: null as string | null,
    cooldownMs: 0,
    distractedMs: 0,
    checkMs: 0,
  };
  s.npcs.push(npc);
  return npc;
}

describe('dog', () => {
  it('chases the nearest conscious player at dog speed', () => {
    const s = quiet(newGame(openRows(30, 5)));
    const dog = addNpc(s, 'dog', 150, 24);
    runSteps(s, {}, 25, 20); // 500 ms
    expect(dog.x).toBeCloseTo(150 - (CONFIG.npc.dog.speed * 500) / 1000, 3);
    expect(dog.targetId).toBe('p1');
  });

  it('ignores players beyond its sense radius', () => {
    const s = quiet(newGame(openRows(30, 5)));
    const dog = addNpc(s, 'dog', 24 + CONFIG.npc.dog.senseRadius + 60, 24);
    const x = dog.x;
    runSteps(s, {}, 25, 20);
    expect(dog.x).toBe(x);
    expect(dog.targetId).toBeNull();
  });

  it('bites in range, then waits for the cooldown before biting again', () => {
    const s = quiet(newGame(openRows(30, 5)));
    addNpc(s, 'dog', 30, 24);
    runSteps(s, {}, 3, 20);
    expect(s.players.p1.health).toBeCloseTo(CONFIG.health.max - CONFIG.npc.dog.biteDamage, 1);
    runFor(s, {}, 1000); // noch in der Pause
    expect(s.players.p1.health).toBeGreaterThan(CONFIG.health.max - 2 * CONFIG.npc.dog.biteDamage + 1);
    runFor(s, {}, 700); // Pause vorbei
    expect(s.players.p1.health).toBeLessThan(CONFIG.health.max - 2 * CONFIG.npc.dog.biteDamage + 1);
  });

  it('interrupts the search of the bitten player', () => {
    const s = quiet(newGame(SEARCH_ROWS));
    s.spots[0].contents = { plastic: 1, glass: 0, crate: 0 };
    runSteps(s, { p1: input({ action: true }) }, 50, 20);
    expect(s.players.p1.searchProgressMs).toBe(1000);
    addNpc(s, 'dog', 30, 24);
    runSteps(s, { p1: input({ action: true }) }, 1, 20);
    expect(s.players.p1.searchProgressMs).toBe(0);
    expect(s.players.p1.searchSpotId).toBeNull();
  });

  it('is distracted by a treat instead of biting, and the treat is used up', () => {
    const s = quiet(newGame(openRows(30, 5)));
    s.players.p1.item = 'dog_treat';
    const dog = addNpc(s, 'dog', 30, 24);
    runSteps(s, {}, 3, 20);
    expect(s.players.p1.item).toBeNull();
    expect(s.players.p1.health).toBeGreaterThan(CONFIG.health.max - 1);
    expect(dog.distractedMs).toBeGreaterThan(CONFIG.npc.dog.distractedMs - 100);
    runFor(s, {}, 3000); // beschäftigt: kein Biss
    expect(s.players.p1.health).toBeGreaterThan(CONFIG.health.max - 1);
  });

  it('does not use a bolt cutters item up on a bite', () => {
    const s = quiet(newGame(openRows(30, 5)));
    s.players.p1.item = 'bolt_cutters';
    addNpc(s, 'dog', 30, 24);
    runSteps(s, {}, 3, 20);
    expect(s.players.p1.item).toBe('bolt_cutters');
    expect(s.players.p1.health).toBeLessThan(CONFIG.health.max - 10);
  });

  it('does not target unconscious players', () => {
    const s = quiet(newGame(openRows(30, 5)));
    damage(s.players.p1, 1000);
    const dog = addNpc(s, 'dog', 30, 24);
    runSteps(s, {}, 5, 20);
    expect(dog.targetId).toBeNull();
    expect(s.players.p1.health).toBe(0);
  });

  it('despawns when its lifetime runs out', () => {
    const s = quiet(newGame(openRows(30, 5)));
    const dog = addNpc(s, 'dog', 300, 24);
    dog.lifeMs = 100;
    runSteps(s, {}, 6, 20);
    expect(s.npcs).toHaveLength(0);
  });
});

describe('police', () => {
  function carrying() {
    const s = quiet(newGame(openRows(30, 5)));
    s.players.p1.containerLevel = 1;
    s.players.p1.bottles = { plastic: 4, glass: 0, crate: 0 };
    return s;
  }

  it('walks toward a player with bottles, slower than the player', () => {
    const s = carrying();
    const cop = addNpc(s, 'police', 120, 24);
    runSteps(s, {}, 25, 20);
    expect(cop.x).toBeCloseTo(120 - (CONFIG.npc.police.speed * 500) / 1000, 3);
  });

  it('ignores a player without bottles', () => {
    const s = quiet(newGame(openRows(30, 5)));
    const cop = addNpc(s, 'police', 60, 24);
    runSteps(s, {}, 25, 20);
    expect(cop.x).toBe(60);
    expect(cop.targetId).toBeNull();
  });

  it('confiscates half the bottles (rounded up) after the full check and leaves', () => {
    const s = carrying();
    addNpc(s, 'police', 40, 24); // 16 px entfernt, innerhalb des Kontrollradius
    runSteps(s, {}, 50, 20);
    expect(isBeingChecked(s, 'p1')).toBe(true);
    expect(totalBottles(s.players.p1.bottles)).toBe(4);
    runFor(s, {}, CONFIG.npc.police.checkMs);
    expect(totalBottles(s.players.p1.bottles)).toBe(2);
    expect(s.npcs).toHaveLength(0);
    expect(isBeingChecked(s, 'p1')).toBe(false);
  });

  it('resets the check when the player runs away', () => {
    const s = carrying();
    const cop = addNpc(s, 'police', 40, 24);
    runSteps(s, {}, 50, 20); // 1000 ms Kontrolle
    expect(cop.checkMs).toBeGreaterThan(0);
    runSteps(s, { p1: input({ moveX: 1 }) }, 40, 20); // flieht mit 90 px/s, Polizei schafft 55
    expect(cop.checkMs).toBe(0);
    expect(isBeingChecked(s, 'p1')).toBe(false);
    expect(totalBottles(s.players.p1.bottles)).toBe(4);
    expect(s.npcs).toHaveLength(1);
  });
});

describe('npc spawning', () => {
  const SPAWN_ROWS = ['#######', '#@N...#', '#######'];

  it('spawns an npc at an entrance when the timer runs out and re-arms the timer', () => {
    const s = createGame(1, parseMap(SPAWN_ROWS), ['p1']);
    s.nextNpcMs = 20;
    runSteps(s, {}, 2, 20);
    expect(s.npcs).toHaveLength(1);
    expect(s.npcs[0].x).toBe(40);
    expect(s.npcs[0].y).toBe(24);
    expect(s.nextNpcMs).toBeGreaterThanOrEqual(CONFIG.npc.spawnEveryMs[0] - 40);
    expect(s.nextNpcMs).toBeLessThanOrEqual(CONFIG.npc.spawnEveryMs[1]);
  });

  it('never exceeds the npc cap', () => {
    const s = createGame(1, parseMap(SPAWN_ROWS), ['p1']);
    for (let i = 0; i < CONFIG.npc.maxCount; i++) addNpc(s, 'dog', 100, 24).lifeMs = 1e9;
    s.nextNpcMs = 20;
    runSteps(s, {}, 2, 20);
    expect(s.npcs).toHaveLength(CONFIG.npc.maxCount);
  });

  it('spawns nothing on a map without entrances', () => {
    const s = createGame(1, parseMap(['#####', '#@..#', '#####']), ['p1']);
    s.nextNpcMs = 20;
    runSteps(s, {}, 2, 20);
    expect(s.npcs).toHaveLength(0);
  });
});
```

Run: `npm test -w @pfandraiders/core -- test/npc.test.ts`
Expected: FAIL (`../src/npc` fehlt).

- [ ] **Step 2: `npc.ts` schreiben**

`packages/core/src/npc.ts`:
```ts
import { emptyBottles, totalBottles, transferBottles } from './bottles';
import { CONFIG } from './config';
import { distance } from './economy';
import { damage } from './health';
import { boxBlocked } from './map';
import { nextRandom, randInt } from './rng';
import type { GameState, Npc, NpcKind, Player, Point } from './types';

/** Läuft geradeaus auf `to` zu, Achsen getrennt (rutscht an Wänden entlang). */
function moveToward(state: GameState, npc: Npc, to: Point, speed: number, dtMs: number): void {
  const d = distance(npc, to);
  if (d === 0) return;
  const step = Math.min((speed * dtMs) / 1000, d);
  const dx = ((to.x - npc.x) / d) * step;
  const dy = ((to.y - npc.y) / d) * step;
  if (!boxBlocked(state.map, npc.x + dx, npc.y, CONFIG.playerHalf)) npc.x += dx;
  if (!boxBlocked(state.map, npc.x, npc.y + dy, CONFIG.playerHalf)) npc.y += dy;
}

/** Behält das aktuelle Ziel, solange es gültig ist, sonst der nächste passende bewusste Spieler im Umkreis. */
function pickTarget(
  state: GameState,
  npc: Npc,
  radius: number,
  ok: (p: Player) => boolean,
): Player | null {
  const current = npc.targetId === null ? undefined : state.players[npc.targetId];
  if (current && current.unconsciousMs === 0 && ok(current) && distance(npc, current) <= radius) {
    return current;
  }
  let best: Player | null = null;
  let bestDist = Infinity;
  for (const p of Object.values(state.players)) {
    if (p.unconsciousMs > 0 || !ok(p)) continue;
    const d = distance(npc, p);
    if (d <= radius && d < bestDist) {
      best = p;
      bestDist = d;
    }
  }
  npc.targetId = best ? best.id : null;
  return best;
}

function updateDog(state: GameState, npc: Npc, dtMs: number): void {
  const cfg = CONFIG.npc.dog;
  npc.cooldownMs = Math.max(0, npc.cooldownMs - dtMs);
  if (npc.distractedMs > 0) {
    npc.distractedMs = Math.max(0, npc.distractedMs - dtMs);
    return;
  }
  const target = pickTarget(state, npc, cfg.senseRadius, () => true);
  if (!target) return;
  if (distance(npc, target) > cfg.biteRadius) {
    moveToward(state, npc, target, cfg.speed, dtMs);
    return;
  }
  if (npc.cooldownMs > 0) return;
  npc.cooldownMs = cfg.biteCooldownMs;
  if (target.item === 'dog_treat') {
    target.item = null;
    npc.distractedMs = cfg.distractedMs;
  } else {
    damage(target, cfg.biteDamage);
  }
}

function updatePolice(state: GameState, npc: Npc, dtMs: number): void {
  const cfg = CONFIG.npc.police;
  const target = pickTarget(state, npc, cfg.senseRadius, (p) => totalBottles(p.bottles) > 0);
  if (!target) {
    npc.checkMs = 0;
    return;
  }
  if (distance(npc, target) > cfg.controlRadius) {
    npc.checkMs = 0; // Spieler ist weg: Kontrolle beginnt von vorn
    moveToward(state, npc, target, cfg.speed, dtMs);
    return;
  }
  npc.checkMs += dtMs;
  if (npc.checkMs >= cfg.checkMs) {
    const count = Math.ceil(totalBottles(target.bottles) * cfg.fraction);
    transferBottles(target.bottles, emptyBottles(), count); // beschlagnahmt: verschwindet
    npc.lifeMs = 0;
  }
}

function trySpawn(state: GameState): void {
  if (state.npcs.length >= CONFIG.npc.maxCount || state.map.npcSpawns.length === 0) return;
  const kind: NpcKind = nextRandom(state) < CONFIG.npc.dogChance ? 'dog' : 'police';
  const at = state.map.npcSpawns[randInt(state, 0, state.map.npcSpawns.length - 1)];
  state.npcs.push({
    id: state.nextNpcId++,
    kind,
    x: at.x,
    y: at.y,
    lifeMs: kind === 'dog' ? CONFIG.npc.dog.lifeMs : CONFIG.npc.police.lifeMs,
    targetId: null,
    cooldownMs: 0,
    distractedMs: 0,
    checkMs: 0,
  });
}

/** Zufalls-Spawns, Bewegung und Wirkung aller NPCs für einen Tick. */
export function updateNpcs(state: GameState, dtMs: number): void {
  state.nextNpcMs -= dtMs;
  if (state.nextNpcMs <= 0) {
    state.nextNpcMs = randInt(state, ...CONFIG.npc.spawnEveryMs);
    trySpawn(state);
  }
  for (const npc of state.npcs) {
    npc.lifeMs -= dtMs;
    if (npc.lifeMs <= 0) continue;
    if (npc.kind === 'dog') updateDog(state, npc, dtMs);
    else updatePolice(state, npc, dtMs);
  }
  state.npcs = state.npcs.filter((n) => n.lifeMs > 0);
}

/** Läuft gerade eine Polizeikontrolle gegen diesen Spieler? Für die Warnung im Client. */
export function isBeingChecked(state: GameState, playerId: string): boolean {
  return state.npcs.some((n) => n.kind === 'police' && n.targetId === playerId && n.checkMs > 0);
}
```

- [ ] **Step 3: `step.ts` und `index.ts`**

`packages/core/src/step.ts`: Import `import { updateNpcs } from './npc';` ergänzen und in `step` nach `updateZones(state, dt);` einfügen `updateNpcs(state, dt);`.
`packages/core/src/index.ts` ergänzen: `export * from './npc';`

- [ ] **Step 4: Tests und Typecheck**

Run: `npm test -w @pfandraiders/core && npm run typecheck -w @pfandraiders/core`
Expected: PASS. Fällt ein Hundetest durch eine Zählung um wenige Hundertstel (Hunger!), die Grenzen der Tests prüfen, nicht die Regel lockern. Schlägt 'bites in range ...' fehl, den Tick-Ablauf von Hand nachrechnen (Hund beißt im ersten Tick, Pause 1500 ms) und berichten.

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): add dogs, police and random npc spawning

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Determinismus mit Events

**Files:**
- Test: `packages/core/test/determinism-events.test.ts`

- [ ] **Step 1: Test schreiben**

`packages/core/test/determinism-events.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { createGame } from '../src/game';
import { CITY_MAP } from '../src/maps/city';
import { step } from '../src/step';
import type { GameState, Input } from '../src/types';

function scripted(tick: number, shift: number): Input {
  const dirs = [-1, 0, 1] as const;
  return {
    moveX: dirs[(Math.floor(tick / 8) + shift) % 3],
    moveY: dirs[(Math.floor(tick / 13) + shift) % 3],
    action: (tick + shift) % 9 < 5,
    steal: tick % 211 < 6,
    buy: tick % 300 === 0 ? 'food' : tick % 450 === 0 ? 'dog_treat' : null,
  };
}

interface Stats {
  maxNpcs: number;
  sawDog: boolean;
  sawPolice: boolean;
  zoneActive: boolean;
  minHealth: number;
}

function play(seed: number): { state: GameState; stats: Stats } {
  const s = createGame(seed, CITY_MAP, ['a', 'b', 'c'], { roundMs: 400000 });
  const stats: Stats = { maxNpcs: 0, sawDog: false, sawPolice: false, zoneActive: false, minHealth: 100 };
  for (let t = 0; t < 4000; t++) {
    step(s, { a: scripted(t, 0), b: scripted(t, 1), c: scripted(t, 2) }, 100);
    stats.maxNpcs = Math.max(stats.maxNpcs, s.npcs.length);
    if (s.npcs.some((n) => n.kind === 'dog')) stats.sawDog = true;
    if (s.npcs.some((n) => n.kind === 'police')) stats.sawPolice = true;
    if (s.zones.some((z) => z.phase === 'active')) stats.zoneActive = true;
    for (const p of Object.values(s.players)) stats.minHealth = Math.min(stats.minHealth, p.health);
  }
  return { state: s, stats };
}

describe('determinism with events', () => {
  it('replays to the identical state for the same seed and inputs', () => {
    const a = play(5);
    const b = play(5);
    expect(a.state.tick).toBe(4000);
    expect(JSON.stringify(b.state)).toBe(JSON.stringify(a.state));
    expect(JSON.stringify(b.stats)).toBe(JSON.stringify(a.stats));
  });

  it('really exercises npcs and zones in that scenario', () => {
    const { stats } = play(5);
    expect(stats.maxNpcs).toBeGreaterThan(0);
    expect(stats.zoneActive).toBe(true);
    expect(stats.minHealth).toBeLessThan(100); // Hunger greift immer
  });

  it('diverges for a different seed', () => {
    expect(JSON.stringify(play(6).state.zones)).not.toBe(JSON.stringify(play(5).state.zones));
  });
});
```

- [ ] **Step 2: Test laufen lassen**

Run: `npm test -w @pfandraiders/core -- test/determinism-events.test.ts`
Expected: PASS. Schlägt der Gleichheitstest fehl, steckt Nicht-Determinismus im Core (zum Beispiel Objektreihenfolge, `Math.random`, Zeit): Ursache beheben, Test nicht lockern. Schlägt 'really exercises' fehl, weil in 400 s kein NPC erscheint, ist das ein Plan-Fehler: Szenario (Seed oder Länge) anpassen und dokumentieren, nicht die Assertion streichen. Zusätzlich im Bericht festhalten, ob `sawDog` und `sawPolice` in Seed 5 beide wahr werden (die Assertions dafür stehen bewusst nicht im Test, weil sie vom Seed abhängen).

- [ ] **Step 3: Commit**

```bash
git add packages/core/test/determinism-events.test.ts
git commit -m "test(core): pin determinism with npcs, zones and hunger

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Neue Kauftasten im Client

**Files:**
- Modify: `packages/client/src/input.ts`, `sources.ts`, `devices.ts`
- Modify (Tests): `packages/client/test/input.test.ts`, `sources.test.ts`

**Interfaces:**
- Produces: `KeyState.buyTreat/buyFood` (Flanke), `HeldKeys.buyTreat/buyFood`, `PadSnapshot.l1/r1`, `KeyLabels.treat/food`.

- [ ] **Step 1: Tests anpassen (rot)**

- `input.test.ts`: in `NONE` ergänzen `buyTreat: false,` und `buyFood: false,`. Tests anfügen:
```ts
  it('maps the treat and food keys', () => {
    expect(buildInput({ ...NONE, buyTreat: true })).toMatchObject({ buy: 'dog_treat' });
    expect(buildInput({ ...NONE, buyFood: true })).toMatchObject({ buy: 'food' });
  });

  it('prefers upgrade, then bolt cutters, then treat, then food when several come in one frame', () => {
    const all = { ...NONE, buyUpgrade: true, buyItem: true, buyTreat: true, buyFood: true };
    expect(buildInput(all)).toMatchObject({ buy: 'upgrade' });
    expect(buildInput({ ...all, buyUpgrade: false })).toMatchObject({ buy: 'bolt_cutters' });
    expect(buildInput({ ...all, buyUpgrade: false, buyItem: false })).toMatchObject({ buy: 'dog_treat' });
  });
```
- `sources.test.ts`: in `IDLE` ergänzen `l1: false,` `r1: false,`; im `held`-Helfer `buyTreat: false,` `buyFood: false,`. Tests anfügen:
```ts
  it('maps the shoulder buttons: RB treat, LB food', () => {
    expect(padToHeld({ ...IDLE, r1: true })).toMatchObject({ buyTreat: true, buyFood: false });
    expect(padToHeld({ ...IDLE, l1: true })).toMatchObject({ buyFood: true, buyTreat: false });
  });
```
(im `padToHeld`-describe) und
```ts
  it('reports treat and food only on the frame they go down', () => {
    const t = new EdgeTracker();
    expect(t.apply(held({ buyTreat: true })).buyTreat).toBe(true);
    expect(t.apply(held({ buyTreat: true })).buyTreat).toBe(false);
    expect(t.apply(held({ buyFood: true })).buyFood).toBe(true);
    expect(t.apply(held({ buyFood: true })).buyFood).toBe(false);
  });
```
(im `EdgeTracker`-describe).

Run: `npm test -w @pfandraiders/client`
Expected: FAIL.

- [ ] **Step 2: Implementieren**

`input.ts`: `KeyState` um `/** true nur im Frame des neuen Drückens */ buyTreat: boolean;` und `buyFood: boolean;` erweitern. In `buildInput` die `buy`-Zeile ersetzen durch:
```ts
    buy: k.buyUpgrade
      ? 'upgrade'
      : k.buyItem
        ? 'bolt_cutters'
        : k.buyTreat
          ? 'dog_treat'
          : k.buyFood
            ? 'food'
            : null,
```
`sources.ts`: `KeyLabels` um `treat: string; food: string;`; `PadSnapshot` um `l1: boolean; r1: boolean;`; `HeldKeys` um `buyTreat: boolean; buyFood: boolean;`; `padToHeld` liefert zusätzlich `buyTreat: s.r1,` `buyFood: s.l1,`; `EdgeTracker` bekommt `private prevTreat = false; private prevFood = false;` und `apply` liefert zusätzlich `buyTreat: h.buyTreat && !this.prevTreat,` `buyFood: h.buyFood && !this.prevFood,` und setzt danach `this.prevTreat = h.buyTreat; this.prevFood = h.buyFood;`.

`devices.ts`:
- Vor der Änderung mit `grep -nE "^\s*(THREE|FOUR|SEMICOLON|QUOTES):" node_modules/phaser/src/input/keyboard/keys/KeyCodes.js` prüfen, dass `THREE`, `FOUR`, `SEMICOLON`, `QUOTES` existieren (Phaser-Tastennamen, `SLASH` war schon einmal falsch). Fehlt einer, den richtigen Namen aus `KeyCodes.js` nehmen und im Bericht nennen.
- `KeyboardLayout` um `buyTreat: string; buyFood: string;` erweitern. Tastatur 1: `buyTreat: 'THREE'`, `buyFood: 'FOUR'`, Labels `treat: '3', food: '4'`. Tastatur 2: `buyTreat: 'SEMICOLON'`, `buyFood: 'QUOTES'`, Labels `treat: ';', food: "'"`.
- `KeyboardSource`: die zwei neuen Tasten in die `addKeys`-Namen aufnehmen, `read()` um `buyTreat: Phaser.Input.Keyboard.JustDown(k[l.buyTreat]),` und `buyFood: Phaser.Input.Keyboard.JustDown(k[l.buyFood]),` ergänzen.
- `GamepadSource`: Snapshot um `l1: pad.L1 > 0.5, r1: pad.R1 > 0.5,` erweitern (Phaser liefert die Schultertasten als Zahl 0 bis 1), `IDLE_PAD` um `l1: false, r1: false`, Labels `treat: 'RB', food: 'LB'`.

- [ ] **Step 3: Alles prüfen**

Run: `npm test && npm run typecheck`
Expected: Client-Tests grün. Der Typecheck kann an `text.ts`/`GameScene` (neue `Mode`-Werte, `KeyLabels`) noch Fehler zeigen, die in Task 7 und 8 behoben werden. Ist er schon sauber, gut. Fehler nur aus diesen Dateien sind für diesen Task kein Blocker, im Bericht nennen.

- [ ] **Step 4: Commit**

```bash
git add packages/client
git commit -m "feat(client): wire treat and food buy keys (keyboard and gamepad shoulders)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: HUD-Texte für Leben, Shop, Warnungen und Zonen

**Files:**
- Modify: `packages/client/src/text.ts`
- Modify (Tests): `packages/client/test/text.test.ts`

**Interfaces:**
- Consumes: `isBeingChecked` aus `core` (Task 4), `GameState.zones`.
- Produces: `statusLines` mit Lebenszeile, `hintLines` mit Essen und Leckerli, `alertText` mit Bewusstlos, Kontrolle und Zonenhinweisen (mehrzeilig, Zeilen mit `\n`).

- [ ] **Step 1: Tests anpassen (rot)**

In `packages/client/test/text.test.ts` (die vorhandenen Konstanten `KEYS`/`KEYS2` bekommen `treat` und `food`: `KEYS = { action: 'E', upgrade: '1', item: '2', steal: 'Q', treat: '3', food: '4' }`, `KEYS2` entsprechend `treat: ';'`, `food: "'"`):
- Test 'shows time, money, container and bottles': `expect(lines).toHaveLength(2)` ersetzen durch `expect(lines).toHaveLength(3); expect(lines[2]).toBe('Leben 100/100');`.
- Test 'shows the item name when carrying one': Erwartung auf `statusLines(s, s.players.p1)[2]` ersetzen durch `'Leben 100/100   Item: Bolzenschneider'`.
- Neue Tests anfügen:
```ts
describe('health and shop', () => {
  it('shows health rounded up, also with fractions', () => {
    const s = shopGame();
    s.players.p1.health = 87.2;
    expect(statusLines(s, s.players.p1)[2]).toBe('Leben 88/100');
  });

  it('offers food and the treat at the shop with the device keys', () => {
    const s = shopGame();
    const lines = hintLines(s, s.players.p1, KEYS);
    expect(lines).toContain('[4] Essen +30 Leben 1,00 €');
    expect(lines).toContain('[3] Leckerli 1,00 €');
    expect(hintLines(s, s.players.p1, KEYS2)).toContain(`[${KEYS2.food}] Essen +30 Leben 1,00 €`);
  });

  it('hides the treat offer when the item slot is taken but still offers food', () => {
    const s = shopGame();
    s.players.p1.item = 'bolt_cutters';
    const lines = hintLines(s, s.players.p1, KEYS);
    expect(lines).toContain('Item-Slot belegt');
    expect(lines.some((l) => l.startsWith('[3]'))).toBe(false);
    expect(lines.some((l) => l.startsWith('[4]'))).toBe(true);
  });
});

describe('more alerts', () => {
  it('shows the remaining unconscious time', () => {
    const s = shopGame();
    s.players.p1.unconsciousMs = 4200;
    expect(alertText(s, s.players.p1)).toContain('Bewusstlos! Noch 5 s');
  });

  it('warns during a police check', () => {
    const s = shopGame();
    s.npcs.push({ id: 0, kind: 'police', x: 30, y: 24, lifeMs: 5000, targetId: 'p1', cooldownMs: 0, distractedMs: 0, checkMs: 300 });
    expect(alertText(s, s.players.p1)).toContain('KONTROLLE! Lauf weg!');
  });

  it('announces zones and shows the active bonus time', () => {
    const s = createGame(1, parseMap(['#####', '#@..#', '#####'], [
      { id: 'a', name: 'Stadion', area: { x0: 0, y0: 0, x1: 10, y1: 10 } },
      { id: 'b', name: 'Konzert', area: { x0: 0, y0: 0, x1: 10, y1: 10 } },
    ]), ['p1']);
    s.zones[0].phase = 'announced';
    s.zones[0].timerMs = 14500;
    s.zones[1].phase = 'active';
    s.zones[1].timerMs = 31000;
    const text = alertText(s, s.players.p1);
    expect(text).toContain('Stadion in 15 s!');
    expect(text).toContain('Konzert: mehr Pfand! Noch 31 s');
  });

  it('puts personal alerts before zone lines', () => {
    const s = createGame(1, parseMap(['#####', '#@..#', '#####'], [
      { id: 'a', name: 'Stadion', area: { x0: 0, y0: 0, x1: 10, y1: 10 } },
    ]), ['p1']);
    s.zones[0].phase = 'announced';
    s.zones[0].timerMs = 5000;
    s.players.p1.shieldMs = 2000;
    const lines = alertText(s, s.players.p1).split('\n');
    expect(lines[0]).toBe('Bestohlen! Schutz 2 s');
    expect(lines[1]).toBe('Stadion in 5 s!');
  });
});
```
Falls die Datei `createGame`, `parseMap` nicht importiert: aus `@pfandraiders/core` importieren (steht dort bereits für `shopGame`).
Run: `npm test -w @pfandraiders/client -- test/text.test.ts`
Expected: FAIL.

- [ ] **Step 2: `text.ts` implementieren**

- Import um `isBeingChecked` aus `@pfandraiders/core` ergänzen.
- `statusLines`: nach den zwei bestehenden Zeilen die Lebenszeile einfügen und die Item-Zeile entfernen:
```ts
  const health = `Leben ${Math.ceil(p.health)}/${CONFIG.health.max}`;
  lines.push(p.item !== null ? `${health}   Item: ${CONFIG.items[p.item].name}` : health);
  return lines;
```
(den bisherigen `if (p.item !== null) lines.push(...)`-Block ersetzen).
- `hintLines` im Shop-Zweig, nach der Bolzenschneider-/"Item-Slot belegt"-Zeile (`lines.push(p.item === null ? ... : 'Item-Slot belegt');`) einfügen:
```ts
    if (p.item === null) {
      lines.push(`[${labels.treat}] ${CONFIG.items.dog_treat.name} ${formatMoney(CONFIG.items.dog_treat.price)}`);
    }
    lines.push(
      `[${labels.food}] Essen +${CONFIG.health.food.heal} Leben ${formatMoney(CONFIG.health.food.price)}`,
    );
```
- `alertText` ersetzen durch:
```ts
export function alertText(state: GameState, p: Player): string {
  const lines: string[] = [];
  if (p.unconsciousMs > 0) lines.push(`Bewusstlos! Noch ${Math.ceil(p.unconsciousMs / 1000)} s`);
  if (isBeingChecked(state, p.id)) lines.push('KONTROLLE! Lauf weg!');
  if (isBeingRobbed(state, p.id)) lines.push('! DU WIRST BESTOHLEN !');
  else if (p.shieldMs > 0) lines.push(`Bestohlen! Schutz ${Math.ceil(p.shieldMs / 1000)} s`);
  for (const z of state.zones) {
    const secs = Math.ceil(z.timerMs / 1000);
    if (z.phase === 'announced') lines.push(`${z.def.name} in ${secs} s!`);
    else if (z.phase === 'active') lines.push(`${z.def.name}: mehr Pfand! Noch ${secs} s`);
  }
  return lines.join('\n');
}
```
Das bestehende Verhalten ('! DU WIRST BESTOHLEN !' bzw. 'Bestohlen! Schutz 3 s' als einzige Zeile, leer sonst) bleibt für Zustände ohne NPCs/Zonen/Bewusstlosigkeit erhalten.

- [ ] **Step 3: Tests und Typecheck**

Run: `npm test && npm run typecheck`
Expected: Client-Tests grün; Typecheck darf nur noch an `GameScene.ts` (Task 8) Fehler haben, falls überhaupt.

- [ ] **Step 4: Commit**

```bash
git add packages/client
git commit -m "feat(client): show health, food and treat offers, knock out, police and zone alerts

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Darstellung von NPCs, Zonen, Bewusstlosigkeit, README

**Files:**
- Modify: `packages/client/src/scenes/GameScene.ts`, `packages/client/src/hud.ts`, `README.md`

**Interfaces:**
- Consumes: alles aus Task 1 bis 7.

Keine Unit-Tests (Phaser). Prüfung: Typecheck, Build, Handtest (Step 5, nur Controller).

- [ ] **Step 1: `hud.ts`: mehrzeilige Warnung**

In `packages/client/src/hud.ts` die Erzeugung von `this.alert` ersetzen durch:
```ts
    this.alert = scene.add
      .text(view.w / 2, ALERT_Y, '', { ...FONT, color: '#ff5252', align: 'center', wordWrap: { width: view.w - 8 } })
      .setOrigin(0.5, 0);
```
Sonst bleibt `hud.ts` unverändert (der Text kommt mehrzeilig aus `alertText`).

- [ ] **Step 2: `GameScene.ts`: NPCs, Zonen, Bewusstlose**

In `packages/client/src/scenes/GameScene.ts`:
- Import erweitern: aus `@pfandraiders/core` zusätzlich `ZoneState` (Typ) und `Npc` (Typ) per `import type`.
- `COLOR` erweitern um `dog: 0x8d6e63, police: 0x1565c0, zoneAnnounced: 0xffee58, zoneActive: 0xff7043`.
- Felder ergänzen:
```ts
  private npcSprites = new Map<number, Phaser.GameObjects.Rectangle>();
  private zoneRects: Phaser.GameObjects.Rectangle[] = [];
  private zoneLabels: Phaser.GameObjects.Text[] = [];
```
- In `create()` nach `this.drawMap(state.map);` einfügen:
```ts
    this.npcSprites = new Map();
    this.zoneRects = [];
    this.zoneLabels = [];
    for (const z of state.zones) {
      const { x0, y0, x1, y1 } = z.def.area;
      this.zoneRects.push(
        this.add.rectangle((x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0, COLOR.zoneActive, 0).setDepth(1),
      );
      this.zoneLabels.push(this.add.text(x0 + 2, y0 + 1, z.def.name, FONT).setDepth(2).setVisible(false));
    }
    if (params.get('events') === 'now') {
      // Testhilfe: NPCs und Zonen sofort statt nach Minuten
      state.nextNpcMs = 2000;
      state.zones.forEach((z, i) => {
        z.timerMs = 3000 + i * 4000;
      });
    }
```
- In `update()` vor der Schleife über die Slots (`this.slots.forEach((slot, i) => {` die zweite, die Körper bewegt) einfügen:
```ts
    this.renderZones(state.zones);
    this.renderNpcs(state.npcs);
```
und in der Slot-Schleife nach `this.bodies[i].setPosition(p.x, p.y);` einfügen `this.bodies[i].setAlpha(p.mode === 'unconscious' ? 0.35 : 1);`.
- Neue Methoden anfügen:
```ts
  private renderZones(zones: ZoneState[]): void {
    zones.forEach((z, i) => {
      const rect = this.zoneRects[i];
      if (z.phase === 'idle') {
        rect.setFillStyle(COLOR.zoneActive, 0);
        this.zoneLabels[i].setVisible(false);
        return;
      }
      rect.setFillStyle(z.phase === 'active' ? COLOR.zoneActive : COLOR.zoneAnnounced, z.phase === 'active' ? 0.28 : 0.16);
      this.zoneLabels[i].setVisible(true);
    });
  }

  private renderNpcs(npcs: Npc[]): void {
    const alive = new Set<number>();
    for (const npc of npcs) {
      alive.add(npc.id);
      let sprite = this.npcSprites.get(npc.id);
      if (!sprite) {
        const dog = npc.kind === 'dog';
        sprite = this.add
          .rectangle(npc.x, npc.y, dog ? 9 : 8, dog ? 6 : 10, dog ? COLOR.dog : COLOR.police)
          .setDepth(4);
        this.npcSprites.set(npc.id, sprite);
      }
      sprite.setPosition(npc.x, npc.y);
      sprite.setAlpha(npc.distractedMs > 0 ? 0.5 : 1);
    }
    for (const [id, sprite] of this.npcSprites) {
      if (alive.has(id)) continue;
      sprite.destroy();
      this.npcSprites.delete(id);
    }
  }
```
- Nichts anderes in der Szene ändern. Keine Regeln im Client.

- [ ] **Step 3: README**

In `README.md` die Steuerungstabelle um zwei Spalten ergänzen: "Leckerli" (Tastatur 1 `3`, Tastatur 2 `;`, Gamepad `RB`) und "Essen" (Tastatur 1 `4`, Tastatur 2 `'`, Gamepad `LB`). Unter dem Steuerungsabsatz einen Abschnitt "Leben und Events" einfügen:

"Leben sinken durch Hunger (1 pro 8 s), Hundebisse (15) und das Umfallen kostet Flaschen, Item und 25 % des Geldes; nach 10 s steht man am Startpunkt wieder auf. Essen im Shop (1,00 €) heilt 30. Hunde beißen zu und lassen sich mit einem Leckerli (1,00 €, wird automatisch eingesetzt, teilt den Item-Slot mit dem Bolzenschneider) ablenken. Polizisten konfiszieren nach 2 s Kontrolle die Hälfte der Flaschen, wer wegläuft, entgeht ihr. Stadion und Konzert laden regelmäßig zu Events ein: 20 s vorher gibt es einen Hinweis, dann liegt dort 60 s lang dreifach so viel Pfand und Spots füllen sich schneller nach."

Im Abschnitt "Testhilfen per URL" `?events=now` ergänzen ("NPCs und Zonen sofort statt nach Minuten").

- [ ] **Step 4: Alles prüfen und committen**

Run: `npm run typecheck && npm test && npm run build`
Expected: grün (Phaser-Chunk-Warnung normal).
```bash
git add packages/client README.md
git commit -m "feat(client): render npcs, event zones and unconscious players

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Handtest im Browser (nur Controller, nicht Implementer)**

`npm run dev`, Seite mit `?seed=1&players=2&events=now&round=300`. Falls die Animationsschleife im eingebetteten Browser steht, `requestAnimationFrame` per `setTimeout` ersetzen wie in den Phasen zuvor.

1. HUD zeigt `Leben 100/100`, das Leben sinkt langsam.
2. Nach ca. 2 s erscheint ein NPC am Rand (Hund braun, Polizist blau). Ein Hund läuft auf den nächsten Spieler zu, beißt, das Leben sinkt um 15, ein Suchbalken bricht ab.
3. Ein Polizist läuft auf einen Spieler mit Flaschen zu, dieser sieht `KONTROLLE! Lauf weg!`. Stillstehen: Hälfte der Flaschen weg. Weglaufen: Kontrolle bricht ab.
4. Am Shop Essen kaufen (Taste `4`/`;`): Leben steigt um 30, Geld sinkt um 1,00 €. Leckerli kaufen (`3`/`;`), vom Hund anlaufen lassen: kein Schaden, Hund bleibt stehen.
5. Nach ca. 3 s kündigt das HUD `Stadion in N s!` an (Zone gelb), nach 20 s ist sie aktiv (orange), die Spots in der Zone sind gefüllt.
6. Leben auf 0 bringen (Hunger oder Bisse abwarten oder `?round=` lang genug): Figur wird blass, `Bewusstlos! Noch N s`, nach 10 s am Startpunkt mit ca. 60 Leben.
7. Echtes Gamepad (falls vorhanden): `RB` Leckerli, `LB` Essen.

Abweichungen im Code beheben, jeden Punkt notieren.

---

## Ende von Phase 3: Abnahme

- [ ] `npm test`, `npm run typecheck`, `npm run build` grün.
- [ ] Handtest Punkte 1 bis 6 erfüllt (7 mit Hardware).
- [ ] Balancing-Eindruck notieren (Hunger 1/8 s, Biss 15, Essen 30 für 1,00 €, Hunde schneller als Wagenfahrer, Zonenfaktor 3). Änderungen nur in `packages/core/src/config.ts`.
- [ ] Danach Plan für Phase 4 (Server und Online) schreiben. Dort gehören hin: Eingabe-Validierung im Core, Reihenfolge-Rotation der Spieler, Snapshot-Projektion (fremde Container, Geld, Items verstecken) und Mapformat `Tiled` bleibt Phase 5.

## Self-Review (Spec-Abdeckung)

- Spec §4 Health (Hunger, Essen, Bewusstlosigkeit 10 s, Respawn, Verlust): Tasks 1 und 2.
- Spec §4 Zufallsevents Hund (jagt, Biss, Leckerli) und Polizei (Kontrolle, Flucht): Task 4.
- Spec §4 Event-Zonen (zeitlich begrenzt, höhere Fundmengen, Ankündigung 20 s vorher): Task 3, Karte in Task 1.
- Spec §6 Phase 3 (Hunde, Polizei, Event-Zonen, Essen, Bewusstlosigkeit): alle Tasks.
- Abweichungen und Ergänzungen sind oben in "Entscheidungen" aufgeführt (Polizei nur Konfiszieren, Leckerli teilt den Item-Slot, Kauf von Essen immer erlaubt, keine aktive Abwehr beim Klauen).
- Typkonsistenz: `Player.health/unconsciousMs/spawn`, `Npc`-Felder, `ZoneState { def, phase, timerMs }`, `Area`, `damage(p, amount)`, `updateHealth(p, dtMs)`, `updateZones(state, dtMs)`, `updateNpcs(state, dtMs)`, `rollContents(rng, type, multiplier)`, `KeyLabels.treat/food`, `BuyCommand` mit `'food'`/`'dog_treat'` sind in allen Tasks gleich benannt.
