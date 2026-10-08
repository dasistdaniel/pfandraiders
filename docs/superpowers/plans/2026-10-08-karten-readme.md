# Karten ohne Shops, README und Abschluss – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shops verschwinden aus Kartentyp, ASCII-Plänen, Tiled-Dateien, Grafik und Tests; das README beschreibt die neuen Regeln (Serie, Shop-Phase, Kampf); eine Abschlussprüfung stellt sicher, dass keine Reste des alten Shops bleiben.

**Architecture:** `MapData.shops` und das Zeichen `S` bzw. der Tiled-Objekttyp `shop` werden ersatzlos entfernt; unbekannte Zeichen und Objekttypen werfen wie bisher Fehler. Die Tiled-Dateien werden mit den vorhandenen TypeScript-Skripten aus den ASCII-Quellen neu erzeugt, die Paritätstests sichern die Übereinstimmung. Im Client fallen Shop-Marker, Shop-Sprite, Kenney-Zelle und Texturschlüssel weg.

**Tech Stack:** TypeScript 5.7, `npx tsx` für die Generatoren, Vitest 3, Phaser 3.

**Spec:** `docs/superpowers/specs/2026-10-08-serie-shop-kampf-design.md` (§5 Karten, Tests "Karten: keine Shops, Tiled-Parität").

**Voraussetzungen:** PR #32 (`fix/police-gamepad`) sowie die Pläne `docs/superpowers/plans/2026-10-08-serie-core-server.md` und `docs/superpowers/plans/2026-10-08-shop-client.md` sind umgesetzt und gemergt. Seitdem liest keine Spiellogik mehr `MapData.shops`; nur noch der Kartentyp, die Parser, die Generatoren, die Grafik und Tests kennen Shops.

## Global Constraints

- Alle Texte für Spieler und das README sind deutsch, mit echten Umlauten.
- Code-Kommentare deutsch wie im bestehenden Code.
- Jeder Commit endet mit der Zeile `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (nach einer Leerzeile).
- `todo.md` und `idee.md` werden nie gestaged oder committet; immer `git add <pfad>` mit expliziten Pfaden.
- Kein Python. Tiled-Dateien nur mit `npx tsx packages/core/scripts/generateCity.ts` und `npx tsx packages/core/scripts/asciiToTiled.ts` erzeugen, nie von Hand bearbeiten.
- Der Kern bleibt deterministisch (Spot-Nummern ändern sich nicht, weil `S` kein Spot war).
- Snapshots bleiben eine Allow-List je Betrachter (`MapData` ist nicht Teil des Snapshots; nichts zu ändern).
- Am Ende jeder Task: core grün nach Task 1 (client-Typecheck darf bis Task 2 rot sein), alles grün nach Task 2 und danach (`npm test`, `npm run typecheck`).

## Entscheidungen (Rulings)

1. **`S` im ASCII-Plan und `shop` in Tiled sind ungültig** (Fehler "unknown map char" bzw. "unknown object type"), statt still ignoriert. So fällt eine alte Karte sofort auf.
2. **Shop-Felder werden zu Gehweg** (`.`); in beiden Karten lag `S` mitten auf Gehweg/Platz.
3. **Grafik:** `OBJECT_SPRITES.shop`, `KENNEY_OBJECTS.shop` und der Texturschlüssel `object:shop` entfallen; `objectTexture` kennt nur noch `'dropoff'`.
4. **README:** die Steuerungstabelle zeigt Schlagen und Essen statt Kauftasten; Regeln für Serie, Shop-Phase, Kampf, Knockout und Ausrauben ersetzen Shop auf der Karte, Item-Slot und Geldverlust; `ROUND_MS` ist nur noch eine Test-Überschreibung (Standard 5 Minuten, Host wählt 3/5/7/10).

## Review Focus

1. **Ein alter ASCII-Plan mit `S`** (etwa in einem Test oder Branch): wirft mit klarer Meldung statt einer Karte mit unsichtbarem Shop (Test in Task 1).
2. **Eine alte Tiled-Datei mit Objekt `shop`:** wirft "unknown object type shop" (Test in Task 1).
3. **Erreichbarkeit nach dem Umbau:** jeder Spot, Pfandautomat, Startpunkt und NPC-Eingang bleibt von jedem Startpunkt erreichbar (bestehende Tests in `city-plan.test.ts` und `retro.test.ts`, angepasst in Task 1).
4. **Client ohne Shop-Textur:** keine Textur `object:shop` wird mehr angefragt (Test in Task 2 über `textureKeys` und `kenneyMap`).
5. **README nennt keine alten Tasten** (1 bis 4, `,` `.` `;` `'` als Kauf) mehr (Prüfung in Task 4).

## Dateien

- Modify: `packages/core/src/types.ts` (`MapData.shops`), `packages/core/src/map.ts`, `packages/core/src/tiled.ts`
- Modify: `packages/core/scripts/asciiToTiled.ts`, `packages/core/scripts/planToTiled.ts`
- Modify: `packages/core/src/maps/retro-ascii.ts`, `packages/core/src/maps/cityPlan.ts`
- Regenerate: `packages/core/src/maps/retro.tiled.json`, `packages/core/src/maps/city.tiled.json`
- Modify tests: `packages/core/test/helpers.ts`, `map.test.ts`, `tiled.test.ts`, `retro.test.ts`, `city-plan.test.ts`, `city-visuals.test.ts`, `theft.test.ts`
- Modify: `packages/client/src/scenes/GameScene.ts`, `packages/client/src/textureKeys.ts`, `packages/client/src/textures.ts`, `packages/client/src/sprites/tiles.ts`, `packages/client/src/kenneyMap.ts`
- Modify client tests: `kenneyMap.test.ts`, `sprites.test.ts`, `textureKeys.test.ts`, `text.test.ts`, `connection.test.ts`
- Modify: `README.md`

---

### Task 1: Shops aus Kartentyp, Parsern, Plänen und Tiled-Dateien entfernen

**Files:**
- Modify: `packages/core/src/types.ts` (`MapData`)
- Modify: `packages/core/src/map.ts:12-40`
- Modify: `packages/core/src/tiled.ts:80-127`
- Modify: `packages/core/scripts/asciiToTiled.ts:8`, `packages/core/scripts/planToTiled.ts:12`
- Modify: `packages/core/src/maps/retro-ascii.ts:14`, `packages/core/src/maps/cityPlan.ts:15,34,57`
- Regenerate: `packages/core/src/maps/retro.tiled.json`, `packages/core/src/maps/city.tiled.json`
- Test: `packages/core/test/helpers.ts`, `map.test.ts`, `tiled.test.ts`, `retro.test.ts`, `city-plan.test.ts`, `city-visuals.test.ts`, `theft.test.ts`

**Interfaces:**
- Consumes: nichts Neues
- Produces: `MapData` ohne `shops`: `{ cols; rows; solid; soft?; spots; dropoffs; spawns; npcSpawns; zones }`. `parseMap` wirft bei `S` ("unknown map char 'S' …"), `parseTiledMap` wirft bei Objekttyp `shop` ("unknown object type shop").

- [ ] **Step 1: Write the failing tests**

1. `packages/core/test/map.test.ts`: in `ROWS` die Zeile `'#.gmpS#',` durch `'#.gmp.#',` ersetzen; im Test `'reads size, solids and special tiles at tile centers'` die Zeile `expect(map.shops).toEqual([{ x: 88, y: 40 }]);` durch `expect('shops' in map).toBe(false);` ersetzen. Neuer Test im Block `describe('parseMap'`:

```ts
  it('rejects the former shop character S', () => {
    expect(() => parseMap(['#####', '#@S.#', '#####'])).toThrow(/unknown map char 'S'/);
  });
```

2. `packages/core/test/tiled.test.ts`: im Test `'reads walls, spawn and spot'` die Zeile `expect(m.shops).toEqual([]);` durch `expect('shops' in m).toBe(false);` ersetzen. Den Test `'sorts dropoff, shop and npc_spawn into their lists'` ersetzen durch:

```ts
  it('sorts dropoff and npc_spawn into their lists', () => {
    const b = base();
    b.layers[1].objects = [
      pt(1, 'dropoff', 20, 20), pt(3, 'npc_spawn', 40, 20),
      pt(4, 'spawn', 20, 30), pt(5, 'spawn', 30, 30),
    ];
    const m = parseTiledMap(b);
    expect(m.dropoffs).toEqual([{ x: 20, y: 20 }]);
    expect(m.npcSpawns).toEqual([{ x: 40, y: 20 }]);
    expect(m.spawns).toEqual([{ x: 20, y: 30 }, { x: 30, y: 30 }]);
  });

  it('rejects the former shop object', () => {
    const b = base();
    b.layers[1].objects = [pt(1, 'spawn', 24, 24), pt(2, 'shop', 30, 20)];
    expect(() => parseTiledMap(b)).toThrow(/unknown object type shop/);
  });
```

3. `packages/core/test/retro.test.ts`: im Test `'has the expected content'` die Zeile `expect(RETRO_MAP.shops.length).toBe(1);` durch `expect('shops' in RETRO_MAP).toBe(false);` ersetzen. Im Test `'lets a player walk from the first spawn to every spot, dropoff and shop'` (neuer Titel `'lets a player walk from the first spawn to every spot, dropoff, spawn and entrance'`) die Zeile `...RETRO_MAP.shops,` löschen.

4. `packages/core/test/city-plan.test.ts`:
   - Titel `'has the expected number of spawns, dropoffs, shops, spots and NPC entrances'` wird `'has the expected number of spawns, dropoffs, spots and NPC entrances and no shops'`; `expect(cellsOf('S').length).toBe(2);` wird `expect(cellsOf('S')).toEqual([]);`.
   - Den Test `'keeps every dropoff and shop within 30 tiles of each spawn and the pairs 24 tiles apart'` ersetzen durch:

```ts
  it('keeps every dropoff within 30 tiles of each spawn and the two dropoffs 24 tiles apart', () => {
    const spawns = cellsOf('@');
    const dropoffs = cellsOf('D');
    for (const s of spawns) {
      expect(Math.min(...dropoffs.map((d) => dist(s, d))), `dropoff near ${s.r},${s.c}`).toBeLessThanOrEqual(30);
    }
    expect(dist(dropoffs[0], dropoffs[1])).toBeGreaterThanOrEqual(24);
  });
```

   - Im Block `describe('city plan: reachability'`: `const targets = cellsOf('@DSN' + SPOT_CHARS);` wird `const targets = cellsOf('@DN' + SPOT_CHARS);`; in `'puts every object of the generated map on a walkable tile'` `...m.shops,` und `+ m.shops.length` löschen.

5. `packages/core/test/city-visuals.test.ts`: `const NO_GRAPHIC = '@DSNbngmp';` wird `const NO_GRAPHIC = '@DNbngmp';`; Titel `'gives spots, dropoffs, shops, spawns and NPC entrances no graphic, only plain ground'` wird `'gives spots, dropoffs, spawns and NPC entrances no graphic, only plain ground'`.

6. `packages/core/test/helpers.ts` (Kommentare und Zeilen):

```ts
/** Spawn (24,24), Spot bei x=40, Pfandautomat bei x=72 */
export const SEARCH_ROWS = ['########', '#@b.D..#', '########'];

/** Spot (x=40) und Pfandautomat (x=56) liegen dicht beieinander: bei x=48 sind beide in Reichweite */
export const DEPOSIT_ROWS = ['########', '#@bD...#', '########'];

/** Zwei Spieler (x=24 und x=56) mit einem Spot dazwischen (x=40) */
export const TWO_PLAYER_ROWS = ['#########', '#@b@.D..#', '#########'];

/** p1 (x=24) steht 16 px neben p2 (x=40). Der Spot (x=56) liegt nur bei p2 in Reichweite. */
export const THIEF_ROWS = ['#########', '#@@b.D..#', '#########'];
```

7. `packages/core/test/theft.test.ts`: `newGame(['##########', '#@@@b.D.S#', '##########'], ['p1', 'p2', 'p3'])` wird `newGame(['##########', '#@@@b.D..#', '##########'], ['p1', 'p2', 'p3'])`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/core && npx vitest run test/map.test.ts test/tiled.test.ts test/retro.test.ts test/city-plan.test.ts`
Expected: FAIL (`S` wird noch als Shop gelesen, `shops` existiert noch, Pläne enthalten noch `S`).

- [ ] **Step 3: Write the implementation**

`packages/core/src/types.ts`, im `MapData` die Zeile `shops: Point[];` löschen.

`packages/core/src/map.ts`: `const shops: Point[] = [];` löschen, die Zeile `else if (ch === 'S') shops.push(center);` löschen, die Rückgabe wird `return { cols, rows: rows.length, solid, spots, dropoffs, spawns, npcSpawns, zones };`.

`packages/core/src/tiled.ts`: `const shops: Point[] = [];` löschen, den Fall `case 'shop': shops.push(at); break;` löschen, `const map: MapData = { cols, rows, solid, spots, dropoffs, spawns, npcSpawns, zones };`.

`packages/core/scripts/asciiToTiled.ts` und `packages/core/scripts/planToTiled.ts`: jeweils
`const OBJECT_TYPES: Record<string, string> = { '@': 'spawn', D: 'dropoff', N: 'npc_spawn' };`

`packages/core/src/maps/retro-ascii.ts`, Zeile 14:

```ts
  '#.####....D...........####.....#',
```

`packages/core/src/maps/cityPlan.ts`:
- Legende Zeile 15: `@ Spawn  D Pfandautomat  N NPC-Eingang (Hunde, Polizei; an Straßenenden am Rand` (ohne `S Shop`).
- Zeile 5 des Plans (Datei Zeile 34) wird

```ts
  'W,g,,,,,,,,n,.=c.YYYYYY..EEEEE.==.XXXXXX.mXXXXX.==.............W', //  5
```

- Zeile 28 des Plans (Datei Zeile 57) wird

```ts
  'W,,,,ooo,,,,..==..m.........m..==.........n.....=c.,,,,,,m,,,,,W', // 28
```

(Jeweils nur das `S` durch `.` ersetzt; Länge bleibt 64.)

- [ ] **Step 4: Regenerate the Tiled files**

Run (im Wurzelverzeichnis):

```bash
npx tsx packages/core/scripts/generateCity.ts
npx tsx packages/core/scripts/asciiToTiled.ts
```

Expected: `wrote …/city.tiled.json` und `wrote …/retro.tiled.json`. Prüfen: `git diff --stat packages/core/src/maps/` zeigt beide JSON-Dateien geändert, und `grep -c '"shop"' packages/core/src/maps/*.json` liefert für beide `0`.

- [ ] **Step 5: Run tests and typecheck (core)**

Run: `npm test -w @pfandraiders/core && npm run typecheck -w @pfandraiders/core`
Expected: PASS, inklusive `city-parity.test.ts` und `retro-parity.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/map.ts packages/core/src/tiled.ts packages/core/scripts/asciiToTiled.ts packages/core/scripts/planToTiled.ts packages/core/src/maps/retro-ascii.ts packages/core/src/maps/cityPlan.ts packages/core/src/maps/retro.tiled.json packages/core/src/maps/city.tiled.json packages/core/test/helpers.ts packages/core/test/map.test.ts packages/core/test/tiled.test.ts packages/core/test/retro.test.ts packages/core/test/city-plan.test.ts packages/core/test/city-visuals.test.ts packages/core/test/theft.test.ts
git commit -m "feat(core): Shops aus Karten, Plänen und Tiled-Dateien entfernt

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Shop-Grafik und Marker im Client entfernen

**Files:**
- Modify: `packages/client/src/scenes/GameScene.ts` (`drawMap`, `marker`)
- Modify: `packages/client/src/textureKeys.ts:11`
- Modify: `packages/client/src/textures.ts` (Zeilen mit `objectTexture(…, 'shop')`)
- Modify: `packages/client/src/sprites/tiles.ts:286-323`
- Modify: `packages/client/src/kenneyMap.ts:32-35`
- Test: `packages/client/test/kenneyMap.test.ts`, `sprites.test.ts`, `textureKeys.test.ts`, `text.test.ts`, `connection.test.ts`

**Interfaces:**
- Consumes: `MapData` ohne `shops` (Task 1)
- Produces: `objectTexture(set: TilesetId, name: 'dropoff'): string`; `OBJECT_SPRITES: { dropoff: readonly string[] }`; `KENNEY_OBJECTS: { dropoff: Cell }`.

- [ ] **Step 1: Write the failing tests**

1. `packages/client/test/kenneyMap.test.ts`: `expect(Object.keys(KENNEY_OBJECTS).sort()).toEqual(['dropoff', 'shop']);` wird `expect(Object.keys(KENNEY_OBJECTS)).toEqual(['dropoff']);`.
2. `packages/client/test/sprites.test.ts`: den Test `it('shop is 16x16', …)` ersetzen durch

```ts
  it('has no shop sprite any more', () => expect(Object.keys(OBJECT_SPRITES)).toEqual(['dropoff']));
```

3. `packages/client/test/textureKeys.test.ts`: `expect(objectTexture('retro', 'shop')).toBe('retro:object:shop');` wird `expect(objectTexture('retro', 'dropoff')).toBe('retro:object:dropoff');` und `expect(objectTexture('city', 'shop')).not.toBe(objectTexture('retro', 'shop'));` wird `expect(objectTexture('city', 'dropoff')).not.toBe(objectTexture('retro', 'dropoff'));`.
4. `packages/client/test/text.test.ts`: `shopGame()` heißt `twoGame()` (alle Aufrufe umbenennen) und baut `parseMap(['#########', '#@.....@#', '#########'])`; den Kommentar darüber auf `// p1 (24,24) und p2 am Ende des Ganges, weit weg voneinander` ändern.
5. `packages/client/test/connection.test.ts`: `shopGame()` heißt `soloGame()` (alle Aufrufe umbenennen), Karte `parseMap(['#####', '#@..#', '#####'])`, Kommentar `// Ein Spieler auf einem kurzen Gang`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/client && npx vitest run test/kenneyMap.test.ts test/sprites.test.ts`
Expected: FAIL (Shop-Einträge noch vorhanden).

- [ ] **Step 3: Write the implementation**

`packages/client/src/textureKeys.ts`, Zeile 11:

```ts
export const objectTexture = (set: TilesetId, name: 'dropoff'): string => `${set}:object:${name}`;
```

`packages/client/src/textures.ts`: die beiden Zeilen `bake(scene, objectTexture(set, 'shop'), decodeSprite(OBJECT_SPRITES.shop));` und `bakeFromSheet(scene, objectTexture('city', 'shop'), KENNEY_OBJECTS.shop);` löschen.

`packages/client/src/sprites/tiles.ts`: Typ und Inhalt von `OBJECT_SPRITES`:

```ts
export const OBJECT_SPRITES: { dropoff: readonly string[] } = {
  dropoff: [
```

(der `dropoff`-Block bleibt unverändert) und den ganzen Block `shop: [ … ],` bis zur schließenden `};` löschen, so dass auf den `dropoff`-Block direkt `};` folgt.

`packages/client/src/kenneyMap.ts`:

```ts
export const KENNEY_OBJECTS: { dropoff: Cell } = {
  dropoff: { col: 24, row: 8 },
};
```

`packages/client/src/scenes/GameScene.ts`:
- in `drawMap` die Zeile `for (const s of map.shops) this.marker(s.x, s.y, 'shop', 'SHOP');` löschen;
- `marker` wird

```ts
  private marker(x: number, y: number, object: 'dropoff', label: string): void {
    this.add.image(x, y, objectTexture(this.tileset, object));
    this.add.text(x, y - TILE / 2, label, FONT).setOrigin(0.5, 1).setDepth(7);
  }
```

- [ ] **Step 4: Run all tests and typechecks**

Run: `npm test && npm run typecheck`
Expected: PASS in core, client und server.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/scenes/GameScene.ts packages/client/src/textureKeys.ts packages/client/src/textures.ts packages/client/src/sprites/tiles.ts packages/client/src/kenneyMap.ts packages/client/test/kenneyMap.test.ts packages/client/test/sprites.test.ts packages/client/test/textureKeys.test.ts packages/client/test/text.test.ts packages/client/test/connection.test.ts
git commit -m "feat(client): Shop-Marker, Sprite und Textur entfernt

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: README auf die neuen Regeln bringen

**Files:**
- Modify: `README.md` (Abschnitte "Spielen", "Leben und Events", "Karten", "Grafik", "Online spielen und Server")

**Interfaces:**
- Consumes: Tastenbelegung und Regeln aus Plan 1 und 2 (Tastatur 1 F/C, Tastatur 2 `.`/`,`, Gamepad X/Y; Preise und Stufen aus `CONFIG.shop`)
- Produces: README ohne Shop auf der Karte, ohne Kauftasten, ohne Item-Slot und Geldverlust.

- [ ] **Step 1: Steuerungstabelle ersetzen**

Die Tabelle unter "Lokal mit 1 bis 4 Spielern …" (Kopfzeile `| Gerät | Laufen | Aktion | Klauen | Container-Upgrade | Bolzenschneider | Leckerli | Essen |` und die drei Zeilen darunter) ersetzen durch:

```markdown
| Gerät | Laufen | Aktion | Klauen / Ausrauben | Schlagen | Essen |
|---|---|---|---|---|---|
| Tastatur 1 | WASD | E | Q | F | C |
| Tastatur 2 | Pfeile | Enter | / | . | , |
| Gamepad | Stick oder Steuerkreuz | A | B | X | Y |

In der lokalen Lobby stellt links/rechts (A/D, Pfeile, Stick oder Steuerkreuz) die Rundenzeit ein: 3, 5, 7 oder 10 Minuten, Standard 5; die Wahl wird im Browser gemerkt.
```

- [ ] **Step 2: Absatz "Aktion: …" anpassen**

Im langen Absatz, der mit `Aktion: Suchen` beginnt:
- den Satz `Mit dem Bolzenschneider (im Shop 6,00 €) klaut der Druck sofort alles, was in den eigenen Container passt; auch er startet die Abklingzeit.` ersetzen durch `Mit dem Bolzenschneider (Shop-Phase, 6,00 €) klaut der Druck sofort alles, was in den eigenen Container passt; er wird dabei verbraucht und startet die Abklingzeit.`
- den Satz `Am Rundenende zeigt ein Ergebnisfeld die Rangliste; nach kurzer Sperre startet \`R\` oder die Aktionstaste eine neue Runde (online nur der Host), \`Esc\` (lokal auch Gamepad B, online das B des gewählten Gamepads) führt zurück ins Menü.` ersetzen durch `Am Rundenende zeigt ein Ergebnisfeld die Rangliste mit Runden- und Gesamtverdienst; nach kurzer Sperre führen \`R\` oder die Aktionstaste in die Shop-Phase, \`Esc\` (lokal auch Gamepad B, online das B des gewählten Gamepads) zurück ins Menü.`

- [ ] **Step 3: Neuer Abschnitt "Serie, Shop-Phase und Kampf"**

Direkt vor `## Leben und Events` einfügen:

```markdown
## Serie, Shop-Phase und Kampf

Ein Raum (online) bzw. eine lokale Runde spielt eine Serie: Lobby, Runde, Rangliste, Shop-Phase, nächste Runde, bis der Host die Serie beendet (online im Shop „Serie beenden“, lokal mit Esc). Geld, Taschenstufe, Upgrades und Vorräte bleiben über die Runden; Position, Flaschen, Leben, Schutz, Abklingzeiten, Spots, NPCs, Zonen und Zeit beginnen jede Runde neu. Gewertet wird der Rundenverdienst (Pfand dieser Runde) und der Gesamtverdienst der Serie (Summe aller Rundenverdienste; Ausgaben im Shop mindern ihn nicht). Wer sich online trennt, behält seinen Stand bis zum Ende der Rückkehrfrist und steht in der nächsten Runde als Figur still; wer den Raum verlässt, verliert ihn.

Die Rundenzeit wählt der Host in der Lobby: 3, 5, 7 oder 10 Minuten, Standard 5.

In der Shop-Phase kaufen alle gleichzeitig. Bedient wird nur mit den Bewegungstasten des eigenen Geräts und der Aktionstaste: hoch/runter wählt den Eintrag, links/rechts wechselt die Kategorie (auf Leckerli und Essen: die Menge), die Aktionstaste kauft bzw. drückt „Bereit“. Lokal hat jeder Spieler ein eigenes Feld. Online geht zusätzlich die Maus (Kategorie, Eintrag, −/+, Kaufen, Bereit). Die nächste Runde beginnt erst, wenn alle verbundenen Spieler bereit sind; „Bereit“ lässt sich zurücknehmen, solange nicht alle bereit sind. Ein Zeitlimit gibt es nicht.

| Kategorie | Eintrag | Preise | Wirkung |
|---|---|---|---|
| Taschen | Tasche, Rucksack, Einkaufswagen | 1,50 €, 4,00 €, 9,00 € | 8, 15, 30 Plätze (Rucksack und Wagen machen langsamer) |
| Upgrades | Knockout kürzer | 2, 5, 10 € | 20 s → 15, 10, 5 s |
| Upgrades | Laufgeschwindigkeit | 2, 5, 10 € | +8, +16, +24 % |
| Upgrades | Schneller suchen | 2, 5, 10 € | Suchzeit −15, −30, −45 % |
| Angriff | Stärkerer Schlag | 2,50, 6, 12 € | +5, +10, +15 Schaden |
| Angriff | Bolzenschneider | 6 € | einmal, wird beim Klauen verbraucht |
| Angriff | Steinschleuder, Pistole | – | „bald“ (noch nicht kaufbar) |
| Verteidigung | Leckerli | 1 € je Stück | lenkt einen Hund ab, automatisch |
| Verteidigung | Essen | 1 € je Stück | Essen-Taste: +30 Leben |
| Verteidigung | Rüstung | 2,50, 6, 12 € | −4, −8, −12 Schaden je Schlag |

Leckerli und Essen kauft man in Mengen bis 99 Stück; reicht das Geld nicht für die ganze Menge, wird nichts gekauft.

Kampf: Die Schlagen-Taste trifft den nächsten wachen Mitspieler in 20 px Reichweite mit 20 Schaden (Schlag-Upgrade mehr, Rüstung des Opfers weniger, mindestens 5); danach 0,6 s Pause. Wer gerade Schutz hat, nimmt keinen Schaden. Bei 0 Leben ist man ausgeknockt (20 s, mit Upgrade kürzer) und steht danach an derselben Stelle mit 60 Leben und 3 s Schutz wieder auf. Geld, Flaschen und Vorräte bleiben dabei erhalten. Einen Ausgeknockten kann man einmal pro Knockout mit der Klauen-Taste ausrauben: das nimmt ihm die Hälfte seiner Flaschen (so viel in den eigenen Container passt). Hunde und Polizisten lassen Ausgeknockte in Ruhe.
```

- [ ] **Step 4: Abschnitt "Leben und Events" anpassen**

Im ersten Absatz:
- `Leben sinken durch Hunger (1 pro 8 s), Hundebisse (15) und das Umfallen kostet Flaschen, Item und 25 % des Geldes; nach 10 s steht man am Startpunkt wieder auf. Essen im Shop (1,00 €) heilt 30.` ersetzen durch `Leben sinken durch Hunger (1 pro 8 s), Hundebisse (15) und Schläge; bei 0 Leben ist man ausgeknockt (siehe oben). Essen aus dem Vorrat (Essen-Taste) heilt 30.`
- `mit einem Leckerli (1,00 €, wird automatisch eingesetzt, teilt den Item-Slot mit dem Bolzenschneider) lassen sie sich ablenken.` ersetzen durch `mit einem Leckerli aus dem Vorrat (wird automatisch eingesetzt, eines pro Hund) lassen sie sich ablenken.`

- [ ] **Step 5: Abschnitte "Karten", "Grafik", "Testhilfen", "Online spielen und Server"**

- "Karten": `(Straßen, Häuser, Parks, zwei Pfandautomaten, zwei Shops, acht Startpunkte, Zonen Stadion und Konzert)` wird `(Straßen, Häuser, Parks, zwei Pfandautomaten, acht Startpunkte, Zonen Stadion und Konzert)`. Nach dem Satz zur Erzeugung der Stadt (`… Nach Änderungen am Plan die Datei neu erzeugen; …`) ergänzen: `Die Retro-Karte entsteht ebenso aus \`packages/core/src/maps/retro-ascii.ts\` mit \`npx tsx packages/core/scripts/asciiToTiled.ts\`. Shops gibt es auf keiner Karte mehr; das frühere Zeichen \`S\` bzw. der Objekttyp \`shop\` sind ungültig.`
- "Grafik": `(Boden, Dächer, Fassaden, Spots, Pfandautomat, Shop)` wird `(Boden, Dächer, Fassaden, Spots, Pfandautomat)`.
- "Testhilfen": `\`?round=30\` (Rundenlänge in Sekunden)` wird `\`?round=30\` (Rundenlänge in Sekunden, überschreibt die Wahl der Lobby)`.
- "Online spielen und Server", Liste der Umgebungsvariablen: die Zeile zu `ROUND_MS` ersetzen durch `- \`ROUND_MS\`: optionale feste Rundenlänge in Millisekunden für Testrunden (mindestens 1000). Ist sie gesetzt, gilt sie statt der Wahl des Hosts; sonst wählt der Host 3, 5, 7 oder 10 Minuten (Standard 5).`
- Im Absatz über "Online spielen": `ist die Runde inzwischen vorbei, geht es mit einem Hinweis ins Menü.` ersetzen durch `ist die Runde inzwischen vorbei, geht es direkt in die Shop-Phase.` und `die Figur bleibt bis Rundenende als Statist stehen und ihr Geld zählt für die Rangliste.` ersetzen durch `die Figur bleibt bis Rundenende als Statist stehen und ihr Verdienst zählt für die Rangliste; ihr Stand in der Serie verfällt.`
- Im Absatz "Chat in der Lobby": `(während und nach der Runde antwortet der Server mit \`chat_closed\`)` wird `(während der Runde und in der Shop-Phase antwortet der Server mit \`chat_closed\`)`.

- [ ] **Step 6: Prüfen**

Run: `grep -n -i "shop auf\|zwei Shops\|Item-Slot\|Container-Upgrade\|25 % des Geldes\|Standard 10 Minuten" README.md`
Expected: keine Treffer.

- [ ] **Step 7: Commit**

```bash
git add README.md
git commit -m "docs: README mit Serie, Shop-Phase und Kampf

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Abschlussprüfung

**Files:**
- keine geplanten Änderungen; nur Korrekturen, falls eine Prüfung anschlägt (dann mit Test in der betroffenen Datei)

**Interfaces:**
- Consumes: alles aus Plan 1 bis 3
- Produces: Nachweis, dass der Branch vollständig ist

- [ ] **Step 1: Reste des alten Shops suchen**

Run (Wurzelverzeichnis):

```bash
git grep -n -E "\.shops\b|object:shop|OBJECT_SPRITES\.shop|KENNEY_OBJECTS\.shop|type: 'shop'|buyUpgrade|buyItem|buyTreat|buyFood|BuyCommand|\bItemId\b|players\.[a-z0-9]+\.item\b|p\.item\b|moneyLossFraction|\btryBuy\b|\btryEat\b|nextUpgrade|CONFIG\.items" -- packages README.md
```

Expected: keine Treffer. (Der Szenenname `'shop'` und `ShopItemId` sind gewollt und von diesem Muster ausgenommen; `docs/` mit alten Plänen und Specs wird nicht durchsucht.)

- [ ] **Step 2: Alle Tests und Typprüfungen**

Run: `npm test && npm run typecheck && npm run build && npm run build:server`
Expected: alles grün; Client- und Server-Build erzeugen ihre Dateien ohne Fehler.

- [ ] **Step 3: Manuelle Runde auf beiden Karten**

1. `npm run dev`, Browser `http://localhost:5173/?solo=1&round=20`: Stadtkarte ohne Shop-Marker (nur "PFAND"-Marker an den zwei Pfandautomaten). Nach 20 s Rangliste, `E` → Shop, Bereit → Runde 2 mit Geld aus Runde 1.
2. `http://localhost:5173/?solo=1&round=20&map=retro`: Retro-Karte ohne Shop, an der Stelle des früheren Shops (Mitte, Zeile 10) freier Boden.
3. `ROUND_MS=20000 MAP_ID=retro npm run dev:server` und zwei Browser mit `?server=ws://localhost:8080`: eine Online-Runde auf Retro, Shop-Phase, Runde 2.

- [ ] **Step 4: Abschluss-Checkliste**

- [ ] Spec §1 bis §6 durchgehen und je Punkt den Commit nennen (Plan 1 Task 1 bis 11, Plan 2 Task 1 bis 10, Plan 3 Task 1 bis 3).
- [ ] `git status` zeigt `todo.md` (und ggf. `idee.md`) als ungetrackt und sonst nichts Offenes.
- [ ] `git log --format=%B master..HEAD | grep -c "Co-Authored-By: Claude Sonnet 5.5"` entspricht der Zahl der Commits (`git rev-list --count master..HEAD`).

- [ ] **Step 5: Commit (nur falls Korrekturen nötig waren)**

```bash
git add <geänderte Dateien einzeln>
git commit -m "fix: Reste des alten Shops entfernt

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-Review

1. **Spec-Abdeckung:** §5 (Typ, Tiled-Ebene, ASCII-Pläne `S`, Stadt und Retro, Sprite, Textur, README) in Task 1 bis 3; Tests "Karten: keine Shops, Tiled-Parität" in Task 1 (`city-parity`, `retro-parity`, neue Ablehnungstests). README-Regeln für §1 bis §4 in Task 3.
2. **Platzhalter:** keine; Task 4 Step 5 benennt Dateien erst, wenn eine Prüfung anschlägt, und verlangt dafür einen Test.
3. **Typkonsistenz:** `MapData` ohne `shops`, `objectTexture(set, 'dropoff')`, `OBJECT_SPRITES.dropoff`, `KENNEY_OBJECTS.dropoff` überall gleich.
4. **Review Focus:** `S`-Ablehnung (Task 1 `map.test`), `shop`-Objekt (Task 1 `tiled.test`), Erreichbarkeit (bestehende Tests, Task 1), keine Shop-Textur (Task 2), keine alten Tasten im README (Task 3 Step 6, Task 4 Step 1).
