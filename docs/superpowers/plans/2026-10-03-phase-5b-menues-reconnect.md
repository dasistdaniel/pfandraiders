# PfandRaiders Phase 5b (Hauptmenü, Ergebnisbildschirm, Reconnect) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das Spiel startet in einem Hauptmenü (Lokal spielen, Online spielen, Einstellungen), zeigt am Rundenende einen richtigen Ergebnisbildschirm und verbindet nach einem Verbindungsabbruch automatisch neu. Prediction entfällt (die Steuerung fühlt sich gut an).

**Architecture:** Reine, ohne Phaser testbare Bausteine: `settings.ts` (Lautstärke mit austauschbarem Speicher), `menuModel.ts` (Auswahl in Menülisten), `resultRows` in `text.ts` (Zeilen des Ergebnisbildschirms), `reconnect.ts` (Zustandsautomat für die Wiederverbindung). Darauf setzen dünne Phaser-Szenen: `MenuScene` (Hauptmenü und Einstellungen), ein Ergebnisfeld im HUD und ein Wiederverbindungs-Overlay in `GameScene`. `OnlineConnection` bekommt `reopen()`, damit dieselbe Verbindung mit dem Token ein neues Socket öffnet. Der Server bekommt eine längere, per Umgebungsvariable einstellbare Frist für die Rückkehr.

**Tech Stack:** wie bisher. Keine neuen Abhängigkeiten.

**Spec:** `docs/superpowers/specs/2026-10-02-pfandraiders-design.md` §5 (Wiederverbindung), §6 Phase 5 (Menüs, Ergebnisbildschirm, Reconnect). Prediction (Phase 5 der Spec) entfällt nach Entscheidung des Entwicklers: Steuerung online fühlt sich gut an. Sie kann später nachgezogen werden, falls sie bei höherer Latenz zäh wird.

**Vorarbeit:** Phase 5a ist auf `master`. Arbeit auf Branch `phase-5b-menues` (bereits angelegt).

## Entscheidungen zum Plan (Spec ist dort still oder ungenau, bitte beim Lesen prüfen)

1. **Hauptmenü:** Neue Szene `MenuScene` (Schlüssel `menu`) nach `BootScene`. Einträge: `Lokal spielen`, `Online spielen`, `Einstellungen`. Bedienung: Pfeil hoch/runter oder W/S, Enter, E oder Leertaste bestätigen; Gamepad Steuerkreuz oder linker Stick und A; Mausklick. Die bisherige `LobbyScene` bleibt als Beitritts-Bildschirm für lokale Spieler (Eingabegeräte zuweisen, Start). Von dort führt `Esc` oder Gamepad-B zurück ins Menü. Die Taste `O` in der Lobby entfällt, Online startet im Hauptmenü.
2. **Einstellungen:** Eigener Bildschirm in `MenuScene`: `Lautstärke` (0 bis 100 Prozent in Zehnerschritten, links/rechts ändert, gespeichert), `Ton aus` (ja/nein, entspricht der Taste `M`), eine Übersicht der Steuerung (Tastatur 1, Tastatur 2, Gamepad, aus den vorhandenen Tastenbelegungen) und `Zurück`. Die Einstellungen liegen in `localStorage`.
3. **Ergebnisbildschirm:** Pro Viewport ein Feld (statt des bisherigen Textbanners) mit Überschrift, einer Zeile pro Spieler (Platz, Name in Spielerfarbe, Geld), Hervorhebung des Siegers und des eigenen Platzes, und einer Fußzeile mit den möglichen Aktionen. Fußzeile lokal: `Neue Runde: R oder <Aktion>` und `Menü: Esc`. Online Host: `Neue Runde: R oder <Aktion>` und `Menü: Esc`. Online Nicht-Host: `Warte auf den Host…` und `Menü: Esc`. `Esc` am Rundenende führt ins Hauptmenü (online wird die Verbindung geschlossen). Mitten in der Runde gibt es bewusst keine Menütaste (keine Fehlbedienung).
4. **Wiederverbindung:** Bricht die Verbindung im laufenden Online-Spiel ab, zeigt `GameScene` ein Overlay "Verbindung verloren, verbinde neu…" mit Restsekunden und versucht automatisch, mit `join(room, name, token)` zurückzukehren: erster Versuch sofort, danach alle 2 s. Nach 30 s ohne Erfolg erscheint die Frage "Weiter versuchen?" (`Enter` ja, `Esc` Menü). Bei "ja" läuft der automatische Versuch weitere 30 s, dann wieder die Frage. Antwortet der Server mit `name_taken`, `room_not_found`, `not_in_room` oder `already_started` (der Platz ist weg), bricht der Client sofort ab und geht mit einer Meldung ins Hauptmenü. Gelingt es, schickt der Server `start` und das Spiel läuft nahtlos weiter.
5. **Frist auf dem Server:** Damit "weiter versuchen" Sinn hat, muss der Server den Platz länger halten als 30 s. `SERVER_CONFIG.graceMs` steigt von 30 000 auf 120 000, einstellbar über die Umgebungsvariable `GRACE_MS` (gültig ab 5000, sonst Warnung und Standardwert, wie `ROUND_MS`). Folge: Eine getrennte Figur steht bis zu 2 Minuten regungslos in der Runde und kann beklaut werden. Das ist bewusst so entschieden. Der automatische Wiederverbindungsversuch bleibt auf 30 s pro Runde der Frage.
6. **Name und Token:** `OnlineConnection` merkt sich den eigenen Namen (aus `create` und `join`) und das Token (bereits vorhanden) und nutzt beides in `reopen()`.
7. **Nicht in Plan 5b:** Prediction, Delta-Snapshots, Chat, Einstellungen für Tastenbelegung (nur Anzeige), Grafikoptionen, Mehrsprachigkeit.

## Global Constraints

- `core` bleibt unberührt (kein Phaser, kein DOM, kein Netzwerk). Alle Änderungen betreffen `client` und `server`.
- Der Client enthält keine Spielregeln. Die Rangliste kommt weiter aus `ranking(state)` in `core`.
- Reine Logik (`settings`, `menuModel`, `resultRows`, `reconnect`) importiert weder Phaser noch DOM-Globals außer über Parameter (z. B. ein Speicherobjekt), damit die Tests ohne Browser laufen.
- Eingaben aus dem Netz werden weiter von `isValidSnapshot` und der Server-Validierung geprüft. `reopen()` darf keine neuen Vertrauensannahmen einführen.
- Alle Spielwerte nur in `core/src/config.ts`, Serverwerte in `packages/server/src/config.ts`. Die UI-Zeiten (30 s Phase, 2 s Abstand) stehen als benannte Konstanten in `reconnect.ts`.
- Dateien sind UTF-8, Umlaute in Kommentaren und Texten heil (prüfen mit `TextDecoder('utf-8', {fatal: true})`).
- Weltobjekte nach dem Aufbau der UI-Kameras in `GameScene` müssen von den UI-Kameras ignoriert werden. Overlays der Wiederverbindung sind UI (Zoom 1, nicht in der Welt).
- Commit-Nachrichten enden mit der Zeile `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Alle bestehenden Tests bleiben grün.

## Review Focus

- Ein kaputter Speicher (`localStorage` wirft, enthält Müll, `NaN`, Werte außerhalb 0 bis 100) bricht das Spiel nicht und fällt auf Standardwerte (Task 1).
- Menü-Auswahl läuft zyklisch, überspringt nichts und reagiert nicht doppelt auf eine gehaltene Taste (Task 2).
- Das Menü ist mit Tastatur, Gamepad und Maus bedienbar, und eine zweite Taste im selben Frame löst keine doppelte Aktion aus (Task 2).
- Der Ergebnisbildschirm zeigt bei 1 bis 8 Spielern, bei Gleichstand und bei sehr langen Namen eine lesbare Liste, und die Fußzeile passt zur Rolle des Betrachters (Host, Nicht-Host, lokal) (Task 3).
- Wiederverbindung: Token, Raum und Name stimmen, das neue Socket ersetzt das alte, ein spätes `onclose` des alten Sockets zerstört die neue Verbindung nicht, mehrere Abbrüche hintereinander funktionieren, und nach dem Verlassen ins Menü läuft kein Timer weiter (Task 4).
- Während der Wiederverbindung friert die Welt sichtbar ein (letzter Zustand), Eingaben gehen nicht verloren oder doppelt (Kaufbefehle), und nach der Rückkehr stimmt der Zustand (Task 4).
- Server: ungültiges `GRACE_MS` (NaN, negativ, zu klein) fällt auf den Standardwert, und Tests erwarten nicht mehr hart 30 s (Task 5).

---

## File Structure

```
packages/client/src/
  settings.ts            neu: Lautstärke laden/speichern (Speicher austauschbar)
  menuModel.ts           neu: Menüauswahl (rein)
  reconnect.ts           neu: Zustandsautomat der Wiederverbindung (rein)
  sound.ts               ändern: Lautstärke aus den Einstellungen
  text.ts                ändern: resultRows
  hud.ts                 ändern: Ergebnisfeld statt Textbanner
  online.ts              ändern: Name merken, reopen()
  scenes/MenuScene.ts    neu: Hauptmenü und Einstellungen
  scenes/LobbyScene.ts   ändern: Esc zurück ins Menü, ohne Online-Taste
  scenes/GameScene.ts    ändern: Ergebnisaktionen, Wiederverbindungs-Overlay
  scenes/BootScene.ts    ändern: nach dem Backen zum Menü
  main.ts                ändern: MenuScene registrieren
packages/server/src/
  config.ts              ändern: graceMs 120000
  index.ts               ändern: GRACE_MS lesen
packages/client/test/
  settings.test.ts  menuModel.test.ts  reconnect.test.ts  text.test.ts (erweitern)  online.test.ts (erweitern)
packages/server/test/ (bestehende Tests anpassen)
README.md                ändern
```

---

### Task 1: Einstellungen und Lautstärke

**Files:**
- Create: `packages/client/src/settings.ts`
- Modify: `packages/client/src/sound.ts`
- Test: `packages/client/test/settings.test.ts`, `packages/client/test/sound.test.ts` (erweitern)

**Interfaces:**
- Consumes: `SoundFx` (`sound.ts`, bestehende Klasse mit `muted`, `toggleMute()`, Master-Gain 0,15).
- Produces:
  - `interface KeyValueStore { getItem(k: string): string | null; setItem(k: string, v: string): void }`
  - `export const DEFAULT_VOLUME = 70` (Prozent)
  - `loadVolume(store?: KeyValueStore): number` (ganze Zahl 0 bis 100; Speicherschlüssel `pfandraiders.volume`; wirft nie; Müll, `NaN`, Werte außerhalb, Nicht-Zahlen und ein werfender Speicher ergeben `DEFAULT_VOLUME`; Dezimalzahlen werden auf eine ganze Zahl gerundet und begrenzt)
  - `saveVolume(v: number, store?: KeyValueStore): void` (begrenzt auf 0 bis 100, rundet, schluckt Speicherfehler)
  - `stepVolume(v: number, dir: -1 | 1): number` (Zehnerschritte, begrenzt auf 0 bis 100, auf Vielfache von 10 ausgerichtet: `stepVolume(75, 1) = 80`, `stepVolume(75, -1) = 70`, `stepVolume(100, 1) = 100`, `stepVolume(0, -1) = 0`)
  - `SoundFx.volume` (Prozent, Lese- und Schreibzugriff über `setVolume(v: number): void`, wirkt sofort auf den Master-Gain: `gain = 0.15 * volume / 100`; lädt beim Konstruieren `loadVolume()`; `setVolume` speichert über `saveVolume`)

- [ ] **Step 1: Failing tests** (`settings.test.ts`): `loadVolume` mit leerem Speicher gleich Standard; gespeichertem `'40'` gleich 40; `'abc'`, `''`, `'NaN'`, `'-5'`, `'150'`, `'12.6'` (gibt 13); Speicher, dessen `getItem` wirft; kein Speicher übergeben und `localStorage` nicht vorhanden (Test in der Node-Umgebung: gibt Standard). `saveVolume` schreibt gerundet und begrenzt, schluckt Fehler. `stepVolume` Tabelle wie oben, `NaN` gibt `DEFAULT_VOLUME`.
- [ ] **Step 2: Tests laufen lassen, Fehlschlag sehen; `settings.ts` implementieren; grün.**
- [ ] **Step 3: `SoundFx` anpassen.** Der Konstruktor behält seine bisherigen Parameter (sie werden in `sound.test.ts` benutzt), hängt als letzten optionalen Parameter eine Anfangslautstärke an (`volume = loadVolume()`). `setVolume(v)` rundet/begrenzt, speichert und setzt `master.gain.value`, falls der Kontext schon existiert; beim Erzeugen des Masters (`unlock`) wird derselbe Wert genutzt. Ergänze in `sound.test.ts` Tests mit dem vorhandenen Fake-AudioContext: Standardlautstärke 70 ergibt Gain `0.15 * 0.7`; `setVolume(0)` ergibt Gain 0 und `play` erzeugt weiter keinen Fehler; `setVolume(50)` vor `unlock` wirkt nach `unlock`.
- [ ] **Step 4: Tests, Typecheck, Build grün. Commit** `feat(client): add persisted volume setting`.

---

### Task 2: Hauptmenü, Einstellungsbildschirm und Szenenverkabelung

**Files:**
- Create: `packages/client/src/menuModel.ts`, `packages/client/src/scenes/MenuScene.ts`
- Modify: `packages/client/src/scenes/BootScene.ts`, `packages/client/src/scenes/LobbyScene.ts`, `packages/client/src/main.ts`, `packages/client/src/scenes/GameScene.ts` (nur Zugriff auf die geteilte `SoundFx`-Instanz, siehe unten)
- Test: `packages/client/test/menuModel.test.ts`

**Interfaces:**
- Consumes: `showOnlineMenu` (`onlineMenu.ts`), `resolveServerUrl`, `loadVolume/stepVolume/saveVolume` (Task 1), `KEYBOARD_LAYOUTS`/`PLAYER_COLORS` aus `devices.ts`, die Beschriftungen in `sources.ts` (`KeyLabels`).
- Produces:
  - `menuModel.ts` (rein): `interface MenuItem { id: string; label: string }`; `class MenuModel { constructor(items: MenuItem[]); selected: number; move(dir: -1 | 1): void; activate(): string; select(i: number): void; items: MenuItem[] }`. `move` läuft zyklisch. `activate()` gibt die `id` des gewählten Eintrags zurück. `select(i)` ignoriert Werte außerhalb des Bereichs. Ein leeres Menü wirft im Konstruktor.
  - `MenuScene` (`'menu'`): Hauptseite und Einstellungsseite in einer Szene, `init(data?: { notice?: string })` zeigt eine Meldung (zum Beispiel nach Verbindungsverlust).
  - Die geteilte `SoundFx`-Instanz wird aus `GameScene.ts` in eine kleine Datei `packages/client/src/sfx.ts` verschoben (`export const sfx = new SoundFx();` samt den zwei `window`-Listenern für die Freischaltung), damit Menü und Spiel dieselbe Instanz teilen. `GameScene` importiert sie von dort.

Verhalten `MenuScene`:
1. Hintergrund: gekachelter Boden aus `tile:floor_*` (Texturen existieren nach `BootScene`), abgedunkelt; großer Titel "PfandRaiders" (32 px), darunter die Einträge als Texte (24 px); der gewählte Eintrag mit `> ` davor und gelb. Fußzeile mit der Tastenhilfe (Pfeile/Enter, Gamepad).
2. Eingabe: Pfeil hoch/runter oder W/S bewegt, Enter, E oder Leertaste bestätigt (Flanken per `JustDown`, nur eine Aktion pro Frame). Gamepad: Steuerkreuz hoch/runter (`pad.up`/`pad.down` per Flanke), linker Stick über Schwelle 0,5 per Flanke, A bestätigt, B geht zurück. Maus: Hover wählt, Klick bestätigt (`setInteractive` auf den Texten).
3. `Lokal spielen` startet `lobby`. `Online spielen` öffnet `showOnlineMenu` wie bisher in `LobbyScene` (Tastatur-Plugin während des Overlays deaktivieren und danach wieder aktivieren, auf jedem Austrittspfad; bei Erfolg `scene.start('game', { online: conn })`). `Einstellungen` wechselt auf die Einstellungsseite.
4. Einstellungsseite: Einträge `Lautstärke: ◄ 70 % ►` (links/rechts bzw. Gamepad links/rechts ändert um 10, spielt zur Rückmeldung den Ton `pickup`), `Ton: an/aus` (bestätigen schaltet `sfx.toggleMute()`), `Steuerung anzeigen` (zeigt einen Textblock mit den Belegungen für Tastatur 1, Tastatur 2, Gamepad an derselben Stelle; erneutes Bestätigen blendet ihn aus) und `Zurück`. `Esc` oder B geht zurück zur Hauptseite. Der Steuerungstext wird aus `KEYBOARD_LAYOUTS` und den Beschriftungen in `sources.ts` zusammengesetzt, nicht von Hand getippt, damit er mit der Belegung übereinstimmt (siehe `LobbyScene`/`sources.ts` für die Quellen; falls Beschriftungen nur in Quelltexten stehen, die rein sind, exportiere eine reine Funktion `controlLines(): string[]` in `menuModel.ts` oder `sources.ts` und teste sie).
5. `BootScene` startet nach dem Backen `menu` statt `lobby`. `main.ts`: `scene: [BootScene, MenuScene, LobbyScene, GameScene]`.
6. `LobbyScene`: `Esc` oder Gamepad-B wechselt zu `menu`. Die Taste `O` und der Online-Code entfallen (der Importweg zu `onlineMenu` in dieser Datei fällt weg). Die Hinweiszeile "Online spielen: Taste O" entfällt, dafür "Zurück: Esc". Die Testhilfen `?solo=1` und `?players=N` bleiben unverändert und überspringen das Menü.
7. Texte in der `LobbyScene`-Meldung `notice` bleiben erhalten; Meldungen nach Verbindungsverlust gehen künftig an `menu` (`this.scene.start('menu', { notice })`), siehe Task 4.

- [ ] **Step 1: `menuModel.test.ts` schreiben** (Konstruktor wirft bei leerer Liste; Start bei 0; `move(1)` bis zum Ende und zyklisch zurück; `move(-1)` von 0 geht zum letzten; `activate()` liefert die `id`; `select` mit gültigem und ungültigem Index (`-1`, `n`, `NaN`, `1.5` bleiben wirkungslos); falls `controlLines` eingeführt wird: enthält je Tastatur-Layout eine Zeile mit dem Namen aus `KEYBOARD_LAYOUTS`). Fehlschlag sehen, `menuModel.ts` implementieren, grün.
- [ ] **Step 2: `sfx.ts` anlegen, `GameScene` umstellen** (Verhalten unverändert, `npm test` grün).
- [ ] **Step 3: `MenuScene`, `BootScene`, `main.ts`, `LobbyScene` umsetzen.** Keine Phaser-Tests; der Controller macht einen Handtest.
- [ ] **Step 4: `npm run typecheck`, `npm test`, `npm run build` grün. Commit** `feat(client): add main menu and settings screen`.

---

### Task 3: Ergebnisbildschirm

**Files:**
- Modify: `packages/client/src/text.ts`, `packages/client/src/hud.ts`, `packages/client/src/scenes/GameScene.ts`
- Test: `packages/client/test/text.test.ts` (erweitern)

**Interfaces:**
- Consumes: `ranking(state)` aus core (liefert `RankEntry[]` mit `id` und `money`, absteigend), `formatMoney`, `playerName`, `KeyLabels`.
- Produces:
  - `interface ResultRow { place: number; id: string; name: string; money: number; isWinner: boolean; isViewer: boolean }`
  - `resultRows(state: GameState, viewerId: string, nameOf?: (id: string) => string): ResultRow[]`: Platz gemäß Rangliste; gleiches Geld teilt sich den Platz (zwei Spieler mit gleichem Betrag auf Platz 1 sind beide `isWinner`; der nächste Platz folgt wie bei Wettkämpfen, also 1, 1, 3); `isViewer` für `viewerId`; Namen werden auf höchstens 16 Zeichen gekürzt.
  - `resultFooter(role: 'local' | 'host' | 'guest', labels: KeyLabels): string[]`: lokal und Host: `["Neue Runde: R oder <labels.action>", "Menü: Esc"]`; Gast: `["Warte auf den Host…", "Menü: Esc"]`.
  - Der bisherige `resultLines` bleibt für Rückwärtskompatibilität bestehen, wird aber nicht mehr vom HUD benutzt; entferne ihn samt seinen Tests nur, wenn nichts mehr darauf zeigt (`grep`), sonst lass ihn.
  - `PlayerHud` bekommt anstelle von `banner` ein Ergebnisfeld: `ResultsPanel` (in `hud.ts`, Phaser): dunkles Rechteck mittig, Überschrift "Runde vorbei!" (24 px), pro `ResultRow` ein Text (16 px, bis 8 Zeilen) in der Spielerfarbe (Farbe über eine neue Funktion `colorOf(id)`, die dem HUD-Konstruktor als letzter optionaler Parameter übergeben wird; Vorgabe weiß), Sieger mit `★ ` davor, eigener Platz mit `> ` davor, Fußzeile aus `resultFooter` (14 px, grau). Sichtbar nur bei `state.phase === 'ended'`. Die Größe des Rechtecks passt sich der Zeilenzahl an und bleibt im Viewport (bei engen Splitscreen-Viewports Schrift nicht kleiner machen, sondern das Feld auf Viewport-Breite minus 16 begrenzen).
  - `PlayerHud.update(state, p)` bestimmt die Rolle: `local`, wenn die Verbindung lokal ist; `host`/`guest` online. Dazu bekommt der Konstruktor einen `role: () => 'local' | 'host' | 'guest'` (Funktion, weil sich der Host ändern kann).
- Änderungen `GameScene`: Beim Rundenende reagiert `Esc` (Taste `ESC`, wie `restartKey` per `JustDown` jeden Frame abgefragt, Druck aus der Spielphase wird verworfen): online `this.online.close()` und `scene.start('menu')`, lokal `scene.start('menu')`. Gamepad-B am Rundenende bewirkt dasselbe (Flanke über die vorhandene Eingabequelle `confirmPressed`-ähnlich lösen, falls es dort keinen B-Abbruch gibt: einfache Flankenerkennung über `this.input.gamepad` im Szenen-Update, nur nach `RESTART_DELAY_MS`). Weiter gilt: `R` oder Bestätigen löst die neue Runde aus (online nur der Host).

- [ ] **Step 1: Failing tests** in `text.test.ts`: `resultRows` für 1, 2 und 8 Spieler; Gleichstand (1, 1, 3); alle null Euro (alle Platz 1); `isViewer` genau einmal gesetzt; unbekannte `viewerId` gibt nie `isViewer`; langer Name wird gekürzt; `resultFooter` je Rolle.
- [ ] **Step 2: Implementieren** (`text.ts`, `hud.ts`, `GameScene.ts`).
- [ ] **Step 3: `typecheck`, `test`, `build` grün. Handtest durch den Controller** (lokal Rundenende mit 2 Spielern, Esc geht ins Menü, R startet neu; online mit 2 Tabs Host/Gast). Commit `feat(client): add results panel and menu exit at round end`.

---

### Task 4: Automatische Wiederverbindung

**Files:**
- Create: `packages/client/src/reconnect.ts`
- Modify: `packages/client/src/online.ts`, `packages/client/src/scenes/GameScene.ts`
- Test: `packages/client/test/reconnect.test.ts`, `packages/client/test/online.test.ts` (erweitern)

**Interfaces:**
- Consumes: `OnlineConnection` (`room`, `you`, `token`, `roster`, `connect`, `join`, `onClosed`, `onError`, `onStart`), `ErrorCode`.
- Produces:
  - `reconnect.ts` (rein): Konstanten `ATTEMPT_WINDOW_MS = 30_000`, `RETRY_EVERY_MS = 2_000`, `FATAL_CODES: ErrorCode[] = ['name_taken', 'room_not_found', 'not_in_room', 'already_started', 'room_full', 'bad_message']`.
    `type ReconnectPhase = 'trying' | 'asking' | 'gave_up'`.
    `class ReconnectPlan { constructor(); phase: ReconnectPhase; elapsedMs: number; update(dtMs: number): 'attempt' | null; continueTrying(): void; giveUp(): void; fatal(code: ErrorCode): boolean; remainingMs(): number }`.
    Regeln: Start in `trying`, `elapsedMs = 0`, der erste `update` liefert sofort `'attempt'`. Danach `'attempt'` nach jeweils `RETRY_EVERY_MS` (nicht öfter, auch nicht bei großem `dtMs`: höchstens ein `'attempt'` pro Aufruf). Wenn `elapsedMs >= ATTEMPT_WINDOW_MS` wechselt die Phase zu `asking` (kein Versuch mehr, `update` liefert `null`, die Zeit läuft nicht weiter). `continueTrying()` aus `asking` setzt `elapsedMs = 0` und `trying` (der nächste `update` versucht sofort). `giveUp()` setzt `gave_up`. `fatal(code)` gibt `true` und setzt `gave_up`, wenn `code` in `FATAL_CODES` liegt, sonst `false` und ändert nichts. `remainingMs()` ist `max(0, ATTEMPT_WINDOW_MS - elapsedMs)` in `trying`, sonst 0. `dtMs` nicht endlich oder negativ zählt als 0.
  - `OnlineConnection` (Änderungen):
    - merkt sich in `create(name)` und `join(room, name, token?)` den Namen (`lastName`), neues Feld nur lesbar über `playerName(): string`.
    - `reopen(): void`: öffnet über dieselbe `factory`/`url` ein neues Socket, ersetzt `this.socket` (das alte Socket bekommt vorher `onopen/onmessage/onclose = null` und `close()`, damit sein spätes `onclose` die neue Verbindung nicht stört), setzt `status = 'connecting'`, und sendet nach `onopen` automatisch `join(this.room, this.lastName, this.token)`. Wirft die `factory`, wird `status = 'closed'` und der Fehler an den Aufrufer weitergereicht. `reopen()` ohne `room`, `lastName` oder `token` wirft einen Fehler.
    - Der Zustand (`map`, `buffer`, `rendered`, `you`, `roster`) bleibt beim Wiederöffnen erhalten, damit die Szene den letzten Zustand weiter anzeigen kann. Erst `start` vom Server ersetzt ihn (das passiert bereits).
    - Ein Abbruch eines Socket, das bereits ersetzt wurde, ruft `onClosed` nicht mehr auf (Wächter über Vergleich `this.socket === socket`, auch für das erste Socket in `connect()`).
    - Eingabe-Heartbeat und Sequenz: `sendInputIfNeeded` sendet nur bei `status === 'open'` (besteht schon). Nach der Rückkehr sendet der Client als Erstes wieder eine Eingabe (`lastSent = null` im `start`-Zweig, besteht schon).
  - `GameScene` (Änderungen, nur online): `online.onClosed` startet nicht mehr sofort das Menü, sondern legt einen `ReconnectPlan` an und zeigt ein UI-Overlay (Text, mittig, in der UI-Kamera des lokalen Spielers, also über das HUD-Objektmodell: ein weiterer `Text` mit `setScrollFactor(0)`, den nur die UI-Kamera zeichnet). Im `update` wird `plan.update(delta)` ausgewertet: bei `'attempt'` `online.reopen()` (Fehler beim Öffnen fangen und weiterzählen). Overlay-Text in `trying`: "Verbindung verloren, verbinde neu… (N s)"; in `asking`: "Verbindung weiterhin gestört. Weiter versuchen? Enter = Ja, Esc = Menü". Während des Wiederverbindens werden die Eingaben nicht an den Server geschickt (die Verbindung ist nicht `open`), die Welt zeigt den letzten Zustand. `online.onError` (während des Wiederverbindens) ruft `plan.fatal(code)`; bei `true` geht es mit einer passenden Meldung (`Platz im Raum nicht mehr verfügbar.`) ins Menü: `online.close(); scene.start('menu', { notice })`. Bei Erfolg schickt der Server `start`; `onStart` startet die Szene wie bisher neu (`scene.restart({ online })`), das Overlay und der Plan verschwinden dabei (beim Szenenende alles aufräumen, kein Timer läuft weiter; Plan nur in der Szene, keine globalen Timer). `Esc` in jeder Phase, in der das Overlay sichtbar ist, bricht ab und geht ins Menü (`online.close()`). `Enter` in `asking` ruft `plan.continueTrying()`. Bleibt die Verbindung zu Beginn der Szene schon `closed` (Rennen zwischen Menü und Spielszene), startet der Plan sofort.
  - Der Wächter `online.status === 'closed'` in `create()` bleibt: statt sofort ins Menü startet auch dort der Plan, aber nur, wenn `room`, `you`, `token` gesetzt sind; sonst direkt ins Menü mit Meldung.

- [ ] **Step 1: `reconnect.test.ts` zuerst** (die Regeln oben als Tests: erster Versuch sofort; 2-s-Takt mit einem Test über 10 Aufrufe à 500 ms (genau Versuche bei 0, 2000, 4000, … ms); großer `dtMs` liefert höchstens einen Versuch; Übergang nach 30 s zu `asking`; in `asking` kein Versuch; `continueTrying` startet wieder bei 0 mit sofortigem Versuch; `fatal` mit jedem Code aus `FATAL_CODES` gibt `true` und `gave_up`, mit `rate_limited` gibt `false`; `remainingMs` fällt; `NaN`-dt zählt 0).
- [ ] **Step 2: `online.test.ts` erweitern** (mit der vorhandenen Fake-Socket-Fabrik): `reopen()` öffnet ein zweites Socket und sendet nach `onopen` genau ein `join` mit `room`, Namen und Token; das alte Socket wird geschlossen; das späte `onclose` des alten Sockets setzt `status` nicht auf `closed` und ruft `onClosed` nicht; `reopen()` ohne vorheriges `joined` wirft; der gepufferte Zustand bleibt bis `start` erhalten (`getState()` liefert weiter den letzten Zustand); nach einem neuen `start` ist der Zustand ersetzt und der nächste `update` sendet sofort eine Eingabe; ein werfendes `factory` in `reopen()` setzt `status = 'closed'`.
- [ ] **Step 3: Implementieren (`reconnect.ts`, `online.ts`, `GameScene.ts`), grün.**
- [ ] **Step 4: `typecheck`, `test`, `build` grün. Handtest durch den Controller** (lokaler Server, zwei Tabs, Server-Prozess oder Netz im Spiel unterbrechen und wieder starten bzw. `ws`-Verbindung per Entwicklerwerkzeug schließen, Overlay zählt, Rückkehr klappt, nach Ablauf kommt die Frage). Commit `feat(client): reconnect automatically after a dropped connection`.

---

### Task 5: Server-Frist für die Rückkehr

**Files:**
- Modify: `packages/server/src/config.ts`, `packages/server/src/index.ts`, `README.md`
- Test: bestehende Server-Tests anpassen, falls sie `30_000` hart annehmen; neuer Test für die Auswertung von `GRACE_MS`.

**Interfaces:**
- Consumes: `SERVER_CONFIG.graceMs`, den Optionspfad, über den `startServer`/`RoomManager`/`Room` die Frist erhalten (siehe bestehende Optionen wie `roundMs` und `idleMs`).
- Produces: `SERVER_CONFIG.graceMs = 120_000`; `GRACE_MS` (Umgebungsvariable, ganze Zahl in ms, gültig ab 5000, sonst Warnung auf der Konsole und Standardwert, genau wie bei `ROUND_MS`); eine kleine reine Funktion `parseGraceMs(raw: string | undefined, fallback: number): number` in `config.ts` (oder `index.ts`, aber exportiert und getestet) mit Tests für `undefined`, `''`, `'abc'`, `'NaN'`, `'-1'`, `'4999'`, `'5000'`, `'180000'`, `'1e3'` (gleich 1000, zu klein, also Standard), Leerzeichen am Rand.

- [ ] **Step 1: Test für `parseGraceMs`, dann implementieren.**
- [ ] **Step 2:** Prüfe mit `grep` alle Stellen, an denen die Frist vorkommt (`graceMs`, `30_000`, `30000`, `30 s` in Tests, README und Kommentaren), und passe sie an. Tests, die die Frist ablaufen lassen, nutzen die injizierte Zeit und müssen mit der neuen Frist (oder einer explizit übergebenen) laufen, ohne langsamer zu werden. Dokumentiere in `README.md` den neuen Wert und die Umgebungsvariable `GRACE_MS` sowie die Folge (getrennte Figur steht bis zu 2 Minuten regungslos in der Runde). Die Client-Texte nennen keine feste Zahl.
- [ ] **Step 3: `npm test` (alle Pakete), `typecheck`, `build`, `build:server` grün. Commit** `feat(server): hold a disconnected player's seat for two minutes`.

---

### Task 6: Dokumentation und Abschluss

**Files:**
- Modify: `README.md` (Bedienung, Hauptmenü, Einstellungen, Ergebnisbildschirm, Wiederverbindung)

- [ ] **Step 1:** Beschreibe knapp: Hauptmenü und Einstellungen, Ergebnisbildschirm mit `Esc`, Wiederverbindung (30 s automatisch, danach Frage; Serverfrist 2 min), und korrigiere veraltete Sätze (zum Beispiel "Online-Menü: Taste O in der Lobby", "nicht in einem ganz neuen Tab"-Hinweis bleibt richtig). Entferne nichts, was weiter stimmt.
- [ ] **Step 2: Handtest und Abschlussprüfung durch den Controller** (siehe Tasks 2 bis 4), danach Commit `docs: describe menu, results and reconnect`.

---

## Self-Review

- **Spec-Abdeckung:** Menüs (Task 2), Ergebnisbildschirm (Task 3), Reconnect (Tasks 4, 5). Prediction entfällt bewusst.
- **Platzhalter:** Keine. Reine Logik ist mit Signaturen und Testfällen festgelegt; Phaser-Teile sind durch Verhalten und Handtest beschrieben.
- **Typkonsistenz:** `ReconnectPlan`, `ResultRow`, `MenuModel`, `reopen()`, `parseGraceMs`, `setVolume` heißen in den Tasks überall gleich. `sfx.ts` (Task 2) wird in Task 3 und 4 nicht mehr verändert. Die HUD-Änderung (Task 3) und `GameScene`-Änderungen (Task 3, 4) berühren dieselbe Datei nacheinander.
- **Review Focus:** Jede Zeile hat Tests in Task 1 bis 5 oder einen Handtest in Task 2 bis 4.
