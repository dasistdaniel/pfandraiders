# PfandRaiders: Shop-Umbau (Design)

Ergänzung zu `2026-10-02-pfandraiders-design.md`, `2026-10-08-serie-shop-kampf-design.md` und `2026-10-09-online-raeume-design.md`. Ersetzt den Katalog der Shop-Phase (Spec 2026-10-08 §3) und die Wirkungen der Käufe; Serienablauf, Shop-Bedienung und Protokoll der Shop-Phase bleiben.

## Ziel

Der Shop wird übersichtlicher und taktischer: Taschen stapeln sich, der Einkaufswagen wird pro Runde gemietet, Upgrades wirken auf Suche und Pfandautomat, es gibt eine Waffe (Boxhandschuh) und zwei Verteidigungen mit eigener Wirkung (Pfefferspray, Ausweisdokumente). Essen wird nicht mehr gekauft, sondern beim Suchen gefunden. Das HUD zeigt den eigenen Container als Reihe von Flaschensymbolen.

Umsetzung in zwei PRs:

- **PR 1 „Wirtschaft“** (`docs/superpowers/plans/2026-10-09-shop-umbau-wirtschaft.md`): §1, §2, §3 ohne Boxhandschuh, §5 (Essensfunde), §6 (HUD), Entfernungen aus §4, README.
- **PR 2 „Waffen und Verteidigung“** (`docs/superpowers/plans/2026-10-09-shop-umbau-waffen.md`): Boxhandschuh, Pfefferspray, Ausweisdokumente.

Nach jedem PR sind alle Tests, Typecheck und Builds grün und das Spiel ist lokal und online spielbar.

## Entscheidungen

### 1. Katalog

1. Kategorien in dieser Reihenfolge: **Taschen**, **Upgrades**, **Waffen**, **Verteidigung**. Die Kategorie-Kennung `attack` heißt jetzt `weapons` (Anzeige „Waffen“).
2. Katalog nach PR 2 (Preise in `CONFIG.shop`, alle Werte sind erfundene Startwerte für das spätere Balancing; das steht als Kommentar im Code):

| Kategorie | Kennung | Name | Art | Preis | Grenze | Wirkung |
| --- | --- | --- | --- | --- | --- | --- |
| Taschen | `bag` | Tasche | Stück, je Kauf eins | 1,50 € | 4 | +2 Plätze je Stück |
| Taschen | `backpack` | Rucksack | Stück, je Kauf eins | 4,00 € | 2 | +5 Plätze je Stück |
| Taschen | `cart` | Einkaufswagen | einmal, **Miete** | 1,00 € | 1 | +10 Plätze, Tempo × 0,70, nur eine Runde |
| Upgrades | `flashlight` | Taschenlampe | Stufen | 2, 5, 10 € | 3 | Suchzeit × 0,85 / 0,70 / 0,55 |
| Upgrades | `card` | Kundenkarte | einmal | 3,00 € | 1 | Pfandautomat: alle 100 ms statt 150 ms eine Flasche |
| Upgrades | `card_plus` | Kundenkarte+ | einmal, braucht `card` | 6,00 € | 1 | +10 % Pfand je Flasche |
| Waffen | `glove` | Boxhandschuh | einmal | 4,00 € | 1 | Schlag 30 statt 20 Schaden (PR 2) |
| Verteidigung | `pepper` | Pfefferspray | Stück = 10 Ladungen | 3,00 € | 99 Ladungen | eigene Taste, siehe §4.2 (PR 2) |
| Verteidigung | `id_papers` | Ausweisdokumente | einmal, **eine Runde** | 3,00 € | 1 | Polizei kontrolliert nicht (PR 2) |
| Verteidigung | `dog_treat` | Leckerli | Stück | 1,00 € | 99 | unverändert: lenkt einen Hund ab |

3. In PR 1 steht unter Waffen noch der bisherige **Stärkerer Schlag** (`punch`, 3 Stufen, +5/+10/+15 Schaden, 2,50/6/12 €); PR 2 ersetzt ihn durch den Boxhandschuh.
4. **Entfernt** (aus Katalog, Zustand, Wirkung, Tests und README): Knockout kürzer (Knockout dauert immer 20 s), Laufgeschwindigkeit, Rüstung, Bolzenschneider (Ausrauben nimmt immer die Hälfte), Steinschleuder, Pistole (auch keine „bald“-Einträge mehr), Essen (Kauf, Vorrat, Essen-Taste, Hinweis, HUD-Anzeige, Tastatur- und Gamepad-Belegung).
5. Alle Taschenarten sind immer sichtbar und einzeln kaufbar: je Kauf genau ein Stück, bis zur Grenze (Anzeige „hast n/4“). Eine Mengenwahl (◄ ►) gibt es dort nicht, damit links/rechts in der ersten Kategorie weiter die Kategorie wechselt; Mengen gibt es nur bei Leckerli (und in PR 2 beim Pfefferspray).
6. Der Server prüft jeden Kauf (`shopBuy`) wie bisher ohne Teilkauf: unbekannter Artikel, falsche Kategorie, ungültige Menge, Grenze überschritten, Voraussetzung fehlt (`card_plus` ohne `card`: „Erst die Kundenkarte kaufen.“), zu wenig Geld.

### 2. Taschen

1. Kapazität = 3 (Hände) + 2 × Taschen + 5 × Rucksäcke + 10 × Einkaufswagen. Höchstens 3 + 8 + 10 + 10 = **31**, ohne Wagen 21.
2. Tempo: mit Einkaufswagen × 0,70, sonst × 1. Tasche und Rucksack bremsen nicht.
3. Der Einkaufswagen ist gemietet: Er gilt nur für die Runde nach dem Kauf und ist am Ende dieser Runde weg (Fortschritt `cart = 0`). Der Shop schreibt „mieten“ und „gemietet für die nächste Runde“.
4. Das bisherige `containerLevel` und `CONFIG.containers`/`CONFIG.upgradePrices` entfallen. Hinweise und Prüfungen (Suchen, Ausrauben, Abgabe, „Container voll“) rechnen mit der neuen Kapazität.

### 3. Upgrades

1. **Taschenlampe** ersetzt „Schneller suchen“: Suchzeit = `round(1500 ms × Faktor)`.
2. **Kundenkarte**: Abgabeabstand 100 ms statt 150 ms (die erste Flasche weiter sofort beim Drücken).
3. **Kundenkarte+**: +10 % Pfand je Flasche. Die Nutzerin nannte 2 %; das ginge bei 8 ct Plastik in der Rundung unter, daher 10 % als ein Wert `CONFIG.shop.cardPlusBonusPct`. Gerechnet wird je Flasche ganzzahlig: `wert + floor((wert × prozent + 50) / 100)`, also kaufmännisch gerundet: Plastik 8 → 9, Glas 15 → 17, Kasten 25 → 28 ct. Der Aufschlag zählt wie normales Pfand zu Geld, Rundenverdienst und Gesamtverdienst (also auch zur Rangliste).

### 4. Waffen und Verteidigung (PR 2)

1. **Boxhandschuh**: Schlagschaden 20 + 10 = 30 (`CONFIG.fight.gloveBonus`). Sonst bleibt der Schlag wie bisher (Reichweite 20 px, 0,6 s Pause, Schutz verhindert Schaden).
2. **Pfefferspray**: Ein Kauf bringt 10 Ladungen, Käufe addieren sich (höchstens 99 Ladungen). Eigene Taste (frei gewordene Essen-Taste: Tastatur 1 `C`, Tastatur 2 `,`, Gamepad `Y`). Ein Druck (Flanke) wirkt nur, wenn Ladung da ist, die Abklingzeit (1 s) abgelaufen ist und ein wacher anderer Spieler höchstens 30 px entfernt steht (der nächste; Gleichstand: Reihenfolge der Spieler). Dann: 1 Ladung weg, Abklingzeit 1 s, sichtbare Wolke und Ton. Das Opfer wird 40 px vom Sprühenden weggestoßen (pixelweise, mit derselben Kollision wie beim Laufen, an Wänden bleibt die blockierte Achse stehen) und verliert **2 Leben** (die Nutzerin sagte „2 Punkte“, gemeint sind Lebenspunkte). Stehen beide genau auf demselben Punkt, geht der Stoß nach rechts (+x). Hat das Opfer Schutz (nach dem Aufstehen), werden Ladung und Abklingzeit verbraucht, aber es gibt weder Stoß noch Schaden (wie beim Schlag). Ohne Ziel passiert nichts (keine Ladung, keine Abklingzeit). Sprühen bricht die eigene Suche ab, der Treffer die des Opfers (wie Schaden).
3. **Ausweisdokumente**: gilt nur für die Runde nach dem Kauf und ist am Rundenende weg (wie der Wagen). Wer sie hat, wird von Polizisten nicht gejagt, nicht kontrolliert und nicht beschlagnahmt.
4. **Leckerli**: unverändert (1 € je Stück, bis 99, wird automatisch eingesetzt).

### 5. Essensfunde (PR 1)

1. Beim Abschluss jeder Suche würfelt der Kern genau einmal (Kern-Zufall, deterministisch): Mülleimer (`bin`) 10 %, alle anderen Spot-Arten 4 % (`CONFIG.health.food.chance`). Bei einem Fund würfelt er, falls die Spot-Art mehrere Texte hat, einen Text.
2. Der Fund heilt sofort 30 Leben (bis zum Maximum) und ist damit verbraucht. Die Flaschen des Spots sind davon unberührt.
3. Texte je Spot-Art:
   - `bin`: „Cheeseburger im Müll gefunden! +30 Leben“ oder „Halber Döner aus der Tonne. Schmeckt erstaunlich okay.“
   - `bench`: „Angebissene Currywurst auf der Bank. Egal, Hunger!“
   - `bush`: „Kalte Pizza unterm Busch gefunden. Lecker!“
   - `bus_stop`: „Vergessene Brezel an der Haltestelle. Noch knusprig.“
   - `park`: „Halbes Eis im Gras. Noch nicht geschmolzen!“
4. War das Leben schon voll (so gerechnet wie die Zahl im HUD, also aufgerundet 100), wird „ Aber du bist schon satt.“ angehängt; das Essen ist trotzdem weg.
5. Signal an den Client: privates Feld `lastFood: { n, spot, text, full } | null` am Spieler. `n` zählt die Funde der Runde (1, 2, …), `text` ist der Index des Textes. Der Client vergleicht `n` mit dem vorigen Zustand und zeigt bei einer Erhöhung den Text 3 s lang als Hinweis, nur dem Finder (Splitscreen: in dessen Ansicht; online: nur der eigene Snapshot hat das Feld, fremde sehen `null`). Ein Zähler statt eines Ein-Tick-Signals, weil lokal mehrere Schritte pro Frame laufen und online Snapshots fehlen können.
6. Die Essen-Taste, `Input.eat`, der Vorrat `food` und die Zeile „Essen“ in HUD, Hinweisen, Steuerungsübersicht und README entfallen.

### 6. HUD (PR 1, Ergänzung in PR 2)

1. Statt der Zahl „Tasche 3/8 Pl2 Gl1 Ka0“ zeigt das eigene HUD eine Reihe Flaschensymbole: belegte Plätze nach Art gefärbt (Plastik blau, Glas grün, Kasten braun), in Abgabe-Reihenfolge (Kasten, Glas, Plastik), freie Plätze grau; 16 je Zeile, also höchstens 2 Zeilen bei 31 Plätzen. Gezeichnet mit Phaser-Grafik wie die übrigen Formen, keine neuen Dateien.
2. Darüber zwei Textzeilen: „Zeit … Geld …“ und „Leben …“ mit kompakten Hinweisen auf Besitz: `Leckerli n`, `Wagen`, `Karte` bzw. `Karte+`, ab PR 2 `Spray n`, `Ausweis`.
3. Das Layout der Symbole kommt aus einer reinen Hilfsfunktion mit Tests.
4. Fremde Spieler erscheinen im HUD wie bisher nicht; über den Figuren ändert sich nichts.

### 7. Serie und Fortschritt

1. Der Fortschritt (`Progress`) besteht aus `money`, `items` (Besitz je Artikel als Zahl) und `earnedTotal`. Er bleibt über die Runden, außer den Mietsachen (`cart`, in PR 2 auch `id_papers`): Sie werden am Ende jeder Runde auf 0 gesetzt, online im Raum (`endRound`) und lokal (`LocalShop.fromState`) über dieselbe Kernfunktion.
2. Fremder Besitz ist privat: Snapshots zeigen fremden Spielern `items` als lauter Nullen und `lastFood = null`.
3. Protokoll: `shopBuy` nimmt die neuen Kennungen, `shopState.you` hat die neue Form, `Input` verliert `eat` (PR 1) und bekommt `spray` (PR 2). Client und Server müssen jeweils gemeinsam neu gebaut werden.

### 8. Nicht Teil dieses Umbaus

Neue Grafiken oder Sounddateien, Fernkampfwaffen, Balancing der Preise, Anzeige fremder Ausrüstung, eine Ausrichtung (Blickrichtung) der Figur für das Spray.

## Tests (Überblick)

- Core: Katalog und Kaufprüfung (Grenzen, Mengen, Voraussetzung, kein Teilkauf), Kapazität und Tempo aus `items`, Abgabe mit Kundenkarte (Abstand) und Kundenkarte+ (9/17/28 ct, Verdienst), Taschenlampe, Essensfund (Chance, Heilung, satt, Zähler, Determinismus), feste Knockout-Dauer, Ausrauben immer halb, Mietsachen nach der Runde weg, Snapshot-Allow-List mit neuen Schlüsseln; PR 2: Boxhandschuh, Spray (Ziel, Ladung, Abklingzeit, Stoß an Wänden, gleicher Punkt, Schutz, Flanke), Polizei ignoriert Ausweis.
- Server: Kaufen mit neuen Artikeln, Mietsachen über eine Runde, `shopState`-Form.
- Client: Eingabe ohne Essen (PR 1) bzw. mit Spray (PR 2), Tastenbeschriftungen, Shop-Zeilen, `parseProgress` und Snapshot-Prüfung mit neuer Form, Flaschensymbol-Layout, Status- und Hinweistexte, Essensfund-Hinweis aus dem Zustandsvergleich; PR 2: Spray-Wolke, Spray-Ton, Vorhersage nach dem Stoß.
