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
| `buy` | Kauf im Shop, Geld sinkt | aufsteigender Ton 400 auf 900 Hz | ca. 0,2 s | Beim Einkaufswagen ersetzt eine Datei `cart_rent` diesen Ton |
| `stealSuccess` | Du hast einen Ausgeknockten ausgeraubt (Räuber hört es) | absteigender Ton | ca. 0,3 s | Name stammt aus der Zeit vor dem Umbau, bedeutet jetzt "ausgeraubt" |
| `bite` | Du wurdest vom Hund gebissen | kurzer dumpfer Rauschstoß | ca. 0,15 s | Klingt am besten mit einem Knurren oder Bellen |
| `knockout` | Du wurdest ausgeknockt | langer, tief fallender Ton | ca. 0,7 s | |
| `punch` | Du hast geschlagen | kurzer Luftzug | ca. 0,1 s | Auch bei Fehlschlag; liegt eine Datei `punch_miss` vor, klingt `punch` nur noch bei Treffern |
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

Diese Ereignisse haben **keinen** erzeugten Klang. Ohne Datei bleiben sie stumm, mit Datei spielt das Spiel sie ab.

"Du" heißt: Online hört nur der eigene Spieler den Ton, im Splitscreen hören ihn alle Spieler am Bildschirm.

Die Spalte "Auslöser im Spiel" beschreibt, woran der Client das Ereignis erkennt. Das Spiel liefert für diese Ereignisse kein eigenes Signal. Der Client leitet sie aus Änderungen des Spielzustands oder aus Nachrichten ab (`packages/client/src/eventSounds.ts`). Deshalb klingen sie lokal, im Splitscreen und online gleich.

Weitere Regeln:

- **Ersetzen:** `punch_miss` ersetzt `punch` und `cart_rent` ersetzt `buy`, aber nur wenn es für die spezielle ID eine Datei gibt. Ohne Datei bleibt der allgemeine Ton.
- **Sperren gegen Dauerfeuer:** Jede ID hat eine Mindestpause zwischen zwei Wiedergaben (normal 80 ms, länger für Menüs, Hunde und Polizei, Lobby und Chat; Liste `MIN_GAP_MS` in `sound.ts`). Jedes Ereignis klingt höchstens einmal pro Bild.
- **Kurze Tastendrücke online:** Auslöser, die auf einen Tastendruck schauen (`spray_empty`, `search_empty`, `bag_full` am Spot), können einen sehr kurzen Druck verpassen. Das passiert, wenn der Druck zwischen zwei Server-Ständen beginnt und endet.

**Spieler und Kampf**

| ID / Dateiname | Wann | Auslöser im Spiel |
|---|---|---|
| `revive` | Du stehst nach dem Knockout wieder auf | Die Bewusstlosigkeit des eigenen Spielers endet |
| `robbed` | Du wurdest im Knockout ausgeraubt (Opfer hört es) | "ausgeraubt" springt beim ausgeknockten eigenen Spieler auf an |
| `spray_hit` | Du wurdest mit Pfefferspray getroffen und zurückgestoßen | Ein Mitspieler in der Nähe sprüht (seine Abklingzeit springt hoch) und dein Leben sinkt dabei um den Spray-Schaden. Mit Schutz: kein Ton |
| `spray_empty` | Spraytaste ohne Ladung | Spraytaste neu gedrückt, keine Ladung im Besitz |
| `punch_miss` | Schlag ohne Treffer (ersetzt `punch`, sobald die Datei da ist) | Eigene Schlag-Abklingzeit springt hoch, aber kein Mitspieler verliert Schlag-Schaden. Ein Mitspieler mit Schutz in Reichweite zählt als Treffer |
| `low_health` | Leben fällt unter 25 % (Warnung, Herzschlag o. ä.) | Leben fällt von mindestens 25 auf unter 25 (bei Bewusstsein, nicht beim Knockout), einmal je Unterschreiten |
| `eat` | Essen im Müll gefunden, heilt sofort | Zähler der Essensfunde steigt (derselbe Weg wie der Hinweis im HUD) |
| `eat_full` | Essen gefunden, aber schon satt | Wie `eat`, aber der Fund war "schon satt" |

**Suchen und Pfand**

| ID / Dateiname | Wann | Auslöser im Spiel |
|---|---|---|
| `search` | Suchen an einem Spot (**Loop**, die Datei sollte nahtlos loopen) | Läuft, solange der eigene Spieler im Modus "sucht" ist. Stoppt am Ende der Suche, beim Abbrechen, am Rundenende, in der lokalen Pause, beim Stummschalten der Effekte und beim Verlassen der Spielszene |
| `search_empty` | Spot war leer | Aktionstaste neu gedrückt, ein leerer Spot in Reichweite, kein gefüllter. Gilt nicht am Automaten und nicht mit vollem Container. Eine Suche beginnt nur an gefüllten Spots, daher klingt der Ton schon beim Drücken |
| `bag_full` | Container voll, es passt nichts mehr hinein | Der Container wird beim Aufnehmen voll, oder die Aktionstaste wird mit vollem Container an einem gefüllten Spot gedrückt |
| `deposit_start` | Abgabe am Automaten beginnt | Erste abgegebene Flasche einer Abgabe (Geld steigt, Flaschen sinken, vorher keine Abgabe) |
| `deposit_done` | Abgabe fertig (Container leer) | Abgabe leert den Container. Bei einer einzigen Flasche klingen Start und Ende zusammen |

**NPCs und Events**

| ID / Dateiname | Wann | Auslöser im Spiel |
|---|---|---|
| `dog_bark` | Ein Hund fängt an, dich zu jagen | Ein Hund wird aktiv mit dir als Ziel (vorher nicht). Höchstens alle 3 s |
| `dog_treat` | Ein Hund frisst das Leckerli | Ein Hund, der dich jagt, wird abgelenkt (Leckerli aus deinem Vorrat) |
| `siren_start` | Ein Polizist beginnt, dich zu jagen | Ein Polizist wird aktiv mit dir als Ziel. Höchstens alle 3 s. Die Kontrolle selbst bleibt `policeCheck` |
| `id_shown` | Polizist lässt dich wegen des Ausweises in Ruhe | Ein Polizist kommt in seinen Jagdradius (140 px), während du Flaschen und Ausweisdokumente hast; er jagt dich deshalb nicht. Höchstens alle 3 s |
| `zoneStart` | Event (Stadion, Konzert) beginnt, dreifaches Pfand | Eine Zone wird aktiv (für alle hörbar) |
| `zoneEnd` | Event endet | Eine aktive Zone endet (für alle hörbar) |

**Runde, Shop und Lobby**

| ID / Dateiname | Wann | Auslöser im Spiel |
|---|---|---|
| `ready` | "Bereit" im Shop gedrückt | Bereit-Zeile oder -Knopf im Shop schaltet auf bereit |
| `ready_off` | "Bereit" zurückgenommen | Bereit-Zeile oder -Knopf schaltet zurück |
| `buy_denied` | Kauf abgelehnt (zu wenig Geld, schon alles gekauft, Erst-Kundenkarte) | Der Shop lehnt schon im Client ab, ein lokaler Kauf scheitert, oder der Server meldet `cannot_buy` |
| `cart_rent` | Einkaufswagen gemietet (ersetzt `buy`, sobald die Datei da ist) | Kauf des Einkaufswagens (lokal: erfolgreicher Kauf; online: Geld sinkt und der Wagen-Bestand steigt) |
| `shop_start` | Die Shop-Phase beginnt (nach der Rangliste) | Die Shop-Szene öffnet sich (nicht, wenn sie gleich zur Endwertung oder Lobby weiterleitet) |
| `win` | Endwertung, Gesamtsieger steht fest | Die Endwertung öffnet sich. Nur online, lokal gibt es keine Endwertung |
| `join` | Ein neuer Spieler betritt die Lobby | Online: neuer oder wieder verbundener Spieler in der Spielerliste (nicht man selbst, nicht die erste Liste nach dem Beitritt). Lokal: ein Spieler tritt in der Lobby bei |
| `leave` | Ein Spieler verlässt die Lobby oder den Raum | Online: ein anderer Spieler verschwindet aus der Spielerliste oder verliert die Verbindung |
| `chat` | Neue Chatnachricht von einem anderen Spieler | Neue Chatnachricht vom Server, die nicht von dir ist (der Verlauf beim Beitritt bleibt still) |
| `chat_send` | Du hast selbst eine Nachricht gesendet | Enter im Chatfeld mit Text |
| `error` | Fehler (falsches Passwort, Raum voll, Verbindung verloren) | Fehlermeldung des Servers (außer `cannot_buy`) oder Fehlertext im Online-Dialog. Außerdem der Abbruch einer offenen Verbindung (nicht das eigene Verlassen, nicht gescheiterte Wiederverbindungsversuche) |

**Menüs**

| ID / Dateiname | Wann | Auslöser im Spiel |
|---|---|---|
| `ui_move` | Auswahl bewegen (Menü, Shop, Raumliste, Avatar-Raster) | Hauptmenü und Einstellungen (nur wenn sich die Auswahl ändert), Esc-Menü im Spiel, Shop, Rundenzeit in der lokalen Lobby, Raumliste und Tabs im Online-Dialog. Im Avatar-Raster wählt jeder Schritt sofort eine Figur, dort klingt `avatar_pick` |
| `ui_select` | Bestätigen | Menüpunkt bestätigen, Esc-Menü öffnen oder bestätigen, lokale Runde starten, Raum erstellen, beitreten, Spiel starten |
| `ui_back` | Zurück oder Abbrechen | Esc bzw. B in Menü, Lobby, Shop und Endwertung, Esc-Menü schließen, "Zurück"-Eintrag, "Abbrechen" und "Verlassen" im Online-Dialog |
| `avatar_pick` | Figur gewählt | Klick oder Pfeiltaste im Figurenraster der Online-Lobby |

## Entscheidungen

- Ordner `public/sounds` und `public/music`, Dateiname = ID.
- Alle IDs dieser Liste sind vorbereitet und haben einen Auslöser im Spiel, auch die "Weiteren Ereignisse": ohne Datei stumm, die 15 alten Effekte und die Musik behalten ohne Datei ihren erzeugten Klang.
- Musik: ein fester Loop je Zustand (`music_menu`, `music_game`, `music_ended`), kein Tempowechsel mehr, sobald eine Datei da ist.
- Formate: `.ogg`, `.mp3` und `.wav`; für Musik `.ogg` empfohlen.
