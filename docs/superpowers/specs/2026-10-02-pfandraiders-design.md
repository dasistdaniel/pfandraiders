# PfandRaiders – Design-Spec

Stand: 2026-10-02. Status: Entwurf zur Prüfung. Noch kein Code.

## 1. Ziel und Kern

Multiplayer-Spiel in Retro-Top-Down-Optik. Spieler sammeln Pfandflaschen in einer Stadt, geben sie an Pfandautomaten ab und kaufen Upgrades und Essen. Beim Suchen ist der eigene Container offen und kann von anderen Spielern teilweise geklaut werden.

- Rundenbasiert: 10 Minuten, wer am Ende das meiste Geld hat, gewinnt. Flaschen im Container zählen nicht. Upgrades gelten nur innerhalb der Runde.
- Online: Raumcode-Lobby, 2–8 Spieler, Host startet, keine Accounts.
- Lokal: echter Splitscreen mit eigener Kamera je Spieler, 2–4 Spieler, Gamepad, läuft komplett im Browser ohne Server. Kein Mischmodus lokal plus online.
- Zielgerät: Desktop-Browser. Tastatur (WASD plus eine Aktionstaste), Gamepad optional. Touch ist nicht Teil von Version 1.
- Eine feste Stadtkarte. Spots und Pfandmengen werden pro Runde per Seed zufällig befüllt.

## 2. Technik und Hosting

- Sprache: TypeScript durchgehend.
- Client: Phaser 3, statisch auf GitHub Pages.
- Server: Node mit WebSocket, ein Docker-Container auf einem VPS, hinter einem TLS-Reverse-Proxy (wss), weil Pages über https läuft.
- Netzwerkmodell: server-autoritativ, 20 Ticks pro Sekunde, Clients senden nur Eingaben, Server sendet Snapshots, Clients interpolieren. Prediction für den eigenen Spieler erst in Phase 5, falls die Steuerung zäh wirkt.

## 3. Aufbau (Monorepo, drei Pakete)

- `core`: reines TypeScript ohne Browser und Netzwerk. Simulation `step(state, inputs, dt) → state`, deterministisch mit Seed-Zufall. Enthält alle Regeln: Spieler, Container, Spots, Shop, Events, Diebstahl, Health, Rundentimer. Einzige Quelle der Regeln.
- `client`: Phaser. Rendering, Tilemap, Kameras, Eingabe (Tastatur, Gamepad), UI, Sound. Kennt keine Regeln. Zwei Betriebsarten über die Schnittstelle `GameConnection`:
  - `LocalConnection`: lässt `core` im Browser laufen, bis zu 4 Eingabequellen, ein Viewport je Spieler.
  - `OnlineConnection`: WebSocket, Eingaben senden, Snapshots empfangen, Interpolation.
- `server`: Räume mit Code, Lobby, Tick-Schleife, ruft `core.step` auf. Zustand nur im Speicher, keine Datenbank.

Karte: Tiled-JSON. Tiles, Kollision und benannte Objektebenen (Spots, Abgabestellen, Shops, Event-Zonen, Spawnpunkte). `core` liest die Logikdaten, `client` zusätzlich die Grafik.

## 4. Spielregeln (Startwerte, alle in einer Config-Datei)

**Spieler:** Position, Health (100), Geld, Container, Zustand (`laufen`, `suchen`, `klauen`, `bewusstlos`), optional ein Special Item.

**Container (Kapazität):** Hände 3, Tasche 8, Rucksack 15, Einkaufswagen 30. Der Wagen macht langsamer. Upgrade nur im Shop, Preis steigt je Stufe.

**Flaschen:** Plastik 0,08 €, Glas 0,15 €, Kasten-Glas 0,25 €. Geld gibt es erst bei Abgabe am Pfandautomat (kein Limit).

**Suchen:** Aktionstaste halten, Fortschrittsbalken (ca. 3 s), Zufallsfund nach Fundtabelle des Spot-Typs. Spieler steht still, Zustand `suchen`, Container ist offen. Danach ist der Spot leer und füllt sich nach einem Timer nach.

**Spots:** Typ (Bushaltestelle, Bank, Gebüsch, Mülleimer, Park), Suchdauer, Fundtabelle, Nachfüll-Timer. Der Seed bestimmt pro Runde, welche Spots aktiv sind und wie viel sie enthalten.

**Event-Zonen** (Stadion, Konzert, Fußballspiel): zeitlich begrenzt, höhere Fundmengen. Der Server kündigt sie ca. 20 s vorher an.

**Diebstahl (Standard):** Dieb steht beim Opfer und hält die eigene Klauen-Taste (Gamepad: B) 2 s. Das Opfer wird gewarnt (Symbol, Sound). Bewegt sich der Dieb oder gerät das Opfer außer Reichweite, Abbruch. Bei Erfolg erhält der Dieb 50 % der Flaschen. Möglich, sobald das Opfer Flaschen im Container hat, unabhängig davon, was es gerade tut. (Geändert nach Phase 2: vorher nur bei suchendem Opfer und mit der Aktionstaste.)

**Special Item** (ein Slot, einmalig, im Shop kaufbar oder findbar): Bolzenschneider = Sofort-Diebstahl von 100 % des Containers. Weitere Items später.

**Shop (Kiosk):** Essen (Health), Container-Upgrades, Special Item.

**Health:** sinkt durch Hundebisse, Polizeistrafen und Hunger über Zeit. Essen heilt. Bei 0: ca. 10 s `bewusstlos`, Respawn am Startpunkt, alle ungeabgegebenen Flaschen und ein Teil des Geldes gehen verloren. Kein Ausscheiden.

**Zufallsevents:** Hund (jagt Spieler, Biss kostet Health, Leckerli lenkt ab). Polizei (Kontrolle konfisziert einen Teil des Containers, außer der Spieler flieht).

## 5. Netzwerk und Lobby

**Ablauf:** Name eingeben → Raum erstellen oder Code eingeben → Server vergibt 4-stelligen Code → Host startet (mindestens 2 Spieler) → Server sendet Seed und Startzeit, 3 s Countdown → Runde → Ergebnisbildschirm, Raum bleibt für "Nochmal" offen.

**Nachrichten:** JSON über einen WebSocket je Spieler.
- Client → Server: `join`, `ready`, `input` (Richtung, Aktion, laufende Nummer).
- Server → Client: `lobby`, `start`, `snapshot`, `event` (Ankündigung, Diebstahl-Warnung, Rundenende).

**Snapshots** enthalten nur Sichtbares: Positionen, Zustände, öffentliche Spot-Status. Geld und Containerinhalt anderer Spieler werden nicht gesendet (Cheat-Schutz, passend zum Diebstahl-Thema).

**Client:** Interpolation zwischen den letzten zwei Snapshots (ca. 100 ms Verzögerung). Eingaben tragen Nummern, damit Prediction später ergänzt werden kann.

**Verbindungsabbruch:** Der Spieler bleibt 30 s im Raum und ist normal angreifbar. Rückkehr mit Name und Token aus `sessionStorage`. Danach Entfernung, das Geld bleibt für die Rangliste. Verlässt der Host, wird der nächste Spieler Host.

**Grenzen:** max. 8 Spieler je Raum, ratenbegrenzte Eingaben, leere Räume nach 2 min gelöscht, Origin-Check auf die Pages-Domain.

**Lokaler Modus:** `LocalConnection` ruft `core.step` direkt auf. Kein Snapshot-Filter nötig, jeder Viewport zeigt seine eigene Kamera.

## 6. Phasen

Jede Phase ist spielbar und einzeln prüfbar.

1. **Kern lokal, 1 Spieler:** `core` plus Phaser-Client, Karte, Laufen, Suchen, Container, Abgabe, Shop, Timer. Platzhalter-Grafik. Ziel: Kernschleife macht Spaß, Balancing-Config steht.
2. **Diebstahl und Splitscreen:** 2–4 Spieler lokal, Gamepad, Klauen, Special Item. Hier zeigt sich, ob das Konzept trägt.
3. **Health und Zufallsevents:** Hunde, Polizei, Event-Zonen, Essen, Bewusstlosigkeit.
4. **Server und Online:** Node-Server, Lobby, Snapshots, Interpolation, Docker, VPS-Deploy mit wss-Proxy, Pages-Deploy.
5. **Politur:** Retro-Pixelgrafik, Sound, Menüs, Ergebnisbildschirm, Reconnect, Prediction falls nötig.

## 7. Nicht in Version 1

Matchmaking, Accounts, Ranglisten über Runden hinaus, mehrere Karten, Touch, Mischmodus lokal plus online, Chat.

## 8. Tests

- `core`: Unit-Tests für Regeln (Diebstahl 50 %, Kapazitätsgrenze, Shop-Preise, Bewusstlosigkeit) und Determinismus-Test (gleicher Seed und gleiche Eingaben ergeben gleichen Endzustand).
- Server: Integrationstest mit Bot-Clients (zwei Bots spielen eine Runde, Ergebnis stimmt).
- Client: Handtest im Browser, anfangs keine Pixel-Tests.

## 9. Risiken

- Splitscreen mit Phaser (mehrere Kameras, Gamepad-Zuordnung): früh in Phase 2 prüfen.
- Balancing von Diebstahl und Preisen: Werte nur in der Config, viel Probespielen.
- Artwork: zuerst Platzhalter, später freie Tilesets oder eigene Assets.

## 10. Entscheidungen beim Planen von Phase 1

- Karte in Phase 1: handgeschriebene ASCII-Karte in `core` (Zeichen für Wand, Spawn, Pfandautomat, Shop, Spot-Typen) statt Tiled-JSON. Der Tiled-Loader kommt in Phase 5 zusammen mit dem Artwork. Das Kartenformat `MapData` bleibt dabei gleich.
- Essen im Shop kommt erst in Phase 3 (ohne Health wäre es wirkungslos). Phase 1 verkauft nur Container-Upgrades.
- Geld wird intern in Cent als ganze Zahl geführt.
- `step` verändert den übergebenen Zustand direkt und gibt ihn zurück.

## 11. Offene Punkte (bewusst auf später verschoben)

Spielname im Spiel, Layout der Stadtkarte und Spot-Verteilung, Soundstil, weitere Special Items, genaue Balancing-Zahlen.
