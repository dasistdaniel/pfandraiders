# Netz-Diagnose

Werkzeuge, um Ruckeln im Online-Spiel zu messen und nachzustellen: ein Overlay im Client und ein Lag-Proxy, der eine schlechte Leitung vorspielt. Wie man beides startet, steht im README unter „Netz testen“.

## Overlay (`?debug=net` oder F3)

Das Overlay erscheint nur online, klein oben rechts in der eigenen Ansicht. Mit `?debug=net` ist es von Anfang an an, F3 schaltet es während der Runde ein und aus. Ist es aus, misst der Client nichts (es gibt dann kein `NetStats`-Objekt). Der Text wird höchstens viermal pro Sekunde neu gesetzt.

Gemessen wird in echter Zeit (`performance.now()`), nicht mit der Spieluhr von `OnlineConnection`. Die läuft nur pro Frame weiter und höchstens 250 ms pro Frame, deshalb würde sie Staus verstecken.

| Zeile | Bedeutung |
|---|---|
| `RTT 123 ms (140)` | Rundreise: Zeit vom Senden der Eingabe Nr. N bis zum ersten Snapshot mit `ack >= N`. Davor steht der geglättete Wert (gleitendes Mittel, neuer Wert zählt 1/8 wie bei TCP), in Klammern der letzte Messwert. Darin stecken beide Leitungsrichtungen plus 0 bis 50 ms Warten auf den nächsten Server-Takt; direkt am lokalen Server sind es etwa 30 ms. Gemessen wird je neuem ack nur die neueste damit bestätigte Eingabe. Staut sich die Richtung Client→Server, kommen gehaltene Eingaben gebündelt an; die neueste hat dann eine kurze Rundreise, und der Stau erscheint hier zu klein (er zeigt sich unter `Lücke` und `Jitter`). |
| `Jitter` | Standardabweichung der Abstände zwischen zwei Snapshots in den letzten 5 s. Ideal ist 0 (alle 50 ms einer), unter Windows liegt der Wert durch das Timer-Raster bei etwa 5 ms. |
| `Snaps` | Snapshots, die in der letzten Sekunde angekommen sind. Soll 20 (der Server-Takt), lokal unter Windows sind es 16 bis 19. |
| `Lücke` | Größter Abstand zwischen zwei Snapshots in den letzten 5 s, auch die gerade offene Lücke. Fremde Figuren laufen `Verzög` verzögert; ist die Lücke länger, werden sie höchstens 150 ms fortgeschrieben und bleiben dann stehen (Befund 3). |
| `Puffer 32 (vor 2)` | Snapshots im Puffer. Die erste Zahl wird erst bei 32 gekürzt und steht deshalb fast immer auf 32. Aussagekräftig ist „vor“: die Snapshots, deren Tick noch nach der Anzeigezeit liegt, also der Vorrat für die Interpolation fremder Figuren. Bei 0 wird fortgeschrieben oder gehalten. |
| `Verzög` | Anzeigeverzögerung fremder Figuren und NPCs (ms). 100 auf ruhiger Leitung, bis 250 bei Jitter und Staus; wächst schnell und schrumpft mit 10 ms pro Sekunde (Befund 3). |
| `Frame` | Längster Abstand zwischen zwei Frames der letzten 5 s, mit derselben echten Uhr gemessen. Das Delta von Phaser ist geglättet und gedeckelt und würde Hänger verstecken. Ein hoher Wert heißt, dass der Rechner stockt, nicht das Netz. |
| `Korr` | Korrekturen der eigenen Figur pro Sekunde (Mittel über 5 s): Snapshots, deren Abweichung über der Totzone lag und die die Vorhersage verschoben haben. |
| `Sprung` | Harte Sprünge der eigenen Figur in den letzten 30 s. Liegt der Server mehr als `SNAP_DIST` (48 px) daneben, setzt der Client die Figur direkt auf die Serverposition. |
| `Fehler` | Abstand zwischen Serverposition und Vorhersage beim letzten Snapshot (px). Verglichen wird mit dem Verlauf zu der Zeit, die dem Snapshot entspricht. |
| `Glätt` | Noch nicht angezeigter Teil der Korrekturen (px). Er klingt mit 40 ms ab. |

Code: `packages/client/src/netStats.ts` (reine Klasse mit übergebener Uhr, Tests in `netStats.test.ts`), angeschlossen in `online.ts` (`enableNetStats`, `netInfo`). Der Predictor liefert nur zwei Lesewerte dazu (`lastError`, `offsetSize`); die Diagnose ändert sein Verhalten nicht, das prüft ein Test.

## Lag-Proxy (`scripts/lag-proxy.mjs`)

Der Proxy reicht WebSocket-Frames in beide Richtungen weiter, Text bleibt Text. Jede Richtung hat ihre eigene Leitung (`scripts/lagSchedule.mjs`, Tests in `packages/server/test/lagSchedule.test.mjs`):

- `--delay MS`: feste Verzögerung.
- `--jitter MS`: dazu gleichverteilt ±jitter (nie vor der Ankunft).
- `--burst-every MS --burst-ms MS`: alle `burst-every` ms ein Stau. Was in dieser Zeit fällig wäre, wird gehalten und am Ende auf einmal losgelassen, wie bei einem TCP-Stau (head-of-line blocking).
- `--loss-stall P`: Chance je Frame (0..1), dass ein „verlorenes Segment“ diesen Frame und alles dahinter 200 ms aufhält (TCP-Neusendung).
- `--stall-dir both|down|up`: Staus und loss-stall nur in einer Richtung (`down` = Server→Client). Standard ist `both`.
- `--preset wifi|congested|steam`. Einzelne Angaben gehen vor der Voreinstellung.
  - wifi: 20 ± 15 ms
  - congested: 80 ± 40 ms, 250 ms Stau alle 5 s, loss-stall 0,005
  - steam: 60 ± 80 ms, 400 ms Stau alle 2,5 s

Wie bei TCP wird nie umsortiert: Kein Frame geht vor seinem Vorgänger, Jitter staut sich also auf. Alle 5 s schreibt der Proxy je Richtung Frames, KiB, Ø/max zusätzliche Verzögerung und die Zahl der im Stau gehaltenen Frames.

## Befunde

Gemessen am 10.10.2026 mit dem gebauten Server (`packages/server/dist/server.cjs`, lokal, Windows 11) und dem Proxy. Zwei Wege:

- **Messbot:** der echte Client-Code (`OnlineConnection`, `Predictor`, `NetStats`) unter Node mit `tsx`, 60 Updates/s, eigene Figur im Zickzack (1 s rechts, 1 s links), ein zweiter Spieler steht still (der Server startet erst ab zwei). Je Lauf 30 s, Werte aus Proben alle 250 ms. Ein „sichtbarer Sprung“ ist ein Frame, in dem die angezeigte eigene Figur mehr als 2 px weiter springt, als sie in dieser Zeit laufen kann (115 px/s).
- **Browser:** derselbe Ablauf im eingebauten Browser mit Overlay. Der Bot war Host, der Browser trat bei. Weil der Browser im Hintergrund kein `requestAnimationFrame` liefert, wurde Phaser per `setInterval(16 ms)` über `game.loop.step()` getrieben. Die Frame-Zeit im Overlay ist dort nicht aussagekräftig.

| Lauf | RTT Ø | Jitter Ø | Lücke max | Snaps/s Ø (min) | Korr/s Ø | harte Sprünge | sichtbare Sprünge (max) |
|---|---|---|---|---|---|---|---|
| direkt, ohne Proxy | 32 ms | 6 ms | 67 ms | 18,4 (17) | 0,7 | 0 | 0 |
| wifi | 87 ms | 15 ms | 99 ms | 18,2 (17) | 0,6 | 0 | 0 |
| congested | 213 ms | 42 ms | 317 ms | 18,4 (14) | 2,7 | 0 | 5 (3 px) |
| steam (4 Läufe) | 184–196 ms | 75–84 ms | 510–560 ms | 15,8–18,5 (8–11) | 4,3–5,3 | 0–3 | 29–41 (16–79 px) |
| steam, Stau nur Server→Client | 199 ms | 80 ms | 531 ms | 15,6 (8) | 3,8 | 0 | 23 (6 px) |
| steam, Stau nur Client→Server | 178 ms | 52 ms | 194 ms | 15,4 (14) | 3,5 | 0 | 5 (3 px) |
| Beispiel 80 ± 60 ms, 500 ms Stau alle 3 s | 242 ms | 83 ms | 582 ms | 16,2 (7) | 5,7 | 4 | 46 (94 px) |
| Browser, steam, 26 s | 165–202 ms | 77–80 ms | 496–506 ms | 16–18 | 6,0–7,4 | 3 | 35 (66 px) |

Was man sieht: Bei steam springt die eigene Figur im Takt der Staus. Im Browser lagen die Sprünge bei 2,0 / 4,6 / 7,0 / 9,5 s, also alle 2,5 s, jeweils direkt nachdem der Stau die gehaltenen Snapshots auf einmal losließ. Meist sind es mehrere kleine Rucke (4–9 px) über drei, vier Frames, gelegentlich ein harter Sprung über 48 px (gemessen 52–70 px), der die Figur zurückwirft. Fremde Figuren bleiben in jedem Stau stehen („vor 0“ im Overlay), weil 100 ms Interpolationsvorrat bei 400–500 ms Lücke nicht reichen. Wie stark sie danach springen, wurde nicht gemessen.

1. **Gleiches ack wird mit der Ankunftszeit fortgeschrieben (Hauptursache der Rucke).** Eingaben gehen nur alle 100 ms hinaus, Snapshots alle 50 ms; jeder zweite Snapshot hat also dasselbe ack. Für diese rechnet `Predictor.onSnapshot` die Vergleichszeit als `fresh.at + (Ankunft − fresh.recvAt)`. Kommen nach einem Stau mehrere Snapshots auf einmal an, landen sie alle auf fast derselben Zeit im Verlauf, obwohl zwischen ihnen 50 ms Serverzeit liegen. Folgen: falsche Korrekturen, und `shiftHistory` verschiebt den Verlauf, sodass auch die folgenden Vergleiche danebenliegen. Alle protokollierten harten Sprünge bei steam (5 Stück, Stau in beiden Richtungen) kamen nach 415–550 ms Lücke und mit unverändertem ack. Snapshots mit mehr als 8 px Fehler je Lauf: 81–96 mit gleichem ack gegenüber 26–51 mit neuem (bei je 250–330 Snapshots jeder Art). Im Beispiel-Lauf (500 ms Staus) kamen die 4 harten Sprünge dagegen mit neuem ack, das um 5–6 Eingaben weitergesprungen war; das ist Befund 2. Auch sie verschwanden in der Gegenprobe, vermutlich weil der Verlauf nicht mehr durch falsche Korrekturen verschoben war.
   - **Gegenprobe** (nur im Messbot, nicht im Spiel): Mit gleichem ack wurde stattdessen über die Tick-Differenz fortgeschrieben, `fresh.at + (tick − tickBeimFrischenAck) · 50 ms`.

     | | Korr/s | harte Sprünge | sichtbare Sprünge (max) | Fehler > 8 px mit gleichem ack |
     |---|---|---|---|---|
     | steam, bisher | 4,3–5,2 | 0–1 | 33–41 (16–54 px) | 81–91 |
     | steam, Tick-Differenz | 2,1–2,6 | 0 | 7–11 (≤ 5,5 px) | 5–7 |
     | Beispiel, bisher | 5,7 | 4 | 46 (94 px) | 113 |
     | Beispiel, Tick-Differenz | 2,3 | 0 | 12 (12 px) | 25 |
     | steam, Stau nur Server→Client, bisher | 3,3–3,8 | 0 | 13–18 (≤ 5 px) | 47–62 |
     | steam, Stau nur Server→Client, Tick-Differenz | 2,2–2,3 | 0 | 11–14 (≤ 4,7 px) | 4–9 |

   - **Umgesetzt** (`fix/vorhersage-tick-ack`): `onSnapshot` bekommt den `tick` des Snapshots; bei gleichem ack zählt `fresh.at + (tick − tickDesNeuenAcks) · SERVER_STEP_MS` (50 ms) statt der Ankunftszeit. Ohne brauchbaren `tick` (fehlt, keine Zahl, nicht neuer) bleibt es bei der Ankunftszeit. Konstanten (`SNAP_DIST`, Totzonen, Gewinn) sind unverändert. Ohne Stau ändert sich praktisch nichts: Die Kennzahlen des simulierten Servers in `prediction.test.ts` (`PRED_REPORT=1`) sind gleich geblieben. Neue Tests stellen dort einen Stau von 450–550 ms in beiden Richtungen nach; vorher gab es dabei harte Sprünge und Rucke bis etwa 11 px über der Laufstrecke eines Frames, jetzt keine.
   - **Messung danach** (Messbot wie oben, gebauter Server, je 30 s; vorher = Stand vor der Änderung, am selben Tag gemessen):

     | Lauf | Korr/s | harte Sprünge | sichtbare Sprünge (max) |
     |---|---|---|---|
     | direkt, vorher | 1,7 | 0 | 5 (3 px) |
     | direkt, nachher | 1,3 | 0 | 0 |
     | congested, vorher (2 Läufe) | 2,4–3,6 | 0 | 8–26 (5–10 px) |
     | congested, nachher (2 Läufe) | 1,1–2,8 | 0 | 2–4 (2–7 px) |
     | steam, vorher (4 Läufe) | 5,1–6,5 | 1–2 je Lauf (6 gesamt) | 28–42 (38–55 px) |
     | steam, nachher (4 Läufe) | 2,1–3,8 | 0 | 3–14 (≤ 5,1 px) |

     Was bleibt, sind kleine Rucke direkt nach einem Stau, wenn das neue ack um mehrere Eingaben springt (Befund 2), und dass fremde Figuren im Stau stehen bleiben (Befund 3).
2. **Der Server nimmt pro Takt nur die letzte Eingabe** (`Room.setInput` überschreibt `m.input`). Staut sich die Leitung Client→Server, kommen gehaltene Eingaben auf einmal an und verlieren ihre Dauer. Der Server läuft dann bis zu einer Staulänge in die alte Richtung weiter. Das ist eine echte Abweichung (bei 115 px/s und 400–500 ms bis zu 50–60 px, also über `SNAP_DIST`), kein Schätzfehler; sie bleibt auch mit Befund 1 als Rest der Fehler bei neuem ack. Vorschläge, ungetestet:
   - Der Server wendet Eingaben je seq für ihre Dauer an (Eingabe mit Client-Zeit oder Dauer, kleine Warteschlange pro Spieler).
   - Mindestens: große Abweichungen über 100–150 ms ausblenden statt hart springen, und `SNAP_DIST` von 48 auf etwa 96 px erhöhen. Respawn und Neustart setzen ohnehin per `reset` zurück.
3. **Fremde Figuren:** `INTERP_DELAY_MS` = 100 ms reicht bei Jitter ±80 ms und Staus nicht („vor 0“). Vorschlag, ungetestet: eine Verzögerung, die sich nach dem gemessenen Jitter richtet, etwa `clamp(50 + 2 · Jitter, 100, 250)` ms.
   - **Umgesetzt** (`feature/adaptive-interpolation`, nur Client, Protokoll unverändert). Die eigene Figur bleibt bei der Vorhersage.
     - **Zeitachse** (`timeline.ts`): Snapshots werden über ihren Tick eingeordnet, nicht über die Ankunft. Client-Zeit eines Ticks = untere Hülle der Ankünfte (Minimum von Ankunft − Tick-Zeit über 1 s), geglättet mit höchstens 5 % Tempoänderung, Sprung erst ab 300 ms Abstand. Ein Schwall nach einem Stau drängt die Ticks deshalb nicht mehr zusammen. Die Dauer eines Ticks wird geschätzt (Gerade durch den schnellsten Snapshot je 400 ms, 3 s Fenster): Der Server tickt einmal pro `setInterval`-Aufruf, und unter Windows sind das je nach Timer-Raster 53 bis 62 ms statt 50 (Messbot: Regression über 30 s ergab 54–61 ms je Lauf, mit Hängern bis 165 ms). Mit fest 50 ms liefe die Anzeige dem Server davon.
     - **Verzögerung** (`renderDelay.ts`): Verspätung je Snapshot gegen das Minimum der letzten 300 ms, als gleitendes Mittel (1/16) = Jitter; Ziel `clamp(50 + 2 · Jitter, 100, 250)` ms. Längere Staus zählen schon während der offenen Lücke (ab 100 ms über dem erwarteten Tick, zur Hälfte). Sie wächst höchstens 0,5 ms je ms (fremde Figuren laufen dann langsamer, nie rückwärts; die Anzeigezeit ist zusätzlich monoton) und schrumpft mit 10 ms/s. Erst wenn der Takt geschätzt ist (nach 1,2 s), zählen Verspätungen.
     - **Fortschreiben** (`extrapolate.ts`): Liegt die Anzeigezeit hinter dem neuesten Snapshot, laufen fremde Spieler und NPCs mit der Geschwindigkeit der zwei neuesten Snapshots höchstens 150 ms weiter, dann halten sie. Über 300 px/s (Respawn, Teleport) wird nicht fortgeschrieben.
     - **Hintergrund-Tab**: Ohne Frames steht die Uhr. Die Zeitachse merkt sich höchstens 160 Ankünfte; kommen Snapshots über 300 ms früher als erwartet (Uhr zurückgeblieben), rastet sie neu ein und verwirft die alten Ankünfte, damit sie die Takt-Schätzung nicht verderben (Test in `online.test.ts`). Nachprüfung danach: direkt 100 ms ohne Sprünge, steam (3 Läufe) Sprung max 7–12,9 px, 6–36 sichtbar, 34–61 Frames stehend.
     - **Übergang** (`remoteBlend.ts`): Kommen nach dem Fortschreiben neue Daten, wird der Unterschied zur zuletzt gezeigten Position über 100 ms abgebaut, über 48 px wird direkt gesprungen.
     - Ruhige Leitung: Die Verzögerung bleibt bei genau 100 ms und die Anzeige entspricht der alten (Test in `online.test.ts`, auch mit 61 ms je Tick). Angepasst wurde ein bestehender Test: Ein Snapshot, der 100 ms nach dem Start ankommt, hat dort jetzt Tick 2 statt 1, und das Stehenbleiben hinter dem neuesten Snapshot ist jetzt Fortschreiben (eigene Tests).
   - **Messung** (Messbot, gebauter Server, lokal Windows 11, je 30 s ab 2 s nach dem Countdown): Der Läufer hängt direkt am Server und läuft im Zickzack (1 s rechts, 1 s links, 115 px/s), der Beobachter (echter `OnlineConnection`-Code, 16-ms-Takt mit echter Zeit) hängt am Proxy und misst, wie er den Läufer zeigt. „Sprung“ = größte Bewegung in einem Frame; „sichtbar“ = Frames, in denen die Figur mehr als 2 px weiter springt, als sie laufen kann; „steht“ = Frames ohne jede Bewegung, obwohl der Läufer auf dem Server in den letzten 400 ms lief (längste Folge in Klammern). Je zwei Läufe, vorher = Stand von `master` mit demselben Bot.

     | Lauf | Sprung max | sichtbar | steht (längste Folge) | Verzög Ø (max) |
     |---|---|---|---|---|
     | direkt, vorher | 5,8 px | 0 | 0 | 100 |
     | direkt, nachher | 6,7 px | 1 | 0 | 100 (100) |
     | wifi, vorher | 8,5–9,5 px | 7–9 | 0 | 100 |
     | wifi, nachher | 5,5–6,5 px | 1–3 | 0 | 100–101 (112) |
     | congested, vorher | 19–27 px | 69–78 | 51–58 (6–8) | 100 |
     | congested, nachher | 4,4–7,5 px | 0–6 | 9–13 (6–8) | 166–172 (202) |
     | steam, vorher | 42,5–52 px | 125–133 | 243–267 (20–21) | 100 |
     | steam, nachher | 8,9–9,0 px | 20–22 | 43–54 (8–10) | 239 (250) |

     Ein Frame dauerte im Bot meist 16–31 ms (Node-Timer unter Windows); normal sind also 2–4 px je Frame. Was bleibt: Bei steam sind die Staus mit Jitter 450–550 ms lang, Verzögerung (höchstens 250) plus Fortschreiben (150) decken etwa 400 ms; danach steht die Figur einige Frames und holt über 100 ms auf (bis etwa 9 px je Frame statt 2–4). Dreht der Läufer im Stau um, läuft die fortgeschriebene Figur bis zu 150 ms in die alte Richtung weiter (bis etwa 17 px) und wird dann zurückgeblendet. Fortgeschrieben wird ohne Kollision; eine Figur kann also kurz bis zu 17 px in eine Wand laufen.
   - **Browser** (eingebauter Browser, Vite-Client über den Proxy mit steam, Läufer als Host): Das Fenster war sichtbar, `requestAnimationFrame` lief mit 60 Hz (Frame Median 16,7 ms, max 24 ms), Phaser musste nicht von Hand getrieben werden. Über 30 s: größte Bewegung je Frame 8,6 px, 30 Frames mehr als 2 px über der Laufstrecke, Verzögerung Ø 239 ms (max 250); das Overlay zeigte `Verzög  248 ms`, „vor 4“. Gezählte Frames ohne Bewegung (63) sind dort nicht gegen den Server-Stand gefiltert und enthalten Countdown-Ende und Wände. Die Glätte selbst lässt sich aus Screenshots nicht beurteilen; das bleibt eine Messung, kein Seheindruck.
   - **Offen:** Länger als etwa 400 ms Stau überbrückt das nicht. Die Obergrenze 250 ms ließe sich anheben (mehr Verzögerung für alle fremden Figuren) oder das Fortschreiben verlängern (mehr Fehler bei Richtungswechseln). Der Server-Takt unter Windows schwankt; auf dem Linux-Server ist er vermutlich gleichmäßig, das wurde nicht gemessen.
4. **Snapshots sind groß:** etwa 6,3 KB JSON je Snapshot (Proxy-Zusammenfassung: 594 KiB in 94 Frames je 5 s), also rund 120 KiB/s ≈ 1 Mbit/s pro Client, unkomprimiert (`ws` ohne `perMessageDeflate`). Läuft nebenher ein Download, stehen die Snapshots in derselben vollen Warteschlange, und genau dann entstehen die Staus aus den Messungen. Vorschläge:
   - `perMessageDeflate` am Server einschalten; JSON mit vielen gleichen Schlüsseln schrumpft stark.
   - Später: unveränderte Teile (Spots, Spawn) seltener schicken oder als Delta.
   - **Umgesetzt** (`feature/ws-kompression`): permessage-deflate ist am Server an (`WS_DEFLATE` in `server.ts`: Stufe 1, Kontextübernahme mit 32-KB-Fenster, erst ab 256 Bytes), abschaltbar mit `WS_COMPRESSION=off`. Das Nachrichtenformat ist unverändert; ein Client, der die Erweiterung nicht anbietet, bekommt weiter unkomprimierte Frames.
   - **Messung:** 8 Clients in einem Raum, alle laufen (Richtung wechselt jede Sekunde zufällig), Server in eigenem Prozess (Quellcode mit `tsx`, Windows 11), je 15–20 s, 1–4 Läufe je Einstellung. Bytes = TCP-Bytes beim Client (`bytesRead`, mit Rahmen-Köpfen), CPU = `process.cpuUsage()` des ganzen Server-Prozesses (zlib rechnet in Hintergrund-Threads, das zählt mit). Ein Snapshot hat bei 8 Spielern etwa 9,6 KB Text (bei 2 Spielern etwa 6,1 KB).

     | Einstellung | Bytes je Snapshot auf der Leitung | Anteil | pro Client | Server-CPU (8 Clients) |
     |---|---|---|---|---|
     | aus | 9 600–9 700 | 100 % | 1,26 Mbit/s | 118–175 ms/s |
     | **Stufe 1, Kontextübernahme (gewählt)** | 420–440 | 4,5 % | 58 kbit/s | 183–247 ms/s |
     | Stufe 3, Kontextübernahme | 370–390 | 4 % | 51 kbit/s | 167–230 ms/s |
     | Stufe 6, Kontextübernahme | 196–208 | 2 % | 27 kbit/s | 215–248 ms/s |
     | Stufe 1, Fenster 16 KB | 600 | 6 % | 81 kbit/s | 184–224 ms/s |
     | Stufe 1, Fenster 8 KB | 1 210–1 250 | 13 % | 164 kbit/s | 214–219 ms/s |
     | Stufe 1/3/6 ohne Kontextübernahme | 1 280–1 420 | 13–15 % | 174–192 kbit/s | 202–261 ms/s |
     | Stufe 1/3, Fenster 4 KB, memLevel 7 | 1 380–1 430 | 15 % | 190 kbit/s | 189–263 ms/s |

     Was man sieht: Der große Gewinn kommt aus der Kontextübernahme. Ein Snapshot unterscheidet sich vom vorigen nur in wenigen Zahlen, und solange der vorige ganz im Fenster liegt (32 KB; 16 KB reicht knapp), packt zlib fast nur die Änderungen. Ohne Kontextübernahme oder mit kleinerem Fenster als ein Snapshot bleiben 13–15 %. Die Stufe spielt daneben kaum eine Rolle; Stufe 6 halbiert die ohnehin kleinen Bytes noch einmal, kostet aber eher mehr CPU. Die CPU-Werte streuen unter Windows stark (aus: 118–175 ms/s); grob kostet die Kompression 40–100 ms CPU pro Sekunde für 8 Clients, also etwa 0,3–0,6 ms je Snapshot.
   - **Speicher:** je Verbindung ein zlib-Kontext zum Packen (Fenster 32 KB, memLevel 8: etwa 256 KB) und erst, wenn der Client selbst packt, einer zum Entpacken (etwa 40 KB). Gemessen stieg der RSS des Servers mit 8 Clients von 67–69 auf 77–81 MB (darin auch die zlib-Threads). Bei der Obergrenze von 400 Verbindungen wären es rechnerisch um 120 MB; für die erwarteten Raumgrößen ist das vertretbar. Kleinere Fenster sparen Speicher, verlieren aber den Gewinn (Tabelle). `concurrencyLimit` bleibt beim Standard 10 (gleichzeitige zlib-Aufträge im Prozess).
   - **Hinter dem Nginx Proxy Manager:** nichts zu ändern. permessage-deflate handeln Browser und Server direkt aus; Nginx reicht `Sec-WebSocket-Extensions` beim Upgrade durch und danach die Frames unverändert. Prüfen in den Entwicklerwerkzeugen des Browsers (Netzwerk → WebSocket-Verbindung → Antwort-Header `Sec-WebSocket-Extensions: permessage-deflate`). Lokal geprüft im eingebauten Browser (Chromium): `extensions` = `permessage-deflate`, Snapshots kommen an und lassen sich lesen.
   - **Nebenwirkung:** `bufferedAmount` zählt bei `ws` auch Nachrichten, die noch auf die Kompression warten, und zwar mit ihrer Textgröße. Die Grenze `maxBufferedBytes` (256 KB) greift deshalb eher etwas früher als vorher; geändert wurde sie nicht.
   - **Der Lag-Proxy** (`scripts/lag-proxy.mjs`) beendet die WebSocket-Verbindung auf beiden Seiten. Seine KiB-Zusammenfassung zählt deshalb Text, nicht die Bytes auf der Leitung; zum Server hin handelt er die Kompression selbst aus, zum Client hin nicht.
   - **Offen:** Bandbreite weiter senken über Deltas oder seltener geschickte unveränderte Teile (Spots, Spawn, Zonen); das Nachrichtenformat ist dafür bisher nicht geändert.
5. **Sonstiges:**
   - Die Pufferlänge steht wegen `MAX_BUFFER` immer auf 32; das Overlay zeigt deshalb zusätzlich „vor“.
   - Unter Windows kommen lokal nur 16–19 Snapshots pro Sekunde an statt 20. Das liegt am Timer-Raster von `setInterval` am Server, nicht am Netz.

Nicht beobachtet: das Verhalten mit echtem Steam-Download (nur nachgestellt). Wie stark fremde Figuren nach einem Stau springen, steht jetzt unter Befund 3.
