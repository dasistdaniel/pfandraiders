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
| `Lücke` | Größter Abstand zwischen zwei Snapshots in den letzten 5 s, auch die gerade offene Lücke. Ab etwa 150 ms bleiben fremde Figuren stehen (sie laufen 100 ms verzögert). |
| `Puffer 32 (vor 2)` | Snapshots im Puffer. Die erste Zahl wird erst bei 32 gekürzt und steht deshalb fast immer auf 32. Aussagekräftig ist „vor“: die Snapshots, die noch neuer als die Anzeigezeit (Uhr − 100 ms) sind, also der Vorrat für die Interpolation fremder Figuren. Bei 0 hält oder springt die Anzeige. |
| `Frame` | Längster Abstand zwischen zwei Frames der letzten 5 s, mit derselben echten Uhr gemessen. Das Delta von Phaser ist geglättet und gedeckelt und würde Hänger verstecken. Ein hoher Wert heißt, dass der Rechner stockt, nicht das Netz. |
| `Korr` | Korrekturen der eigenen Figur pro Sekunde (Mittel über 5 s): Snapshots, deren Abweichung über der Totzone lag und die die Vorhersage verschoben haben. |
| `Sprung` | Harte Sprünge der eigenen Figur in den letzten 30 s. Liegt der Server mehr als `SNAP_DIST` (48 px) daneben, setzt der Client die Figur direkt auf die Serverposition. |
| `Fehler` | Abstand zwischen Serverposition und Vorhersage beim letzten Snapshot (px). Verglichen wird mit dem Verlauf zu der Zeit, die dem Snapshot entspricht. |
| `Glätt` | Noch nicht angezeigter Teil der Korrekturen (px). Er klingt mit 40 ms ab. |

Code: `packages/client/src/netStats.ts` (reine Klasse mit übergebener Uhr, Tests in `netStats.test.ts`), angeschlossen in `online.ts` (`enableNetStats`, `netInfo`). Der Predictor liefert nur zwei Lesewerte dazu (`lastError`, `offsetSize`); sein Verhalten ist unverändert, das prüft ein Test.

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

   - **Vorschlag:** `onSnapshot` bekommt den `tick` des Snapshots; bei gleichem ack zählt `(tick − tickDesFrischenAcks) · stepMs` statt der Ankunftszeit. Der Gewinn ist groß, die Änderung klein.
2. **Der Server nimmt pro Takt nur die letzte Eingabe** (`Room.setInput` überschreibt `m.input`). Staut sich die Leitung Client→Server, kommen gehaltene Eingaben auf einmal an und verlieren ihre Dauer. Der Server läuft dann bis zu einer Staulänge in die alte Richtung weiter. Das ist eine echte Abweichung (bei 115 px/s und 400–500 ms bis zu 50–60 px, also über `SNAP_DIST`), kein Schätzfehler; sie bleibt auch mit Befund 1 als Rest der Fehler bei neuem ack. Vorschläge, ungetestet:
   - Der Server wendet Eingaben je seq für ihre Dauer an (Eingabe mit Client-Zeit oder Dauer, kleine Warteschlange pro Spieler).
   - Mindestens: große Abweichungen über 100–150 ms ausblenden statt hart springen, und `SNAP_DIST` von 48 auf etwa 96 px erhöhen. Respawn und Neustart setzen ohnehin per `reset` zurück.
3. **Fremde Figuren:** `INTERP_DELAY_MS` = 100 ms reicht bei Jitter ±80 ms und Staus nicht („vor 0“). Vorschlag, ungetestet: eine Verzögerung, die sich nach dem gemessenen Jitter richtet, etwa `clamp(50 + 2 · Jitter, 100, 250)` ms.
4. **Snapshots sind groß:** etwa 6,3 KB JSON je Snapshot (Proxy-Zusammenfassung: 594 KiB in 94 Frames je 5 s), also rund 120 KiB/s ≈ 1 Mbit/s pro Client, unkomprimiert (`ws` ohne `perMessageDeflate`). Läuft nebenher ein Download, stehen die Snapshots in derselben vollen Warteschlange, und genau dann entstehen die Staus aus den Messungen. Vorschläge:
   - `perMessageDeflate` am Server einschalten; JSON mit vielen gleichen Schlüsseln schrumpft stark.
   - Später: unveränderte Teile (Spots, Spawn) seltener schicken oder als Delta.
5. **Sonstiges:**
   - Die Pufferlänge steht wegen `MAX_BUFFER` immer auf 32; das Overlay zeigt deshalb zusätzlich „vor“.
   - Unter Windows kommen lokal nur 16–19 Snapshots pro Sekunde an statt 20. Das liegt am Timer-Raster von `setInterval` am Server, nicht am Netz.

Nicht beobachtet: das Verhalten mit echtem Steam-Download (nur nachgestellt), mit `requestAnimationFrame` im Vordergrund, und wie stark fremde Figuren nach einem Stau springen.
