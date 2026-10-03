# PfandRaiders: Stadtkarte 64x40 und Kartenverwaltung (Design)

Ergänzung zur Spec `2026-10-02-pfandraiders-design.md` (§3 Karte, §6 Phase 5, §11 Layout der Stadtkarte).

## Ziel

Eine echte, farbige Stadt (64 x 40 Kacheln) aus dem Kenney-Kachelsatz "Roguelike Modern City" ersetzt die kleine Karte als Standardkarte. Die alte 32 x 20 Karte bleibt als "Retro-Karte" mit den selbst gezeichneten Kacheln erhalten und kann später im Menü gewählt werden.

## Entscheidungen

1. **Kartenverwaltung:** Jede Karte hat eine Kennung (`MapId`: `city` oder `retro`), einen Namen, ein Tileset (`city` oder `retro`) und liefert `MapData`. Eine Registrierung in `core` (`MAP_DEFS`, `DEFAULT_MAP_ID = 'city'`) kennt beide. Die Kartenwahl in Menü und Raum ist **nicht** Teil dieses Plans. Zum Testen: lokal per URL `?map=retro`, online per Server-Umgebungsvariable `MAP_ID`.
2. **Protokoll:** Die Server-Nachricht `start` bekommt das Feld `mapId`. Der Client wählt damit die Grafik. Eine unbekannte Kennung wird abgelehnt (die Nachricht wird ignoriert). `MapData` selbst wird weiter mit `start` gesendet.
3. **Grafikebenen in der Tiled-Datei:** Zusätzlich zu `walls` und den Objekten enthält die Stadtkarte drei Kachelebenen `ground`, `below`, `above` mit Zellnummern des Kenney-Bogens (`gid = Zeile * 37 + Spalte + 1`, 0 = leer). `core` liest die Regeln nur aus `walls`, den Objekten und den Zonen. Die Grafikebenen liest eine eigene Funktion (`parseTiledVisuals`), die der Client nutzt. Der Server braucht sie nicht.
4. **Erzeugung per Skript:** Die Stadt wird aus einem ASCII-Plan (`cityPlan.ts`, 64 x 40 Zeichen) erzeugt. Eine Funktion `planToTiled(plan, zones)` leitet daraus Regeln (Wände, Objekte, Zonen) und Grafikebenen ab, deterministisch (fester Hash statt Zufall). Der Plan und die erzeugte JSON-Datei sind im Repository, ein Test hält beide gleich. Die Retro-Karte bleibt unverändert aus ihrer ASCII-Quelle.
5. **Plan-Legende** (zusätzlich zu den vorhandenen Zeichen `@ D S N b n g m p # .`):
   - `#` gibt es in der Stadtkarte nicht, Gebäude heißen `R` (roter Backstein), `Y` (grau), `E` (beige), `X` (Glas). Sie sind fest (solid). Die Grafik: oberste Reihen eines Gebäudeblocks Dach, unterste Reihe Fassade mit Fenstern und Türen. Die Variante wählt ein fester Hash über Spalte und Zeile.
   - `=` Fahrbahn (begehbar, Mittellinie, Zebrastreifen an Kreuzungen werden aus der Umgebung abgeleitet), `.` Gehweg und Platz (Pflaster), `,` Gras, `+` Zebrastreifen, `t` Baum (fest, Krone in der Ebene `above`), `o` Brunnen oder Wasser (fest), `c` Auto (fest, immer als waagerechtes Paar `cc` oder senkrechtes Paar), `l` Laterne (fest), `W` Randbebauung oder Hecke am Kartenrand (fest).
   - Spots (`b n g m p`), Spawns (`@`), Pfandautomat (`D`), Shop (`S`), NPC-Eingänge (`N`) stehen auf begehbaren Kacheln. Der Boden unter ihnen kommt aus der Umgebung (Gehweg, Gras oder Fahrbahn).
6. **Stadtaufteilung (Skizze, 1 Zeichen = 4 x 4 Kacheln):**
   ```
     0123456789ABCDEF
   0 WWWWWWWWWWWWWWWW
   1 WHHH=GGG=BBB=SSW
   2 WHHH=GGG=BBB=SSW
   3 WHHH=GGG=BBB=SSW
   4 W==============W
   5 WPPP=MMM=FFF=KKW
   6 WPPP=MMM=FFF=KKW
   7 WPPP=MMM=GGG=KKW
   8 WPPP=MMM=GGG=KKW
   9 WWWWWWWWWWWWWWWW
   ```
   `H` Wohnhäuser (Backstein, beige, Vorgärten, Bänke), `G` Geschäftshäuser (grau, beige, Markisen), `B` Bürohäuser (Glas), `S` Stadionplatz (Zone `stadium`), `P` Park, `K` Konzertpark (Zone `concert`), `M` Marktplatz, `F` Brunnenplatz, `=` Straßen (Hauptstraße quer, drei Querstraßen), `W` Rand. Die echten Grenzen folgen dem Plan, Straßen sind 2 bis 4 Kacheln breit, Gehwege 1 Kachel.
7. **Spielinhalt:** etwa 40 Spots, 2 Pfandautomaten (Brunnenplatz, Geschäftsviertel), 2 Shops (Marktplatz, Stadionplatz), 8 Startpunkte entlang der Hauptstraße, 4 bis 8 NPC-Eingänge an den Straßenenden (davon mindestens 2 auf Querstraßen nahe der Hauptstraße), mindestens 6 Spots je Eventzone, Zonen `stadium` und `concert` auf dem Stadionplatz bzw. im Konzertpark. Die Spielwerte (Rundenlänge, Preise) bleiben unverändert, Feinabstimmung folgt nach Testrunden.
8. **Zeichnen im Client:** Die Ebenen `ground` und `below` werden beim Spielstart einmal zu einem Bild gebacken (Tiefe 0), `above` einmal zu einem zweiten Bild über den Figuren (Tiefe 6). Spots, Pfandautomat und Shop sind weiter eigene Sprites. Die Retro-Karte zeichnet wie bisher aus `tileKey`. Texturen sind nach Tileset benannt (`city:...` und `retro:...`), die Figuren sind für beide gleich.
9. **Nicht Teil dieses Plans:** Kartenwahl-Oberfläche, Minikarte, bewegte Autos, weitere Karten, Wetter.

## Tests (Überblick)

- Plan: gleich lange Zeilen, geschlossener Rand, Anzahl Spawns (8), Pfandautomaten (2), Shops (2), Spots (mindestens 36), keine Spots oder Objekte auf festen Kacheln, alles von jedem Startpunkt aus erreichbar, Zonen in der Karte.
- Visuelle Ebenen: Länge `cols * rows`, jede Zellnummer im Bogen (0 bis 1036), Fassaden nur unter Gebäudekacheln, alle festen Gebäudekacheln haben eine Grafik.
- Parität: erzeugte JSON gleich `planToTiled(CITY_PLAN, CITY_ZONES)`; Retro-Parität wie bisher.
- Protokoll: `start` mit `mapId` wird akzeptiert, unbekannte Kennung abgelehnt.
