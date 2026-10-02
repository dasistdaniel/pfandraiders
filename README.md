# PfandRaiders

Retro-Top-Down-Spiel: Pfandflaschen sammeln, abgeben, Container ausbauen. Design: `docs/superpowers/specs/`, Pläne: `docs/superpowers/plans/`.

## Entwickeln

    npm install
    npm run dev        # Spiel im Browser (Vite)
    npm test           # Tests aller Pakete
    npm run typecheck

## Spielen

Lokal mit 1 bis 4 Spielern, jeder mit eigener Kamera. In der Lobby treten Spieler mit der Aktionstaste ihres Geräts bei, Start mit Leertaste oder Start-Taste des Gamepads.

| Gerät | Laufen | Aktion | Klauen | Container-Upgrade | Bolzenschneider | Leckerli | Essen |
|---|---|---|---|---|---|---|---|
| Tastatur 1 | WASD | E | Q | 1 | 2 | 3 | 4 |
| Tastatur 2 | Pfeile | Enter | / | , | . | ; | ' |
| Gamepad | Stick oder Steuerkreuz | A | B | X | Y | RB | LB |

Aktion: Suchen (halten), Pfand abgeben (drücken am Pfandautomaten). Klauen: Klauen-Taste halten (2 s) neben einem Mitspieler, der Flaschen im Container hat, egal was er gerade macht. Mit dem Bolzenschneider (im Shop 6,00 €) klaut ein neuer Druck der Klauen-Taste sofort alles, was in den eigenen Container passt. `R` oder die Aktionstaste startet nach Rundenende (nach kurzer Sperre) neu. Zwei Spieler an einer Tastatur sind durch Keyboard-Ghosting begrenzt (nicht alle Tastenkombinationen werden erkannt).

## Leben und Events

Leben sinken durch Hunger (1 pro 8 s), Hundebisse (15) und das Umfallen kostet Flaschen, Item und 25 % des Geldes; nach 10 s steht man am Startpunkt wieder auf. Essen im Shop (1,00 €) heilt 30. Hunde beißen zu und lassen sich mit einem Leckerli (1,00 €, wird automatisch eingesetzt, teilt den Item-Slot mit dem Bolzenschneider) ablenken. Polizisten konfiszieren nach 2 s Kontrolle die Hälfte der Flaschen, wer wegläuft, entgeht ihr. Stadion und Konzert laden regelmäßig zu Events ein: 20 s vorher gibt es einen Hinweis, dann liegt dort 60 s lang dreifach so viel Pfand und Spots füllen sich schneller nach.

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

In der Lobby öffnet die Taste `O` das Online-Menü (Raum erstellen oder mit Code beitreten). Die Server-Adresse kommt aus `?server=ws://…`, sonst aus der Build-Variable `VITE_SERVER_URL`, sonst `ws://localhost:8080`. Nach einem Verbindungsabbruch das Menü erneut öffnen und mit demselben Namen und Code beitreten (Frist 30 s). Das Token liegt nur im sessionStorage, die Wiederverbindung klappt also beim Neuladen oder in einem duplizierten Tab, nicht in einem ganz neuen Tab.

Weitere Grenzen im Server: Pro IP-Adresse sind höchstens 10 gleichzeitige Verbindungen erlaubt (Option `maxPerIp`), ein Socket ohne Raum wird nach 30 s geschlossen (`idleMs`). Als IP gilt der erste Eintrag des Headers `X-Forwarded-For`, sonst die Socket-Adresse. Der Header wird vertraut, weil nur Caddy den Server erreicht (der Container hat keinen Host-Port). Origins in `ALLOWED_ORIGINS` werden normalisiert (Kleinschreibung, ohne Schrägstrich am Ende).

Bauen: `npm run build:server` erzeugt `packages/server/dist/server.cjs` (eine einzelne Datei, läuft mit `node server.cjs` ohne `node_modules`).

Auf dem VPS (Docker, Caddy übernimmt HTTPS):

    cd deploy
    DOMAIN=play.example.org ALLOWED_ORIGINS=https://dasistdaniel.github.io docker compose up -d --build

Der Client für GitHub Pages wird mit der Repository-Variable `SERVER_URL` gebaut (zum Beispiel `wss://play.example.org`).

Handarbeit:

1. DNS-Eintrag der Domain auf den VPS zeigen lassen.
2. Ports 80 und 443 am VPS öffnen.
3. In den Repository-Einstellungen unter Pages die Quelle auf "GitHub Actions" stellen.

Grenzen (nicht für großen öffentlichen Betrieb gedacht):

- Es gibt keine Limits pro IP-Adresse.
- Eine leere Lobby bleibt offen, solange ein Client verbunden ist.
- Das Raumcode-Raten ist nur pro Verbindung begrenzt, nicht global.
