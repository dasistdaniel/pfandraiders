# Eigene Karten bauen

PfandRaiders lädt jede Tiled-Karte aus `packages/core/src/maps/custom/`. Diese Anleitung führt vom leeren Tiled bis zum Spiel; die kurze Fassung steht im README unter "Eigene Karten".

## 1. Tiled einrichten

- [Tiled](https://www.mapeditor.org) ab Version 1.10 installieren.
- Datei > Projekt öffnen > `maps-src/pfandraiders.tiled-project`. Das Projekt zeigt die Ordner `maps-src/` und den Kartenordner und kennt den Eigenschaftstyp `SpotType`.
- Der Kachelsatz `maps-src/kenney-city.tsx` nutzt direkt den Kenney-Bogen des Spiels (`packages/client/src/assets/kenney/modern-city.png`, 37 x 28 Kacheln zu 16 px). Nicht kopieren, nicht verschieben: Der Pfad ist relativ.

## 2. Neue Karte aus der Vorlage

1. `maps-src/vorlage.tmx` kopieren, z. B. nach `maps-src/hafen.tmx` (die Vorlage selbst nie ändern, sie wird erzeugt).
2. In Tiled öffnen. Karte > Karteneigenschaften:
   - Kachelgröße 16 x 16, Ausrichtung Orthogonal, **Unendlich aus**.
   - Größe 32 x 20 bis 128 x 80 Kacheln (Karte > Kartengröße ändern).
   - **Kachelebenen-Format: CSV** (nicht Base64 oder komprimiert).
   - Eigene Eigenschaften: `name` (Anzeigename, 1 bis 24 Zeichen, z. B. "Hafen") und `tileset` (`city` für die Kenney-Grafik, `retro` für die selbst gezeichneten Kacheln ohne Grafikebenen).

## 3. Ebenen

| Ebene | Art | Pflicht | Bedeutung |
| --- | --- | --- | --- |
| `ground` | Kachelebene | bei `tileset = city` | Boden (Straße, Gehweg, Gras, Fassaden) |
| `below` | Kachelebene | nein | Details unter den Figuren (Dächer, Fenster, Stämme, Autos) |
| `above` | Kachelebene | nein | über den Figuren (Baumkronen, Laternenköpfe) |
| `walls` | Kachelebene | ja | **jede Kachel hier ist eine Wand** (welche, ist egal; die Vorlage nimmt Kachel 1) |
| `soft` | Kachelebene | nein | weiche Hindernisse (Baum, Laterne): blockieren nur einen kleinen Kern |
| `objects` | Objektebene | ja | Startpunkte, Pfandautomaten, NPC-Eingänge, Spots |
| `zones` | Objektebene | ja (darf leer sein) | Rechtecke für Stadion- und Konzert-Events |

Andere Ebenennamen, Gruppen oder doppelte Ebenen lehnt die Prüfung ab (Groß-/Kleinschreibung zählt).

Wände malt man von Hand in `walls`, passend zum Bild in `ground`/`below`. Bei `tileset = city` braucht jede Wandkachel ein Bild in `ground` oder `below`, sonst zeichnet das Spiel die ganze Karte einfarbig. Kacheln **nicht drehen oder spiegeln** (Tasten X, Y, Z in Tiled); das Spiel zeichnet keine Drehungen. Nur Kacheln aus `kenney-city` verwenden.

## 4. Objekte

Nur **Punkt-Objekte** (Werkzeug "Punkt einfügen"), am besten in die Kachelmitte. Am einfachsten: vorhandene Objekte der Vorlage kopieren (Strg+C, Strg+V) und verschieben. Der Objekttyp steht im Feld "Klasse".

| Klasse | Anzahl | Hinweis |
| --- | --- | --- |
| `spawn` | genau 8 | Startpunkte der Spieler; mit Platz zur Wand |
| `dropoff` | mindestens 1 | Pfandautomat |
| `npc_spawn` | mindestens 2 | Eingänge für Hunde und Polizisten, gern am Kartenrand |
| `spot` | mindestens 20 | Eigenschaft `spotType`: `bus_stop`, `bench`, `bush`, `bin` oder `park` |

Zonen (Ebene `zones`) sind Rechtecke mit Namen (z. B. "Stadion") und der Eigenschaft `zoneId` (eindeutig, z. B. `stadium`, `concert`). Sie müssen ganz in der Karte liegen.

Weitere Regeln: Kein Objekt auf einer Wand oder einem weichen Hindernis. Von jedem Startpunkt aus muss jeder Startpunkt, Pfandautomat, Spot und NPC-Eingang zu Fuß erreichbar sein (waagerecht und senkrecht; Wände und weiche Hindernisse sperren).

## 5. Exportieren und einbinden

1. Datei > Exportieren als … > **JSON-Kartendatei**, Ziel `packages/core/src/maps/custom/<kennung>.tiled.json`. Die Kennung ist der Dateiname: nur `a-z`, `0-9` und `-`, höchstens 24 Zeichen, nicht `city` oder `retro`. "Kachelsätze einbetten" darf an oder aus sein.
2. Im Wurzelordner `npm run maps`. Das Skript prüft alle Karten im Ordner und trägt sie in `custom/index.ts` ein. Bei Fehlern listet es jede Datei mit allen Problemen und ändert nichts.
3. `npm test` (prüft alle Karten noch einmal und spielt auf jeder kurz eine Runde).
4. Ausprobieren: `npm run dev`, dann `http://localhost:5173/?solo=1&map=<kennung>`, oder in der lokalen Lobby mit hoch/runter wählen. Online wählt der Host die Karte in der Lobby; Server und Client müssen dieselbe Kartenliste haben (gleicher Build).
5. Die `.tiled.json`-Datei und die geänderte `custom/index.ts` committen (die `.tmx` aus `maps-src/` gern auch).

## 6. Häufige Fehlermeldungen

| Meldung (Auszug) | Abhilfe |
| --- | --- |
| `Kachelebenen-Format muss CSV sein` | Karteneigenschaften > Kachelebenen-Format auf CSV, neu exportieren |
| `Unendliche Karten gehen nicht` / `in Stücke geteilt` | Karteneigenschaften > Unendlich aus |
| `Kachel ist gespiegelt oder gedreht` | Kachel an der genannten Stelle ungedreht neu setzen |
| `liegt außerhalb des Kenney-Bogens` / `firstgid 1` | nur den Kachelsatz kenney-city verwenden |
| `Unbekannte Ebene` / `Pflichtebene … fehlt` | Ebenen exakt wie in Abschnitt 3 benennen |
| `ist kein Punkt-Objekt` / `Kachelobjekt` | Objekt mit "Punkt einfügen" neu anlegen |
| `liegt zu nah an einer Wand` | Punkt in die Kachelmitte ziehen |
| `Nicht von jedem Startpunkt aus erreichbar` | Durchgang in `walls`/`soft` freimachen |
| `Wand ohne Grafik` | an der Stelle ein Bild in `ground` oder `below` setzen |
| `Kennung … gehört einer eingebauten Karte` | Datei umbenennen |

## 7. Grenzen

- Wände kommen nur aus der Ebene `walls`; sie aus Kacheleigenschaften des Kachelsatzes abzuleiten ist spätere Arbeit.
- Ein Kachelsatz (`kenney-city`), keine gedrehten Kacheln, keine Karten zur Laufzeit hochladen.
- Die Vorlage und die Beispielkarte `uebung` erzeugt `npm run maps:vorlage` aus `packages/core/scripts/templateMap.ts`; Änderungen dort, nicht in den erzeugten Dateien.
