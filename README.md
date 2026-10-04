# PfandRaiders

Retro-Top-Down-Spiel: Pfandflaschen sammeln, abgeben, Container ausbauen. Design: `docs/superpowers/specs/`, Pläne: `docs/superpowers/plans/`.

## Entwickeln

    npm install
    npm run dev        # Spiel im Browser (Vite)
    npm test           # Tests aller Pakete
    npm run typecheck

## Spielen

Das Hauptmenü bietet Lokal spielen, Online spielen und Einstellungen (Lautstärke per Pfeiltasten, A/D oder Mausklick links/rechts der Zeile, Ton an/aus, Steuerungsübersicht). Bedienung: Pfeile oder W/S wählen, Enter/E/Leertaste bestätigt, Esc geht zurück; Gamepad: Steuerkreuz, A, B. Die Lautstärke wird im Browser gespeichert.

Musik: Im Hintergrund läuft eine im Browser erzeugte, treibende Chiptune-Musik in Moll mit kräftigem Achtelbass und synthetischem Schlagzeug. Im Lauf der Runde kommen Snare, Arpeggio und schnellere Hi-Hats dazu, das Tempo steigt von 90 auf 132 BPM; im Menü spielt sie ruhig ohne Schlagzeug, nach Rundenende leiser. Ihre Lautstärke stellt man in den Einstellungen unter „Musik“ ein (Standard 40 %), M bzw. „Ton aus“ schaltet sie mit stumm.

Lokal mit 1 bis 4 Spielern, jeder mit eigener Kamera. Im lokalen Spiel (Menüpunkt "Lokal spielen") treten Spieler in der Lobby mit der Aktionstaste ihres Geräts bei, Start mit Leertaste oder Start-Taste des Gamepads, Zurück ins Menü mit Esc oder Gamepad B.

| Gerät | Laufen | Aktion | Klauen | Container-Upgrade | Bolzenschneider | Leckerli | Essen |
|---|---|---|---|---|---|---|---|
| Tastatur 1 | WASD | E | Q | 1 | 2 | 3 | 4 |
| Tastatur 2 | Pfeile | Enter | / | , | . | ; | ' |
| Gamepad | Stick oder Steuerkreuz | A | B | X | Y | RB | LB |

Aktion: Suchen (im Stand drücken und 1,5 s halten), Pfand abgeben (am Pfandautomaten drücken und halten). Die Abgabe dauert: Die erste Flasche geht sofort beim Drücken in den Automaten, danach alle 0,15 s eine weitere, die wertvollste zuerst (Kasten, Glas, Plastik); jede wird sofort gutgeschrieben und mit einem „Pling“ quittiert, dessen Ton bei schneller Folge ansteigt. Ein voller Einkaufswagen (30 Flaschen) braucht so gut 4 s. Loslassen, Weglaufen oder ein leerer Container beenden die Abgabe; nach dem Weglaufen mit gehaltener Taste muss man neu drücken. Wer mit Flaschen am Automaten drückt, gibt ab und sucht nicht gleichzeitig an einem nahen Spot. Eine Suche beginnt nur mit einem neuen Tastendruck: Wer beim Laufen die Taste festhält, sucht beim Stehenbleiben nicht automatisch, und nach dem Weglaufen oder einer fertigen Suche muss man die Taste erst loslassen und neu drücken. Klauen: Ein Druck der Klauen-Taste im Stand neben einem Mitspieler, der Flaschen im Container hat, nimmt ihm sofort die Hälfte ab (aufgerundet, so viel in den eigenen Container passt), egal was er gerade macht. Danach ist das Opfer 3 s geschützt, und der Dieb kann 6 s lang nicht erneut klauen (der Hinweis zeigt „Klauen in N s“). Mit dem Bolzenschneider (im Shop 6,00 €) klaut der Druck sofort alles, was in den eigenen Container passt; auch er startet die Abklingzeit. Leere Spots füllen sich nach 30 s wieder (in einer Event-Zone nach 8 s). Am Rundenende zeigt ein Ergebnisfeld die Rangliste; nach kurzer Sperre startet `R` oder die Aktionstaste eine neue Runde (online nur der Host), `Esc` (lokal auch Gamepad B) führt zurück ins Menü. Zwei Spieler an einer Tastatur sind durch Keyboard-Ghosting begrenzt (nicht alle Tastenkombinationen werden erkannt).

Während der Runde öffnet `Esc` (Gamepad: Start) ein kleines Menü mit „Fortsetzen“, „Ton: an/aus“ und „Spiel verlassen“ (mit Rückfrage). Bedienung wie im Hauptmenü, Maus geht auch; `Esc` oder Gamepad B schließt es. Lokal hält das Menü das Spiel samt Rundenzeit an, online läuft die Runde weiter und die eigene Figur steht still.

## Leben und Events

Leben sinken durch Hunger (1 pro 8 s), Hundebisse (15) und das Umfallen kostet Flaschen, Item und 25 % des Geldes; nach 10 s steht man am Startpunkt wieder auf. Essen im Shop (1,00 €) heilt 30. Hunde und Polizisten kommen durch die Eingänge der Karte und verschwinden nie wieder: wer gerade niemanden jagt, streunt gemächlich durch die Stadt (kurze Wege, dazwischen Pausen) und jagt wieder los, sobald ein passender Spieler in die Nähe kommt. Neue kommen nur dazu, solange weniger als 3 jagen, insgesamt sind es höchstens 6. Hunde beißen einmal zu, setzen sich danach 8 s hin (beißen dabei niemanden) und streunen dann weiter; mit einem Leckerli (1,00 €, wird automatisch eingesetzt, teilt den Item-Slot mit dem Bolzenschneider) lassen sie sich ablenken. Polizisten konfiszieren nach 2 s Kontrolle die Hälfte der Flaschen und streunen danach weiter, wer wegläuft, entgeht der Kontrolle. Wer gebissen oder kontrolliert wurde, hat vor diesem Hund bzw. Polizisten 20 s Ruhe. Ohne Biss oder Kontrolle geben sie nach ihrer Zeit (Hund 30 s, Polizist 20 s) auf, lassen den Verfolgten ebenfalls 20 s in Ruhe und streunen (Hunde setzen sich vorher noch). Stadion und Konzert laden regelmäßig zu Events ein: 20 s vorher gibt es einen Hinweis, dann liegt dort 60 s lang dreifach so viel Pfand und Spots füllen sich schneller nach.

## Karten

Es gibt zwei Karten. `city` ist die Standardkarte, eine Stadt mit 64 x 40 Kacheln (Straßen, Häuser, Parks, zwei Pfandautomaten, zwei Shops, acht Startpunkte, Zonen Stadion und Konzert). `retro` ist die kleine Ursprungskarte mit 32 x 20 Kacheln und den selbst gezeichneten Kacheln. Jede Karte hat eine Kennung, die der Server in der Start-Nachricht mitschickt; der Client wählt danach die Grafik.

- Lokal: `?map=retro` oder `?map=city` in der URL.
- Server: Umgebungsvariable `MAP_ID` (`city` oder `retro`, Standard `city`).
- Eine Kartenauswahl in Menü und Raum gibt es noch nicht.

Die Stadt wird aus einem ASCII-Plan erzeugt: `packages/core/src/maps/cityPlan.ts` (Legende im Kopf der Datei) wird mit `npx tsx packages/core/scripts/generateCity.ts` zur Tiled-Datei `city.tiled.json` mit Regel- und Grafikebenen. Nach Änderungen am Plan die Datei neu erzeugen; ein Test prüft, dass beide übereinstimmen und dass jeder Punkt von jedem Startpunkt aus erreichbar ist.

Bäume und Laternen sind weiche Hindernisse (Ebene `soft`): sie blockieren nur einen kleinen Kern in der Kachelmitte, man läuft also dicht daneben vorbei. Außerdem rutscht der Spieler an Ecken, die ihn nur wenige Pixel überlappen (bis `CONFIG.slideMaxPx`), automatisch um die Kante herum, statt hängen zu bleiben.

## Grafik

Die Spielwelt (Boden, Dächer, Fassaden, Spots, Pfandautomat, Shop) nutzt die freien Kacheln "Roguelike Modern City" von [Kenney](https://kenney.nl) (CC0, Lizenzdatei unter `packages/client/src/assets/kenney/`). Welche Zelle des Kachelbogens für welches Bild genutzt wird, steht als reine Tabelle in `packages/client/src/kenneyMap.ts`. Fehlt der Bogen, fällt das Spiel auf die selbst gezeichneten Muster zurück.

Die Spielerfiguren stammen aus dem [Tiny Characters Set](https://opengameart.org/content/tiny-characters-set) von Fleurman (CC0), das auf den [RPG character sprites](https://opengameart.org/content/rpg-character-sprites) von GrafxKid (CC0) beruht (Dateien und `CREDITS.txt` unter `packages/client/src/assets/characters/`). Jeder Spieler bekommt nach seiner Position eine von acht festen Figuren (`packages/client/src/playerChars.ts`) und einen Ring in seiner Spielerfarbe unter den Füßen. Fehlt ein Figurenbogen, zeichnet das Spiel für diesen Spieler die selbst gezeichnete Figur.

Hunde und Polizisten stammen aus den [Dog Spritesheets](https://opengameart.org/content/dog-spritesheets) von Jason of GDN (CC0, drei Fellfarben) und dem [Officer Character](https://opengameart.org/content/officer-character) von Chasersgaming (CC0); Dateien und `CREDITS.txt` liegen unter `packages/client/src/assets/npc/`, welche Zeile des Bogens wann läuft, steht in `packages/client/src/npcAnim.ts`. Fehlt ein Bogen, nutzt das Spiel den selbst gezeichneten Hund bzw. Polizisten (`packages/client/src/sprites/`).

### Credits

Dieselbe Liste zeigt das Spiel im Hauptmenü unter "Credits" (Daten in `packages/client/src/credits.ts`, Enter öffnet den Link):

- [Roguelike Modern City](https://kenney.nl/assets/roguelike-modern-city) – Kenney, CC0 (Kacheln der Spielwelt)
- [Tiny Characters Set](https://opengameart.org/content/tiny-characters-set) – Fleurman, CC0 (Spielerfiguren)
- [RPG character sprites](https://opengameart.org/content/rpg-character-sprites) – GrafxKid, CC0 (Grundlage des Tiny Characters Set)
- [Dog Spritesheets](https://opengameart.org/content/dog-spritesheets) – Jason of GDN, CC0 (Hunde)
- [Officer Character](https://opengameart.org/content/officer-character) – Chasersgaming, CC0 (Polizist)
- [Phaser 3](https://phaser.io) – Photon Storm, MIT (Spiel-Framework)
- [PfandRaiders](https://github.com/dasistdaniel/pfandraiders) – dasistdaniel (Sound, Musik und Karten selbst erzeugt)

## Testhilfen per URL

`?solo=1` (ein Spieler, ohne Lobby), `?players=2` (n Spieler ohne Lobby, abwechselnd Tastatur 1 und 2), `?round=30` (Rundenlänge in Sekunden), `?seed=123` (feste Zufallsbefüllung), `?events=now` (NPCs und Zonen sofort statt nach Minuten).

## Online spielen und Server

Der Mehrspieler-Server (`packages/server`) ist ein WebSocket-Server mit Räumen. Die Spiellogik liegt im Paket `core`.

Lokal starten (zwei Terminals):

    npm run dev:server   # Server auf ws://localhost:8080
    npm run dev          # Client; Server-Adresse per URL: ?server=ws://localhost:8080

Umgebungsvariablen des Servers:

- `PORT`: Listen-Port, Standard 8080.
- `ALLOWED_ORIGINS`: kommagetrennte Liste erlaubter Origins, zum Beispiel `https://dasistdaniel.github.io`. Ist sie leer, darf jede Origin verbinden (nur für die Entwicklung, der Server warnt beim Start).

- `ROUND_MS`: optionale Rundenlänge in Millisekunden (für kurze Testrunden), Standard 10 Minuten.
- `GRACE_MS`: wie lange der Server den Platz eines getrennten Spielers hält, ganze Zahl in Millisekunden, 5000 bis 3600000, Standard 120000 (2 Minuten). Ungültige Werte ergeben eine Warnung und den Standardwert. Ein leerer Raum bleibt mindestens so lange bestehen wie die Frist plus 15 s. Folge: Eine getrennte Figur steht bis zu 2 Minuten regungslos in der Runde und kann in dieser Zeit beklaut werden.

Im Hauptmenü öffnet "Online spielen" einen Dialog (Raum erstellen oder mit Code beitreten). Die Server-Adresse kommt aus `?server=ws://…`, sonst aus der Build-Variable `VITE_SERVER_URL`, sonst `ws://localhost:8080`. Nach einem Verbindungsabbruch verbindet der Client automatisch neu: 30 s lang im 2-s-Takt, danach fragt er "Weiter versuchen?" (Enter = Ja, jede Runde wieder 30 s; Esc = Menü). Der Server hält den Platz 2 Minuten (siehe `GRACE_MS`); ist die Runde inzwischen vorbei, geht es mit einem Hinweis ins Menü. Das Token liegt nur im sessionStorage, die Wiederverbindung klappt also beim Neuladen oder in einem duplizierten Tab, nicht in einem ganz neuen Tab. Wer online über „Spiel verlassen“ geht, gibt seinen Platz sofort frei (Nachricht `leave`): Das Token gilt danach nicht mehr, die Figur bleibt bis Rundenende als Statist stehen und ihr Geld zählt für die Rangliste.

Weitere Grenzen im Server: Pro IP-Adresse sind höchstens 10 gleichzeitige Verbindungen erlaubt (Option `maxPerIp`), ein Socket ohne Raum wird nach 30 s geschlossen (`idleMs`). Als IP gilt der erste Eintrag des Headers `X-Forwarded-For`, sonst die Socket-Adresse. Der Header wird vertraut, weil nur der Reverse Proxy (Nginx Proxy Manager) den Server erreicht (der Container hat keinen Host-Port). Origins in `ALLOWED_ORIGINS` werden normalisiert (Kleinschreibung, ohne Schrägstrich am Ende).

Bauen: `npm run build:server` erzeugt `packages/server/dist/server.cjs` (eine einzelne Datei, läuft mit `node server.cjs` ohne `node_modules`).

Auf dem VPS (Docker, der Nginx Proxy Manager übernimmt HTTPS; das externe Docker-Netz `proxy-net` muss existieren):

    cd deploy
    ALLOWED_ORIGINS=https://dasistdaniel.github.io docker compose up -d --build

Der Client für GitHub Pages wird mit der Repository-Variable `SERVER_URL` gebaut (zum Beispiel `wss://play.example.org`).

Handarbeit:

1. Im Nginx Proxy Manager einen Proxy Host anlegen: Domain `play.example.org`, Scheme `http`, Forward Hostname `pfandraiders-server`, Port `8080`, **Websockets Support** an. Im Tab SSL ein Let's-Encrypt-Zertifikat anfordern und `Force SSL` aktivieren.
2. DNS-Eintrag der Domain auf den VPS zeigen lassen.
3. In den Repository-Einstellungen unter Pages die Quelle auf "GitHub Actions" stellen und die Variable `SERVER_URL` setzen.

Grenzen (nicht für großen öffentlichen Betrieb gedacht):

- Das Limit pro IP-Adresse gilt nur pro Server-Prozess und hängt am Header `X-Forwarded-For`.
- Eine leere Lobby bleibt offen, solange ein Client verbunden ist.
- Das Raumcode-Raten ist nur pro Verbindung begrenzt, nicht global.
