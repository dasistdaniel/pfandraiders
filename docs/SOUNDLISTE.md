# PfandRaiders: Soundliste

Verbindliche Liste aller Audio-IDs. Ohne eigene Dateien erzeugt das Spiel alle Klänge selbst im Browser (WebAudio, `packages/client/src/sound.ts` und `music/`). Eigene Dateien ersetzen sie Stück für Stück.

## So funktioniert es

- **Ordner:** `packages/client/public/sounds/` (Effekte) und `packages/client/public/music/` (Musik).
- **Dateiname:** genau die **ID** aus der ersten Spalte plus Endung, zum Beispiel `knockout.ogg`. Groß- und Kleinschreibung der ID zählt (`stealSuccess`, `zoneStart`).
- **Formate:** `.ogg`, `.mp3` und `.wav`. Pro ID reicht eine Datei; liegen mehrere vor, gilt `.ogg` vor `.mp3` vor `.wav`.
  - Effekte: jedes der drei Formate.
  - Musik: am besten `.ogg`, das loopt lückenlos. `.mp3` hat durch den Encoder am Anfang und Ende ein paar Millisekunden Stille, die beim Loop als kleine Lücke hörbar sein können. `.wav` loopt sauber, ist aber groß.
- **Manifest:** Beim Bauen (`npm run build`) und im Dev-Server (`npm run dev`) entsteht aus den beiden Ordnern `audio-manifest.json`. Das Spiel lädt nur Dateien, die darin stehen, und fragt nie nach fehlenden Dateien. Unbekannte Dateinamen erscheinen als Warnung in der Konsole von Build bzw. Dev-Server.
- **Laden:** nach der ersten Taste oder dem ersten Klick (Freischalten des Tons im Browser). Bis eine Datei dekodiert ist, gilt der Ersatz.
- **Fehlt eine Datei** oder ist sie kaputt:
  - die 15 Effekte unten behalten ihren erzeugten Klang,
  - die "Weiteren Ereignisse" bleiben stumm,
  - die Musik eines Zustands bleibt die erzeugte Musik.
- **Lautstärke:** Effekte laufen über den Regler "Effekt-Lautstärke" und den Schalter "Effekte", Musik über "Musik". Dateien am besten auf etwa -1 dBFS Spitze normalisieren; die Lautstärke der Datei zählt.
- **Nur CC0-Material** oder selbst erstellte Sounds. Quellen und Lizenzen kommen in `assets-src/audio/CREDITS.txt`.

Alle Effekte sind kurz und werden einmal gespielt. Einzige Ausnahme ist `search` (Loop, siehe unten).

## Effekte (15)

| ID / Dateiname | Wann | Heute | Länge | Hinweis |
|---|---|---|---|---|
| `pickup` | Eigene Flasche aus einem Spot aufgenommen, auch Rauben (ohne Raub-Ton) | kurzer heller Piep (1200 Hz) | ca. 0,1 s | Kommt sehr oft vor, darf nicht nerven. Wird auch beim Lautstärke-Ändern im Menü und beim Klick auf "Zur Lobby" gespielt |
| `pling` | Pro abgegebener Flasche am Pfandautomaten | zwei kurze Münz-Töne | ca. 0,1 s | Mehrere hintereinander (alle 90 ms). Die Tonhöhe steigt pro Flasche über 8 Stufen. Mit Datei: eine Datei, der Code ändert die Abspielrate (Dur-Pentatonik, bis 16 Halbtöne höher). Alternativ einzelne Dateien `pling_1` bis `pling_8` (je Stufe, ohne Tonhöhenänderung); fehlt eine Stufe, gilt `pling` bzw. der erzeugte Klang |
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

## Musik (3 Zustände)

Ohne Dateien ist die Musik ein erzeugter Techno-Punk mit **dynamischem Tempo** (125 bis 165 BPM je nach Rundenfortschritt) und Stimmen, die im Lauf der Runde dazukommen. Mit Datei läuft für den Zustand **ein fester Loop ohne Tempowechsel**. Beim Wechsel des Zustands wird etwa 0,5 s überblendet. Fehlt die Datei eines Zustands, läuft dort die erzeugte Musik. Der Countdown vor der Runde behält die bisherige Musik, mit "LOS!" beginnt `music_game`.

| ID / Dateiname | Wann | Heute | Hinweis |
|---|---|---|---|
| `music_menu` | Hauptmenü, Lobby, Shop | ruhiger Loop (125 BPM), ohne Schlagzeug und Gitarre | nahtloser Loop |
| `music_game` | Während der Runde | treibender Techno-Punk, Tempo steigt von 125 auf 165 BPM | nahtloser Loop mit festem Tempo |
| `music_ended` | Rundenende, Rangliste, Endwertung, lokale Pause | leiser Loop (30 % Lautstärke) | nahtloser Loop; die Datei wird **nicht** zusätzlich leiser gemacht, also gleich leise abmischen |

Die Musik hat einen eigenen Regler "Musik" und Schalter. Die Taste M schaltet durch.

## Weitere Ereignisse (nur mit Datei)

Diese Ereignisse haben **keinen** erzeugten Klang: Ohne Datei bleiben sie stumm, mit Datei spielt das Spiel sie ab. "Du" heißt: nur der eigene Spieler hört es (online), im Splitscreen alle Spieler am Bildschirm. Die Auslöser im Spiel kommen mit dem zweiten Teil (PR 2/2); Laden und Abspielen sind schon vorbereitet.

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
| `search` | Suchen an einem Spot (**Loop** während der 1,5 s, stoppt beim Ende oder Abbrechen; die Datei sollte nahtlos loopen) |
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

## Entscheidungen

- Ordner `public/sounds` und `public/music`, Dateiname = ID.
- Alle IDs dieser Liste sind vorbereitet, auch die "Weiteren Ereignisse": ohne Datei stumm, die 15 alten Effekte und die Musik behalten ohne Datei ihren erzeugten Klang.
- Musik: ein fester Loop je Zustand (`music_menu`, `music_game`, `music_ended`), kein Tempowechsel mehr, sobald eine Datei da ist.
- Formate: `.ogg`, `.mp3` und `.wav`; für Musik `.ogg` empfohlen.
