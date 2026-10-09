# Online-Räume: Kern und Server – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kern und Server können Räume mit Raumname, Sichtbarkeit und Passwort anlegen, öffentliche Räume auflisten, Figuren (Avatare) je Raum eindeutig vergeben, eine Serie mit fester Rundenzahl spielen, nach der letzten Runde (oder vorzeitig durch den Host) eine Endwertung zeigen und den Raum danach zurück in die Lobby bringen.

**Architecture:** Der Kern (`packages/core`) bekommt neue Konstanten, die Avatar-Vergabe (`avatars.ts`, rein und deterministisch), die Endwertung (`finalRanking` in `ranking.ts`) und die erweiterten Protokollnachrichten mit Prüfung in `parseClientMessage`. Der Server-Raum (`packages/server/src/room.ts`) speichert Name, Sichtbarkeit und den SHA-256-Hash des Passworts, vergibt Figuren, zählt Runden, kennt die neue Phase `final` und `toLobby`; `RoomManager` liefert die Raumliste; der Nachrichtenhandler (`server.ts`) verdrahtet die neuen Nachrichten samt Ratenbegrenzungen. Der Client wird in der letzten Aufgabe nur so weit angepasst, dass er kompiliert, seine Tests grün sind und eine Serie, die in `final` endet, sauber ins Menü führt; die Oberfläche folgt in Plan 2 (`2026-10-09-online-raeume-client.md`).

**Tech Stack:** TypeScript 5.7, npm workspaces (`@pfandraiders/core`, `@pfandraiders/server`, `@pfandraiders/client`), Vitest 3, `ws` und `node:crypto` auf dem Server, Phaser 3 im Client.

**Spec:** `docs/superpowers/specs/2026-10-09-online-raeume-design.md` (ergänzt `docs/superpowers/specs/2026-10-02-pfandraiders-design.md` und `docs/superpowers/specs/2026-10-08-serie-shop-kampf-design.md`).

**Ausgangsstand:** Branch `feature/online-raeume` (Spec-Commit `ef5f672` auf aktuellem `master`). Alle Pfade und Zeilennummern beziehen sich auf diesen Stand.

## Global Constraints

- Alle Texte für Spieler sind deutsch (Fehlermeldungen des Servers, Hinweise im Client), mit echten Umlauten.
- Code-Kommentare sind deutsch wie im bestehenden Code; Bezeichner bleiben englisch.
- Jeder Commit endet mit der Zeile `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (nach einer Leerzeile).
- `todo.md` und `idee.md` werden nie gestaged oder committet. Immer mit expliziten Pfaden `git add <pfad>` arbeiten, nie `git add -A` oder `git add .`.
- Das Verzeichnis `.claude/` wird nie gelöscht.
- Kein Python, keine Python-Skripte; Hilfsskripte nur in TypeScript (`npx tsx`).
- Der Kern bleibt deterministisch: kein `Math.random`, kein `Date.now`, keine Abhängigkeit von Iterationsreihenfolgen außer Array-Reihenfolge. `pickAvatar` und `finalRanking` sind reine Funktionen.
- Snapshots bleiben eine Allow-List je Betrachter (`packages/core/src/snapshot.ts`) und werden in diesem Plan **nicht** geändert; `snap` trägt keine Avatare (Spec §3.8).
- Das Passwort liegt nur als SHA-256-Hash im Speicher des Servers, wird nie an Clients gesendet und nie geloggt; Vergleich mit `crypto.timingSafeEqual` über SHA-256 beider Werte (Spec §1.5).
- Neue Konstanten (Spec §6): `MAX_ROOM_NAME_LENGTH = 24`, `MAX_PASSWORD_LENGTH = 16`, `AVATAR_COUNT = 24`, `ROUNDS_CHOICES = [1, 3, 5, 0]`, `DEFAULT_ROUNDS = 3`, `MAX_LISTED_ROOMS = 50`.
- Raumliste höchstens 1 `listRooms` pro Sekunde und Verbindung; höchstens 5 falsche Passwörter pro Minute und Verbindung, danach `rate_limited` (Spec §1.7, §2.4).
- Am Ende des Plans sind `npm test` und `npm run typecheck` im Repo-Wurzelverzeichnis grün (core, client, server). Core muss nach **jeder** Task grün sein (Tests und `npm run typecheck -w @pfandraiders/core`). Server-Tests (`npx vitest run` im Paket) müssen nach jeder Server-Task grün sein; der Server-**Typecheck** darf von Task 1 bis Task 6 rot sein und ist ab Task 7 grün. Client-Typecheck und Client-Tests dürfen von Task 1 bis Task 7 rot sein und sind ab Task 8 grün.
- Testbefehle (Windows, Git Bash oder PowerShell): `npx vitest run <datei>` im jeweiligen Paketordner, z. B. `cd packages/server; npx vitest run test/roomAccess.test.ts`.

## Namenstabelle (verbindlich für Plan 1 und Plan 2)

| Ort | Name | Typ / Form |
| --- | --- | --- |
| `core/src/avatars.ts` | `AVATAR_COUNT` | `24` |
| `core/src/avatars.ts` | `AVATAR_DEFAULT_ORDER` | `readonly number[]` = `[1, 14, 0, 18, 4, 22, 5, 20, 2, 3, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 17, 19, 21, 23]` |
| `core/src/avatars.ts` | `isAvatar(v: unknown): v is number` | ganze Zahl 0 bis 23 |
| `core/src/avatars.ts` | `pickAvatar(taken: ReadonlySet<number>, wish?: number): number` | Wunsch, sonst erster freier in `AVATAR_DEFAULT_ORDER` |
| `core/src/ranking.ts` | `finalRanking(entries: readonly RankEntry[]): RankEntry[]` | höchster `total` zuerst, dann id |
| `core/src/protocol.ts` | Konstanten | `MAX_ROOM_NAME_LENGTH`, `MAX_PASSWORD_LENGTH`, `ROUNDS_CHOICES`, `DEFAULT_ROUNDS`, `MAX_LISTED_ROOMS` |
| `core/src/protocol.ts` | `isRounds(v: unknown): v is number` | Wert aus `ROUNDS_CHOICES` |
| `core/src/protocol.ts` | `RoomVisibility` | `'public' \| 'private'` |
| `core/src/protocol.ts` | `isVisibility(v: unknown): v is RoomVisibility` | |
| `core/src/protocol.ts` | `RoomInfo` | `{ code: string; name: string; host: string; players: number; max: number; phase: 'lobby' \| 'playing' \| 'shop'; locked: boolean }` |
| `core/src/protocol.ts` | `defaultRoomName(name: string): string` | `"Annas Raum"`, `"Klaus' Raum"` |
| `core/src/protocol.ts` | `cleanField(raw: unknown, max: number): string \| null` | Steuer-/Formatzeichen raus, trimmen; `null` = keine Zeichenkette oder zu lang; `''` = leer |
| `core/src/protocol.ts` | `RoomPhase` | `'lobby' \| 'playing' \| 'shop' \| 'final'` |
| `core/src/protocol.ts` | `RosterEntry` | `{ id; name; color; connected: boolean; ready: boolean; avatar: number }` |
| `core/src/protocol.ts` | `ErrorCode` neu | `'wrong_password'`, `'avatar_taken'` |
| `core/src/protocol.ts` | Client → Server neu/erweitert | `create {name, roomName?, visibility?, password?, avatar?}`, `join {room, name, token?, password?, avatar?}`, `listRooms`, `setAvatar {avatar}`, `setRounds {rounds}`, `toLobby` |
| `core/src/protocol.ts` | Server → Client neu/erweitert | `lobby {room, roomName, visibility, locked, host, players, phase, roundMs, rounds}`, `start {…, rounds, round}`, `rooms {rooms: RoomInfo[]}`, `phase {phase: RoomPhase}` mit `'final'`, `ranking` (in `final`: Endwertung) |
| `server/src/room.ts` | `RoomSettings` | `{ name: string; visibility: RoomVisibility; password?: string }` |
| `server/src/room.ts` | `JoinExtras` | `{ password?: string; avatar?: number }` |
| `server/src/room.ts` | `Room` Konstruktor | `new Room(code, opts?: RoomOptions, settings?: Partial<RoomSettings>)` |
| `server/src/room.ts` | `Room` Felder | `readonly name`, `readonly visibility`, `get locked(): boolean`, `round: number` (0 in der Lobby, sonst laufende/letzte Runde ab 1) |
| `server/src/room.ts` | `Member` neu | `avatar: number` |
| `server/src/room.ts` | `Room` Methoden neu/erweitert | `join(name, conn, token?, extras?: JoinExtras)`, `hasReturnToken(token?: string): boolean`, `setAvatar(m: Member, avatar: number)`, `rounds(): number`, `setRounds(byId: string, rounds: number)`, `toLobby(byId: string)`, `endSeries(byId)` (jetzt -> `final`), `info(): RoomInfo \| null` |
| `server/src/rooms.ts` | `CreateOptions` | `{ roomName?: string; visibility?: RoomVisibility; password?: string; avatar?: number }` |
| `server/src/rooms.ts` | `RoomManager` | `create(name, conn, opts?: CreateOptions)`, `listRooms(): RoomInfo[]` |
| `server/src/config.ts` | `SERVER_CONFIG` neu | `listRoomsMinGapMs: 1000`, `wrongPasswordWindowMs: 60_000`, `wrongPasswordMax: 5` |
| `server/src/server.ts` | `Session` neu | `lastListRooms: number` (Start `-Infinity`), `passwordFails: number[]` (Zeitpunkte) |
| `client/src/reconnect.ts` | `FATAL_CODES` | zusätzlich `'wrong_password'` |

## Entscheidungen zu Lücken der Spec (Rulings)

1. **Länge von Raumname und Passwort** wird wie bei Spielernamen in UTF-16-Einheiten (`string.length`) gezählt, nach dem Bereinigen. Ein Emoji zählt also 2. Das passt zu `maxLength` der Eingabefelder im Browser.
2. **Bereinigen** von Raumname und Passwort: alle `\p{Cc}` und `\p{Cf}` entfernen, dann trimmen (`cleanField`). Spielernamen bleiben unverändert bei `cleanName` (nur C0-Steuerzeichen), um bestehende Tests nicht zu ändern.
3. **Zu langer Raumname** (nach dem Bereinigen > 24) macht die Nachricht ungültig (`bad_message`), wie beim Passwort und wie bei zu langen Spielernamen. Leerer Raumname nach dem Bereinigen = Standardname.
4. **Standard-Raumname** `defaultRoomName(name)`: `"<Name>s Raum"`; endet der Name auf s, ß, x oder z (groß/klein), dann `"<Name>' Raum"` (deutscher Genitiv-Apostroph). Längster Fall 16 + 6 = 22 Zeichen ≤ 24.
5. **Passwort wird getrimmt** (Bereinigung wie Spec §1.2), beim Anlegen und beim Beitreten gleich. `" abc "` und `"abc"` sind also dasselbe Passwort. Leeres Passwort = kein Passwort; beim Beitritt ein leeres Feld = kein Passwort angegeben.
6. **Ungültige Felder**: `visibility` vorhanden, aber nicht `'public'`/`'private'` → `bad_message`. `roomName`/`password` vorhanden, aber keine Zeichenkette → `bad_message`. Ein **ungültiger Avatar-Wunsch** in `create`/`join` (keine ganze Zahl 0 bis 23) wird still verworfen (kein Wunsch), damit ein verdorbener Wert im Browser-Speicher den Beitritt nicht blockiert. `setAvatar` mit ungültigem Index ist dagegen `bad_message` (Spec §3.4, im Parser).
7. **Reihenfolge der Prüfungen in `Room.join`**: zuerst Rückkehr mit gültigem Token (ohne Passwort), dann Passwort (`wrong_password`), dann `already_started`, `room_full`, `name_taken`. Ein abgelaufenes Token in einem Raum mit Passwort ergibt also `wrong_password`, wenn kein oder ein falsches Passwort mitkommt.
8. **Fehlversuche beim Passwort**: gleitendes Fenster von 60 s je Verbindung (`Session.passwordFails`). Sind darin schon 5 Fehlversuche, antwortet der Server auf jeden weiteren `join` in einen Raum mit Passwort mit `rate_limited` (auch bei richtigem Passwort), bis der älteste der 5 älter als 60 s ist. Rückkehr mit gültigem Token ist davon ausgenommen. Fehlendes Passwort zählt als Fehlversuch. Andere Verbindungen sind nicht betroffen.
9. **Raumliste**: nur Räume mit `visibility = 'public'` **und** mindestens einem verbundenen Mitglied (sonst gäbe es keinen Host-Namen). `players` = alle Mitglieder (auch Getrennte in der Frist). `phase` `'final'` wird als `'shop'` gemeldet (läuft, nicht beitretbar, grau). Sortierung: beitretbar (`phase = 'lobby'` und `players < max`) zuerst, dann Spielerzahl absteigend, dann Code aufsteigend; höchstens 50.
10. **`listRooms` verlängert die Leerlauffrist nicht**: Ein Socket ohne Raum wird weiter nach 30 s geschlossen (`server.ts`, `idleMs`). Der Client (Plan 2) verbindet beim nächsten Aktualisieren neu und meldet das Schließen ohne Raum nicht als Fehler.
11. **Rate-Limit `listRooms`** gilt pro Verbindung, mindestens 1000 ms zwischen zwei Antworten; zu früh = `rate_limited` mit Text "Raumliste höchstens einmal pro Sekunde.".
12. **Endwertung** (`final`): gebildet beim Eintritt in `final` aus dem Fortschritt aller aktuellen Mitglieder (`progress.earnedTotal`; `round` aus der Rangliste der letzten Runde, sonst 0; `money` aus dem Fortschritt), sortiert mit `finalRanking`. Wer in der Shop-Phase dazukam, steht mit 0 drin; wer die Serie vorher endgültig verlassen hat, fehlt. Die Endwertung ist danach eingefroren: Wer in `final` geht, bleibt in der Liste (der Client zeigt dann "(gegangen)"), wer in `final` neu beitritt, steht nicht drin. Gleichstand: gleicher Platz; alle auf Platz 1 sind Gesamtsieger (Anzeige in Plan 2).
13. **Nachrichten beim Eintritt in `final`** je Mitglied: zuerst `phase` mit `'final'`, dann `ranking` mit der Endwertung (wie `sendShop`: erst Phase, dann Rangliste), danach `lobby` an alle. Kein `shopState`.
14. **Beitritt während `final`** ist erlaubt (wie in der Shop-Phase): Der Neue bekommt `joined`, `chathistory`, `phase 'final'` und die Endwertung und wartet mit den anderen auf `toLobby`. Er hat keinen Fortschritt.
15. **Rückkehr mit Token während `final`**: wie Beitritt, also `joined`, `chathistory`, `phase 'final'`, `ranking`, `lobby`.
16. **Host in `final`**: Host bleibt "erster verbundener Spieler". Trennt sich der Host oder verlässt er den Raum, bekommt der nächste verbundene Spieler den Host und damit `toLobby`.
17. **Getrennte Spieler bei `toLobby`**: Abgelaufene fallen heraus, Getrennte in der Frist bleiben als "(getrennt)" in der Lobby und können mit dem Token zurück. `start` entfernt (wie bisher) alle Getrennten. `expireMembers` sendet nach jedem Entfernen in jeder Phase außer `playing` eine neue `lobby`-Nachricht.
18. **`chat` in `final`** bleibt geschlossen (`chat_closed`), wie in Shop und Runde. Nach `toLobby` ist er wieder offen; der Verlauf bleibt (er wird nur gelöscht, wenn niemand mehr verbunden ist, wie bisher).
19. **`start` in `final`** ergibt wie bisher `already_started`; `endSeries` in `final` ergibt `wrong_phase`; `setRoundMs` bleibt außerhalb von `playing` erlaubt (auch in `final`).
20. **`setAvatar` mit der eigenen Figur** ist `ok` ohne neue Lobby-Nachricht. `setAvatar` eines getrennten Mitglieds wird ignoriert (`ok`). Außerhalb der Lobby `wrong_phase`.
21. **Rundennummer**: `start` setzt `round = 0`, jede Runde zählt beim Start `round + 1`. `toLobby` setzt `round = 0`. Bei `rounds = 0` gibt es keine letzte Runde.
22. **Minimaler Client in Plan 1**: `phase 'final'` wird angenommen. Der Client zeigt am Rundenende weiter die Rangliste; der Schritt "weiter" führt in die Shop-Szene, die in `final` mit dem Hinweis "Die Serie ist vorbei." ins Menü zurückkehrt (wie heute bei `lobby`). Eine Wiederverbindung, die in `final` landet, führt ebenso mit diesem Hinweis ins Menü. Erst Plan 2 bringt Endwertung und "Zur Lobby". `wrong_password` gilt beim Wiederverbinden als endgültiger Fehler.
23. **Neue Felder in Server-Nachrichten sind Pflichtfelder** im Typ (der Server sendet sie immer). Bestehende Test-Literale werden in den Tasks 1 und 8 ergänzt.

## Review Focus

1. **Passwort im Klartext an einem Ort, den Clients sehen** – etwa in `lobby`, `rooms`, Fehlermeldungen oder einem Feld des `Room`, das in eine Nachricht gelangt. Erwartung: nirgends auf dem Draht. Test: Task 3 (`roomAccess.test.ts`, "never sends the password") und Task 7 (`server.test.ts`, Drahttest).
2. **Rückkehr mit Token in einen Raum mit Passwort, während die Verbindung schon gesperrt ist** – ein Spieler nach Verbindungsabbruch darf nie wegen fremder oder eigener Fehlversuche ausgesperrt werden. Test: Task 7 (`handlerRooms.test.ts`, "lets a token return through even when the connection is limited").
3. **Endwertung nach `endSeries` aus dem Shop**, wenn es keinen `state` mehr gibt und jemand erst im Shop beigetreten ist – Erwartung: alle aktuellen Mitglieder nach Gesamtverdienst, Neue mit 0. Test: Task 5 ("ranks everybody by total after endSeries, also a shop joiner").
4. **Figur eines Getrennten in der Frist** darf nicht an einen Neuen gehen; nach endgültigem Verlassen muss sie frei sein. Test: Task 4 ("keeps the avatar of a disconnected player in the grace period" und "frees the avatar when a player leaves").
5. **Raum ohne verbundene Spieler in der Raumliste** (Host-Name leer, Beitritt sinnlos) – Erwartung: nicht gelistet. Test: Task 6 ("hides private rooms and rooms without connected players").

## Dateien

| Datei | Aufgabe |
| --- | --- |
| `packages/core/src/avatars.ts` (neu) | Avatar-Konstanten, `isAvatar`, `pickAvatar` |
| `packages/core/src/index.ts` | exportiert `avatars` |
| `packages/core/src/protocol.ts` | Konstanten, Typen, Nachrichten, `parseClientMessage`, `cleanField`, `defaultRoomName`, `isRounds`, `isVisibility` |
| `packages/core/src/ranking.ts` | `finalRanking` |
| `packages/core/test/avatars.test.ts` (neu) | |
| `packages/core/test/protocolRooms.test.ts` (neu) | Parser und Konstanten für Räume, Avatare, Runden |
| `packages/core/test/finalRanking.test.ts` (neu) | |
| `packages/core/test/protocol.test.ts` | `start`-Literal um `rounds`/`round` ergänzen |
| `packages/server/src/room.ts` | Name, Sichtbarkeit, Passwort, Avatare, Runden, `final`, `toLobby`, `info` |
| `packages/server/src/rooms.ts` | `CreateOptions`, `listRooms` |
| `packages/server/src/config.ts` | neue Grenzwerte |
| `packages/server/src/server.ts` | `Session`-Felder, neue Nachrichten, Ratenbegrenzungen |
| `packages/server/test/roomAccess.test.ts` (neu) | Name, Sichtbarkeit, Passwort |
| `packages/server/test/roomAvatars.test.ts` (neu) | Avatare |
| `packages/server/test/roomFinal.test.ts` (neu) | Rundenzahl, Endwertung, `toLobby` |
| `packages/server/test/roomSeries.test.ts` | Test "end the series" auf `final` umstellen |
| `packages/server/test/rooms.test.ts` | `create` mit Optionen, `listRooms` |
| `packages/server/test/handler.test.ts` | Test "series messages" auf `final`/`toLobby` umstellen |
| `packages/server/test/handlerRooms.test.ts` (neu) | Handler: create/join, Passwort-Limit, Raumliste, setAvatar, setRounds, toLobby |
| `packages/server/test/server.test.ts` | Drahttest Passwort und Raumliste |
| `packages/client/src/onlineMenu.ts` | Fehlertexte für neue Codes |
| `packages/client/src/online.ts` | `phase 'final'` annehmen |
| `packages/client/src/reconnect.ts` | `wrong_password` endgültig |
| `packages/client/src/scenes/ShopScene.ts` | `final` führt ins Menü |
| `packages/client/src/scenes/GameScene.ts` | Wiederverbindung in `final` führt ins Menü |
| `packages/client/test/online.test.ts`, `chatLogic.test.ts`, `reconnect.test.ts` | Literale und neue Tests |

---

### Task 1: Protokoll und Avatare im Kern

**Files:**
- Create: `packages/core/src/avatars.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/src/protocol.ts` (ganze Datei, Abschnitte unten)
- Create: `packages/core/test/avatars.test.ts`
- Create: `packages/core/test/protocolRooms.test.ts`
- Modify: `packages/core/test/protocol.test.ts:90-95` (`start`-Literal)

**Interfaces:**
- Consumes: bestehendes `parseClientMessage`, `cleanName`, `cleanRoom` in `protocol.ts`.
- Produces: alles aus der Namenstabelle unter `core/src/avatars.ts` und `core/src/protocol.ts`.

- [ ] **Step 1: Failing tests für Avatare schreiben**

`packages/core/test/avatars.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { AVATAR_COUNT, AVATAR_DEFAULT_ORDER, isAvatar, pickAvatar } from '../src/avatars';

describe('avatars', () => {
  it('has 24 avatars and a default order that is a permutation of 0..23', () => {
    expect(AVATAR_COUNT).toBe(24);
    expect(AVATAR_DEFAULT_ORDER).toHaveLength(24);
    expect([...AVATAR_DEFAULT_ORDER].sort((a, b) => a - b)).toEqual(Array.from({ length: 24 }, (_, i) => i));
    // die bisherigen PLAYER_CHARACTERS m02, f03, m01, f07, m05, f11, m06, f09 als Indizes
    expect(AVATAR_DEFAULT_ORDER.slice(0, 8)).toEqual([1, 14, 0, 18, 4, 22, 5, 20]);
  });

  it('accepts only integers from 0 to 23', () => {
    for (const ok of [0, 1, 23]) expect(isAvatar(ok)).toBe(true);
    for (const bad of [-1, 24, 1.5, NaN, Infinity, '3', null, undefined]) expect(isAvatar(bad)).toBe(false);
  });

  it('gives the wish when it is valid and free', () => {
    expect(pickAvatar(new Set(), 7)).toBe(7);
    expect(pickAvatar(new Set([1, 14]), 0)).toBe(0);
  });

  it('falls back to the first free avatar in the default order', () => {
    expect(pickAvatar(new Set())).toBe(1);
    expect(pickAvatar(new Set([1]))).toBe(14);
    expect(pickAvatar(new Set([1, 14]), 1)).toBe(0);
    expect(pickAvatar(new Set(), 99)).toBe(1);
    expect(pickAvatar(new Set(), -1)).toBe(1);
  });

  it('never fails, even when everything is taken', () => {
    expect(pickAvatar(new Set(AVATAR_DEFAULT_ORDER))).toBe(1);
  });
});
```

- [ ] **Step 2: Failing tests für das Protokoll schreiben**

`packages/core/test/protocolRooms.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  cleanField,
  DEFAULT_ROUNDS,
  defaultRoomName,
  isRounds,
  isVisibility,
  MAX_LISTED_ROOMS,
  MAX_PASSWORD_LENGTH,
  MAX_ROOM_NAME_LENGTH,
  parseClientMessage,
  ROUNDS_CHOICES,
} from '../src/protocol';

describe('room constants', () => {
  it('has the values of the spec', () => {
    expect(MAX_ROOM_NAME_LENGTH).toBe(24);
    expect(MAX_PASSWORD_LENGTH).toBe(16);
    expect(ROUNDS_CHOICES).toEqual([1, 3, 5, 0]);
    expect(DEFAULT_ROUNDS).toBe(3);
    expect(MAX_LISTED_ROOMS).toBe(50);
  });

  it('knows valid round counts and visibilities', () => {
    for (const r of [1, 3, 5, 0]) expect(isRounds(r)).toBe(true);
    for (const r of [2, 4, -1, 1.5, '3', null]) expect(isRounds(r)).toBe(false);
    expect(isVisibility('public')).toBe(true);
    expect(isVisibility('private')).toBe(true);
    expect(isVisibility('PUBLIC')).toBe(false);
    expect(isVisibility(undefined)).toBe(false);
  });
});

describe('defaultRoomName', () => {
  it('uses the German genitive', () => {
    expect(defaultRoomName('Anna')).toBe('Annas Raum');
    expect(defaultRoomName('Klaus')).toBe("Klaus' Raum");
    expect(defaultRoomName('Max')).toBe("Max' Raum");
    expect(defaultRoomName('Fritz')).toBe("Fritz' Raum");
    expect(defaultRoomName('Strauß')).toBe("Strauß' Raum");
    expect(defaultRoomName('JONAS')).toBe("JONAS' Raum");
  });

  it('stays within the room name limit for the longest player name', () => {
    expect(defaultRoomName('x'.repeat(16)).length).toBeLessThanOrEqual(MAX_ROOM_NAME_LENGTH);
  });
});

describe('cleanField', () => {
  it('removes control and format characters and trims', () => {
    expect(cleanField('  Bude​ 1\n ', 24)).toBe('Bude 1');
    expect(cleanField('‮abc', 24)).toBe('abc');
  });

  it('returns an empty string for blank input and null for non-strings or too long text', () => {
    expect(cleanField('   ', 24)).toBe('');
    expect(cleanField(5, 24)).toBeNull();
    expect(cleanField('x'.repeat(25), 24)).toBeNull();
    expect(cleanField('x'.repeat(24), 24)).toBe('x'.repeat(24));
  });

  it('counts UTF-16 units like player names, so an emoji counts twice', () => {
    expect(cleanField('😀'.repeat(12), 24)).toBe('😀'.repeat(12));
    expect(cleanField('😀'.repeat(13), 24)).toBeNull();
  });
});

describe('parseClientMessage: create', () => {
  it('keeps the old form without new fields', () => {
    expect(parseClientMessage({ t: 'create', name: 'Anna' })).toEqual({ t: 'create', name: 'Anna' });
  });

  it('accepts room name, visibility, password and avatar', () => {
    expect(
      parseClientMessage({ t: 'create', name: 'Anna', roomName: ' Bude ', visibility: 'private', password: ' pw ', avatar: 3 }),
    ).toEqual({ t: 'create', name: 'Anna', roomName: 'Bude', visibility: 'private', password: 'pw', avatar: 3 });
  });

  it('treats an empty room name and an empty password as missing', () => {
    expect(parseClientMessage({ t: 'create', name: 'Anna', roomName: ' ​ ', password: '  ' })).toEqual({ t: 'create', name: 'Anna' });
  });

  it('rejects a too long room name or password and wrong types', () => {
    expect(parseClientMessage({ t: 'create', name: 'Anna', roomName: 'x'.repeat(25) })).toBeNull();
    expect(parseClientMessage({ t: 'create', name: 'Anna', password: 'x'.repeat(17) })).toBeNull();
    expect(parseClientMessage({ t: 'create', name: 'Anna', roomName: 5 })).toBeNull();
    expect(parseClientMessage({ t: 'create', name: 'Anna', password: false })).toBeNull();
    expect(parseClientMessage({ t: 'create', name: 'Anna', visibility: 'secret' })).toBeNull();
  });

  it('accepts exactly 24 and 16 characters', () => {
    const msg = parseClientMessage({ t: 'create', name: 'Anna', roomName: 'r'.repeat(24), password: 'p'.repeat(16) });
    expect(msg).toEqual({ t: 'create', name: 'Anna', roomName: 'r'.repeat(24), password: 'p'.repeat(16) });
  });

  it('drops an invalid avatar wish instead of rejecting the message', () => {
    for (const avatar of [24, -1, 2.5, '3', null]) {
      expect(parseClientMessage({ t: 'create', name: 'Anna', avatar })).toEqual({ t: 'create', name: 'Anna' });
    }
  });
});

describe('parseClientMessage: join', () => {
  it('accepts password and avatar next to the token', () => {
    expect(parseClientMessage({ t: 'join', room: 'abcd', name: 'Bo', token: 't', password: ' pw ', avatar: 0 })).toEqual({
      t: 'join',
      room: 'ABCD',
      name: 'Bo',
      token: 't',
      password: 'pw',
      avatar: 0,
    });
  });

  it('treats an empty password as missing and rejects a too long one', () => {
    expect(parseClientMessage({ t: 'join', room: 'ABCD', name: 'Bo', password: '' })).toEqual({ t: 'join', room: 'ABCD', name: 'Bo' });
    expect(parseClientMessage({ t: 'join', room: 'ABCD', name: 'Bo', password: 'x'.repeat(17) })).toBeNull();
    expect(parseClientMessage({ t: 'join', room: 'ABCD', name: 'Bo', password: 7 })).toBeNull();
  });

  it('drops an invalid avatar wish', () => {
    expect(parseClientMessage({ t: 'join', room: 'ABCD', name: 'Bo', avatar: 40 })).toEqual({ t: 'join', room: 'ABCD', name: 'Bo' });
  });
});

describe('parseClientMessage: new messages', () => {
  it('accepts listRooms and toLobby and drops extra fields', () => {
    expect(parseClientMessage({ t: 'listRooms', junk: 1 })).toEqual({ t: 'listRooms' });
    expect(parseClientMessage({ t: 'toLobby', junk: 1 })).toEqual({ t: 'toLobby' });
  });

  it('accepts setAvatar only with an index from 0 to 23', () => {
    expect(parseClientMessage({ t: 'setAvatar', avatar: 23 })).toEqual({ t: 'setAvatar', avatar: 23 });
    for (const avatar of [24, -1, 1.5, '1', undefined]) expect(parseClientMessage({ t: 'setAvatar', avatar })).toBeNull();
  });

  it('accepts setRounds only with 1, 3, 5 or 0', () => {
    for (const rounds of [1, 3, 5, 0]) expect(parseClientMessage({ t: 'setRounds', rounds })).toEqual({ t: 'setRounds', rounds });
    for (const rounds of [2, 7, -1, '3', undefined]) expect(parseClientMessage({ t: 'setRounds', rounds })).toBeNull();
  });
});
```

- [ ] **Step 3: Tests laufen lassen und Fehlschlag sehen**

Run: `cd packages/core; npx vitest run test/avatars.test.ts test/protocolRooms.test.ts`
Expected: FAIL (`Cannot find module '../src/avatars'`, fehlende Exporte `cleanField`, `defaultRoomName` …).

- [ ] **Step 4: `avatars.ts` anlegen**

`packages/core/src/avatars.ts`:

```ts
/**
 * Figuren (Avatare) der Spieler. Die Kennung ist der Index 0 bis 23 in der Reihenfolge von ALL_CHARACTERS
 * im Client (m01..m12, f01..f12); die Namen der Bögen kennt nur der Client.
 */

/** Zahl der Figuren */
export const AVATAR_COUNT = 24;

/**
 * Vergabereihenfolge ohne (freien) Wunsch: die bisherigen PLAYER_CHARACTERS des Clients
 * (m02, f03, m01, f07, m05, f11, m06, f09) als Indizes, danach die übrigen aufsteigend.
 */
export const AVATAR_DEFAULT_ORDER: readonly number[] = [
  1, 14, 0, 18, 4, 22, 5, 20, 2, 3, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 17, 19, 21, 23,
];

/** Gültige Figur: ganze Zahl von 0 bis AVATAR_COUNT - 1. */
export function isAvatar(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < AVATAR_COUNT;
}

/**
 * Figur für einen neuen Spieler: der Wunsch, wenn er gültig und frei ist, sonst die erste freie Figur
 * in AVATAR_DEFAULT_ORDER. Sind alle vergeben (bei höchstens 8 Spielern unmöglich), die erste der Reihenfolge.
 */
export function pickAvatar(taken: ReadonlySet<number>, wish?: number): number {
  if (isAvatar(wish) && !taken.has(wish)) return wish;
  return AVATAR_DEFAULT_ORDER.find((a) => !taken.has(a)) ?? AVATAR_DEFAULT_ORDER[0];
}
```

In `packages/core/src/index.ts` nach `export * from './ranking';` einfügen:

```ts
export * from './avatars';
```

- [ ] **Step 5: `protocol.ts` erweitern**

In `packages/core/src/protocol.ts`:

a) Importe oben ergänzen (nach `import { sanitizeInput } from './sanitize';`):

```ts
import { isAvatar } from './avatars';
```

b) Nach `export const MAX_BUILD_FIELD_LENGTH = 16;` einfügen:

```ts

/** Längster Raumname nach dem Bereinigen (UTF-16-Einheiten wie bei Namen) */
export const MAX_ROOM_NAME_LENGTH = 24;
/** Längstes Raum-Passwort nach dem Bereinigen */
export const MAX_PASSWORD_LENGTH = 16;
/** Erlaubte Rundenzahlen einer Serie; 0 = offen (der Host beendet die Serie) */
export const ROUNDS_CHOICES: readonly number[] = [1, 3, 5, 0];
/** Standard-Rundenzahl */
export const DEFAULT_ROUNDS = 3;
/** Höchstens so viele Einträge hat die Raumliste */
export const MAX_LISTED_ROOMS = 50;

export function isRounds(v: unknown): v is number {
  return typeof v === 'number' && ROUNDS_CHOICES.includes(v);
}

/** public = in der Raumliste, private = nur per Code */
export type RoomVisibility = 'public' | 'private';

export function isVisibility(v: unknown): v is RoomVisibility {
  return v === 'public' || v === 'private';
}

/** Eintrag der Raumliste: ohne Token, Passwörter und Spieler-IDs. */
export interface RoomInfo {
  code: string;
  name: string;
  /** Name des Hosts */
  host: string;
  /** Mitglieder (auch getrennte in der Rückkehrfrist) */
  players: number;
  max: number;
  /** Phase 'final' wird als 'shop' gemeldet (läuft, nicht beitretbar) */
  phase: 'lobby' | 'playing' | 'shop';
  /** Raum hat ein Passwort */
  locked: boolean;
}

/** Standard-Raumname "<Name>s Raum"; auf s, ß, x, z endende Namen bekommen den Apostroph ("Klaus' Raum"). */
export function defaultRoomName(name: string): string {
  return /[sßxz]$/i.test(name) ? `${name}' Raum` : `${name}s Raum`;
}
```

c) `ErrorCode`: die letzte Zeile `| 'cannot_buy';` ersetzen durch:

```ts
  | 'cannot_buy'
  /** Raum hat ein Passwort und es fehlt oder ist falsch */
  | 'wrong_password'
  /** Figur ist im Raum schon vergeben */
  | 'avatar_taken';
```

d) `ClientMessage` vollständig ersetzen durch:

```ts
export type ClientMessage =
  /** Raum anlegen; roomName fehlt = Standardname, visibility fehlt = public, password fehlt = keins, avatar = Wunschfigur */
  | { t: 'create'; name: string; roomName?: string; visibility?: RoomVisibility; password?: string; avatar?: number }
  /** Raum betreten; password nur für Räume mit Passwort nötig (nicht bei Rückkehr mit gültigem Token) */
  | { t: 'join'; room: string; name: string; token?: string; password?: string; avatar?: number }
  /** Serie starten (nur Host, nur Lobby); roundMs optional, der Server prüft ihn gegen ROUND_MS_CHOICES */
  | { t: 'start'; roundMs?: number }
  | { t: 'input'; seq: number; input: Input }
  /** Spieler verlässt den Raum absichtlich: sein Platz wird sofort frei, keine Rückkehr mit dem Token. */
  | { t: 'leave' }
  /** Chatnachricht, nur in der Lobby */
  | { t: 'chat'; text: string }
  /** Shop-Phase: bereit oder nicht mehr bereit */
  | { t: 'ready'; ready: boolean }
  /** Shop-Phase: kaufen (Menge 1 bis 99; der Server lehnt ohne Teilkauf ab) */
  | { t: 'shopBuy'; category: ShopCategory; item: ShopItemId; qty: number }
  /** Rundenzeit setzen (nur Host, nicht während einer Runde) */
  | { t: 'setRoundMs'; roundMs: number }
  /** Serie vorzeitig beenden, weiter zur Endwertung (nur Host, nur Shop) */
  | { t: 'endSeries' }
  /** Öffentliche Räume abfragen (jederzeit, auch ohne Raum; höchstens einmal pro Sekunde) */
  | { t: 'listRooms' }
  /** Eigene Figur wählen (nur Lobby) */
  | { t: 'setAvatar'; avatar: number }
  /** Rundenzahl setzen (nur Host, nur Lobby): 1, 3, 5 oder 0 = offen */
  | { t: 'setRounds'; rounds: number }
  /** Nach der Endwertung zurück in die Lobby (nur Host, nur Phase final) */
  | { t: 'toLobby' };
```

e) `RosterEntry` um das Feld ergänzen (nach `ready: boolean;`):

```ts
  /** Figur (Index 0 bis AVATAR_COUNT - 1), im Raum eindeutig */
  avatar: number;
```

f) `RoomPhase` ersetzen durch:

```ts
/** lobby = Warteraum, playing = Runde läuft, shop = Rangliste und Einkaufen zwischen den Runden, final = Endwertung der Serie */
export type RoomPhase = 'lobby' | 'playing' | 'shop' | 'final';
```

g) In `ServerMessage` die Zeilen für `lobby` und `start` ersetzen und `rooms` ergänzen; der Kommentar zu `ranking` wird angepasst:

```ts
  | {
      t: 'lobby';
      room: string;
      roomName: string;
      visibility: RoomVisibility;
      /** Raum hat ein Passwort (das Passwort selbst wird nie gesendet) */
      locked: boolean;
      host: string;
      players: RosterEntry[];
      phase: RoomPhase;
      roundMs: number;
      /** Rundenzahl der Serie (0 = offen) */
      rounds: number;
    }
  | {
      t: 'start';
      mapId: MapId;
      map: MapData;
      you: string;
      players: RosterEntry[];
      snap: Snapshot;
      roundMs: number;
      rounds: number;
      /** Nummer der laufenden Runde ab 1 */
      round: number;
    }
```

und am Ende von `ServerMessage` (statt `| { t: 'ranking'; entries: RankEntry[] };`):

```ts
  /** Rangliste: in der Shop-Phase die der letzten Runde, in der Phase final die Endwertung nach Gesamtverdienst */
  | { t: 'ranking'; entries: RankEntry[] }
  /** Antwort auf listRooms */
  | { t: 'rooms'; rooms: RoomInfo[] };
```

h) Nach `cleanChat` (vor `function cleanName`) einfügen:

```ts
/**
 * Bereinigt Raumname und Passwort: Steuer- und Formatzeichen (\p{Cc}, \p{Cf}) entfernen, trimmen.
 * null = keine Zeichenkette oder danach länger als `max` (UTF-16-Einheiten); '' = leer (gilt als fehlend).
 */
export function cleanField(raw: unknown, max: number): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw.replace(/[\p{Cc}\p{Cf}]/gu, '').trim();
  return text.length > max ? null : text;
}

/**
 * Optionales Textfeld: fehlt = undefined (ok), ungültig = null (Nachricht verwerfen), leer = undefined.
 */
function optionalField(raw: unknown, max: number): string | undefined | null {
  if (raw === undefined) return undefined;
  const text = cleanField(raw, max);
  if (text === null) return null;
  return text === '' ? undefined : text;
}
```

i) In `parseClientMessage` die Fälle `create` und `join` ersetzen:

```ts
    case 'create': {
      const name = cleanName(m.name);
      if (name === null) return null;
      const roomName = optionalField(m.roomName, MAX_ROOM_NAME_LENGTH);
      const password = optionalField(m.password, MAX_PASSWORD_LENGTH);
      if (roomName === null || password === null) return null;
      const visibility = m.visibility;
      if (visibility !== undefined && !isVisibility(visibility)) return null;
      const msg: Extract<ClientMessage, { t: 'create' }> = { t: 'create', name };
      if (roomName !== undefined) msg.roomName = roomName;
      if (visibility !== undefined) msg.visibility = visibility;
      if (password !== undefined) msg.password = password;
      // Ungültiger Wunsch wird still verworfen (der Server vergibt dann selbst)
      if (isAvatar(m.avatar)) msg.avatar = m.avatar;
      return msg;
    }
    case 'join': {
      const name = cleanName(m.name);
      const room = cleanRoom(m.room);
      if (name === null || room === null) return null;
      const msg: Extract<ClientMessage, { t: 'join' }> = { t: 'join', room, name };
      if (m.token !== undefined) {
        if (typeof m.token !== 'string' || m.token.length === 0 || m.token.length > MAX_TOKEN_LENGTH) return null;
        msg.token = m.token;
      }
      const password = optionalField(m.password, MAX_PASSWORD_LENGTH);
      if (password === null) return null;
      if (password !== undefined) msg.password = password;
      if (isAvatar(m.avatar)) msg.avatar = m.avatar;
      return msg;
    }
```

j) In `parseClientMessage` vor `default:` einfügen:

```ts
    case 'listRooms':
      return { t: 'listRooms' };
    case 'setAvatar':
      return isAvatar(m.avatar) ? { t: 'setAvatar', avatar: m.avatar } : null;
    case 'setRounds':
      return isRounds(m.rounds) ? { t: 'setRounds', rounds: m.rounds } : null;
    case 'toLobby':
      return { t: 'toLobby' };
```

Hinweis: Die Reihenfolge der Schlüssel im Ergebnis (`t`, `room`, `name`, `token`, …) ist für `toEqual` egal; bestehende Tests mit `{ t: 'join', room, name, token }` bleiben grün.

- [ ] **Step 6: `start`-Literal im bestehenden Test ergänzen**

In `packages/core/test/protocol.test.ts` im Test `'carries the map id'` die Zeile

```ts
    const msg: ServerMessage = { t: 'start', mapId: 'retro', map: RETRO_MAP, you: 'p1', players: [], snap: {} as Snapshot, roundMs: 300_000 };
```

ersetzen durch

```ts
    const msg: ServerMessage = { t: 'start', mapId: 'retro', map: RETRO_MAP, you: 'p1', players: [], snap: {} as Snapshot, roundMs: 300_000, rounds: 3, round: 1 };
```

- [ ] **Step 7: Kern-Tests und Typecheck**

Run: `cd packages/core; npx vitest run; npx tsc --noEmit`
Expected: alle Tests PASS, Typecheck ohne Fehler.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/avatars.ts packages/core/src/index.ts packages/core/src/protocol.ts packages/core/test/avatars.test.ts packages/core/test/protocolRooms.test.ts packages/core/test/protocol.test.ts
git commit -m "feat(core): protocol for rooms, room list, avatars and round count

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Endwertung im Kern

**Files:**
- Modify: `packages/core/src/ranking.ts`
- Create: `packages/core/test/finalRanking.test.ts`

**Interfaces:**
- Consumes: `RankEntry` aus `ranking.ts`.
- Produces: `finalRanking(entries: readonly RankEntry[]): RankEntry[]` (neue Objekte, Eingabe bleibt unverändert).

- [ ] **Step 1: Failing test**

`packages/core/test/finalRanking.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { finalRanking } from '../src/ranking';
import type { RankEntry } from '../src/ranking';

const e = (id: string, total: number, round = 0, money = 0): RankEntry => ({ id, money, round, total });

describe('finalRanking', () => {
  it('sorts by total earnings, highest first', () => {
    expect(finalRanking([e('p1', 100), e('p2', 500), e('p3', 300)]).map((r) => r.id)).toEqual(['p2', 'p3', 'p1']);
  });

  it('breaks ties by id, not by round earnings or money', () => {
    expect(finalRanking([e('p3', 200, 200, 0), e('p1', 200, 0, 999)]).map((r) => r.id)).toEqual(['p1', 'p3']);
  });

  it('copies the entries and leaves the input alone', () => {
    const input = [e('p2', 1), e('p1', 2)];
    const out = finalRanking(input);
    expect(input.map((r) => r.id)).toEqual(['p2', 'p1']);
    out[0].total = 99;
    expect(input[1].total).toBe(2);
  });

  it('handles an empty list', () => {
    expect(finalRanking([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Fehlschlag sehen**

Run: `cd packages/core; npx vitest run test/finalRanking.test.ts`
Expected: FAIL (`finalRanking is not a function` bzw. fehlender Export).

- [ ] **Step 3: Implementieren**

An `packages/core/src/ranking.ts` anhängen:

```ts

/**
 * Endwertung der Serie: höchster Gesamtverdienst zuerst, bei Gleichstand nach id (deterministisch).
 * Liefert Kopien; die Eingabe bleibt unverändert.
 */
export function finalRanking(entries: readonly RankEntry[]): RankEntry[] {
  return entries
    .map((r) => ({ ...r }))
    .sort((a, b) => b.total - a.total || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
```

- [ ] **Step 4: Tests und Typecheck**

Run: `cd packages/core; npx vitest run; npx tsc --noEmit`
Expected: PASS, keine Typfehler.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/ranking.ts packages/core/test/finalRanking.test.ts
git commit -m "feat(core): final ranking by total earnings

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Raumname, Sichtbarkeit und Passwort im Server-Raum

**Files:**
- Modify: `packages/server/src/room.ts`
- Modify: `packages/server/src/rooms.ts`
- Create: `packages/server/test/roomAccess.test.ts`
- Modify: `packages/server/test/rooms.test.ts` (neuer `describe`-Block am Ende)

**Interfaces:**
- Consumes: `defaultRoomName`, `RoomVisibility` aus `@pfandraiders/core` (Task 1).
- Produces: `RoomSettings`, `JoinExtras`, `new Room(code, opts?, settings?)`, `Room.name`, `Room.visibility`, `Room.locked`, `Room.hasReturnToken(token?)`, `Room.join(name, conn, token?, extras?)`, `CreateOptions`, `RoomManager.create(name, conn, opts?)`; `lobby` trägt `roomName`, `visibility`, `locked`.

- [ ] **Step 1: Failing tests**

`packages/server/test/roomAccess.test.ts`:

```ts
import type { ServerMessage } from '@pfandraiders/core';
import { describe, expect, it } from 'vitest';
import { SERVER_CONFIG } from '../src/config';
import { Room } from '../src/room';
import type { Conn } from '../src/room';

class FakeConn implements Conn {
  messages: ServerMessage[] = [];
  send(msg: ServerMessage): void {
    this.messages.push(msg);
  }
  last<T extends ServerMessage['t']>(t: T): Extract<ServerMessage, { t: T }> {
    const all = this.messages.filter((m): m is Extract<ServerMessage, { t: T }> => m.t === t);
    return all[all.length - 1];
  }
}

function lockedRoom() {
  let time = 0;
  const room = new Room(
    'ABCD',
    { now: () => time, random: () => 0.5, roundMs: 100, countdownMs: 0 },
    { name: 'Geheimbude', visibility: 'private', password: 'geheim' },
  );
  return { room, advance: (ms: number) => (time += ms) };
}

describe('room settings', () => {
  it('has defaults when nothing is given', () => {
    const room = new Room('ABCD');
    expect(room.name).toBe('Raum ABCD');
    expect(room.visibility).toBe('public');
    expect(room.locked).toBe(false);
  });

  it('sends name, visibility and lock state with the lobby message', () => {
    const { room } = lockedRoom();
    const a = new FakeConn();
    expect(room.join('Anna', a, undefined, { password: 'geheim' }).ok).toBe(true);
    expect(a.last('lobby')).toMatchObject({ room: 'ABCD', roomName: 'Geheimbude', visibility: 'private', locked: true });
  });

  it('never sends the password to anybody', () => {
    const { room } = lockedRoom();
    const a = new FakeConn();
    const b = new FakeConn();
    room.join('Anna', a, undefined, { password: 'geheim' });
    room.join('Bob', b, undefined, { password: 'geheim' });
    room.start('p1');
    expect(JSON.stringify([...a.messages, ...b.messages])).not.toContain('geheim');
  });
});

describe('password', () => {
  it('refuses a missing or wrong password with wrong_password and changes nothing', () => {
    const { room } = lockedRoom();
    room.join('Anna', new FakeConn(), undefined, { password: 'geheim' });
    const b = new FakeConn();
    expect(room.join('Bob', b)).toMatchObject({ ok: false, code: 'wrong_password', message: 'Passwort falsch oder nötig.' });
    expect(room.join('Bob', b, undefined, { password: 'Geheim' })).toMatchObject({ ok: false, code: 'wrong_password' });
    expect(room.members.map((m) => m.name)).toEqual(['Anna']);
    expect(b.messages).toEqual([]);
  });

  it('lets a player in with the right password', () => {
    const { room } = lockedRoom();
    room.join('Anna', new FakeConn(), undefined, { password: 'geheim' });
    expect(room.join('Bob', new FakeConn(), undefined, { password: 'geheim' }).ok).toBe(true);
  });

  it('ignores a password for a room without one', () => {
    const room = new Room('ABCD');
    expect(room.join('Anna', new FakeConn(), undefined, { password: 'egal' }).ok).toBe(true);
  });

  it('checks the password before the phase: a running locked room answers wrong_password first', () => {
    const { room } = lockedRoom();
    room.join('Anna', new FakeConn(), undefined, { password: 'geheim' });
    room.join('Bob', new FakeConn(), undefined, { password: 'geheim' });
    room.start('p1');
    expect(room.join('Cara', new FakeConn())).toMatchObject({ ok: false, code: 'wrong_password' });
    expect(room.join('Cara', new FakeConn(), undefined, { password: 'geheim' })).toMatchObject({ ok: false, code: 'already_started' });
  });

  it('lets a player return with his token without the password, but not after the grace period', () => {
    const { room, advance } = lockedRoom();
    const a = new FakeConn();
    const b = new FakeConn();
    room.join('Anna', a, undefined, { password: 'geheim' });
    const bob = room.join('Bob', b, undefined, { password: 'geheim' });
    if (!bob.ok) throw new Error('join failed');
    room.start('p1');
    room.leave(b);
    expect(room.hasReturnToken(bob.value.token)).toBe(true);
    expect(room.join('Bob', new FakeConn(), bob.value.token).ok).toBe(true);
    room.leave(bob.value.conn!);
    advance(SERVER_CONFIG.graceMs + 1);
    expect(room.hasReturnToken(bob.value.token)).toBe(false);
    expect(room.join('Bob', new FakeConn(), bob.value.token)).toMatchObject({ ok: false, code: 'wrong_password' });
  });

  it('knows no return token for undefined or unknown tokens', () => {
    const { room } = lockedRoom();
    room.join('Anna', new FakeConn(), undefined, { password: 'geheim' });
    expect(room.hasReturnToken(undefined)).toBe(false);
    expect(room.hasReturnToken('nope')).toBe(false);
  });
});
```

An `packages/server/test/rooms.test.ts` anhängen:

```ts
describe('RoomManager.create with options', () => {
  it('uses the default room name, public and no password', () => {
    const m = new RoomManager({ maxRooms: 5 });
    const a = m.create('Anna', conn);
    const k = m.create('Klaus', conn);
    if (!a.ok || !k.ok) throw new Error('create failed');
    expect(a.value.room.name).toBe('Annas Raum');
    expect(k.value.room.name).toBe("Klaus' Raum");
    expect(a.value.room.visibility).toBe('public');
    expect(a.value.room.locked).toBe(false);
  });

  it('passes name, visibility and password on and lets the creator in', () => {
    const m = new RoomManager({ maxRooms: 5 });
    const r = m.create('Anna', conn, { roomName: 'Bude', visibility: 'private', password: 'pw' });
    if (!r.ok) throw new Error('create failed');
    expect(r.value.room).toMatchObject({ name: 'Bude', visibility: 'private', locked: true });
    expect(r.value.member.name).toBe('Anna');
  });
});
```

- [ ] **Step 2: Fehlschlag sehen**

Run: `cd packages/server; npx vitest run test/roomAccess.test.ts test/rooms.test.ts`
Expected: FAIL (`room.name` undefined, `locked` undefined, `hasReturnToken is not a function`).

- [ ] **Step 3: `room.ts` erweitern**

In `packages/server/src/room.ts`:

a) Import aus core: `defaultRoomName` wird hier nicht gebraucht. Typ-Import um `RoomVisibility` ergänzen (alphabetisch nach `RoomPhase`):

```ts
  RoomPhase,
  RoomVisibility,
  RosterEntry,
```

b) `import { randomUUID } from 'node:crypto';` ersetzen durch:

```ts
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
```

c) Nach `export type Result<T> = …` und `function fail …` / `const OK …` (also vor `export class Room`) einfügen:

```ts
/** Einstellungen beim Anlegen; danach unveränderlich (Spec §1.4). */
export interface RoomSettings {
  /** Raumname, schon bereinigt (1 bis MAX_ROOM_NAME_LENGTH Zeichen) */
  name: string;
  visibility: RoomVisibility;
  /** Passwort, schon bereinigt; fehlt = kein Passwort. Der Raum behält nur den SHA-256-Hash. */
  password?: string;
}

/** Zusätzliche Angaben beim Beitritt */
export interface JoinExtras {
  /** Passwort für einen Raum mit Passwort */
  password?: string;
  /** Wunschfigur (0 bis AVATAR_COUNT - 1) */
  avatar?: number;
}

function sha256(text: string): Buffer {
  return createHash('sha256').update(text, 'utf8').digest();
}
```

d) In der Klasse `Room` nach `readonly progress = new Map<string, Progress>();` einfügen:

```ts
  /** Raumname (fest) */
  readonly name: string;
  /** Sichtbarkeit in der Raumliste (fest) */
  readonly visibility: RoomVisibility;
  /** SHA-256 des Passworts; null = kein Passwort. Das Passwort selbst wird nicht gespeichert. */
  private readonly passwordHash: Buffer | null;
```

e) Konstruktor-Signatur und Anfang ersetzen:

```ts
  constructor(
    readonly code: string,
    opts: RoomOptions = {},
    settings: Partial<RoomSettings> = {},
  ) {
    this.name = settings.name ?? `Raum ${code}`;
    this.visibility = settings.visibility ?? 'public';
    this.passwordHash = settings.password ? sha256(settings.password) : null;
    this.mapId = opts.mapId ?? DEFAULT_MAP_ID;
```

(die übrigen Zeilen des Konstruktors bleiben).

f) Nach `roundMs(): number { … }` einfügen:

```ts
  /** Raum verlangt beim Beitritt ein Passwort. */
  get locked(): boolean {
    return this.passwordHash !== null;
  }

  /** Zeitkonstanter Vergleich über SHA-256 beider Werte; ohne Passwort im Raum immer true. */
  private passwordOk(given: string | undefined): boolean {
    if (this.passwordHash === null) return true;
    return timingSafeEqual(sha256(given ?? ''), this.passwordHash);
  }

  /** Gehört das Token einem Mitglied, das innerhalb der Frist zurückkehren darf? (Für die Ratenbegrenzung im Handler.) */
  hasReturnToken(token?: string): boolean {
    if (token === undefined) return false;
    const now = this.now();
    return this.members.some(
      (m) => m.token === token && !m.expired && (m.disconnectedAt === null || now - m.disconnectedAt <= this.graceMs),
    );
  }
```

g) `lobbyMessage()` ersetzen:

```ts
  lobbyMessage(): ServerMessage {
    return {
      t: 'lobby',
      room: this.code,
      roomName: this.name,
      visibility: this.visibility,
      locked: this.locked,
      host: this.hostId(),
      players: this.roster(),
      phase: this.phase,
      roundMs: this.roundMs(),
      rounds: DEFAULT_ROUNDS,
    };
  }
```

und `DEFAULT_ROUNDS` in den Wert-Import aus `@pfandraiders/core` aufnehmen (alphabetisch nach `DEFAULT_ROUND_MS`). Task 5 ersetzt `DEFAULT_ROUNDS` hier durch `this.rounds()`.

h) Signatur von `join` ändern und Passwortprüfung einfügen:

```ts
  join(name: string, conn: Conn, token?: string, extras: JoinExtras = {}): Result<Member> {
```

Direkt nach dem Block `// Rückkehr mit Token (nur innerhalb der Frist)` (also nach der schließenden `}` von `if (token !== undefined) { … }`) und vor `if (this.phase === 'playing') return fail('already_started', …)` einfügen:

```ts
    // Passwort vor allen anderen Prüfungen (Rückkehr mit gültigem Token braucht keins)
    if (!this.passwordOk(extras.password)) return fail('wrong_password', 'Passwort falsch oder nötig.');
```

- [ ] **Step 4: `rooms.ts` erweitern**

In `packages/server/src/rooms.ts`:

a) Importe ersetzen:

```ts
import { defaultRoomName, ROOM_CODE_CHARS, ROOM_CODE_LENGTH } from '@pfandraiders/core';
import type { RoomVisibility } from '@pfandraiders/core';
import { SERVER_CONFIG } from './config';
import { Room } from './room';
import type { Conn, Member, Result, RoomOptions } from './room';
```

b) Nach `ManagerOptions` einfügen:

```ts
/** Angaben aus der create-Nachricht (schon bereinigt) */
export interface CreateOptions {
  /** fehlt = defaultRoomName(name) */
  roomName?: string;
  /** fehlt = public */
  visibility?: RoomVisibility;
  /** fehlt = kein Passwort */
  password?: string;
  /** Wunschfigur des Erstellers */
  avatar?: number;
}
```

c) `create` ersetzen:

```ts
  /** Neuer Raum, der Ersteller tritt als Host bei (mit seinem eigenen Passwort). */
  create(name: string, conn: Conn, opts: CreateOptions = {}): Result<{ room: Room; member: Member }> {
    if (this.rooms.size >= this.maxRooms) {
      return { ok: false, code: 'too_many_rooms', message: 'Der Server ist ausgelastet.' };
    }
    const room = new Room(this.newCode(), this.opts, {
      name: opts.roomName ?? defaultRoomName(name),
      visibility: opts.visibility ?? 'public',
      password: opts.password,
    });
    const joined = room.join(name, conn, undefined, { password: opts.password, avatar: opts.avatar });
    if (!joined.ok) return joined;
    this.rooms.set(room.code, room);
    return { ok: true, value: { room, member: joined.value } };
  }
```

- [ ] **Step 5: Server-Tests laufen lassen**

Run: `cd packages/server; npx vitest run`
Expected: alle PASS (auch die bestehenden; `join` ohne `extras` funktioniert wie vorher).

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/room.ts packages/server/src/rooms.ts packages/server/test/roomAccess.test.ts packages/server/test/rooms.test.ts
git commit -m "feat(server): room name, visibility and password

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Figuren (Avatare) im Server-Raum

**Files:**
- Modify: `packages/server/src/room.ts`
- Create: `packages/server/test/roomAvatars.test.ts`

**Interfaces:**
- Consumes: `pickAvatar`, `isAvatar` (Task 1), `JoinExtras.avatar` (Task 3).
- Produces: `Member.avatar: number`, `RosterEntry.avatar` in `lobby`/`start`, `Room.setAvatar(m: Member, avatar: number): Result<void>`.

- [ ] **Step 1: Failing tests**

`packages/server/test/roomAvatars.test.ts`:

```ts
import type { ServerMessage } from '@pfandraiders/core';
import { describe, expect, it } from 'vitest';
import { Room } from '../src/room';
import type { Conn, Member } from '../src/room';

class FakeConn implements Conn {
  messages: ServerMessage[] = [];
  send(msg: ServerMessage): void {
    this.messages.push(msg);
  }
  of<T extends ServerMessage['t']>(t: T): Extract<ServerMessage, { t: T }>[] {
    return this.messages.filter((m): m is Extract<ServerMessage, { t: T }> => m.t === t);
  }
  last<T extends ServerMessage['t']>(t: T): Extract<ServerMessage, { t: T }> {
    const all = this.of(t);
    return all[all.length - 1];
  }
}

function setup() {
  let time = 0;
  const room = new Room('ABCD', { now: () => time, random: () => 0.5, roundMs: 100, countdownMs: 0 });
  const join = (name: string, avatar?: number): { member: Member; conn: FakeConn } => {
    const conn = new FakeConn();
    const r = room.join(name, conn, undefined, avatar === undefined ? {} : { avatar });
    if (!r.ok) throw new Error(`join failed: ${r.code}`);
    return { member: r.value, conn };
  };
  const endRound = () => {
    for (let i = 0; i < 100 && room.phase === 'playing'; i++) room.tick();
  };
  return { room, join, endRound, advance: (ms: number) => (time += ms) };
}

describe('avatar assignment', () => {
  it('follows the default order m02, f03, m01 without a wish', () => {
    const { room, join } = setup();
    expect([join('Anna').member.avatar, join('Bob').member.avatar, join('Cara').member.avatar]).toEqual([1, 14, 0]);
    expect(room.roster().map((r) => r.avatar)).toEqual([1, 14, 0]);
  });

  it('gives a free wish and replaces a taken one by the first free default', () => {
    const { join } = setup();
    expect(join('Anna', 7).member.avatar).toBe(7);
    expect(join('Bob', 7).member.avatar).toBe(1);
    expect(join('Cara', 1).member.avatar).toBe(14);
  });

  it('sends the avatars with lobby and start', () => {
    const { room, join } = setup();
    const a = join('Anna', 5);
    join('Bob', 6);
    expect(a.conn.last('lobby').players.map((p) => p.avatar)).toEqual([5, 6]);
    room.start('p1');
    expect(a.conn.last('start').players.map((p) => p.avatar)).toEqual([5, 6]);
  });

  it('frees the avatar when a player leaves the lobby or leaves for good', () => {
    const { room, join } = setup();
    const a = join('Anna');
    const b = join('Bob');
    room.leave(a.conn);
    expect(join('Cara').member.avatar).toBe(1);
    room.leaveForGood(b.conn);
    expect(join('Dora').member.avatar).toBe(14);
  });

  it('keeps the avatar of a disconnected player in the grace period', () => {
    const { room, join, endRound } = setup();
    join('Anna');
    const b = join('Bob', 9);
    room.start('p1');
    endRound();
    room.leave(b.conn); // Shop-Phase: Bob bleibt in der Frist Mitglied
    expect(join('Cara', 9).member.avatar).not.toBe(9);
  });
});

describe('setAvatar', () => {
  it('changes the own avatar in the lobby and tells everybody', () => {
    const { room, join } = setup();
    const a = join('Anna');
    const b = join('Bob');
    expect(room.setAvatar(a.member, 20).ok).toBe(true);
    expect(a.member.avatar).toBe(20);
    expect(b.conn.last('lobby').players[0].avatar).toBe(20);
  });

  it('refuses a taken avatar with avatar_taken and an invalid one with bad_message', () => {
    const { room, join } = setup();
    const a = join('Anna');
    join('Bob');
    expect(room.setAvatar(a.member, 14)).toMatchObject({ ok: false, code: 'avatar_taken', message: 'Die Figur ist schon vergeben.' });
    expect(room.setAvatar(a.member, 24)).toMatchObject({ ok: false, code: 'bad_message' });
    expect(a.member.avatar).toBe(1);
  });

  it('accepts the own current avatar without a new lobby message', () => {
    const { room, join } = setup();
    const a = join('Anna');
    const before = a.conn.of('lobby').length;
    expect(room.setAvatar(a.member, 1).ok).toBe(true);
    expect(a.conn.of('lobby')).toHaveLength(before);
  });

  it('is only allowed in the lobby', () => {
    const { room, join, endRound } = setup();
    const a = join('Anna');
    join('Bob');
    room.start('p1');
    expect(room.setAvatar(a.member, 3)).toMatchObject({ ok: false, code: 'wrong_phase' });
    endRound();
    expect(room.setAvatar(a.member, 3)).toMatchObject({ ok: false, code: 'wrong_phase' });
  });
});
```

- [ ] **Step 2: Fehlschlag sehen**

Run: `cd packages/server; npx vitest run test/roomAvatars.test.ts`
Expected: FAIL (`avatar` undefined, `setAvatar is not a function`).

- [ ] **Step 3: Implementieren**

In `packages/server/src/room.ts`:

a) Wert-Import aus `@pfandraiders/core` um `isAvatar` und `pickAvatar` ergänzen (alphabetisch einsortiert).

b) In `interface Member` nach `ready: boolean;` einfügen:

```ts
  /** Figur (Index 0 bis AVATAR_COUNT - 1), im Raum eindeutig; wird frei, wenn das Mitglied entfernt wird */
  avatar: number;
```

c) `roster()` ersetzen:

```ts
  roster(): RosterEntry[] {
    return this.members.map((m) => ({
      id: m.id,
      name: m.name,
      color: m.color,
      connected: m.conn !== null,
      ready: m.ready,
      avatar: m.avatar,
    }));
  }
```

d) In `join` beim Anlegen des neuen Mitglieds: Direkt vor `const member: Member = {` einfügen:

```ts
    const avatar = pickAvatar(new Set(this.members.map((m) => m.avatar)), extras.avatar);
```

und im Objekt nach `ready: false,` ergänzen:

```ts
      avatar,
```

e) Nach `setReady(…) { … }` die Methode einfügen:

```ts
  /** Eigene Figur wählen (nur Lobby). Vergeben = avatar_taken; die eigene Figur noch einmal = ok ohne Nachricht. */
  setAvatar(m: Member, avatar: number): Result<void> {
    if (this.phase !== 'lobby') return fail('wrong_phase', 'Die Figur wählt man in der Lobby.');
    if (!isAvatar(avatar)) return fail('bad_message', 'Ungültige Figur.');
    if (m.conn === null || m.avatar === avatar) return OK;
    if (this.members.some((x) => x !== m && x.avatar === avatar)) {
      return fail('avatar_taken', 'Die Figur ist schon vergeben.');
    }
    this.lastActive = this.now();
    m.avatar = avatar;
    this.broadcastLobby();
    return OK;
  }
```

Hinweis: Die Freigabe beim Verlassen ergibt sich von selbst, weil `drop(m)` das Mitglied entfernt und `pickAvatar` nur die Figuren der verbleibenden Mitglieder als vergeben zählt.

- [ ] **Step 4: Server-Tests**

Run: `cd packages/server; npx vitest run`
Expected: alle PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/room.ts packages/server/test/roomAvatars.test.ts
git commit -m "feat(server): unique avatars per room with wish and setAvatar

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Rundenzahl, Endwertung und Rückkehr in die Lobby

**Files:**
- Modify: `packages/server/src/room.ts`
- Create: `packages/server/test/roomFinal.test.ts`
- Modify: `packages/server/test/roomSeries.test.ts:273-288` (Test "lets only the host end the series …")
- Modify: `packages/server/test/handler.test.ts:256-257` (Test "series messages": `endSeries` führt jetzt nach `final`)

**Interfaces:**
- Consumes: `finalRanking` (Task 2), `isRounds`, `DEFAULT_ROUNDS` (Task 1).
- Produces: `Room.rounds(): number`, `Room.round: number`, `Room.setRounds(byId, rounds): Result<void>`, `Room.toLobby(byId): Result<void>`, `Room.endSeries(byId)` → Phase `final`; `start` trägt `rounds` und `round`; `lobby` trägt `rounds`.

- [ ] **Step 1: Failing tests**

`packages/server/test/roomFinal.test.ts`:

```ts
import { DEFAULT_ROUNDS } from '@pfandraiders/core';
import type { ServerMessage } from '@pfandraiders/core';
import { describe, expect, it } from 'vitest';
import { SERVER_CONFIG } from '../src/config';
import { Room } from '../src/room';
import type { Conn } from '../src/room';

class FakeConn implements Conn {
  messages: ServerMessage[] = [];
  send(msg: ServerMessage): void {
    this.messages.push(msg);
  }
  of<T extends ServerMessage['t']>(t: T): Extract<ServerMessage, { t: T }>[] {
    return this.messages.filter((m): m is Extract<ServerMessage, { t: T }> => m.t === t);
  }
  last<T extends ServerMessage['t']>(t: T): Extract<ServerMessage, { t: T }> {
    const all = this.of(t);
    return all[all.length - 1];
  }
}

/** Drei verbundene Spieler; eine Runde ist nach zwei Ticks vorbei (roundMs 100). */
function series() {
  let time = 0;
  const room = new Room('ABCD', { now: () => time, random: () => 0.5, roundMs: 100, countdownMs: 0 });
  const conns = [new FakeConn(), new FakeConn(), new FakeConn()];
  const members = ['Anna', 'Bob', 'Cara'].map((name, i) => {
    const r = room.join(name, conns[i]);
    if (!r.ok) throw new Error('join failed');
    return r.value;
  });
  const endRound = () => {
    for (let i = 0; i < 100 && room.phase === 'playing'; i++) room.tick();
  };
  const nextRound = () => {
    for (const m of room.members) if (m.conn) room.setReady(m, true);
  };
  return { room, conns, members, endRound, nextRound, advance: (ms: number) => (time += ms) };
}

describe('round count', () => {
  it('is 3 by default and travels with lobby and start', () => {
    const { room, conns } = series();
    expect(DEFAULT_ROUNDS).toBe(3);
    expect(conns[0].last('lobby').rounds).toBe(3);
    room.start('p1');
    expect(conns[1].last('start')).toMatchObject({ rounds: 3, round: 1 });
  });

  it('lets only the host set it, only in the lobby, only to 1, 3, 5 or 0', () => {
    const { room, conns, endRound } = series();
    expect(room.setRounds('p2', 5)).toMatchObject({ ok: false, code: 'not_host' });
    expect(room.setRounds('p1', 2)).toMatchObject({ ok: false, code: 'bad_message' });
    expect(room.setRounds('p1', 5).ok).toBe(true);
    expect(conns[2].last('lobby').rounds).toBe(5);
    expect(room.rounds()).toBe(5);
    room.start('p1');
    expect(room.setRounds('p1', 1)).toMatchObject({ ok: false, code: 'wrong_phase' });
    endRound();
    expect(room.setRounds('p1', 1)).toMatchObject({ ok: false, code: 'wrong_phase' });
  });

  it('counts the rounds in start', () => {
    const { room, conns, endRound, nextRound } = series();
    room.start('p1');
    endRound();
    nextRound();
    expect(conns[0].last('start').round).toBe(2);
    expect(room.round).toBe(2);
  });
});

describe('final phase', () => {
  it('ends with the final ranking after the last round instead of the shop', () => {
    const { room, conns, endRound } = series();
    room.setRounds('p1', 1);
    room.start('p1');
    room.state!.players.p2.earnedTotal = 500;
    room.state!.players.p3.earnedTotal = 300;
    endRound();
    expect(room.phase).toBe('final');
    const phaseAt = conns[0].messages.findIndex((m) => m.t === 'phase' && m.phase === 'final');
    const rankAt = conns[0].messages.findIndex((m, i) => i > phaseAt && m.t === 'ranking');
    expect(phaseAt).toBeGreaterThan(-1);
    expect(rankAt).toBeGreaterThan(phaseAt);
    expect(conns[0].last('ranking').entries.map((e) => [e.id, e.total])).toEqual([
      ['p2', 500],
      ['p3', 300],
      ['p1', 0],
    ]);
    expect(conns[0].of('shopState')).toHaveLength(0);
    expect(conns[1].last('lobby').phase).toBe('final');
  });

  it('plays exactly three rounds by default', () => {
    const { room, endRound, nextRound } = series();
    room.start('p1');
    endRound();
    expect(room.phase).toBe('shop');
    nextRound();
    endRound();
    expect(room.phase).toBe('shop');
    nextRound();
    endRound();
    expect(room.phase).toBe('final');
  });

  it('never ends by itself with rounds 0', () => {
    const { room, endRound, nextRound } = series();
    room.setRounds('p1', 0);
    room.start('p1');
    for (let i = 0; i < 6; i++) {
      endRound();
      expect(room.phase).toBe('shop');
      nextRound();
    }
  });

  it('has no shop in the final phase', () => {
    const { room, members, endRound } = series();
    room.setRounds('p1', 1);
    room.start('p1');
    endRound();
    expect(room.shopBuy(members[0], 'defense', 'food', 1)).toMatchObject({ ok: false, code: 'wrong_phase' });
    expect(room.setReady(members[0], true)).toMatchObject({ ok: false, code: 'wrong_phase' });
    expect(room.endSeries('p1')).toMatchObject({ ok: false, code: 'wrong_phase' });
    expect(room.start('p1')).toMatchObject({ ok: false, code: 'already_started' });
    expect(room.chat(members[0].conn!, 'Hallo')).toMatchObject({ ok: false, code: 'chat_closed' });
  });

  it('ranks everybody by total after endSeries, also a shop joiner', () => {
    const { room, conns, endRound } = series();
    room.start('p1');
    room.state!.players.p1.earnedTotal = 200;
    room.state!.players.p3.earnedTotal = 200;
    endRound();
    const d = new FakeConn();
    expect(room.join('Dora', d).ok).toBe(true);
    expect(room.endSeries('p2')).toMatchObject({ ok: false, code: 'not_host' });
    expect(room.endSeries('p1').ok).toBe(true);
    expect(room.phase).toBe('final');
    expect(conns[1].last('phase').phase).toBe('final');
    expect(d.last('ranking').entries.map((e) => e.id)).toEqual(['p1', 'p3', 'p2', 'p4']);
  });

  it('sends a returning player the final phase and ranking', () => {
    const { room, members, endRound } = series();
    room.setRounds('p1', 1);
    room.start('p1');
    endRound();
    room.leave(members[1].conn!);
    const back = new FakeConn();
    expect(room.join('Bob', back, members[1].token).ok).toBe(true);
    expect(back.last('phase').phase).toBe('final');
    expect(back.of('ranking')).toHaveLength(1);
  });

  it('lets a new player join during the final phase without putting him in the ranking', () => {
    const { room, endRound } = series();
    room.setRounds('p1', 1);
    room.start('p1');
    endRound();
    const d = new FakeConn();
    expect(room.join('Dora', d).ok).toBe(true);
    expect(d.last('phase').phase).toBe('final');
    expect(d.last('ranking').entries.map((e) => e.id)).not.toContain('p4');
  });

  it('drops players whose grace ran out during the final phase and tells the others', () => {
    const { room, conns, members, endRound, advance } = series();
    room.setRounds('p1', 1);
    room.start('p1');
    endRound();
    room.leave(members[2].conn!);
    advance(SERVER_CONFIG.graceMs + 1);
    room.tick();
    expect(room.members.map((m) => m.id)).toEqual(['p1', 'p2']);
    expect(conns[0].last('lobby').players.map((p) => p.id)).toEqual(['p1', 'p2']);
  });
});

describe('toLobby', () => {
  function inFinal() {
    const s = series();
    s.room.chat(s.conns[0], 'Hallo');
    s.room.setRounds('p1', 1);
    s.room.setRoundMs('p1', 420_000);
    s.room.start('p1');
    s.room.state!.players.p1.money = 900;
    s.endRound();
    return s;
  }

  it('lets only the host go back, and only from the final phase', () => {
    const { room, endRound } = series();
    expect(room.toLobby('p1')).toMatchObject({ ok: false, code: 'wrong_phase' });
    room.start('p1');
    endRound();
    expect(room.toLobby('p1')).toMatchObject({ ok: false, code: 'wrong_phase' });
    room.endSeries('p1');
    expect(room.toLobby('p2')).toMatchObject({ ok: false, code: 'not_host' });
    expect(room.toLobby('p1').ok).toBe(true);
  });

  it('resets progress and round number but keeps code, host, settings, avatars and chat', () => {
    const { room, conns } = inFinal();
    const avatars = room.members.map((m) => m.avatar);
    expect(room.toLobby('p1').ok).toBe(true);
    expect(room.phase).toBe('lobby');
    expect(room.state).toBeNull();
    expect(room.progress.size).toBe(0);
    expect(room.round).toBe(0);
    expect(room.code).toBe('ABCD');
    expect(room.hostId()).toBe('p1');
    expect(room.rounds()).toBe(1);
    expect(room.roundMs()).toBe(100); // ROUND_MS aus den Optionen hat Vorrang
    expect(room.members.map((m) => m.avatar)).toEqual(avatars);
    expect(conns[2].last('phase').phase).toBe('lobby');
    expect(conns[2].last('lobby').phase).toBe('lobby');
    const d = new FakeConn();
    expect(room.join('Dora', d).ok).toBe(true);
    expect(d.last('chathistory').messages.map((m) => m.text)).toEqual(['Hallo']);
    expect(room.chat(conns[1], 'Wieder da').ok).toBe(true);
  });

  it('starts a fresh series afterwards', () => {
    const { room, conns } = inFinal();
    room.toLobby('p1');
    expect(room.start('p1').ok).toBe(true);
    expect(room.state!.players.p1.money).toBe(0);
    expect(conns[0].last('start').round).toBe(1);
  });

  it('keeps disconnected players in the grace period and drops expired ones', () => {
    const { room, members, advance } = inFinal();
    room.leave(members[1].conn!);
    advance(SERVER_CONFIG.graceMs + 1);
    room.leave(members[2].conn!);
    room.toLobby('p1');
    expect(room.members.map((m) => [m.id, m.conn !== null])).toEqual([
      ['p1', true],
      ['p3', false],
    ]);
    expect(room.join('Cara', new FakeConn(), members[2].token).ok).toBe(true);
  });

  it('gives the button to the next host when the host leaves in the final phase', () => {
    const { room, members } = inFinal();
    room.leaveForGood(members[0].conn!);
    expect(room.hostId()).toBe('p2');
    expect(room.toLobby('p2').ok).toBe(true);
  });
});
```

In `packages/server/test/roomSeries.test.ts` den Test `'lets only the host end the series in the shop phase, back to the lobby without progress'` (Zeilen 273–288) vollständig ersetzen durch:

```ts
  it('lets only the host end the series in the shop phase, into the final ranking, then back to the lobby without progress', () => {
    const { room, conns, members, endRound } = series();
    expect(room.endSeries('p1')).toMatchObject({ ok: false, code: 'wrong_phase' });
    room.start('p1');
    endRound();
    room.leave(members[2].conn!);
    expect(room.endSeries('p2')).toMatchObject({ ok: false, code: 'not_host' });
    expect(room.endSeries('p1').ok).toBe(true);
    expect(room.phase).toBe('final');
    expect(conns[1].last('phase').phase).toBe('final');
    expect(room.toLobby('p1').ok).toBe(true);
    expect(room.phase).toBe('lobby');
    expect(room.state).toBeNull();
    expect(room.progress.size).toBe(0);
    // p3 ist getrennt, aber noch in der Frist: bleibt in der Lobby, start entfernt ihn
    expect(room.members.map((m) => m.id)).toEqual(['p1', 'p2', 'p3']);
    expect(conns[1].last('phase').phase).toBe('lobby');
    expect(room.start('p1').ok).toBe(true);
    expect(room.members.map((m) => m.id)).toEqual(['p1', 'p2']);
    expect(room.state!.players.p1.money).toBe(0);
  });
```

- [ ] **Step 2: Fehlschlag sehen**

Run: `cd packages/server; npx vitest run test/roomFinal.test.ts test/roomSeries.test.ts`
Expected: FAIL (`setRounds is not a function`, Phase bleibt `shop` bzw. wird `lobby`).

- [ ] **Step 3: Implementieren**

In `packages/server/src/room.ts`:

a) Wert-Import aus `@pfandraiders/core` um `finalRanking` und `isRounds` ergänzen (alphabetisch; `DEFAULT_ROUNDS` ist seit Task 3 drin).

b) Nach `private chosenRoundMs: number = DEFAULT_ROUND_MS;` einfügen:

```ts
  /** Vom Host gewählte Rundenzahl (0 = offen) */
  private chosenRounds: number = DEFAULT_ROUNDS;
  /** Laufende bzw. letzte Runde der Serie ab 1; 0 in der Lobby */
  round = 0;
```

und den Kommentar über `lastRanking` ersetzen durch:

```ts
  /** Rangliste der letzten Runde (Shop-Phase) bzw. Endwertung (Phase final), für Nachzügler */
```

c) Nach `roundMs(): number { … }` einfügen:

```ts
  /** Rundenzahl der Serie (0 = offen). */
  rounds(): number {
    return this.chosenRounds;
  }
```

d) In `lobbyMessage()` die Zeile `rounds: DEFAULT_ROUNDS,` ersetzen durch `rounds: this.rounds(),`.

e) `expireMembers()` ersetzen:

```ts
  /**
   * Markiert Mitglieder nach der Frist als abgelaufen; außerhalb der Runde fliegen sie raus
   * (ihr Fortschritt und ihre Figur werden frei). In der Shop-Phase kann das die nächste Runde auslösen.
   */
  private expireMembers(): void {
    const now = this.now();
    for (const m of this.members) {
      if (m.disconnectedAt !== null && now - m.disconnectedAt > this.graceMs) m.expired = true;
    }
    if (this.phase === 'playing') return;
    const gone = this.members.filter((m) => m.conn === null && m.expired);
    if (gone.length === 0) return;
    for (const m of gone) this.drop(m);
    this.broadcastLobby();
    if (this.phase === 'shop') this.checkAllReady();
  }
```

f) In `join` im Token-Rückkehr-Block nach `if (this.phase === 'shop') this.sendShop(back);` einfügen:

```ts
        if (this.phase === 'final') this.sendFinal(back);
```

und beim neuen Mitglied nach dem Block `if (this.phase === 'shop') { … }` einfügen:

```ts
    // Beitritt während der Endwertung: sieht sie, steht aber nicht drin, und wartet auf die Lobby
    if (this.phase === 'final') this.sendFinal(member);
```

g) In `start(…)` vor `this.startRound();` einfügen:

```ts
    this.round = 0;
```

h) In `startRound()` vor `this.phase = 'playing';` einfügen:

```ts
    this.round++;
```

i) `sendStart` – im gesendeten Objekt nach `roundMs: this.roundMs(),` ergänzen:

```ts
      rounds: this.rounds(),
      round: this.round,
```

j) Nach `sendShopState(…) { … }` einfügen:

```ts
  /** Endwertung an einen Spieler: erst die Phase, dann die Rangliste nach Gesamtverdienst (kein Shop-Stand). */
  private sendFinal(m: Member): void {
    if (!m.conn) return;
    m.conn.send({ t: 'phase', phase: 'final' });
    m.conn.send({ t: 'ranking', entries: this.lastRanking.map((e) => ({ ...e })) });
  }

  /**
   * Serie vorbei: Endwertung aus dem Fortschritt aller aktuellen Mitglieder (Gesamtverdienst; Rundenverdienst
   * aus der letzten Runde, sonst 0), danach eingefroren. Kein Shop.
   */
  private enterFinal(): void {
    const entries: RankEntry[] = this.members.map((m) => {
      const p = this.progress.get(m.id) ?? freshProgress();
      const last = this.lastRanking.find((e) => e.id === m.id);
      return { id: m.id, money: p.money, round: last?.round ?? 0, total: p.earnedTotal };
    });
    this.lastRanking = finalRanking(entries);
    this.phase = 'final';
    this.state = null;
    for (const m of this.members) m.ready = false;
    for (const m of this.members) this.sendFinal(m);
    this.broadcastLobby();
  }
```

k) `setRoundMs`-Kommentar ändern zu `/** Rundenzeit wählen (nur Host, nicht während einer Runde; der Wert ist schon gegen ROUND_MS_CHOICES geprüft). */` und danach einfügen:

```ts
  /** Rundenzahl wählen (nur Host, nur Lobby): 1, 3, 5 oder 0 = offen. */
  setRounds(byId: string, rounds: number): Result<void> {
    if (byId === '' || this.hostId() !== byId) return fail('not_host', 'Nur der Host kann die Rundenzahl ändern.');
    if (this.phase !== 'lobby') return fail('wrong_phase', 'Die Rundenzahl ändert sich nur in der Lobby.');
    if (!isRounds(rounds)) return fail('bad_message', 'Ungültige Rundenzahl.');
    this.lastActive = this.now();
    this.chosenRounds = rounds;
    this.broadcastLobby();
    return OK;
  }
```

l) `endSeries` vollständig ersetzen:

```ts
  /** Serie vorzeitig beenden (nur Host, nur Shop): weiter zur Endwertung der bisherigen Runden. */
  endSeries(byId: string): Result<void> {
    if (byId === '' || this.hostId() !== byId) return fail('not_host', 'Nur der Host kann die Serie beenden.');
    if (this.phase !== 'shop') return fail('wrong_phase', 'Die Serie lässt sich nur im Shop beenden.');
    this.lastActive = this.now();
    this.enterFinal();
    return OK;
  }

  /**
   * Nach der Endwertung zurück in die Lobby (nur Host, nur final). Bleibt: Code, Name, Sichtbarkeit, Passwort,
   * Host, Rundenzahl, Rundenzeit, Mitglieder (auch Getrennte in der Frist), Figuren und Chat.
   * Zurückgesetzt: Fortschritt, Rangliste, Rundennummer. Abgelaufene fallen heraus.
   */
  toLobby(byId: string): Result<void> {
    if (byId === '' || this.hostId() !== byId) return fail('not_host', 'Nur der Host kann zurück in die Lobby.');
    if (this.phase !== 'final') return fail('wrong_phase', 'Zurück in die Lobby geht nur nach der Endwertung.');
    this.lastActive = this.now();
    this.expireMembers();
    this.phase = 'lobby';
    this.state = null;
    this.progress.clear();
    this.lastRanking = [];
    this.round = 0;
    for (const m of this.members) m.ready = false;
    this.broadcast({ t: 'phase', phase: 'lobby' });
    this.broadcastLobby();
    return OK;
  }
```

m) `endRound()` vollständig ersetzen:

```ts
  /** Runde vorbei: Fortschritt sichern, dann Shop-Phase oder (nach der letzten Runde) Endwertung. */
  private endRound(): void {
    const state = this.state;
    if (!state) return;
    for (const m of this.members) {
      const p = state.players[m.id];
      if (p) this.progress.set(m.id, progressOf(p));
    }
    this.lastRanking = ranking(state);
    for (const m of this.members) m.ready = false;
    // Wer die Runde endgültig verlassen hat (oder dessen Frist ablief), fällt jetzt heraus
    for (const m of this.members.filter((x) => x.conn === null && x.expired)) this.drop(m);
    if (this.chosenRounds !== 0 && this.round >= this.chosenRounds) {
      this.enterFinal();
      return;
    }
    this.phase = 'shop';
    for (const m of this.members) this.sendShop(m);
    this.broadcastLobby();
  }
```

- [ ] **Step 4: Server-Tests**

Run: `cd packages/server; npx vitest run`
Expected: `roomFinal.test.ts` und `roomSeries.test.ts` PASS. **Bekannt rot:** `handler.test.ts` Test `'routes start with round time, ready, shopBuy, setRoundMs and endSeries to the room'` (erwartet noch `lobby`); er wird in Task 7 umgestellt. Alle anderen PASS.

Zur Sicherheit diesen einen Test schon jetzt anpassen, damit die Suite grün bleibt: in `packages/server/test/handler.test.ts` die beiden letzten Zeilen des Tests

```ts
    send(sa, a, { t: 'endSeries' });
    expect(room.phase).toBe('lobby');
```

ersetzen durch

```ts
    send(sa, a, { t: 'endSeries' });
    expect(room.phase).toBe('final');
```

Run erneut: `cd packages/server; npx vitest run`
Expected: alle PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/room.ts packages/server/test/roomFinal.test.ts packages/server/test/roomSeries.test.ts packages/server/test/handler.test.ts
git commit -m "feat(server): round count, final ranking and back to the lobby

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Raumliste

**Files:**
- Modify: `packages/server/src/room.ts` (Methode `info`)
- Modify: `packages/server/src/rooms.ts` (Methode `listRooms`)
- Modify: `packages/server/test/rooms.test.ts` (neuer `describe`-Block)

**Interfaces:**
- Consumes: `RoomInfo`, `MAX_LISTED_ROOMS`, `MAX_ROOM_PLAYERS` (Task 1), `Room.name/visibility/locked` (Task 3).
- Produces: `Room.info(): RoomInfo | null`, `RoomManager.listRooms(): RoomInfo[]`.

- [ ] **Step 1: Failing tests**

An `packages/server/test/rooms.test.ts` anhängen:

```ts
describe('RoomManager.listRooms', () => {
  const quiet = () => ({ send() {} });

  it('lists public rooms with name, host, players, max, phase and lock, without secrets', () => {
    const m = new RoomManager({ maxRooms: 5, countdownMs: 0 });
    const r = m.create('Anna', quiet(), { roomName: 'Bude', password: 'geheim' });
    if (!r.ok) throw new Error('create failed');
    r.value.room.join('Bob', quiet(), undefined, { password: 'geheim' });
    const list = m.listRooms();
    expect(list).toEqual([{ code: r.value.room.code, name: 'Bude', host: 'Anna', players: 2, max: 8, phase: 'lobby', locked: true }]);
    const text = JSON.stringify(list);
    expect(text).not.toContain('geheim');
    expect(text).not.toContain(r.value.member.token);
    expect(text).not.toContain('"p1"');
  });

  it('hides private rooms and rooms without connected players', () => {
    const m = new RoomManager({ maxRooms: 5 });
    m.create('Anna', quiet(), { visibility: 'private' });
    const c = quiet();
    const empty = m.create('Bob', c);
    if (!empty.ok) throw new Error('create failed');
    empty.value.room.leave(c);
    expect(m.listRooms()).toEqual([]);
  });

  it('puts joinable lobbies first, then more players, then by code', () => {
    let i = 0;
    // Codes AAAA, BBBB, CCCC, DDDD (ROOM_CODE_CHARS beginnt mit ABCD)
    const seq = [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3].map((k) => (k + 0.5) / ROOM_CODE_CHARS.length);
    const m = new RoomManager({ maxRooms: 5, countdownMs: 0, random: () => seq[i++ % seq.length] });
    const a = m.create('A', quiet()); // AAAA: Lobby, 1 Spieler
    const b = m.create('B', quiet()); // BBBB: läuft, 2 Spieler
    const c = m.create('C', quiet()); // CCCC: Lobby, 3 Spieler
    const d = m.create('D', quiet()); // DDDD: Lobby, 1 Spieler
    if (!a.ok || !b.ok || !c.ok || !d.ok) throw new Error('create failed');
    expect([a, b, c, d].map((r) => (r.ok ? r.value.room.code : ''))).toEqual(['AAAA', 'BBBB', 'CCCC', 'DDDD']);
    b.value.room.join('B2', quiet());
    b.value.room.start('p1');
    c.value.room.join('C2', quiet());
    c.value.room.join('C3', quiet());
    expect(m.listRooms().map((r) => [r.code, r.phase, r.players])).toEqual([
      ['CCCC', 'lobby', 3],
      ['AAAA', 'lobby', 1],
      ['DDDD', 'lobby', 1],
      ['BBBB', 'playing', 2],
    ]);
  });

  it('puts a full lobby behind the joinable ones and shows the final phase as shop', () => {
    let i = 0;
    const seq = [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2].map((k) => (k + 0.5) / ROOM_CODE_CHARS.length);
    const m = new RoomManager({ maxRooms: 5, countdownMs: 0, roundMs: 100, random: () => seq[i++ % seq.length] });
    const full = m.create('A', quiet());
    const fin = m.create('B', quiet());
    const open = m.create('C', quiet());
    if (!full.ok || !fin.ok || !open.ok) throw new Error('create failed');
    for (let k = 2; k <= 8; k++) full.value.room.join(`A${k}`, quiet());
    fin.value.room.join('B2', quiet());
    fin.value.room.setRounds('p1', 1);
    fin.value.room.start('p1');
    for (let k = 0; k < 10 && fin.value.room.phase === 'playing'; k++) fin.value.room.tick();
    expect(fin.value.room.phase).toBe('final');
    expect(m.listRooms().map((r) => [r.code, r.phase, r.players])).toEqual([
      ['CCCC', 'lobby', 1],
      ['AAAA', 'lobby', 8],
      ['BBBB', 'shop', 2],
    ]);
  });

  it('returns at most 50 rooms', () => {
    const m = new RoomManager({ maxRooms: 60 });
    for (let k = 0; k < 60; k++) m.create(`P${k}`, quiet());
    expect(m.listRooms()).toHaveLength(50);
  });
});
```

Hinweis zu den Codes: `ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'` (32 Zeichen); `(k + 0.5) / 32` trifft genau Index `k`.

- [ ] **Step 2: Fehlschlag sehen**

Run: `cd packages/server; npx vitest run test/rooms.test.ts`
Expected: FAIL (`m.listRooms is not a function`).

- [ ] **Step 3: Implementieren**

In `packages/server/src/room.ts`: Typ-Import um `RoomInfo` ergänzen (vor `RoomPhase`). Nach `isDead()` einfügen:

```ts
  /**
   * Eintrag für die Raumliste; null = privat oder niemand verbunden. Ohne Token, Passwort und Spieler-IDs.
   * Die Phase final erscheint als shop (läuft, nicht beitretbar).
   */
  info(): RoomInfo | null {
    if (this.visibility !== 'public') return null;
    const hostId = this.hostId();
    const host = this.members.find((m) => m.id === hostId);
    if (!host) return null;
    return {
      code: this.code,
      name: this.name,
      host: host.name,
      players: this.members.length,
      max: MAX_ROOM_PLAYERS,
      phase: this.phase === 'final' ? 'shop' : this.phase,
      locked: this.locked,
    };
  }
```

In `packages/server/src/rooms.ts`: Wert-Import ergänzen zu

```ts
import { defaultRoomName, MAX_LISTED_ROOMS, ROOM_CODE_CHARS, ROOM_CODE_LENGTH } from '@pfandraiders/core';
import type { RoomInfo, RoomVisibility } from '@pfandraiders/core';
```

und nach `get(code)` einfügen:

```ts
  /**
   * Öffentliche Räume mit mindestens einem verbundenen Spieler: beitretbare Lobbys zuerst,
   * dann mehr Spieler zuerst, dann nach Code; höchstens MAX_LISTED_ROOMS.
   */
  listRooms(): RoomInfo[] {
    const joinable = (r: RoomInfo): number => (r.phase === 'lobby' && r.players < r.max ? 1 : 0);
    return [...this.rooms.values()]
      .map((room) => room.info())
      .filter((r): r is RoomInfo => r !== null)
      .sort((a, b) => joinable(b) - joinable(a) || b.players - a.players || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))
      .slice(0, MAX_LISTED_ROOMS);
  }
```

- [ ] **Step 4: Server-Tests**

Run: `cd packages/server; npx vitest run`
Expected: alle PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/room.ts packages/server/src/rooms.ts packages/server/test/rooms.test.ts
git commit -m "feat(server): list public rooms

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Nachrichtenhandler mit Raumliste, Passwort-Limit, Avatar, Rundenzahl und toLobby

**Files:**
- Modify: `packages/server/src/config.ts`
- Modify: `packages/server/src/server.ts`
- Create: `packages/server/test/handlerRooms.test.ts`
- Modify: `packages/server/test/handler.test.ts` (Test "series messages" um `toLobby` ergänzen)
- Modify: `packages/server/test/server.test.ts` (neuer Drahttest)

**Interfaces:**
- Consumes: alles aus Task 1 bis 6.
- Produces: `SERVER_CONFIG.listRoomsMinGapMs`, `SERVER_CONFIG.wrongPasswordWindowMs`, `SERVER_CONFIG.wrongPasswordMax`; `Session.lastListRooms`, `Session.passwordFails`; Antworten `rooms`, Fehler `wrong_password`, `avatar_taken`, `rate_limited`.

- [ ] **Step 1: Failing tests**

`packages/server/test/handlerRooms.test.ts`:

```ts
import type { ServerMessage } from '@pfandraiders/core';
import { describe, expect, it, vi } from 'vitest';
import type { Conn } from '../src/room';
import { RoomManager } from '../src/rooms';
import { handleMessage, newSession } from '../src/server';
import type { Env, Session } from '../src/server';

function fakeConn() {
  const sent: ServerMessage[] = [];
  const conn: Conn = { send: (m) => void sent.push(m) };
  return { conn, sent };
}
function fakeSock() {
  return { close: vi.fn(), terminate: vi.fn() };
}

function setup() {
  let t = 1000;
  const manager = new RoomManager({ maxRooms: 5, countdownMs: 0, roundMs: 100 });
  const env: Env = { manager, sockets: new Map(), now: () => t, onError: () => {} };
  const send = (s: Session, c: ReturnType<typeof fakeConn>, msg: unknown) => handleMessage(env, s, c.conn, fakeSock(), JSON.stringify(msg));
  return { env, manager, send, advance: (ms: number) => (t += ms) };
}

describe('create and join with the new fields', () => {
  it('creates a named private room with password and avatar wish', () => {
    const { manager, send } = setup();
    const a = fakeConn();
    const sa = newSession(1000);
    send(sa, a, { t: 'create', name: 'Anna', roomName: 'Bude', visibility: 'private', password: 'geheim', avatar: 9 });
    const room = sa.room!;
    expect(room).toMatchObject({ name: 'Bude', visibility: 'private', locked: true });
    expect(sa.member!.avatar).toBe(9);
    expect(manager.listRooms()).toEqual([]);
    expect(a.sent.find((m) => m.t === 'lobby')).toMatchObject({ roomName: 'Bude', locked: true });
  });

  it('answers wrong_password for a missing or wrong password and joins with the right one', () => {
    const { send } = setup();
    const a = fakeConn();
    const sa = newSession(1000);
    send(sa, a, { t: 'create', name: 'Anna', password: 'geheim' });
    const code = sa.room!.code;
    const b = fakeConn();
    const sb = newSession(1000);
    send(sb, b, { t: 'join', room: code, name: 'Bob' });
    expect(b.sent.at(-1)).toMatchObject({ t: 'error', code: 'wrong_password' });
    send(sb, b, { t: 'join', room: code, name: 'Bob', password: 'falsch' });
    expect(b.sent.at(-1)).toMatchObject({ t: 'error', code: 'wrong_password' });
    send(sb, b, { t: 'join', room: code, name: 'Bob', password: 'geheim', avatar: 2 });
    expect(sb.member).toMatchObject({ name: 'Bob', avatar: 2 });
  });

  it('rejects a too long password as bad_message', () => {
    const { send } = setup();
    const a = fakeConn();
    send(newSession(1000), a, { t: 'create', name: 'Anna', password: 'x'.repeat(17) });
    expect(a.sent).toEqual([expect.objectContaining({ t: 'error', code: 'bad_message' })]);
  });
});

describe('wrong password limit', () => {
  function locked() {
    const s = setup();
    const a = fakeConn();
    const sa = newSession(1000);
    s.send(sa, a, { t: 'create', name: 'Anna', password: 'geheim' });
    return { ...s, room: sa.room!, code: sa.room!.code };
  }

  it('allows five wrong passwords per minute and connection, then rate_limited even for the right one', () => {
    const { send, code, advance } = locked();
    const b = fakeConn();
    const sb = newSession(1000);
    for (let i = 0; i < 5; i++) {
      send(sb, b, { t: 'join', room: code, name: 'Bob', password: 'falsch' });
      expect(b.sent.at(-1)).toMatchObject({ t: 'error', code: 'wrong_password' });
    }
    send(sb, b, { t: 'join', room: code, name: 'Bob', password: 'geheim' });
    expect(b.sent.at(-1)).toMatchObject({ t: 'error', code: 'rate_limited' });
    expect(sb.room).toBeNull();
    advance(59_999);
    send(sb, b, { t: 'join', room: code, name: 'Bob', password: 'geheim' });
    expect(b.sent.at(-1)).toMatchObject({ t: 'error', code: 'rate_limited' });
    advance(1);
    send(sb, b, { t: 'join', room: code, name: 'Bob', password: 'geheim' });
    expect(sb.room).not.toBeNull();
  });

  it('counts a missing password as a failure and does not limit other connections', () => {
    const { send, code } = locked();
    const b = fakeConn();
    const sb = newSession(1000);
    for (let i = 0; i < 5; i++) send(sb, b, { t: 'join', room: code, name: 'Bob' });
    send(sb, b, { t: 'join', room: code, name: 'Bob', password: 'geheim' });
    expect(b.sent.at(-1)).toMatchObject({ t: 'error', code: 'rate_limited' });
    const c = fakeConn();
    const sc = newSession(1000);
    send(sc, c, { t: 'join', room: code, name: 'Cara', password: 'geheim' });
    expect(sc.room).not.toBeNull();
  });

  it('lets a token return through even when the connection is limited', () => {
    const { send, code, room } = locked();
    const bob = room.join('Bob', fakeConn().conn, undefined, { password: 'geheim' });
    if (!bob.ok) throw new Error('join failed');
    room.start('p1');
    room.leave(bob.value.conn!);
    const b = fakeConn();
    const sb = newSession(1000);
    for (let i = 0; i < 5; i++) send(sb, b, { t: 'join', room: code, name: 'Bob', password: 'falsch' });
    send(sb, b, { t: 'join', room: code, name: 'Bob', token: bob.value.token });
    expect(sb.member).toBe(bob.value);
  });

  it('does not count failures in rooms without a password', () => {
    const { send } = setup();
    const a = fakeConn();
    const sa = newSession(1000);
    send(sa, a, { t: 'create', name: 'Anna' });
    const b = fakeConn();
    const sb = newSession(1000);
    send(sb, b, { t: 'join', room: sa.room!.code, name: 'Bob', password: 'egal' });
    expect(sb.room).toBe(sa.room);
    expect(sb.passwordFails).toEqual([]);
  });
});

describe('listRooms', () => {
  it('answers with the public rooms, also without a room, at most once per second', () => {
    const { send, advance } = setup();
    const a = fakeConn();
    const sa = newSession(1000);
    send(sa, a, { t: 'create', name: 'Anna', roomName: 'Bude' });
    const c = fakeConn();
    const sc = newSession(1000);
    send(sc, c, { t: 'listRooms' });
    expect(c.sent.at(-1)).toMatchObject({ t: 'rooms', rooms: [{ name: 'Bude', host: 'Anna', players: 1 }] });
    advance(999);
    send(sc, c, { t: 'listRooms' });
    expect(c.sent.at(-1)).toMatchObject({ t: 'error', code: 'rate_limited' });
    advance(1);
    send(sc, c, { t: 'listRooms' });
    expect(c.sent.at(-1)).toMatchObject({ t: 'rooms' });
    expect(sc.room).toBeNull();
  });
});

describe('setAvatar, setRounds and toLobby', () => {
  it('routes the messages to the room with its errors', () => {
    const { send } = setup();
    const a = fakeConn();
    const b = fakeConn();
    const sa = newSession(1000);
    const sb = newSession(1000);
    send(sa, a, { t: 'create', name: 'Anna' });
    send(sb, b, { t: 'join', room: sa.room!.code, name: 'Bob' });
    const room = sa.room!;

    send(sb, b, { t: 'setAvatar', avatar: 1 });
    expect(b.sent.at(-1)).toMatchObject({ t: 'error', code: 'avatar_taken' });
    send(sb, b, { t: 'setAvatar', avatar: 30 });
    expect(b.sent.at(-1)).toMatchObject({ t: 'error', code: 'bad_message' });
    send(sb, b, { t: 'setAvatar', avatar: 23 });
    expect(sb.member!.avatar).toBe(23);

    send(sb, b, { t: 'setRounds', rounds: 1 });
    expect(b.sent.at(-1)).toMatchObject({ t: 'error', code: 'not_host' });
    send(sa, a, { t: 'setRounds', rounds: 1 });
    expect(room.rounds()).toBe(1);

    send(sa, a, { t: 'toLobby' });
    expect(a.sent.at(-1)).toMatchObject({ t: 'error', code: 'wrong_phase' });
    send(sa, a, { t: 'start' });
    for (let i = 0; i < 10 && room.phase === 'playing'; i++) room.tick();
    expect(room.phase).toBe('final');
    send(sb, b, { t: 'toLobby' });
    expect(b.sent.at(-1)).toMatchObject({ t: 'error', code: 'not_host' });
    send(sa, a, { t: 'toLobby' });
    expect(room.phase).toBe('lobby');
  });

  it('answers not_in_room without a room', () => {
    const { send } = setup();
    const c = fakeConn();
    const sc = newSession(1000);
    for (const msg of [{ t: 'setAvatar', avatar: 1 }, { t: 'setRounds', rounds: 1 }, { t: 'toLobby' }]) {
      send(sc, c, msg);
      expect(c.sent.at(-1)).toMatchObject({ t: 'error', code: 'not_in_room' });
    }
  });
});
```

In `packages/server/test/handler.test.ts` im Test `'routes start with round time, ready, shopBuy, setRoundMs and endSeries to the room'` nach `expect(room.phase).toBe('final');` (seit Task 5) ergänzen:

```ts
    send(sa, a, { t: 'toLobby' });
    expect(room.phase).toBe('lobby');
```

In `packages/server/test/server.test.ts` innerhalb von `describe('websocket server', () => {` (z. B. nach dem Test `'reports unknown rooms and lets only the host start'`) einfügen:

```ts
  it('keeps the password off the wire and lists only public rooms', async () => {
    server = await startServer({ port: 0, stepMs: 20, countdownMs: 0 });
    const a = await connect(server.port);
    const p = await connect(server.port);
    const c = await connect(server.port);
    a.send({ t: 'create', name: 'Anna', roomName: 'Bude', password: 'geheim' });
    const joinedA = await a.until('joined');
    p.send({ t: 'create', name: 'Pia', visibility: 'private' });
    await p.until('joined');
    c.send({ t: 'listRooms' });
    const list = await c.until('rooms');
    expect(list.rooms).toEqual([{ code: joinedA.room, name: 'Bude', host: 'Anna', players: 1, max: 8, phase: 'lobby', locked: true }]);
    c.send({ t: 'join', room: joinedA.room, name: 'Cara' });
    await c.until('error', (m) => m.code === 'wrong_password');
    c.send({ t: 'join', room: joinedA.room, name: 'Cara', password: 'geheim' });
    await c.until('joined');
    await a.until('lobby', (m) => m.players.length === 2);
    for (const bot of [a, p, c]) expect(JSON.stringify(bot.messages)).not.toContain('geheim');
  });
```

- [ ] **Step 2: Fehlschlag sehen**

Run: `cd packages/server; npx vitest run test/handlerRooms.test.ts test/handler.test.ts test/server.test.ts`
Expected: FAIL (`listRooms` wird als `bad_message` beantwortet bzw. fehlt im `switch`, `passwordFails` undefined, `toLobby` nicht geroutet).

- [ ] **Step 3: Konfiguration**

In `packages/server/src/config.ts` in `SERVER_CONFIG` nach `chatMaxPerWindow: 5,` einfügen:

```ts
  /** Raumliste: mindestens so viele ms zwischen zwei Anfragen einer Verbindung */
  listRoomsMinGapMs: 1000,
  /** Falsche Passwörter: höchstens wrongPasswordMax je Verbindung in diesem gleitenden Fenster, danach rate_limited */
  wrongPasswordWindowMs: 60_000,
  wrongPasswordMax: 5,
```

- [ ] **Step 4: Handler**

In `packages/server/src/server.ts`:

a) In `interface Session` nach `errors: number;` einfügen:

```ts
  /** Zeitpunkt der letzten beantworteten Raumliste */
  lastListRooms: number;
  /** Zeitpunkte der falschen Passwörter (gleitendes Fenster) */
  passwordFails: number[];
```

b) In `newSession` nach `errors: 0,` einfügen:

```ts
    lastListRooms: -Infinity,
    passwordFails: [],
```

c) Im `switch (msg.t)` die Fälle `create` und `join` ersetzen:

```ts
    case 'create': {
      if (session.room) return reply(conn, 'bad_message', 'Du bist schon in einem Raum.');
      const r = manager.create(msg.name, conn, {
        roomName: msg.roomName,
        visibility: msg.visibility,
        password: msg.password,
        avatar: msg.avatar,
      });
      if (!r.ok) return reply(conn, r.code, r.message);
      session.room = r.value.room;
      session.member = r.value.member;
      return;
    }
    case 'join': {
      if (session.room) return reply(conn, 'bad_message', 'Du bist schon in einem Raum.');
      const room = manager.get(msg.room);
      if (!room) return reply(conn, 'room_not_found', 'Raum nicht gefunden.');
      // Zu viele falsche Passwörter: gesperrt bis das Fenster frei ist (Rückkehr mit gültigem Token ausgenommen)
      const needsPassword = room.locked && !room.hasReturnToken(msg.token);
      if (needsPassword) {
        session.passwordFails = session.passwordFails.filter((t) => now - t < SERVER_CONFIG.wrongPasswordWindowMs);
        if (session.passwordFails.length >= SERVER_CONFIG.wrongPasswordMax) {
          return reply(conn, 'rate_limited', 'Zu viele falsche Passwörter. Bitte kurz warten.');
        }
      }
      const prev = msg.token === undefined ? undefined : room.members.find((m) => m.token === msg.token)?.conn;
      const r = room.join(msg.name, conn, msg.token, { password: msg.password, avatar: msg.avatar });
      if (!r.ok) {
        if (r.code === 'wrong_password') session.passwordFails.push(now);
        return reply(conn, r.code, r.message);
      }
      // Rückkehr ersetzt eine noch offene alte Verbindung: diese schliessen
      if (prev && prev !== conn) env.sockets.get(prev)?.close(4000, 'replaced');
      session.room = room;
      session.member = r.value;
      return;
    }
```

d) Am Ende des `switch` (nach `case 'endSeries': { … }`) einfügen:

```ts
    case 'listRooms': {
      // Jederzeit erlaubt, auch ohne Raum; verlängert die Leerlauffrist nicht
      if (now - session.lastListRooms < SERVER_CONFIG.listRoomsMinGapMs) {
        return reply(conn, 'rate_limited', 'Raumliste höchstens einmal pro Sekunde.');
      }
      session.lastListRooms = now;
      conn.send({ t: 'rooms', rooms: manager.listRooms() });
      return;
    }
    case 'setAvatar': {
      if (!session.room || !session.member) return reply(conn, 'not_in_room', 'Du bist in keinem Raum.');
      if (!isCurrent()) return;
      const r = session.room.setAvatar(session.member, msg.avatar);
      if (!r.ok) reply(conn, r.code, r.message);
      return;
    }
    case 'setRounds': {
      if (!session.room || !session.member) return reply(conn, 'not_in_room', 'Du bist in keinem Raum.');
      if (!isCurrent()) return;
      const r = session.room.setRounds(session.member.id, msg.rounds);
      if (!r.ok) reply(conn, r.code, r.message);
      return;
    }
    case 'toLobby': {
      if (!session.room || !session.member) return reply(conn, 'not_in_room', 'Du bist in keinem Raum.');
      if (!isCurrent()) return;
      const r = session.room.toLobby(session.member.id);
      if (!r.ok) reply(conn, r.code, r.message);
      return;
    }
```

- [ ] **Step 5: Server-Tests und Typecheck**

Run: `cd packages/server; npx vitest run; npx tsc --noEmit`
Expected: alle Tests PASS, Typecheck ohne Fehler (ab hier muss der Server-Typecheck grün sein; ein Typfehler in einem Testliteral wird hier behoben).

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/config.ts packages/server/src/server.ts packages/server/test/handlerRooms.test.ts packages/server/test/handler.test.ts packages/server/test/server.test.ts
git commit -m "feat(server): handle room list, password limit, avatar, round count and toLobby

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Client bleibt lauffähig

**Files:**
- Modify: `packages/client/src/onlineMenu.ts:58-73` (`ERRORS`)
- Modify: `packages/client/src/online.ts:327-331` (Phase-Liste)
- Modify: `packages/client/src/reconnect.ts:8-15` (`FATAL_CODES`)
- Modify: `packages/client/src/scenes/ShopScene.ts:103-113`
- Modify: `packages/client/src/scenes/GameScene.ts:725-733`
- Modify: `packages/client/test/online.test.ts` (Literale, neuer Test)
- Modify: `packages/client/test/chatLogic.test.ts:4` (Literal)
- Modify: `packages/client/test/reconnect.test.ts` (neuer Test)

**Interfaces:**
- Consumes: `RoomPhase` mit `'final'`, `ErrorCode` mit `'wrong_password'`/`'avatar_taken'`, Pflichtfelder in `lobby`/`start`/`RosterEntry` (Task 1).
- Produces: `OnlineConnection.roomPhase` kann `'final'` sein; `FATAL_CODES` enthält `'wrong_password'`.

- [ ] **Step 1: Failing tests**

In `packages/client/test/online.test.ts`:

a) `roster()` ersetzen:

```ts
function roster() {
  return [
    { id: 'p1', name: 'Anna', color: ROOM_COLORS[0], connected: true, ready: false, avatar: 1 },
    { id: 'p2', name: 'Bob', color: ROOM_COLORS[1], connected: true, ready: false, avatar: 14 },
  ];
}

/** lobby-Nachricht mit den Pflichtfeldern für Räume */
function lobbyMsg(host: string, phase: RoomPhase, roundMs: number): ServerMessage {
  return { t: 'lobby', room: 'ABCD', roomName: 'Annas Raum', visibility: 'public', locked: false, host, players: roster(), phase, roundMs, rounds: DEFAULT_ROUNDS };
}
```

und den Typ-Import ergänzen: `import type { ClientMessage, Player, RoomPhase, ServerMessage } from '@pfandraiders/core';` sowie `DEFAULT_ROUNDS` in den Wert-Import aus `@pfandraiders/core` aufnehmen.

b) In `startMessage` das `return` ersetzen:

```ts
  return { t: 'start', mapId: DEFAULT_MAP_ID, map: CITY_MAP, you: 'p1', players: roster(), snap: projectSnapshot(s, 'p1'), roundMs: DEFAULT_ROUND_MS, rounds: DEFAULT_ROUNDS, round: 1 };
```

c) Alle sieben Literale der Form `{ t: 'lobby', room: 'ABCD', host: X, players: roster(), phase: Y, roundMs: Z }` (Zeilen 81, 84, 170, 173, 247, 721, 727) durch `lobbyMsg(X, Y, Z)` ersetzen, also z. B. Zeile 81:

```ts
    socket.receive(lobbyMsg('p1', 'lobby', DEFAULT_ROUND_MS));
```

Zeile 247: `socket.receive(lobbyMsg('p1', 'playing', DEFAULT_ROUND_MS));`, Zeile 721: `socket.receive(lobbyMsg('p1', 'lobby', 420_000));`, Zeile 727: `socket.receive(lobbyMsg('p2', 'shop', 420_000));` usw. Zum Finden: `grep -n "t: 'lobby'" packages/client/test/online.test.ts` muss danach nur noch die Zeile in `lobbyMsg` zeigen.

d) Nach dem Test `'stores the ranking and the phase and calls onPhase'` einfügen:

```ts
  it('accepts the final phase and ignores unknown phases', () => {
    const { socket, conn } = setup();
    let phases = 0;
    conn.onPhase = () => phases++;
    socket.receive({ t: 'phase', phase: 'final' });
    expect(conn.roomPhase).toBe('final');
    socket.onmessage?.({ data: JSON.stringify({ t: 'phase', phase: 'bogus' }) });
    expect(conn.roomPhase).toBe('final');
    expect(phases).toBe(1);
  });
```

In `packages/client/test/chatLogic.test.ts` Zeile 4 ersetzen:

```ts
const entry = (id: string, name: string, connected = true) => ({ id, name, color: 0xef5350, connected, ready: false, avatar: 0 });
```

In `packages/client/test/reconnect.test.ts` im `describe`-Block, der `'fatal is true for every fatal code and gives up'` enthält, einen Test ergänzen (Import von `FATAL_CODES` steht dort schon, sonst `import { FATAL_CODES } from '../src/reconnect';` ergänzen):

```ts
  it('treats a wrong password as fatal (expired token in a locked room)', () => {
    expect(FATAL_CODES).toContain('wrong_password');
  });
```

- [ ] **Step 2: Fehlschlag sehen**

Run: `cd packages/client; npx vitest run test/online.test.ts test/reconnect.test.ts`
Expected: FAIL (`roomPhase` bleibt `'lobby'`; `FATAL_CODES` ohne `wrong_password`).

- [ ] **Step 3: Implementieren**

`packages/client/src/online.ts`, Fall `'phase'` ersetzen:

```ts
      case 'phase':
        if (msg.phase !== 'lobby' && msg.phase !== 'playing' && msg.phase !== 'shop' && msg.phase !== 'final') break;
        this.roomPhase = msg.phase;
        this.onPhase?.();
        break;
```

und den Kommentar des Felds `roomPhase` ändern zu `/** Phase des Raums laut Server (lobby, playing, shop, final). */`.

`packages/client/src/onlineMenu.ts`, in `ERRORS` nach `cannot_buy: 'Kauf abgelehnt.',` einfügen:

```ts
  wrong_password: 'Passwort falsch oder nötig.',
  avatar_taken: 'Die Figur ist schon vergeben.',
```

`packages/client/src/reconnect.ts`, in `FATAL_CODES` nach `'bad_message',` einfügen:

```ts
  // Token abgelaufen, Raum hat ein Passwort: ohne Passwort kommt man nicht mehr hinein
  'wrong_password',
```

`packages/client/src/scenes/ShopScene.ts`:

```ts
      online.onPhase = () => {
        if (online.roomPhase === 'lobby') this.leaveOnline('Der Host hat die Serie beendet.');
      };
```

ersetzen durch

```ts
      online.onPhase = () => {
        // Endwertung und Rückkehr in die Lobby zeigt erst Plan 2; bis dahin zurück ins Menü
        if (online.roomPhase === 'final') this.leaveOnline('Die Serie ist vorbei.');
        else if (online.roomPhase === 'lobby') this.leaveOnline('Der Host hat die Serie beendet.');
      };
```

und

```ts
      // Serie wurde beendet, während dieser Spieler noch auf der Rangliste stand
      else if (online.roomPhase === 'lobby') this.leaveOnline('Der Host hat die Serie beendet.');
```

ersetzen durch

```ts
      // Serie ist zu Ende (letzte Runde oder vom Host beendet), während dieser Spieler noch auf der Rangliste stand
      else if (online.roomPhase === 'final') this.leaveOnline('Die Serie ist vorbei.');
      else if (online.roomPhase === 'lobby') this.leaveOnline('Der Host hat die Serie beendet.');
```

`packages/client/src/scenes/GameScene.ts`, in `tickReconnect` direkt vor `if (this.joinedSeen && online.roomPhase === 'shop' && online.shop) {` einfügen:

```ts
    // Zurück, aber die Serie ist vorbei: Endwertung gibt es erst mit Plan 2, also ins Menü
    if (this.joinedSeen && online.roomPhase === 'final') {
      this.leaveToMenu('Die Serie ist vorbei.');
      return true;
    }
```

Hinweis: `GameScene` lässt `phase 'final'` während der Rangliste am Rundenende unbeachtet (der `onPhase`-Handler reagiert nur auf `lobby`); "weiter" führt in die Shop-Szene, die dann mit dem Hinweis ins Menü geht. `MenuScene.openOnline` bleibt unverändert, weil `showOnlineMenu` nur bei `start` oder einem Shop-Stand endet, nie in `final`.

- [ ] **Step 4: Gesamte Suite**

Run (Repo-Wurzel): `npm test; npm run typecheck`
Expected: core, client und server PASS, Typecheck ohne Fehler.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/onlineMenu.ts packages/client/src/online.ts packages/client/src/reconnect.ts packages/client/src/scenes/ShopScene.ts packages/client/src/scenes/GameScene.ts packages/client/test/online.test.ts packages/client/test/chatLogic.test.ts packages/client/test/reconnect.test.ts
git commit -m "fix(client): accept the final phase and new protocol fields

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec-Abdeckung (Kapitel der Spec → Task):**
- §1.1 `create` mit `roomName`/`visibility`/`password`, Standardname → Task 1 (Parser, `defaultRoomName`), Task 3 (`RoomManager.create`).
- §1.2 Bereinigung, leer = fehlend, zu langes Passwort = `bad_message` → Task 1 (`cleanField`, `optionalField`; Ruling 2, 3, 5).
- §1.3 privat = nicht in der Liste; Passwort unabhängig; Reconnect ohne Passwort → Task 3, Task 6, Task 7.
- §1.4 unveränderlich → `readonly name/visibility/passwordHash` (Task 3); keine Nachricht zum Ändern.
- §1.5 Hash im Speicher, zeitkonstant, nie gesendet/geloggt → Task 3 (`sha256`, `timingSafeEqual`, Test "never sends the password"), Task 7 (Drahttest).
- §1.6 `join` mit `password`, `wrong_password` → Task 1, 3, 7.
- §1.7 5 Fehlversuche/Minute → Task 7 (Ruling 8).
- §1.8 `lobby` mit `roomName`, `visibility`, `locked` → Task 1, 3.
- §2.1–2.6 Raumliste, Felder, Sortierung, 50, 1/s, keine Geheimnisse, beitretbar → Task 1 (`RoomInfo`), Task 6, Task 7. Graue Zeilen sind Client (Plan 2).
- §3.1–3.6 Avatare, Index, Default-Reihenfolge, Wunsch, `setAvatar`, Freigabe, Farbe unabhängig → Task 1, Task 4 (Farbe bleibt unverändert in `join`).
- §3.7 Client-Anzeige und `localStorage` → Plan 2. §3.8 `snap` ohne Avatare → unverändert (Global Constraints).
- §4.1–4.2 `rounds`, `setRounds`, `start` mit `rounds`/`round` → Task 1, Task 5.
- §4.3–4.5 `final` nach letzter Runde, `rounds = 0`, `endSeries` → `final`, `wrong_phase` in Lobby/Runde → Task 5.
- §4.6 `toLobby`, was bleibt/zurückgesetzt, Host-Übergabe → Task 5 (Ruling 16, 17), Task 7.
- §4.7 Chat nach Rückkehr, Verlauf bleibt → Task 5 (Test "keeps … chat").
- §4.8 `RoomPhase` mit `final` → Task 1.
- §5 Online-Menü → Plan 2.
- §6 Protokoll und Konstanten → Task 1.

**Platzhalter-Scan:** keine "TBD"/"später"; jeder Code-Schritt enthält den Code. Die sieben `lobby`-Literale in Task 8 sind mit Zeilennummern und dem Ersatzmuster benannt.

**Typkonsistenz:** `join(name, conn, token?, extras?: JoinExtras)` in Task 3 eingeführt und in Task 4, 5, 6, 7 so benutzt; `RoomManager.create(name, conn, opts?: CreateOptions)` in Task 3 und Task 7; `setAvatar(m: Member, avatar)`, `setRounds(byId, rounds)`, `toLobby(byId)` wie in der Namenstabelle; `Session.passwordFails`/`lastListRooms` in Task 7 und Test. `lobbyMessage` bekommt `rounds` in Task 3 (Konstante) und `this.rounds()` in Task 5.

**Review Focus:** alle fünf Punkte haben Tests in der genannten Task.
