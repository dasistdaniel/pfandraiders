# PfandRaiders: Handover

Stand: 2026-10-09, `master` bei 97f92be. Repository: https://github.com/dasistdaniel/pfandraiders

## 1. Was das Projekt ist

Retro-Top-Down-Spiel: Man sammelt Pfandflaschen in einer Stadt, gibt sie am Pfandautomaten ab, kauft zwischen den Runden im Shop ein und schlägt oder beraubt Mitspieler. Lokaler Splitscreen bis 4 Spieler, online bis 8. Der Client läuft auf GitHub Pages, der Server als Docker-Container auf einem VPS.

## 2. Aufbau

TypeScript-Monorepo (npm workspaces), Node 24, Windows als Entwicklungsrechner (Bash und PowerShell verfügbar, kein Python, kein Docker lokal).

| Paket | Aufgabe |
|---|---|
| `packages/core` | Reine, deterministische Spielregeln: `step(state, inputs, dtMs)`, seeded RNG, Protokoll, Snapshot-Projektion, Karten (`maps/`), Shop (`shop.ts`), Kampf, NPCs mit Wegsuche (`path.ts`), Rangliste |
| `packages/client` | Phaser 3 + Vite + Vitest. Canvas 960x540, Welt-Kameras Zoom 2, UI-Kameras Zoom 1. Szenen in `src/scenes/` (Boot, Menu, Lobby, Game, Shop, Final) |
| `packages/server` | Node, `ws`, esbuild-Bundle (`dist/server.cjs`), autoritativer 20-Hz-Tick, Räume mit 4-stelligem Code (`room.ts`, `rooms.ts`, `server.ts`) |

Weitere Ordner: `deploy/` (docker-compose, `update.sh`), `assets/logo`, `assets-src/`, `docs/superpowers/specs` und `plans` (Entwürfe und Umsetzungspläne jeder Phase), `scripts/` (Logo-Generator).

## 3. Befehle

```bash
npm install
npm run dev            # Client (Vite)
npm run dev:server     # Server (tsx watch)
npm test               # alle Workspaces
npm run typecheck
npm run build          # Client
npm run build:server   # packages/server/dist/server.cjs
```

Debug-Parameter der URL stehen im README (Abschnitt "Testhilfen per URL"): u. a. `?solo=1`, `?players=N`, `?map=retro`, `?round=SEKUNDEN`, `?seed=`, `?server=ws://…`, `?join=CODE`.

Teststand: core 445, client 731, server 196 Tests, alle grün; Typecheck und beide Builds sauber.

## 4. Deployment

- **Client:** `.github/workflows/pages.yml` baut bei jedem Push auf `master` und veröffentlicht auf GitHub Pages. Server-Adresse kommt aus `vars.SERVER_URL`, die Build-Nummer aus `GITHUB_RUN_NUMBER`.
- **Server:** auf dem VPS `deploy/update.sh` ausführen (`git pull --ff-only`, setzt `GIT_SHA` und `BUILD_NUMBER`, dann `docker compose up -d --build`). Der Reverse-Proxy ist ein Nginx Proxy Manager (externes Docker-Netz `proxy-net`), `deploy/.env` enthält `ALLOWED_ORIGINS`.
- Optionale Umgebungsvariablen: `ROUND_MS` (feste Rundenlänge, überschreibt die Wahl des Hosts, nur für Tests), `GRACE_MS` (Rückkehrfrist, Standard 120 s), `MAP_ID` (`city` oder `retro`). Details im README ("Online spielen und Server").
- **Protokolländerungen** erfordern Client **und** Server neu. Die Lobby zeigt eine Versionswarnung, wenn Build-Nummern abweichen.

## 5. Spielablauf (aktueller Stand)

1. **Lobby:** Raum erstellen (Name, öffentlich/privat, optionales Passwort) oder beitreten (Code, Raumliste, Teilen-Link). Figur aus 24 wählen (pro Raum einmalig), Chat, Host stellt Rundenzeit (3/5/7/10 min, Standard 5) und Rundenzahl (1/3/5/offen, Standard 3) ein.
2. **Runde:** 5 s Countdown, dann Flaschen suchen (halten, 1,5 s), am Pfandautomaten abgeben, Schlagen (Taste), Essen (Taste), Ausrauben von Ausgeknockten (50 % der Flaschen, mit Bolzenschneider alle). Leben sinken durch Hunger, Hundebisse und Schläge; bei 0 Leben 20 s Knockout (mit Upgrade kürzer), danach Aufstehen am selben Ort.
3. **Rangliste, dann Shop:** Kategorien Taschen, Upgrades, Angriff, Verteidigung. Bedienung nur mit Bewegungstasten (lokal) bzw. zusätzlich Maus (online). Ende der Phase erst, wenn alle verbundenen Spieler "Bereit" gedrückt haben, kein Zeitlimit.
4. **Nach der letzten Runde:** Endwertung nach Gesamtverdienst. Nur der Host bringt alle mit "Zur Lobby" zurück: gleicher Code, gleicher Chat, Fortschritt zurückgesetzt.
5. **NPCs:** Hunde (höchstens einer jagt einen Spieler) und Polizisten (konfiszieren nach 2 s Kontrolle die Hälfte der Flaschen); sie laufen per Breitensuche um Häuser. Bei Beschlagnahme gibt es einen Ton und eine Meldung.
6. **Karten:** `city` (64x40, Standard, aus ASCII-Plan generiert) und `retro` (32x20). Es gibt keine Shops mehr auf den Karten.

Die genaue Regelbeschreibung steht im README. Maßgebliche Entwürfe: `docs/superpowers/specs/2026-10-08-serie-shop-kampf-design.md` und `2026-10-09-online-raeume-design.md`.

## 6. Wichtige Tuning-Werte

- `packages/core/src/config.ts`: Spielgeschwindigkeit (115), Suchzeit, Abgabe, Leben, Hund/Polizei (`CONFIG.npc`), Kampf (`CONFIG.fight`), Shop-Preise und -Wirkungen (`CONFIG.shop`), Countdown, Ausrauben (`CONFIG.steal`). Die Shop-Preise sind erfundene Startwerte und noch nicht ausbalanciert.
- `packages/client/src/prediction.ts`: Vorhersage der eigenen Figur online (`SNAP_DIST`, Totzone, `CORRECTION_GAIN`, `ACK_OFFSET_MS`). Wirkt laut Nutzer gut, falls Ruckeln wieder auftaucht, hier stellen.

## 7. Arbeitsweise mit dem Nutzer

- Antworten und UI auf **Deutsch**, kurz. Code, Commits, Doku und PR-Texte in normalem Stil (Kommentare deutsch wie im bestehenden Code, Commit-Typen englisch: `feat:`, `fix:`, `docs:`).
- Ablauf: Nutzer wünscht ein Feature, ich gebe einen kurzen Entwurf im Chat, er bestätigt ("ja", "leg los"), dann Umsetzung durch Subagenten (TDD, ein Commit je Aufgabe), eigener Test, PR, Bericht, Frage "Soll ich PR #N mergen?". **Gemergt wird nur auf ausdrückliches "merge".**
- Größere Vorhaben: Spec (`docs/superpowers/specs`), dann Pläne (`docs/superpowers/plans`), dann Ausführung, meist als gestapelte PRs (Basis = vorheriger Branch, beim Mergen auf `master` umstellen).
- Commit-Trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. PR-Texte enden mit `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- **Nie stagen:** `idee.md`, `todo.md` (privat, untracked). Dieses Handover ebenfalls nur auf Wunsch committen.
- Downloads nur mit ausdrücklicher Zustimmung. Nur CC0-Assets oder klar erlaubte Lizenzen.
- Subagenten dürfen `.claude/` im Projekt nicht per `rm -rf` löschen (ist einmal passiert; dort liegt `settings.local.json`).

## 8. Assets und Lizenzen

Kenney "Roguelike Modern City" (CC0), "Tiny Characters Set" von Fleurman (CC0), "Dog Spritesheets" von Jason of GDN (CC0), "Officer Character" von Chasersgaming (CC0). Texte dazu in `assets-src/*/CREDITS.txt` und im README ("Grafik"). Der Cozy-Fae-Pack wurde aus Lizenzgründen **nicht** verwendet. Ton und Musik werden komplett per WebAudio im Browser erzeugt (kein Asset). Das Logo wird aus einem Zellraster generiert (`npm run logo`).

## 9. Offene Punkte

Aus `todo.md`:
- **Hund jagt kürzer** (nur teilweise: ein Hund pro Spieler ist drin, die Jagdzeit von 30 s ist unverändert).
- **Nervige Musik ändern** (offen: was genau stört, Tempo, Melodie oder Bass?).
- **Upgrades überarbeiten** (Werte und Aufbau, am besten nach Testrunden).

Weitere Beobachtungen aus der Arbeit, nicht vom Nutzer beauftragt:
- Nicht geprüft: Gamepad im Shop und in den neuen Menüs, Töne und Musik bei normaler Bildrate, Neuladen/Wiederverbinden mitten in der Endwertung, "Link kopieren", große Bildschirme.
- Der Server-Tick dauert auf der Windows-Entwicklungsmaschine etwa 62 ms statt 50 ms (Countdown 5 s dauert ca. 6,2 s). Auf dem VPS vermutlich nicht.
- Streunende NPCs suchen keinen Weg, sie wählen nur Ziele in gerader Sicht.
- Wählt man online ein nicht verbundenes Gamepad, kann man sich nicht bewegen; zurück auf Tastatur nur über die Einstellungen (Auto-Wechsel geht nur Tastatur zu Gamepad).
- Eine in der Runde gehaltene Bewegungstaste kann im Shop als zusätzlicher Druck zählen (bei der Aktionstaste ist es abgefangen).
- Setzt der Server `ROUND_MS`, zeigt die Rundenzeit-Auswahl des Hosts einen leeren Eintrag.
- Bei Gleichstand mit einem gegangenen Spieler liest sich die Endwertung "Gesamtsieger: (gegangen) und Bob" komisch.
- Eine Polizei-Beschlagnahme kann in seltenen Fällen eine falsche Meldung auslösen, wenn derselbe Snapshot einen unabhängigen Flaschenverlust enthält.
- Mögliche Ideen (nie beauftragt): Kartenauswahl im Menü, Fernkampfwaffen (Steinschleuder und Pistole stehen grau im Shop und sind im Datenmodell vorbereitet), Raum nachträglich ändern, Spieler kicken.
