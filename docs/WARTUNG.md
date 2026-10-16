# PfandRaiders: Wartungshandbuch

Rezepte für die Änderungen, die bei der Pflege des Spiels immer wieder anfallen, dazu Betrieb, Sicherheit und Fehlersuche. Den Überblick über Aufbau und Architektur gibt [HANDOVER.md](../HANDOVER.md); dieses Handbuch setzt ihn voraus. Alle Dateipfade sind vom Wurzelordner des Repositorys aus angegeben, alle Befehle laufen dort.

Für jedes Rezept gilt derselbe Rahmen:

1. Branch von `master` anlegen (`git switch -c feature/…`).
2. Wenn sich Verhalten ändert, zuerst einen Test schreiben, der fehlschlägt.
3. Ändern, dann `npm test` und `npm run typecheck`, vor dem Ausliefern zusätzlich `npm run build` und `npm run build:server`.
4. Dateien einzeln stagen (nie `git add -A`, wegen `todo.md` und `idee.md`), committen, PR öffnen, CI abwarten, mergen.
5. Ausliefern: Der Client geht nach dem Merge von selbst auf GitHub Pages. Der Server muss auf dem VPS mit `deploy/update.sh` aktualisiert werden, sobald sich `packages/core` oder `packages/server` geändert hat. Im Zweifel immer beide.

## Inhalt

- [Einen Preis oder Spielwert ändern](#einen-preis-oder-spielwert-ändern)
- [Einen neuen Shop-Artikel hinzufügen](#einen-neuen-shop-artikel-hinzufügen)
- [Einen neuen Ton oder ein neues Ereignis hinzufügen](#einen-neuen-ton-oder-ein-neues-ereignis-hinzufügen)
- [Eine Karte hinzufügen](#eine-karte-hinzufügen)
- [Eine neue Figur hinzufügen](#eine-neue-figur-hinzufügen)
- [Eine Nachricht zum Protokoll hinzufügen](#eine-nachricht-zum-protokoll-hinzufügen)
- [Verträglichkeit von Client und Server](#verträglichkeit-von-client-und-server)
- [Ruckeln im Netz untersuchen](#ruckeln-im-netz-untersuchen)
- [Betrieb des Servers](#betrieb-des-servers)
- [Zurückrollen](#zurückrollen)
- [Sicherung](#sicherung)
- [Sicherheit](#sicherheit)
- [Fehlersuche](#fehlersuche)

## Einen Preis oder Spielwert ändern

Fast alle Werte stehen in `packages/core/src/config.ts` (`CONFIG`); die Tabelle in [HANDOVER.md](../HANDOVER.md#7-tuning-werte) sagt, welches Feld was steuert. Geldbeträge sind immer ganze Cent, Zeiten immer Millisekunden, Strecken Pixel (eine Kachel hat 16 px).

1. Wert in `CONFIG` ändern. Beispiel: Die Tasche soll 2 € kosten. In `CONFIG.shop.items.bag` wird `prices: [150]` zu `prices: [200]`. Bei Artikeln mit Stufen (`kind: 'level'`, die Taschenlampe) ist `prices` die Liste „Preis von Stufe i auf i + 1“, `values` die Wirkung je Stufe und muss genau ein Element länger sein.
2. `npm test`. Einige Tests nennen bewusst konkrete Werte (zum Beispiel `core/test/shop.test.ts`, `core/test/config.test.ts`, `client/test/shopModel.test.ts`). Werden sie rot, die erwarteten Zahlen dort anpassen. Das ist gewollt: So fällt jede Wertänderung im PR auf.
3. Die Anleitung im Spiel (`client/src/helpPages.ts`), die Shop-Texte (`client/src/shopModel.ts`) und die Hinweise lesen die Werte aus `CONFIG`; sie stimmen von selbst. Das README nicht: Die Zahlen dort (Shop-Tabelle, Abschnitte Kampf, Leben und Events) von Hand nachziehen.
4. Wird eine Anleitungszeile durch eine längere Zahl zu lang, meldet das `client/test/helpPages.test.ts`; dann den Text in `helpPages.ts` kürzen.
5. Client und Server ausliefern. Der Server rechnet das Spiel; ein neuer Wert wirkt online erst nach `update.sh`. Bis dahin zeigt ein neuer Client unter Umständen andere Preise an, als der Server verlangt.

Werte, die nicht in `CONFIG` liegen: Rundenzeiten und Rundenzahlen zur Auswahl (`ROUND_MS_CHOICES`, `ROUNDS_CHOICES` in `packages/core/src/protocol.ts`), Server-Grenzen (`packages/server/src/config.ts`), Netz-Konstanten des Clients (`prediction.ts`, `renderDelay.ts`, `extrapolate.ts`).

## Einen neuen Shop-Artikel hinzufügen

Beispiel: eine „Zwille“ in der Kategorie Waffen. Der Shop ist datengetrieben; der Server prüft Käufe automatisch, die meiste Arbeit steckt in der Wirkung und in den Texten.

**Kern (`packages/core`)**

1. `src/types.ts`: Kennung zu `ShopItemId` hinzufügen, zum Beispiel `| 'sling'`.
2. `src/config.ts`: Eintrag in `CONFIG.shop.items`. Die Stelle im Objekt bestimmt die Reihenfolge im Shop. Felder: `category` (`bags`, `upgrades`, `weapons`, `defense`), `name` (Anzeige), `kind`, `prices` (Cent), `values` (nur bei `level`), optional `max`, `unit`, `perRound`, `requires`. Die Arten:
   - `once`: höchstens einmal (Boxhandschuh, Kundenkarte).
   - `level`: Stufen mit Wirkung je Stufe (Taschenlampe).
   - `count`: Stückzahl bis `max`, je Kauf genau eins (Tasche, Rucksack).
   - `stack`: Vorrat, Menge im Shop wählbar, `unit` Bestand je Stück (Pfefferspray: 10 Ladungen).
   - `perRound: true`: Miete, am Rundenende weg (Einkaufswagen, Ausweis).
3. `src/shop.ts`: Die Funktion `noItems()` ist absichtlich ein vollständiges Literal; der Typecheck scheitert, bis die neue Kennung dort mit `0` steht.
4. Falls der Artikel `requires` nutzt: `BUY_REFUSAL_TEXT.requires` in `shop.ts` sagt fest „Erst die Kundenkarte kaufen.“; diesen Text dann allgemeiner machen oder je Artikel ableiten.
5. Wirkung einbauen. Besitz steht in `player.items.<kennung>` (Zahl: Stufe, Stückzahl oder 0/1). Vorbilder: Taschen in `economy.ts` (`capacityOf`), Kundenkarte in `economy.ts`, Boxhandschuh in `fight.ts`, Taschenlampe in `search.ts` (`upgradeValue`), Pfefferspray mit Verbrauch in `spray.ts`, Leckerli und Ausweis in `npc.ts`. Neue Zahlen gehören nach `CONFIG`, nicht in den Code. Kein `Math.random()`: Zufall nur über `nextRandom(state)` aus `rng.ts`.
6. Braucht der Artikel eine eigene Taste (eine Zwille zum Schießen), kommt ein Feld in `Input` (`types.ts`, `NO_INPUT`), in `sanitizeInput` (`sanitize.ts`), ein `…Held`-Feld in `Player` für die Flanke und die Tastenbelegung im Client hinzu (siehe unten). Das neue `Player`-Feld zwingt über den Typecheck zu einer Entscheidung in `projectSnapshot` (`snapshot.ts`): für Fremde auf einen neutralen Wert setzen, wenn es privat ist.

Nichts zu tun ist bei: `parseClientMessage` (prüft Artikel über `isShopItemId`), der Kaufprüfung des Servers (`Room.shopBuy` ruft `shopBuy` aus dem Kern), der Snapshot-Projektion des Besitzes (fremder Besitz wird immer komplett durch `noItems()` ersetzt) und dem lokalen Shop (`LocalShop` nutzt dieselben Funktionen).

**Client (`packages/client`)**

7. `src/shopModel.ts`: kurze Beschreibung in `infoText()` (bei `level`-Artikeln in `effectText()`). Zahlen aus `CONFIG` einsetzen, nicht abschreiben. Die Zeile muss im Viertel-Splitscreen ohne Umbruch passen; kurz halten.
8. `src/text.ts`, Funktion `itemParts()`: Soll der Besitz im HUD erscheinen (wie „Leckerli 3“, „Spray 20“), hier eine Zeile ergänzen.
9. `src/helpPages.ts`: Die Seite „Shop und Wertung“ nennt jeden Artikel einer Kategorie ausdrücklich; dort ergänzen, ebenso auf der Seite „Gegner und Kampf“, wenn der Artikel dort eine Rolle spielt.
10. Eigene Taste: Belegung in `src/devices.ts` (`KEYBOARD_LAYOUTS`), Gamepad in `src/sources.ts` (`padToHeld`, `PAD_LABELS`), Feld in `src/input.ts` (`KEY_FIELDS`), Hinweis im HUD (`src/hud.ts`). Die Tastaturen sind schon dicht belegt; zwei Spieler teilen sich eine Tastatur.
11. Ton (optional): Rezept im nächsten Abschnitt.

**Tests und Doku**

12. Rot werden mit Sicherheit `core/test/shop.test.ts` (prüft die genaue Artikelliste, `noItems()` und die Kategorien) und je nach Fall `client/test/shopModel.test.ts`, `client/test/helpPages.test.ts`, `client/test/text.test.ts`. Listen ergänzen und neue Tests für Kauf, Grenze, Preis und Wirkung schreiben (Vorbilder: die Tests zu `glove`, `pepper` und `dog_treat`). Für die Wirkung einen Test im passenden Kernmodul (`fight.test.ts`, `spray.test.ts` …), für den Server einen Kauf in `server/test/roomSeries.test.ts`.
13. README: Zeile in der Shop-Tabelle („Serie, Shop-Phase und Kampf“), Wirkung im Text.

**Ausliefern:** Client und Server zusammen. Der Client verwirft einen `shopState`, in dem eine ihm bekannte Kennung fehlt (`parseProgress` in `client/src/shopGuard.ts`). Ein neuer Client an einem alten Server würde deshalb keinen Shop-Stand mehr annehmen und den Shop nicht richtig anzeigen; ein alter Client an einem neuen Server ignoriert den neuen Artikel nur.

Eine neue **Kategorie** braucht zusätzlich `ShopCategory` (`types.ts`), `SHOP_CATEGORIES` und `SHOP_CATEGORY_NAMES` (`shop.ts`), eine Zeile in der Anleitung und angepasste Shop-Tests; die Shop-Szene zeichnet die Kategorien aus der Liste.

## Einen neuen Ton oder ein neues Ereignis hinzufügen

Ein Ton hat eine ID (gleichzeitig Dateiname), eine Herkunft (erzeugter Klang oder nur Datei) und einen Auslöser.

1. **ID anlegen** in `packages/client/src/audioIds.ts`:
   - `EVENT_IDS`: Ton nur mit Datei, ohne Datei stumm. Das ist der Normalfall für neue Töne.
   - `SYNTH_IDS`: Ton mit erzeugtem Ersatzklang. Dann braucht `SoundFx` in `src/sound.ts` ein Rezept dafür (Vorbilder in derselben Datei).
2. **Liste nachführen:** Eine Zeile in der passenden Tabelle von [SOUNDLISTE.md](SOUNDLISTE.md), erste Spalte genau `` `id` ``. Der Test `client/test/audioManifest.test.ts` vergleicht die IDs im Code mit den Tabellenzeilen der Soundliste und wird rot, wenn eine fehlt oder übrig ist.
3. **Auslöser:**
   - Ereignisse im Spiel werden aus dem Unterschied zweier Zustände abgeleitet, damit sie lokal und online gleich funktionieren: `detectEventSounds(prev, next, ownIds)` in `src/eventSounds.ts`. Dort eine Bedingung ergänzen, die `out.add('neue_id')` aufruft. „Du“-Ereignisse nur für `ownIds` auslösen (online der eigene Spieler, im Splitscreen alle).
   - Menü-, Lobby- und Shop-Töne spielt die jeweilige Szene direkt mit `sfx.play('neue_id')` (Beispiele in `scenes/GameScene.ts`, `scenes/ShopScene.ts`, `onlineMenu.ts`).
   - Nachrichten vom Server (Chat, Spielerliste, Fehler) laufen über `chatSound`, `rosterSounds`, `errorSound` in `eventSounds.ts`.
4. **Gegen Dauerfeuer:** Kann der Ton schnell hintereinander kommen, eine Mindestpause in `MIN_GAP_MS` (`src/sound.ts`) eintragen.
5. **Test:** in `client/test/eventSounds.test.ts` zwei Zustände bauen und prüfen, dass genau die neue ID erkannt wird (Muster: `it('dog_treat when …')`).
6. **Datei:** `packages/client/public/sounds/<id>.ogg` (oder `.mp3`, `.wav`), Musik in `public/music/`. `npm run dev`, dann zeigt `http://localhost:5173/audio-manifest.json`, was erkannt wurde; unbekannte Dateinamen meldet der Dev-Server als Warnung. Quelle und Lizenz in `assets-src/audio/CREDITS.txt` eintragen.

Ein neuer Ton ändert nichts am Server; es genügt, den Client auszuliefern.

## Eine Karte hinzufügen

Ausführlich in [KARTEN.md](KARTEN.md). In Kürze:

1. `maps-src/pfandraiders.tiled-project` in Tiled öffnen, `maps-src/vorlage.tmx` kopieren und bearbeiten.
2. Als JSON nach `packages/core/src/maps/custom/<kennung>.tiled.json` exportieren (Kachelebenen-Format CSV, nicht unendlich).
3. `npm run maps` prüft alle eigenen Karten und schreibt `packages/core/src/maps/custom/index.ts` neu. Fehler werden auf Deutsch mit Ort gemeldet.
4. `npm test` (`all-maps.test.ts` spielt jede Karte kurz an, `custom-index.test.ts` prüft, dass `index.ts` zum Ordner passt).
5. Ausprobieren mit `http://localhost:5173/?solo=1&map=<kennung>`.
6. Die `.tiled.json`, die geänderte `custom/index.ts` und gern die `.tmx` committen.
7. Client und Server ausliefern: Der Server lehnt Kennungen ab, die er nicht kennt, und die Grafik der Karte liegt im Client.

Die eingebauten Karten entstehen anders: `city` aus dem ASCII-Plan `packages/core/src/maps/cityPlan.ts` mit `npx tsx packages/core/scripts/generateCity.ts`, `retro` aus `retro-ascii.ts` mit `npx tsx packages/core/scripts/asciiToTiled.ts`. Die Vorlage und die Übungskarte erzeugt `npm run maps:vorlage` aus `packages/core/scripts/templateMap.ts`. Nach Änderungen an diesen Quellen den Generator laufen lassen; die Paritätstests vergleichen die eingecheckten Dateien mit der Ausgabe.

## Eine neue Figur hinzufügen

Figuren sind Indizes 0 bis 23. Der Kern kennt nur die Zahl, der Client den Bogen dazu. Der Index wird im Browser als Wunschfigur gespeichert und vom Server geprüft; neue Figuren deshalb immer **hinten anhängen**, nie dazwischen einfügen, sonst bekommen Spieler eine andere Figur.

1. **Bogen** im Format der vorhandenen: PNG 64 x 51 px, 4 Spalten x 3 Zeilen zu je 16 x 17 px. Spalte = Richtung (vorn, rechts, hinten, links), Zeile = Gehbild (Stand, Schritt, anderer Schritt), Füße in der untersten Pixelzeile. Beschreibung im Kopf von `packages/client/src/playerChars.ts`.
2. Datei nach `packages/client/src/assets/characters/`. Der Name muss `m` oder `f` plus zwei Ziffern sein (`charKeyFromPath` in `characterAssets.ts`), zum Beispiel `m13.png`. Vite lädt alle passenden Dateien von selbst, `BootScene` legt die Texturen an.
3. `packages/client/src/playerChars.ts`: `ALL_CHARACTERS` wird heute aus zweimal zwölf Nummern erzeugt; die neue Kennung am Ende anhängen.
4. `packages/core/src/avatars.ts`: `AVATAR_COUNT` erhöhen und den neuen Index am Ende von `AVATAR_DEFAULT_ORDER` anhängen (die Liste muss jeden Index genau einmal enthalten).
5. Das Raster in der Online-Lobby hat 8 Spalten (`AVATAR_COLUMNS` in `avatarGrid.ts`); 25 Figuren ergeben eine vierte, fast leere Reihe. Bei mehr Figuren die Lobby ansehen, ob alles passt. Die lokale Lobby blättert durch alle.
6. Tests mit der festen Zahl 24 anpassen: `core/test/avatars.test.ts`, `client/test/playerChars.test.ts`, `client/test/characterAssets.test.ts`, `client/test/avatarGrid.test.ts`.
7. Credits: Quelle in `packages/client/src/assets/characters/CREDITS.txt`, bei neuer Quelle auch in `client/src/credits.ts` und im README-Abschnitt „Credits“ (ein Test vergleicht beide).
8. Client und Server ausliefern (der Server prüft den Index mit `isAvatar`).

## Eine Nachricht zum Protokoll hinzufügen

Beispiel: Der Host soll einen Spieler entfernen können (`kick`).

**Client an Server**

1. `packages/core/src/protocol.ts`: Typ zur Union `ClientMessage` hinzufügen, zum Beispiel `| { t: 'kick'; id: string }`. In `parseClientMessage` einen `case 'kick'` ergänzen, der jedes Feld prüft und die Nachricht **neu aufbaut** (nie das Rohobjekt durchreichen). Ungültig = `null`. Braucht es einen neuen Fehlercode, `ErrorCode` erweitern.
2. Test in `core/test/protocol.test.ts` (oder `protocolRooms.test.ts`): gültige Nachricht kommt sauber heraus, jede Art von Unsinn ergibt `null`.
3. `packages/server/src/room.ts`: Methode im `Room`, die ein `Result` liefert (Muster: `setRounds`, `endSeries`). Prüfungen wie dort: Host (`hostId()`), Phase, Gültigkeit; danach den Zustand ändern und `broadcastLobby()` aufrufen, wenn sich die Spielerliste ändert. Test in `server/test/room*.test.ts`.
4. `packages/server/src/server.ts`, Funktion `dispatch`: neuen `case` nach dem Muster der anderen (`session.room`, `isCurrent()`, Fehler mit `reply`). Achtung: Der `switch` hat keinen Vollständigkeitstest. Vergisst man den `case`, kompiliert alles, und die Nachricht wird still ignoriert. Deshalb einen Test in `server/test/handler*.test.ts` schreiben, der die Nachricht über `handleMessage` schickt.
5. `packages/client/src/online.ts`: Methode zum Senden (Muster: `setRounds()` ruft `this.sendMsg({ t: 'setRounds', rounds })`), dann die Bedienung in der Szene oder in `onlineMenu.ts`. Test in `client/test/online.test.ts` (dort gibt es einen Fake-Socket).

**Server an Client**

1. `protocol.ts`: Typ zur Union `ServerMessage`.
2. Senden im `Room` über `m.conn?.send(...)` oder `this.broadcast(...)`.
3. Empfangen in `online.ts`, Methode `handle`: neuer `case`. Eingehende Daten wie jede Netzeingabe prüfen (Vorbilder: `shopGuard.ts`, `snapshotGuard.ts`, `roomList.ts`).
4. Tests auf beiden Seiten.

**Ausliefern:** immer beide. Ein alter Server beantwortet eine unbekannte Client-Nachricht mit `bad_message` („Ungültige Nachricht.“), der Client zeigt den Fehler und spielt den Fehlerton. Ein alter Client ignoriert unbekannte Server-Nachrichten still (`default` in `handle`). Neue **Felder** in bestehenden Nachrichten besser optional machen und auf beiden Seiten mit einem sinnvollen Standard behandeln; so hat es `held` in `input` vorgemacht ([NETZ.md](NETZ.md), Befund 2, Abschnitt „Verträglichkeit“).

## Verträglichkeit von Client und Server

Es gibt keine Protokollversion. Die einzige Absicherung ist die Versionswarnung in der Online-Lobby: Der Server schickt in `joined` seine Build-Nummer und seinen Kurz-Hash, der Client vergleicht den Hash mit dem eigenen (`versionMismatch` in `client/src/buildInfo.ts`) und zeigt bei Abweichung „Achtung: Client und Server haben verschiedene Versionen. Seite neu laden (Strg+F5) oder den Host informieren.“ Die Nummern werden nicht verglichen, weil sie verschieden zählen (Client: Laufnummer von GitHub Actions, Server: Zahl der Commits).

- Der Client-Hash ist der Commit, aus dem GitHub Actions gebaut hat; der Server-Hash der Commit, den `update.sh` auf dem VPS ausgecheckt hat. Nach jedem Merge auf `master` laufen beide auseinander, bis der Server aktualisiert ist, auch wenn sich nur Doku geändert hat. Die Warnung ist dann harmlos, verschwindet aber erst nach `update.sh`.
- Fehlt einer Seite der Hash (Server von Hand ohne `GIT_SHA` gebaut, lokaler Build ohne git), gibt es keine Warnung.
- Bei Änderungen an `packages/core` oder am Protokoll ist die Warnung ernst zu nehmen: Unterschiedliche Regeln, Kartenlisten, Artikel oder Figuren führen zu abgelehnten Nachrichten oder verworfenen Daten.

Soll ein neuer Server alte Clients einmal hart aussperren, wäre der Weg: eine Mindestversion in `joined` mitschicken und im Client eine Sperre anzeigen. Gebaut ist das nicht.

## Ruckeln im Netz untersuchen

Werkzeuge und Kennzahlen sind in [NETZ.md](NETZ.md) erklärt. Ablauf:

1. Overlay einschalten: im Online-Spiel F3 oder die Seite mit `?debug=net` öffnen. Es zeigt RTT, Jitter, Snapshots pro Sekunde, größte Lücke, Puffer, Verzögerung fremder Figuren, Frame-Zeit, Korrekturen und harte Sprünge der eigenen Figur.
2. Einordnen:
   - `Frame` hoch: Der Rechner stockt, nicht das Netz.
   - `Snaps` unter 20 und `Lücke` groß: Staus auf der Leitung Server→Client (zum Beispiel ein Download nebenher).
   - `Korr` hoch, `Sprung` > 0: Die Vorhersage der eigenen Figur muss oft korrigieren; Konstanten in `client/src/prediction.ts`.
   - `Verzög` dauerhaft 250 und fremde Figuren bleiben stehen: Staus länger als etwa 400 ms; Grenzen in `renderDelay.ts` und `extrapolate.ts`.
3. Nachstellen mit dem Lag-Proxy, drei Terminals:

   ```bash
   npm run build:server && node packages/server/dist/server.cjs
   node scripts/lag-proxy.mjs --preset steam
   npm run dev
   ```

   Dann zwei Tabs mit `http://localhost:5173/?server=ws://localhost:8081&debug=net`. Voreinstellungen `wifi`, `congested`, `steam` oder einzelne Werte (`--delay 80 --jitter 60 --burst-every 3000 --burst-ms 500`), `--stall-dir down` staut nur Server→Client. Der Proxy schreibt alle 5 s eine Zusammenfassung.
4. Änderungen an der Vorhersage immer zuerst gegen `client/test/prediction.test.ts` laufen lassen; `PRED_REPORT=1 npm test -w @pfandraiders/client -- prediction` gibt die Kennzahlen des simulierten Servers aus, die man vorher und nachher vergleicht.

## Betrieb des Servers

Alle Befehle auf dem VPS im Ordner `deploy/` des Repository-Klons. Der Dienst heißt in Compose `server`, der Container `pfandraiders-server`. Docker war auf dem Entwicklungsrechner nicht vorhanden; die folgenden Befehle sind Standard-Docker-Compose, wurden aber nicht auf dem VPS ausprobiert.

**Aktualisieren**

```bash
./update.sh
```

Holt mit `git pull --ff-only` den neuesten Stand, setzt Build-Nummer und Hash und baut den Container neu. Laufende Räume gehen dabei verloren (alles liegt im Speicher); also nicht mitten in einem Spielabend ausliefern. `deploy/.env` (nicht im Repository) enthält mindestens `ALLOWED_ORIGINS`.

**Prüfen**

```bash
docker compose ps                        # Status, nach etwa 30 s "healthy"
docker compose logs --tail 50 server     # letzte Zeilen
docker compose logs -f server            # live mitlesen, Strg+C beendet
```

In der Startzeile steht `PfandRaiders server listening on :8080 (build #N · hash)`. Warnungen zu ungültigen Umgebungsvariablen stehen direkt davor. Der Health-Check im Image prüft nur, ob Port 8080 offen ist (`nc -z`), nicht ob Räume ticken. Von außen ist der Server erreichbar, wenn eine normale HTTP-Anfrage an die Domain mit Status 426 („Upgrade Required“) beantwortet wird, zum Beispiel `curl -s -o /dev/null -w "%{http_code}\n" https://play.example.org/`. Ein echter Test ist die Online-Lobby im Browser: Dort steht „Server: Build #…“.

Was im Log auftaucht: Tick-Fehler eines Raums („Tick-Fehler in Raum ABCD“, nach drei in Folge wird der Raum geschlossen), Handler-Fehler einzelner Nachrichten, unbehandelte Ausnahmen. Der Prozess läuft in allen Fällen weiter. Spielereignisse werden nicht geloggt.

**Log-Rotation**

`deploy/docker-compose.yml` begrenzt das Docker-Log auf drei Dateien zu 10 MB (`logging` mit `json-file`, `max-size`, `max-file`). Die Einstellung greift, wenn der Container neu erstellt wird, also beim nächsten `update.sh`. Vorher einmal `docker compose config` ausführen; der Befehl prüft die Datei und zeigt die fertige Konfiguration.

**Aufräumen**

Jeder Neubau hinterlässt ein altes, namenloses Image.

```bash
docker image prune -f      # namenlose Images löschen
docker builder prune -f    # Build-Cache leeren (der nächste Build dauert dann länger)
docker system df           # Platzverbrauch ansehen
```

**Nginx Proxy Manager**

Proxy Host: Domain der Spielserver-Adresse, Scheme `http`, Forward Hostname `pfandraiders-server`, Port `8080`, Websockets Support an, SSL mit Let's Encrypt und Force SSL. Das externe Netz `proxy-net` muss existieren (`docker network ls`). Für die Kompression ist nichts einzustellen. Die Schritte stehen auch im README unter „Online spielen und Server“.

## Zurückrollen

**Client:** den schuldigen Merge auf `master` mit `git revert -m 1 <merge-commit>` (bei einem normalen Commit ohne `-m 1`) rückgängig machen und pushen; GitHub Pages baut neu.

**Server:** `update.sh` kann nur vorwärts. Von Hand:

```bash
cd deploy
git fetch
git checkout <commit>      # gewünschter alter Stand, Git meldet "detached HEAD"
GIT_SHA=$(git rev-parse --short=7 HEAD) BUILD_NUMBER=$(git rev-list --count HEAD) docker compose up -d --build
```

Vor dem nächsten `update.sh` wieder `git checkout master`, sonst scheitert `git pull`. Nach dem Zurückrollen des Servers passt der Client auf Pages nicht mehr dazu (Versionswarnung); bei Änderungen am Kern oder Protokoll deshalb den Client ebenfalls zurücknehmen.

## Sicherung

Der Server speichert nichts dauerhaft: Räume, Spielstände, Chat, Tokens und Passwort-Hashes liegen nur im Arbeitsspeicher und sind nach jedem Neustart weg. Im Browser liegen nur Einstellungen (Lautstärken, Steuerung, Wunschfigur, Kartenwahl, Name) im localStorage und das Rückkehr-Token im sessionStorage.

Zu sichern ist deshalb nur, was nicht im Repository steht:

- `deploy/.env` auf dem VPS.
- Die Konfiguration des Nginx Proxy Managers (Proxy Host, Zertifikate; je nach Installation dessen Datenordner).
- Die Repository-Variable `SERVER_URL` und die Pages-Einstellung in GitHub (aufschreiben genügt).
- Eigene Audio-Quelldateien unter `assets-src/` (außer `CREDITS.txt` nicht im Repository).

## Sicherheit

- **Passwörter** von Räumen bleiben nur als SHA-256-Hash im Speicher des Raums, verglichen wird zeitkonstant. Sie werden nie an Clients geschickt, nie geloggt und stehen nie im Teilen-Link. Ohne TLS (`ws://`) gingen sie im Klartext über die Leitung; deshalb muss `SERVER_URL` mit `wss://` beginnen.
- **Tokens** für die Rückkehr sind zufällige UUIDs, gültig bis zum Ende der Rückkehrfrist. Wer den Raum über „Spiel verlassen“ verlässt, macht sein Token sofort ungültig.
- **Grenzen** (`SERVER_CONFIG` in `packages/server/src/config.ts`, `startServer` in `server.ts`):
  - 400 Verbindungen insgesamt, 10 je IP, 100 Räume, 8 Spieler je Raum.
  - 120 Nachrichten pro Sekunde je Verbindung; wer 5 s lang darüber liegt, wird getrennt.
  - Nachrichten höchstens 4096 Bytes.
  - Ein Socket ohne Raum wird nach 30 s geschlossen, tote Verbindungen fallen über Ping alle 15 s heraus.
  - Raumliste höchstens 1 pro Sekunde, 5 falsche Passwörter pro Minute und Verbindung.
  - Chat: 1 Nachricht pro Sekunde, 5 in 10 s, 140 Zeichen, Steuer- und unsichtbare Zeichen werden entfernt.
  - Kommt ein Client mit dem Lesen nicht nach (über 256 KB im Sendepuffer), werden Snapshots verworfen, nach 5 s wird getrennt.
- **`ALLOWED_ORIGINS`** verhindert, dass fremde Webseiten Besucher unbemerkt mit dem Server verbinden. Gegen eigene Skripte schützt es nicht, denn außerhalb des Browsers lässt sich der Origin-Header frei setzen. Leer gelassen darf jede Origin verbinden; der Server warnt dann beim Start.
- **IP-Limit und `X-Forwarded-For`:** Der Server nimmt den ersten Eintrag des Headers. Das ist nur sicher, wenn der Proxy den Header selbst setzt. Ergänzt der Nginx Proxy Manager ihn nur (Standard bei `proxy_add_x_forwarded_for`), kann ein Client einen falschen ersten Eintrag mitschicken und das Limit von 10 Verbindungen je IP umgehen. Geprüft wurde das nie. Abhilfe wäre, den letzten statt des ersten Eintrags zu nehmen (`ipOf` in `server.ts`) oder im Proxy `X-Real-IP` zu verwenden.
- **`WS_COMPRESSION`:** Die Kompression kostet je Verbindung etwa 256 KB Speicher; bei der Obergrenze von 400 Verbindungen rund 120 MB. Bei knappem Speicher oder Verdacht auf Missbrauch lässt sie sich mit `WS_COMPRESSION=off` abschalten (mehr Bandbreite, etwa 1 Mbit/s je Spieler). Nachrichten unter 256 Bytes werden ohnehin nicht gepackt.
- **Fremde Daten im Snapshot:** Alles, was ein Mitspieler nicht sehen soll, filtert `projectSnapshot`. Wer ein Feld zum Zustand hinzufügt, muss dort entscheiden (der Typecheck erzwingt das).

## Fehlersuche

| Symptom | Mögliche Ursache und Abhilfe |
|---|---|
| Online-Lobby zeigt „Client und Server haben verschiedene Versionen“ | Nach einem Merge ist Pages neu gebaut, der Server noch nicht. Auf dem VPS `deploy/update.sh` ausführen. Sonst hat der Browser einen alten Client im Cache: Strg+F5. |
| „Raum nicht gefunden.“ | Code vertippt; der Raum wurde gelöscht, weil lange niemand verbunden war (Rückkehrfrist plus 15 s); der Server wurde neu gestartet oder ausgeliefert (alle Räume weg); oder der Client spricht mit einem anderen Server (`?server=` in der Adresse, falsche `SERVER_URL`). |
| „Die Runde läuft bereits.“ | Neu beitreten geht jederzeit außer während einer laufenden Runde (in der Endwertung sieht man sie und wartet auf die Lobby). Nach einem Verbindungsabbruch klappt die Rückkehr nur im selben Tab oder nach Neuladen (Token im sessionStorage), nicht in einem neuen Tab. |
| Regungslose Figuren in der Runde („Geister“) | Getrennte Spieler bleiben bis zum Ende der Rückkehrfrist (`GRACE_MS`, Standard 2 min) als stehende Figur im Spiel und können ausgeraubt werden. Wer über „Spiel verlassen“ geht, bleibt bis Rundenende als Statist stehen. Beides ist so gewollt. |
| Serie startet nicht | „Mindestens zwei Spieler nötig.“: Es müssen zwei Spieler verbunden sein. Nur der Host (erster verbundener Spieler) kann starten. |
| Shop hängt, nächste Runde beginnt nicht | Alle verbundenen Spieler müssen „Bereit“ drücken, ein Zeitlimit gibt es nicht. Ein abwesender, aber verbundener Spieler blockiert; Auswege: er trennt sich, oder der Host wählt „Serie beenden“. Zeigt der Shop bei einem Spieler gar keinen Stand, verwirft sein Client den `shopState` (verschiedene Versionen, siehe erste Zeile). |
| Musik oder Effekte stumm | Der Browser gibt Ton erst nach der ersten Taste oder dem ersten Klick frei. Taste M schaltet reihum Musik und Effekte; der Zustand ist im Browser gespeichert, also auch Einstellungen prüfen. Eine kaputte Audiodatei wird still übersprungen (Konsole ansehen). `music_ended` ist absichtlich leise. Neue Ereignisse ohne Datei sind immer stumm. |
| Neue Karte fehlt in der Auswahl | `npm run maps` vergessen (dann ist auch `custom-index.test.ts` rot); Karte ist als versteckt markiert (`hidden`); Dev-Server läuft noch mit altem Stand (neu laden). Online: Der Server kennt sie noch nicht („Unbekannte Karte.“), also Server ausliefern. |
| `git status` zeigt Karten, Vorlage oder Logo als geändert, `git diff` ist leer | Die Generatoren schreiben LF, Git unter Windows erwartet CRLF (`core.autocrlf=true`). Inhaltlich ist nichts geändert. Mit `git checkout -- <pfade>` zurücksetzen. |
| CI rot | Lokal dieselben Schritte laufen lassen: `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, `npm run build:server`. CI nutzt Node 22, lokal ist Node 24 üblich. `npm ci` scheitert, wenn `package-lock.json` nicht zu `package.json` passt: `npm install` ausführen und die Lock-Datei mitcommitten. |
| GitHub Pages zeigt alten Stand | Unter Actions nachsehen, ob „Pages“ gelaufen ist. Fehlermeldung „Repository variable SERVER_URL is empty“: Variable setzen. Pages-Quelle muss „GitHub Actions“ sein. Ein neuer Lauf bricht einen älteren ab (`concurrency`). Danach Strg+F5. |
| Dev-Server zeigt Unsinn nach `npm install` oder Branch-Wechsel | Vite-Cache veraltet: Dev-Server beenden und mit `npm run dev -w @pfandraiders/client -- --force` neu starten (oder `packages/client/node_modules/.vite` löschen). |
| Server startet nicht: „Server konnte nicht starten: listen EADDRINUSE“ | Port 8080 belegt, meist ein zweiter `dev:server`. Anderen Prozess beenden oder `PORT=8090` setzen und den Client mit `?server=ws://localhost:8090` öffnen. |
| Verbindung wird sofort abgelehnt (403) | Origin des Clients steht nicht in `ALLOWED_ORIGINS`. Groß- und Kleinschreibung und ein Schrägstrich am Ende sind egal, Schema und Port nicht. |
| „Zu viele Nachrichten.“ / Verbindung bricht ab | Ratenlimit von 120 Nachrichten pro Sekunde. Bei normalem Spiel nicht erreichbar; deutet auf eine Endlosschleife beim Senden im Client hin. |
