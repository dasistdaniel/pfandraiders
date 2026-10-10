# PfandRaiders: Eigene Karten (Design)

Ergänzung zu `2026-10-03-stadtkarte-design.md` und `2026-10-09-online-raeume-design.md`. Macht aus den zwei fest eingebauten Karten eine erweiterbare Kartenliste: Jede Tiled-Datei in einem Ordner wird zur spielbaren Karte, wird beim Laden streng geprüft und ist lokal wie online wählbar.

## Ziel

Wer eine Karte in Tiled baut, legt die exportierte JSON-Datei in `packages/core/src/maps/custom/`, ruft `npm run maps` auf und kann sie danach lokal und online spielen. Fehler in der Karte (falsche Ebenen, gedrehte Kacheln, unerreichbare Spots, zu wenige Startpunkte) meldet das Werkzeug auf Deutsch mit Dateiname und Stelle, bevor das Spiel startet. Der Host eines Online-Raums wählt die Karte in der Lobby, die Raumliste zeigt sie.

## Aufteilung

- **PR 1 (Registrierung):** Prüfung, Kartenordner, `npm run maps`, `MapId` als Zeichenkette, Kartenwahl lokal und online, Protokoll, Server, Client. Plan: `docs/superpowers/plans/2026-10-10-eigene-karten-registrierung.md`.
- **PR 2 (Vorlage):** Tiled-Projekt `maps-src/` mit Kachelsatz, Vorlage (TMX und JSON), eine kleine gültige Beispielkarte im Kartenordner, Anleitung in README und `docs/KARTEN.md`. Plan: `docs/superpowers/plans/2026-10-10-eigene-karten-vorlage.md`.

## Entscheidungen

### 1. Kartenordner und Registrierung

1. Ordner `packages/core/src/maps/custom/`. Jede Datei `<id>.tiled.json` ist eine Karte. Die Kennung `id` ist der Dateiname ohne `.tiled.json`: nur `a-z`, `0-9` und `-`, 1 bis 24 Zeichen, nicht `city` oder `retro` (eingebaute Karten).
2. `npm run maps` (Skript im Wurzel-`package.json`, `tsx packages/core/scripts/generateCustomMaps.ts`) liest den Ordner, prüft jede Karte (Abschnitt 2) und schreibt `custom/index.ts` neu. Die Datei wird committet, ist deterministisch (nach Kennung sortiert, LF-Zeilenenden) und importiert jede JSON-Datei mit `import map_<id> from './<id>.tiled.json'` (wie `city.ts` die Stadt importiert). Damit bündeln esbuild (Server) und Vite (Client) die eigenen Karten wie die eingebauten.
3. Gibt es ein Problem, schreibt das Skript nichts, listet alle Probleme je Datei und endet mit Code 1. Ein Test prüft, dass die committete `custom/index.ts` genau der Ausgabe des Generators für den Ordnerinhalt entspricht (wer eine Datei ablegt und `npm run maps` vergisst, bekommt einen roten Test).
4. Anzeigename aus der Tiled-Karteneigenschaft `name` (sonst die Kennung), Kachelsatz aus der Karteneigenschaft `tileset` (`city` = Kenney-Bogen mit Grafikebenen, Standard; `retro` = selbst gezeichnete Kacheln aus den Kacheltypen).
5. `MapId` wird `string`. `isMapId(v)` prüft gegen die Kartenliste. `MAP_DEFS` ist ein Objekt ohne Prototyp (`__proto__`, `constructor` sind keine Karten). Neu: `MAP_LIST` (`{ id, name }[]`: eingebaute zuerst, dann eigene nach Kennung), `mapName(id)`, `stepMapId(id, dir)`, `MAP_SOURCES` (Tiled-JSON je Karte, für Tests), `TilesetId = 'city' | 'retro'`. `DEFAULT_MAP_ID = 'city'` bleibt.
6. Eigene Karten werden beim Laden des Kerns geprüft. Eine ungültige eigene Karte wirft mit Dateinamen und allen Problemen; Server und Client starten dann gar nicht (lieber laut als halb kaputt). Die eingebauten Karten werden nur im Test geprüft, damit die Grafikebenen der Stadt weiter erst bei Bedarf geparst werden.

### 2. Prüfregeln

Eine gemeinsame Funktion `validateTiledMap(json, { rules, tileset })` liefert alle Probleme als deutsche Sätze (leere Liste = gültig) und die gelesene Karte. Sie dient dem Skript, der Registrierung und einem Test über **alle** registrierten Karten.

| Regel | Eigene Karten | Hinweis im Fehlertext |
| --- | --- | --- |
| Kachelgröße | 16 x 16 | |
| Größe | 32 x 20 bis 128 x 80 Kacheln | |
| Ausrichtung, endlich | `orthogonal`, `infinite` aus | "Unendlich" ausschalten |
| Ebenen | Pflicht: `walls` (Kachelebene), `objects`, `zones` (Objektebenen). Optional: `soft`, `ground`, `below`, `above` (Kachelebenen). Andere Namen und Gruppen sind Fehler. | erlaubte Namen |
| Kachelebenen-Format | CSV (Zahlenliste im JSON); Base64/zlib/zstd sind Fehler; Länge = Breite x Höhe | Karteneigenschaften > Kachelebenen-Format |
| Kachelsatz | höchstens einer, `firstgid` 1 (extern oder eingebettet) | nur kenney-city |
| Grafik-Kacheln (`ground`, `below`, `above`) | 0 bis 1036 (`SHEET_CELLS`); gespiegelte oder gedrehte Kacheln (gid ab `0x10000000`) sind Fehler | "ohne X, Y oder Z setzen" |
| Kachelsatz `city` | Ebene `ground` Pflicht; jede Wandkachel hat Grafik in `ground` oder `below` | sonst einfarbige Karte |
| Kachelsatz `retro` | Grafikebenen dürfen fehlen (werden ignoriert) | |
| Objekte | nur Punkt-Objekte (`point`), keine Kachelobjekte (`gid`); Typen `spawn`, `dropoff`, `npc_spawn`, `spot` (mit `spotType` `bus_stop`, `bench`, `bush`, `bin`, `park`); andere Typen sind Fehler | Werkzeug "Punkt einfügen" |
| Anzahl | genau 8 `spawn`, mindestens 1 `dropoff`, mindestens 20 `spot`, mindestens 2 `npc_spawn` | |
| Lage | kein Objekt auf einer Wand oder einem weichen Hindernis (`soft`); Startpunkte und NPC-Eingänge mit Platz für die Spielfigur (`boxBlocked` mit `CONFIG.playerHalf`) | "in die Kachelmitte setzen" |
| Erreichbarkeit | von jedem Startpunkt aus jeder Startpunkt, Pfandautomat, Spot und NPC-Eingang (Vierer-Nachbarn, Wände und weiche Hindernisse sperren) | Liste der ersten fünf |
| Zonen | Rechtecke in der Karte, `zoneId` eindeutig (wie bisher); keine Zone ist erlaubt | |
| Eigenschaft `name` | 1 bis 24 Zeichen nach dem Entfernen von Steuer- und Formatzeichen | |
| Eigenschaft `tileset` | `city` oder `retro` | |

Die eingebauten Karten müssen dieselben Regeln erfüllen, mit einer Ausnahme (Entscheidung R1).

### 3. Kartenwahl

1. **Protokoll:** neue Client-Nachricht `setMap` (`mapId: string`); unbekannte Kennung = ungültige Nachricht (`bad_message`). `lobby` trägt zusätzlich `mapId` und `mapName`. `RoomInfo` (Raumliste) trägt `mapName`. `start` trägt wie bisher `mapId` und die Karte.
2. **Server:** `setMap` nur Host (`not_host`), nur Phase `lobby` (`wrong_phase`). Die Wahl gilt ab dem nächsten Serienstart, für alle Runden der Serie und bleibt nach `toLobby` erhalten. Neue Räume starten mit `MAP_ID` des Servers (bestehende Auswertung `parseMapId`), sonst `city`; eine unbekannte `MAP_ID` ergibt `city` und eine Warnung mit der Liste der bekannten Kennungen.
3. **Online-Lobby (Client):** Zeile "Karte: <Name>"; der Host wechselt mit ◄ ► (Klick oder Pfeiltasten links/rechts auf der Zeile), Gäste sehen nur den Namen. Die Raumliste bekommt die Spalte "Karte".
4. **Lokales Spiel:** Kartenzeile in der lokalen Lobby ("Karte: ▲ Stadt ▼", hoch/runter), gemerkt in `localStorage` (`pfandraiders.mapId`, mit try/catch, Unbekanntes ergibt `city`). `?map=<id>` in der URL hat Vorrang (Testhilfe). Die Karte bleibt über alle Runden der Serie (Spiel → Shop → Spiel).

### 4. Vorlage und Anleitung (PR 2)

1. `maps-src/` im Repo-Wurzelverzeichnis (wird versioniert; `assets-src/` bleibt ignoriert): `pfandraiders.tiled-project`, Kachelsatz `kenney-city.tsx` (Bild `../packages/client/src/assets/kenney/modern-city.png`, 37 x 28 Zellen zu 16 px, 592 x 448 Pixel; wird nur referenziert, nicht kopiert), Vorlage `vorlage.tmx` und deren Export `vorlage.tiled.json`.
2. Die Vorlage hat alle Ebenen (`ground`, `below`, `above`, `walls`, `soft`, `objects`, `zones`), Beispielobjekte jedes Typs und jeder Spot-Art, beide Zonen und die Eigenschaften `name` und `tileset`. Sie entsteht deterministisch aus einem ASCII-Plan mit `planToTiled` (wie die Stadt) und wird von einem Test gegen den Generator geprüft.
3. Beispielkarte `packages/core/src/maps/custom/uebung.tiled.json` (Name "Übung", aus derselben Vorlage), damit die eigenen Karten in jedem Testlauf durchlaufen werden.
4. README-Abschnitt "Eigene Karten" (Kurzfassung mit Schritten) und `docs/KARTEN.md` (ausführlich: Tiled einrichten, Ebenen, Objekte, Exporteinstellungen, Regeln, Fehlerbilder).
5. **Annahme:** Wände werden von Hand in der Ebene `walls` gemalt (jede Kachel dort = Wand), weiche Hindernisse in `soft`. Wände aus Kacheleigenschaften des Kachelsatzes abzuleiten ist spätere Arbeit.

## Entscheidungen zu Lücken (Rulings)

- **R1 Eingebaute Karten:** `retro` hat 4 Startpunkte und 17 Spots und bleibt unverändert (Tests und Paritätsdatei hängen daran). Darum gibt es zwei Regelsätze: `CUSTOM_MAP_RULES` (genau 8 Startpunkte, mindestens 20 Spots) für eigene Karten und `BUILTIN_MAP_RULES` (4 bis 8 Startpunkte, mindestens 16 Spots) nur für die eingebauten. Größe 32 x 20 (retro) ist zugleich die Mindestgröße. Der Test über alle Karten prüft ausdrücklich, dass `retro` an den strengen Regeln genau bei Startpunkten und Spots scheitert und `city` sie erfüllt.
- **R2 Erreichbarkeit:** Weiche Hindernisse sperren bei der Prüfung (wie bei der Wegsuche der NPCs); die Stadt erfüllt das. Die Flutfüllung wandert aus den Tests nach `src/map.ts` (`reachableTiles`, `tileIndexAt`).
- **R3 Objektart:** Tiled 1.9 schreibt den Objekttyp als `class`, ältere und neuere Versionen als `type`; der Parser nimmt `class`, wenn `type` fehlt oder leer ist.
- **R4 Kachelsatz:** `tilesets` darf fehlen (eingebaute Karten) oder genau einen Eintrag mit `firstgid` 1 haben, extern (`source`) oder eingebettet; der Kern liest nur die Zahlen. Empfohlen ist extern (Vorlage).
- **R5 Ebenennamen** sind exakt (Groß-/Kleinschreibung); unbekannte Ebenen sind Fehler, damit Tippfehler wie `Walls` auffallen.
- **R6 Gedrehte Kacheln:** In `walls` und `soft` zählt jede Zahl ungleich 0 als belegt (Drehbits sind dort egal). In den Grafikebenen ist jede gid ab `0x10000000` ein Fehler (der Client zeichnet keine Drehungen).
- **R7 Fehlertexte** sind deutsch, sammeln alle Probleme und nennen bei der Registrierung den Dateinamen ("Eigene Karte x.tiled.json ist ungültig:"). Englische Meldungen des bestehenden Parsers erscheinen eingebettet ("Tiled-Datei nicht lesbar: invalid tiled map: ...").
- **R8 Höchstzahl Startpunkte** 8 = `MAX_ROOM_PLAYERS`. Die Prüfung kann `protocol.ts` nicht importieren (Zyklus über `maps`), ein Test sichert die Gleichheit.
- **R9 Wahl nur in der Lobby:** `setMap` in `shop` oder `final` ist `wrong_phase`. Die Kartendaten-Vorgabe `RoomOptions.map` (nur Tests) gilt, bis der Host eine andere Karte wählt.
- **R10 Versionsunterschied Client/Server:** `start` mit einer dem Client unbekannten Karte wird weiter verworfen (wie bisher). Die Lobby zeigt trotzdem den Namen, den der Server schickt. Raumlisten-Einträge ohne `mapName` (älterer Server) bleiben erhalten, die Spalte zeigt "?".
- **R11 Lokale Lobby:** links/rechts ändern schon die Rundenzeit, darum wechselt hoch/runter (W/S, ↑/↓, Steuerkreuz/Stick) die Karte. Das Hauptmenü bleibt unverändert; die Testhilfe `?players=` nutzt die gemerkte Karte.
- **R12 Online-Lobby:** ◄ ► statt Auswahlliste, wie in der Vorgabe; die Raumliste wird 520 px breit, damit die neue Spalte passt.
- **R13 Ordnerinhalt:** Außer `index.ts` und `*.tiled.json` ist jede Datei in `custom/` ein Fehler für `npm run maps`.
- **R14 Exporteinstellungen (PR 2):** JSON-Export, Kachelebenen-Format CSV, "Kachelsätze einbetten" beliebig, Karte endlich; empfohlen Tiled 1.10 oder neuer.

## Nicht Teil dieser Arbeit

Karten zur Laufzeit hochladen oder vom Server an Clients schicken, Kartenvorschau im Menü, Drehen/Spiegeln von Kacheln, mehrere Kachelsätze, Wände aus Kacheleigenschaften, Kartenwahl im Hauptmenü, Kartenwechsel mitten in einer Serie.

## Tests (Überblick)

- Core: jede Prüfregel einzeln (gültige Testkarte plus je eine Abweichung), Registrierung eigener Karten (Kennung ungültig, wie eine eingebaute, doppelt, ungültige Karte mit Dateiname), Test über alle registrierten Karten (Regeln, Parität mit `MAP_DEFS`, kurzer Spieldurchlauf), Generator von `custom/index.ts` und Gleichheit mit der committeten Datei, `parseClientMessage` für `setMap`.
- Server: Host-Wahl nur in der Lobby, unbekannte Karte, Karte über Runden und `toLobby`, Standard aus `MAP_ID`, Warnung bei unbekannter `MAP_ID`, `mapName` in `lobby` und Raumliste, Nachrichtenweg `setMap`.
- Client: Lobby-Karte aus `lobby` (auch bei Unsinn), `setMap` nur als Host, Raumliste mit und ohne `mapName`, gespeicherte Karte (auch unbekannt oder gesperrter Speicher), Wahl der lokalen Karte (URL vor Lobby vor gespeichert), Grafikebenen jeder Stadt-Karte passen zur Karte.
- PR 2: Vorlage und Beispielkarte gleich der Generatorausgabe, Vorlage erfüllt die strengen Regeln, Kachelsatz zeigt auf den echten Bogen, Beispielkarte registriert, online wählbar und spielbar.
