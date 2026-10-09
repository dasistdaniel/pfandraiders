# PfandRaiders: Soundliste

Stand: nach PR #50. Alle Sounds sind heute im Browser erzeugt (WebAudio, `packages/client/src/sound.ts` und `music/`). Es gibt keine Audiodateien. Diese Liste ist die Vorlage für eigene Dateien.

## Vorgeschlagener Ablauf

- **Ordner:** `packages/client/public/sounds/` (Effekte) und `packages/client/public/music/` (Musik).
- **Dateiname:** genau die **ID** aus der ersten Spalte plus Endung, zum Beispiel `knockout.ogg`.
- **Formate:** `.ogg` (bevorzugt, klein) oder `.mp3`/`.wav`. Pro ID reicht eine Datei.
- **Fehlt eine Datei**, bleibt der erzeugte Klang als Ersatz. Man kann also nach und nach ersetzen.
- **Noch nicht gebaut:** Das Laden der Dateien gibt es noch nicht. Es kommt als kleiner PR, sobald du die Namen freigibst (Abschnitt "Offen").
- **Nur CC0-Material** oder selbst erstellte Sounds. Quellen und Lizenzen kommen in `assets-src/audio/CREDITS.txt`.

Alle Effekte laufen über den Regler "Effekt-Lautstärke" und den Schalter "Effekte". Sie sind kurz gehalten und werden **nicht** im Loop gespielt.

## Effekte (15)

| ID / Dateiname | Wann | Heute | Länge | Hinweis |
|---|---|---|---|---|
| `pickup` | Eigene Flasche aus einem Spot aufgenommen, auch Rauben (ohne Raub-Ton) | kurzer heller Piep (1200 Hz) | ca. 0,1 s | Kommt sehr oft vor, darf nicht nerven. Wird auch beim Lautstärke-Ändern im Menü und beim Klick auf "Zur Lobby" gespielt |
| `pling` | Pro abgegebener Flasche am Pfandautomaten | zwei kurze Münz-Töne | ca. 0,1 s | Mehrere hintereinander (alle 90 ms). Die Tonhöhe steigt pro Flasche über 8 Stufen. Mit Datei: eine Datei, der Code ändert die Abspielrate. Alternativ `pling_1` bis `pling_8` einzeln |
| `buy` | Kauf im Shop, Geld sinkt | aufsteigender Ton 400 auf 900 Hz | ca. 0,2 s | |
| `stealSuccess` | Du hast einen Ausgeknockten ausgeraubt (Räuber hört es) | absteigender Ton | ca. 0,3 s | Name stammt aus der Zeit vor dem Umbau, bedeutet jetzt "ausgeraubt" |
| `bite` | Du wurdest vom Hund gebissen | kurzer dumpfer Rauschstoß | ca. 0,15 s | Klingt am besten mit einem Knurren oder Bellen |
| `knockout` | Du wurdest ausgeknockt | langer, tief fallender Ton | ca. 0,7 s | |
| `punch` | Du hast geschlagen | kurzer Luftzug | ca. 0,1 s | Auch bei Fehlschlag |
| `hit` | Ein anderer Spieler hat dich getroffen | tiefer Schlag mit Abfall | ca. 0,2 s | |
| `spray` | Pfefferspray, du oder ein Spieler in der Nähe | zischender Rauschstoß | ca. 0,3 s | |
| `policeCheck` | Eine Polizeikontrolle beginnt | zwei abwechselnde Töne (Sirene) | ca. 0,5 s | Warnsignal, soll auffallen |
| `policeSeize` | Polizei hat dir Flaschen beschlagnahmt | drei tiefe, absteigende Töne | ca. 0,7 s | |
| `zoneAnnounced` | Ein Event (Stadion, Konzert) wurde angekündigt | drei aufsteigende Töne | ca. 0,6 s | Freundliches Signal |
| `roundEnd` | Die Runde ist vorbei | aufsteigende Fanfare | ca. 1,0 s | |
| `tick` | Countdown 5 bis 1 vor der Runde und die letzten 10 Sekunden der Runde | sehr kurzer hoher Klick | ca. 0,05 s | Kommt zehnmal in Folge, muss leise und kurz sein |
| `countdownGo` | "LOS!" nach dem Countdown | zwei hohe, helle Töne | ca. 0,4 s | |

## Musik (heute erzeugt, 3 Zustände)

Die Musik ist ein erzeugter Techno-Punk mit **dynamischem Tempo** (125 bis 165 BPM je nach Rundenfortschritt) und Stimmen, die im Lauf der Runde dazukommen. Das lässt sich mit fertigen Dateien nur teilweise nachbilden.

| ID / Dateiname | Wann | Heute | Hinweis |
|---|---|---|---|
| `music_menu` | Hauptmenü, Lobby, Shop | ruhiger Loop (125 BPM), ohne Schlagzeug und Gitarre | nahtloser Loop |
| `music_game` | Während der Runde | treibender Techno-Punk, Tempo steigt von 125 auf 165 BPM | Bei Dateien: entweder ein Loop mit festem Tempo, oder drei Stufen `music_game_1`, `_2`, `_3` (Anfang, Mitte, Schluss), die nach Rundenfortschritt überblendet werden |
| `music_ended` | Rundenende, Rangliste, Endwertung, lokale Pause | leiser Loop (30 % Lautstärke) | nahtloser Loop |

Die Musik hat einen eigenen Regler "Musik" und Schalter. Die Taste M schaltet durch.

## Weitere Ereignisse (heute ohne Ton)

Diese Ereignisse gibt es im Spiel, sie haben aber noch **keinen** Sound. Die Dateiname-Spalte ist ein Vorschlag. Sobald du eine Datei ablegst, baue ich Auslöser und Laden dazu. Fehlt die Datei, bleibt das Ereignis stumm.

**Spieler und Kampf**

| ID / Dateiname | Wann |
|---|---|
| `revive` | Du stehst nach dem Knockout wieder auf |
| `robbed` | Du wurdest im Knockout ausgeraubt (Opfer hört es) |
| `spray_hit` | Du wurdest mit Pfefferspray getroffen und zurückgestoßen |
| `spray_empty` | Spraytaste ohne Ladung |
| `punch_miss` | Schlag ohne Treffer (statt `punch`, falls du beides trennen willst) |
| `low_health` | Leben fällt unter 25 % (Warnung, Herzschlag o. ä.) |
| `eat` | Essen im Müll gefunden, heilt sofort |
| `eat_full` | Essen gefunden, aber schon satt |

**Suchen und Pfand**

| ID / Dateiname | Wann |
|---|---|
| `search` | Suchen an einem Spot (Schleife während der 1,5 s, wird beim Abbrechen gestoppt) |
| `search_empty` | Spot war leer |
| `bag_full` | Container voll, es passt nichts mehr hinein |
| `deposit_start` | Abgabe am Automaten beginnt |
| `deposit_done` | Abgabe fertig (Container leer) |

**NPCs und Events**

| ID / Dateiname | Wann |
|---|---|
| `dog_bark` | Ein Hund fängt an, dich zu jagen |
| `dog_treat` | Ein Hund frisst das Leckerli |
| `siren_start` | Ein Polizist beginnt, dich zu jagen |
| `id_shown` | Polizist lässt dich wegen des Ausweises in Ruhe |
| `zoneStart` | Event (Stadion, Konzert) beginnt, dreifaches Pfand |
| `zoneEnd` | Event endet |

**Runde, Shop und Lobby**

| ID / Dateiname | Wann |
|---|---|
| `ready` | "Bereit" im Shop gedrückt |
| `ready_off` | "Bereit" zurückgenommen |
| `buy_denied` | Kauf abgelehnt (zu wenig Geld, schon alles gekauft, Erst-Kundenkarte) |
| `cart_rent` | Einkaufswagen gemietet |
| `shop_start` | Die Shop-Phase beginnt (nach der Rangliste) |
| `win` | Endwertung, Gesamtsieger steht fest |
| `join` | Ein neuer Spieler betritt die Lobby |
| `leave` | Ein Spieler verlässt die Lobby oder den Raum |
| `chat` | Neue Chatnachricht von einem anderen Spieler |
| `chat_send` | Du hast selbst eine Nachricht gesendet |
| `error` | Fehler (falsches Passwort, Raum voll, Verbindung verloren) |

**Menüs**

| ID / Dateiname | Wann |
|---|---|
| `ui_move` | Auswahl bewegen (Menü, Shop, Raumliste, Avatar-Raster) |
| `ui_select` | Bestätigen |
| `ui_back` | Zurück oder Abbrechen |
| `avatar_pick` | Figur gewählt |

## Offen

1. Passen die Dateinamen und der Ordner (`public/sounds`, `public/music`)?
2. Welche der "Weiteren Ereignisse" willst du wirklich vertonen? Für jede Datei, die du ablegst, baue ich den Auslöser im Spiel.
3. Musik: ein fester Loop pro Zustand, oder drei Stufen für `music_game`?
4. Format: `.ogg`, `.mp3` oder beides?
