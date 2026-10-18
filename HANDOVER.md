# PfandRaiders: Übergabe

Stand: 16.10.2026, `master` bei `fe72eca` (PR #65). Repository: https://github.com/dasistdaniel/pfandraiders

Dieses Dokument ist der Einstieg für alle, die am Projekt weiterarbeiten, ob allein oder mit einem beliebigen KI-Assistenten. Es erklärt, was das Spiel ist, wie der Code zusammenhängt, wie man es baut, testet und ausliefert, und wo die ausführlichen Anleitungen liegen. Schritt-für-Schritt-Rezepte für typische Änderungen stehen im Wartungshandbuch [docs/WARTUNG.md](docs/WARTUNG.md).

## 1. Was das Projekt ist

PfandRaiders ist ein Retro-Top-Down-Spiel im Browser. Man sucht in einer Stadt nach Pfandflaschen, gibt sie am Pfandautomaten ab und kauft zwischen den Runden im Shop Taschen, Upgrades und Ausrüstung. Mitspieler kann man schlagen, mit Pfefferspray zurückstoßen und, wenn sie ausgeknockt sind, ausrauben. Hunde und Polizisten machen das Leben schwer, Events im Stadion und beim Konzert bringen dreifaches Pfand.

- **Lokal:** 1 bis 4 Spieler im Splitscreen an einem Rechner (zwei Tastaturbelegungen, Gamepads).
- **Online:** 2 bis 8 Spieler in Räumen mit 4-stelligem Code. Jeder Browser ist ein Spieler.
- **Ablauf:** Eine Serie aus mehreren Runden (Standard 3 Runden à 5 Minuten), dazwischen Rangliste und Shop, am Ende eine Endwertung nach Gesamtverdienst.

Der Client liegt auf GitHub Pages, der Server läuft als Docker-Container auf einem VPS hinter dem Nginx Proxy Manager. Die vollständigen Spielregeln mit allen Zahlen stehen im [README](README.md); im Spiel erklärt sie die Anleitung „So wird gespielt“.

## 2. Stand

### Fertig und in `master`

- Kern: Bewegung mit Kollision und Eckenrutschen, Suchen, Abgabe in Takten, Leben, Hunger, Essensfunde, Knockout und Aufstehen, Schlagen, Pfefferspray, Ausrauben, Hunde und Polizisten mit Wegsuche, Event-Zonen, Countdown vor jeder Runde.
- Serie mit Shop-Phase (4 Kategorien, 10 Artikel), Rangliste und Endwertung, lokal und online.
- Online: Räume mit Name, Sichtbarkeit und optionalem Passwort, Raumliste, Teilen-Link, Lobby-Chat, Figurenwahl (24 Figuren), Host-Einstellungen (Rundenzeit, Rundenzahl, Karte), automatisches Wiederverbinden mit Rückkehrfrist.
- Netzcode: autoritativer Server mit 20 Takten pro Sekunde, Vorhersage der eigenen Figur, Interpolation fremder Figuren mit anpassbarer Verzögerung, Nachrechnung gestauter Eingaben, permessage-deflate. Messungen und Befunde in [docs/NETZ.md](docs/NETZ.md).
- Karten: eingebaute Stadt (64 x 40) und Retro-Karte (32 x 20), eigene Karten aus Tiled mit strenger Prüfung, versteckte Übungskarte `uebung`.
- Grafik aus CC0-Paketen (Kenney, Fleurman, Jason of GDN, Chasersgaming), selbst erzeugtes Logo.
- Ton: alle Effekte und die Musik werden im Browser erzeugt (WebAudio); eigene Audiodateien können jede ID einzeln ersetzen.
- Menüs: Hauptmenü, Einstellungen, Credits, Anleitung (fünf Seiten, Texte aus `CONFIG`), Esc-Menü im Spiel, online mit Wechsel der Steuerung.
- Netz-Diagnose: Overlay (`?debug=net`, F3) und Lag-Proxy.
- Social Preview: Open-Graph-Tags in `index.html`, Vorschaubild 1200 x 630 aus `npm run social`, und der Server beantwortet normale HTTP-Anfragen mit einer Vorschauseite samt Weiterleitung zur Spielseite (siehe Abschnitt 6).

### Offen und bekannte Schwächen

- **Balancing:** Alle Shop-Preise und Wirkungen sind erfundene Startwerte und nie in echten Testrunden abgestimmt worden.
- **Musik:** Ein Bekannter liefert Musikdateien (`music_menu`, `music_game`, `music_ended`). Bis dahin läuft die erzeugte Musik; an ihr soll nichts mehr geändert werden. Es liegen noch keine eigenen Sound- oder Musikdateien im Repository.
- **Shop ohne Zeitlimit:** Die nächste Runde startet erst, wenn alle verbundenen Spieler „Bereit“ sind. Wer verbunden bleibt und nichts tut, blockiert alle. Auswege gibt es nur zwei: Der Spieler trennt sich, oder der Host wählt „Serie beenden“. Kicken gibt es nicht.
- **Streunende NPCs** suchen keinen Weg; sie wählen nur Ziele, die sie geradeaus erreichen. Gejagt wird mit Breitensuche.
- **Server-Takt unter Windows:** Ein 50-ms-Takt dauert lokal etwa 55 bis 62 ms (der Countdown von 5 s dauert dort rund 6 s). Auf dem Linux-Server ist das vermutlich nicht so, gemessen wurde es nie.
- **Bandbreite:** Ein Snapshot ist 6 bis 10 KB JSON; dank Kompression gehen etwa 430 Bytes über die Leitung. Deltas gibt es nicht.
- **Limit pro IP:** Der Server nimmt den ersten Eintrag von `X-Forwarded-For`. Ob der Nginx Proxy Manager diesen Header ersetzt oder nur ergänzt, wurde nie geprüft. Ergänzt er nur, kann ein Client die Grenze von 10 Verbindungen pro IP umgehen (siehe [WARTUNG.md](docs/WARTUNG.md#sicherheit)).

### Nie auf echten Geräten geprüft

- Gamepads im Shop, in den Menüs, in der Anleitung und beim Wechsel der Steuerung im Esc-Menü (getestet sind nur die Logik-Module).
- Töne und Musik bei normaler Bildrate über längere Zeit; eigene Audiodateien im fertigen Build auf GitHub Pages.
- Neuladen oder Wiederverbinden mitten in der Endwertung, „Link kopieren“ auf verschiedenen Browsern, große und sehr kleine Bildschirme.
- Handys und Tablets: Es gibt keine Touch-Steuerung.
- Link-Vorschau (Social Preview) in echtem WhatsApp, Facebook, Discord oder Slack und hinter dem Nginx Proxy Manager; geprüft sind nur die Tags und die Antworten des Servers lokal (Tests und curl mit Crawler-Kennungen).
- Der Server-Takt auf dem VPS und das Verhalten bei einem echten großen Download nebenher (nur mit dem Lag-Proxy nachgestellt).

## 3. Aufbau des Repositorys

TypeScript-Monorepo mit npm workspaces. Entwickelt wurde auf Windows 11 mit Node 24; CI und das Docker-Image nutzen Node 22. Python und Docker gibt es auf dem Entwicklungsrechner nicht.

| Ordner | Inhalt |
|---|---|
| `packages/core` | Reine, deterministische Spielregeln ohne Browser oder Node-APIs: `step()`, Zufall, Karten, Shop, Kampf, NPCs, Protokoll, Snapshot-Projektion. Wird von Client und Server importiert. |
| `packages/client` | Phaser 3, Vite und Vitest. Szenen in `src/scenes/`, Netzcode in `online.ts`, `prediction.ts`, `timeline.ts`, Online-Dialog als DOM in `onlineMenu.ts`. |
| `packages/server` | Node, `ws`, gebündelt mit esbuild zu einer Datei `dist/server.cjs`. Räume in `room.ts`, Verwaltung in `rooms.ts`, WebSocket und Nachrichten in `server.ts`, Umgebung in `index.ts` und `config.ts`. |
| `packages/core/scripts` | Generatoren: eigene Karten eintragen, Tiled-Vorlage, Stadt aus dem ASCII-Plan, Retro-Karte. |
| `maps-src/` | Tiled-Projekt, Kachelsatz `kenney-city.tsx` und die Vorlage für eigene Karten. |
| `deploy/` | `docker-compose.yml` und `update.sh` für den VPS. |
| `scripts/` | Logo-Generator, Generator des Vorschaubilds (`generate-social-preview.mjs`), Lag-Proxy (`lag-proxy.mjs`, `lagSchedule.mjs`). |
| `assets/logo/` | Logo in drei Varianten, erzeugt von `npm run logo`. |
| `assets-src/audio/CREDITS.txt` | Herkunftsliste für eigene Audiodateien (der Rest von `assets-src/` ist nicht im Repository). |
| `docs/` | Anleitungen (siehe Abschnitt 11), Entwürfe und Pläne unter `docs/superpowers/`. |
| `.github/workflows/` | `ci.yml` (Typecheck, Tests, beide Builds bei jedem PR) und `pages.yml` (Client auf GitHub Pages). |

## 4. Schnellstart

```bash
npm install
npm run dev            # Client auf http://localhost:5173
npm run dev:server     # Server auf ws://localhost:8080 (tsx watch, zweites Terminal)
npm test               # alle drei Pakete
npm run typecheck
npm run build          # Client nach packages/client/dist
npm run build:server   # Server nach packages/server/dist/server.cjs
```

Weitere Befehle: `npm run maps` (eigene Karten prüfen und eintragen), `npm run maps:vorlage` (Tiled-Vorlage und Übungskarte neu erzeugen), `npm run logo` (Logo und Favicon neu erzeugen), `npm run social` (Vorschaubild für geteilte Links und Apple-Touch-Icon neu erzeugen), `npx tsx packages/core/scripts/generateCity.ts` (Stadt aus dem ASCII-Plan), `npx tsx packages/core/scripts/asciiToTiled.ts` (Retro-Karte), `node scripts/lag-proxy.mjs --preset steam` (schlechte Leitung vorspielen). Alle wurden am 16.10.2026 ausgeführt und liefen fehlerfrei (`npm run social` kam am 18.10.2026 dazu). Die Generatoren erzeugen unveränderte Inhalte; unter Windows zeigt `git status` die Dateien danach trotzdem als geändert an (nur Zeilenenden, siehe [WARTUNG.md](docs/WARTUNG.md#fehlersuche)).

Zum Ausprobieren:

- Lokal mit einem Spieler: `http://localhost:5173/?solo=1`, mit zwei: `?players=2`.
- Online: Server starten, dann zwei Tabs mit `http://localhost:5173/?server=ws://localhost:8080` öffnen (ein Raum braucht zwei Spieler).
- Testhilfen: `?round=30` (Rundenlänge in s), `?seed=123`, `?map=retro`, `?events=now`, `?debug=net`, `?join=CODE`. Liste im README unter „Testhilfen per URL“.

## 5. Wie alles zusammenhängt

### Kern und Determinismus

`packages/core` enthält die ganze Spiellogik. Der Zustand (`GameState` in `types.ts`) ist ein reines JSON-Objekt; `createGame(seed, map, ids, opts)` legt ihn an, `step(state, inputs, dtMs)` rechnet einen Schritt weiter und verändert ihn direkt. Zufall kommt ausschließlich aus `rng.ts` (mulberry32), dessen Zustand im `GameState` steht. Daraus folgt: Gleicher Seed, gleiche Karte und gleiche Eingaben ergeben genau denselben Verlauf. Die Tests in `packages/core/test/determinism*.test.ts` spielen zwei Partien mit gleichem Seed und vergleichen sie. Im Kern darf es deshalb kein `Math.random()`, kein `Date.now()` und keine Iteration über unsortierte Mengen geben, deren Reihenfolge vom Zufall abhängt.

Lokal rechnet der Client den Kern selbst (`LocalConnection` in `connection.ts`, feste Schritte zu 16 ms). Online rechnet nur der Server.

### Autoritativer Server

Der Server (`room.ts`) ruft alle 50 ms `step()` für jeden laufenden Raum auf. Clients schicken nur Eingaben (`Input`: Richtung und vier Tasten); was daraus folgt, entscheidet allein der Server. Gekauft wird über eine eigene Nachricht, die der Server mit `checkShopBuy` prüft. Ein manipulierter Client kann also weder Geld noch Position fälschen.

### Snapshot und Allow-List

Nach jedem Takt bekommt jeder Spieler einen eigenen Snapshot: `projectSnapshot(state, viewerId)` in `core/src/snapshot.ts`. Die Funktion führt jedes Feld von `Player` und `Spot` einzeln auf. Fremde Spieler verlieren dabei Geld und Verdienst (bis Rundenende), Container-Inhalt (nur „hat Flaschen“ bleibt), Besitz, Essensfunde und Tastenzustände; Spots zeigen nur „gefüllt“ oder „leer“; der Zufallszustand wird genullt. Weil das Objekt als vollständiges Literal gebaut wird, scheitert der Typecheck, sobald jemand ein neues Feld zu `Player` oder `Spot` hinzufügt, bis dort bewusst entschieden ist, ob es öffentlich ist.

### Protokoll

Alle Nachrichten sind JSON über WebSocket und in `core/src/protocol.ts` als Typen definiert. `parseClientMessage` prüft jede Client-Nachricht und baut sie neu auf; Unbekanntes oder Ungültiges wird verworfen (`bad_message`). Größte Nachricht 4096 Bytes.

| Client an Server | Zweck |
|---|---|
| `create` | Raum anlegen (Name, Raumname, Sichtbarkeit, Passwort, Wunschfigur) |
| `join` | Raum betreten, mit `token` als Rückkehr nach Verbindungsabbruch |
| `start` | Serie starten (nur Host, nur Lobby, mindestens 2 Spieler) |
| `input` | Eingabe mit laufender Nummer `seq` und optionaler Haltedauer `held` |
| `leave` | Raum endgültig verlassen (Token wird ungültig) |
| `chat` | Chatnachricht (nur Lobby) |
| `ready` | Bereit oder nicht bereit (nur Shop) |
| `shopBuy` | Kauf mit Kategorie, Artikel, Menge (nur Shop) |
| `setRoundMs`, `setRounds`, `setMap` | Host-Einstellungen |
| `endSeries` | Serie vorzeitig beenden (Host, Shop) |
| `toLobby` | Nach der Endwertung zurück in die Lobby (Host) |
| `listRooms` | Öffentliche Räume abfragen (höchstens 1 pro Sekunde) |
| `setAvatar` | Figur wählen (Lobby) |

| Server an Client | Zweck |
|---|---|
| `joined` | Beitritt bestätigt: eigene ID, Token, Build des Servers |
| `lobby` | Raumzustand: Spielerliste, Host, Phase, Einstellungen, Karte |
| `start` | Rundenbeginn: Karte, Kennung, erster Snapshot, Rundennummer |
| `snap` | Snapshot je Takt mit `ack` (höchste verarbeitete Eingabe) |
| `phase` | Phasenwechsel |
| `shopState` | Eigener Stand im Shop (Geld, Besitz, bereit), nur an diesen Spieler |
| `ranking` | Rangliste der Runde bzw. Endwertung |
| `chat`, `chathistory` | Chatnachricht bzw. Verlauf nach dem Beitritt |
| `rooms` | Raumliste |
| `error` | Fehlercode und deutscher Text |

Eine Protokollversion gibt es nicht. Verträglichkeit entsteht über optionale Felder (Beispiel `held`) und darüber, dass Client und Server immer zusammen ausgeliefert werden. Wie man eine Nachricht hinzufügt: [WARTUNG.md](docs/WARTUNG.md#eine-nachricht-zum-protokoll-hinzufügen).

### Vorhersage, Interpolation und Haltedauer

- **Eigene Figur:** `Predictor` in `client/src/prediction.ts` bewegt sie sofort mit derselben `walk`-Funktion wie der Server. Jeder Snapshot bestätigt über `ack` eine Eingabe; der Client vergleicht die Serverposition mit seinem Verlauf zu diesem Zeitpunkt und korrigiert Abweichungen sanft (Totzone, `CORRECTION_GAIN`), über 48 px (`SNAP_DIST`) springt er direkt.
- **Fremde Figuren und NPCs:** werden in der Vergangenheit gezeigt, zwischen zwei Snapshots interpoliert. `timeline.ts` ordnet Snapshots nach ihrem Tick auf einer geschätzten Server-Zeitachse ein, `renderDelay.ts` passt die Verzögerung dem gemessenen Jitter an (100 bis 250 ms), `extrapolate.ts` schreibt bei Lücken bis zu 150 ms fort, `remoteBlend.ts` glättet den Übergang danach.
- **Eingaben:** gehen bei jeder Änderung sofort hinaus, sonst alle 100 ms als Lebenszeichen. Das Feld `held` sagt, wie lange die vorige Eingabe galt. Kommen nach einem Stau mehrere Eingaben gleichzeitig an, rechnet der Server mit `MoveCredit` (`core/src/moveCredit.ts`) die sonst verschluckte Bewegung nach, begrenzt durch ein Zeitbudget, damit niemand schneller laufen kann als erlaubt.

Alles Weitere, mit Messwerten vorher und nachher: [docs/NETZ.md](docs/NETZ.md).

### Serie und Phasen

Ein Raum hat die Phasen `lobby`, `playing`, `shop` und `final` (`RoomPhase` in `protocol.ts`, Übergänge in `room.ts`):

```
lobby --start--> playing --Rundenende--> shop --alle bereit--> playing ...
                            |                 \--endSeries (Host)--> final
                            \--letzte Runde--------------------------> final --toLobby (Host)--> lobby
```

Was über Runden bleibt, ist der `Progress` je Spieler (Geld, Besitz, Gesamtverdienst, `core/src/shop.ts`); Mietsachen (`perRound`: Einkaufswagen, Ausweis) fallen am Rundenende weg. Position, Flaschen, Leben, NPCs und Spots beginnen jede Runde neu. Jede Runde startet mit 5 s Countdown, in dem die Welt stillsteht. Rundenzahl 0 bedeutet „offen“: Dann beendet nur der Host die Serie. Lokal spielt `LocalShop` (`client/src/localShop.ts`) dieselbe Serie ohne Server, aber ohne Endwertung; dort endet die Serie mit Esc.

### Räume, Passwörter, Figuren, Karten

- **Räume** (`rooms.ts`): Code aus 4 Zeichen ohne verwechselbare Buchstaben, höchstens 100 Räume und 8 Spieler je Raum. Host ist immer der erste verbundene Spieler. Ein Raum ohne verbundene Spieler wird nach der Rückkehrfrist plus 15 s gelöscht. Alles liegt nur im Speicher.
- **Passwörter:** Der Raum speichert nur den SHA-256-Hash und vergleicht zeitkonstant. Wer mit gültigem Token zurückkehrt, braucht keins. Nach 5 falschen Versuchen pro Minute und Verbindung kommt `rate_limited`.
- **Figuren:** 24 Bögen in `client/src/assets/characters/` (m01 bis m12, f01 bis f12). Der Kern kennt nur Indizes (`core/src/avatars.ts`, `AVATAR_COUNT`); jeder Index ist pro Raum einmalig.
- **Karten:** Registry in `core/src/maps/index.ts`: eingebaute Karten (`city`, `retro`) plus eigene aus `core/src/maps/custom/`, eingetragen von `npm run maps` in `custom/index.ts`. Eigene Karten werden beim Laden geprüft (`validate.ts`). Der Server schickt die Kartenkennung und die Kartendaten in `start`; die Grafik wählt der Client nach der Kennung, deshalb müssen beide dieselbe Kartenliste haben.

### Ton

`client/src/sfx.ts` verbindet drei Teile: `SoundFx` (`sound.ts`, Effekte mit erzeugtem Ersatzklang und Sperren gegen Dauerfeuer), `MusicPlayer` (`music/player.ts`, erzeugte Musik oder Datei-Loops) und `AudioAssets` (`audioAssets.ts`, lädt eigene Dateien). Das Vite-Plugin `vite-audio.ts` erzeugt beim Bauen aus `public/sounds` und `public/music` die Datei `audio-manifest.json`; das Spiel lädt nur, was darin steht, und erst nach der ersten Taste. Welche Ereignisse welchen Ton auslösen, leitet der Client aus Zustandsunterschieden ab (`soundEvents.ts`, `eventSounds.ts`), damit es lokal und online gleich klingt. Alle IDs: [docs/SOUNDLISTE.md](docs/SOUNDLISTE.md).

### Anleitung im Spiel

`client/src/helpPages.ts` erzeugt die fünf Seiten als reine Daten aus `CONFIG` und den echten Tastenbelegungen (`KEYBOARD_LAYOUTS`, `PAD_LABELS`). Ändert man einen Wert in `CONFIG`, stimmt die Anleitung von selbst. Neue Artikel oder Regeln muss man dort aber von Hand ergänzen. `HelpScene.ts` zeichnet nur; ein Test prüft, dass keine Zeile überläuft.

## 6. Auslieferung

### Client (GitHub Pages)

`.github/workflows/pages.yml` baut bei jedem Push auf `master` und veröffentlicht `packages/client/dist`. Nötig sind zwei Einstellungen im Repository: unter Settings > Pages die Quelle „GitHub Actions“, und unter Settings > Secrets and variables > Actions > Variables die Variable `SERVER_URL` (zum Beispiel `wss://play.example.org`). Fehlt sie, bricht der Workflow absichtlich mit einer Fehlermeldung ab. Die Build-Nummer des Clients ist die Laufnummer von GitHub Actions, der Hash der Commit.

### Social Preview

Geteilte Links (Spielseite oder Serveradresse) zeigen in WhatsApp und Co. Bild, Titel und Beschreibung. Texte in `packages/core/src/social.ts` und von Hand in `packages/client/index.html` (ein Test vergleicht), Bild per `npm run social`, Serverseite über `PAGE_URL`. Hängt eine alte Vorschau: Link mit `?v=2` teilen, für Facebook den Sharing Debugger („Scrape Again“). Mehr in [WARTUNG.md](docs/WARTUNG.md#social-preview-link-vorschau) und im README unter „Social Preview“. Mit echtem WhatsApp oder dem Facebook-Debugger ist das noch nicht geprüft.

### Server (VPS)

Auf dem VPS liegt ein Klon des Repositorys. Der Container hat keinen Host-Port; der Nginx Proxy Manager erreicht ihn über das externe Docker-Netz `proxy-net` unter dem Namen `pfandraiders-server`, Port 8080, mit eingeschaltetem Websockets Support. Einmalig `deploy/.env` anlegen, danach genügt:

```bash
cd deploy
./update.sh   # git pull --ff-only, GIT_SHA und BUILD_NUMBER setzen, docker compose up -d --build
```

Umgebungsvariablen (in `deploy/.env`):

| Variable | Bedeutung |
|---|---|
| `ALLOWED_ORIGINS` | Pflicht. Kommagetrennte Origins, zum Beispiel `https://dasistdaniel.github.io`. Leer = jede Origin (nur Entwicklung). |
| `ROUND_MS` | Optional. Feste Rundenlänge in ms (ab 1000), überschreibt die Wahl des Hosts. Nur für Tests. |
| `GRACE_MS` | Optional. Rückkehrfrist in ms, 5000 bis 3600000, Standard 120000. |
| `MAP_ID` | Optional. Startkarte neuer Räume, Standard `city`. Auch versteckte Karten wie `uebung` gehen. |
| `WS_COMPRESSION` | Optional. `on` (Standard) oder `off` für permessage-deflate. |
| `PAGE_URL` | Optional. Adresse der Spielseite für die Vorschauseite des Servers, Standard `https://dasistdaniel.github.io/pfandraiders/`. |
| `PORT` | Setzt `docker-compose.yml` fest auf 8080. |

Ungültige Werte ergeben eine Warnung im Log und den Standardwert.

**Prüfen nach dem Ausliefern:** `docker compose ps` (Status `healthy`), `docker compose logs --tail 20 server` (Startzeile mit Build-Nummer und Hash), dann im Browser die Online-Lobby öffnen: Dort steht „Server: Build #… · Hash“. Passen Client und Server nicht zusammen, warnt die Lobby (siehe unten).

**Versionswarnung:** Die Lobby vergleicht nur den Kurz-Hash von Client und Server. Jeder Push auf `master`, auch eine reine Doku-Änderung, baut den Client mit neuem Hash. Bis auf dem VPS `update.sh` gelaufen ist, zeigt die Lobby deshalb „Client und Server haben verschiedene Versionen“. Nach jedem Merge also auch den Server aktualisieren.

**Zurückrollen:** Client per `git revert` und Push. Server von Hand auf einen alten Commit setzen und neu bauen; die genauen Schritte stehen in [WARTUNG.md](docs/WARTUNG.md#zurückrollen). Jede Auslieferung des Servers beendet alle laufenden Räume, weil nichts gespeichert wird.

## 7. Tuning-Werte

Fast alle Spielwerte stehen in `packages/core/src/config.ts` im Objekt `CONFIG`. Anleitung im Spiel, Shop-Texte und Tests lesen von dort.

| Feld | Steuert |
|---|---|
| `roundMs`, `countdownMs` | Standard-Rundenzeit (5 min), Countdown (5 s). Wählbare Zeiten: `ROUND_MS_CHOICES` in `protocol.ts` |
| `playerSpeed`, `playerHalf`, `softHalf`, `slideMaxPx` | Laufgeschwindigkeit (115 px/s), Hitbox, weiche Hindernisse, Eckenrutschen |
| `interactRadius`, `searchMs` | Reichweite für Spots und Automat, Suchzeit (1,5 s) |
| `depositEveryMs`, `depositEveryMsCard` | Takt der Abgabe ohne und mit Kundenkarte |
| `refillMs`, `spotActiveChance`, `spotTypes` | Nachfüllen der Spots, Anfangsbefüllung, Fundtabelle je Spot-Art |
| `bottleValue` | Pfand je Flaschenart in Cent (8, 15, 25) |
| `carry` | Plätze: Hände, je Tasche, Rucksack, Wagen; Bremse des Wagens |
| `steal` | Ausrauben: Reichweite, Anteil (die Hälfte) |
| `fight`, `spray` | Schlagen und Pfefferspray: Reichweite, Schaden, Abklingzeit, Stoß |
| `shop.items` | Alle Artikel: Kategorie, Name, Art, Preise in Cent, Wirkung je Stufe, Höchstbestand. Reihenfolge = Reihenfolge im Shop |
| `shop.cardPlusBonusPct`, `shop.maxStack` | Aufschlag der Kundenkarte+ (10 %), größter Vorrat (99) |
| `health` | Höchstleben, Hunger, Knockout (10 s), Essen, Leben und Schutz nach dem Aufstehen |
| `npc` | Hunde und Polizisten: Anzahl, Ankunft, Tempo, Ausdauer (`lifeMs`), Reichweiten, Biss, Kontrolle, Streunen, Wegsuche |
| `zone` | Events: Ankündigung, Dauer, Abstände, Multiplikator, Nachfüllen |

Außerhalb von `CONFIG`:

- Server: `packages/server/src/config.ts` (`SERVER_CONFIG`: Takt, Rückkehrfrist, Raum- und Verbindungsgrenzen, Ratenlimits, Chat-Limits).
- Protokoll: `packages/core/src/protocol.ts` (Spielerzahl, Namenslängen, Rundenzahlen, `MAX_HELD_MS`).
- Netz im Client: `prediction.ts` (`SNAP_DIST`, Totzonen, `CORRECTION_GAIN`, `ACK_OFFSET_MS`), `renderDelay.ts` (`BASE_DELAY_MS` 100, `MAX_DELAY_MS` 250), `extrapolate.ts` (`MAX_EXTRAP_MS` 150), `online.ts` (`HEARTBEAT_MS` 100).
- Töne: `client/src/sound.ts` (`MIN_GAP_MS`, Lautstärke), Musik in `client/src/music/`.

Wie man einen Wert sicher ändert: [WARTUNG.md](docs/WARTUNG.md#einen-preis-oder-spielwert-ändern).

## 8. Konventionen

- **Sprache:** Oberfläche, Kommentare, Doku, Commit-Beschreibungen und PR-Texte auf Deutsch. Bezeichner im Code und die Testbeschreibungen (`it('...')`) sind englisch.
- **Commits:** Conventional-Commit-Präfix auf Englisch, Beschreibung auf Deutsch, zum Beispiel `feat: Anleitung im Esc-Menü`, `fix(client): …`, `docs: …`, `test(server): …`. Ein Commit je abgeschlossener Aufgabe.
- **Trailer:** Commits, an denen Claude mitgeschrieben hat, tragen `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (die allermeisten), einige wenige `Claude Opus 5.5`. PR-Texte enden mit `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Ohne Claude entfällt das; ein anderer Assistent kann seine eigene Zeile setzen.
- **PR-Ablauf:** Branch von `master` (`feature/…`, `fix/…`, `docs/…`), kleine Commits, PR mit deutscher Beschreibung (Was, Warum, Test), CI muss grün sein, dann mergen. Gemergt wird mit Merge-Commit. Größere Vorhaben liefen als Spec, dann Plan, dann mehrere aufeinander aufbauende PRs.
- **Nie committen:** `todo.md` und `idee.md` im Wurzelordner sind private Notizen. Deshalb nie `git add -A` oder `git add .`, immer Dateien einzeln stagen. Den Ordner `.claude/` nicht löschen (dort liegen lokale Einstellungen).
- **Assets:** nur CC0 oder klar erlaubte Lizenzen, Quelle in der jeweiligen `CREDITS.txt` und in `client/src/credits.ts` (Menü „Credits“) eintragen.

## 9. Tests

| Paket | Testdateien | Tests | Ort |
|---|---|---|---|
| client | 67 | 1011 | `packages/client/test/` |
| core | 49 | 569 | `packages/core/test/` |
| server | 17 | 237 | `packages/server/test/` (davon `lagSchedule.test.mjs` für den Lag-Proxy) |

Zusammen 1817 Tests, Stand 16.10.2026, alle grün; Typecheck und beide Builds sauber. `npm test` führt alle aus, `npm test -w @pfandraiders/core` nur ein Paket, `npm test -w @pfandraiders/client -- helpPages` nur die Testdateien, deren Name den Filter enthält. Während der Arbeit hilft `npx vitest` im Paketordner (Beobachtungsmodus).

Bemerkenswerte Testarten:

- **Determinismus** (`core/test/determinism*.test.ts`): zwei Partien mit gleichem Seed und gleichen Eingaben müssen gleich enden, auch mit Diebstahl und Events.
- **Kartenparität** (`city-parity`, `retro-parity`, `custom-index`): Die eingecheckten Tiled-Dateien müssen genau dem entsprechen, was die Generatoren aus den Quellen erzeugen. Vergisst man nach einer Änderung den Generator, wird der Test rot.
- **Alle Karten** (`all-maps.test.ts`): jede registrierte Karte wird geprüft und kurz gespielt.
- **Snapshot-Projektion** (`snapshot.test.ts`): nichts Privates verlässt den Server.
- **Vorhersage** (`client/test/prediction.test.ts`): simuliert einen Server mit Verzögerung, Jitter und Staus und misst Sprünge der eigenen Figur. `PRED_REPORT=1` gibt Kennzahlen aus.
- **Server** (`server/test/`): Räume, Serie, Shop, Chat, Passwörter, Figuren, Karten und der Nachrichten-Handler mit Ratenlimits, ohne echte Sockets (`handler*.test.ts`), sowie ein Test mit echtem WebSocket-Server (`server.test.ts`).
- **Anleitung** (`helpPages.test.ts`): Texte passen in die Zeilenbreite und nennen die richtigen Werte.

Tests sind mit Vitest geschrieben, Bezeichnungen englisch, Kommentare deutsch. Neue Funktionen wurden fast immer testgetrieben gebaut: erst ein roter Test, dann der Code.

## 10. Lizenzen, Assets, Credits

| Asset | Quelle | Lizenz | Liegt in |
|---|---|---|---|
| Kacheln der Stadt | Kenney, „Roguelike Modern City“ | CC0 | `packages/client/src/assets/kenney/` (mit `License.txt`) |
| Spielerfiguren | Fleurman, „Tiny Characters Set“, nach GrafxKid | CC0 | `packages/client/src/assets/characters/` (mit `CREDITS.txt`) |
| Hunde | Jason of GDN, „Dog Spritesheets“ | CC0 | `packages/client/src/assets/npc/` (mit `CREDITS.txt`) |
| Polizist | Chasersgaming, „Officer Character“ | CC0 | `packages/client/src/assets/npc/` |
| Spiel-Framework | Phaser 3 | MIT | npm |
| Logo, Retro-Kacheln, Töne, Musik, Karten | selbst erzeugt | eigenes Werk | Code |

Dieselbe Liste zeigt das Spiel unter „Credits“ (`client/src/credits.ts`). Eigene Audiodateien gehören mit Quelle und Lizenz in `assets-src/audio/CREDITS.txt`. Das Projekt selbst hat bisher keine `LICENSE`-Datei; ohne sie gilt rechtlich „alle Rechte vorbehalten“.

## 11. Dokumente

| Dokument | Wofür |
|---|---|
| [README.md](README.md) | Vollständige Spielregeln mit allen Zahlen, Steuerung, Online-Funktionen, Server-Variablen, Testhilfen |
| [docs/WARTUNG.md](docs/WARTUNG.md) | Wartungshandbuch: Rezepte für typische Änderungen, Betrieb, Sicherheit, Fehlersuche |
| [docs/KARTEN.md](docs/KARTEN.md) | Eigene Karten mit Tiled bauen, Regeln, häufige Fehlermeldungen |
| [docs/NETZ.md](docs/NETZ.md) | Netz-Overlay, Lag-Proxy, Messungen und die vier Befunde samt Umsetzung |
| [docs/SOUNDLISTE.md](docs/SOUNDLISTE.md) | Alle Audio-IDs, wann sie klingen, Dateiformate, Regeln für eigene Dateien |
| [assets/logo/README.md](assets/logo/README.md) | Aufbau und Farben des Logos |
| `docs/superpowers/specs/` | Entwürfe der großen Vorhaben (Grunddesign, Stadtkarte, Serie und Shop, Online-Räume, Shop-Umbau, eigene Karten) |
| `docs/superpowers/plans/` | Umsetzungspläne dazu, Aufgabe für Aufgabe mit Tests und Code |

Die Specs und Pläne sind ein Archiv: Sie zeigen, warum etwas so gebaut wurde und welche Alternativen verworfen wurden, sind aber nicht nachgeführt. Wo sie dem Code widersprechen, gilt der Code (Beispiele: der Knockout dauert heute 10 s, Bolzenschneider, Steinschleuder, Pistole und die Essen-Taste gibt es nicht mehr). Am aufschlussreichsten sind:

- `docs/superpowers/specs/2026-10-02-pfandraiders-design.md`: Grundidee, Architektur, autoritativer Server.
- `docs/superpowers/specs/2026-10-08-serie-shop-kampf-design.md` und `docs/superpowers/specs/2026-10-09-shop-umbau-design.md`: Serie, Shop-Phase und der heutige Katalog.
- `docs/superpowers/specs/2026-10-09-online-raeume-design.md`: Räume, Passwörter, Figuren, Rundenzahl.
- `docs/superpowers/specs/2026-10-10-eigene-karten-design.md`: Kartenformat und Prüfregeln.

## 12. Offene Ideen

Nichts davon ist angefangen. Die Hinweise sagen, wo man ansetzen würde.

- **Zwille oder andere Fernwaffen:** Steinschleuder und Pistole wurden beim Shop-Umbau ganz entfernt; es gibt kein Feld `weapon` und keine Geschosse. Ansatzpunkte: neuer Artikel in Kategorie `weapons` (Rezept in [WARTUNG.md](docs/WARTUNG.md#einen-neuen-shop-artikel-hinzufügen)), Wirkung nach dem Muster von `spray.ts` (nächster Gegner in Reichweite, Abklingzeit, Ladungen). Eine Schussrichtung bräuchte eine Blickrichtung des Spielers im Zustand, ein Geschoss mit Flugzeit ein neues Feld in `GameState` und damit eine Entscheidung in `projectSnapshot`. Eine eigene Taste braucht ein neues Feld in `Input` (`types.ts`, `sanitize.ts`, `devices.ts`, `sources.ts`, Anleitung).
- **Spieler kicken:** neue Nachricht `kick` (nur Host), in `Room` ähnlich `leaveForGood`; löst auch das Problem des blockierten Shops.
- **Raumeinstellungen nachträglich ändern:** Raumname, Sichtbarkeit und Passwort sind heute nach dem Anlegen fest (`RoomSettings`, `readonly` in `room.ts`).
- **Wände aus Kacheleigenschaften:** Heute malt man Wände in eigenen Karten von Hand in der Ebene `walls`. Eine Eigenschaft `wall` am Kachelsatz könnte sie ableiten (`core/src/tiled.ts`, `validate.ts`).
- **Touch-Steuerung:** Es gibt keine. Eine neue `InputSource` (`client/src/sources.ts`) mit virtuellem Stick wäre der Einstieg.
- **Delta-Snapshots:** Unveränderte Teile (Spots, Zonen, Startpunkte) seltener oder als Unterschied schicken. Ändert das Protokoll; Hintergrund in [docs/NETZ.md](docs/NETZ.md), Befund 4.
- **Zeitlimit im Shop** und **Balancing nach Testrunden.**

## 13. Wie arbeite ich weiter ohne Claude

Das Projekt ist so gebaut, dass jede Änderung durch Tests und den Typecheck abgesichert wird. Das hilft allein genauso wie mit einem anderen KI-Assistenten.

1. **Kontext zuerst.** Einem Assistenten zu Beginn dieses Dokument, das README und für das jeweilige Thema [WARTUNG.md](docs/WARTUNG.md) geben, bei Netzthemen [NETZ.md](docs/NETZ.md), bei Karten [KARTEN.md](docs/KARTEN.md). Dazu die Dateien, um die es geht. Ohne diesen Kontext erfindet ein Assistent gern Strukturen, die es hier nicht gibt.
2. **Klein schneiden.** Eine Änderung je Branch und PR. Lieber drei kleine PRs als einen großen; die bisherigen PRs zeigen die übliche Größe.
3. **Erst der Test.** Neues Verhalten zuerst als fehlschlagenden Test beschreiben, dann umsetzen. Die meisten Module sind absichtlich rein und ohne Phaser testbar (`shopModel.ts`, `helpPages.ts`, `prediction.ts` und alles in `core`).
4. **Immer prüfen.** Vor jedem Commit `npm test` und `npm run typecheck`, vor dem Ausliefern auch `npm run build` und `npm run build:server`. Die CI tut dasselbe; ein roter Haken heißt: nicht mergen.
5. **Dem Typsystem folgen.** Viele Stellen sind so gebaut, dass der Compiler an alles erinnert (`projectSnapshot`, `noItems()`, `Record<ShopItemId, …>`). Wenn der Typecheck nach einer Änderung an einer unerwarteten Stelle rot wird, ist das meist genau die Stelle, an die man denken musste.
6. **Begründungen nachlesen.** Bevor man etwas grundlegend umbaut, in `docs/superpowers/specs/` und `plans/` nachsehen, warum es so ist. Die Pläne enthalten auch Beispiele, wie eine Aufgabe in Schritte mit Tests zerlegt wurde; das ist eine gute Vorlage für Aufträge an einen Assistenten.
7. **Kern und Server zusammen denken.** Alles, was `core` oder `protocol.ts` betrifft, gilt für Client und Server. Nach so einer Änderung immer beide ausliefern.
8. **Vorsicht bei Assistenten-Vorschlägen** zu `Math.random()` oder `Date.now()` im Kern (bricht den Determinismus), zu neuen Feldern im Zustand ohne Entscheidung in `projectSnapshot` und zu `git add -A` (würde private Notizen committen).
