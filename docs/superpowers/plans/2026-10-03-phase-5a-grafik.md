# PfandRaiders Phase 5a (Pixelgrafik, Animationen, Tiled-Karte) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das Spiel sieht aus wie ein Retro-Pixelspiel statt aus Rechtecken: gezeichnete Kacheln, Spots, Pfandautomat, Shop, Spieler, Hunde und Polizisten mit Laufanimation. Die Karte wird aus einer Tiled-JSON-Datei geladen statt aus ASCII.

**Architecture:** `core` bekommt `parseTiledMap` (reine Funktion, Tiled-JSON zu `MapData`). Die Stadtkarte liegt als `city.tiled.json` im Repo (erzeugt aus der ASCII-Karte, ein Paritätstest hält beide gleich). Der Client zeichnet die Grafik selbst im Code: Sprites sind Textzeilen mit Palettenzeichen (`pixelart.ts`), eine `BootScene` backt daraus beim Start Phaser-Texturen. Reine Funktionen (`tileKey`, `stepPose`) entscheiden, welche Kachel und welches Einzelbild gezeigt wird, und sind ohne Phaser testbar. `GameScene` ersetzt Rechtecke durch Sprites. Spielregeln, Server und Protokoll bleiben unberührt.

**Tech Stack:** wie bisher. Keine neuen Abhängigkeiten, keine Bilddateien.

**Spec:** `docs/superpowers/specs/2026-10-02-pfandraiders-design.md` §3 (Karte: Tiled-JSON), §6 Phase 5 (Retro-Pixelgrafik). Die Teile "Menüs, Ergebnisbildschirm, Reconnect, Prediction" folgen in Plan 5b.

**Vorarbeit:** Phase 4, Auflösung 960x540 (Weltkameras Zoom 2, UI-Kameras Zoom 1) und Sound sind auf `master`. Arbeit auf Branch `phase-5a-grafik` (bereits angelegt).

## Entscheidungen zum Plan (Spec ist dort still oder ungenau, bitte beim Lesen prüfen)

1. **Grafik im Code:** Pixelmuster als Textzeilen. Zeichen `.` ist transparent, jedes andere Zeichen ist ein Eintrag der Palette. Kein Asset-Pack, keine Dateien, später durch echte PNGs ersetzbar, weil der Rest des Clients nur Texturschlüssel kennt.
2. **Spielerfarbe:** Ein Sprite enthält die Platzhalter `P` (Hauptfarbe) und `Q` (dunklerer Ton, 70 Prozent Helligkeit). Pro Spielerfarbe wird ein Satz Texturen gebacken (`ensurePlayerTextures`). Lokal sind das 4 Farben, online bis 8.
3. **Größen:** Kachel 16x16 (`TILE`). Spieler 12x12 (Hitbox bleibt 10x10, `CONFIG.playerHalf = 5`), Hund 12x8, Polizist 10x14, Spots 12x12, Pfandautomat und Shop 16x16. Alle Figuren werden zentriert auf die Spielposition gesetzt (`origin 0.5`). Der Polizist ragt oben über die Position hinaus, das ist gewollt.
4. **Karte:** Wand-Kacheln, deren südlicher Nachbar Boden ist, bekommen eine Fassade (`wall_front`), die übrigen ein Dach (`wall_top`). Boden und Dach haben je 3 Varianten, gewählt über einen festen Hash von (Spalte, Zeile), nie über Zufall. Die Entscheidung trifft die reine Funktion `tileKey(map, col, row)`.
5. **Animation:** Bewegt sich eine Figur zwischen zwei Frames (Abstand größer als 0,05 px), wechselt sie alle 150 ms zwischen Bild `a` und `b`. Blickrichtung aus der letzten Bewegung (`down`, `up`, `side`, links per `flipX`). Suchen und Klauen wechseln im Stand alle 250 ms zwischen `down a` und `down b`. Bewusstlos zeigt das liegende Bild mit Alpha 0,6. Hunde und Polizisten wechseln beim Laufen alle 150 ms das Bild und blicken in Bewegungsrichtung (`flipX`).
6. **Tiled-Format (eigene Teilmenge, gültiges Tiled-JSON):**
   - `width`, `height`, `tilewidth = tileheight = 16`.
   - Kachelebene `walls`: `data` mit `width*height` Einträgen, `0` = Boden, jede andere Zahl = Wand.
   - Objektebene `objects` mit Punktobjekten (`point: true`, `x`, `y` in Pixeln = Kachelmitte). `type` ist eines von `spawn`, `dropoff`, `shop`, `npc_spawn`, `spot`. Ein `spot` hat die Eigenschaft `spotType` (`bus_stop`, `bench`, `bush`, `bin`, `park`). Die Reihenfolge der Objekte bestimmt die Reihenfolge der Spawns und die Spot-Ids (0, 1, 2, ...).
   - Objektebene `zones` mit Rechtecken (`x`, `y`, `width`, `height` in Pixeln, `name` = Anzeigename, Eigenschaft `zoneId`).
   - Die Stadtkarte bleibt inhaltlich unverändert. Ein Test beweist, dass `parseTiledMap(city.tiled.json)` genau `parseMap(CITY_ROWS, CITY_ZONES)` ergibt, und dass die eingecheckte JSON-Datei dem Generator entspricht.
7. **ASCII bleibt:** `parseMap` und die Testhelfer mit ASCII-Karten bleiben unverändert. Nur `CITY_MAP` kommt aus der JSON-Datei.
8. **Nicht in Plan 5a:** Menüs, Ergebnisbildschirm, Reconnect, Prediction (Plan 5b). Partikel, Bildschirmwackeln, Tag-/Nachtwechsel, mehrere Karten, ein Tiled-Editor-Workflow für Grafik (die Grafik bleibt im Code).

## Global Constraints

- `core` darf weder Phaser noch DOM noch Netzwerk importieren, kein `Math.random`. `parseTiledMap` ist rein.
- Der Client enthält keine Spielregeln. Grafik-Entscheidungen (`tileKey`, `stepPose`) lesen nur den Zustand.
- Weltobjekte, die nach dem Aufbau der UI-Kameras entstehen (NPC-Sprites), müssen in den UI-Kameras ignoriert werden (`ui.ignore(sprite)`). Alles in `create()` vor dem Schnappschuss `worldObjects` gilt automatisch als Welt.
- Alle Spielwerte nur in `core/src/config.ts`. Grafikwerte (Palette, Animationszeiten) stehen im Client in `pixelart.ts` bzw. `pose.ts`.
- Dateien sind UTF-8, Umlaute in Kommentaren und Texten heil (prüfen mit `TextDecoder('utf-8', {fatal: true})`).
- Client-Logiktests dürfen Phaser nicht importieren (`pixelart.ts`, `tiles.ts`, `pose.ts` sind frei von Phaser).
- Commit-Nachrichten enden mit der Zeile `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Alle bestehenden Tests bleiben grün. Die Hitbox und die Spielwerte ändern sich nicht.

## Review Focus

- Kaputte oder bösartige Tiled-Dateien (falsche Länge, unbekannter Objekttyp, fehlende Ebene, Spot ohne Typ, Objekt außerhalb der Karte, Kachelgröße ungleich 16) werfen einen klaren Fehler statt eine halb kaputte Karte zu liefern (Task 1).
- `CITY_MAP` aus JSON ist byte-genau gleich der alten ASCII-Karte, inklusive Reihenfolge von Spawns und Spot-Ids (sonst ändern sich Determinismus-Tests und Server-Verhalten) (Task 2).
- Jedes Sprite hat gleich lange Zeilen und nur Zeichen der Palette bzw. `P`/`Q`/`.` (ein Tippfehler im Pixelmuster fällt im Test auf, nicht erst im Spiel) (Task 3, 4).
- Kein Sprite ist größer als vorgesehen (kein Überstehen über Nachbarkacheln), Figuren liegen weiter auf der Hitbox (Task 3, 4, 6).
- Eine neue Spielerfarbe (online bis zu 8) bekommt ihre Texturen, auch wenn sie nie vorher gebacken wurde, und doppeltes Backen derselben Farbe wirft nicht (Task 5).
- Texturschlüssel kollidieren nicht beim Szenen-Neustart (Neustart nach Rundenende darf nicht erneut backen und nicht werfen) (Task 5).
- Splitscreen und Online zeigen dieselbe Grafik; UI-Kameras zeigen keine Doppelbilder von Figuren oder NPCs (Task 6).
- Animationszustand eines Spielers, der aus der Liste verschwindet oder neu hinzukommt, bricht nichts (Task 6).

---

## File Structure

```
packages/core/
  src/tiled.ts                neu: TiledMap-Typen, parseTiledMap
  src/maps/city.tiled.json    neu: erzeugte Stadtkarte
  src/maps/city.ts            ändern: CITY_MAP aus JSON, CITY_ASCII_MAP für den Test
  src/index.ts                ändern: tiled exportieren
  scripts/asciiToTiled.ts     neu: Generator ASCII zu Tiled-JSON (+ Aufruf per tsx)
  test/tiled.test.ts          neu
  test/city-parity.test.ts    neu
  tsconfig.json               ändern: resolveJsonModule
packages/client/src/
  pixelart.ts                 neu: Palette, decodeSprite, tintPixels (ohne Phaser)
  sprites/tiles.ts            neu: Kachel- und Objekt-Pixelmuster
  sprites/characters.ts       neu: Spieler-, Hund-, Polizei-Pixelmuster
  tiles.ts                    neu: tileKey (reine Kachelwahl)
  pose.ts                     neu: stepPose (reine Animationswahl)
  textures.ts                 neu: Backen der Texturen (Phaser)
  scenes/BootScene.ts         neu
  scenes/GameScene.ts         ändern: Sprites statt Rechtecke
  main.ts                     ändern: BootScene zuerst
packages/client/test/
  pixelart.test.ts  sprites.test.ts  tiles.test.ts  pose.test.ts
```

---

### Task 1: `parseTiledMap` in core

**Files:**
- Create: `packages/core/src/tiled.ts`
- Modify: `packages/core/src/index.ts` (Export)
- Test: `packages/core/test/tiled.test.ts`

**Interfaces:**
- Consumes: `TILE` (`config.ts`), `MapData`, `Point`, `SpotDef`, `SpotType`, `ZoneDef` (`types.ts`).
- Produces: `interface TiledMap`, `parseTiledMap(json: unknown): MapData` (wirft `Error` mit klarer Meldung bei jeder Abweichung vom Format aus Entscheidung 6).

- [ ] **Step 1: Failing test schreiben** (`packages/core/test/tiled.test.ts`)

Hilfsfunktion `base()` liefert eine gültige 4x3-Karte: Rand aus Wänden, innen zwei Bodenkacheln (Spalte 1 und 2, Zeile 1), Ebenen `walls` (`[1,1,1,1, 1,0,0,1, 1,1,1,1]`), `objects` mit einem `spawn` bei (24, 24), einem `spot` (Eigenschaft `spotType: 'bench'`) bei (40, 24), und leerer Ebene `zones`. Tests:

```ts
import { describe, expect, it } from 'vitest';
import { parseTiledMap } from '../src/tiled';

function pt(id: number, type: string, x: number, y: number, props: Record<string, string> = {}) {
  return {
    id, name: '', type, x, y, point: true, width: 0, height: 0,
    properties: Object.entries(props).map(([name, value]) => ({ name, type: 'string', value })),
  };
}
function base() {
  return {
    type: 'map', orientation: 'orthogonal', width: 4, height: 3, tilewidth: 16, tileheight: 16,
    layers: [
      { type: 'tilelayer', name: 'walls', width: 4, height: 3, data: [1, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 1] },
      { type: 'objectgroup', name: 'objects', objects: [pt(1, 'spawn', 24, 24), pt(2, 'spot', 40, 24, { spotType: 'bench' })] },
      { type: 'objectgroup', name: 'zones', objects: [] },
    ],
  };
}

describe('parseTiledMap', () => {
  it('reads walls, spawn and spot', () => {
    const m = parseTiledMap(base());
    expect(m.cols).toBe(4);
    expect(m.rows).toBe(3);
    expect(m.solid).toEqual([true, true, true, true, true, false, false, true, true, true, true, true]);
    expect(m.spawns).toEqual([{ x: 24, y: 24 }]);
    expect(m.spots).toEqual([{ id: 0, type: 'bench', x: 40, y: 24 }]);
    expect(m.dropoffs).toEqual([]);
    expect(m.shops).toEqual([]);
    expect(m.npcSpawns).toEqual([]);
    expect(m.zones).toEqual([]);
  });
  // weitere Tests siehe Step 2
});
```

Weitere Tests im selben Block (alle mit `base()` als Ausgangspunkt, jeweils eine Abweichung):
- dropoff, shop, npc_spawn landen in den richtigen Listen; Spot-Ids zählen in Reihenfolge der Objekte 0, 1, 2; Spawns behalten die Reihenfolge.
- Zone: Objekt `{ type:'zone', name:'Stadion', x:16, y:16, width:32, height:16, properties:[zoneId:'stadium'] }` gibt `{ id:'stadium', name:'Stadion', area:{x0:16,y0:16,x1:48,y1:32} }`.
- Wirft (mit `toThrow(/…/)` auf ein aussagekräftiges Wort): kein Objekt (`parseTiledMap(null)`, `'x'`, `42`), `tilewidth` 32, `width` passt nicht zur Datenlänge, `data` mit Nicht-Zahl, fehlende Ebene `walls`, fehlende Ebene `objects`, unbekannter Objekttyp `'tree'`, Spot ohne `spotType`, Spot mit `spotType: 'cactus'`, Punktobjekt außerhalb der Karte (x = 4*16 oder y < 0), Zone ohne `zoneId`, Zone mit Breite 0, Zone ragt aus der Karte, doppelte `zoneId`, Punkt (`x`, `y`) nicht endlich (`NaN`, `Infinity`).
- `__proto__` als Eigenschaftsname bricht nichts (Eigenschaften werden nur nach Namen `spotType` und `zoneId` gesucht).

- [ ] **Step 2: Test laufen lassen, muss fehlschlagen** (`npm test -w @pfandraiders/core -- tiled`): "Cannot find module '../src/tiled'".

- [ ] **Step 3: Implementieren** (`packages/core/src/tiled.ts`)

```ts
import { TILE } from './config';
import type { MapData, Point, SpotDef, SpotType, ZoneDef } from './types';

export interface TiledProperty { name: string; type?: string; value: unknown }
export interface TiledObject {
  id: number; name: string; type: string; x: number; y: number;
  width?: number; height?: number; point?: boolean; properties?: TiledProperty[];
}
export type TiledLayer =
  | { type: 'tilelayer'; name: string; width: number; height: number; data: number[] }
  | { type: 'objectgroup'; name: string; objects: TiledObject[] };
export interface TiledMap {
  type: 'map'; orientation: 'orthogonal'; width: number; height: number;
  tilewidth: number; tileheight: number; layers: TiledLayer[];
}

const SPOT_TYPES: readonly SpotType[] = ['bus_stop', 'bench', 'bush', 'bin', 'park'];

function fail(msg: string): never {
  throw new Error(`invalid tiled map: ${msg}`);
}
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function finite(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(`${what} must be a finite number`);
  return v;
}
function prop(o: Record<string, unknown>, name: string): unknown {
  const list = o.properties;
  if (!Array.isArray(list)) return undefined;
  for (const p of list) if (isRecord(p) && p.name === name) return p.value;
  return undefined;
}
function layer(layers: unknown[], name: string, type: string): Record<string, unknown> {
  const l = layers.find((x) => isRecord(x) && x.name === name && x.type === type);
  if (!l || !isRecord(l)) fail(`missing ${type} "${name}"`);
  return l;
}

/** Liest eine Karte im Tiled-JSON-Format (Teilmenge, siehe Plan). Wirft bei jeder Abweichung. */
export function parseTiledMap(json: unknown): MapData {
  if (!isRecord(json)) fail('not an object');
  const cols = finite(json.width, 'width');
  const rows = finite(json.height, 'height');
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1) fail('bad size');
  if (json.tilewidth !== TILE || json.tileheight !== TILE) fail(`tile size must be ${TILE}`);
  if (!Array.isArray(json.layers)) fail('layers must be an array');

  const wallLayer = layer(json.layers, 'walls', 'tilelayer');
  const data = wallLayer.data;
  if (!Array.isArray(data) || data.length !== cols * rows) fail('walls data length does not match width*height');
  const solid = data.map((g) => finite(g, 'wall tile') !== 0);

  const w = cols * TILE;
  const h = rows * TILE;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h;

  const spots: SpotDef[] = [];
  const dropoffs: Point[] = [];
  const shops: Point[] = [];
  const spawns: Point[] = [];
  const npcSpawns: Point[] = [];
  const objects = layer(json.layers, 'objects', 'objectgroup').objects;
  if (!Array.isArray(objects)) fail('objects must be an array');
  for (const o of objects) {
    if (!isRecord(o)) fail('object is not an object');
    const x = finite(o.x, 'object x');
    const y = finite(o.y, 'object y');
    if (!inside(x, y)) fail(`object at (${x}, ${y}) is outside the map`);
    const at = { x, y };
    switch (o.type) {
      case 'spawn': spawns.push(at); break;
      case 'dropoff': dropoffs.push(at); break;
      case 'shop': shops.push(at); break;
      case 'npc_spawn': npcSpawns.push(at); break;
      case 'spot': {
        const t = prop(o, 'spotType');
        if (typeof t !== 'string' || !SPOT_TYPES.includes(t as SpotType)) fail(`unknown spotType ${String(t)}`);
        spots.push({ id: spots.length, type: t as SpotType, ...at });
        break;
      }
      default: fail(`unknown object type ${String(o.type)}`);
    }
  }

  const zones: ZoneDef[] = [];
  const zoneObjects = layer(json.layers, 'zones', 'objectgroup').objects;
  if (!Array.isArray(zoneObjects)) fail('zones must be an array');
  for (const z of zoneObjects) {
    if (!isRecord(z)) fail('zone is not an object');
    const id = prop(z, 'zoneId');
    if (typeof id !== 'string' || id === '') fail('zone without zoneId');
    if (zones.some((q) => q.id === id)) fail(`duplicate zoneId ${id}`);
    const x0 = finite(z.x, 'zone x');
    const y0 = finite(z.y, 'zone y');
    const x1 = x0 + finite(z.width, 'zone width');
    const y1 = y0 + finite(z.height, 'zone height');
    if (!(x1 > x0 && y1 > y0)) fail(`zone ${id} is empty`);
    if (x0 < 0 || y0 < 0 || x1 > w || y1 > h) fail(`zone ${id} leaves the map`);
    zones.push({ id, name: typeof z.name === 'string' ? z.name : id, area: { x0, y0, x1, y1 } });
  }

  return { cols, rows, solid, spots, dropoffs, shops, spawns, npcSpawns, zones };
}
```

In `index.ts` `export * from './tiled';` nach `./map` ergänzen.

- [ ] **Step 4: Tests laufen lassen**: `npm test -w @pfandraiders/core` und `npm run typecheck`, alles grün.
- [ ] **Step 5: Commit** `feat(core): add parseTiledMap`.

---

### Task 2: Stadtkarte als Tiled-JSON

**Files:**
- Create: `packages/core/scripts/asciiToTiled.ts`, `packages/core/src/maps/city.tiled.json`
- Modify: `packages/core/src/maps/city.ts`, `packages/core/tsconfig.json` (`"resolveJsonModule": true` unter `compilerOptions`; die Datei erweitert bisher nur die Basis, also einen `compilerOptions`-Block ergänzen)
- Test: `packages/core/test/city-parity.test.ts`

**Interfaces:**
- Consumes: `parseTiledMap`, `TiledMap` (Task 1), `parseMap`, `TILE`, `ZoneDef`.
- Produces: `asciiToTiled(rows: string[], zones: ZoneDef[]): TiledMap` (exportiert aus `scripts/asciiToTiled.ts`); `CITY_ASCII_MAP` (MapData aus ASCII, nur Referenz für Tests); `CITY_MAP` kommt jetzt aus der JSON-Datei, gleiche Form wie vorher.

- [ ] **Step 1: Generator schreiben** (`packages/core/scripts/asciiToTiled.ts`)

`asciiToTiled(rows, zones)` baut das Objekt aus Entscheidung 6. Reihenfolge der Objekte: zeilenweise, spaltenweise durch die ASCII-Zeilen, genau wie `parseMap` sie findet (damit Spawn- und Spot-Reihenfolge gleich sind). Zeichen: `#` Wand (Datenwert 1), `@` spawn, `D` dropoff, `S` shop, `N` npc_spawn, `b n g m p` spot mit `spotType` `bus_stop bench bush bin park`. Punkt = Kachelmitte `(c*TILE+TILE/2, r*TILE+TILE/2)`. Objekt-`id` zählt ab 1 hoch. Zonen: je Zone ein Objekt `{ id, name, type: 'zone', x: x0, y: y0, width: x1-x0, height: y1-y0, properties: [{name:'zoneId', type:'string', value: z.id}] }`. Punktobjekte haben `point: true`, `width: 0`, `height: 0`, `rotation: 0`, `visible: true`. Wirf bei unbekanntem Zeichen. Am Dateiende ein Hauptteil, der nur läuft, wenn die Datei direkt per `tsx` aufgerufen wird (`import.meta.url`-Vergleich mit `process.argv[1]` als `file://`-URL, achte auf Windows-Pfade, nimm `fileURLToPath`), importiert `CITY_ROWS` und `CITY_ZONES` aus `../src/maps/city` und schreibt `JSON.stringify(tiled, null, 1) + '\n'` nach `src/maps/city.tiled.json`. Die Hauptteil-Logik darf nicht beim Import durch den Test laufen.

Vermeide einen Importzyklus: `CITY_ROWS` und `CITY_ZONES` ziehen aus `city.ts` in eine neue Datei `packages/core/src/maps/city-ascii.ts` um (reine Daten, importiert nur den Typ `ZoneDef`). Der Generator importiert von dort. `city.ts` exportiert sie nicht erneut; `index.ts` exportiert zusätzlich `./maps/city-ascii`, damit `CITY_ROWS` aus `@pfandraiders/core` erreichbar bleibt. Prüfe mit Grep alle bisherigen Importeure von `CITY_ROWS` und `CITY_ZONES` und passe sie an. Lege `city-ascii.ts` an, bevor du den Generator zum ersten Mal ausführst.

- [ ] **Step 2: JSON erzeugen**: `npx tsx packages/core/scripts/asciiToTiled.ts` (tsx liegt im Root-`node_modules`). Prüfe, dass die Datei 32x20 Daten hat, 17 Spots, 4 Spawns.
- [ ] **Step 3: `city.ts` umstellen**

```ts
import { parseMap } from '../map';
import { parseTiledMap } from '../tiled';
import cityJson from './city.tiled.json';
import { CITY_ROWS, CITY_ZONES } from './city-ascii';

/** Die Stadt, geladen aus `city.tiled.json` (erzeugt aus `city-ascii.ts`, siehe scripts/asciiToTiled.ts). */
export const CITY_MAP = parseTiledMap(cityJson);
/** Dieselbe Karte direkt aus ASCII, nur als Referenz für den Paritätstest. */
export const CITY_ASCII_MAP = parseMap(CITY_ROWS, CITY_ZONES);
```

- [ ] **Step 4: Paritätstest** (`packages/core/test/city-parity.test.ts`)
  - `expect(CITY_MAP).toEqual(CITY_ASCII_MAP)` (tiefer Vergleich, damit Reihenfolge von Spawns und Spot-Ids stimmt).
  - `expect(cityJson).toEqual(asciiToTiled(CITY_ROWS, CITY_ZONES))` (die eingecheckte Datei ist nicht veraltet); importiere `cityJson` mit `import cityJson from '../src/maps/city.tiled.json'`.
  - `asciiToTiled` wirft bei unbekanntem Zeichen (`['#x#']`).
  - Die vorhandenen Tests (`city.test.ts`, Determinismus, Server) bleiben unverändert grün.
- [ ] **Step 5: Alles laufen lassen**: `npm test` (alle drei Pakete), `npm run typecheck`, `npm run build`, `npm run build:server`. Der Server-Bundle muss die JSON-Datei enthalten (esbuild löst JSON-Importe auf; starte `node packages/server/dist/server.cjs` kurz mit `PORT=0`-ähnlichem Aufruf oder prüfe per `grep -c "bus_stop" packages/server/dist/server.cjs`).
- [ ] **Step 6: Commit** `feat(core): load the city map from Tiled JSON`.

---

### Task 3: Pixelart-Grundlage und Kachel- und Objektgrafik

**Files:**
- Create: `packages/client/src/pixelart.ts`, `packages/client/src/sprites/tiles.ts`, `packages/client/src/tiles.ts`
- Test: `packages/client/test/pixelart.test.ts`, `packages/client/test/sprites.test.ts`, `packages/client/test/tiles.test.ts`

**Interfaces:**
- Consumes: `MapData` und `TILE` aus `@pfandraiders/core`.
- Produces:
  - `pixelart.ts`: `PALETTE: Record<string, number>`, `interface Decoded { w: number; h: number; px: (number | null)[] }` (Länge `w*h`, Farbe `0xRRGGBB` oder `null`), `decodeSprite(rows: readonly string[], tint?: number): Decoded` (wirft bei ungleichen Zeilen, leerem Sprite oder unbekanntem Zeichen), `shade(color: number, factor: number): number`.
  - `sprites/tiles.ts`: `export const TILE_SPRITES: Record<string, readonly string[]>`, `export const SPOT_SPRITES: Record<SpotType, { full: readonly string[]; empty: readonly string[] }>`, `export const OBJECT_SPRITES: { dropoff: readonly string[]; shop: readonly string[] }`.
  - `tiles.ts`: `type TileKey = 'floor_0'|'floor_1'|'floor_2'|'wall_top_0'|'wall_top_1'|'wall_top_2'|'wall_front'`, `tileKey(map: MapData, col: number, row: number): TileKey`.

- [ ] **Step 1: Palette und Dekoder** (`pixelart.ts`)

```ts
/** Palette der Pixelgrafik. `.` ist immer transparent, `P` und `Q` sind die Spielerfarbe (Haupt- und Schattenton). */
export const PALETTE: Record<string, number> = {
  k: 0x1b1b1f, // Umriss
  w: 0xffffff,
  g: 0x9e9e9e, // Pflaster
  G: 0x8a8a8a, // Pflaster dunkel
  h: 0xb0b0b0, // Pflaster hell
  r: 0x37474f, // Dach
  R: 0x2b3a42, // Dach dunkel
  t: 0x546e7a, // Dach hell
  f: 0x8d6e63, // Fassade
  F: 0x6d4c41, // Fassade dunkel
  y: 0xffca28, // Gelb
  o: 0xff9800, // Orange
  b: 0x42a5f5, // Blau
  B: 0x1565c0, // Dunkelblau
  e: 0x66bb6a, // Grün
  E: 0x2e7d32, // Dunkelgrün
  n: 0x795548, // Braun
  N: 0x4e342e, // Dunkelbraun
  s: 0xffcc99, // Haut
  d: 0xe0e0e0, // Hellgrau
  c: 0xc62828, // Rot
};
```

`shade(color, factor)` multipliziert jeden Kanal mit `factor` und rundet, begrenzt auf 255. `decodeSprite(rows, tint)`: `P` wird zu `tint` (fehlt `tint`, wirft bei `P`), `Q` zu `shade(tint, 0.7)`, `.` zu `null`, sonst Palette, sonst Fehler mit Zeichen, Zeile und Spalte in der Meldung. Alle Zeilen müssen gleich lang sein (Fehler sonst), mindestens 1x1.

- [ ] **Step 2: `pixelart.test.ts`**: `shade` (Faktor 1 = gleich, 0,5 halbiert, Begrenzung), `decodeSprite` (Größe, transparente Pixel `null`, Palettenfarbe, `P`/`Q` mit Tint, `P` ohne Tint wirft, unbekanntes Zeichen wirft und nennt das Zeichen, ungleiche Zeilen werfen, leer wirft).

- [ ] **Step 3: Kachelwahl** (`tiles.ts`, rein, ohne Phaser)

```ts
import type { MapData } from '@pfandraiders/core';

export type TileKey =
  | 'floor_0' | 'floor_1' | 'floor_2'
  | 'wall_top_0' | 'wall_top_1' | 'wall_top_2'
  | 'wall_front';

/** Fester Hash aus Spalte und Zeile, kein Zufall: dieselbe Karte sieht immer gleich aus. */
function variant(col: number, row: number): 0 | 1 | 2 {
  return ((Math.imul(col, 73856093) ^ Math.imul(row, 19349663)) >>> 0) % 3 as 0 | 1 | 2;
}

export function tileKey(map: MapData, col: number, row: number): TileKey {
  const solid = (c: number, r: number) =>
    c < 0 || r < 0 || c >= map.cols || r >= map.rows || map.solid[r * map.cols + c];
  const v = variant(col, row);
  if (!solid(col, row)) return `floor_${v}`;
  return !solid(col, row + 1) ? 'wall_front' : `wall_top_${v}`;
}
```

`tiles.test.ts`: Karte aus `parseMap`-Zeilen; Boden gibt `floor_*`; Wand mit Boden darunter `wall_front`; Wand mit Wand darunter `wall_top_*`; Wand in der letzten Zeile (außerhalb darunter gilt als Wand) `wall_top_*`; Ergebnis ist bei gleichem Aufruf gleich; alle drei Varianten kommen auf der Stadtkarte (`CITY_MAP`) vor; es gibt auf der Stadtkarte mindestens eine `wall_front`.

- [ ] **Step 4: Pixelmuster** (`sprites/tiles.ts`). Zeichne mit der Palette (ändere die Palette nur, wenn nötig, und dann nur durch Anhängen neuer Zeichen):
  - `TILE_SPRITES`: `floor_0`, `floor_1`, `floor_2` (16x16 Pflaster mit leichten Fugen und Variation, ruhig, nicht flimmernd), `wall_top_0..2` (16x16 Dach, Variation), `wall_front` (16x16 Fassade mit Fenster oder Tür, Unterkante dunkel).
  - `SPOT_SPRITES`: je Typ `bus_stop`, `bench`, `bush`, `bin`, `park` eine `full`- und eine `empty`-Variante, 12x12, auf transparentem Grund. `full` zeigt erkennbar Flaschen (grün/gelb/weiß Pixelgruppen), `empty` dasselbe Objekt ohne Flaschen. Die Typen müssen unterscheidbar sein (Bushaltestelle mit Dach und Schild, Bank, Busch grün, Mülleimer grau mit Deckel, Park-Rasenfleck mit Baum).
  - `OBJECT_SPRITES.dropoff` (Pfandautomat, 16x16, blau mit Klappe und Display), `OBJECT_SPRITES.shop` (Kiosk, 16x16, gelbes Dach).
  - Ausgangsbeispiel (so soll ein Eintrag aussehen, Pixelwahl ist deine):
    ```ts
    floor_0: [
      'gggggggggggggggg',
      'gggggggghggggggg',
      'ggggggggggggGggg',
      // ... insgesamt 16 Zeilen à 16 Zeichen
    ],
    ```
- [ ] **Step 5: `sprites.test.ts`**: für jeden Eintrag in `TILE_SPRITES`, `SPOT_SPRITES`, `OBJECT_SPRITES` gilt: `decodeSprite` wirft nicht (mit Tint `0xff0000` übergeben, damit `P` nicht stört), Größe ist die vorgesehene (Kacheln und Objekte 16x16, Spots 12x12), mindestens ein nicht transparentes Pixel, Kacheln (Boden, Dach, Fassade) haben keine transparenten Pixel, `full` und `empty` eines Spots sind verschieden, alle fünf Spot-Typen aus `SpotType` sind vorhanden (typsicher über `Record<SpotType, …>`), alle sieben `TileKey`-Schlüssel sind vorhanden.
- [ ] **Step 6: Tests, Typecheck, Build grün; Commit** `feat(client): add pixel-art decoding and tile and object sprites`.

---

### Task 4: Figurengrafik und Animationswahl

**Files:**
- Create: `packages/client/src/sprites/characters.ts`, `packages/client/src/pose.ts`
- Test: `packages/client/test/sprites.test.ts` (erweitern), `packages/client/test/pose.test.ts`

**Interfaces:**
- Consumes: `decodeSprite` (Task 3), `Player`, `Npc`, `Mode` aus `@pfandraiders/core`.
- Produces:
  - `sprites/characters.ts`: `type PlayerFrame = 'down_a'|'down_b'|'up_a'|'up_b'|'side_a'|'side_b'|'lying'`; `PLAYER_SPRITES: Record<PlayerFrame, readonly string[]>` (12x12, mit `P`/`Q`); `DOG_SPRITES: Record<'a'|'b', readonly string[]>` (12x8); `POLICE_SPRITES: Record<'a'|'b', readonly string[]>` (10x14).
  - `pose.ts`: `type Facing = 'down'|'up'|'side'`; `interface PoseState { x: number; y: number; facing: Facing; flipX: boolean; walkMs: number }`; `interface Pose { frame: PlayerFrame; flipX: boolean }`; `initialPose(x: number, y: number): PoseState`; `stepPose(prev: PoseState, x: number, y: number, mode: Mode, dtMs: number): { state: PoseState; pose: Pose }`; `npcFrame(prev: PoseState, x: number, y: number, dtMs: number): { state: PoseState; frame: 'a' | 'b'; flipX: boolean }`.

Konstanten in `pose.ts`: `MOVE_EPSILON = 0.05` (Pixel pro Frame), `WALK_FRAME_MS = 150`, `ACTION_FRAME_MS = 250`.

Regeln von `stepPose` (der Test legt sie fest):
1. `dx = x - prev.x`, `dy = y - prev.y`. Bewegt, wenn `Math.hypot(dx, dy) > MOVE_EPSILON`.
2. Blickrichtung, wenn bewegt: ist `|dx| > |dy|` dann `side` und `flipX = dx < 0`; sonst `dy > 0` gleich `down`, `dy < 0` gleich `up`. Ohne Bewegung bleibt die Blickrichtung. `flipX` wird nur bei `side` gesetzt, sonst `false`.
3. `walkMs`: bewegt: `prev.walkMs + dtMs`, nicht bewegt: `0`. Bildwahl bewegt: `Math.floor(walkMs / WALK_FRAME_MS) % 2 === 0 ? 'a' : 'b'`.
4. `mode === 'unconscious'`: `frame = 'lying'`, Blickrichtung bleibt, `walkMs = 0`.
5. `mode === 'searching' || mode === 'stealing'` und nicht bewegt: `down`, abwechselnd `a`/`b` nach `ACTION_FRAME_MS` (dazu zählt `walkMs` weiter: bei diesen Modi nicht bewegt gilt `walkMs = prev.walkMs + dtMs`, das Bild wird dann mit `ACTION_FRAME_MS` gewählt; bewegt gilt Regel 3).
6. Sonst im Stand: `<facing>_a`.
7. `dtMs` nicht endlich oder negativ zählt als 0.

`npcFrame`: gleiche Bewegungsregel (bewegt über `MOVE_EPSILON`), Bild `a`/`b` alle `WALK_FRAME_MS` beim Laufen, im Stand `a`, `flipX` wenn die letzte horizontale Bewegung nach links ging (`dx < 0` setzt `true`, `dx > 0` setzt `false`, sonst bleibt der Wert).

- [ ] **Step 1: `pose.test.ts` schreiben** mit Tests für jede der sieben Regeln, dazu: Start `initialPose` blickt `down`, Stand zeigt `down_a`; Bewegung nach rechts gibt `side_a` ohne Flip, dann nach 150 ms `side_b`, nach 300 ms wieder `side_a`; nach links `flipX true`; nach oben `up_*`; Stillstand setzt `walkMs` zurück und behält die Richtung; `unconscious` gibt `lying`; `searching` im Stand wechselt nach 250 ms auf `down_b`; `searching` mit Bewegung (Hund beißt, Figur wird weggeschoben) nutzt Regel 3; `NaN`-dt wirft nicht und zählt 0; `npcFrame` wechselt, flippt und bleibt stabil im Stand.
- [ ] **Step 2: Fehlschlag sehen, `pose.ts` implementieren, grün.**
- [ ] **Step 3: Pixelmuster** (`sprites/characters.ts`): Spielerfigur mit Kopf (Hautfarbe `s`), Körper in `P` mit `Q`-Schatten, Umriss `k`; `down` mit Gesicht, `up` mit Hinterkopf, `side` mit Profil; `_a` und `_b` unterscheiden sich in den Beinen (Schritt). `lying`: Figur seitlich liegend (breiter als hoch, im 12x12 Raster unten angeordnet). Hund 12x8: Körper braun (`n`, `N`), Schwanz, Beine in `a`/`b` versetzt, Blick nach rechts (links per `flipX`). Polizist 10x14: blaue Uniform (`b`, `B`), Mütze, Hautton, Beine in `a`/`b`; ein Bild genügt für alle Richtungen (`flipX` nach Bewegung).
- [ ] **Step 4: `sprites.test.ts` erweitern**: alle `PLAYER_SPRITES` sind 12x12 und enthalten `P`; die zwei Bilder eines Paars (`down_a`/`down_b` usw.) sind verschieden; `DOG_SPRITES` 12x8; `POLICE_SPRITES` 10x14; alle dekodieren mit Tint ohne Fehler; kein Spielersprite hat Pixel auf der äußersten Randzeile außer `lying` (Figuren überragen die 12x12 nicht).
- [ ] **Step 5: Tests, Typecheck, Build grün; Commit** `feat(client): add character sprites and pose selection`.

---

### Task 5: Texturen backen und BootScene

**Files:**
- Create: `packages/client/src/textures.ts`, `packages/client/src/scenes/BootScene.ts`
- Modify: `packages/client/src/main.ts`

**Interfaces:**
- Consumes: `decodeSprite`, alle Sprite-Tabellen, `TileKey`, `PlayerFrame`, `SpotType`.
- Produces (Phaser, keine Unit-Tests, Prüfung per Typecheck, Build und Handtest durch den Controller):
  - Schlüssel-Hilfsfunktionen (rein, getestet in `packages/client/test/textureKeys.test.ts`): `tileTexture(key: TileKey): string` = `` `tile:${key}` ``, `spotTexture(type: SpotType, full: boolean): string` = `` `spot:${type}:${full ? 'full' : 'empty'}` ``, `objectTexture(name: 'dropoff' | 'shop'): string` = `` `object:${name}` ``, `playerTexture(color: number, frame: PlayerFrame): string` = `` `player:${color.toString(16).padStart(6, '0')}:${frame}` ``, `dogTexture(f: 'a'|'b'): string`, `policeTexture(f: 'a'|'b'): string` (`dog:a`, `police:b`). Lege sie in eine eigene Datei `textureKeys.ts` ohne Phaser.
  - `textures.ts`: `bakeStaticTextures(scene: Phaser.Scene): void` (Kacheln, Spots, Objekte, Hund, Polizei; macht nichts, wenn `scene.textures.exists('tile:floor_0')`), `ensurePlayerTextures(scene: Phaser.Scene, color: number): void` (backt alle `PlayerFrame`-Bilder dieser Farbe, nur wenn noch nicht vorhanden).
  - `BootScene` (Schlüssel `'boot'`): `create()` ruft `bakeStaticTextures(this)` und `this.scene.start('lobby')`.

- [ ] **Step 1: `textureKeys.ts` und Test** (alle Schlüssel haben das erwartete Format; Farbe `0xef5350` gibt `player:ef5350:down_a`; kleine Farben werden auf 6 Stellen aufgefüllt).
- [ ] **Step 2: `textures.ts`**: ein privater Helfer `bake(scene, key, decoded)`: `if (scene.textures.exists(key)) return; const tex = scene.textures.createCanvas(key, w, h); const ctx = tex.getContext(); für jedes nicht-null Pixel ctx.fillStyle = '#rrggbb'; ctx.fillRect(x, y, 1, 1); tex.refresh();`. Prüfe, dass `createCanvas` bei Phaser 3.90 `CanvasTexture | null` liefert, und behandle `null` (nichts tun). Kein `setFilter` nötig (`pixelArt: true` setzt NEAREST).
- [ ] **Step 3: `BootScene.ts` und `main.ts`**: `scene: [BootScene, LobbyScene, GameScene]`. Prüfe, dass `LobbyScene` und `GameScene` weiter ihre Schlüssel `'lobby'` und `'game'` haben und dass die Testhilfe-Pfade (`?players=`) weiter funktionieren (die Lobby startet bei Bedarf direkt das Spiel; die Texturen sind dann schon gebacken, weil `BootScene` zuerst läuft).
- [ ] **Step 4: Typecheck, Tests, Build grün; Commit** `feat(client): bake pixel-art textures in a boot scene`.

---

### Task 6: GameScene zeigt die Grafik

**Files:**
- Modify: `packages/client/src/scenes/GameScene.ts`

**Interfaces:**
- Consumes: `tileKey`, `tileTexture`, `spotTexture`, `objectTexture`, `playerTexture`, `dogTexture`, `policeTexture`, `ensurePlayerTextures`, `initialPose`, `stepPose`, `npcFrame`, `PoseState`.
- Produces: keine neuen öffentlichen Schnittstellen.

Änderungen (alle in `GameScene.ts`):
1. `drawMap`: statt der `Graphics`-Rechtecke je Kachel ein Bild `this.add.image(c*TILE + TILE/2, r*TILE + TILE/2, tileTexture(tileKey(map, c, r)))`. Weil das 640 Bilder sind, lege sie in einen `Phaser.GameObjects.Container`? Nein: nutze `this.add.renderTexture`/`DynamicTexture` nicht. Einfach und ausreichend: 640 `Image`-Objekte. Tiefe 0. Pfandautomat und Shop: `this.add.image(x, y, objectTexture(...))` statt farbiger Rechtecke; Beschriftungen `PFAND` und `SHOP` bleiben als Text darüber.
2. Spots: `this.add.image(spot.x, spot.y, spotTexture(spot.type, true))` statt Rechteck, `spotRects` wird zu `spotSprites: Phaser.GameObjects.Image[]`; in `update` `setTexture(spotTexture(type, totalBottles > 0))`, nur wenn sich der Zustand geändert hat (Zustand in einem `boolean[]` merken, um nicht jeden Frame `setTexture` zu rufen).
3. Spieler: für jede Spielerfarbe `ensurePlayerTextures(this, color)` aufrufen (vor dem Anlegen der Sprites, in `create`), `bodies` wird zu `Map<string, Phaser.GameObjects.Image>`; Textur `playerTexture(color, 'down_a')`; Tiefe 5 wie bisher. Pro Spieler ein `PoseState` in `Map<string, PoseState>` (angelegt mit `initialPose(p.x, p.y)`). Jeden Frame: `const { state, pose } = stepPose(prev, p.x, p.y, p.mode, delta)`; `body.setTexture(playerTexture(color, pose.frame)).setFlipX(pose.flipX)`; `setAlpha(p.mode === 'unconscious' ? 0.6 : 1)`. Farbe je Spieler aus `playerColors` (Fallback weiß, `ensurePlayerTextures(this, 0xffffff)` für den Fallback).
4. `startFollow(body)` und `ignore`-Logik funktionieren mit `Image` genauso; prüfe, dass `worldObjects = [...this.children.list]` weiterhin alle Weltbilder enthält (sie entstehen vor dem Schnappschuss).
5. NPCs: statt `Rectangle` ein `Image` mit `dogTexture('a')` bzw. `policeTexture('a')`; ein `Map<number, PoseState>` für `npcFrame`; Bild und `flipX` pro Frame setzen; Alpha 0,5 bei `distractedMs > 0` wie bisher; weiter `ui.ignore(sprite)` für jeden neuen NPC; beim Löschen auch den Pose-Eintrag entfernen.
6. Die Warnmarke `!` und die Zonen-Rechtecke bleiben unverändert.
7. Wenn ein Spieler beim Neustart (`scene.restart`) wieder angelegt wird, werden die Pose-Maps in `create()` neu aufgebaut (nicht aus dem vorigen Durchlauf übernehmen).
8. Prüfe, dass die Konstanten `COLOR.wall`, `COLOR.floor`, `COLOR.spotFull`, `COLOR.spotEmpty`, `COLOR.dropoff`, `COLOR.shop`, `COLOR.dog`, `COLOR.police` nicht mehr gebraucht werden, und entferne ungenutzte (Zonenfarben bleiben).

- [ ] **Step 1: Umsetzen.** Keine neuen Unit-Tests (Phaser); die reine Logik ist in Task 3 und 4 getestet.
- [ ] **Step 2: `npm run typecheck`, `npm test`, `npm run build` grün.**
- [ ] **Step 3: Handtest durch den Controller** (nicht der Implementierer): lokal mit 2 Spielern, `?events=now` (Hunde, Polizei, Zonen sichtbar), Spieler laufen lassen (Animation wechselt, Richtung stimmt), suchen (Wechsel im Stand), Spot leert sich (Textur wechselt), bewusstlos (liegend), Neustart nach Rundenende (keine Fehlermeldung in der Konsole, Grafik bleibt), dann online mit 2 Tabs (andere Spielerfarben, Fremdfiguren animiert). Pixelgrafik von Hand beurteilen: erkennbar, nicht flimmernd, Spots unterscheidbar.
- [ ] **Step 4: Commit** `feat(client): draw tiles, spots and characters as pixel art`.

---

## Self-Review

- **Spec-Abdeckung:** Tiled-JSON-Karte (Tasks 1, 2), Retro-Pixelgrafik (Tasks 3, 4, 5, 6), Animationen (Task 4, 6). Menüs, Ergebnisbildschirm, Reconnect, Prediction gehören zu Plan 5b.
- **Platzhalter:** Die Pixelmuster selbst sind bewusst Aufgabe des Implementierers (Gestaltung), aber durch Größen, Palette und Tests streng begrenzt. Alle Logik ist als Code oder als Regelliste mit Testfällen angegeben.
- **Typkonsistenz:** `TileKey`, `PlayerFrame`, `Facing`, `PoseState` werden in Task 3/4 definiert und in Task 5/6 mit denselben Namen genutzt. Schlüssel-Funktionen stehen in `textureKeys.ts` (Task 5) und werden nur in Task 5 und 6 verwendet.
- **Review Focus:** Jede Zeile hat einen Test in Task 1 bis 4 (Fehlerfälle, Parität, Spriteformate) oder eine Handtest-Prüfung in Task 6 (Kameras, Neustart).
