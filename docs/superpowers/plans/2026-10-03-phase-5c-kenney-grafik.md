# PfandRaiders Phase 5c (Kenney-Kacheln statt gezeichneter Welt) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Spielwelt (Boden, Dächer, Fassaden, Spots, Pfandautomat, Shop) nutzt das freie Kenney-Paket "Roguelike Modern City" (CC0) statt der selbst gezeichneten Pixelmuster. Spieler, Hund und Polizist bleiben die selbst gezeichneten Figuren.

**Architecture:** Die Texturschlüssel (`tile:*`, `spot:*`, `object:*`) bleiben unverändert, deshalb ändert sich `GameScene` kaum. Das Spritesheet (`tilemap_packed.png`, 592x448, 37x28 Kacheln à 16x16, ohne Abstand) wird beim Start geladen. Eine reine Tabelle (`kenneyMap.ts`) ordnet jedem Schlüssel eine Zelle (Spalte, Zeile) im Sheet zu. `textures.ts` schneidet die Zellen beim Backen in eigene 16x16-Texturen. Fehlt das Sheet oder eine Zelle, greift die bisherige gezeichnete Grafik als Rückfall. Spots mit Flaschen entstehen, indem über das Spot-Bild ein kleines Flaschenbild aus dem Sheet gelegt wird.

**Tech Stack:** wie bisher. Das Sheet wird als Vite-Asset importiert (`import url from '...png'`).

**Vorarbeit:** Phase 5a/5b sind auf `master`. Arbeit auf Branch `kenney-assets` (bereits angelegt). Die heruntergeladenen ZIP-Dateien liegen lokal in `assets-src/` und kommen nicht ins Repository.

## Entscheidungen zum Plan

1. **Lizenz:** CC0 (public domain). Eine Namensnennung ist nicht nötig. Wir legen trotzdem `License.txt` des Pakets neben das Sheet und nennen Kenney im README.
2. **Nur das Sheet:** Ins Repository kommt nur `tilemap_packed.png` (23 KB) plus die Lizenzdatei, unter `packages/client/src/assets/kenney/`. Das ZIP und die 1036 Einzelbilder bleiben draußen. `.gitignore` bekommt `assets-src/`.
3. **Zellen-Tabelle:** Die Zuordnung steht in `kenneyMap.ts` als reine Daten (kein Phaser). Ein Test prüft, dass jede Zelle im Sheet liegt (Spalte 0 bis 36, Zeile 0 bis 27), dass jeder verlangte Schlüssel vorhanden ist und dass kein Schlüssel auf eine leere (komplett transparente) Zelle zeigt (der Test liest die PNG-Pixel nicht, sondern prüft nur die Grenzen; die Sichtprüfung macht der Handtest).
4. **Startvorschlag der Zellen** (Spalte, Zeile; Sichtprüfung im Browser und Nachbessern ausdrücklich eingeplant):
   - `floor_0` (2, 24), `floor_1` (3, 24), `floor_2` (2, 24) oder eine zweite graue Pflasterzelle; ruhige Varianten.
   - `wall_top_0..2`: Dachzellen des roten Dachs im Bereich Spalten 0 bis 7, Zeilen 0 bis 3 (schlichte Flächen, keine Ränder), zum Beispiel (1, 1), (2, 2), (1, 2).
   - `wall_front`: Ziegelfassade mit Fenster im Bereich Spalten 0 bis 3, Zeilen 6 bis 8, zum Beispiel (1, 7).
   - `object:dropoff` (Pfandautomat): Automat im Bereich Spalten 24 bis 27, Zeile 8, zum Beispiel (24, 8) oder (25, 8).
   - `object:shop`: gestreifte Markise Spalten 24 bis 31, Zeilen 9 bis 13, zum Beispiel (24, 12).
   - Spots: `bus_stop` Schild/Mast im Bereich Spalten 9 bis 11, Zeilen 14 bis 15; `bench` Holzbank Spalten 15 bis 18, Zeilen 15 bis 17; `bush` kleiner Busch Spalten 31 bis 36, Zeile 13; `bin` Mülltonne Spalten 12 bis 15, Zeile 14; `park` kleiner Baum Spalten 31 bis 36, Zeile 12.
   - Flaschen-Aufsatz: Flaschenzellen Spalten 28 bis 31, Zeilen 7 bis 8, zum Beispiel (29, 7). Er wird auf 10x10 verkleinert (oder als 16x16 bei Platz) rechts unten über den Spot gelegt.
   - Spots stehen auf dem Boden: Das Spot-Bild ist Boden-Kachel plus Objekt (der Boden darunter ist `floor_*`, die Objektzellen haben transparenten Hintergrund). Backe `spot:*` deshalb als Boden-Zelle mit Objekt darüber.
5. **Rückfall:** `bakeStaticTextures` benutzt die Kenney-Zelle, wenn das Sheet geladen ist und der Schlüssel in der Tabelle steht, sonst das gezeichnete Muster aus `sprites/tiles.ts`. Die gezeichneten Muster bleiben im Code und im Test erhalten.
6. **Laden:** `BootScene.preload()` lädt das Sheet als Image (`this.load.image('kenney-city', url)`). Schlägt das Laden fehl, läuft das Spiel mit dem Rückfall weiter (kein Abbruch, eine Warnung in der Konsole).
7. **Nicht in Plan 5c:** neue Figuren (bleiben gezeichnet), Straßen/Autos/Laternen als Deko in der Karte (die Karte `city.tiled.json` bleibt unverändert; Deko kann ein späterer Plan über eine Dekoebene ergänzen), animierte Kacheln.

## Global Constraints

- Die Texturschlüssel aus `textureKeys.ts` und die Größe 16x16 (Spots jetzt ebenfalls 16x16) ändern sich nicht. Spielregeln, `core`, Server und Protokoll bleiben unberührt.
- Tabellen und Prüfungen in `kenneyMap.ts` sind frei von Phaser, Tests importieren Phaser nicht.
- Weltobjekte nach dem Aufbau der UI-Kameras müssen von den UI-Kameras ignoriert werden (siehe `GameScene`); Änderungen an Größen der Spot-Bilder betreffen das nicht.
- Dateien sind UTF-8, Umlaute in Kommentaren und Texten heil.
- Commit-Nachrichten enden mit der Zeile `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Alle bestehenden Tests bleiben grün.

## Review Focus

- Fehlt das Sheet oder schlägt das Laden fehl, startet das Spiel weiter mit der gezeichneten Grafik (kein schwarzer Bildschirm, kein Absturz) (Task 1).
- Wiederholtes Backen (Szenen-Neustart, Hot Reload) wirft nicht und erzeugt keine doppelten Texturen (Task 1).
- Alle Zellen liegen im Sheet; kein Schlüssel zeigt auf eine leere Zelle (Task 1, Sichtprüfung Task 2).
- Die Spot-Bilder (Boden plus Objekt, mit und ohne Flaschen) sind erkennbar, und `full` unterscheidet sich sichtbar von `empty` (Task 1, 2).
- Der Pixel-Look bleibt scharf (kein Verschwimmen durch Skalierung: Zellen werden 1:1 mit `imageSmoothingEnabled = false` kopiert) (Task 1).
- Die Figuren (Spieler, Hunde, Polizisten) bleiben vor dem neuen Hintergrund gut lesbar (Task 2).

---

## File Structure

```
.gitignore                                         ändern: assets-src/
packages/client/src/assets/kenney/modern-city.png  neu: tilemap_packed.png
packages/client/src/assets/kenney/License.txt      neu: Lizenz des Pakets
packages/client/src/kenneyMap.ts                   neu: Tabelle Schlüssel -> Zelle
packages/client/src/textures.ts                    ändern: Zellen schneiden, Rückfall
packages/client/src/scenes/BootScene.ts            ändern: Sheet laden
packages/client/test/kenneyMap.test.ts             neu
README.md                                          ändern: Credits
```

---

### Task 1: Sheet einbinden und Texturen aus dem Sheet backen

**Files:** wie in der Dateiliste.

**Interfaces:**
- Consumes: `TileKey`, `SpotType` (`tiles.ts`, core), die Schlüssel-Funktionen aus `textureKeys.ts`, die bestehenden gezeichneten Muster (`sprites/tiles.ts`), `bakeStaticTextures(scene)` (`textures.ts`).
- Produces:
  - `kenneyMap.ts`: `export const SHEET_COLS = 37; export const SHEET_ROWS = 28; export const CELL = 16;` `interface Cell { col: number; row: number }`; `KENNEY_TILES: Record<TileKey, Cell>`; `KENNEY_OBJECTS: { dropoff: Cell; shop: Cell }`; `KENNEY_SPOTS: Record<SpotType, Cell>`; `KENNEY_BOTTLES: Cell`. Dazu `cellInBounds(c: Cell): boolean`.
  - `BootScene.preload()` lädt `'kenney-city'`.
  - `bakeStaticTextures(scene)` nutzt die Tabelle, wenn `scene.textures.exists('kenney-city')`, sonst die gezeichneten Muster.

- [ ] **Step 1: Dateien vorbereiten.** Kopiere `assets-src/kenney/modern-city/Tilemap/tilemap_packed.png` nach `packages/client/src/assets/kenney/modern-city.png` und `assets-src/kenney/modern-city/License.txt` nach `packages/client/src/assets/kenney/License.txt`. Ergänze `.gitignore` um `assets-src/`. Prüfe, dass `vite/client`-Typen vorhanden sind (für `import url from './x.png'`), sonst ergänze eine `declare module '*.png'`-Zeile in der vorhandenen `env.d.ts` bzw. dem Typ-Shim des Clients.
- [ ] **Step 2: Failing Test `kenneyMap.test.ts`:** jede Zelle in `KENNEY_TILES`, `KENNEY_OBJECTS`, `KENNEY_SPOTS`, `KENNEY_BOTTLES` ist im Bereich (`cellInBounds`); alle sieben `TileKey`-Schlüssel, beide Objekte und alle fünf `SpotType` sind vorhanden (typsicher über die Record-Typen); `cellInBounds` lehnt `{col:-1,row:0}`, `{col:37,row:0}`, `{col:0,row:28}`, `NaN` und Nicht-Ganzzahlen ab.
- [ ] **Step 3: `kenneyMap.ts` mit den Startzellen aus Entscheidung 4 schreiben.** Lege zusätzlich ein kleines Hilfsskript `packages/client/scripts/sheet.html` NICHT ins Repository (nur lokal im `assets-src/kenney/sheet.html` vorhanden, zur Sichtprüfung der Zellen). Der Controller prüft die Auswahl im Browser.
- [ ] **Step 4: `textures.ts` und `BootScene` umbauen.**
  - `BootScene.preload()`: `this.load.image('kenney-city', sheetUrl)` (mit `import sheetUrl from '../assets/kenney/modern-city.png'`). Registriere `this.load.on('loaderror', ...)`, das nur eine Konsolenwarnung ausgibt.
  - Hilfsfunktion `bakeFromSheet(scene, key, cell, opts?)`: erstellt `scene.textures.createCanvas(key, 16, 16)`, setzt `imageSmoothingEnabled = false` und zeichnet mit `drawImage(sheetImage, col*16, row*16, 16, 16, 0, 0, 16, 16)`. Bild über `scene.textures.get('kenney-city').getSourceImage()`. Existiert die Textur schon, nichts tun.
  - Boden- und Wandkacheln und die beiden Objekte direkt aus der Tabelle. Spots: erst `floor_0`-Zelle zeichnen, dann die Objektzelle (`KENNEY_SPOTS[type]`) darüber; für `full` zusätzlich die Flaschenzelle (`KENNEY_BOTTLES`) auf 10x10 verkleinert rechts unten (Smoothing aus, Position 5,5) über das Objekt legen.
  - Rückfall: ist `kenney-city` nicht vorhanden, laufen die bisherigen Pfade unverändert (nur bei Spots und Kacheln, Spielerfiguren und NPCs bleiben immer gezeichnet).
- [ ] **Step 5: Tests, Typecheck, Build grün.** Commit `feat(client): load tiles from the Kenney Roguelike Modern City sheet`.

---

### Task 2: Sichtprüfung und Feinschliff (Controller)

- [ ] **Step 1:** Der Controller startet das Spiel im Browser, vergleicht alle Schlüssel mit dem Sheet (`assets-src/kenney/sheet.html`) und bestimmt falsche oder unschöne Zellen (zum Beispiel falsche Dachfläche, zu dunkle Fassade, Spot nicht erkennbar).
- [ ] **Step 2:** Korrekturen als Änderungen in `kenneyMap.ts` (nur Daten), Test grün, Commit `fix(client): refine Kenney tile selection`. Mehrere Runden sind erlaubt.
- [ ] **Step 3:** Prüfe die Lesbarkeit von Spielern, Hund und Polizist vor dem neuen Hintergrund. Ist ein Spieler schlecht zu sehen, bessere die Figuren-Palette in `sprites/characters.ts` nach (zum Beispiel dunklerer Umriss), mit Test-Anpassung nur wo nötig.

---

### Task 3: Dokumentation

- [ ] `README.md`: Abschnitt "Grafik" mit dem Hinweis, dass die Welt die freien Kenney-Kacheln "Roguelike Modern City" (CC0, kenney.nl) nutzt, die Figuren selbst gezeichnet sind und wie man einzelne Zellen in `kenneyMap.ts` ändert. Commit `docs: credit Kenney tiles`.

---

## Self-Review

- **Spec-Abdeckung:** Retro-Pixelgrafik der Welt über ein freies Asset-Pack (Phase 5 der Spec).
- **Platzhalter:** Die Startzellen sind ausdrücklich Vorschläge mit Sichtprüfung in Task 2; Rückfall verhindert Ausfälle.
- **Typkonsistenz:** `TileKey`, `SpotType`, Textur-Schlüssel und `bakeStaticTextures` bleiben unverändert.
- **Review Focus:** jede Zeile durch Task 1 (Tests/Rückfall) oder Task 2 (Handtest) abgedeckt.
