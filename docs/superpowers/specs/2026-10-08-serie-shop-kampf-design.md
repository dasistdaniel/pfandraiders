# PfandRaiders: Serie, Shop-Phase, Kampf (Design)

Ergänzung zu `2026-10-02-pfandraiders-design.md`. Ersetzt dort: Shop auf der Karte, Kaufen während der Runde, Einzelslot für Items, Geldverlust beim Umfallen.

## Ziel

Ein Raum spielt eine **Serie** von Runden. Zwischen den Runden gibt es eine **Shop-Phase**, in der alle Spieler Geld ausgeben. Spieler können einander schlagen, ausknocken und ausrauben.

## Entscheidungen

### 1. Serie

1. Ablauf: Lobby, Runde, Rangliste, Shop-Phase, nächste Runde. Die Serie läuft, bis der Host sie beendet.
2. Pro Spieler bleiben über Runden bestehen: Geld, Taschenstufe, Upgrade-Stufen, Verbrauchsgüter (Stückzahlen).
3. Pro Runde werden zurückgesetzt: Position (Startpunkt), Flaschen in der Tasche (leer), Leben (max), Schutz, Abklingzeiten, Spots, NPCs, Zonen, Zeit.
4. Wertung: **Rundenverdienst** (Geldzuwachs in der Runde; ausgegeben wird nur in der Shop-Phase) und **Gesamtverdienst** der Serie (Summe aller Rundenverdienste). Ausgegebenes Geld mindert den Gesamtverdienst nicht. Die Rangliste zeigt beides.
5. Ein getrennter Spieler (Reconnect-Frist) behält seinen Stand. Verlässt er den Raum endgültig, verfällt er.

### 2. Rundenzeit

1. Der Host stellt sie in der Lobby ein: 3, 5, 7 oder 10 Minuten, Standard **5 Minuten**. Lokal ebenso (Lobby).
2. Die Nachricht `start` trägt `roundMs`. Der Server prüft gegen die erlaubten Werte; sonst Standard.
3. Der Server-Wert `ROUND_MS` (Umgebung) entfällt als Pflicht, bleibt für Tests als Überschreibung.

### 3. Shop-Phase

1. Phase `shop` im Server-Raum (neben Lobby und Spiel). Alle Spieler kaufen gleichzeitig.
2. **Ende nur, wenn alle verbundenen Spieler "Bereit" gedrückt haben.** Kein Zeitlimit. Wer sich trennt, zählt nicht mit; wer wieder verbindet, ist nicht bereit. "Bereit" lässt sich zurücknehmen, solange nicht alle bereit sind. Ist niemand mehr verbunden, endet der Raum wie bisher.
3. Bedienung: **Alles nur über die Bewegungstasten** des eigenen Geräts (hoch/runter Eintrag, links/rechts Kategorie oder Menge, Aktionstaste kauft oder drückt Bereit). Keine Zahlentasten, keine weiteren Tasten. Das gilt für Einzelspieler (lokal und online) und für jeden Spieler im lokalen Mehrspieler: dort hat jeder ein eigenes Feld, das sein Gerät steuert. Gamepad: Stick oder Steuerkreuz und A. Die **Maus** funktioniert zusätzlich (Klick auf Kategorie, Eintrag, +/−, Kaufen, Bereit), ist aber nie nötig.
4. Kategorien und Inhalt (Preise und Stufen stehen in `CONFIG.shop`):
   - **Taschen:** Hände (Start), Tasche, Rucksack, Einkaufswagen (heutige `containers`, Preise wie `upgradePrices`).
   - **Upgrades:** Knockout kürzer (20 s, 15, 10, 5), Laufgeschwindigkeit (3 Stufen), schnelleres Suchen (3 Stufen).
   - **Angriff:** stärkerer Schlag (3 Stufen), Bolzenschneider (einmalig, wie bisher). Fernkampf (Steinschleuder, Pistole) ist als Eintrag mit `available: false` angelegt und wird grau mit "bald" angezeigt; kaufbar erst in einem späteren Plan.
   - **Verteidigung:** Leckerli (Stückzahl), Essen (Stückzahl), Rüstung (3 Stufen, weniger Schaden).
5. **Mehrfachkauf:** Verbrauchsgüter haben eine Stückzahl (Maximum 99). Eine Menge wählt man mit links/rechts oder +/−; Kaufen bucht Menge mal Preis. Reicht das Geld nicht, lehnt der Server den Kauf ab (kein Teilkauf).
6. Der Einzelslot `item` entfällt. Neu: `inventory` mit Stückzahlen (`dog_treat`, `food`) und `bolt_cutters` als Flag.
7. Kauftasten 1 bis 4 und `buy` im Eingabe-Befehl der Runde entfallen. Kaufen läuft nur noch über Shop-Nachrichten.

### 4. Kampf

1. Neue Taste **Schlagen**. Eingabefeld `attack` (Flanke). Reichweite 20 px, Abklingzeit 600 ms, Schaden 20 Leben (Stufen des Schlag-Upgrades erhöhen ihn, Rüstung senkt ihn, Untergrenze 5). Trifft den nächsten wachen Spieler in Reichweite; ein Schutz (`shieldMs`) verhindert Schaden.
2. Leben sind die bisherigen (Hunger, Hundebiss, Essen heilen wie heute). Bei 0 Leben: **Knockout** mit `unconsciousMs` = 20 s minus Upgrade-Stufe (Stufen laut 3.4).
3. Beim Aufstehen steht der Spieler **an derselben Stelle** (nicht am Startpunkt), mit `reviveHealth` 60 und `spawnShieldMs` 3 s.
4. Ein ausgeknockter Spieler kann **einmal pro Knockout** ausgeraubt werden: die Klauen-Taste in Reichweite (`steal.radius`) übergibt 50 % seiner Flaschen (wie heute `steal.fraction`) an den Räuber, begrenzt durch dessen Kapazität. Danach ist `robbed` gesetzt; ein zweiter Raub am selben Knockout ist wirkungslos.
5. Das Geldminus beim Umfallen (`moneyLossFraction`) entfällt. Der normale Diebstahl an wachen Spielern bleibt unverändert (Schutz 3 s, Abklingzeit 6 s).
6. Hunde beißen ausgeknockte Spieler nicht; Polizisten ignorieren sie (`wants` gibt für `unconsciousMs > 0` schon `false`).
7. Fernkampf ist nicht Teil dieses Plans. Vorbereitet: `Player.weapon: 'fist'` (später `'sling'`, `'pistol'`), `CONFIG.shop` kennt die Einträge als nicht verfügbar.

### 5. Karten

`MapData.shops` und `Shop`-Objekte entfallen aus Typ, Tiled-Ebene, ASCII-Plänen (`S`), Stadt und Retro, Grafik (Sprite, Textur) und README. Kartentests werden angepasst (keine Shops mehr).

### 6. Protokoll (Überblick)

- Client an Server: `ready` (Bereit/Nicht bereit), `shopBuy` (`{category, item, qty}`), `setRoundMs` (nur Host, nur in Lobby/Shop), Eingabe um `attack` erweitert.
- Server an Client: `phase` (`lobby`, `playing`, `shop`), `shopState` (pro Spieler: Geld, Stufen, Inventar, bereit), `start` mit `roundMs`, Rangliste mit Runden- und Gesamtverdienst.
- Die Snapshot-Allow-List wird um neue Spieler-Felder erweitert (`attackCooldownMs`, `robbed`) und um `item` bereinigt.

### 7. Nicht Teil dieses Plans

Fernkampfwaffen mit Wirkung, Zeitlimit der Shop-Phase, Teams, Karten-Auswahl, Balancing nach Testrunden.

## Tests (Überblick)

- Core: Knockout-Dauer je Stufe, Aufstehen an Ort, Raub einmalig und halbe Flaschen, Schlag (Reichweite, Abklingzeit, Schutz, Rüstung), Reset pro Runde bei Erhalt von Geld/Stufen, Rundenverdienst und Gesamtverdienst.
- Server: Phasenwechsel, "Bereit" aller Verbundenen beendet die Phase, Trennen/Wiederverbinden, Kaufen mit Geld/ohne Geld/Mehrfachkauf, nur Host setzt Rundenzeit.
- Client: Shop-Modell rein (Auswahl, Menge, Kauf), Tastatur-/Gamepad-/Maus-Navigation, Anzeige grauer Einträge.
- Karten: keine Shops, Tiled-Parität.
