# PfandRaiders Phase 6 (Stadtkarte 64x40, Retro-Karte, Kartenkennung) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine farbige Stadt mit Straßen, verschiedenen Häusern, Parks und Plätzen (64 x 40 Kacheln, Kenney-Kacheln) wird die Standardkarte. Die alte Karte bleibt als "Retro-Karte" mit den selbst gezeichneten Kacheln erhalten. Beide Karten haben eine Kennung, die der Server beim Start mitschickt.

**Architecture:** Siehe Spec `docs/superpowers/specs/2026-10-03-stadtkarte-design.md`. Kurz: `core` bekommt eine Kartenverwaltung (`MAP_DEFS`), eine Funktion für die Grafikebenen einer Tiled-Datei (`parseTiledVisuals`) und den Generator `planToTiled`, der aus einem ASCII-Stadtplan Regeln und Grafikebenen ableitet. Das Protokoll bekommt `mapId` in der `start`-Nachricht. Der Client wählt nach `mapId` das Tileset (`city` oder `retro`), backt die statischen Ebenen einmal in zwei Bilder und zeichnet Spots, Automaten und Figuren wie bisher.

**Tech Stack:** wie bisher. Keine neuen Abhängigkeiten.

**Spec:** `docs/superpowers/specs/2026-10-03-stadtkarte-design.md` (diese Ergänzung) und `docs/superpowers/specs/2026-10-02-pfandraiders-design.md`.

**Vorarbeit:** Kenney-Kacheln (PR #10) sind auf `master`. Arbeit auf Branch `phase-6-stadtkarte` (bereits angelegt). Der Kenney-Bogen liegt im Repo unter `packages/client/src/assets/kenney/modern-city.png` (592x448, 37 x 28 Zellen à 16x16, ohne Abstand); lokal gibt es zur Sichtprüfung `assets-src/kenney/sheet.html` (nicht im Git, `node`-Server auf Port 5195, Parameter `c`, `r`, `cn`, `rn`, `s`).

## Entscheidungen zum Plan (zusätzlich zur Spec)

1. **Dateinamen:** Die alte Karte zieht um: `city-ascii.ts` wird `retro-ascii.ts` (`RETRO_ROWS`, `RETRO_ZONES`), `city.tiled.json` wird `retro.tiled.json`. `scripts/asciiToTiled.ts` bleibt für die Retro-Karte. `city.ts` entfällt zugunsten von `maps/index.ts` (Registrierung) und `maps/retro.ts`, `maps/city.ts` (neue Stadt, ab Task 3).
2. **Kompatibilität in core:** `CITY_MAP` bleibt als Name erhalten und bedeutet ab Task 1 "die Standardkarte" (`MAP_DEFS[DEFAULT_MAP_ID].map`). Tests, die auf Eigenschaften der **alten** Karte bauen (Anzahl Spots 17, Zonen usw.), wechseln in Task 1 auf `RETRO_MAP`. Bis Task 3 zeigt die Standardkarte `city` noch auf die Retro-Daten (Platzhalter), ab Task 3 auf die neue Stadt.
3. **Kennung:** `type MapId = 'city' | 'retro'`; `isMapId(x: unknown): x is MapId`. `DEFAULT_MAP_ID: MapId = 'city'`.
4. **Zellnummern der Grafikebenen** sind `gid = Zeile * 37 + Spalte + 1` (0 = leer), `SHEET_COLS = 37`, `SHEET_ROWS = 28` als Konstanten in `core/src/tiled.ts` (core kennt nur die Zahlen, nicht das Bild).
5. **Stil der Bildschirmprüfung:** Wie in Plan 5c prüft der Controller die Grafik nach Task 4 und 5 im Browser und lässt in Nachbesserungsrunden Zellen und Plan anpassen. Der Plan beschreibt deshalb Regeln, keine endgültigen Zellnummern.

## Global Constraints

- `core` bleibt rein (kein Phaser, kein DOM, kein Netzwerk, kein `Math.random`). Der Generator verwendet nur feste Hash-Funktionen.
- Der Server hängt nur von `MapData` und `mapId` ab, nie von Grafikebenen.
- Der Client enthält keine Spielregeln.
- Alle Spielwerte nur in `core/src/config.ts` (Karten sind Daten, keine Werte).
- Die Wegfindung der Spieler hängt nur an `solid`. Alle Spots, Automaten, Shops, Spawns und NPC-Eingänge liegen auf begehbaren Kacheln und sind von jedem Spawn aus erreichbar (Test).
- Weltobjekte nach dem Aufbau der UI-Kameras (NPC-Sprites) werden von den UI-Kameras ignoriert. Neu gebackene Karten-Bilder entstehen vor dem Schnappschuss `worldObjects` in `GameScene.create()`.
- Dateien sind UTF-8, Umlaute heil. Zeilenenden im Arbeitsbaum CRLF wie bisher.
- Commit-Nachrichten enden mit der Zeile `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Alle bestehenden Tests bleiben grün (nach Umbenennung der Karten-Bezüge, siehe oben).

## Review Focus

- Eine `start`-Nachricht mit unbekannter, fehlender oder falsch getypter `mapId` (`'x'`, `null`, Zahl, `__proto__`) wird verworfen, ohne dass der Client abstürzt oder den Zustand verliert (Task 1).
- Der Server schickt immer die Kennung, mit der der Raum gestartet wurde; eine Wiederverbindung (Token) liefert dieselbe (Task 1).
- Eine kaputte Grafikebene (falsche Länge, Zelle außerhalb 0 bis 1036, Nicht-Zahl, fehlende Ebene) wirft einen klaren Fehler oder liefert `null` (je nach Funktion, getestet), und der Client fällt bei fehlenden Ebenen auf eine einfarbige Karte zurück statt abzustürzen (Task 2, 5).
- Die Stadt ist zu (Rand), alles ist erreichbar, nichts liegt in Wänden, Zonen und NPC-Eingänge sind gültig (Task 3).
- Die Gebäude haben erkennbar verschiedene Farben und Formen; Dächer sind glatt (keine Nähte), Fassaden stehen nur unter Dächern (Task 4).
- Die Retro-Karte sieht aus wie vor Phase 6 (gleiche Kacheln, gleiche Spots) (Task 5).
- Der Start der größeren Karte (2560 Kacheln) ist nicht langsamer als einige hundert Millisekunden, und das Zeichnen kostet keine einzelnen Objekte pro Kachel (Task 5).
- Online: Server und Client einigen sich auf Karte und Grafik, ein Spieler der Retro-Karte sieht nirgends Stadtgrafik und umgekehrt (Task 1, 5).

---

## File Structure

```
packages/core/
  src/tiled.ts                      ändern: SHEET_COLS/ROWS, MapVisuals, parseTiledVisuals
  src/maps/retro-ascii.ts           umbenannt aus city-ascii.ts (RETRO_ROWS, RETRO_ZONES)
  src/maps/retro.tiled.json         umbenannt aus city.tiled.json
  src/maps/retro.ts                 neu: RETRO_MAP, RETRO_ASCII_MAP
  src/maps/cityPlan.ts              neu (Task 3): CITY_PLAN, CITY_ZONES
  src/maps/city.tiled.json          neu (Task 3/4): erzeugte Stadt
  src/maps/city.ts                  neu (Task 3): CITY_TILED_MAP
  src/maps/index.ts                 neu: MapId, MAP_DEFS, DEFAULT_MAP_ID, isMapId, MAP_VISUALS, CITY_MAP
  src/protocol.ts                   ändern: start.mapId
  scripts/planToTiled.ts            neu (Task 3/4): Plan -> Tiled
  scripts/generateCity.ts           neu: schreibt city.tiled.json
  test/*                            neue und angepasste Tests
packages/server/src/room.ts, index.ts, config.ts     ändern: mapId
packages/client/src/online.ts, scenes/GameScene.ts, textureKeys.ts, textures.ts, mapRender.ts (neu)
README.md
```

---

### Task 1: Kartenverwaltung und `mapId` durch das ganze System

**Files:** `packages/core/src/maps/*` (Umbenennungen, `index.ts`), `packages/core/src/index.ts`, `packages/core/src/protocol.ts`, `packages/core/scripts/asciiToTiled.ts` (Aufrufer anpassen), alle Tests mit `CITY_MAP`, `packages/server/src/room.ts`, `packages/server/src/index.ts`, `packages/client/src/online.ts`, `packages/client/src/scenes/GameScene.ts`.

**Interfaces:**
- Produces (core): `type MapId = 'city' | 'retro'`; `isMapId(v: unknown): v is MapId`; `interface MapDef { id: MapId; name: string; tileset: MapId; map: MapData }`; `MAP_DEFS: Record<MapId, MapDef>`; `DEFAULT_MAP_ID: MapId`; `CITY_MAP` (Standardkarte); `RETRO_MAP`, `RETRO_ASCII_MAP` (Referenz für den Paritätstest); `ServerMessage` `start` mit `mapId: MapId`.
- Produces (server): `RoomOptions.mapId?: MapId` (Vorgabe `DEFAULT_MAP_ID`), nutzt `MAP_DEFS[mapId].map` (die bisherige Option `map` bleibt für Tests); `start`-Nachricht enthält `mapId`; Server-Umgebungsvariable `MAP_ID` (ungültig: Warnung und Standard).
- Produces (client): `OnlineConnection.mapId: MapId` (Vorgabe `DEFAULT_MAP_ID`, wird beim `start` gesetzt); lokal liest `GameScene` `?map=retro|city` (ungültig: Standard) und merkt sich die Kennung in `this.mapId`. Das Tileset ist in diesem Task noch ohne Wirkung auf die Grafik.

- [ ] **Step 1: Tests zuerst** (jeweils rot sehen): `isMapId` (nur `'city'`, `'retro'`), `MAP_DEFS` hat beide Einträge mit gültiger `MapData`, `CITY_MAP === MAP_DEFS[DEFAULT_MAP_ID].map`, `parseClientMessage`/`ServerMessage`-Typen (`start` mit `mapId`); Server: `start`-Nachricht enthält `mapId`, auch nach Wiederverbindung mit Token; `RoomOptions.mapId: 'retro'` startet die Retro-Karte; Client (`online.test.ts`): `start` mit gültiger `mapId` setzt `conn.mapId`; fehlende, unbekannte und falsch typisierte `mapId` (`'x'`, `null`, `7`, `{}`) verwerfen die Nachricht (Zustand bleibt, kein Fehler).
- [ ] **Step 2: Umbenennen und Verkabeln** wie in der Dateiliste. Bis Task 3 zeigt `MAP_DEFS.city` auf dieselbe Karte wie `retro` (Platzhalter, mit Kommentar). Alle bestehenden Tests, die auf Eigenschaften der alten Karte prüfen (`city.test.ts` Anzahl Spots/Zonen usw.), wechseln auf `RETRO_MAP`; Determinismus- und Raumtests mit `CITY_MAP` bleiben bei `CITY_MAP`, wenn sie nicht von der Größe abhängen (prüfe pro Test, nenne unklare Fälle im Bericht).
- [ ] **Step 3: `npm test`, `typecheck`, `build`, `build:server` grün; Commit** `feat: add map registry and send the map id with start`.

---

### Task 2: Grafikebenen der Tiled-Datei lesen

**Files:** `packages/core/src/tiled.ts`, `packages/core/src/index.ts`, `packages/core/test/tiled.test.ts` (erweitern).

**Interfaces:**
- Produces: `export const SHEET_COLS = 37; export const SHEET_ROWS = 28; export const SHEET_CELLS = 1036;` `interface MapVisuals { cols: number; rows: number; ground: number[]; below: number[]; above: number[] }` (Einträge 0 bis 1036, 0 = leer); `parseTiledVisuals(json: unknown): MapVisuals | null` (gibt `null` zurück, wenn **keine** der drei Ebenen `ground`, `below`, `above` existiert; wirft bei vorhandenen, aber kaputten Ebenen; fehlt nur eine der drei, ist sie mit lauter Nullen belegt); `MapDef` bekommt `visuals: MapVisuals | null`; `MAP_VISUALS: Record<MapId, MapVisuals | null>` in `maps/index.ts`.
- Regeln: Jede Ebene ist eine `tilelayer` mit `data.length === width*height` der Karte, Einträge ganze Zahlen im Bereich 0 bis `SHEET_CELLS`; sonst Fehler `invalid tiled map: ...`. `parseTiledMap` ignoriert die Grafikebenen weiterhin (bestehende Tests unverändert grün).

- [ ] **Step 1: Tests zuerst:** Karte ohne Grafikebenen gibt `null`; mit allen drei gibt die Werte; nur `ground` gibt `below` und `above` als Nullen; falsche Länge, Zelle `-1`, `1037`, `1.5`, `NaN`, `'a'`, Ebene mit falschem Typ (`objectgroup` namens `ground`) werfen; ein Eintrag `__proto__` als Ebenenname stört nicht. Retro-Karte hat `visuals === null`.
- [ ] **Step 2: Implementieren, grün. Commit** `feat(core): read visual layers from Tiled maps`.

---

### Task 3: Stadtplan und Regeln der Stadt (ohne Grafikebenen)

**Files:** `packages/core/src/maps/cityPlan.ts`, `packages/core/scripts/planToTiled.ts`, `packages/core/scripts/generateCity.ts`, `packages/core/src/maps/city.tiled.json`, `packages/core/src/maps/city.ts`, `packages/core/src/maps/index.ts` (Registrierung), Tests `packages/core/test/city-plan.test.ts`, `packages/core/test/city-parity.test.ts` (für beide Karten).

**Interfaces:**
- Produces: `CITY_PLAN: string[]` (40 Zeilen à 64 Zeichen); `CITY_ZONES: ZoneDef[]`; `planToTiled(rows: string[], zones: ZoneDef[]): TiledMap` (Task 3: Ebene `walls`, `objects`, `zones`; Task 4 ergänzt die Grafikebenen); `generateCity.ts` schreibt `src/maps/city.tiled.json` (Aufruf `npx tsx packages/core/scripts/generateCity.ts`); `CITY_TILED_MAP: MapData` aus der JSON-Datei; `MAP_DEFS.city` zeigt jetzt auf die neue Stadt (name `Stadt`, tileset `city`).

**Plan-Legende** (jedes Zeichen genau eine Kachel; Spec §5):
`R Y E X` Gebäude (fest), `W` Rand (fest), `t` Baum (fest), `o` Brunnen/Wasser (fest), `c` Auto (fest, nur als Paar `cc` waagerecht oder als senkrechtes Paar), `l` Laterne (fest), `=` Fahrbahn, `+` Zebrastreifen, `.` Gehweg/Platz, `,` Gras (alle begehbar), `@` Spawn, `D` Pfandautomat, `S` Shop, `N` NPC-Eingang, `b n g m p` Spots (Bushaltestelle, Bank, Busch, Mülltonne, Park) wie in `map.ts`. Spots, Automaten, Shops, Spawns und Eingänge zählen als begehbar.

**Anforderungen an den Plan** (die Tests prüfen sie):
- 64 Spalten x 40 Zeilen, alle Zeilen gleich lang; der äußere Rand (Zeile 0 und 39, Spalte 0 und 63) besteht nur aus festen Zeichen (`W` oder Gebäude).
- Aufteilung nach der Skizze der Spec §6: obere Hälfte (Zeilen 1 bis 17) Wohnhäuser `R`/`E` links, Geschäftshäuser `Y`/`E` in der Mitte, Bürohäuser `X` rechts, Stadionplatz oben rechts; Hauptstraße waagerecht (Fahrbahn 3 Kacheln breit plus Gehwege, ungefähr Zeilen 18 bis 22); untere Hälfte links Park, Marktplatz, Brunnenplatz, Geschäftsviertel, rechts Konzertpark; drei senkrechte Querstraßen (2 bis 3 Kacheln breit) bei etwa Spalte 14, 31 und 48; Zebrastreifen (`+`) an den Kreuzungen; geparkte Autos und Laternen entlang der Straßen; Bäume und Vorgärten bei den Häusern; Gebäude sind mindestens 3 Kacheln breit und 3 Kacheln hoch, wirken verschieden groß; mindestens 8 verschiedene Gebäudeblöcke mit mindestens 3 der Buchstaben `R Y E X`.
- Genau 8 `@`, genau 2 `D`, genau 2 `S`, mindestens 36 und höchstens 48 Spots, 4 bis 6 `N` direkt an Straßenenden am Rand.
- Alle Spots, `D`, `S`, `@`, `N` liegen auf begehbaren Kacheln und sind von **jedem** `@` aus über begehbare Kacheln erreichbar (Vierer-Nachbarschaft).
- Zonen: `stadium` im Stadionplatz (oben rechts), `concert` im Konzertpark (unten rechts), jeweils mindestens 12 x 6 Kacheln groß, vollständig begehbar, innerhalb der Karte; als Pixelrechtecke (`TILE = 16`).
- Es gibt jeweils mindestens ein `D` und ein `S` in Reichweite (höchstens 30 Kacheln Luftlinie) der Spawns der Hauptstraße; die zwei Automaten und zwei Shops liegen weit genug auseinander (mindestens 24 Kacheln).

- [ ] **Step 1: Tests zuerst** (`city-plan.test.ts`), die alle oben genannten Anforderungen als Tests ausdrücken (Länge, Rand, Zähler, Erreichbarkeit per Flutfüllung ab jedem `@`, Zonen, Lage der Spots auf begehbaren Kacheln, Auto-Paare, Gebäudegrößen über Zusammenhangskomponenten der Buchstaben, mindestens 3 verschiedene Gebäudebuchstaben). `city-parity.test.ts`: `CITY_TILED_MAP` deep-equal `parseTiledMap(planToTiled(CITY_PLAN, CITY_ZONES))`, die eingecheckte JSON gleich dem Generator-Ausgabeobjekt (Task 3: ohne Grafikebenen), Retro-Parität wie bisher auf den umbenannten Dateien. Unbekanntes Zeichen im Plan wirft.
- [ ] **Step 2: Plan zeichnen** (`cityPlan.ts`) und `planToTiled` für die Regel-Ebenen schreiben, `generateCity.ts`, JSON erzeugen. Der Plan darf gerne großzügig mit Details (Zäune, Hecken als `t`, Bänke) gestaltet werden, solange die Tests grün sind.
- [ ] **Step 3: `npm test` (alle Pakete), `typecheck`, `build`, `build:server` grün; Commit** `feat(core): add the 64x40 city map rules`.

---

### Task 4: Grafikebenen der Stadt aus dem Plan ableiten

**Files:** `packages/core/scripts/planToTiled.ts` (erweitern), `packages/core/src/maps/city.tiled.json` (neu erzeugt), Tests `packages/core/test/city-visuals.test.ts`.

**Interfaces:**
- Produces: `planToTiled` liefert zusätzlich die Kachelebenen `ground`, `below`, `above` (Zellnummern `gid` des Kenney-Bogens, siehe Entscheidung 4). `MAP_DEFS.city.visuals` und `MAP_VISUALS.city` sind nach der Neuerzeugung nicht mehr `null`.

**Regeln der Ableitung** (reine Funktionen im Skript, nur feste Hashes):
- `ground`: für jede Kachel das Bodenbild: Fahrbahn (Asphalt mit Mittellinie, Randlinien, Kreuzungen, Zebrastreifen an `+`), Gehweg/Platz (Pflaster, 2 bis 3 Varianten), Gras (Wiese mit Varianten); Bodenkacheln unter Gebäuden, Bäumen, Autos und Laternen bekommen den Boden der Umgebung (Gehweg), damit nichts durchscheint.
- `below`: Gebäude: Dach auf allen Gebäudekacheln, deren südlicher Nachbar dasselbe Gebäudezeichen ist, Fassade (Fenster, Türen, Markisen bei `Y`/`E`-Geschäften an der Straßenseite) auf der untersten Reihe; Farbfamilie nach Buchstabe (`R` roter Backstein, `Y` grau, `E` beige, `X` Glas); Autos (Kenney-Autos, waagerecht und senkrecht, verschiedene Farben nach Hash), Laternen, Brunnen/Wasser, Baumstämme, Bänke und Deko.
- `above`: Baumkronen (eine Reihe über dem Stamm), Dachvorsprünge und Markisenkanten, die über die Figuren ragen dürfen.
- Spots, Pfandautomat, Shop, Spawns und NPC-Eingänge liefern **keine** Grafik in den Ebenen (sie entstehen als Sprites im Client).
- Die Zellnummern wählt der Implementierer anhand des Bogens (`assets-src/kenney/sheet.html`, `modern-city/Tilemap/tilemap_packed.png`, Notizen aus Plan 5c: Dächer Spalten 0 bis 7/Zeilen 0 bis 3 plus Spalten 8 bis 18; Fassaden Spalten 0 bis 18/Zeilen 4 bis 12; Gehwege, Straße, Wiese Zeilen 19 bis 27; Bäume Spalten 31 bis 36/Zeilen 10 bis 13; Markisen Spalten 24 bis 31/Zeilen 9 bis 13; Autos Spalten 31 bis 36/Zeilen 14 bis 27) und beschreibt die Wahl im Bericht. Er kann den Bogen mit dem Lesewerkzeug auf der PNG ansehen. Feinabstimmung folgt durch den Controller per Sichtprüfung.

- [ ] **Step 1: Tests zuerst** (`city-visuals.test.ts`): `ground` hat für jede Kachel eine Zelle ungleich 0; alle Ebenen haben die Länge `64*40`; alle Zellen 0 bis 1036; Gebäudekacheln haben in `below` einen Eintrag; die unterste Reihe jedes Gebäudeblocks hat eine andere Zelle als die Reihe darüber (Fassade vs. Dach); verschiedene Gebäudebuchstaben ergeben verschiedene Dachzellen; Stämme (`t`) haben in `above` einen Eintrag eine Reihe darüber, wenn diese Kachel in der Karte liegt; die erzeugte JSON entspricht dem Generator; `parseTiledVisuals(CITY_JSON)` ist nicht `null` und die Ebenenlängen stimmen; kein Eintrag in `ground`/`below` liegt auf einem Zeichen, das die Spec als "keine Grafik" nennt (Spots usw.).
- [ ] **Step 2: Implementieren, JSON neu erzeugen, grün. Commit** `feat(core): derive the city's visual layers from the plan`.

---

### Task 5: Client: Tilesets und Kartenbild

**Files:** `packages/client/src/textureKeys.ts`, `textures.ts`, `mapRender.ts` (neu, rein), `scenes/GameScene.ts`, `scenes/BootScene.ts` falls nötig, Tests `packages/client/test/mapRender.test.ts`, `textureKeys.test.ts`.

**Interfaces:**
- Consumes: `MAP_DEFS`, `MAP_VISUALS`, `MapVisuals`, `SHEET_COLS`, `MapId`, `tileKey` (Retro).
- Produces: Texturschlüssel pro Tileset: `tileTexture(set, key)`, `spotTexture(set, type, full)`, `objectTexture(set, name)` (neu mit Präfix `city:` bzw. `retro:`); Figuren-Schlüssel bleiben ohne Präfix. `bakeStaticTextures(scene)` backt beide Sätze: `retro:*` immer gezeichnet, `city:*` aus dem Kenney-Bogen (Rückfall: gezeichnet). `mapRender.ts` (rein): `cellRect(gid: number): { col: number; row: number } | null` (gid 0 → `null`; sonst `col = (gid-1) % 37`, `row = floor((gid-1)/37)`), `visualsComplete(v: MapVisuals | null): boolean`. `bakeMapLayers(scene, mapId)` (Phaser, in `textures.ts` oder eigener Datei): für `city` je Ebene ein Canvas der Größe `cols*16 x rows*16`, Kachel für Kachel aus dem Bogen kopieren (`imageSmoothingEnabled = false`), als Texturen `map:city:ground-below` (ground + below zusammen) und `map:city:above`; nur einmal je Szenenstart (existiert die Textur, nichts tun). `retro` bekommt kein gebackenes Bild (zeichnet wie bisher pro Kachel). Hat `city` keine Ebenen oder fehlt der Bogen, zeichnet der Client eine einfarbige Karte aus `solid` (Boden grau, Wand dunkelrot), ohne Absturz.
- `GameScene`: bestimmt `mapId` (online `conn.mapId`, lokal `?map=`), `tileset = MAP_DEFS[mapId].tileset`; `drawMap`: Tileset `retro` wie bisher mit den `retro:`-Schlüsseln, Tileset `city` als zwei Bilder (`map:city:ground-below` Tiefe 0, `map:city:above` Tiefe 6, beide rechts oben ausgerichtet bei (0,0), `origin 0`); Spots, Automaten, Shop mit den Schlüsseln des Tilesets; Beschriftungen `PFAND`/`SHOP` bleiben. Die Kamera-Grenzen folgen der Kartengröße (`state.map.cols * TILE`), bereits so.

- [ ] **Step 1: Tests zuerst:** `cellRect` (gid 0 → null, 1 → (0,0), 37 → (36,0), 38 → (0,1), 1036 → (36,27), 1037 und negative/NaN → null), `visualsComplete`, Schlüssel-Funktionen mit Tileset-Präfix (Format und Verschiedenheit zwischen Tilesets).
- [ ] **Step 2: Implementieren.** Beim Backen der Stadt (64 x 40 = 2560 Kacheln x 2 Ebenen) auf Zeit achten: ein Canvas pro Ebene, ein `drawImage`-Aufruf pro Zelle.
- [ ] **Step 3: `npm test`, `typecheck`, `build` grün; Commit** `feat(client): draw the city from its visual layers and keep the retro tileset`.
- [ ] **Step 4: Handtest durch den Controller** (lokal `?map=retro` und Standard, online mit zwei Tabs, Neustart nach Rundenende, Splitscreen mit 4 Spielern), danach Nachbesserungsrunden der Zellen und des Plans nach Sicht.

---

### Task 6: Abnahme, Feinschliff, Dokumentation

- [ ] Die Sichtprüfung des Controllers ergibt Nachbesserungen an `cityPlan.ts` und der Zellwahl (Daten, kleine Commits `fix(core): ...`). Der Server läuft mit `MAP_ID=retro` und `MAP_ID=city`.
- [ ] `README.md`: Abschnitt "Karten": Standardkarte `city` (64x40), `retro` (32x20, gezeichnete Kacheln), `?map=retro` lokal, `MAP_ID` am Server, Beschreibung des Generators (`npx tsx packages/core/scripts/generateCity.ts`) und wie man den Plan ändert; Hinweis, dass die Kartenwahl in der Oberfläche noch fehlt.
- [ ] Commit `docs: describe the maps and the city generator`.

---

## Self-Review

- **Spec-Abdeckung:** Karte (Tasks 3, 4), Retro-Erhalt und Kennung (Task 1), Grafikebenen (Tasks 2, 4), Zeichnen (Task 5), Dokumentation (Task 6).
- **Platzhalter:** Der Stadtplan und die Zellwahl sind kreative Daten, durch Regeln und Tests begrenzt und durch die Sichtprüfung nachgebessert. Alle Logik ist als Signaturen und Testfälle festgelegt.
- **Typkonsistenz:** `MapId`, `MapDef`, `MAP_DEFS`, `MapVisuals`, `parseTiledVisuals`, `planToTiled`, `cellRect` heißen überall gleich. Tileset-Präfixe (`city:`, `retro:`) werden nur in `textureKeys.ts` gebildet.
- **Review Focus:** Jede Zeile hat Tests in Tasks 1 bis 5 oder den Handtest in Task 5 und 6.
