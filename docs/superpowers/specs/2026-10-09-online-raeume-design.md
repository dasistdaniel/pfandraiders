# PfandRaiders: Online-Räume, Raumliste, Avatare, Rundenzahl (Design)

Ergänzung zu `2026-10-02-pfandraiders-design.md` und `2026-10-08-serie-shop-kampf-design.md`. Erweitert das Eröffnen und Beitreten von Online-Spielen und regelt das Ende einer Serie.

## Ziel

Online-Spiele sind bequem zu eröffnen und zu finden: mit Raumname, Sichtbarkeit, optionalem Passwort und einer Raumliste. Jeder wählt seine Figur. Eine Serie hat eine feste Rundenzahl; danach landen alle wieder in derselben Lobby.

## Entscheidungen

### 1. Raum anlegen

1. `create` trägt zusätzlich: `roomName` (1 bis 24 Zeichen, Standard `"<Name>s Raum"`), `visibility` (`'public'` oder `'private'`, Standard `'public'`) und `password` (optional, 1 bis 16 Zeichen; fehlt oder leer = kein Passwort).
2. Namen und Passwort werden wie Spielernamen bereinigt (Steuer- und Formatzeichen entfernt, getrimmt). Ein Name, der danach leer ist, gilt als fehlend (Standard). Ein ungültiges Passwort (zu lang) macht die Nachricht ungültig (`bad_message`).
3. **Privat** heißt: nicht in der Raumliste. Beitritt per Code. **Passwort** ist unabhängig davon: Ein Raum mit Passwort verlangt es bei jedem Beitritt, öffentlich wie privat. Wer mit gültigem Token zurückkehrt (Reconnect), braucht das Passwort nicht.
4. Raumname, Sichtbarkeit und Passwort lassen sich nach dem Anlegen nicht ändern.
5. Das Passwort liegt nur im Speicher des Servers, wird nie an Clients gesendet und nie geloggt. Der Vergleich ist zeitkonstant (`crypto.timingSafeEqual` über SHA-256 beider Werte). Es schützt gegen zufällige Gäste, nicht gegen Angreifer, die den Verkehr mitlesen (das Spiel läuft hinter TLS am Proxy).
6. `join` trägt zusätzlich `password` (optional). Fehlt es oder ist es falsch bei einem Raum mit Passwort, antwortet der Server mit dem neuen Fehler `wrong_password`. Ein Raum ohne Passwort ignoriert das Feld.
7. Begrenzung: höchstens 5 falsche Passwörter pro Minute und Verbindung, danach `rate_limited` bis die Minute um ist.
8. Die `lobby`-Nachricht trägt zusätzlich `roomName`, `visibility` und `locked` (hat Passwort).

### 2. Raumliste

1. Neue Client-Nachricht `listRooms` (ohne Felder), jederzeit erlaubt, auch ohne Raum. Antwort: `rooms` mit `rooms: RoomInfo[]`.
2. `RoomInfo`: `code`, `name`, `host` (Name des Hosts), `players` (Anzahl in der Raumliste), `max` (8), `phase` (`'lobby'` | `'playing'` | `'shop'`), `locked` (Passwort). Nur Räume mit `visibility = 'public'`.
3. Sortierung: Lobbys mit freien Plätzen zuerst, dann nach Spielerzahl absteigend, dann nach Code. Höchstens 50 Einträge.
4. Rate-Limit: höchstens 1 `listRooms` pro Sekunde und Verbindung (`rate_limited`).
5. Die Liste enthält weder Token noch Passwörter noch Spieler-IDs.
6. Ein Raum gilt als beitretbar, wenn `phase = 'lobby'` und `players < max`. Alle anderen Zeilen werden grau angezeigt und sind nicht wählbar.

### 3. Avatar-Auswahl

1. Es gibt 24 Figuren (`ALL_CHARACTERS` des Clients: `m01..m12`, `f01..f12`). Die Kennung ist der Index 0 bis 23 in dieser Reihenfolge; die Liste steht im Core (`AVATAR_COUNT = 24`), die Namen bleiben im Client.
2. Jeder Eintrag der Raumliste trägt `avatar` (Index). Pro Raum ist jeder Index nur einmal vergeben.
3. Beim Beitritt (`create`, `join`) kann der Client `avatar` als Wunsch mitsenden. Ist er frei, bekommt der Spieler ihn, sonst den ersten freien Index in der Reihenfolge `AVATAR_DEFAULT_ORDER` (die bisherigen `PLAYER_CHARACTERS` als Indizes, dann die übrigen).
4. Neue Client-Nachricht `setAvatar` (`avatar: number`), nur in der Lobby. Ist der Index ungültig, `bad_message`; vergeben, neuer Fehler `avatar_taken`; sonst Änderung und neue `lobby`-Nachricht an alle.
5. Verlässt ein Spieler den Raum endgültig, wird seine Figur frei. Ein getrennter Spieler in der Frist behält sie.
6. Die Spielerfarbe (`color`) bleibt nach Beitrittsreihenfolge und ist unabhängig von der Figur.
7. Der Client zeigt in Spiel, Rangliste und Lobby die gewählte Figur (heute: `characterFor(index)`; neu: Figur aus `avatar`). Der Browser merkt die zuletzt gewählte Figur in `localStorage` und sendet sie als Wunsch.
8. `snap` trägt keine Avatare; der Client holt sie aus der Raumliste (`start` und `lobby`).

### 4. Rundenzahl und Serienende

1. Neue Einstellung `rounds`: 1, 3, 5 oder `0` (= offen). Standard 3. Der Host setzt sie in der Lobby mit `setRounds` (`rounds: number`), nur Host, nur Lobby; ungültige Werte `bad_message`. Der Wert steht in `lobby`, `start` und im Raum.
2. `start` trägt `rounds` und `round` (Nummer der laufenden Runde ab 1).
3. Nach jeder Runde außer der letzten: Rangliste und Shop-Phase wie bisher. Nach der **letzten** Runde (`round = rounds`): Phase `final` mit Endwertung statt Shop. Bei `rounds = 0` gibt es keine letzte Runde; der Host beendet über `endSeries` in der Shop-Phase.
4. Phase `final`: kein Shop, kein Kaufen. Die Nachricht `ranking` enthält die Rangliste nach **Gesamtverdienst** (Gesamtsieger zuerst). Der Client zeigt "Endwertung" mit Gesamtsieger.
5. Der Host kann in der Shop-Phase vorzeitig beenden (`endSeries`, wie heute): Der Raum wechselt dann in die Phase `final` mit der Endwertung der bisherigen Runden. Während einer laufenden Runde und in der Lobby geht das nicht (`wrong_phase`).
6. **Zurück in die Lobby:** In der Phase `final` sieht jeder die Endwertung. Nur der Host hat den Knopf "Zur Lobby" (`toLobby`, nur Host, nur `final`); die anderen sehen "Warte auf den Host…". Danach ist der Raum wieder in der Lobby. Es bleiben: Raumcode, Name, Sichtbarkeit, Passwort, Host, Rundenzahl, Rundenzeit, Spielerliste, Avatare und der **Chatverlauf**. Zurückgesetzt wird der Fortschritt (Geld, Taschen, Upgrades, Vorräte, Verdienste, Rundennummer). Getrennte Spieler, deren Frist abgelaufen ist, fallen heraus. Verlässt der Host den Raum in `final`, gilt die bisherige Host-Übergabe und der neue Host bekommt den Knopf.
7. Chat ist in der Lobby offen (wie heute) und bleibt es nach der Rückkehr; der Verlauf (letzte 30) wird nicht gelöscht.
8. Neue Phase: `RoomPhase = 'lobby' | 'playing' | 'shop' | 'final'`.

### 5. Online-Menü (Client)

1. Der Dialog "Online spielen" hat drei Tabs: **Raum erstellen**, **Beitreten**, **Raumliste**. Pfeiltasten wechseln den Tab (wie heute), der gewählte Tab wird gemerkt.
2. *Erstellen:* Name, Raumname, Sichtbarkeit (Umschalter Öffentlich/Privat), Passwort (optional). *Beitreten:* Code, Name, Passwort (immer sichtbar, optional; leer lassen, wenn der Raum keins hat; bei `wrong_password` Hinweis "Passwort falsch oder nötig").
3. *Raumliste:* Kopfzeile "Raumname, Host, Spieler, Status", Zeilen wie 2.2; "Aktualisieren" (Taste R oder Klick); Auswahl mit Pfeil hoch/runter, Enter oder Klick tritt bei (Name aus dem Namensfeld, das oben im Dialog für alle Tabs gilt); bei Passwort öffnet sich ein Eingabefeld. Leere Liste zeigt "Keine öffentlichen Räume".
4. Lobby: Raumname groß, darunter Code (mit "Link kopieren" wie bisher), Schloss bei Passwort; Spielerliste mit Figur, Farbe, Host-Markierung; Figurauswahl (Raster 24, vergebene grau, eigene hervorgehoben, Auswahl mit Pfeilen oder Klick); Host: Rundenzeit und Rundenzahl; Chat unverändert.
5. Der Teilen-Link füllt weiter den Code vor; ein Passwort gehört nie in den Link.

### 6. Protokoll (Überblick)

- Client an Server: `create` (+ `roomName`, `visibility`, `password`, `avatar`), `join` (+ `password`, `avatar`), `listRooms`, `setAvatar`, `setRounds`, `toLobby`.
- Server an Client: `rooms`, `lobby` (+ `roomName`, `visibility`, `locked`, `rounds`, Einträge mit `avatar`), `start` (+ `rounds`, `round`, Einträge mit `avatar`), `phase` mit `'final'`, `ranking` für Endwertung.
- Neue Fehlercodes: `wrong_password`, `avatar_taken`.
- Neue Konstanten im Core: `MAX_ROOM_NAME_LENGTH = 24`, `MAX_PASSWORD_LENGTH = 16`, `AVATAR_COUNT = 24`, `ROUNDS_CHOICES = [1, 3, 5, 0]`, `DEFAULT_ROUNDS = 3`, `MAX_LISTED_ROOMS = 50`.

### 7. Nicht Teil dieses Plans

Nachträgliches Ändern von Name, Sichtbarkeit und Passwort, Spieler entfernen (kicken), Zuschauer, Freundeslisten, Raumsuche nach Text, öffentliche Räume ohne Host (Host-Übergabe bleibt wie bisher), Passwort-Hashing auf der Platte (es gibt keine).

## Tests (Überblick)

- Core: `parseClientMessage` für `create`/`join` mit neuen Feldern (Grenzen, Bereinigung), `listRooms`, `setAvatar`, `setRounds`, `toLobby`; Konstanten.
- Server: Passwort richtig/falsch/fehlend, Reconnect ohne Passwort, Rate-Limit der Fehlversuche; Raumliste nur öffentlich, Sortierung, Grenzen, keine Geheimnisse; Avatar-Vergabe (Standard, Wunsch, vergeben, Freigabe beim Verlassen); Rundenzahl 1/3/5/offen, Endwertung nach letzter Runde, `final` ohne Shop, `toLobby` erhält Chat, Code, Host und Avatare und setzt Fortschritt zurück; vorzeitiges Ende durch den Host.
- Client: Menümodell der drei Tabs (reine Logik), Raumlisten-Zeilen (grau/beitretbar), Passwortabfrage, Avatar-Raster (vergeben/frei), Endwertungstext, Link ohne Passwort.
