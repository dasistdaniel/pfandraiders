# Eigene Karten: Registrierung und Kartenwahl – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jede Tiled-Datei in `packages/core/src/maps/custom/` wird nach `npm run maps` zu einer streng geprüften, lokal und online wählbaren Karte; der Host wählt die Karte in der Online-Lobby, die Raumliste zeigt sie, das lokale Spiel merkt sich die Wahl.

**Architecture:** Der Kern bekommt ein Blatt-Modul mit Kennungsregeln (`maps/mapIds.ts`), eine Prüffunktion `validateTiledMap` (`maps/validate.ts`, sammelt deutsche Problemsätze), die Registrierung eigener Karten (`maps/customMaps.ts`) und eine generierte, committete Importliste `maps/custom/index.ts`, die das Skript `npm run maps` (`scripts/generateCustomMaps.ts` mit reinem Teil `scripts/customIndex.ts`) schreibt. `maps/index.ts` baut daraus `MAP_DEFS` (ohne Prototyp), `MAP_LIST`, `isMapId`, `mapName`, `stepMapId`, `MAP_SOURCES`; `MapId` wird `string`. Das Protokoll bekommt `setMap` und `mapId`/`mapName` in `lobby` sowie `mapName` in `RoomInfo`; der Server-Raum hält die Karte veränderlich; der Client zeigt und wählt sie online (DOM-Lobby, Raumliste) und lokal (Phaser-Lobby, `localStorage`).

**Tech Stack:** TypeScript 5.7, npm workspaces (`@pfandraiders/core`, `@pfandraiders/server`, `@pfandraiders/client`), Vitest 3, `tsx` für Skripte, esbuild (Server-Build), Vite (Client), Phaser 3.

**Spec:** `docs/superpowers/specs/2026-10-10-eigene-karten-design.md` (ergänzt `2026-10-03-stadtkarte-design.md` und `2026-10-09-online-raeume-design.md`). Plan 2 (`2026-10-10-eigene-karten-vorlage.md`) baut auf diesem Plan auf.

**Ausgangsstand:** Branch `feature/eigene-karten` (von `master`, Commit `de0af1a`). Pfade und Zeilennummern beziehen sich auf diesen Stand.

## Global Constraints

- Alle Texte für Spieler und Kartenautoren sind deutsch, mit echten Umlauten (Fehlermeldungen des Servers, Hinweise im Client, Problemsätze der Kartenprüfung).
- Code-Kommentare sind deutsch wie im bestehenden Code; Bezeichner und Testnamen bleiben englisch.
- Jeder Commit endet mit der Zeile `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (nach einer Leerzeile).
- `todo.md` und `idee.md` werden nie gestaged oder committet. Immer mit expliziten Pfaden `git add <pfad>` arbeiten, nie `git add -A` oder `git add .`.
- Das Verzeichnis `.claude/` wird nie gelöscht.
- Kein Python; Hilfsskripte nur in TypeScript (`tsx`).
- Der Kern bleibt deterministisch: kein `Math.random`, kein `Date.now`; Sortierungen mit festem Vergleich (`Array.prototype.sort()` ohne Locale).
- Kennung eigener Karten: `a-z0-9-`, 1 bis 24 Zeichen, nicht `city`/`retro`. Kartenname höchstens 24 Zeichen. Größe 32 x 20 bis 128 x 80 Kacheln, Kachel 16 px, Grafik-gids 0 bis `SHEET_CELLS` (1036).
- Eigene Karten: genau 8 `spawn`, mindestens 1 `dropoff`, mindestens 20 `spot`, mindestens 2 `npc_spawn` (Spec §2; eingebaute Karten: Ruling R1).
- Am Ende **jeder** Task sind Tests und Typecheck aller drei Pakete grün (`npm test`, `npm run typecheck` im Wurzelordner). Es gibt keine erlaubten Rot-Fenster; Task 5 ändert darum Protokoll, Server und Client-Testdaten gemeinsam.
- Am Ende des Plans laufen zusätzlich `npm run build` (Client) und `npm run build:server` fehlerfrei.
- Testbefehle (Git Bash oder PowerShell): `npx vitest run <datei>` im Paketordner, z. B. `cd packages/core; npx vitest run test/validate.test.ts`.

## Review Focus

1. **Gedrehte/gespiegelte Kachel** in einer Grafikebene wird mit Hinweis abgelehnt (Tiled-Taste X/Y/Z setzt Bits ab `0x10000000`): Test `validate.test.ts › rejects flipped or rotated tiles with a hint` (Task 2).
2. **Kennung kollidiert** mit einer eingebauten Karte (`city.tiled.json`) oder ist doppelt/ungültig: Test `custom-maps.test.ts › rejects a custom map named like a built-in map` (Task 3) und `custom-index.test.ts › reports files that do not belong into the folder` (Task 4).
3. **`setMap` nur vom Host, nur in der Lobby**, unbekannte Kennung `bad_message`: Tests `roomMap.test.ts › lets only the host change the map, only in the lobby` (Task 6) und `protocolRooms.test.ts › accepts setMap only with a known map id` (Task 5).
4. **Karte bleibt** über alle Runden der Serie und nach `toLobby`: Test `roomMap.test.ts › keeps the chosen map for every round and after toLobby` (Task 6); lokal `mapChoice.test.ts › keeps the map of the series after the shop` (Task 8).
5. **Unbekannte `MAP_ID`** fällt auf `city` zurück und die Warnung nennt die bekannten Kennungen: Test `config.test.ts › flags unknown maps and names the known ones in the warning` (Task 6).

Weitere bewusst abgedeckte Fallen: Startpunkt zu nah an einer Wand (`validate.test.ts › wants room for the player at spawns and NPC entrances`), Raumliste eines älteren Servers ohne `mapName` (`roomList.test.ts › keeps entries without or with a broken map name`), gespeicherte Karte existiert nicht mehr (`settings.test.ts › falls back to the default for a stored map that no longer exists`), CRLF beim Vergleich der generierten Datei (`custom-index.test.ts › matches the generator output for the folder`).

## Namenstabelle (verbindlich für Plan 1 und Plan 2)

| Ort | Name | Typ / Form |
| --- | --- | --- |
| `core/src/maps/mapIds.ts` | `BUILTIN_MAP_IDS`, `BuiltinMapId` | `readonly ['city', 'retro']`, `'city' \| 'retro'` |
| `core/src/maps/mapIds.ts` | `TILESET_IDS`, `TilesetId`, `isTilesetId(v: unknown): v is TilesetId` | `'city' \| 'retro'` |
| `core/src/maps/mapIds.ts` | `MAX_MAP_ID_LENGTH`, `MAX_MAP_NAME_LENGTH` | `24`, `24` |
| `core/src/maps/mapIds.ts` | `isMapIdSyntax(v: unknown): v is string`, `cleanMapName(raw: unknown): string \| null` | |
| `core/src/map.ts` | `tileIndexAt(map: MapData, px: number, py: number): number`, `reachableTiles(map: MapData, px: number, py: number): Set<number>` | `-1` = außerhalb; Wände und `soft` sperren |
| `core/src/maps/validate.ts` | `MapRules`, `CUSTOM_MAP_RULES`, `BUILTIN_MAP_RULES` | `{ minSpawns; maxSpawns; minDropoffs; minSpots; minNpcSpawns }` |
| `core/src/maps/validate.ts` | `MAP_MIN_COLS = 32`, `MAP_MIN_ROWS = 20`, `MAP_MAX_COLS = 128`, `MAP_MAX_ROWS = 80`, `MAP_LAYER_NAMES` | |
| `core/src/maps/validate.ts` | `validateTiledMap(json: unknown, opts?: ValidateOptions): ValidatedMap` | `ValidateOptions = { rules?: MapRules; tileset?: TilesetId }`, `ValidatedMap = { problems: string[]; name: string \| null; tileset: TilesetId; map: MapData \| null; visuals: MapVisuals \| null }` |
| `core/src/maps/mapDef.ts` | `MapId`, `MapDef`, `CustomMapSource` | `string`; `{ id; name; tileset: TilesetId; map; visuals; builtin: boolean }`; `{ id: string; file: string; json: unknown }` |
| `core/src/maps/customMaps.ts` | `mapProblemsText(file, problems): string`, `customMapIdProblem(id, taken): string \| null`, `customMapDef(src, taken): MapDef`, `customMapDefs(sources, reserved?): MapDef[]` | wirft `Error` mit Dateiname |
| `core/src/maps/custom/index.ts` | `CUSTOM_MAP_SOURCES: readonly CustomMapSource[]` | generiert |
| `core/src/maps/index.ts` | `buildRegistry(builtins, customs): MapDef[]`, `MAP_DEFS`, `MapListEntry`, `MAP_LIST`, `isMapId`, `mapName(id): string`, `stepMapId(id, dir: -1 \| 1): MapId`, `DEFAULT_MAP_ID: BuiltinMapId`, `MAP_VISUALS`, `CITY_MAP`, `MAP_SOURCES` | |
| `core/scripts/customIndex.ts` | `CUSTOM_MAP_SUFFIX = '.tiled.json'`, `CUSTOM_INDEX_FILE = 'index.ts'`, `customMapIds(files): { ids: string[]; problems: string[] }`, `importName(id): string`, `customIndexSource(ids): string` | |
| `core/src/protocol.ts` | `ClientMessage` neu `{ t: 'setMap'; mapId: MapId }`; `lobby` neu `mapId: MapId; mapName: string`; `RoomInfo` neu `mapName: string` | |
| `server/src/room.ts` | `Room.selectedMapId(): MapId`, `Room.setMap(byId: string, mapId: string): Result<void>` | |
| `server/src/config.ts` | `mapIdWarning(raw: string \| undefined): string` | |
| `client/src/online.ts` | `OnlineConnection.lobbyMapId: MapId`, `lobbyMapName: string`, `setMap(mapId: MapId): void` | |
| `client/src/roomList.ts` | `RoomRow.map: string`, `ROOM_LIST_HEADER` | `['Raumname', 'Karte', 'Host', 'Spieler', 'Status']` |
| `client/src/settings.ts` | `loadLocalMapId(store?): MapId`, `saveLocalMapId(id: MapId, store?): void` | Schlüssel `pfandraiders.mapId` |
| `client/src/mapChoice.ts` | `chooseLocalMapId(urlParam: string \| null, chosen: unknown, stored: string): MapId`, `mapLine(id: MapId): string` | |

## Entscheidungen zu Lücken der Spec (Rulings)

1. **R1 Eingebaute Karten / zwei Regelsätze.** `retro` hat 4 Startpunkte und 17 Spots; `retro.test.ts` und `retro-parity.test.ts` halten das fest. Statt die Regeln für alle aufzuweichen gibt es `CUSTOM_MAP_RULES` (8/8 Startpunkte, ≥ 20 Spots) und `BUILTIN_MAP_RULES` (4 bis 8 Startpunkte, ≥ 16 Spots). Mindestgröße 32 x 20 = retro. `all-maps.test.ts` prüft, dass `city` auch die strengen Regeln erfüllt und `retro` genau an Startpunkten und Spots scheitert.
2. **R2 Erreichbarkeit:** Vierer-Nachbarn; Wände **und** weiche Hindernisse sperren (wie die NPC-Wegsuche). Vorab geprüft: die Stadt besteht. `reachableTiles` wandert nach `src/map.ts`; `retro.test.ts` und `city-plan.test.ts` nutzen es.
3. **R3 Objekttyp:** `parseTiledMap` nimmt `class`, wenn `type` fehlt oder leer ist (Tiled 1.9).
4. **R4 Punkt-Objekte:** Objekte in `objects` müssen `point: true` haben; Kachelobjekte (`gid`) sind Fehler (Ursprung unten links, verwirrend).
5. **R5 Startpunkt-Platz:** `spawn` und `npc_spawn` müssen `boxBlocked(map, x, y, CONFIG.playerHalf) === false` erfüllen; alle Objekte dürfen weder auf Wand noch auf `soft` stehen.
6. **R6 Kachelsatz `city`:** Ebene `ground` ist Pflicht und jede Wandkachel braucht Grafik in `ground` oder `below` (Bedingung von `visualsMatchMap` im Client, sonst einfarbige Rückfallkarte). Bei `retro` werden Grafikebenen geprüft, aber nicht registriert (`visuals: null`).
7. **R7 Gedrehte Kacheln:** nur in `ground`/`below`/`above` ein Fehler (gid ≥ `0x10000000`, rein numerisch geprüft, weil JSON vorzeichenlose Werte speichert). In `walls`/`soft` zählt jede Zahl ≠ 0.
8. **R8 Unbekannte Ebenennamen** sind Fehler (Groß-/Kleinschreibung zählt), Gruppen ebenso. Länge jeder Kachelebene = Breite x Höhe.
9. **R9 Kachelsatz-Einträge:** `tilesets` darf fehlen; sonst genau ein Eintrag mit `firstgid: 1` (extern oder eingebettet).
10. **R10 Problemsätze** werden alle gesammelt. Ist die Grundform kaputt (Größe, Ebenen, Kachelsatz, Objektform), endet die Prüfung danach (weitere Prüfungen wären Folgefehler). Englische Fehler aus `parseTiledMap` werden als `Tiled-Datei nicht lesbar: <meldung>.` eingebettet.
11. **R11 Höchstzahl Startpunkte** = `MAX_ROOM_PLAYERS` (8). `validate.ts` importiert `protocol.ts` nicht (Zyklus `protocol → maps → validate`); `validate.test.ts` sichert die Gleichheit.
12. **R12 Prüfung beim Laden:** eigene Karten beim Import des Kerns (wirft mit Dateiname, Server und Client starten nicht); eingebaute nur im Test (die Stadt-Grafikebenen bleiben lazy, `city-visuals.test.ts`).
13. **R13 `MAP_DEFS`** ist ein eingefrorenes Objekt ohne Prototyp; nachgeschlagen wird nur nach `isMapId`. `MAP_VISUALS` bleibt auf die eingebauten Karten beschränkt.
14. **R14 Generierte Datei:** LF, sortiert nach Kennung (UTF-16-Reihenfolge), Importnamen `map_<id mit _ statt ->`, leere Liste mit Typangabe. Das Skript schreibt nur bei Änderung und gar nicht, wenn es ein Problem gibt (Exit 1). Der Test normalisiert CRLF (`core.autocrlf = true` im Repo).
15. **R15 Ordnerinhalt:** In `custom/` sind nur `index.ts` und `*.tiled.json` erlaubt.
16. **R16 `setMap`** nur in Phase `lobby` (`shop`, `final`, `playing` = `wrong_phase`). Die Wahl bleibt nach `toLobby`. `RoomOptions.map` (Testvorgabe) gilt, bis der Host eine **andere** Karte wählt. Unbekannte `RoomOptions.mapId` ergibt `DEFAULT_MAP_ID`.
17. **R17 Versionsunterschied:** `start` mit unbekannter Karte wird im Client weiter verworfen; die Lobby zeigt den Namen des Servers (auch für unbekannte Karten). Raumlisten-Einträge ohne gültigen `mapName` bleiben mit `mapName: ''`, die Zeile zeigt `?`.
18. **R18 Lokale Lobby:** links/rechts = Rundenzeit (bestehend), hoch/runter (W/S, ↑/↓, Steuerkreuz, Stick) = Karte. Die Karte reist Lobby → Spiel → Shop → Spiel als Szenendaten mit; `?map=` hat Vorrang, dann die mitgereiste Wahl, dann `localStorage`. Die Testhilfe `?players=` nimmt die gespeicherte Karte.
19. **R19 Online-Lobby:** Zeile "Karte:" mit Knöpfen ◄ ► (Host) und Pfeiltasten links/rechts auf der Zeile; Gäste sehen nur den Namen. Raumliste: Spalte "Karte" nach "Raumname", Dialog 520 px breit.
20. **R20 Fehlertexte des Servers:** `not_host` "Nur der Host kann die Karte wählen.", `wrong_phase` "Die Karte wählt man in der Lobby.", `bad_message` "Unbekannte Karte." (der Parser lässt unbekannte Kennungen gar nicht durch; dann gilt die bestehende Antwort "Ungültige Nachricht.").

---

### Task 1: Kennungsregeln, Erreichbarkeit im Kern, `class` als Objekttyp

**Files:**
- Create: `packages/core/src/maps/mapIds.ts`
- Modify: `packages/core/src/map.ts` (am Ende anhängen)
- Modify: `packages/core/src/tiled.ts:92-104` (Objekttyp)
- Create: `packages/core/test/mapIds.test.ts`
- Create: `packages/core/test/reach.test.ts`
- Modify: `packages/core/test/tiled.test.ts` (neuer Test im `describe('parseTiledMap')`)
- Modify: `packages/core/test/retro.test.ts:1-20`
- Modify: `packages/core/test/city-plan.test.ts:1-8, 59-77`

**Interfaces:**
- Consumes: `MapData`, `TILE`, `parseMap` (bestehend).
- Produces: `BUILTIN_MAP_IDS`, `BuiltinMapId`, `TILESET_IDS`, `TilesetId`, `isTilesetId`, `MAX_MAP_ID_LENGTH`, `MAX_MAP_NAME_LENGTH`, `isMapIdSyntax`, `cleanMapName` (alle aus `maps/mapIds.ts`); `tileIndexAt`, `reachableTiles` (aus `map.ts`, über `src/index.ts` öffentlich).

- [ ] **Step 1: Tests für die Kennungsregeln schreiben**

`packages/core/test/mapIds.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  BUILTIN_MAP_IDS,
  cleanMapName,
  isMapIdSyntax,
  isTilesetId,
  MAX_MAP_ID_LENGTH,
  MAX_MAP_NAME_LENGTH,
  TILESET_IDS,
} from '../src/maps/mapIds';

describe('map id syntax', () => {
  it('accepts a-z, 0-9 and dashes up to 24 characters', () => {
    expect(MAX_MAP_ID_LENGTH).toBe(24);
    for (const id of ['uebung', 'a', 'park-2', '2024', 'x'.repeat(24)]) expect(isMapIdSyntax(id), id).toBe(true);
  });

  it('rejects everything else', () => {
    for (const id of ['', 'Uebung', 'über', 'a_b', 'a b', 'a.b', 'x'.repeat(25), '__proto__', 7, null, undefined]) {
      expect(isMapIdSyntax(id), String(id)).toBe(false);
    }
  });

  it('knows the built-in maps and the two tilesets', () => {
    expect(BUILTIN_MAP_IDS).toEqual(['city', 'retro']);
    expect(TILESET_IDS).toEqual(['city', 'retro']);
    expect(isTilesetId('city')).toBe(true);
    expect(isTilesetId('retro')).toBe(true);
    for (const v of ['Retro', '', 'kenney', null, 1]) expect(isTilesetId(v)).toBe(false);
  });
});

describe('cleanMapName', () => {
  it('trims and removes control and format characters', () => {
    expect(cleanMapName('  Übung  ')).toBe('Übung');
    expect(cleanMapName('Park​\u0007platz')).toBe('Parkplatz');
  });

  it('rejects empty, too long and non-text names', () => {
    expect(MAX_MAP_NAME_LENGTH).toBe(24);
    expect(cleanMapName('   ')).toBeNull();
    expect(cleanMapName('x'.repeat(24))).toBe('x'.repeat(24));
    expect(cleanMapName('x'.repeat(25))).toBeNull();
    expect(cleanMapName(7)).toBeNull();
    expect(cleanMapName(undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: Tests für die Erreichbarkeit schreiben**

`packages/core/test/reach.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseMap, reachableTiles, tileIndexAt } from '../src/map';

// 6 x 4 Kacheln: links ein 2 x 2-Raum, rechts ein 1 x 2-Gang, dazwischen eine Wand
const ROWS = ['######', '#..#.#', '#..#.#', '######'];
const sorted = (s: Set<number>): number[] => [...s].sort((a, b) => a - b);

describe('tileIndexAt', () => {
  it('maps pixels to tile indices and -1 outside the map', () => {
    const m = parseMap(ROWS);
    expect(tileIndexAt(m, 24, 24)).toBe(7);
    expect(tileIndexAt(m, 0, 0)).toBe(0);
    expect(tileIndexAt(m, 95.9, 63.9)).toBe(23);
    expect(tileIndexAt(m, -1, 5)).toBe(-1);
    expect(tileIndexAt(m, 96, 5)).toBe(-1);
    expect(tileIndexAt(m, 5, 64)).toBe(-1);
    expect(tileIndexAt(m, NaN, 5)).toBe(-1);
  });
});

describe('reachableTiles', () => {
  it('floods through walkable tiles only (four neighbours)', () => {
    const m = parseMap(ROWS);
    expect(sorted(reachableTiles(m, 24, 24))).toEqual([7, 8, 13, 14]);
    expect(sorted(reachableTiles(m, 72, 24))).toEqual([10, 16]);
  });

  it('is empty when starting on a wall or outside', () => {
    const m = parseMap(ROWS);
    expect(reachableTiles(m, 8, 8).size).toBe(0);
    expect(reachableTiles(m, -20, 8).size).toBe(0);
  });

  it('treats soft tiles as blocked like the NPC path search', () => {
    const m = parseMap(['#####', '#...#', '#####']);
    m.soft = m.solid.map((_, i) => i === 7);
    expect(sorted(reachableTiles(m, 24, 24))).toEqual([6]);
  });
});
```

- [ ] **Step 3: Test für `class` als Objekttyp anhängen**

In `packages/core/test/tiled.test.ts` direkt nach dem Test `'rejects the former shop object'` (Zeile 55-59) einfügen:

```ts
  it('reads the object type from "class" when "type" is missing or empty (Tiled 1.9)', () => {
    const b = base();
    b.layers[1].objects = [
      { ...pt(1, 'spawn', 24, 24), type: '', class: 'spawn' },
      { id: 2, name: '', class: 'spot', x: 40, y: 24, point: true, properties: [{ name: 'spotType', type: 'string', value: 'bin' }] },
    ];
    const m = parseTiledMap(b);
    expect(m.spawns).toEqual([{ x: 24, y: 24 }]);
    expect(m.spots).toEqual([{ id: 0, type: 'bin', x: 40, y: 24 }]);
  });
```

- [ ] **Step 4: Tests laufen lassen, sie schlagen fehl**

Run: `cd packages/core; npx vitest run test/mapIds.test.ts test/reach.test.ts test/tiled.test.ts`
Expected: FAIL (`Cannot find module '../src/maps/mapIds'`, `reachableTiles is not a function`, `unknown object type undefined`).

- [ ] **Step 5: `mapIds.ts` anlegen**

`packages/core/src/maps/mapIds.ts`:

```ts
/**
 * Kennungen, Kachelsätze und Namensregeln der Karten. Blatt-Modul: importiert nichts aus `maps/index.ts`,
 * damit `npm run maps` auch dann läuft, wenn `custom/index.ts` gerade nicht zu den Dateien passt.
 */

/** Kennungen der eingebauten Karten, in der Reihenfolge der Auswahl. */
export const BUILTIN_MAP_IDS = ['city', 'retro'] as const;
export type BuiltinMapId = (typeof BUILTIN_MAP_IDS)[number];

/** Kachelsatz: `city` = Kenney-Bogen mit Grafikebenen, `retro` = selbst gezeichnete Kacheln aus den Kacheltypen. */
export const TILESET_IDS = ['city', 'retro'] as const;
export type TilesetId = (typeof TILESET_IDS)[number];

export function isTilesetId(v: unknown): v is TilesetId {
  return v === 'city' || v === 'retro';
}

/** Längste Kartenkennung (Dateiname ohne `.tiled.json`). */
export const MAX_MAP_ID_LENGTH = 24;
/** Längster Kartenname (Eigenschaft `name`), nach dem Bereinigen. */
export const MAX_MAP_NAME_LENGTH = 24;

const MAP_ID_SYNTAX = /^[a-z0-9-]+$/;

/** Schreibweise einer Kartenkennung: nur a-z, 0-9 und '-', 1 bis MAX_MAP_ID_LENGTH Zeichen. */
export function isMapIdSyntax(v: unknown): v is string {
  return typeof v === 'string' && v.length >= 1 && v.length <= MAX_MAP_ID_LENGTH && MAP_ID_SYNTAX.test(v);
}

/** Kartenname bereinigen: Steuer- und Formatzeichen raus, trimmen. null = kein Text, leer oder zu lang. */
export function cleanMapName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.replace(/[\p{Cc}\p{Cf}]/gu, '').trim();
  return name.length === 0 || name.length > MAX_MAP_NAME_LENGTH ? null : name;
}
```

- [ ] **Step 6: `tileIndexAt` und `reachableTiles` an `packages/core/src/map.ts` anhängen**

```ts
/** Kachelindex (row * cols + col) unter dem Pixelpunkt; -1 = außerhalb der Karte. */
export function tileIndexAt(map: MapData, px: number, py: number): number {
  const c = Math.floor(px / TILE);
  const r = Math.floor(py / TILE);
  if (!Number.isFinite(c) || !Number.isFinite(r) || c < 0 || r < 0 || c >= map.cols || r >= map.rows) return -1;
  return r * map.cols + c;
}

/**
 * Kacheln, die man von (px, py) aus über Vierer-Nachbarn erreicht. Wände und weiche Hindernisse (soft)
 * sperren wie bei der Wegsuche der NPCs. Liegt der Start außerhalb oder auf einer gesperrten Kachel, ist die Menge leer.
 */
export function reachableTiles(map: MapData, px: number, py: number): Set<number> {
  const seen = new Set<number>();
  const start = tileIndexAt(map, px, py);
  if (start < 0) return seen;
  const blocked = (i: number): boolean => map.solid[i] || (map.soft?.[i] ?? false);
  const stack = [start];
  while (stack.length > 0) {
    const i = stack.pop()!;
    if (seen.has(i) || blocked(i)) continue;
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
```

- [ ] **Step 7: Objekttyp in `packages/core/src/tiled.ts` auch aus `class` lesen**

Ersetze in `parseTiledMap`

```ts
    const at = { x, y };
    switch (o.type) {
```

durch

```ts
    const at = { x, y };
    // Tiled 1.9 schreibt den Objekttyp als "class", ältere und neuere Versionen als "type"
    const kind = typeof o.type === 'string' && o.type !== '' ? o.type : o.class;
    switch (kind) {
```

und

```ts
      default: fail(`unknown object type ${String(o.type)}`);
```

durch

```ts
      default: fail(`unknown object type ${String(kind)}`);
```

- [ ] **Step 8: Flutfüllungen der Tests auf `reachableTiles` umstellen**

In `packages/core/test/retro.test.ts` die Zeilen 1-20 (Importe und die lokale Funktion `reachableTiles`) ersetzen durch:

```ts
import { describe, expect, it } from 'vitest';
import { TILE } from '../src/config';
import { reachableTiles } from '../src/map';
import { RETRO_MAP } from '../src/maps/retro';
```

In `packages/core/test/city-plan.test.ts` den Import

```ts
import { boxBlocked, isSolidAt } from '../src/map';
```

ersetzen durch

```ts
import { boxBlocked, isSolidAt, reachableTiles } from '../src/map';
```

und die Funktion `reachable` (Zeilen 59-77, beginnt mit `/** Flutfüllung über die begehbaren Kacheln der erzeugten Karte */`) ersetzen durch:

```ts
/** Flutfüllung über die begehbaren Kacheln der erzeugten Karte (Wände und weiche Hindernisse sperren) */
function reachable(start: Cell): Set<number> {
  return reachableTiles(CITY_TILED_MAP, start.c * TILE + TILE / 2, start.r * TILE + TILE / 2);
}
```

- [ ] **Step 9: Tests laufen lassen**

Run: `cd packages/core; npx vitest run test/mapIds.test.ts test/reach.test.ts test/tiled.test.ts test/retro.test.ts test/city-plan.test.ts`
Expected: PASS.
Run: `npm test` und `npm run typecheck` im Wurzelordner. Expected: alles grün.

- [ ] **Step 10: Commit**

```bash
git add packages/core/src/maps/mapIds.ts packages/core/src/map.ts packages/core/src/tiled.ts packages/core/test/mapIds.test.ts packages/core/test/reach.test.ts packages/core/test/tiled.test.ts packages/core/test/retro.test.ts packages/core/test/city-plan.test.ts
git commit -m "feat(core): Kennungsregeln für Karten und Erreichbarkeit im Kern

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Kartenprüfung `validateTiledMap`

**Files:**
- Create: `packages/core/src/maps/validate.ts`
- Create: `packages/core/test/mapFixture.ts`
- Create: `packages/core/test/validate.test.ts`

**Interfaces:**
- Consumes: `cleanMapName`, `isTilesetId`, `MAX_MAP_NAME_LENGTH`, `TilesetId` (Task 1); `reachableTiles`, `tileIndexAt` (Task 1); `boxBlocked`, `parseTiledMap`, `parseTiledVisuals`, `SHEET_CELLS`, `CONFIG`, `TILE` (bestehend).
- Produces: `MapRules`, `CUSTOM_MAP_RULES`, `BUILTIN_MAP_RULES`, `MAP_MIN_COLS`, `MAP_MIN_ROWS`, `MAP_MAX_COLS`, `MAP_MAX_ROWS`, `MAP_LAYER_NAMES`, `ValidateOptions`, `ValidatedMap`, `validateTiledMap`. Testhilfe `test/mapFixture.ts`: `FIX_COLS = 32`, `FIX_ROWS = 20`, `point(id, type, c, r, spotType?)`, `fixtureMap()`, `fixtureCityMap()` (auch von Task 3 genutzt).

- [ ] **Step 1: Testkarte als Hilfsdatei anlegen**

`packages/core/test/mapFixture.ts`:

```ts
/** Kleinste gültige eigene Karte für Tests: 32 x 20, Rand aus Wänden, Kachelsatz retro (ohne Grafikebenen). */
export const FIX_COLS = 32;
export const FIX_ROWS = 20;

type Obj = Record<string, unknown>;

/** Punkt-Objekt in der Mitte der Kachel (Spalte c, Zeile r). */
export function point(id: number, type: string, c: number, r: number, spotType?: string): Obj {
  const o: Obj = { id, name: '', type, x: c * 16 + 8, y: r * 16 + 8, width: 0, height: 0, rotation: 0, visible: true, point: true };
  if (spotType) o.properties = [{ name: 'spotType', type: 'string', value: spotType }];
  return o;
}

const SPOT_TYPES = ['bus_stop', 'bench', 'bush', 'bin', 'park'];

/**
 * Neue, veränderbare Karte; jeder Aufruf liefert eine eigene Kopie. Objekte: 8 Startpunkte (Zeile 2),
 * Pfandautomat (16, 10), 20 Spots (Zeilen 5 und 7), 2 NPC-Eingänge (Zeile 18), Zone "stadium".
 */
export function fixtureMap(): {
  type: string;
  orientation: string;
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  infinite: boolean;
  properties: Obj[];
  tilesets?: Obj[];
  layers: Obj[];
} {
  const walls: number[] = [];
  for (let r = 0; r < FIX_ROWS; r++) {
    for (let c = 0; c < FIX_COLS; c++) walls.push(r === 0 || c === 0 || r === FIX_ROWS - 1 || c === FIX_COLS - 1 ? 1 : 0);
  }
  let id = 1;
  const objects: Obj[] = [];
  for (let i = 0; i < 8; i++) objects.push(point(id++, 'spawn', 2 + i * 2, 2));
  objects.push(point(id++, 'dropoff', 16, 10));
  for (let i = 0; i < 20; i++) objects.push(point(id++, 'spot', 2 + (i % 10) * 2, i < 10 ? 5 : 7, SPOT_TYPES[i % SPOT_TYPES.length]));
  objects.push(point(id++, 'npc_spawn', 1, 18));
  objects.push(point(id++, 'npc_spawn', 30, 18));
  const zone = {
    id: id++,
    name: 'Stadion',
    type: 'zone',
    x: 64,
    y: 192,
    width: 192,
    height: 64,
    properties: [{ name: 'zoneId', type: 'string', value: 'stadium' }],
  };
  return {
    type: 'map',
    orientation: 'orthogonal',
    width: FIX_COLS,
    height: FIX_ROWS,
    tilewidth: 16,
    tileheight: 16,
    infinite: false,
    properties: [
      { name: 'name', type: 'string', value: 'Testkarte' },
      { name: 'tileset', type: 'string', value: 'retro' },
    ],
    layers: [
      { id: 1, type: 'tilelayer', name: 'walls', width: FIX_COLS, height: FIX_ROWS, x: 0, y: 0, opacity: 1, visible: true, data: walls },
      { id: 2, type: 'objectgroup', name: 'objects', objects },
      { id: 3, type: 'objectgroup', name: 'zones', objects: [zone] },
    ],
  };
}

/** Dieselbe Karte mit Kachelsatz city: Grafikebene ground überall belegt (Kachel 1), externer Kachelsatz. */
export function fixtureCityMap(): ReturnType<typeof fixtureMap> {
  const m = fixtureMap();
  m.properties = [
    { name: 'name', type: 'string', value: 'Teststadt' },
    { name: 'tileset', type: 'string', value: 'city' },
  ];
  m.tilesets = [{ firstgid: 1, source: 'kenney-city.tsx' }];
  m.layers.splice(1, 0, {
    id: 4,
    type: 'tilelayer',
    name: 'ground',
    width: FIX_COLS,
    height: FIX_ROWS,
    x: 0,
    y: 0,
    opacity: 1,
    visible: true,
    data: new Array<number>(FIX_COLS * FIX_ROWS).fill(1),
  });
  return m;
}
```

- [ ] **Step 2: Tests der Prüfregeln schreiben**

`packages/core/test/validate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MAX_ROOM_PLAYERS } from '../src/protocol';
import { SHEET_CELLS } from '../src/tiled';
import { BUILTIN_MAP_RULES, CUSTOM_MAP_RULES, MAP_LAYER_NAMES, validateTiledMap } from '../src/maps/validate';
import type { ValidateOptions } from '../src/maps/validate';
import { FIX_COLS, fixtureCityMap, fixtureMap, point } from './mapFixture';

type Fixture = ReturnType<typeof fixtureMap>;
type Obj = Record<string, unknown>;

function layer(m: Fixture, name: string): Obj {
  const l = m.layers.find((x) => x.name === name);
  if (!l) throw new Error(`Ebene ${name} fehlt in der Testkarte`);
  return l;
}
const objects = (m: Fixture): Obj[] => layer(m, 'objects').objects as Obj[];
const tiles = (m: Fixture, name: string): number[] => layer(m, name).data as number[];
const idx = (c: number, r: number): number => r * FIX_COLS + c;
const problems = (m: unknown, opts: ValidateOptions = {}): string[] => validateTiledMap(m, opts).problems;
/** Lässt von einem Objekttyp nur die ersten `keep` übrig. */
const withoutType = (m: Fixture, type: string, keep: number): Fixture => {
  let seen = 0;
  layer(m, 'objects').objects = objects(m).filter((o) => o.type !== type || seen++ < keep);
  return m;
};

describe('validateTiledMap: valid maps', () => {
  it('accepts the retro fixture and reads name, tileset and map', () => {
    const v = validateTiledMap(fixtureMap());
    expect(v.problems).toEqual([]);
    expect(v.name).toBe('Testkarte');
    expect(v.tileset).toBe('retro');
    expect(v.map?.spawns).toHaveLength(8);
    expect(v.map?.spots).toHaveLength(20);
    expect(v.visuals).toBeNull();
  });

  it('accepts the city fixture with a ground layer and an external tileset', () => {
    const v = validateTiledMap(fixtureCityMap());
    expect(v.problems).toEqual([]);
    expect(v.tileset).toBe('city');
    expect(v.visuals?.ground).toHaveLength(FIX_COLS * 20);
  });

  it('accepts an embedded tileset with firstgid 1', () => {
    const m = fixtureCityMap();
    m.tilesets = [{ firstgid: 1, name: 'kenney-city', image: 'modern-city.png', columns: 37, tilecount: 1036 }];
    expect(problems(m)).toEqual([]);
  });

  it('has no name without the name property', () => {
    const m = fixtureMap();
    m.properties = m.properties.filter((p) => p.name !== 'name');
    const v = validateTiledMap(m);
    expect(v.problems).toEqual([]);
    expect(v.name).toBeNull();
  });

  it('lets a retro map carry visual layers of the right size', () => {
    const m = fixtureMap();
    m.layers.push({ id: 9, type: 'tilelayer', name: 'below', width: FIX_COLS, height: 20, data: new Array<number>(FIX_COLS * 20).fill(0) });
    expect(problems(m)).toEqual([]);
  });
});

describe('validateTiledMap: rule sets', () => {
  it('uses the counts of the spec for custom maps and the retro exception for built-in maps', () => {
    expect(CUSTOM_MAP_RULES).toEqual({ minSpawns: 8, maxSpawns: 8, minDropoffs: 1, minSpots: 20, minNpcSpawns: 2 });
    expect(BUILTIN_MAP_RULES).toEqual({ minSpawns: 4, maxSpawns: 8, minDropoffs: 1, minSpots: 16, minNpcSpawns: 2 });
    expect(CUSTOM_MAP_RULES.maxSpawns).toBe(MAX_ROOM_PLAYERS);
    expect(BUILTIN_MAP_RULES.maxSpawns).toBe(MAX_ROOM_PLAYERS);
  });

  it('knows exactly these layer names', () => {
    expect(MAP_LAYER_NAMES).toEqual(['walls', 'soft', 'ground', 'below', 'above', 'objects', 'zones']);
  });
});

describe('validateTiledMap: map shape', () => {
  it('rejects non-objects', () => {
    for (const bad of [null, 7, 'map', []]) {
      const v = validateTiledMap(bad);
      expect(v.problems).toEqual(['Die Datei ist keine Tiled-Karte im JSON-Format.']);
      expect(v.map).toBeNull();
    }
  });

  it('rejects maps smaller than 32 x 20 or larger than 128 x 80', () => {
    const narrow = fixtureMap();
    narrow.width = 31;
    expect(problems(narrow)).toEqual(['Größe 31 x 20 Kacheln; erlaubt sind 32 x 20 bis 128 x 80.']);
    const low = fixtureMap();
    low.height = 19;
    expect(problems(low)).toEqual(['Größe 32 x 19 Kacheln; erlaubt sind 32 x 20 bis 128 x 80.']);
    const wide = fixtureMap();
    wide.width = 129;
    expect(problems(wide)).toEqual(['Größe 129 x 20 Kacheln; erlaubt sind 32 x 20 bis 128 x 80.']);
  });

  it('rejects other tile sizes, infinite maps and other orientations', () => {
    const m = fixtureMap();
    m.tilewidth = 32;
    m.infinite = true;
    m.orientation = 'isometric';
    expect(problems(m)).toEqual([
      'Unendliche Karten gehen nicht; in den Karteneigenschaften "Unendlich" ausschalten.',
      'Die Ausrichtung muss "Orthogonal" sein.',
      'Kachelgröße muss 16 x 16 Pixel sein.',
    ]);
  });
});

describe('validateTiledMap: layers', () => {
  it('requires walls, objects and zones', () => {
    const m = fixtureMap();
    m.layers = [];
    expect(problems(m)).toEqual(['Pflichtebene "walls" fehlt.', 'Pflichtebene "objects" fehlt.', 'Pflichtebene "zones" fehlt.']);
  });

  it('rejects unknown, duplicate and wrongly typed layers', () => {
    const renamed = fixtureMap();
    layer(renamed, 'walls').name = 'Walls';
    expect(problems(renamed)).toEqual([
      'Unbekannte Ebene "Walls" (erlaubt: walls, soft, ground, below, above, objects, zones; keine Gruppen).',
      'Pflichtebene "walls" fehlt.',
    ]);
    const twice = fixtureMap();
    twice.layers.push({ ...layer(twice, 'walls') });
    expect(problems(twice)).toEqual(['Ebene "walls" gibt es doppelt.']);
    const typed = fixtureMap();
    layer(typed, 'zones').type = 'tilelayer';
    expect(problems(typed)).toContain('Ebene "zones" muss eine Objektebene sein.');
    const walls = fixtureMap();
    layer(walls, 'walls').type = 'objectgroup';
    expect(problems(walls)).toContain('Ebene "walls" muss eine Kachelebene sein.');
  });

  it('asks for the CSV layer format instead of base64', () => {
    const m = fixtureMap();
    const walls = layer(m, 'walls');
    walls.data = 'AAAAAA==';
    walls.encoding = 'base64';
    expect(problems(m)).toEqual([
      'Ebene "walls": Kachelebenen-Format muss CSV sein (Karteneigenschaften > Kachelebenen-Format), nicht base64.',
    ]);
  });

  it('rejects chunked layers of infinite maps and wrong data lengths', () => {
    const chunked = fixtureMap();
    const walls = layer(chunked, 'walls');
    delete walls.data;
    walls.chunks = [];
    expect(problems(chunked)).toEqual(['Ebene "walls" ist in Stücke geteilt (unendliche Karte); "Unendlich" ausschalten.']);
    const short = fixtureMap();
    tiles(short, 'walls').pop();
    expect(problems(short)).toEqual(['Ebene "walls" hat 639 Kacheln, erwartet 640 (Breite x Höhe).']);
  });

  it('allows only one tileset with firstgid 1', () => {
    const two = fixtureCityMap();
    two.tilesets = [{ firstgid: 1, source: 'kenney-city.tsx' }, { firstgid: 1037, source: 'andere.tsx' }];
    expect(problems(two)).toEqual(['Die Karte nutzt 2 Kachelsätze; erlaubt ist nur kenney-city.']);
    const shifted = fixtureCityMap();
    shifted.tilesets = [{ firstgid: 2, source: 'kenney-city.tsx' }];
    expect(problems(shifted)).toEqual(['Der Kachelsatz kenney-city muss firstgid 1 haben.']);
    const broken = fixtureCityMap();
    (broken as Record<string, unknown>).tilesets = 'kenney';
    expect(problems(broken)).toEqual(['"tilesets" muss eine Liste sein.']);
  });
});

describe('validateTiledMap: tiles', () => {
  it('rejects flipped or rotated tiles with a hint', () => {
    for (const gid of [0x80000000 + 5, 0x40000000 + 5, 0x20000000 + 5, 0x10000000 + 5]) {
      const m = fixtureCityMap();
      tiles(m, 'ground')[idx(5, 3)] = gid;
      expect(problems(m), String(gid)).toEqual([
        'Ebene "ground", Spalte 5, Zeile 3: Kachel ist gespiegelt oder gedreht. Das geht nicht; bitte die Kachel ungedreht setzen (in Tiled ohne X, Y oder Z).',
      ]);
    }
  });

  it('rejects tiles outside the Kenney sheet and non-integers', () => {
    const big = fixtureCityMap();
    tiles(big, 'ground')[idx(2, 1)] = SHEET_CELLS + 1;
    expect(problems(big)).toEqual([
      'Ebene "ground", Spalte 2, Zeile 1: Kachel 1037 liegt außerhalb des Kenney-Bogens (1 bis 1036); nur kenney-city mit firstgid 1 ist erlaubt.',
    ]);
    const odd = fixtureCityMap();
    tiles(odd, 'ground')[idx(2, 1)] = 1.5;
    expect(problems(odd)).toEqual(['Ebene "ground", Spalte 2, Zeile 1: ungültige Kachel 1.5.']);
  });

  it('counts any non-zero wall tile as a wall, flipped or not', () => {
    const m = fixtureMap();
    tiles(m, 'walls')[idx(5, 10)] = 0x80000001;
    const v = validateTiledMap(m);
    expect(v.problems).toEqual([]);
    expect(v.map?.solid[idx(5, 10)]).toBe(true);
  });

  it('needs a ground layer for the city tileset', () => {
    const m = fixtureMap();
    m.properties = [{ name: 'tileset', type: 'string', value: 'city' }];
    expect(problems(m)).toEqual(['Kachelsatz "city" braucht die Grafikebene "ground" (oder Eigenschaft tileset = "retro").']);
  });

  it('needs a graphic on every wall of a city map', () => {
    const m = fixtureCityMap();
    tiles(m, 'ground')[idx(0, 0)] = 0;
    expect(problems(m)).toEqual([
      'Wand ohne Grafik bei Spalte 0, Zeile 0: jede Wandkachel braucht eine Kachel in "ground" oder "below" (sonst zeichnet das Spiel die Karte einfarbig).',
    ]);
    m.layers.push({ id: 9, type: 'tilelayer', name: 'below', width: FIX_COLS, height: 20, data: new Array<number>(FIX_COLS * 20).fill(0) });
    tiles(m, 'below')[idx(0, 0)] = 7;
    expect(problems(m)).toEqual([]);
  });
});

describe('validateTiledMap: properties', () => {
  it('checks the name and tileset properties', () => {
    const m = fixtureMap();
    m.properties = [
      { name: 'name', type: 'string', value: '   ' },
      { name: 'tileset', type: 'string', value: 'kenney' },
    ];
    expect(problems(m)).toEqual([
      'Eigenschaft "name" muss Text mit 1 bis 24 Zeichen sein.',
      'Eigenschaft "tileset" muss "city" oder "retro" sein, nicht "kenney".',
      // Ungültiger Kachelsatz: es gilt der Standard city, und dem fehlt ground
      'Kachelsatz "city" braucht die Grafikebene "ground" (oder Eigenschaft tileset = "retro").',
    ]);
    const long = fixtureMap();
    long.properties = [
      { name: 'name', type: 'string', value: 'x'.repeat(25) },
      { name: 'tileset', type: 'string', value: 'retro' },
    ];
    expect(problems(long)).toEqual(['Eigenschaft "name" muss Text mit 1 bis 24 Zeichen sein.']);
    const list = fixtureMap();
    (list as Record<string, unknown>).properties = { name: 'x' };
    expect(problems(list)).toContain('Die Karteneigenschaften ("properties") müssen eine Liste sein.');
  });

  it('lets the caller fix the tileset (built-in maps without properties)', () => {
    const v = validateTiledMap(fixtureMap(), { tileset: 'city' });
    expect(v.tileset).toBe('city');
    expect(v.problems).toEqual(['Kachelsatz "city" braucht die Grafikebene "ground" (oder Eigenschaft tileset = "retro").']);
  });
});

describe('validateTiledMap: objects', () => {
  it('wants point objects, not rectangles or tile objects', () => {
    const rect = fixtureMap();
    objects(rect)[0].point = false;
    expect(problems(rect)).toEqual(['Objekt 1 (spawn) ist kein Punkt-Objekt; bitte das Werkzeug "Punkt einfügen" nehmen.']);
    const tile = fixtureMap();
    objects(tile)[0].gid = 5;
    expect(problems(tile)).toEqual(['Objekt 1 (spawn) ist ein Kachelobjekt; bitte ein Punkt-Objekt nehmen.']);
  });

  it('rejects unknown object types and spots without spotType', () => {
    const tree = fixtureMap();
    objects(tree).push(point(99, 'tree', 10, 10));
    expect(problems(tree)).toEqual(['Tiled-Datei nicht lesbar: invalid tiled map: unknown object type tree.']);
    const spot = fixtureMap();
    delete objects(spot)[9].properties;
    expect(problems(spot)).toEqual(['Tiled-Datei nicht lesbar: invalid tiled map: unknown spotType undefined.']);
  });

  it('reports zones that leave the map', () => {
    const m = fixtureMap();
    (layer(m, 'zones').objects as Obj[])[0].width = 1000;
    expect(problems(m)).toEqual(['Tiled-Datei nicht lesbar: invalid tiled map: zone stadium leaves the map.']);
  });

  it('needs exactly 8 spawns, a dropoff, 20 spots and 2 NPC entrances', () => {
    expect(problems(withoutType(fixtureMap(), 'spawn', 7))).toEqual(['Startpunkte (spawn): 7, nötig sind genau 8.']);
    const nine = fixtureMap();
    objects(nine).push(point(99, 'spawn', 20, 2));
    expect(problems(nine)).toEqual(['Startpunkte (spawn): 9, nötig sind genau 8.']);
    expect(problems(withoutType(fixtureMap(), 'dropoff', 0))).toEqual(['Pfandautomaten (dropoff): 0, nötig ist mindestens 1.']);
    expect(problems(withoutType(fixtureMap(), 'spot', 19))).toEqual(['Spots (spot): 19, nötig sind mindestens 20.']);
    expect(problems(withoutType(fixtureMap(), 'npc_spawn', 1))).toEqual(['NPC-Eingänge (npc_spawn): 1, nötig sind mindestens 2.']);
  });

  it('allows 4 to 8 spawns and 16 spots with the built-in rules', () => {
    const m = withoutType(withoutType(fixtureMap(), 'spawn', 4), 'spot', 16);
    expect(problems(m, { rules: BUILTIN_MAP_RULES })).toEqual([]);
    expect(problems(withoutType(fixtureMap(), 'spawn', 3), { rules: BUILTIN_MAP_RULES })).toEqual([
      'Startpunkte (spawn): 3, erlaubt sind 4 bis 8.',
    ]);
  });

  it('rejects objects on walls and on soft tiles', () => {
    const wall = fixtureMap();
    objects(wall)[8] = point(9, 'dropoff', 0, 10);
    expect(problems(wall)).toEqual([
      'Pfandautomat bei (8, 168) steht auf einer Wand.',
      'Nicht von jedem Startpunkt aus erreichbar: Pfandautomat (8, 168).',
    ]);
    const soft = fixtureMap();
    const data = new Array<number>(FIX_COLS * 20).fill(0);
    data[idx(2, 5)] = 1;
    soft.layers.push({ id: 9, type: 'tilelayer', name: 'soft', width: FIX_COLS, height: 20, data });
    expect(problems(soft)).toEqual([
      'Spot bus_stop bei (40, 88) steht auf einem weichen Hindernis (Ebene soft).',
      'Nicht von jedem Startpunkt aus erreichbar: Spot bus_stop (40, 88).',
    ]);
  });

  it('wants room for the player at spawns and NPC entrances', () => {
    const m = fixtureMap();
    objects(m)[0].x = 18;
    objects(m)[0].y = 24;
    expect(problems(m)).toEqual(['Startpunkt bei (18, 24) liegt zu nah an einer Wand; am besten in die Kachelmitte setzen.']);
    const npc = fixtureMap();
    const entrance = objects(npc).find((o) => o.type === 'npc_spawn')!;
    entrance.x = 17;
    expect(problems(npc)).toEqual(['NPC-Eingang bei (17, 296) liegt zu nah an einer Wand; am besten in die Kachelmitte setzen.']);
  });

  it('reports objects that cannot be reached from every spawn', () => {
    const boxed = fixtureMap();
    for (const [c, r] of [[2, 4], [1, 5], [3, 5], [2, 6]]) tiles(boxed, 'walls')[idx(c, r)] = 1;
    expect(problems(boxed)).toEqual(['Nicht von jedem Startpunkt aus erreichbar: Spot bus_stop (40, 88).']);
    const split = fixtureMap();
    for (let c = 1; c < FIX_COLS - 1; c++) tiles(split, 'walls')[idx(c, 4)] = 1;
    expect(problems(split)).toEqual([
      'Nicht von jedem Startpunkt aus erreichbar: NPC-Eingang (24, 296), NPC-Eingang (488, 296), Pfandautomat (264, 168), Spot bus_stop (40, 88), Spot bench (72, 88) und 18 weitere.',
    ]);
  });

  it('collects every problem instead of stopping at the first', () => {
    const m = withoutType(withoutType(fixtureMap(), 'spawn', 7), 'dropoff', 0);
    objects(m)[0].x = 18;
    objects(m)[0].y = 24;
    expect(problems(m)).toEqual([
      'Startpunkte (spawn): 7, nötig sind genau 8.',
      'Pfandautomaten (dropoff): 0, nötig ist mindestens 1.',
      'Startpunkt bei (18, 24) liegt zu nah an einer Wand; am besten in die Kachelmitte setzen.',
    ]);
  });
});
```

- [ ] **Step 3: Tests laufen lassen, sie schlagen fehl**

Run: `cd packages/core; npx vitest run test/validate.test.ts`
Expected: FAIL mit `Cannot find module '../src/maps/validate'`.

- [ ] **Step 4: `validate.ts` schreiben**

`packages/core/src/maps/validate.ts`:

```ts
import { CONFIG, TILE } from '../config';
import { boxBlocked, reachableTiles, tileIndexAt } from '../map';
import { parseTiledMap, parseTiledVisuals, SHEET_CELLS } from '../tiled';
import type { MapVisuals } from '../tiled';
import type { MapData, Point } from '../types';
import { cleanMapName, isTilesetId, MAX_MAP_NAME_LENGTH } from './mapIds';
import type { TilesetId } from './mapIds';

/** Mindest- und Höchstzahlen der Objekte einer Karte. */
export interface MapRules {
  minSpawns: number;
  maxSpawns: number;
  minDropoffs: number;
  minSpots: number;
  minNpcSpawns: number;
}

/** Regeln für eigene Karten (Spec §2). maxSpawns = MAX_ROOM_PLAYERS; Import aus protocol.ts ginge im Kreis, ein Test sichert es. */
export const CUSTOM_MAP_RULES: MapRules = { minSpawns: 8, maxSpawns: 8, minDropoffs: 1, minSpots: 20, minNpcSpawns: 2 };
/** Regeln für die eingebauten Karten: retro (4 Startpunkte, 17 Spots) ist älter als die Regeln und bleibt unverändert. */
export const BUILTIN_MAP_RULES: MapRules = { minSpawns: 4, maxSpawns: 8, minDropoffs: 1, minSpots: 16, minNpcSpawns: 2 };

export const MAP_MIN_COLS = 32;
export const MAP_MIN_ROWS = 20;
export const MAP_MAX_COLS = 128;
export const MAP_MAX_ROWS = 80;
/** Erlaubte Ebenen; Pflicht sind walls, objects und zones. */
export const MAP_LAYER_NAMES = ['walls', 'soft', 'ground', 'below', 'above', 'objects', 'zones'] as const;
const VISUAL_LAYERS: readonly string[] = ['ground', 'below', 'above'];
/** Ab hier sind in einer gid Tiled-Bits für Spiegeln/Drehen gesetzt (0x10000000 bis 0x80000000). JSON speichert sie vorzeichenlos. */
const FLIP_BITS_FROM = 0x10000000;

export interface ValidateOptions {
  /** Standard CUSTOM_MAP_RULES */
  rules?: MapRules;
  /** Fester Kachelsatz (eingebaute Karten ohne Eigenschaften); sonst Eigenschaft `tileset`, sonst city */
  tileset?: TilesetId;
}

export interface ValidatedMap {
  /** Deutsche Problemsätze; leer = gültig */
  problems: string[];
  /** Eigenschaft `name` (bereinigt) oder null */
  name: string | null;
  tileset: TilesetId;
  /** Gelesene Karte; null, wenn die Grundform kaputt ist */
  map: MapData | null;
  visuals: MapVisuals | null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const at = (p: Point): string => `(${p.x}, ${p.y})`;
const cell = (i: number, cols: number): string => `Spalte ${i % cols}, Zeile ${Math.floor(i / cols)}`;

function readProperties(raw: unknown, problems: string[]): Map<string, unknown> {
  const out = new Map<string, unknown>();
  if (raw === undefined) return out;
  if (!Array.isArray(raw)) {
    problems.push('Die Karteneigenschaften ("properties") müssen eine Liste sein.');
    return out;
  }
  for (const p of raw) if (isRecord(p) && typeof p.name === 'string') out.set(p.name, p.value);
  return out;
}

function checkTilesets(raw: unknown, problems: string[]): void {
  if (raw === undefined) return;
  if (!Array.isArray(raw)) {
    problems.push('"tilesets" muss eine Liste sein.');
    return;
  }
  if (raw.length > 1) problems.push(`Die Karte nutzt ${raw.length} Kachelsätze; erlaubt ist nur kenney-city.`);
  if (raw.length >= 1 && (!isRecord(raw[0]) || raw[0].firstgid !== 1)) {
    problems.push('Der Kachelsatz kenney-city muss firstgid 1 haben.');
  }
}

/** Meldet die erste ungültige Kachel einer Grafikebene (eine Meldung je Ebene reicht). */
function checkGids(name: string, data: unknown[], cols: number, problems: string[]): void {
  for (let i = 0; i < data.length; i++) {
    const g = data[i];
    if (!isInt(g) || g < 0) {
      problems.push(`Ebene "${name}", ${cell(i, cols)}: ungültige Kachel ${JSON.stringify(g)}.`);
      return;
    }
    if (g >= FLIP_BITS_FROM) {
      problems.push(
        `Ebene "${name}", ${cell(i, cols)}: Kachel ist gespiegelt oder gedreht. Das geht nicht; bitte die Kachel ungedreht setzen (in Tiled ohne X, Y oder Z).`,
      );
      return;
    }
    if (g > SHEET_CELLS) {
      problems.push(
        `Ebene "${name}", ${cell(i, cols)}: Kachel ${g} liegt außerhalb des Kenney-Bogens (1 bis ${SHEET_CELLS}); nur kenney-city mit firstgid 1 ist erlaubt.`,
      );
      return;
    }
  }
}

function checkLayers(json: Record<string, unknown>, tileset: TilesetId, sizeOk: boolean, problems: string[]): void {
  const layers = json.layers;
  if (!Array.isArray(layers)) {
    problems.push('Die Karte hat keine Ebenen ("layers").');
    return;
  }
  const cols = json.width as number;
  const count = sizeOk ? cols * (json.height as number) : -1;
  const seen = new Set<string>();
  for (const l of layers) {
    if (!isRecord(l) || typeof l.name !== 'string') {
      problems.push('Eine Ebene hat keinen Namen.');
      continue;
    }
    const name = l.name;
    if (!(MAP_LAYER_NAMES as readonly string[]).includes(name)) {
      problems.push(`Unbekannte Ebene "${name}" (erlaubt: ${MAP_LAYER_NAMES.join(', ')}; keine Gruppen).`);
      continue;
    }
    if (seen.has(name)) {
      problems.push(`Ebene "${name}" gibt es doppelt.`);
      continue;
    }
    seen.add(name);
    const objectLayer = name === 'objects' || name === 'zones';
    if (l.type !== (objectLayer ? 'objectgroup' : 'tilelayer')) {
      problems.push(`Ebene "${name}" muss eine ${objectLayer ? 'Objektebene' : 'Kachelebene'} sein.`);
      continue;
    }
    if (objectLayer) {
      if (!Array.isArray(l.objects)) problems.push(`Ebene "${name}" hat keine Objektliste.`);
      continue;
    }
    if (Array.isArray(l.chunks)) {
      problems.push(`Ebene "${name}" ist in Stücke geteilt (unendliche Karte); "Unendlich" ausschalten.`);
      continue;
    }
    if (!Array.isArray(l.data)) {
      problems.push(
        `Ebene "${name}": Kachelebenen-Format muss CSV sein (Karteneigenschaften > Kachelebenen-Format), nicht ${String(l.encoding ?? 'unbekannt')}.`,
      );
      continue;
    }
    if (count >= 0 && l.data.length !== count) {
      problems.push(`Ebene "${name}" hat ${l.data.length} Kacheln, erwartet ${count} (Breite x Höhe).`);
      continue;
    }
    if (sizeOk && VISUAL_LAYERS.includes(name)) checkGids(name, l.data, cols, problems);
  }
  for (const need of ['walls', 'objects', 'zones']) {
    if (!seen.has(need)) problems.push(`Pflichtebene "${need}" fehlt.`);
  }
  if (tileset === 'city' && !seen.has('ground')) {
    problems.push('Kachelsatz "city" braucht die Grafikebene "ground" (oder Eigenschaft tileset = "retro").');
  }
}

/** Objekte müssen Punkt-Objekte sein (keine Rechtecke, keine Kachelobjekte mit gid). */
function checkObjectShapes(json: Record<string, unknown>, problems: string[]): void {
  const layers = Array.isArray(json.layers) ? json.layers : [];
  const objects = layers.find((l) => isRecord(l) && l.name === 'objects');
  if (!isRecord(objects) || !Array.isArray(objects.objects)) return;
  for (const o of objects.objects) {
    if (!isRecord(o)) continue;
    const kind = typeof o.type === 'string' && o.type !== '' ? o.type : o.class;
    const label = `Objekt ${String(o.id)} (${typeof kind === 'string' && kind !== '' ? kind : 'ohne Typ'})`;
    if (o.gid !== undefined) problems.push(`${label} ist ein Kachelobjekt; bitte ein Punkt-Objekt nehmen.`);
    else if (o.point !== true) problems.push(`${label} ist kein Punkt-Objekt; bitte das Werkzeug "Punkt einfügen" nehmen.`);
  }
}

function checkCounts(map: MapData, rules: MapRules, problems: string[]): void {
  const n = map.spawns.length;
  if (n < rules.minSpawns || n > rules.maxSpawns) {
    problems.push(
      rules.minSpawns === rules.maxSpawns
        ? `Startpunkte (spawn): ${n}, nötig sind genau ${rules.minSpawns}.`
        : `Startpunkte (spawn): ${n}, erlaubt sind ${rules.minSpawns} bis ${rules.maxSpawns}.`,
    );
  }
  if (map.dropoffs.length < rules.minDropoffs) {
    problems.push(`Pfandautomaten (dropoff): ${map.dropoffs.length}, nötig ist mindestens ${rules.minDropoffs}.`);
  }
  if (map.spots.length < rules.minSpots) {
    problems.push(`Spots (spot): ${map.spots.length}, nötig sind mindestens ${rules.minSpots}.`);
  }
  if (map.npcSpawns.length < rules.minNpcSpawns) {
    problems.push(`NPC-Eingänge (npc_spawn): ${map.npcSpawns.length}, nötig sind mindestens ${rules.minNpcSpawns}.`);
  }
}

interface Target {
  label: string;
  p: Point;
}

/** Alle Punkte, die erreichbar sein müssen, in fester Reihenfolge (für stabile Meldungen). */
function targetsOf(map: MapData): Target[] {
  return [
    ...map.spawns.map((p) => ({ label: 'Startpunkt', p })),
    ...map.npcSpawns.map((p) => ({ label: 'NPC-Eingang', p })),
    ...map.dropoffs.map((p) => ({ label: 'Pfandautomat', p })),
    ...map.spots.map((p) => ({ label: `Spot ${p.type}`, p })),
  ];
}

function checkPlacement(map: MapData, problems: string[]): void {
  for (const t of targetsOf(map)) {
    const i = tileIndexAt(map, t.p.x, t.p.y);
    if (map.solid[i]) problems.push(`${t.label} bei ${at(t.p)} steht auf einer Wand.`);
    else if (map.soft?.[i]) problems.push(`${t.label} bei ${at(t.p)} steht auf einem weichen Hindernis (Ebene soft).`);
    else if ((t.label === 'Startpunkt' || t.label === 'NPC-Eingang') && boxBlocked(map, t.p.x, t.p.y, CONFIG.playerHalf)) {
      problems.push(`${t.label} bei ${at(t.p)} liegt zu nah an einer Wand; am besten in die Kachelmitte setzen.`);
    }
  }
}

function checkReachable(map: MapData, problems: string[]): void {
  const targets = targetsOf(map);
  const missing = new Set<Target>();
  for (const s of map.spawns) {
    const reach = reachableTiles(map, s.x, s.y);
    for (const t of targets) if (!reach.has(tileIndexAt(map, t.p.x, t.p.y))) missing.add(t);
  }
  if (missing.size === 0) return;
  const list = [...missing].slice(0, 5).map((t) => `${t.label} ${at(t.p)}`).join(', ');
  const more = missing.size > 5 ? ` und ${missing.size - 5} weitere` : '';
  problems.push(`Nicht von jedem Startpunkt aus erreichbar: ${list}${more}.`);
}

/** Wie visualsMatchMap im Client: jede Wand braucht Grafik in ground oder below. */
function checkCityVisuals(map: MapData, visuals: MapVisuals | null, problems: string[]): void {
  if (!visuals) return; // fehlende Ebene "ground" meldet checkLayers
  for (let i = 0; i < map.solid.length; i++) {
    if (map.solid[i] && !visuals.ground[i] && !visuals.below[i]) {
      problems.push(
        `Wand ohne Grafik bei ${cell(i, map.cols)}: jede Wandkachel braucht eine Kachel in "ground" oder "below" (sonst zeichnet das Spiel die Karte einfarbig).`,
      );
      return;
    }
  }
}

/**
 * Prüft eine Tiled-Karte (JSON) gegen die Regeln der Spec §2 und liest sie. Sammelt alle Probleme als
 * deutsche Sätze. Ist die Grundform kaputt (Größe, Ebenen, Kachelsatz, Objektform), endet die Prüfung danach.
 */
export function validateTiledMap(json: unknown, opts: ValidateOptions = {}): ValidatedMap {
  const rules = opts.rules ?? CUSTOM_MAP_RULES;
  const problems: string[] = [];
  let name: string | null = null;
  let tileset: TilesetId = opts.tileset ?? 'city';
  const result = (map: MapData | null, visuals: MapVisuals | null): ValidatedMap => ({ problems, name, tileset, map, visuals });
  if (!isRecord(json)) {
    problems.push('Die Datei ist keine Tiled-Karte im JSON-Format.');
    return result(null, null);
  }

  const props = readProperties(json.properties, problems);
  if (props.has('name')) {
    name = cleanMapName(props.get('name'));
    if (name === null) problems.push(`Eigenschaft "name" muss Text mit 1 bis ${MAX_MAP_NAME_LENGTH} Zeichen sein.`);
  }
  if (props.has('tileset')) {
    const t = props.get('tileset');
    if (!isTilesetId(t)) problems.push(`Eigenschaft "tileset" muss "city" oder "retro" sein, nicht ${JSON.stringify(t)}.`);
    else if (!opts.tileset) tileset = t;
  }

  if (json.infinite === true) problems.push('Unendliche Karten gehen nicht; in den Karteneigenschaften "Unendlich" ausschalten.');
  if (json.orientation !== 'orthogonal') problems.push('Die Ausrichtung muss "Orthogonal" sein.');
  if (json.tilewidth !== TILE || json.tileheight !== TILE) problems.push(`Kachelgröße muss ${TILE} x ${TILE} Pixel sein.`);
  const { width, height } = json;
  const sizeOk =
    isInt(width) && isInt(height) && width >= MAP_MIN_COLS && height >= MAP_MIN_ROWS && width <= MAP_MAX_COLS && height <= MAP_MAX_ROWS;
  if (!sizeOk) {
    problems.push(
      `Größe ${String(width)} x ${String(height)} Kacheln; erlaubt sind ${MAP_MIN_COLS} x ${MAP_MIN_ROWS} bis ${MAP_MAX_COLS} x ${MAP_MAX_ROWS}.`,
    );
  }
  checkTilesets(json.tilesets, problems);
  checkLayers(json, tileset, sizeOk, problems);
  checkObjectShapes(json, problems);
  if (problems.length > 0) return result(null, null);

  let map: MapData;
  let visuals: MapVisuals | null;
  try {
    map = parseTiledMap(json);
    visuals = parseTiledVisuals(json);
  } catch (e) {
    problems.push(`Tiled-Datei nicht lesbar: ${e instanceof Error ? e.message : String(e)}.`);
    return result(null, null);
  }
  checkCounts(map, rules, problems);
  checkPlacement(map, problems);
  checkReachable(map, problems);
  if (tileset === 'city') checkCityVisuals(map, visuals, problems);
  return result(map, visuals);
}
```

Hinweis: Die Name-/Tileset-Probleme aus den Eigenschaften zählen zu `problems` und beenden die Prüfung vor dem Lesen (R10); der Test `'checks the name and tileset properties'` erwartet genau die dort aufgeführten Sätze.

- [ ] **Step 5: Tests laufen lassen**

Run: `cd packages/core; npx vitest run test/validate.test.ts`
Expected: PASS (31 Tests). Danach `npm test` und `npm run typecheck` im Wurzelordner: grün.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/maps/validate.ts packages/core/test/mapFixture.ts packages/core/test/validate.test.ts
git commit -m "feat(core): Kartenprüfung validateTiledMap mit deutschen Problemsätzen

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Kartenliste mit eigenen Karten, `MapId` als Zeichenkette

**Files:**
- Create: `packages/core/src/maps/mapDef.ts`
- Create: `packages/core/src/maps/customMaps.ts`
- Create: `packages/core/src/maps/custom/index.ts`
- Modify: `packages/core/src/maps/index.ts` (ganz ersetzen)
- Modify: `packages/core/test/maps.test.ts` (ganz ersetzen)
- Modify: `packages/core/test/city-visuals.test.ts:185`
- Create: `packages/core/test/custom-maps.test.ts`
- Create: `packages/core/test/all-maps.test.ts`
- Modify: `packages/client/src/textureKeys.ts:1-6`

**Interfaces:**
- Consumes: `validateTiledMap`, `CUSTOM_MAP_RULES`, `BUILTIN_MAP_RULES` (Task 2); `BUILTIN_MAP_IDS`, `isMapIdSyntax`, `MAX_MAP_ID_LENGTH`, `TilesetId`, `BuiltinMapId` (Task 1); `fixtureMap`, `fixtureCityMap` (Task 2).
- Produces: `MapId = string`, `MapDef` (mit `builtin: boolean`), `CustomMapSource`, `mapProblemsText`, `customMapIdProblem`, `customMapDef`, `customMapDefs`, `CUSTOM_MAP_SOURCES`, `buildRegistry`, `MAP_DEFS`, `MapListEntry`, `MAP_LIST`, `isMapId`, `mapName`, `stepMapId`, `DEFAULT_MAP_ID: BuiltinMapId`, `MAP_VISUALS`, `CITY_MAP`, `MAP_SOURCES`; alles plus `mapIds.ts` und `validate.ts` über `@pfandraiders/core` öffentlich.

- [ ] **Step 1: Tests der Registrierung schreiben**

`packages/core/test/custom-maps.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildRegistry, customMapDef, customMapDefs, customMapIdProblem, MAP_DEFS, mapProblemsText } from '../src/maps';
import type { CustomMapSource } from '../src/maps';
import { fixtureCityMap, fixtureMap } from './mapFixture';

const src = (id: string, json: unknown = fixtureMap()): CustomMapSource => ({ id, file: `${id}.tiled.json`, json });
const BUILTIN = new Set(['city', 'retro']);

describe('customMapIdProblem', () => {
  it('accepts a free, well-formed id', () => {
    expect(customMapIdProblem('park-2', BUILTIN)).toBeNull();
  });

  it('names bad ids, built-in ids and duplicates', () => {
    expect(customMapIdProblem('Park', BUILTIN)).toBe(
      'Kennung "Park" ist ungültig: erlaubt sind a-z, 0-9 und "-", 1 bis 24 Zeichen (Dateiname ohne .tiled.json).',
    );
    expect(customMapIdProblem('retro', BUILTIN)).toBe('Kennung "retro" gehört einer eingebauten Karte; bitte die Datei umbenennen.');
    expect(customMapIdProblem('park', new Set(['park']))).toBe('Kennung "park" gibt es doppelt.');
  });
});

describe('customMapDef', () => {
  it('turns a valid map into a registry entry with name and tileset from the properties', () => {
    const def = customMapDef(src('test-1'), BUILTIN);
    expect(def).toMatchObject({ id: 'test-1', name: 'Testkarte', tileset: 'retro', visuals: null, builtin: false });
    expect(def.map.spawns).toHaveLength(8);
  });

  it('keeps the visuals of a city map', () => {
    const def = customMapDef(src('stadt-2', fixtureCityMap()), BUILTIN);
    expect(def.tileset).toBe('city');
    expect(def.visuals?.cols).toBe(32);
  });

  it('falls back to the id as name', () => {
    const m = fixtureMap();
    m.properties = m.properties.filter((p) => p.name !== 'name');
    expect(customMapDef(src('ohne-name', m), BUILTIN).name).toBe('ohne-name');
  });

  it('rejects a custom map named like a built-in map', () => {
    expect(() => customMapDef(src('city'), BUILTIN)).toThrow(
      'Eigene Karte city.tiled.json ist ungültig:\n  - Kennung "city" gehört einer eingebauten Karte; bitte die Datei umbenennen.',
    );
  });

  it('names the file and lists every problem of an invalid map', () => {
    const m = fixtureMap();
    const objects = m.layers[1].objects as Record<string, unknown>[];
    m.layers[1].objects = objects.filter((o) => o.type !== 'spawn' && o.type !== 'dropoff');
    let message = '';
    try {
      customMapDef(src('kaputt', m), BUILTIN);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message.split('\n')).toEqual([
      'Eigene Karte kaputt.tiled.json ist ungültig:',
      '  - Startpunkte (spawn): 0, nötig sind genau 8.',
      '  - Pfandautomaten (dropoff): 0, nötig ist mindestens 1.',
    ]);
  });

  it('formats problem lists', () => {
    expect(mapProblemsText('a.tiled.json', ['eins', 'zwei'])).toBe('Eigene Karte a.tiled.json ist ungültig:\n  - eins\n  - zwei');
  });
});

describe('customMapDefs and buildRegistry', () => {
  it('keeps the given order and rejects duplicates', () => {
    expect(customMapDefs([src('b'), src('a')]).map((d) => d.id)).toEqual(['b', 'a']);
    expect(() => customMapDefs([src('a'), src('a')])).toThrow(/gibt es doppelt/);
  });

  it('puts the built-in maps first and protects their ids', () => {
    expect(buildRegistry([MAP_DEFS.city], [src('zz'), src('aa')]).map((d) => d.id)).toEqual(['city', 'zz', 'aa']);
    expect(() => buildRegistry([MAP_DEFS.city], [src('city')])).toThrow(/eingebauten Karte/);
  });
});
```

`packages/core/test/all-maps.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createGame } from '../src/game';
import { step } from '../src/step';
import { NO_INPUT } from '../src/types';
import type { Input } from '../src/types';
import { BUILTIN_MAP_RULES, CUSTOM_MAP_RULES, MAP_DEFS, MAP_LIST, MAP_SOURCES, validateTiledMap } from '../src/maps';
import { MAX_ROOM_PLAYERS } from '../src/protocol';

const jsonOf = (id: string): unknown => MAP_SOURCES.find((s) => s.id === id)?.json;
const DIRS = [-1, 0, 1] as const;

describe('every registered map', () => {
  it('has a Tiled source for each list entry, in list order', () => {
    expect(MAP_SOURCES.map((s) => s.id)).toEqual(MAP_LIST.map((m) => m.id));
  });

  for (const { id } of MAP_LIST) {
    it(`${id} passes its rules and matches its registry entry`, () => {
      const def = MAP_DEFS[id];
      const v = def.builtin
        ? validateTiledMap(jsonOf(id), { rules: BUILTIN_MAP_RULES, tileset: def.tileset })
        : validateTiledMap(jsonOf(id), { rules: CUSTOM_MAP_RULES });
      expect(v.problems).toEqual([]);
      expect(v.map).toEqual(def.map);
      expect(v.tileset).toBe(def.tileset);
    });

    it(`${id} survives a short game with a full room`, () => {
      const ids = Array.from({ length: MAX_ROOM_PLAYERS }, (_, i) => `p${i + 1}`);
      const s = createGame(7, MAP_DEFS[id].map, ids, { countdownMs: 0, roundMs: 60_000 });
      const inputs: Record<string, Input> = {};
      ids.forEach((p, i) => {
        inputs[p] = { ...NO_INPUT, moveX: DIRS[i % 3], moveY: DIRS[(i + 1) % 3], action: i % 2 === 0 };
      });
      for (let t = 0; t < 1300; t++) step(s, inputs, 50);
      expect(s.phase).toBe('ended');
    });
  }
});

describe('built-in exception (ruling R1)', () => {
  it('city also passes the strict custom rules', () => {
    expect(validateTiledMap(jsonOf('city'), { rules: CUSTOM_MAP_RULES, tileset: 'city' }).problems).toEqual([]);
  });

  it('retro fails the strict rules only on spawns and spots', () => {
    expect(validateTiledMap(jsonOf('retro'), { rules: CUSTOM_MAP_RULES, tileset: 'retro' }).problems).toEqual([
      'Startpunkte (spawn): 4, nötig sind genau 8.',
      'Spots (spot): 17, nötig sind mindestens 20.',
    ]);
  });
});
```

`packages/core/test/maps.test.ts` ganz ersetzen durch:

```ts
import { describe, expect, it } from 'vitest';
import { CITY_MAP, DEFAULT_MAP_ID, isMapId, MAP_DEFS, MAP_LIST, mapName, stepMapId } from '../src/maps';
import { RETRO_MAP } from '../src/maps/retro';

describe('map registry', () => {
  it('isMapId accepts registered maps only', () => {
    expect(isMapId('city')).toBe(true);
    expect(isMapId('retro')).toBe(true);
    for (const v of ['x', '', 'CITY', null, undefined, 7, {}, [], '__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
      expect(isMapId(v)).toBe(false);
    }
  });

  it('MAP_DEFS has no prototype', () => {
    expect(Object.getPrototypeOf(MAP_DEFS)).toBeNull();
    expect(MAP_DEFS.constructor).toBeUndefined();
    expect(Object.isFrozen(MAP_DEFS)).toBe(true);
  });

  it('lists the built-in maps first and every entry with valid map data', () => {
    expect(MAP_LIST.slice(0, 2)).toEqual([
      { id: 'city', name: 'Stadt' },
      { id: 'retro', name: 'Retro' },
    ]);
    expect(Object.keys(MAP_DEFS).sort()).toEqual(MAP_LIST.map((m) => m.id).sort());
    for (const { id, name } of MAP_LIST) {
      const def = MAP_DEFS[id];
      expect(def.id).toBe(id);
      expect(def.name).toBe(name);
      expect(def.map.solid.length).toBe(def.map.cols * def.map.rows);
      expect(def.map.spawns.length).toBeGreaterThan(0);
    }
    expect(MAP_DEFS.city).toMatchObject({ tileset: 'city', builtin: true });
    expect(MAP_DEFS.retro).toMatchObject({ tileset: 'retro', builtin: true, visuals: null });
  });

  it('sorts custom maps by id after the built-in maps', () => {
    const custom = MAP_LIST.slice(2).map((m) => m.id);
    expect(custom).toEqual([...custom].sort());
    for (const id of custom) expect(MAP_DEFS[id].builtin).toBe(false);
  });

  it('CITY_MAP is the default map', () => {
    expect(DEFAULT_MAP_ID).toBe('city');
    expect(CITY_MAP).toBe(MAP_DEFS[DEFAULT_MAP_ID].map);
  });

  it('retro points at RETRO_MAP', () => {
    expect(MAP_DEFS.retro.map).toBe(RETRO_MAP);
  });

  it('mapName returns the display name or the id itself', () => {
    expect(mapName('city')).toBe('Stadt');
    expect(mapName('retro')).toBe('Retro');
    expect(mapName('moon')).toBe('moon');
  });

  it('stepMapId cycles through MAP_LIST and starts over for unknown ids', () => {
    const ids = MAP_LIST.map((m) => m.id);
    expect(stepMapId(ids[0], 1)).toBe(ids[1 % ids.length]);
    expect(stepMapId(ids[0], -1)).toBe(ids[ids.length - 1]);
    expect(stepMapId(ids[ids.length - 1], 1)).toBe(ids[0]);
    expect(stepMapId('moon', 1)).toBe(ids[0]);
    expect(stepMapId('moon', -1)).toBe(ids[0]);
  });
});
```

In `packages/core/test/city-visuals.test.ts` Zeile 185

```ts
    expect(Object.keys(MAP_DEFS)).toEqual(['city', 'retro']);
```

ersetzen durch

```ts
    expect(MAP_LIST.slice(0, 2).map((m) => m.id)).toEqual(['city', 'retro']);
```

und den Import `import { MAP_DEFS, MAP_VISUALS } from '../src/maps';` (Zeile 5) ersetzen durch `import { MAP_DEFS, MAP_LIST, MAP_VISUALS } from '../src/maps';`.

- [ ] **Step 2: Tests laufen lassen, sie schlagen fehl**

Run: `cd packages/core; npx vitest run test/custom-maps.test.ts test/all-maps.test.ts test/maps.test.ts`
Expected: FAIL (`buildRegistry`, `MAP_LIST`, `MAP_SOURCES` usw. nicht exportiert).

- [ ] **Step 3: Typen in `mapDef.ts`**

`packages/core/src/maps/mapDef.ts`:

```ts
import type { MapVisuals } from '../tiled';
import type { MapData } from '../types';
import type { TilesetId } from './mapIds';

/** Kennung einer spielbaren Karte: eingebaut (city, retro) oder eigene Karte (Dateiname). Gültig ist nur, was isMapId kennt. */
export type MapId = string;

export interface MapDef {
  id: MapId;
  name: string;
  /** Welcher Kachelsatz die Karte zeichnet (der Client wählt danach die Grafik). */
  tileset: TilesetId;
  map: MapData;
  /** Grafikebenen aus der Tiled-Datei; `null` = der Client zeichnet die Karte aus den Kacheltypen. */
  visuals: MapVisuals | null;
  /** Eingebaute Karte (Regeln BUILTIN_MAP_RULES) oder eigene aus `custom/` (CUSTOM_MAP_RULES) */
  builtin: boolean;
}

/** Eine eigene Karte aus `packages/core/src/maps/custom/` (die Liste erzeugt `npm run maps`). */
export interface CustomMapSource {
  id: string;
  file: string;
  json: unknown;
}
```

- [ ] **Step 4: Registrierung eigener Karten in `customMaps.ts`**

`packages/core/src/maps/customMaps.ts`:

```ts
import { BUILTIN_MAP_IDS, isMapIdSyntax, MAX_MAP_ID_LENGTH } from './mapIds';
import type { CustomMapSource, MapDef } from './mapDef';
import { CUSTOM_MAP_RULES, validateTiledMap } from './validate';

/** Fehlertext für eine ungültige eigene Karte: Dateiname, dann jedes Problem auf einer eigenen Zeile. */
export function mapProblemsText(file: string, problems: readonly string[]): string {
  return [`Eigene Karte ${file} ist ungültig:`, ...problems.map((p) => `  - ${p}`)].join('\n');
}

/** Problem mit der Kennung einer eigenen Karte oder null. `taken` = schon vergebene Kennungen (inklusive eingebauter). */
export function customMapIdProblem(id: string, taken: ReadonlySet<string>): string | null {
  if (!isMapIdSyntax(id)) {
    return `Kennung "${id}" ist ungültig: erlaubt sind a-z, 0-9 und "-", 1 bis ${MAX_MAP_ID_LENGTH} Zeichen (Dateiname ohne .tiled.json).`;
  }
  if ((BUILTIN_MAP_IDS as readonly string[]).includes(id)) {
    return `Kennung "${id}" gehört einer eingebauten Karte; bitte die Datei umbenennen.`;
  }
  if (taken.has(id)) return `Kennung "${id}" gibt es doppelt.`;
  return null;
}

/** Prüft eine eigene Karte und macht daraus einen Eintrag der Kartenliste. Wirft mit Dateiname und allen Problemen. */
export function customMapDef(src: CustomMapSource, taken: ReadonlySet<string>): MapDef {
  const problems: string[] = [];
  const idProblem = customMapIdProblem(src.id, taken);
  if (idProblem) problems.push(idProblem);
  const v = validateTiledMap(src.json, { rules: CUSTOM_MAP_RULES });
  problems.push(...v.problems);
  if (problems.length > 0 || !v.map) throw new Error(mapProblemsText(src.file, problems));
  return {
    id: src.id,
    name: v.name ?? src.id,
    tileset: v.tileset,
    map: v.map,
    // retro zeichnet aus den Kacheltypen; Grafikebenen einer retro-Karte bleiben ungenutzt
    visuals: v.tileset === 'city' ? v.visuals : null,
    builtin: false,
  };
}

/** Alle eigenen Karten in der gegebenen Reihenfolge; `reserved` = Kennungen der eingebauten Karten. */
export function customMapDefs(sources: readonly CustomMapSource[], reserved: readonly string[] = BUILTIN_MAP_IDS): MapDef[] {
  const taken = new Set<string>(reserved);
  return sources.map((src) => {
    const def = customMapDef(src, taken);
    taken.add(def.id);
    return def;
  });
}
```

- [ ] **Step 5: Leere generierte Liste `custom/index.ts`**

`packages/core/src/maps/custom/index.ts` (genau diese drei Zeilen plus Leerzeile; Task 4 erzeugt dieselbe Ausgabe):

```ts
// Erzeugt von `npm run maps` (packages/core/scripts/generateCustomMaps.ts). Nicht von Hand ändern.
import type { CustomMapSource } from '../mapDef';

export const CUSTOM_MAP_SOURCES: readonly CustomMapSource[] = [];
```

- [ ] **Step 6: `packages/core/src/maps/index.ts` ganz ersetzen**

```ts
import type { MapData } from '../types';
import type { MapVisuals } from '../tiled';
import cityJson from './city.tiled.json';
import retroJson from './retro.tiled.json';
import { CITY_TILED_MAP, getCityVisuals } from './city';
import { RETRO_MAP } from './retro';
import { CUSTOM_MAP_SOURCES } from './custom/index';
import { customMapDefs } from './customMaps';
import type { BuiltinMapId } from './mapIds';
import type { CustomMapSource, MapDef, MapId } from './mapDef';

export type { CustomMapSource, MapDef, MapId } from './mapDef';
export * from './mapIds';
export * from './validate';
export { customMapDef, customMapDefs, customMapIdProblem, mapProblemsText } from './customMaps';
export { CUSTOM_MAP_SOURCES } from './custom/index';

/** Eingebaute Karten in der Reihenfolge der Auswahl; city zuerst (Standard). Die Grafik der Stadt wird erst bei Bedarf geparst. */
const BUILTIN_DEFS: readonly MapDef[] = [
  {
    id: 'city',
    name: 'Stadt',
    tileset: 'city',
    map: CITY_TILED_MAP,
    builtin: true,
    get visuals() {
      return getCityVisuals();
    },
  },
  { id: 'retro', name: 'Retro', tileset: 'retro', map: RETRO_MAP, visuals: null, builtin: true },
];

/**
 * Kartenliste: eingebaute zuerst, dann die eigenen in der Reihenfolge der Quellen (`npm run maps` sortiert nach Kennung).
 * Eigene Karten werden dabei geprüft; eine ungültige wirft mit Dateiname und allen Problemen.
 */
export function buildRegistry(builtins: readonly MapDef[], customs: readonly CustomMapSource[]): MapDef[] {
  return [...builtins, ...customMapDefs(customs, builtins.map((d) => d.id))];
}

const ALL: readonly MapDef[] = buildRegistry(BUILTIN_DEFS, CUSTOM_MAP_SOURCES);

/** Karten nach Kennung. Ohne Prototyp ("__proto__", "constructor" sind keine Karten); nachschlagen erst nach isMapId. */
export const MAP_DEFS: Readonly<Record<MapId, MapDef>> = Object.freeze(
  ALL.reduce((acc, d) => {
    acc[d.id] = d;
    return acc;
  }, Object.create(null) as Record<MapId, MapDef>),
);

export interface MapListEntry {
  id: MapId;
  name: string;
}

/** Auswahlliste für Lobby und Raumliste: eingebaute Karten, dann eigene nach Kennung. */
export const MAP_LIST: readonly MapListEntry[] = Object.freeze(ALL.map((d) => Object.freeze({ id: d.id, name: d.name })));

const KNOWN: ReadonlySet<string> = new Set(ALL.map((d) => d.id));

export function isMapId(v: unknown): v is MapId {
  return typeof v === 'string' && KNOWN.has(v);
}

/** Anzeigename einer Karte; unbekannte Kennungen erscheinen so, wie sie sind. */
export function mapName(id: string): string {
  return isMapId(id) ? MAP_DEFS[id].name : id;
}

/** Nächste oder vorige Karte in MAP_LIST, zyklisch; eine unbekannte Kennung ergibt die erste Karte. */
export function stepMapId(id: string, dir: -1 | 1): MapId {
  const n = MAP_LIST.length;
  const i = MAP_LIST.findIndex((m) => m.id === id);
  if (i < 0) return MAP_LIST[0].id;
  return MAP_LIST[(i + dir + n) % n].id;
}

export const DEFAULT_MAP_ID: BuiltinMapId = 'city';

/** Grafikebenen der eingebauten Karten, lazy: erst der Zugriff auf city parst die Tiled-Ebenen. */
export const MAP_VISUALS: Readonly<Record<BuiltinMapId, MapVisuals | null>> = {
  get city() {
    return getCityVisuals();
  },
  retro: null,
};

/** Die Standardkarte (`MAP_DEFS[DEFAULT_MAP_ID].map`). */
export const CITY_MAP: MapData = MAP_DEFS[DEFAULT_MAP_ID].map;

/** Tiled-JSON jeder Karte in der Reihenfolge von MAP_LIST (für den Test über alle Karten). */
export const MAP_SOURCES: readonly { id: MapId; json: unknown }[] = [
  { id: 'city', json: cityJson },
  { id: 'retro', json: retroJson },
  ...CUSTOM_MAP_SOURCES.map((s) => ({ id: s.id, json: s.json })),
];

export { CITY_TILED_MAP, getCityVisuals } from './city';
export { RETRO_MAP, RETRO_ASCII_MAP } from './retro';
```

- [ ] **Step 7: Client nutzt den Kachelsatz-Typ des Kerns**

In `packages/client/src/textureKeys.ts` die Zeilen 1-6

```ts
import type { MapId, SpotType } from '@pfandraiders/core';
import type { PlayerFrame } from './sprites/characters';
import type { TileKey } from './tiles';

/** Kachelsatz einer Karte; Kacheln, Spots und Objekte tragen ihn als Präfix, Figuren nicht. */
export type TilesetId = MapId;
```

ersetzen durch

```ts
import type { MapId, SpotType, TilesetId } from '@pfandraiders/core';
import type { PlayerFrame } from './sprites/characters';
import type { TileKey } from './tiles';

/** Kachelsatz einer Karte (city oder retro, aus dem Kern); Kacheln, Spots und Objekte tragen ihn als Präfix, Figuren nicht. */
export type { TilesetId };
```

- [ ] **Step 8: Tests und Typecheck laufen lassen**

Run: `cd packages/core; npx vitest run test/custom-maps.test.ts test/all-maps.test.ts test/maps.test.ts test/city-visuals.test.ts test/tiled.test.ts`
Expected: PASS.
Run: `npm test` und `npm run typecheck` im Wurzelordner. Expected: grün (Server und Client nutzen `MapId` nur als Zeichenkette und `MAP_DEFS[...]`).

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/maps/mapDef.ts packages/core/src/maps/customMaps.ts packages/core/src/maps/custom/index.ts packages/core/src/maps/index.ts packages/core/test/maps.test.ts packages/core/test/city-visuals.test.ts packages/core/test/custom-maps.test.ts packages/core/test/all-maps.test.ts packages/client/src/textureKeys.ts
git commit -m "feat(core): Kartenliste mit eigenen Karten aus maps/custom

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `npm run maps`

**Files:**
- Create: `packages/core/scripts/customIndex.ts`
- Create: `packages/core/scripts/generateCustomMaps.ts`
- Modify: `package.json` (Wurzel, `scripts`)
- Create: `packages/core/test/custom-index.test.ts`

**Interfaces:**
- Consumes: `customMapIdProblem`, `mapProblemsText` (Task 3, aus `src/maps/customMaps.ts`, **nicht** aus `src/maps/index.ts`); `validateTiledMap`, `CUSTOM_MAP_RULES` (Task 2).
- Produces: `CUSTOM_MAP_SUFFIX`, `CUSTOM_INDEX_FILE`, `customMapIds(files)`, `importName(id)`, `customIndexSource(ids)`; Wurzel-Skript `npm run maps`.

- [ ] **Step 1: Tests schreiben**

`packages/core/test/custom-index.test.ts`:

```ts
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { customIndexSource, customMapIds, importName } from '../scripts/customIndex';

const CUSTOM_DIR = fileURLToPath(new URL('../src/maps/custom/', import.meta.url));
const HEADER = '// Erzeugt von `npm run maps` (packages/core/scripts/generateCustomMaps.ts). Nicht von Hand ändern.';

describe('customMapIds', () => {
  it('takes ids from *.tiled.json files, sorted, and skips index.ts', () => {
    expect(customMapIds(['zeta.tiled.json', 'index.ts', 'alpha-2.tiled.json'])).toEqual({ ids: ['alpha-2', 'zeta'], problems: [] });
  });

  it('reports files that do not belong into the folder', () => {
    const r = customMapIds(['notizen.txt', 'Gross.tiled.json', 'city.tiled.json', 'karte.json', 'ok.tiled.json']);
    expect(r.ids).toEqual(['ok']);
    expect(r.problems).toEqual([
      'Datei Gross.tiled.json: Kennung "Gross" ist ungültig: erlaubt sind a-z, 0-9 und "-", 1 bis 24 Zeichen (Dateiname ohne .tiled.json).',
      'Datei city.tiled.json: Kennung "city" gehört einer eingebauten Karte; bitte die Datei umbenennen.',
      'Datei karte.json gehört nicht in den Kartenordner (nur <kennung>.tiled.json).',
      'Datei notizen.txt gehört nicht in den Kartenordner (nur <kennung>.tiled.json).',
    ]);
  });
});

describe('customIndexSource', () => {
  it('writes an empty, typed list without imports', () => {
    expect(customIndexSource([])).toBe(
      [HEADER, "import type { CustomMapSource } from '../mapDef';", '', 'export const CUSTOM_MAP_SOURCES: readonly CustomMapSource[] = [];', ''].join('\n'),
    );
  });

  it('imports every map, sorted, with valid identifiers', () => {
    expect(customIndexSource(['zeta', '2-park', 'alpha'])).toBe(
      [
        HEADER,
        "import type { CustomMapSource } from '../mapDef';",
        "import map_2_park from './2-park.tiled.json';",
        "import map_alpha from './alpha.tiled.json';",
        "import map_zeta from './zeta.tiled.json';",
        '',
        'export const CUSTOM_MAP_SOURCES: readonly CustomMapSource[] = [',
        "  { id: '2-park', file: '2-park.tiled.json', json: map_2_park },",
        "  { id: 'alpha', file: 'alpha.tiled.json', json: map_alpha },",
        "  { id: 'zeta', file: 'zeta.tiled.json', json: map_zeta },",
        '];',
        '',
      ].join('\n'),
    );
  });

  it('importName replaces dashes', () => {
    expect(importName('2-park-a')).toBe('map_2_park_a');
  });
});

describe('committed custom/index.ts', () => {
  it('matches the generator output for the folder (run npm run maps after adding a map)', () => {
    const { ids, problems } = customMapIds(readdirSync(CUSTOM_DIR));
    expect(problems).toEqual([]);
    // Git checkt unter Windows mit CRLF aus (core.autocrlf): vergleichen ohne Zeilenende-Unterschied
    const committed = readFileSync(join(CUSTOM_DIR, 'index.ts'), 'utf8').replace(/\r\n/g, '\n');
    expect(committed).toBe(customIndexSource(ids));
  });
});
```

- [ ] **Step 2: Tests laufen lassen, sie schlagen fehl**

Run: `cd packages/core; npx vitest run test/custom-index.test.ts`
Expected: FAIL mit `Cannot find module '../scripts/customIndex'`.

- [ ] **Step 3: Reiner Teil des Generators**

`packages/core/scripts/customIndex.ts`:

```ts
import { customMapIdProblem } from '../src/maps/customMaps';

/** Endung eigener Karten im Ordner `src/maps/custom/`. */
export const CUSTOM_MAP_SUFFIX = '.tiled.json';
/** Die erzeugte Importliste im selben Ordner. */
export const CUSTOM_INDEX_FILE = 'index.ts';
const HEADER = '// Erzeugt von `npm run maps` (packages/core/scripts/generateCustomMaps.ts). Nicht von Hand ändern.';

/** Kennungen aus den Dateinamen des Kartenordners (sortiert) und Probleme mit Dateien, die nicht passen. */
export function customMapIds(files: readonly string[]): { ids: string[]; problems: string[] } {
  const ids: string[] = [];
  const problems: string[] = [];
  for (const file of [...files].sort()) {
    if (file === CUSTOM_INDEX_FILE) continue;
    if (!file.endsWith(CUSTOM_MAP_SUFFIX)) {
      problems.push(`Datei ${file} gehört nicht in den Kartenordner (nur <kennung>${CUSTOM_MAP_SUFFIX}).`);
      continue;
    }
    const id = file.slice(0, -CUSTOM_MAP_SUFFIX.length);
    const problem = customMapIdProblem(id, new Set(ids));
    if (problem) {
      problems.push(`Datei ${file}: ${problem}`);
      continue;
    }
    ids.push(id);
  }
  return { ids, problems };
}

/** Bezeichner für den Import einer Karte (Kennungen enthalten nur a-z, 0-9 und '-'). */
export function importName(id: string): string {
  return `map_${id.replace(/-/g, '_')}`;
}

/** Inhalt von `custom/index.ts`: deterministisch, nach Kennung sortiert, LF-Zeilenenden. */
export function customIndexSource(ids: readonly string[]): string {
  const sorted = [...ids].sort();
  const lines = [HEADER, "import type { CustomMapSource } from '../mapDef';"];
  for (const id of sorted) lines.push(`import ${importName(id)} from './${id}${CUSTOM_MAP_SUFFIX}';`);
  lines.push('');
  if (sorted.length === 0) {
    lines.push('export const CUSTOM_MAP_SOURCES: readonly CustomMapSource[] = [];');
  } else {
    lines.push('export const CUSTOM_MAP_SOURCES: readonly CustomMapSource[] = [');
    for (const id of sorted) lines.push(`  { id: '${id}', file: '${id}${CUSTOM_MAP_SUFFIX}', json: ${importName(id)} },`);
    lines.push('];');
  }
  return lines.join('\n') + '\n';
}
```

- [ ] **Step 4: Skript mit Dateizugriff**

`packages/core/scripts/generateCustomMaps.ts`:

```ts
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mapProblemsText } from '../src/maps/customMaps';
import { CUSTOM_MAP_RULES, validateTiledMap } from '../src/maps/validate';
import { CUSTOM_INDEX_FILE, CUSTOM_MAP_SUFFIX, customIndexSource, customMapIds } from './customIndex';

/**
 * Prüft alle eigenen Karten in `src/maps/custom/` und schreibt `custom/index.ts` neu.
 * Aufruf im Wurzelordner: `npm run maps`. Bei einem Problem wird nichts geschrieben (Exit-Code 1).
 */
const dir = fileURLToPath(new URL('../src/maps/custom/', import.meta.url));
const { ids, problems } = customMapIds(readdirSync(dir));
const errors = [...problems];

for (const id of ids) {
  const file = `${id}${CUSTOM_MAP_SUFFIX}`;
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(join(dir, file), 'utf8').replace(/^﻿/, ''));
  } catch (e) {
    errors.push(mapProblemsText(file, [`kein gültiges JSON (${e instanceof Error ? e.message : String(e)})`]));
    continue;
  }
  const v = validateTiledMap(json, { rules: CUSTOM_MAP_RULES });
  if (v.problems.length > 0 || !v.map) {
    errors.push(mapProblemsText(file, v.problems));
    continue;
  }
  console.log(`ok  ${file}: "${v.name ?? id}", ${v.map.cols} x ${v.map.rows} Kacheln, Kachelsatz ${v.tileset}`);
}

if (errors.length > 0) {
  for (const e of errors) console.error(e);
  console.error(`${CUSTOM_INDEX_FILE} wurde nicht geändert.`);
  process.exit(1);
}

const out = join(dir, CUSTOM_INDEX_FILE);
const next = customIndexSource(ids);
let prev = '';
try {
  prev = readFileSync(out, 'utf8').replace(/\r\n/g, '\n');
} catch {
  // Datei fehlt noch: wird gleich geschrieben
}
if (prev === next) {
  console.log(`unverändert: ${out} (${ids.length} eigene Karten)`);
} else {
  writeFileSync(out, next);
  console.log(`geschrieben: ${out} (${ids.length} eigene Karten)`);
}
```

- [ ] **Step 5: Wurzel-Skript eintragen**

In `package.json` (Wurzel) in `scripts` nach `"logo": "tsx scripts/generate-logo.mjs"` ein Komma setzen und anfügen:

```json
    "maps": "tsx packages/core/scripts/generateCustomMaps.ts"
```

- [ ] **Step 6: Tests und Skript laufen lassen**

Run: `cd packages/core; npx vitest run test/custom-index.test.ts`
Expected: PASS.
Run (Wurzel): `npm run maps`
Expected: `unverändert: …custom\index.ts (0 eigene Karten)`, Exit 0, `git status` zeigt `custom/index.ts` nicht als geändert.

- [ ] **Step 7: Rauchtest von Hand (nichts davon committen)**

1. `cp packages/core/src/maps/city.tiled.json packages/core/src/maps/custom/stadt-kopie.tiled.json`
2. `npm run maps` → Zeile `ok  stadt-kopie.tiled.json: "stadt-kopie", 64 x 40 Kacheln, Kachelsatz city`, `geschrieben: … (1 eigene Karten)`.
3. `npm test -w @pfandraiders/core` → grün (der Test über alle Karten läuft auch für `stadt-kopie`).
4. `cp packages/core/src/maps/city.tiled.json packages/core/src/maps/custom/Falsch.tiled.json`, `npm run maps` → Exit 1 mit `Datei Falsch.tiled.json: Kennung "Falsch" ist ungültig …` und `index.ts wurde nicht geändert.`
5. Beide Kopien löschen, `npm run maps` → `geschrieben: … (0 eigene Karten)`; `git status` zeigt keine Änderung unter `packages/core/src/maps/custom/`.

- [ ] **Step 7b: Gesamtlauf**

Run: `npm test` und `npm run typecheck` im Wurzelordner. Expected: grün.

- [ ] **Step 8: Commit**

```bash
git add packages/core/scripts/customIndex.ts packages/core/scripts/generateCustomMaps.ts package.json packages/core/test/custom-index.test.ts
git commit -m "feat(core): npm run maps prüft eigene Karten und schreibt custom/index.ts

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Protokoll `setMap`, Karte in `lobby` und Raumliste

**Files:**
- Modify: `packages/core/src/protocol.ts` (Import Zeile 7, `RoomInfo` Zeile 59-71, `ClientMessage` Zeile 125-152, `lobby` Zeile 171-184, `parseClientMessage` Zeile 342-346)
- Modify: `packages/core/test/protocolRooms.test.ts`
- Modify: `packages/server/src/room.ts` (Importe, `lobbyMessage`, `info`)
- Modify: `packages/server/test/rooms.test.ts:135`, `packages/server/test/server.test.ts:196`
- Modify: `packages/client/src/roomList.ts` (`parseRoomList`)
- Modify: `packages/client/test/roomList.test.ts`, `packages/client/test/online.test.ts:35-38, 805-815`, `packages/client/test/onlineSound.test.ts:24-26`

**Interfaces:**
- Consumes: `isMapId`, `mapName`, `cleanMapName`, `MapId` (Task 1/3).
- Produces: `ClientMessage` `{ t: 'setMap'; mapId: MapId }`; `ServerMessage['lobby']` mit `mapId: MapId; mapName: string`; `RoomInfo.mapName: string`; `parseRoomList` liefert `mapName` (bereinigt, sonst `''`).

Diese Task fasst alle Pakete an, damit nach ihr Typecheck und Tests überall grün bleiben (Global Constraints).

- [ ] **Step 1: Protokolltests schreiben**

In `packages/core/test/protocolRooms.test.ts` den Import um die Typen ergänzen (nach der bestehenden Importliste aus `'../src/protocol'`):

```ts
import type { RoomInfo, ServerMessage } from '../src/protocol';
```

und im `describe`, das `'accepts setRounds only with 1, 3, 5 or 0'` enthält, nach diesem Test anfügen:

```ts
  it('accepts setMap only with a known map id and drops extra fields', () => {
    expect(parseClientMessage({ t: 'setMap', mapId: 'retro', junk: 1 })).toEqual({ t: 'setMap', mapId: 'retro' });
    expect(parseClientMessage({ t: 'setMap', mapId: 'city' })).toEqual({ t: 'setMap', mapId: 'city' });
    for (const mapId of ['moon', '', 'CITY', ' city', '__proto__', 'constructor', 7, null, undefined, {}]) {
      expect(parseClientMessage({ t: 'setMap', mapId }), String(mapId)).toBeNull();
    }
  });

  it('carries the map in lobby messages and room list entries', () => {
    const lobby: ServerMessage = {
      t: 'lobby', room: 'ABCD', roomName: 'R', visibility: 'public', locked: false, host: 'p1', players: [],
      phase: 'lobby', roundMs: 300_000, rounds: 3, mapId: 'retro', mapName: 'Retro',
    };
    expect(lobby.t === 'lobby' && lobby.mapName).toBe('Retro');
    const info: RoomInfo = { code: 'ABCD', name: 'R', host: 'Anna', players: 1, max: 8, phase: 'lobby', locked: false, mapName: 'Stadt' };
    expect(info.mapName).toBe('Stadt');
  });
```

- [ ] **Step 2: Test laufen lassen, er schlägt fehl**

Run: `cd packages/core; npx vitest run test/protocolRooms.test.ts`
Expected: FAIL (`setMap` ergibt `null`).

- [ ] **Step 3: `protocol.ts` erweitern**

Import Zeile 7 `import type { MapId } from './maps';` ersetzen durch:

```ts
import { isMapId } from './maps';
import type { MapId } from './maps';
```

In `RoomInfo` nach `locked: boolean;` einfügen:

```ts
  /** Anzeigename der gewählten Karte */
  mapName: string;
```

In `ClientMessage` nach der Zeile `| { t: 'setRounds'; rounds: number }` einfügen:

```ts
  /** Karte wählen (nur Host, nur Lobby); unbekannte Kennungen machen die Nachricht ungültig */
  | { t: 'setMap'; mapId: MapId }
```

In der `lobby`-Variante von `ServerMessage` nach `rounds: number;` einfügen:

```ts
      /** Gewählte Karte für den nächsten Serienstart und ihr Anzeigename */
      mapId: MapId;
      mapName: string;
```

In `parseClientMessage` vor `case 'toLobby':` einfügen:

```ts
    case 'setMap':
      return isMapId(m.mapId) ? { t: 'setMap', mapId: m.mapId } : null;
```

- [ ] **Step 4: Server füllt die neuen Felder**

In `packages/server/src/room.ts` in der Werte-Importliste aus `'@pfandraiders/core'` nach `isRounds,` die Zeilen `isMapId,` und `mapName,` ergänzen (alphabetisch: `isMapId` nach `isAvatar`, `mapName` nach `MAP_DEFS`). `isMapId` wird erst in Task 6 genutzt; wer ungenutzte Importe vermeiden will, ergänzt hier nur `mapName`.

In `lobbyMessage()` nach `rounds: this.rounds(),` einfügen:

```ts
      mapId: this.mapId,
      mapName: mapName(this.mapId),
```

In `info()` nach `locked: this.locked,` einfügen:

```ts
      mapName: mapName(this.mapId),
```

In `packages/server/test/rooms.test.ts` Zeile 135 und `packages/server/test/server.test.ts` Zeile 196 im erwarteten Raumlisten-Eintrag nach `locked: true` ergänzen: `, mapName: 'Stadt'`.

- [ ] **Step 5: Client liest `mapName` in der Raumliste**

In `packages/client/src/roomList.ts` den Import Zeile 1 um `cleanMapName` ergänzen:

```ts
import { cleanMapName, MAX_LISTED_ROOMS, MAX_NAME_LENGTH, MAX_ROOM_NAME_LENGTH, MAX_ROOM_PLAYERS, ROOM_CODE_LENGTH } from '@pfandraiders/core';
```

In `parseRoomList` die Zeile

```ts
    const { code, name, host, players, max, phase, locked } = e;
```

ersetzen durch

```ts
    const { code, name, host, players, max, phase, locked, mapName } = e;
```

und

```ts
    out.push({ code, name, host, players, max, phase, locked });
```

ersetzen durch

```ts
    // Ältere Server schicken keinen Kartennamen: Eintrag behalten, Name leer (die Zeile zeigt "?")
    out.push({ code, name, host, players, max, phase, locked, mapName: cleanMapName(mapName) ?? '' });
```

- [ ] **Step 6: Client-Testdaten anpassen und Test für ältere Server**

`packages/client/test/roomList.test.ts`: in `info()` nach `locked: false,` ergänzen `mapName: 'Stadt',` und im `describe('parseRoomList')` anfügen:

```ts
  it('keeps entries without or with a broken map name and leaves the name empty', () => {
    const old: Record<string, unknown> = { ...info() };
    delete old.mapName;
    const parsed = parseRoomList([old, info({ code: 'EFGH', mapName: 'x'.repeat(25) }), { ...info({ code: 'JKLM' }), mapName: 7 }]);
    expect(parsed?.map((r) => r.mapName)).toEqual(['', '', '']);
    expect(parseRoomList([info({ mapName: ' Übung ' })])?.[0].mapName).toBe('Übung');
  });
```

`packages/client/test/online.test.ts`: in `lobbyMsg` (Zeile 37) nach `rounds: DEFAULT_ROUNDS` ergänzen `, mapId: 'city', mapName: 'Stadt'`; im Test `'stores a valid room list, calls onRooms and ignores garbage'` das Objekt `room` um `mapName: 'Stadt'` ergänzen (nach `locked: false`).

`packages/client/test/onlineSound.test.ts`: im Objekt von `lobby` (Zeile 25) nach `rounds: DEFAULT_ROUNDS,` ergänzen `mapId: 'city', mapName: 'Stadt',`.

- [ ] **Step 7: Alles laufen lassen**

Run: `cd packages/core; npx vitest run test/protocolRooms.test.ts` → PASS.
Run: `cd packages/client; npx vitest run test/roomList.test.ts test/online.test.ts test/onlineSound.test.ts` → PASS.
Run (Wurzel): `npm test` und `npm run typecheck` → grün.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/protocol.ts packages/core/test/protocolRooms.test.ts packages/server/src/room.ts packages/server/test/rooms.test.ts packages/server/test/server.test.ts packages/client/src/roomList.ts packages/client/test/roomList.test.ts packages/client/test/online.test.ts packages/client/test/onlineSound.test.ts
git commit -m "feat(core): Protokoll setMap, Karte in lobby und Raumliste

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Server – Kartenwahl im Raum, Nachrichtenweg, `MAP_ID`-Warnung

**Files:**
- Modify: `packages/server/src/room.ts` (`RoomOptions` Zeile 73-77, Felder Zeile 134-135, Konstruktor Zeile 165-166, neue Methoden nach `rounds()`, `startRound` Zeile 441, `setMap` nach `setRounds`, Doku von `toLobby`)
- Modify: `packages/server/src/server.ts` (neuer `case 'setMap'` nach `case 'setRounds'`)
- Modify: `packages/server/src/config.ts` (Import, neue Funktion `mapIdWarning`)
- Modify: `packages/server/src/index.ts:1, 23-27`
- Create: `packages/server/test/roomMap.test.ts`
- Modify: `packages/server/test/handlerRooms.test.ts`, `packages/server/test/rooms.test.ts`, `packages/server/test/config.test.ts`

**Interfaces:**
- Consumes: `isMapId`, `mapName`, `MAP_DEFS`, `MAP_LIST`, `DEFAULT_MAP_ID` (Task 3); `setMap`-Nachricht (Task 5).
- Produces: `Room.selectedMapId(): MapId`, `Room.setMap(byId: string, mapId: string): Result<void>`, `mapIdWarning(raw: string | undefined): string`.

- [ ] **Step 1: Raum-Tests schreiben**

`packages/server/test/roomMap.test.ts`:

```ts
import { CITY_MAP, DEFAULT_MAP_ID, RETRO_MAP } from '@pfandraiders/core';
import type { ServerMessage } from '@pfandraiders/core';
import { describe, expect, it } from 'vitest';
import { Room } from '../src/room';
import type { Conn, RoomOptions } from '../src/room';

class FakeConn implements Conn {
  messages: ServerMessage[] = [];
  send(msg: ServerMessage): void {
    this.messages.push(msg);
  }
  last<T extends ServerMessage['t']>(t: T): Extract<ServerMessage, { t: T }> {
    const all = this.messages.filter((m): m is Extract<ServerMessage, { t: T }> => m.t === t);
    return all[all.length - 1];
  }
}

/** Anna (Host p1) und Bob (p2) in der Lobby; eine Runde ist nach zwei Ticks vorbei (roundMs 100). */
function twoInLobby(opts: RoomOptions = {}) {
  const room = new Room('ABCD', { now: () => 0, random: () => 0.5, roundMs: 100, countdownMs: 0, ...opts });
  const conns = [new FakeConn(), new FakeConn()];
  ['Anna', 'Bob'].forEach((name, i) => {
    if (!room.join(name, conns[i]).ok) throw new Error('join failed');
  });
  const endRound = () => {
    for (let i = 0; i < 100 && room.phase === 'playing'; i++) room.tick();
  };
  const allReady = () => {
    for (const m of room.members) if (m.conn) room.setReady(m, true);
  };
  return { room, conns, endRound, allReady };
}

describe('map choice in the room', () => {
  it('starts with the server default and names it in lobby and room list', () => {
    const { room, conns } = twoInLobby();
    expect(room.selectedMapId()).toBe(DEFAULT_MAP_ID);
    expect(conns[1].last('lobby')).toMatchObject({ mapId: 'city', mapName: 'Stadt' });
    expect(room.info()).toMatchObject({ mapName: 'Stadt' });
    const retro = twoInLobby({ mapId: 'retro' });
    expect(retro.conns[0].last('lobby')).toMatchObject({ mapId: 'retro', mapName: 'Retro' });
  });

  it('falls back to the default map for an unknown map option', () => {
    expect(twoInLobby({ mapId: 'moon' }).room.selectedMapId()).toBe(DEFAULT_MAP_ID);
  });

  it('lets only the host change the map, only in the lobby', () => {
    const { room, conns, endRound } = twoInLobby();
    expect(room.setMap('p2', 'retro')).toMatchObject({ ok: false, code: 'not_host' });
    expect(room.setMap('', 'retro')).toMatchObject({ ok: false, code: 'not_host' });
    expect(room.setMap('p1', 'moon')).toMatchObject({ ok: false, code: 'bad_message' });
    expect(room.selectedMapId()).toBe('city');
    expect(room.setMap('p1', 'retro')).toEqual({ ok: true, value: undefined });
    expect(conns[1].last('lobby')).toMatchObject({ mapId: 'retro', mapName: 'Retro' });
    expect(room.info()).toMatchObject({ mapName: 'Retro' });
    room.start('p1');
    expect(room.setMap('p1', 'city')).toMatchObject({ ok: false, code: 'wrong_phase' });
    endRound();
    expect(room.phase).toBe('shop');
    expect(room.setMap('p1', 'city')).toMatchObject({ ok: false, code: 'wrong_phase' });
    expect(room.selectedMapId()).toBe('retro');
  });

  it('keeps the chosen map for every round and after toLobby', () => {
    const { room, conns, endRound, allReady } = twoInLobby();
    room.setMap('p1', 'retro');
    room.start('p1');
    expect(conns[0].last('start')).toMatchObject({ mapId: 'retro', round: 1 });
    expect(conns[0].last('start').map).toEqual(RETRO_MAP);
    endRound();
    allReady();
    expect(conns[1].last('start')).toMatchObject({ mapId: 'retro', round: 2 });
    expect(conns[1].last('start').map.cols).toBe(RETRO_MAP.cols);
    endRound();
    expect(room.endSeries('p1').ok).toBe(true);
    expect(room.phase).toBe('final');
    expect(room.toLobby('p1').ok).toBe(true);
    expect(conns[0].last('lobby')).toMatchObject({ phase: 'lobby', mapId: 'retro', mapName: 'Retro' });
    room.start('p1');
    expect(conns[0].last('start')).toMatchObject({ mapId: 'retro', round: 1 });
  });

  it('uses the map data override only until the host picks another map', () => {
    const a = twoInLobby({ map: RETRO_MAP });
    a.room.start('p1');
    expect(a.conns[0].last('start')).toMatchObject({ mapId: 'city' });
    expect(a.conns[0].last('start').map.cols).toBe(RETRO_MAP.cols);
    const b = twoInLobby({ map: RETRO_MAP });
    b.room.setMap('p1', 'retro');
    b.room.setMap('p1', 'city');
    b.room.start('p1');
    expect(b.conns[0].last('start').map.cols).toBe(CITY_MAP.cols);
  });
});
```

- [ ] **Step 2: Handler-, Manager- und Konfigurationstests anfügen**

Am Ende von `packages/server/test/handlerRooms.test.ts`:

```ts
describe('setMap', () => {
  it('routes setMap to the room with its errors', () => {
    const { send } = setup();
    const a = fakeConn();
    const b = fakeConn();
    const sa = newSession(1000);
    const sb = newSession(1000);
    send(sa, a, { t: 'create', name: 'Anna' });
    send(sb, b, { t: 'join', room: sa.room!.code, name: 'Bob' });
    const room = sa.room!;
    send(sb, b, { t: 'setMap', mapId: 'retro' });
    expect(b.sent.at(-1)).toMatchObject({ t: 'error', code: 'not_host' });
    send(sa, a, { t: 'setMap', mapId: 'moon' });
    expect(a.sent.at(-1)).toMatchObject({ t: 'error', code: 'bad_message' });
    send(sa, a, { t: 'setMap', mapId: 'retro' });
    expect(room.selectedMapId()).toBe('retro');
    expect(b.sent.at(-1)).toMatchObject({ t: 'lobby', mapId: 'retro', mapName: 'Retro' });
  });

  it('answers not_in_room without a room', () => {
    const { send } = setup();
    const c = fakeConn();
    send(newSession(1000), c, { t: 'setMap', mapId: 'retro' });
    expect(c.sent.at(-1)).toMatchObject({ t: 'error', code: 'not_in_room' });
  });
});
```

In `packages/server/test/rooms.test.ts` im `describe('RoomManager.create with options')` anfügen:

```ts
  it('opens new rooms on the map of the manager options (MAP_ID)', () => {
    const manager = new RoomManager({ mapId: 'retro' });
    const r = manager.create('Anna', conn);
    if (!r.ok) throw new Error('create failed');
    expect(r.value.room.selectedMapId()).toBe('retro');
    expect(r.value.room.info()).toMatchObject({ mapName: 'Retro' });
  });
```

In `packages/server/test/config.test.ts` die Importe ersetzen durch

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_MAP_ID, MAP_LIST } from '@pfandraiders/core';
import { mapIdWarning, parseGraceMs, parseMapId, parseRoundMs, SERVER_CONFIG } from '../src/config';
```

und im `describe('parseMapId')` anfügen:

```ts
  it('flags unknown maps and names the known ones in the warning', () => {
    expect(parseMapId(' moon ')).toEqual({ value: DEFAULT_MAP_ID, invalid: true });
    const known = MAP_LIST.map((m) => m.id).join(', ');
    expect(mapIdWarning(' moon ')).toBe(`MAP_ID=moon ist ungültig (bekannt: ${known}), Standardwert city wird genutzt.`);
    expect(mapIdWarning('moon')).toContain('city, retro');
  });
```

- [ ] **Step 3: Tests laufen lassen, sie schlagen fehl**

Run: `cd packages/server; npx vitest run test/roomMap.test.ts test/handlerRooms.test.ts test/rooms.test.ts test/config.test.ts`
Expected: FAIL (`room.selectedMapId is not a function`, `mapIdWarning` fehlt).

- [ ] **Step 4: Raum anpassen (`packages/server/src/room.ts`)**

Werte-Import um `isMapId` ergänzen (falls in Task 5 nicht geschehen).

`RoomOptions` (Zeile 73-77) ersetzen:

```ts
export interface RoomOptions {
  /** Startkarte des Raums (Standard DEFAULT_MAP_ID, Unbekanntes ebenso); der Host kann sie in der Lobby ändern (setMap). */
  mapId?: MapId;
  /** Überschreibt die Kartendaten (nur Tests); gilt, bis der Host eine andere Karte wählt. */
  map?: MapData;
```

Felder (Zeile 134-135)

```ts
  private readonly mapId: MapId;
  private readonly map: MapData;
```

ersetzen durch

```ts
  /** Gewählte Karte; gilt ab dem nächsten Serienstart für alle Runden und bleibt nach toLobby */
  private mapId: MapId;
  /** Kartendaten aus RoomOptions.map (Tests); null = die Daten der gewählten Karte */
  private mapOverride: MapData | null;
```

Konstruktor (Zeile 165-166)

```ts
    this.mapId = opts.mapId ?? DEFAULT_MAP_ID;
    this.map = opts.map ?? MAP_DEFS[this.mapId].map;
```

ersetzen durch

```ts
    this.mapId = opts.mapId !== undefined && isMapId(opts.mapId) ? opts.mapId : DEFAULT_MAP_ID;
    this.mapOverride = opts.map ?? null;
```

Nach der Methode `rounds()` einfügen:

```ts
  /** Gewählte Karte (gilt ab dem nächsten Serienstart). */
  selectedMapId(): MapId {
    return this.mapId;
  }

  /** Kartendaten der nächsten Runde. */
  private currentMap(): MapData {
    return this.mapOverride ?? MAP_DEFS[this.mapId].map;
  }
```

In `startRound` `createGame(seed, this.map, ids, …)` ersetzen durch `createGame(seed, this.currentMap(), ids, …)`.

Nach `setRounds` einfügen:

```ts
  /** Karte wählen (nur Host, nur Lobby). Gilt für alle Runden der nächsten Serie und bleibt nach toLobby erhalten. */
  setMap(byId: string, mapId: string): Result<void> {
    if (byId === '' || this.hostId() !== byId) return fail('not_host', 'Nur der Host kann die Karte wählen.');
    if (this.phase !== 'lobby') return fail('wrong_phase', 'Die Karte wählt man in der Lobby.');
    if (!isMapId(mapId)) return fail('bad_message', 'Unbekannte Karte.');
    this.lastActive = this.now();
    if (mapId !== this.mapId) {
      this.mapId = mapId;
      this.mapOverride = null;
    }
    this.broadcastLobby();
    return OK;
  }
```

In der Doku von `toLobby` "Bleibt: Code, Name, Sichtbarkeit, Passwort, Host, Rundenzahl, Rundenzeit," ergänzen zu "Bleibt: Code, Name, Sichtbarkeit, Passwort, Host, Rundenzahl, Rundenzeit, Karte,".

- [ ] **Step 5: Nachrichtenweg (`packages/server/src/server.ts`)**

Nach dem Block `case 'setRounds': { … }` einfügen:

```ts
    case 'setMap': {
      if (!session.room || !session.member) return reply(conn, 'not_in_room', 'Du bist in keinem Raum.');
      if (!isCurrent()) return;
      const r = session.room.setMap(session.member.id, msg.mapId);
      if (!r.ok) reply(conn, r.code, r.message);
      return;
    }
```

- [ ] **Step 6: Warnung bei unbekannter `MAP_ID`**

`packages/server/src/config.ts` Zeile 1 ersetzen durch

```ts
import { DEFAULT_MAP_ID, isMapId, MAP_LIST } from '@pfandraiders/core';
```

und am Ende anfügen:

```ts
/** Warnung für eine unbekannte MAP_ID mit der Liste der bekannten Kennungen (eingebaute und eigene Karten). */
export function mapIdWarning(raw: string | undefined): string {
  const known = MAP_LIST.map((m) => m.id).join(', ');
  return `MAP_ID=${raw?.trim() ?? ''} ist ungültig (bekannt: ${known}), Standardwert ${DEFAULT_MAP_ID} wird genutzt.`;
}
```

`packages/server/src/index.ts`: Zeile 1 `import { DEFAULT_MAP_ID } from '@pfandraiders/core';` löschen, den Import aus `'./config'` um `mapIdWarning` ergänzen und

```ts
if (map.invalid) {
  console.warn(`MAP_ID=${process.env.MAP_ID?.trim()} ist ungültig (city oder retro), Standardwert ${DEFAULT_MAP_ID} wird genutzt.`);
}
```

ersetzen durch

```ts
if (map.invalid) console.warn(mapIdWarning(process.env.MAP_ID));
```

- [ ] **Step 7: Tests laufen lassen**

Run: `cd packages/server; npx vitest run` → PASS (inklusive bestehender `room.test.ts`, `roomFinal.test.ts`).
Run (Wurzel): `npm test`, `npm run typecheck` → grün.

- [ ] **Step 8: Commit**

```bash
git add packages/server/src/room.ts packages/server/src/server.ts packages/server/src/config.ts packages/server/src/index.ts packages/server/test/roomMap.test.ts packages/server/test/handlerRooms.test.ts packages/server/test/rooms.test.ts packages/server/test/config.test.ts
git commit -m "feat(server): Host wählt die Karte in der Lobby

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Client online – Karte in Lobby und Raumliste

**Files:**
- Modify: `packages/client/src/online.ts` (Import Zeile 1, Felder nach Zeile 87, `setMap` nach `setRounds` Zeile 306-309, `case 'lobby'`)
- Modify: `packages/client/src/roomList.ts` (`ROOM_LIST_HEADER`, `RoomRow`, `roomRows`)
- Modify: `packages/client/src/onlineMenu.ts` (Import Zeile 2-11, Breite Zeile 133, Raumliste Zeile 406 und 446, Lobby Zeile 652-718)
- Modify: `packages/client/test/online.test.ts`, `packages/client/test/roomList.test.ts`

**Interfaces:**
- Consumes: `stepMapId`, `mapName`, `cleanMapName`, `isMapId`, `DEFAULT_MAP_ID` (Task 1/3); `lobby.mapId`/`mapName`, `RoomInfo.mapName` (Task 5).
- Produces: `OnlineConnection.lobbyMapId`, `lobbyMapName`, `setMap(mapId)`; `RoomRow.map`; `ROOM_LIST_HEADER` mit "Karte".

- [ ] **Step 1: Tests schreiben**

In `packages/client/test/online.test.ts` nach dem Test `'reads room name, visibility, lock and round count from lobby and keeps old values for garbage'` einfügen:

```ts
  it('reads the lobby map and shows the server name even for maps it does not know', () => {
    const { socket, conn } = setup();
    expect(conn.lobbyMapId).toBe(DEFAULT_MAP_ID);
    expect(conn.lobbyMapName).toBe('Stadt');
    socket.receive({ ...lobbyMsg('p1', 'lobby', DEFAULT_ROUND_MS), mapId: 'retro', mapName: 'Retro' } as ServerMessage);
    expect(conn).toMatchObject({ lobbyMapId: 'retro', lobbyMapName: 'Retro' });
    socket.onmessage?.({ data: JSON.stringify({ ...lobbyMsg('p1', 'lobby', DEFAULT_ROUND_MS), mapId: 'moon', mapName: 'Mondbasis' }) });
    expect(conn).toMatchObject({ lobbyMapId: 'retro', lobbyMapName: 'Mondbasis' });
    socket.onmessage?.({ data: JSON.stringify({ ...lobbyMsg('p1', 'lobby', DEFAULT_ROUND_MS), mapId: 'city', mapName: 7 }) });
    expect(conn).toMatchObject({ lobbyMapId: 'city', lobbyMapName: 'Stadt' });
  });

  it('sends setMap only as host', () => {
    const { socket, conn } = setup();
    socket.receive({ t: 'joined', room: 'ABCD', you: 'p2', token: 't' });
    socket.receive(lobbyMsg('p1', 'lobby', DEFAULT_ROUND_MS));
    conn.setMap('retro');
    expect(socket.sent.some((m) => m.t === 'setMap')).toBe(false);
    socket.receive(lobbyMsg('p2', 'lobby', DEFAULT_ROUND_MS));
    conn.setMap('retro');
    expect(socket.sent.at(-1)).toEqual({ t: 'setMap', mapId: 'retro' });
  });
```

In `packages/client/test/roomList.test.ts`: Zeile 60 ersetzen durch

```ts
    expect(ROOM_LIST_HEADER).toEqual(['Raumname', 'Karte', 'Host', 'Spieler', 'Status']);
```

im erwarteten Ergebnis Zeile 73-75 in jedem Objekt nach `name: 'Bude',` ergänzen `map: 'Stadt',` und im selben `describe` anfügen:

```ts
  it('shows "?" for rooms without a map name', () => {
    expect(roomRows([info({ mapName: '' })])[0].map).toBe('?');
    expect(roomRows([info({ mapName: 'Retro' })])[0].map).toBe('Retro');
  });
```

- [ ] **Step 2: Tests laufen lassen, sie schlagen fehl**

Run: `cd packages/client; npx vitest run test/online.test.ts test/roomList.test.ts`
Expected: FAIL (`lobbyMapId` undefined, `setMap` fehlt, Kopfzeile ohne "Karte").

- [ ] **Step 3: `online.ts`**

Zeile 1 ersetzen durch

```ts
import { cleanMapName, DEFAULT_MAP_ID, DEFAULT_ROUND_MS, DEFAULT_ROUNDS, isMapId, isRounds, mapName, parseServerBuild, stateFromSnapshot } from '@pfandraiders/core';
```

Nach dem Feld `mapId: MapId = DEFAULT_MAP_ID;` einfügen:

```ts
  /** Karte der Lobby (Wahl des Hosts für den nächsten Serienstart) laut lobby-Nachricht. */
  lobbyMapId: MapId = DEFAULT_MAP_ID;
  /** Anzeigename dazu, wie ihn der Server schickt (auch für Karten, die dieser Client nicht kennt). */
  lobbyMapName: string = mapName(DEFAULT_MAP_ID);
```

Nach der Methode `setRounds` einfügen:

```ts
  /** Karte wählen (nur Host; der Server prüft zusätzlich Phase und Kennung). */
  setMap(mapId: MapId): void {
    if (this.status !== 'open' || !this.isHost()) return;
    this.sendMsg({ t: 'setMap', mapId });
  }
```

Im `case 'lobby':` nach `if (isRounds(msg.rounds)) this.rounds = msg.rounds;` einfügen:

```ts
        if (isMapId(msg.mapId)) this.lobbyMapId = msg.mapId;
        // Der Name vom Server hat Vorrang (auch für unbekannte Karten), sonst der eigene Name der Karte
        const shownMap = cleanMapName(msg.mapName);
        if (shownMap !== null) this.lobbyMapName = shownMap;
        else if (isMapId(msg.mapId)) this.lobbyMapName = mapName(msg.mapId);
```

- [ ] **Step 4: `roomList.ts`**

```ts
export const ROOM_LIST_HEADER: readonly string[] = ['Raumname', 'Host', 'Spieler', 'Status'];
```

ersetzen durch

```ts
export const ROOM_LIST_HEADER: readonly string[] = ['Raumname', 'Karte', 'Host', 'Spieler', 'Status'];
```

In `RoomRow` nach `name: string;` einfügen:

```ts
  /** Anzeigename der Karte, "?" wenn der Server keinen schickt */
  map: string;
```

In `roomRows` nach `name: r.name,` einfügen: `map: r.mapName || '?',`.

- [ ] **Step 5: `onlineMenu.ts`**

Import Zeile 2-11: in die Werteliste aus `'@pfandraiders/core'` nach `ROUNDS_CHOICES,` die Zeile `stepMapId,` einfügen.

Zeile 133: `width:440px` ersetzen durch `width:520px`.

Zeile 406

```ts
      const cols = 'grid-template-columns:minmax(0,2fr) minmax(0,1.3fr) 4em 4.5em';
```

ersetzen durch

```ts
      const cols = 'grid-template-columns:minmax(0,2fr) minmax(0,1.3fr) minmax(0,1.3fr) 4em 4.5em';
```

Zeile 446

```ts
          for (const text of [`${r.locked ? '🔒 ' : ''}${r.name}`, r.host, r.players, r.status]) {
```

ersetzen durch

```ts
          for (const text of [`${r.locked ? '🔒 ' : ''}${r.name}`, r.map, r.host, r.players, r.status]) {
```

In `renderLobby` vor `// Host: Rundenzeit und Rundenzahl; Gäste sehen die Werte` einfügen:

```ts
      // Host: Karte mit ◄ ► (oder Pfeiltasten links/rechts auf der Zeile) wechseln; Gäste sehen nur den Namen
      const mapRow = el('div', {}, 'margin-bottom:6px');
      const mapPrev = el('button', { textContent: '◄' }, 'font:inherit;margin-left:6px');
      const mapText = el('span', { textContent: '' }, 'display:inline-block;min-width:12em;text-align:center');
      const mapNext = el('button', { textContent: '►' }, 'font:inherit');
      mapPrev.setAttribute('aria-label', 'Vorige Karte');
      mapNext.setAttribute('aria-label', 'Nächste Karte');
      const stepMap = (dir: -1 | 1) => {
        if (!conn.isHost()) return;
        sfx.play('ui_move');
        conn.setMap(stepMapId(conn.lobbyMapId, dir));
      };
      mapPrev.onclick = () => stepMap(-1);
      mapNext.onclick = () => stepMap(1);
      mapRow.onkeydown = (e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        stepMap(e.key === 'ArrowLeft' ? -1 : 1);
      };
      mapRow.append(el('span', { textContent: 'Karte:' }), mapPrev, mapText, mapNext);
```

In `refresh` nach `const host = conn.isHost();` einfügen:

```ts
        mapPrev.style.display = host ? 'inline-block' : 'none';
        mapNext.style.display = host ? 'inline-block' : 'none';
        mapText.textContent = conn.lobbyMapName;
        mapText.style.textAlign = host ? 'center' : 'left';
```

In `box.append(…)` vor `roundRow,` die Zeile `mapRow,` einfügen.

- [ ] **Step 6: Tests laufen lassen**

Run: `cd packages/client; npx vitest run test/online.test.ts test/roomList.test.ts` → PASS.
Run (Wurzel): `npm test`, `npm run typecheck` → grün.

- [ ] **Step 7: Sichtprüfung (optional, von Hand)**

`npm run dev:server` und `npm run dev` in zwei Terminals; zwei Browserfenster, Raum erstellen und beitreten. Host sieht "Karte: ◄ Stadt ►", Klick auf ► zeigt in beiden Fenstern "Retro"; Gast sieht keine Knöpfe; die Raumliste (dritter Tab, öffentlicher Raum) zeigt die Spalte "Karte" mit "Retro"; nach Spielstart ist die Retro-Karte zu sehen.

- [ ] **Step 8: Commit**

```bash
git add packages/client/src/online.ts packages/client/src/roomList.ts packages/client/src/onlineMenu.ts packages/client/test/online.test.ts packages/client/test/roomList.test.ts
git commit -m "feat(client): Kartenwahl in der Online-Lobby und Spalte Karte in der Raumliste

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Client lokal – Karte in der Lobby, gemerkt und über alle Runden

**Files:**
- Create: `packages/client/src/mapChoice.ts`
- Create: `packages/client/test/mapChoice.test.ts`
- Modify: `packages/client/src/settings.ts` (Import Zeile 1, neuer Abschnitt nach "Rundenzeit lokal")
- Modify: `packages/client/test/settings.test.ts` (neuer `describe` am Ende)
- Modify: `packages/client/src/scenes/LobbyScene.ts` (ganz ersetzen)
- Modify: `packages/client/src/scenes/GameScene.ts` (Importe Zeile 2 und 35, Feld, `init` Zeile 160-165, lokaler Zweig Zeile 227-228, Shop-Start Zeile 459)
- Modify: `packages/client/src/scenes/ShopScene.ts` (Import, `ShopSceneData`, Feld, `init`, Zeile 157)
- Modify: `packages/client/test/mapRender.test.ts` (neuer `describe`)

**Interfaces:**
- Consumes: `isMapId`, `mapName`, `stepMapId`, `DEFAULT_MAP_ID`, `MAP_LIST`, `MAP_DEFS` (Task 3).
- Produces: `loadLocalMapId`, `saveLocalMapId`, `chooseLocalMapId`, `mapLine`; Szenendaten `mapId?: MapId` für `game` und `shop`.

- [ ] **Step 1: Tests schreiben**

`packages/client/test/mapChoice.test.ts`:

```ts
import { DEFAULT_MAP_ID } from '@pfandraiders/core';
import { describe, expect, it } from 'vitest';
import { chooseLocalMapId, mapLine } from '../src/mapChoice';

describe('chooseLocalMapId', () => {
  it('prefers ?map= over the lobby choice over the stored map', () => {
    expect(chooseLocalMapId('retro', 'city', 'city')).toBe('retro');
    expect(chooseLocalMapId(null, 'retro', 'city')).toBe('retro');
    expect(chooseLocalMapId(null, undefined, 'retro')).toBe('retro');
  });

  it('keeps the map of the series after the shop', () => {
    // Der Shop reicht die Karte als `chosen` weiter; eine inzwischen anders gespeicherte Wahl zählt nicht
    expect(chooseLocalMapId(null, 'retro', 'city')).toBe('retro');
  });

  it('skips unknown ids at every level', () => {
    expect(chooseLocalMapId('moon', 'retro', 'city')).toBe('retro');
    expect(chooseLocalMapId('moon', 'mars', 'retro')).toBe('retro');
    expect(chooseLocalMapId('moon', 'mars', 'venus')).toBe(DEFAULT_MAP_ID);
    expect(chooseLocalMapId('__proto__', {}, 'constructor')).toBe(DEFAULT_MAP_ID);
  });
});

describe('mapLine', () => {
  it('names the map with the up/down hint', () => {
    expect(mapLine('city')).toBe('Karte: ▲ Stadt ▼  (hoch/runter)');
    expect(mapLine('retro')).toBe('Karte: ▲ Retro ▼  (hoch/runter)');
  });
});
```

Am Ende von `packages/client/test/settings.test.ts` (Importliste oben um `loadLocalMapId, saveLocalMapId,` ergänzen):

```ts
describe('local map', () => {
  function mapStore(): KeyValueStore & { data: Map<string, string> } {
    const data = new Map<string, string>();
    return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
  }

  it('defaults to the city and remembers a known map', () => {
    const store = mapStore();
    expect(loadLocalMapId(store)).toBe('city');
    saveLocalMapId('retro', store);
    expect(store.data.get('pfandraiders.mapId')).toBe('retro');
    expect(loadLocalMapId(store)).toBe('retro');
  });

  it('falls back to the default for a stored map that no longer exists', () => {
    const store = mapStore();
    store.data.set('pfandraiders.mapId', 'geloescht');
    expect(loadLocalMapId(store)).toBe('city');
    saveLocalMapId('moon', store);
    expect(store.data.get('pfandraiders.mapId')).toBe('geloescht');
  });

  it('never throws with a blocked store', () => {
    const broken: KeyValueStore = {
      getItem: () => {
        throw new Error('gesperrt');
      },
      setItem: () => {
        throw new Error('gesperrt');
      },
    };
    expect(loadLocalMapId(broken)).toBe('city');
    expect(() => saveLocalMapId('retro', broken)).not.toThrow();
  });
});
```

Am Ende von `packages/client/test/mapRender.test.ts` (Import Zeile 2 zu `import { MAP_DEFS, MAP_LIST } from '@pfandraiders/core';` erweitern):

```ts
describe('visuals of every city-tileset map', () => {
  it('match their map, so the client never falls back to the flat map', () => {
    for (const { id } of MAP_LIST) {
      const def = MAP_DEFS[id];
      if (def.tileset !== 'city') continue;
      expect(visualsMatchMap(def.visuals, def.map), id).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Tests laufen lassen, sie schlagen fehl**

Run: `cd packages/client; npx vitest run test/mapChoice.test.ts test/settings.test.ts test/mapRender.test.ts`
Expected: FAIL (`../src/mapChoice` fehlt, `loadLocalMapId` fehlt).

- [ ] **Step 3: `mapChoice.ts`**

`packages/client/src/mapChoice.ts`:

```ts
import { DEFAULT_MAP_ID, isMapId, mapName } from '@pfandraiders/core';
import type { MapId } from '@pfandraiders/core';

/**
 * Karte eines lokalen Spiels: `?map=` (Testhilfe) vor der Wahl aus Lobby bzw. Shop (gilt für die ganze Serie)
 * vor der gespeicherten. Unbekannte Kennungen werden übersprungen; zuletzt die Standardkarte.
 */
export function chooseLocalMapId(urlParam: string | null, chosen: unknown, stored: string): MapId {
  if (isMapId(urlParam)) return urlParam;
  if (isMapId(chosen)) return chosen;
  return isMapId(stored) ? stored : DEFAULT_MAP_ID;
}

/** Zeile der lokalen Lobby, z. B. "Karte: ▲ Stadt ▼  (hoch/runter)". */
export function mapLine(id: MapId): string {
  return `Karte: ▲ ${mapName(id)} ▼  (hoch/runter)`;
}
```

- [ ] **Step 4: Gemerkte Karte in `settings.ts`**

Zeile 1 ersetzen durch

```ts
import { DEFAULT_MAP_ID, DEFAULT_ROUND_MS, isAvatar, isMapId, isRoundMs } from '@pfandraiders/core';
import type { MapId } from '@pfandraiders/core';
```

und nach der Funktion `saveLocalRoundMs` einfügen:

```ts
// ---- Karte lokal ----

const LOCAL_MAP_KEY = 'pfandraiders.mapId';

/** Karte der lokalen Lobby. Wirft nie; unbekannte (etwa gelöschte eigene) Karten ergeben die Standardkarte. */
export function loadLocalMapId(store: KeyValueStore | undefined = defaultStore()): MapId {
  try {
    const raw = store?.getItem(LOCAL_MAP_KEY);
    return isMapId(raw) ? raw : DEFAULT_MAP_ID;
  } catch {
    return DEFAULT_MAP_ID;
  }
}

export function saveLocalMapId(id: MapId, store: KeyValueStore | undefined = defaultStore()): void {
  if (!isMapId(id)) return;
  try {
    store?.setItem(LOCAL_MAP_KEY, id);
  } catch {
    // Speicher gesperrt: Wahl gilt nur für diese Sitzung
  }
}
```

- [ ] **Step 5: `LobbyScene.ts` ganz ersetzen**

```ts
import Phaser from 'phaser';
import { DEFAULT_MAP_ID, stepMapId } from '@pfandraiders/core';
import type { MapId } from '@pfandraiders/core';
import { KEYBOARD_LAYOUTS, PLAYER_COLORS } from '../devices';
import type { DeviceRef, PlayerSlot } from '../devices';
import { GAME_W } from '../layout';
import { addLogo } from '../logoTexture';
import { mapLine } from '../mapChoice';
import { roundMsLabel, stepRoundMs } from '../roundTime';
import { loadLocalMapId, loadLocalRoundMs, saveLocalMapId, saveLocalRoundMs } from '../settings';
import { sfx } from '../sfx';

const FONT = { fontFamily: 'monospace', fontSize: '16px', color: '#ffffff' };
/** Oberkante des Lobby-Textes unter dem Logo. */
const TEXT_TOP = 232;
const MAX_PLAYERS = 4;
const PAD_START_BUTTON = 9;

interface PadPrev {
  a: boolean;
  b: boolean;
  start: boolean;
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
}

function sameDevice(a: DeviceRef, b: DeviceRef): boolean {
  if (a.kind === 'keyboard' && b.kind === 'keyboard') return a.layout === b.layout;
  if (a.kind === 'pad' && b.kind === 'pad') return a.index === b.index;
  return false;
}

function describe(ref: DeviceRef): string {
  return ref.kind === 'keyboard' ? KEYBOARD_LAYOUTS[ref.layout].name : `Gamepad ${ref.index + 1}`;
}

export class LobbyScene extends Phaser.Scene {
  private slots: PlayerSlot[] = [];
  private text!: Phaser.GameObjects.Text;
  private joinKeys: Phaser.Input.Keyboard.Key[] = [];
  private startKey!: Phaser.Input.Keyboard.Key;
  private padPrev: Record<number, PadPrev> = {};
  private roundMs = 300_000;
  private roundKeys: { left: Phaser.Input.Keyboard.Key[]; right: Phaser.Input.Keyboard.Key[] } = { left: [], right: [] };
  /** Karte der Serie; hoch/runter wechselt sie (links/rechts gehört der Rundenzeit) */
  private mapId: MapId = DEFAULT_MAP_ID;
  private mapKeys: { up: Phaser.Input.Keyboard.Key[]; down: Phaser.Input.Keyboard.Key[] } = { up: [], down: [] };
  private backKey!: Phaser.Input.Keyboard.Key;
  private notice = '';

  constructor() {
    super('lobby');
  }

  init(data?: { notice?: string }): void {
    this.notice = data?.notice ?? '';
  }

  create(): void {
    this.slots = [];
    this.roundMs = loadLocalRoundMs();
    this.mapId = loadLocalMapId();
    this.padPrev = {};
    const params = new URLSearchParams(window.location.search);

    // Testhilfen: ?solo=1 startet sofort mit Tastatur 1, ?players=N startet N Spieler ohne Lobby.
    const debugCount = params.has('solo') ? 1 : Number(params.get('players'));
    if (debugCount >= 1 && debugCount <= MAX_PLAYERS) {
      const slots: PlayerSlot[] = Array.from({ length: debugCount }, (_, i) => ({
        id: `p${i + 1}`,
        color: PLAYER_COLORS[i],
        device: { kind: 'keyboard', layout: i % KEYBOARD_LAYOUTS.length },
      }));
      this.scene.start('game', { slots, roundMs: this.roundMs, mapId: this.mapId });
      return;
    }

    this.joinKeys = KEYBOARD_LAYOUTS.map((l) => this.input.keyboard!.addKey(l.action));
    this.startKey = this.input.keyboard!.addKey('SPACE');
    this.backKey = this.input.keyboard!.addKey('ESC');
    const kb = this.input.keyboard!;
    this.roundKeys = { left: [kb.addKey('A'), kb.addKey('LEFT')], right: [kb.addKey('D'), kb.addKey('RIGHT')] };
    this.mapKeys = { up: [kb.addKey('W'), kb.addKey('UP')], down: [kb.addKey('S'), kb.addKey('DOWN')] };
    addLogo(this, 32); // oben mittig, bis y 216
    this.text = this.add.text(GAME_W / 2, TEXT_TOP, '', { ...FONT, align: 'center' }).setOrigin(0.5, 0);
  }

  update(): void {
    if (!this.text) return; // Testhilfe-Pfad: create() hat schon zur Spielszene gewechselt
    if (Phaser.Input.Keyboard.JustDown(this.backKey)) {
      sfx.play('ui_back');
      this.scene.start('menu');
      return;
    }
    KEYBOARD_LAYOUTS.forEach((_, layout) => {
      if (Phaser.Input.Keyboard.JustDown(this.joinKeys[layout])) {
        this.join({ kind: 'keyboard', layout });
      }
    });

    let roundDir: -1 | 0 | 1 = 0;
    if (this.roundKeys.left.some((k) => Phaser.Input.Keyboard.JustDown(k))) roundDir = -1;
    if (this.roundKeys.right.some((k) => Phaser.Input.Keyboard.JustDown(k))) roundDir = 1;
    let mapDir: -1 | 0 | 1 = 0;
    if (this.mapKeys.up.some((k) => Phaser.Input.Keyboard.JustDown(k))) mapDir = -1;
    if (this.mapKeys.down.some((k) => Phaser.Input.Keyboard.JustDown(k))) mapDir = 1;
    let backPressed = false;
    let startPressed = Phaser.Input.Keyboard.JustDown(this.startKey);
    for (const pad of this.input.gamepad?.gamepads ?? []) {
      if (!pad || !pad.connected) continue; // abgezogene Pads bleiben in gamepads stehen
      const left = pad.left || pad.leftStick.x < -0.5;
      const right = pad.right || pad.leftStick.x > 0.5;
      const up = pad.up || pad.leftStick.y < -0.5;
      const down = pad.down || pad.leftStick.y > 0.5;
      // Erster Blick: aus der Vorszene gehaltene Tasten zählen nicht als Druck
      const prev = this.padPrev[pad.index] ?? { a: pad.A, b: pad.B, start: false, left, right, up, down };
      if (left && !prev.left) roundDir = -1;
      if (right && !prev.right) roundDir = 1;
      if (up && !prev.up) mapDir = -1;
      if (down && !prev.down) mapDir = 1;
      if (pad.B && !prev.b) backPressed = true;
      const start = pad.buttons[PAD_START_BUTTON]?.pressed ?? false;
      if (pad.A && !prev.a) this.join({ kind: 'pad', index: pad.index });
      if (start && !prev.start && this.slots.length > 0) startPressed = true;
      this.padPrev[pad.index] = { a: pad.A, b: pad.B, start, left, right, up, down };
    }
    if (roundDir !== 0) {
      sfx.play('ui_move');
      this.roundMs = stepRoundMs(this.roundMs, roundDir);
      saveLocalRoundMs(this.roundMs);
    }
    if (mapDir !== 0) {
      sfx.play('ui_move');
      this.mapId = stepMapId(this.mapId, mapDir);
      saveLocalMapId(this.mapId);
    }

    if (backPressed) {
      sfx.play('ui_back');
      this.scene.start('menu');
      return;
    }
    if (startPressed && this.slots.length > 0) {
      sfx.play('ui_select');
      this.scene.start('game', { slots: this.slots, roundMs: this.roundMs, mapId: this.mapId });
      return;
    }
    this.text.setText(this.lines().join('\n'));
  }

  private join(device: DeviceRef): void {
    if (this.slots.length >= MAX_PLAYERS) return;
    if (this.slots.some((s) => sameDevice(s.device, device))) return;
    const n = this.slots.length;
    this.slots.push({ id: `p${n + 1}`, color: PLAYER_COLORS[n], device });
    sfx.play('join');
  }

  private lines(): string[] {
    const lines = ['Beitreten: Tastatur 1 = E, Tastatur 2 = Enter, Gamepad = A'];
    lines.push(`Rundenzeit: ◄ ${roundMsLabel(this.roundMs)} ►  (links/rechts)`);
    lines.push(mapLine(this.mapId));
    lines.push('');
    for (let i = 0; i < MAX_PLAYERS; i++) {
      const slot = this.slots[i];
      lines.push(slot ? `P${i + 1}: ${describe(slot.device)}` : `P${i + 1}: (frei)`);
    }
    lines.push('', 'Zurück: Esc oder Gamepad B');
    lines.push('', this.slots.length > 0 ? 'Start: Leertaste oder Start-Taste' : 'Mindestens ein Spieler muss beitreten');
    if (this.notice) lines.push('', this.notice);
    return lines;
  }
}
```

- [ ] **Step 6: `GameScene.ts`**

Zeile 2: `isMapId` aus der Importliste entfernen (`DEFAULT_MAP_ID` bleibt).
Nach Zeile 37 (`import { CONNECT_STALL_MS, JoinedWatch, ReconnectPlan } from '../reconnect';`) einfügen: `import { chooseLocalMapId } from '../mapChoice';`.
Zeile 35: in der Importliste aus `'../settings'` nach `loadLocalRoundMs,` ergänzen: `loadLocalMapId,`.

Nach dem Feld `private roundMs: number | undefined;` (Zeile 87) einfügen:

```ts
  /** Lokal: Karte der Serie aus Lobby bzw. Shop (wird an die nächste Runde weitergereicht) */
  private chosenMapId: MapId | undefined;
```

`init` (Zeile 160-165) ersetzen durch:

```ts
  init(data?: { slots?: PlayerSlot[]; online?: OnlineConnection; progress?: Record<string, Progress>; roundMs?: number; mapId?: MapId }): void {
    this.online = data?.online ?? null;
    this.slots = data?.slots ?? [];
    this.progress = data?.progress;
    this.roundMs = data?.roundMs;
    this.chosenMapId = data?.mapId;
  }
```

Im lokalen Zweig von `create` die Zeilen

```ts
      const mapParam = params.get('map');
      this.mapId = isMapId(mapParam) ? mapParam : DEFAULT_MAP_ID;
```

ersetzen durch

```ts
      // ?map= (Testhilfe) hat Vorrang, sonst die Karte der Serie aus Lobby/Shop, sonst die gespeicherte
      this.mapId = chooseLocalMapId(params.get('map'), this.chosenMapId, loadLocalMapId());
```

Zeile 459

```ts
        this.scene.start('shop', { slots: this.slots, progress: LocalShop.fromState(state, ids), roundMs: this.roundMs });
```

ersetzen durch

```ts
        this.scene.start('shop', { slots: this.slots, progress: LocalShop.fromState(state, ids), roundMs: this.roundMs, mapId: this.mapId });
```

- [ ] **Step 7: `ShopScene.ts`**

Import Zeile 3 `import type { Progress } from '@pfandraiders/core';` ersetzen durch `import type { MapId, Progress } from '@pfandraiders/core';`.

In `ShopSceneData` nach `roundMs?: number;` einfügen:

```ts
  /** Lokal: Karte der Serie (geht an die nächste Runde weiter) */
  mapId?: MapId;
```

Nach dem Feld `private roundMs: number | undefined;` einfügen: `private mapId: MapId | undefined;`
In `init` nach `this.roundMs = data?.roundMs;` einfügen: `this.mapId = data?.mapId;`
Zeile 157

```ts
      this.goTo('game', { slots: this.slots, progress: this.local.result(), roundMs: this.roundMs });
```

ersetzen durch

```ts
      this.goTo('game', { slots: this.slots, progress: this.local.result(), roundMs: this.roundMs, mapId: this.mapId });
```

- [ ] **Step 8: Tests laufen lassen**

Run: `cd packages/client; npx vitest run test/mapChoice.test.ts test/settings.test.ts test/mapRender.test.ts` → PASS.
Run (Wurzel): `npm test`, `npm run typecheck` → grün.

- [ ] **Step 9: Sichtprüfung (optional, von Hand)**

`npm run dev`, "Lokal spielen": Zeile "Karte: ▲ Stadt ▼"; ↓ zeigt "Retro"; Seite neu laden, die Lobby zeigt weiter "Retro"; mit einem Spieler starten, Runde mit `?round=10` kurz halten, im Shop "Bereit" → zweite Runde läuft wieder auf Retro. `?map=city` in der URL startet trotz gespeicherter Retro-Wahl die Stadt.

- [ ] **Step 10: Commit**

```bash
git add packages/client/src/mapChoice.ts packages/client/test/mapChoice.test.ts packages/client/src/settings.ts packages/client/test/settings.test.ts packages/client/src/scenes/LobbyScene.ts packages/client/src/scenes/GameScene.ts packages/client/src/scenes/ShopScene.ts packages/client/test/mapRender.test.ts
git commit -m "feat(client): Kartenwahl in der lokalen Lobby, gemerkt und über alle Runden

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: README und Abschlussprüfung

**Files:**
- Modify: `README.md` (Abschnitt "Karten" Zeile 67-75, "Testhilfen per URL" Zeile 112-114)

**Interfaces:**
- Consumes: alles aus Task 1-8.
- Produces: Doku; Plan 2 ergänzt den Abschnitt "Eigene Karten".

- [ ] **Step 1: Abschnitt "Karten" anpassen**

In `README.md` den Satzanfang `Es gibt zwei Karten.` ersetzen durch `Eingebaut sind zwei Karten.` und die drei Aufzählungspunkte

```markdown
- Lokal: `?map=retro` oder `?map=city` in der URL.
- Server: Umgebungsvariable `MAP_ID` (`city` oder `retro`, Standard `city`).
- Eine Kartenauswahl in Menü und Raum gibt es noch nicht.
```

ersetzen durch

```markdown
Dazu kommen eigene Karten aus `packages/core/src/maps/custom/` (Kennung = Dateiname ohne `.tiled.json`); `npm run maps` prüft sie und trägt sie in `custom/index.ts` ein.

- Lokal: In der Lobby wählt hoch/runter (W/S, Pfeiltasten, Steuerkreuz) die Karte; die Wahl wird gemerkt und gilt für alle Runden der Serie. `?map=<kennung>` in der URL hat Vorrang (Testhilfe).
- Online: Der Host wählt die Karte in der Lobby mit ◄ ►, die anderen sehen sie; sie gilt für die ganze Serie und bleibt nach der Rückkehr in die Lobby. Die Raumliste zeigt die Karte jedes Raums.
- Server: Umgebungsvariable `MAP_ID` legt die Startkarte neuer Räume fest (eine Kennung aus der Kartenliste, Standard `city`; Unbekanntes ergibt `city` und eine Warnung mit den bekannten Kennungen).
```

Im Abschnitt "Testhilfen per URL" nach `` `?seed=123` (feste Zufallsbefüllung), `` einfügen: `` `?map=retro` (Karte, überschreibt die Wahl der Lobby), ``.

- [ ] **Step 2: Gesamtprüfung**

Run (Wurzel), nacheinander:
- `npm run maps` → `unverändert: … (0 eigene Karten)`
- `npm test` → alle drei Pakete grün
- `npm run typecheck` → grün
- `npm run build` → Vite-Build ohne Fehler
- `npm run build:server` → `dist/server.cjs` ohne Fehler
Expected: alles grün; `git status` zeigt nur `README.md` (und das ungetrackte `todo.md`, das nicht gestaged wird).

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: Kartenwahl lokal und online im README

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Selbstprüfung

1. **Spec-Abdeckung:** §1.1-1.3 (Ordner, `npm run maps`, Test der generierten Datei) → Task 3-4; §1.4 (Name, Tileset) → Task 2-3; §1.5 (`MapId`, `isMapId`, `MAP_LIST` usw.) → Task 3; §1.6 (Prüfung beim Laden) → Task 3; §2 (alle Tabellenzeilen) → Task 2 mit je einem Test; §3.1 → Task 5; §3.2 → Task 6; §3.3 → Task 7; §3.4 → Task 8; Rulings R1-R14 der Spec → Rulings 1-20 hier. §4 (Vorlage) gehört zu Plan 2.
2. **Platzhalter:** keine "TBD"/"später"; jeder Codeschritt enthält den vollständigen Code oder eine exakte Ersetzung.
3. **Typen:** `MapId`, `TilesetId`, `MapDef.builtin`, `CustomMapSource`, `validateTiledMap(json, { rules, tileset })`, `customMapDefs(sources, reserved)`, `selectedMapId()`, `setMap(byId, mapId)`, `lobbyMapId`/`lobbyMapName`, `RoomRow.map`, `chooseLocalMapId(urlParam, chosen, stored)` sind in Namenstabelle und Tasks gleich geschrieben.
4. **Review Focus:** jede der fünf Zeilen hat einen benannten Test in der zuständigen Task.
5. **Vorab geprüft (Scratch, nicht committet):** `validateTiledMap` gegen `city.tiled.json` (strenge und eingebaute Regeln: keine Probleme, auch mit sperrenden weichen Hindernissen) und `retro.tiled.json` (eingebaute Regeln: keine Probleme; strenge Regeln: genau die zwei erwarteten Sätze); alle 31 Tests von `validate.test.ts` liefen grün gegen den Code aus Task 2.
