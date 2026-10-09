# Online-Räume: Client – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Client bietet im Dialog "Online spielen" drei Tabs (Raum erstellen mit Raumname/Sichtbarkeit/Passwort, Beitreten mit Passwort, Raumliste), zeigt in der Lobby Raumname, Schloss, Figurauswahl und (für den Host) die Rundenzahl, nutzt im Spiel die gewählte Figur und zeigt nach der Serie eine Endwertung mit Gesamtsieger, von der der Host alle zurück in dieselbe Lobby holt.

**Architecture:** Alle Entscheidungen stecken in reinen, getesteten Modulen: `roomList.ts` (Raumliste prüfen, Zeilen, Auswahl), `onlineMenuLogic.ts` (drei Tabs, Erstellen-Anfrage), `avatarGrid.ts` (Raster, Pfeiltasten), `finalView.ts` (Endwertung, Gesamtsieger, Szenenwahl), Helfer in `playerChars.ts`, `settings.ts`, `roundTime.ts`, `text.ts`. `OnlineConnection` (`online.ts`) spricht die neuen Nachrichten. Die DOM-Oberfläche (`onlineMenu.ts`) und die neue Phaser-Szene `FinalScene` setzen diese Module nur zusammen. Die Rückkehr aus der Endwertung in die Lobby nutzt dieselbe Verbindung (`showOnlineMenu(..., { resume })`), damit Chatverlauf und Platz erhalten bleiben.

**Tech Stack:** TypeScript 5.7, Vite 6, Phaser 3.90, Vitest 3 (npm workspace `@pfandraiders/client`, nutzt `@pfandraiders/core`).

**Spec:** `docs/superpowers/specs/2026-10-09-online-raeume-design.md` (vor allem §3.7, §4.4–4.7, §5). Setzt Plan 1 voraus: `docs/superpowers/plans/2026-10-09-online-raeume-core-server.md`.

**Voraussetzung:** Plan 1 ist auf dem Arbeitsbranch umgesetzt (Commit "fix(client): accept the final phase and new protocol fields" ist enthalten). Vor Task 1 prüfen: `grep -n "wrong_password" packages/client/src/onlineMenu.ts` liefert eine Zeile, und `npm test` in der Repo-Wurzel ist grün.

## Global Constraints

- Alle Texte für Spieler sind deutsch, mit echten Umlauten.
- Code-Kommentare sind deutsch wie im bestehenden Code; Bezeichner bleiben englisch.
- Jeder Commit endet mit der Zeile `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (nach einer Leerzeile).
- `todo.md` und `idee.md` werden nie gestaged oder committet. Immer mit expliziten Pfaden `git add <pfad>` arbeiten, nie `git add -A` oder `git add .`.
- Das Verzeichnis `.claude/` wird nie gelöscht.
- Kein Python, keine Python-Skripte.
- Der Kern (`packages/core`) wird in diesem Plan nicht geändert; er bleibt deterministisch. Die Snapshot-Allow-List (`packages/core/src/snapshot.ts`) bleibt unberührt; Avatare kommen nur aus `lobby`/`start` (Spec §3.8).
- DOM-Text nur über `textContent`/Textknoten, nie `innerHTML` (wie im bestehenden `onlineMenu.ts`); Raumnamen und Spielernamen kommen vom Server und sind fremde Eingaben.
- Ein Passwort gehört nie in den Teilen-Link, nie in `localStorage`/`sessionStorage` und nie in eine Konsolenausgabe.
- Nach jeder Task sind `npm test -w @pfandraiders/client` und `npm run typecheck -w @pfandraiders/client` grün; am Ende zusätzlich `npm test` und `npm run typecheck` in der Repo-Wurzel.
- Testbefehl: `cd packages/client; npx vitest run test/<datei>.test.ts`.

## Namenstabelle (aus Plan 1, verbindlich; neue Namen dieses Plans darunter)

Aus Plan 1: `AVATAR_COUNT`, `AVATAR_DEFAULT_ORDER`, `isAvatar`, `finalRanking`, `RoomInfo`, `RoomVisibility`, `isRounds`, `ROUNDS_CHOICES`, `DEFAULT_ROUNDS`, `MAX_ROOM_NAME_LENGTH`, `MAX_PASSWORD_LENGTH`, `MAX_LISTED_ROOMS`, `defaultRoomName`, `cleanField`, `RoomPhase` (mit `'final'`), `RosterEntry.avatar`, Nachrichten `create {…, roomName?, visibility?, password?, avatar?}`, `join {…, password?, avatar?}`, `listRooms`, `setAvatar {avatar}`, `setRounds {rounds}`, `toLobby`, `rooms {rooms}`, `lobby {…, roomName, visibility, locked, rounds}`, `start {…, rounds, round}`.

| Ort | Name | Typ / Form |
| --- | --- | --- |
| `playerChars.ts` | `characterOfAvatar(avatar: unknown, fallbackIndex: number): string` | `ALL_CHARACTERS[avatar]` oder `characterFor(fallbackIndex)` |
| `settings.ts` | `loadAvatarWish(store?): number \| undefined`, `saveAvatarWish(avatar: number, store?): void` | Schlüssel `pfandraiders.avatar` |
| `roundTime.ts` | `roundsLabel(rounds: number): string` | `'offen'`, `'1 Runde'`, `'3 Runden'` |
| `roomList.ts` | `parseRoomList(x: unknown): RoomInfo[] \| null`, `isJoinable(r: RoomInfo): boolean`, `RoomRow`, `roomRows(rooms): RoomRow[]`, `firstSelectable(rows): number`, `moveSelection(rows, current, dir: 1 \| -1): number`, `listAction(row: RoomRow \| undefined): ListAction`, `refreshAllowed(last: number, now: number): boolean`, `ROOM_LIST_HEADER`, `EMPTY_ROOM_LIST_TEXT`, `ROOM_LIST_REFRESH_MS` | |
| `onlineMenuLogic.ts` | `MenuTab = 'host' \| 'join' \| 'list'`, `TABS`, `TAB_LABELS`, `nextTab`, `parseTab`, `sanitizeRoomCode`, `CreateForm`, `CreateRequest`, `createRequest(form)`, `shouldReportClose(room: string): boolean` | |
| `avatarGrid.ts` | `AVATAR_COLUMNS = 8`, `AvatarCell`, `avatarCells(roster, you)`, `takenByOthers(roster, you): Set<number>`, `stepAvatar(current, key, taken, columns?)` | |
| `finalView.ts` | `FinalRow`, `finalRows(entries, roster, you)`, `winnerText(rows)`, `finalFooter(isHost, actionLabel)`, `OnlineScene = 'game' \| 'shop' \| 'final'`, `sceneForPhase(phase, hasShopState)` | |
| `text.ts` | `resultFooter(role, labels, final = false)` | |
| `online.ts` | `CreateOptions`, `JoinOptions`; Felder `roomName`, `visibility`, `locked`, `rounds`, `round`, `rooms`, `onRooms`; Methoden `create(name, opts?)`, `join(room, name, token?, opts?)`, `listRooms()`, `setAvatar(avatar)`, `setRounds(rounds)`, `toLobby()`, `ownAvatar(): number \| null` | |
| `onlineMenu.ts` | `showOnlineMenu(url, socketFactory?, opts?: { joinCode?: string; resume?: OnlineConnection })` | |
| `scenes/FinalScene.ts` | `FinalScene` (Szenen-Key `'final'`), Daten `{ online: OnlineConnection }` | |
| `scenes/MenuScene.ts` | `init(data?: { notice?: string; resumeOnline?: OnlineConnection })` | |
| `hud.ts` | `PlayerHud`-Konstruktor: zwei neue letzte Parameter `isFinal: () => boolean = () => false`, `charOf: (id: string) => string \| null = () => null` | Ergebnisfeld mit Figur je Zeile |

## Entscheidungen (Rulings)

1. **Namensfeld** steht oben im Dialog über den Tabs und gilt für alle drei Tabs (Spec §5.3). Es wird wie bisher gemerkt.
2. **Raumname, Sichtbarkeit und Passwort** des Erstellen-Tabs werden nicht gespeichert; Sichtbarkeit beginnt immer mit "Öffentlich". Der Platzhalter des Raumnamens zeigt den Standardnamen (`defaultRoomName`) zum eingegebenen Namen.
3. **Raumliste** lädt beim Öffnen des Tabs und mit "Aktualisieren" (Klick oder Taste R, wenn die Liste den Fokus hat). Kein automatisches Nachladen im Takt. Der Client fragt höchstens einmal pro Sekunde (`ROOM_LIST_REFRESH_MS = 1000`), passend zum Server-Limit.
4. **Leerlauf-Schließen**: Der Server schließt einen Socket ohne Raum nach 30 s. Ohne Raum (`conn.room === ''`) meldet der Dialog das Schließen nicht; die nächste Aktion verbindet neu (`shouldReportClose`).
5. **Zeilen der Raumliste**: Status "Lobby" (beitretbar), "Voll" (Lobby ohne freien Platz), "Läuft" (Runde, Shop, Endwertung). Nicht beitretbare Zeilen sind grau, nicht anklickbar und werden von der Pfeilauswahl übersprungen. Ein Schloss 🔒 vor dem Raumnamen zeigt ein Passwort.
6. **Passwortabfrage aus der Liste**: Wählt man einen Raum mit Schloss, erscheint unter der Liste ein Passwortfeld mit "Beitreten" und "Zurück". Bei `wrong_password` bleibt das Feld offen und der Hinweis "Passwort falsch oder nötig." steht darunter.
7. **Beitreten-Tab**: Das Passwortfeld ist immer sichtbar und optional. Ohne vollständigen Raumcode wird nichts gesendet ("Bitte einen Raumcode eingeben.").
8. **Figurenwunsch**: Der Wunsch aus `localStorage` (`pfandraiders.avatar`) geht bei `create` und `join` mit. Gespeichert wird er erst, wenn die Lobby-Nachricht die selbst gewählte Figur bestätigt (nicht schon beim Klick).
9. **Figurenraster**: 8 Spalten × 3 Reihen in der Reihenfolge `ALL_CHARACTERS`. Pfeiltasten wählen sofort die nächste freie Figur in der Richtung (mit Umlauf, vergebene werden übersprungen); Klick auf eine freie Figur wählt sie. Vergeben = halbdurchsichtig mit Tooltip "vergeben an <Name>", eigene = gelber Rahmen.
10. **Endwertung** ist die Phaser-Szene `'final'`. Alle Spieler im Raum in Phase `final` sehen sie, auch Spätbeitreter und Rückkehrer. Nur der Host hat "[ Zur Lobby ]" (Klick oder ein **neuer** Druck der Aktionstaste des Online-Geräts über `ShopNav`, wie im Shop: eine aus Rangliste oder Shop – etwa von "Serie beenden" – noch gehaltene Taste zählt nicht, damit niemand die Endwertung überspringt; Ton `pickup`); alle anderen sehen "Warte auf den Host…". Esc verlässt den Raum (Nachricht `leave`) und führt ins Menü. Die Fußzeile wird jedes Bild neu bestimmt, damit ein neuer Host (Spec §4.6) sofort den Knopf bekommt.
11. **Namen in der Endwertung** kommen aus der Raumliste; wer nicht mehr im Raum ist, erscheint als "(gegangen)" in Grau ohne Figur. Gleicher Gesamtverdienst teilt sich den Platz (1, 1, 3); alle auf Platz 1 sind Gesamtsieger: "Gesamtsieger: Anna", "Gesamtsieger: Anna und Bob", "Gesamtsieger: Anna, Bob und Cara". Leere Wertung: "Keine Wertung".
12. **Zurück in die Lobby** (Phase `lobby` nach `toLobby`) nutzt dieselbe `OnlineConnection` (`showOnlineMenu(..., { resume })`), weil der Server den Chatverlauf nicht neu sendet. Das gilt aus `FinalScene`, `GameScene` (Rangliste noch offen) und `ShopScene`.
13. **Fußzeile der Rangliste** nach der letzten Runde lautet "Weiter zur Endwertung: R oder <Aktion>"; "weiter" führt dann in `FinalScene` statt in den Shop.
14. **Lokales Spiel** bleibt unverändert: Figuren nach Slot (`characterFor`), keine Rundenzahl (die Spec regelt nur Räume).
15. **Figur im Spiel** online aus `RosterEntry.avatar`; fehlt sie oder ist ungültig (älterer Server), wie bisher `characterFor(Position in der Raumliste)`.
16. **Töne**: keine neuen Sound-IDs. `pickup` beim Drücken von "Zur Lobby" (wie Menübestätigung).
17. **Lobby-Kopf**: Raumname groß (Fallback "Raum CODE"), darunter "Code ABCD", dahinter "🔒 Passwort" bei Passwort und "privat" bei privaten Räumen; "Link kopieren" wie bisher.
18. **Figur in der Rundenrangliste** (Spec §3.7 "Rangliste"): Das Ergebnisfeld am Rundenende zeigt je Zeile das erste Bild der Figur (Maßstab 1) in der Lücke der Platz-Spalte, ohne die Zeilenbreite zu ändern. Lokal ist es die Slot-Figur.

## Review Focus

1. **Falsches Passwort aus der Raumliste** – der Spieler muss sehen, dass es am Passwort lag, und es sofort neu versuchen können. Test: Task 2 (`listAction` liefert für Schloss-Räume `'password'`); der Fehlertext "Passwort falsch oder nötig." steht seit Plan 1 in `ERRORS`; das offene Feld nach dem Fehler prüft Task 7, Schritt 7 (Punkt 3).
2. **Socket nach 30 s Leerlauf in der Raumliste geschlossen** – keine Fehlermeldung, Aktualisieren verbindet neu. Test: Task 3 (`shouldReportClose('')` ist `false`).
3. **Pfeiltaste im Raster, wenn in der Richtung alles vergeben ist** – nichts passiert, kein Fehler. Test: Task 4 ("stays when everything else is taken").
4. **Host verlässt den Raum, während alle auf der Endwertung stehen** – der neue Host bekommt den Knopf ohne Neuladen. Test: Task 5 (`finalFooter` für Host/Gast) und Task 9 (Fußzeile je Bild aus `isHost()`).
5. **Spieler steht noch auf der Rundenrangliste, als der Host zur Lobby zurückholt** – er landet in derselben Lobby mit erhaltenem Chat. Test: Task 6 ("keeps the chat when the room goes final and back to lobby") und Task 9 (`GameScene.backToLobby`).

## Dateien

| Datei | Aufgabe |
| --- | --- |
| `packages/client/src/playerChars.ts` | `characterOfAvatar` |
| `packages/client/src/settings.ts` | Figurenwunsch speichern |
| `packages/client/src/roundTime.ts` | `roundsLabel` |
| `packages/client/src/roomList.ts` (neu) | Raumliste: prüfen, Zeilen, Auswahl |
| `packages/client/src/onlineMenuLogic.ts` | drei Tabs, Erstellen-Anfrage, Schließen melden |
| `packages/client/src/avatarGrid.ts` (neu) | Figurenraster |
| `packages/client/src/finalView.ts` (neu) | Endwertung, Szenenwahl |
| `packages/client/src/text.ts` | Fußzeile "Weiter zur Endwertung" |
| `packages/client/src/hud.ts` | Fußzeile je nach Phase |
| `packages/client/src/online.ts` | neue Nachrichten und Felder |
| `packages/client/src/onlineMenu.ts` | Dialog mit drei Tabs, Lobby mit Figurenraster und Rundenzahl, Fortsetzen |
| `packages/client/src/scenes/FinalScene.ts` (neu) | Endwertung |
| `packages/client/src/main.ts` | `FinalScene` registrieren |
| `packages/client/src/scenes/GameScene.ts` | Figur aus Avatar, Weg in Endwertung/Lobby |
| `packages/client/src/scenes/ShopScene.ts` | Weg in Endwertung/Lobby |
| `packages/client/src/scenes/MenuScene.ts` | Fortsetzen der Lobby, Szenenwahl |
| `packages/client/test/*.test.ts` | Tests je Modul (siehe Tasks) |
| `README.md` | Online-Abschnitt |

---

### Task 1: Helfer für Figur, Figurenwunsch und Rundenzahl

**Files:**
- Modify: `packages/client/src/playerChars.ts`
- Modify: `packages/client/src/settings.ts`
- Modify: `packages/client/src/roundTime.ts`
- Modify: `packages/client/test/playerChars.test.ts`
- Modify: `packages/client/test/settings.test.ts`
- Modify: `packages/client/test/roundTime.test.ts`

**Interfaces:**
- Consumes: `AVATAR_COUNT`, `AVATAR_DEFAULT_ORDER`, `isAvatar` aus `@pfandraiders/core`.
- Produces: `characterOfAvatar(avatar: unknown, fallbackIndex: number): string`, `loadAvatarWish(store?: KeyValueStore): number | undefined`, `saveAvatarWish(avatar: number, store?: KeyValueStore): void`, `roundsLabel(rounds: number): string`.

- [ ] **Step 1: Failing tests**

An `packages/client/test/playerChars.test.ts` anhängen (Import oben um `characterOfAvatar` ergänzen und `import { AVATAR_COUNT, AVATAR_DEFAULT_ORDER } from '@pfandraiders/core';` hinzufügen):

```ts
describe('avatars and characters', () => {
  it('core and client agree: 24 avatars, the default order starts with PLAYER_CHARACTERS', () => {
    expect(AVATAR_COUNT).toBe(ALL_CHARACTERS.length);
    expect(AVATAR_DEFAULT_ORDER.slice(0, PLAYER_CHARACTERS.length).map((i) => ALL_CHARACTERS[i])).toEqual([...PLAYER_CHARACTERS]);
  });

  it('maps a valid avatar to its sheet and falls back to the position otherwise', () => {
    expect(characterOfAvatar(0, 5)).toBe('m01');
    expect(characterOfAvatar(23, 5)).toBe('f12');
    expect(characterOfAvatar(undefined, 1)).toBe(characterFor(1));
    expect(characterOfAvatar(24, 2)).toBe(characterFor(2));
    expect(characterOfAvatar(1.5, 0)).toBe(characterFor(0));
    expect(characterOfAvatar('3', 0)).toBe(characterFor(0));
  });
});
```

An `packages/client/test/settings.test.ts` anhängen (Import um `loadAvatarWish, saveAvatarWish` ergänzen):

```ts
describe('avatar wish', () => {
  it('is undefined without a stored value and for garbage', () => {
    expect(loadAvatarWish(memStore())).toBeUndefined();
    const store = memStore();
    for (const raw of ['', 'x', '24', '-1', '1.5']) {
      store.setItem('pfandraiders.avatar', raw);
      expect(loadAvatarWish(store)).toBeUndefined();
    }
  });

  it('stores and loads a valid avatar and ignores invalid ones', () => {
    const store = memStore();
    saveAvatarWish(7, store);
    expect(store.map.get('pfandraiders.avatar')).toBe('7');
    expect(loadAvatarWish(store)).toBe(7);
    saveAvatarWish(99, store);
    expect(loadAvatarWish(store)).toBe(7);
  });

  it('never throws when the storage is locked', () => {
    const locked = {
      getItem: () => {
        throw new Error('locked');
      },
      setItem: () => {
        throw new Error('locked');
      },
    };
    expect(loadAvatarWish(locked)).toBeUndefined();
    expect(() => saveAvatarWish(3, locked)).not.toThrow();
  });
});
```

An `packages/client/test/roundTime.test.ts` anhängen (Import um `roundsLabel` ergänzen):

```ts
describe('roundsLabel', () => {
  it('names the round count in German', () => {
    expect(roundsLabel(0)).toBe('offen');
    expect(roundsLabel(1)).toBe('1 Runde');
    expect(roundsLabel(3)).toBe('3 Runden');
    expect(roundsLabel(5)).toBe('5 Runden');
  });
});
```

- [ ] **Step 2: Fehlschlag sehen**

Run: `cd packages/client; npx vitest run test/playerChars.test.ts test/settings.test.ts test/roundTime.test.ts`
Expected: FAIL (fehlende Exporte).

- [ ] **Step 3: Implementieren**

`packages/client/src/playerChars.ts`: oben `import { isAvatar } from '@pfandraiders/core';` ergänzen und nach `characterIndex` einfügen:

```ts
/**
 * Figur eines Online-Spielers: Bogen zum Avatar aus der Raumliste (Index in ALL_CHARACTERS).
 * Fehlt der Avatar oder ist er ungültig (älterer Server), wie bisher nach Position (characterFor).
 */
export function characterOfAvatar(avatar: unknown, fallbackIndex: number): string {
  return isAvatar(avatar) ? ALL_CHARACTERS[avatar] : characterFor(fallbackIndex);
}
```

`packages/client/src/settings.ts`: Import ergänzen zu `import { DEFAULT_ROUND_MS, isAvatar, isRoundMs } from '@pfandraiders/core';` und nach `saveLocalRoundMs` einfügen:

```ts

// ---- Figurenwunsch online ----

const AVATAR_KEY = 'pfandraiders.avatar';

/** Zuletzt gewählte Figur (0 bis 23); undefined = keine oder ungültig. Wirft nie. */
export function loadAvatarWish(store: KeyValueStore | undefined = defaultStore()): number | undefined {
  try {
    const raw = store?.getItem(AVATAR_KEY);
    if (raw === null || raw === undefined || raw.trim() === '') return undefined;
    const n = Number(raw);
    return isAvatar(n) ? n : undefined;
  } catch {
    return undefined;
  }
}

/** Merkt die gewählte Figur; ungültige Werte werden ignoriert. Wirft nie. */
export function saveAvatarWish(avatar: number, store: KeyValueStore | undefined = defaultStore()): void {
  if (!isAvatar(avatar)) return;
  try {
    store?.setItem(AVATAR_KEY, String(avatar));
  } catch {
    // Speicher gesperrt: Wunsch gilt nur für diese Sitzung
  }
}
```

`packages/client/src/roundTime.ts` anhängen:

```ts

/** Rundenzahl einer Serie: 0 = "offen", 1 = "1 Runde", sonst "n Runden". */
export function roundsLabel(rounds: number): string {
  if (rounds === 0) return 'offen';
  return rounds === 1 ? '1 Runde' : `${rounds} Runden`;
}
```

- [ ] **Step 4: Tests und Typecheck**

Run: `cd packages/client; npx vitest run test/playerChars.test.ts test/settings.test.ts test/roundTime.test.ts; npx tsc --noEmit`
Expected: PASS, keine Typfehler.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/playerChars.ts packages/client/src/settings.ts packages/client/src/roundTime.ts packages/client/test/playerChars.test.ts packages/client/test/settings.test.ts packages/client/test/roundTime.test.ts
git commit -m "feat(client): helpers for avatar sheets, avatar wish and round count label

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Raumliste als reine Logik

**Files:**
- Create: `packages/client/src/roomList.ts`
- Create: `packages/client/test/roomList.test.ts`

**Interfaces:**
- Consumes: `RoomInfo`, `MAX_LISTED_ROOMS`, `MAX_ROOM_NAME_LENGTH`, `MAX_NAME_LENGTH`, `MAX_ROOM_PLAYERS`, `ROOM_CODE_LENGTH` aus core; `sanitizeRoomCode` aus `onlineMenuLogic.ts`.
- Produces: siehe Namenstabelle (`roomList.ts`). `RoomRow = { code: string; name: string; host: string; players: string; status: 'Lobby' | 'Voll' | 'Läuft'; joinable: boolean; locked: boolean }`. `ListAction = { kind: 'join'; code: string } | { kind: 'password'; code: string; name: string } | null`.

- [ ] **Step 1: Failing test**

`packages/client/test/roomList.test.ts`:

```ts
import type { RoomInfo } from '@pfandraiders/core';
import { describe, expect, it } from 'vitest';
import {
  EMPTY_ROOM_LIST_TEXT,
  firstSelectable,
  isJoinable,
  listAction,
  moveSelection,
  parseRoomList,
  refreshAllowed,
  ROOM_LIST_HEADER,
  roomRows,
} from '../src/roomList';

const info = (over: Partial<RoomInfo> = {}): RoomInfo => ({
  code: 'ABCD',
  name: 'Bude',
  host: 'Anna',
  players: 2,
  max: 8,
  phase: 'lobby',
  locked: false,
  ...over,
});

describe('parseRoomList', () => {
  it('accepts a valid list', () => {
    expect(parseRoomList([info(), info({ code: 'EFGH', phase: 'playing', locked: true })])).toEqual([
      info(),
      info({ code: 'EFGH', phase: 'playing', locked: true }),
    ]);
  });

  it('rejects non-arrays and skips broken entries', () => {
    expect(parseRoomList(null)).toBeNull();
    expect(parseRoomList({ rooms: [] })).toBeNull();
    const broken = [
      info({ code: 'ab' }),
      info({ code: 'IIII' }),
      info({ name: 'x'.repeat(25) }),
      info({ host: 5 as unknown as string }),
      info({ players: -1 }),
      info({ players: 9, max: 8 }),
      info({ max: 0 }),
      info({ phase: 'final' as unknown as RoomInfo['phase'] }),
      info({ locked: 'ja' as unknown as boolean }),
      'Raum',
      null,
    ];
    expect(parseRoomList([...broken, info({ code: 'WXYZ' })])).toEqual([info({ code: 'WXYZ' })]);
  });

  it('keeps at most 50 entries', () => {
    expect(parseRoomList(Array.from({ length: 60 }, () => info()))).toHaveLength(50);
  });
});

describe('rows', () => {
  it('has the header and empty text of the spec', () => {
    expect(ROOM_LIST_HEADER).toEqual(['Raumname', 'Host', 'Spieler', 'Status']);
    expect(EMPTY_ROOM_LIST_TEXT).toBe('Keine öffentlichen Räume');
  });

  it('marks only lobbies with free seats as joinable', () => {
    expect(isJoinable(info())).toBe(true);
    expect(isJoinable(info({ players: 8 }))).toBe(false);
    expect(isJoinable(info({ phase: 'playing' }))).toBe(false);
    expect(isJoinable(info({ phase: 'shop' }))).toBe(false);
  });

  it('builds rows with player count and status text', () => {
    expect(roomRows([info({ locked: true }), info({ code: 'EFGH', players: 8 }), info({ code: 'JKLM', phase: 'shop' })])).toEqual([
      { code: 'ABCD', name: 'Bude', host: 'Anna', players: '2/8', status: 'Lobby', joinable: true, locked: true },
      { code: 'EFGH', name: 'Bude', host: 'Anna', players: '8/8', status: 'Voll', joinable: false, locked: false },
      { code: 'JKLM', name: 'Bude', host: 'Anna', players: '2/8', status: 'Läuft', joinable: false, locked: false },
    ]);
  });
});

describe('selection', () => {
  const rows = roomRows([info({ phase: 'playing' }), info({ code: 'EFGH' }), info({ code: 'JKLM', players: 8 }), info({ code: 'NPQR' })]);

  it('starts at the first joinable row, -1 without any', () => {
    expect(firstSelectable(rows)).toBe(1);
    expect(firstSelectable(roomRows([info({ phase: 'shop' })]))).toBe(-1);
    expect(firstSelectable([])).toBe(-1);
  });

  it('moves to the next joinable row and stays at the ends', () => {
    expect(moveSelection(rows, 1, 1)).toBe(3);
    expect(moveSelection(rows, 3, 1)).toBe(3);
    expect(moveSelection(rows, 3, -1)).toBe(1);
    expect(moveSelection(rows, 1, -1)).toBe(1);
    expect(moveSelection(rows, -1, 1)).toBe(1);
    expect(moveSelection([], -1, 1)).toBe(-1);
  });
});

describe('listAction', () => {
  it('joins open rooms directly, asks for the password of locked ones and ignores grey rows', () => {
    const [open, locked, full] = roomRows([info(), info({ code: 'EFGH', name: 'Geheim', locked: true }), info({ code: 'JKLM', players: 8 })]);
    expect(listAction(open)).toEqual({ kind: 'join', code: 'ABCD' });
    expect(listAction(locked)).toEqual({ kind: 'password', code: 'EFGH', name: 'Geheim' });
    expect(listAction(full)).toBeNull();
    expect(listAction(undefined)).toBeNull();
  });
});

describe('refreshAllowed', () => {
  it('allows one refresh per second', () => {
    expect(refreshAllowed(-Infinity, 0)).toBe(true);
    expect(refreshAllowed(1000, 1999)).toBe(false);
    expect(refreshAllowed(1000, 2000)).toBe(true);
  });
});
```

- [ ] **Step 2: Fehlschlag sehen**

Run: `cd packages/client; npx vitest run test/roomList.test.ts`
Expected: FAIL (`Cannot find module '../src/roomList'`).

- [ ] **Step 3: Implementieren**

`packages/client/src/roomList.ts`:

```ts
import { MAX_LISTED_ROOMS, MAX_NAME_LENGTH, MAX_ROOM_NAME_LENGTH, MAX_ROOM_PLAYERS, ROOM_CODE_LENGTH } from '@pfandraiders/core';
import type { RoomInfo } from '@pfandraiders/core';
import { sanitizeRoomCode } from './onlineMenuLogic';

/** Spalten der Raumliste (Spec §5.3) */
export const ROOM_LIST_HEADER: readonly string[] = ['Raumname', 'Host', 'Spieler', 'Status'];
export const EMPTY_ROOM_LIST_TEXT = 'Keine öffentlichen Räume';
/** Der Server beantwortet höchstens eine Anfrage pro Sekunde */
export const ROOM_LIST_REFRESH_MS = 1000;

export interface RoomRow {
  code: string;
  name: string;
  host: string;
  /** "3/8" */
  players: string;
  status: 'Lobby' | 'Voll' | 'Läuft';
  joinable: boolean;
  locked: boolean;
}

export type ListAction = { kind: 'join'; code: string } | { kind: 'password'; code: string; name: string } | null;

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function intIn(x: unknown, min: number, max: number): x is number {
  return typeof x === 'number' && Number.isInteger(x) && x >= min && x <= max;
}

/** Prüft die Raumliste vom Server: null = keine Liste; kaputte Einträge fallen weg; höchstens MAX_LISTED_ROOMS. */
export function parseRoomList(x: unknown): RoomInfo[] | null {
  if (!Array.isArray(x)) return null;
  const out: RoomInfo[] = [];
  for (const e of x) {
    if (out.length >= MAX_LISTED_ROOMS) break;
    if (!isObj(e)) continue;
    const { code, name, host, players, max, phase, locked } = e;
    if (typeof code !== 'string' || code.length !== ROOM_CODE_LENGTH || sanitizeRoomCode(code) !== code) continue;
    if (typeof name !== 'string' || name.length === 0 || name.length > MAX_ROOM_NAME_LENGTH) continue;
    if (typeof host !== 'string' || host.length === 0 || host.length > MAX_NAME_LENGTH) continue;
    if (!intIn(max, 1, MAX_ROOM_PLAYERS) || !intIn(players, 0, max)) continue;
    if (phase !== 'lobby' && phase !== 'playing' && phase !== 'shop') continue;
    if (typeof locked !== 'boolean') continue;
    out.push({ code, name, host, players, max, phase, locked });
  }
  return out;
}

/** Beitretbar: Lobby mit freiem Platz (Spec §2.6). */
export function isJoinable(r: RoomInfo): boolean {
  return r.phase === 'lobby' && r.players < r.max;
}

export function roomRows(rooms: readonly RoomInfo[]): RoomRow[] {
  return rooms.map((r) => ({
    code: r.code,
    name: r.name,
    host: r.host,
    players: `${r.players}/${r.max}`,
    status: r.phase !== 'lobby' ? 'Läuft' : r.players < r.max ? 'Lobby' : 'Voll',
    joinable: isJoinable(r),
    locked: r.locked,
  }));
}

/** Erste wählbare Zeile; -1 = keine. */
export function firstSelectable(rows: readonly RoomRow[]): number {
  return rows.findIndex((r) => r.joinable);
}

/** Nächste wählbare Zeile in Richtung `dir`; graue werden übersprungen; am Ende bleibt die Auswahl. */
export function moveSelection(rows: readonly RoomRow[], current: number, dir: 1 | -1): number {
  if (current < 0) return firstSelectable(rows);
  for (let i = current + dir; i >= 0 && i < rows.length; i += dir) {
    if (rows[i].joinable) return i;
  }
  return current;
}

/** Was Enter oder Klick auf einer Zeile auslöst: direkt beitreten, erst Passwort fragen oder nichts (grau). */
export function listAction(row: RoomRow | undefined): ListAction {
  if (!row || !row.joinable) return null;
  return row.locked ? { kind: 'password', code: row.code, name: row.name } : { kind: 'join', code: row.code };
}

/** Darf die Liste neu geladen werden? (höchstens einmal pro ROOM_LIST_REFRESH_MS) */
export function refreshAllowed(last: number, now: number): boolean {
  return now - last >= ROOM_LIST_REFRESH_MS;
}
```

- [ ] **Step 4: Tests und Typecheck**

Run: `cd packages/client; npx vitest run test/roomList.test.ts; npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/roomList.ts packages/client/test/roomList.test.ts
git commit -m "feat(client): room list logic

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Drei Tabs und Erstellen-Anfrage

**Files:**
- Modify: `packages/client/src/onlineMenuLogic.ts`
- Modify: `packages/client/test/onlineMenuLogic.test.ts`
- Modify: `packages/client/src/onlineMenu.ts:5,181` (nur Import und `tabLabels`, damit der Typecheck grün bleibt)

**Interfaces:**
- Consumes: `cleanField`, `MAX_ROOM_NAME_LENGTH`, `MAX_PASSWORD_LENGTH`, `RoomVisibility` aus core.
- Produces: `MenuTab = 'host' | 'join' | 'list'`, `TABS: readonly MenuTab[]`, `TAB_LABELS: Record<MenuTab, string>`, `nextTab`, `parseTab`, `CreateForm = { roomName: string; visibility: RoomVisibility; password: string }`, `CreateRequest = { ok: true; value: { roomName?: string; visibility: RoomVisibility; password?: string } } | { ok: false; error: string }`, `createRequest(form: CreateForm): CreateRequest`, `shouldReportClose(room: string): boolean`.

- [ ] **Step 1: Tests anpassen und ergänzen**

In `packages/client/test/onlineMenuLogic.test.ts` den Import ersetzen:

```ts
import { createRequest, nextTab, parseTab, sanitizeRoomCode, shouldReportClose, TAB_LABELS, TABS } from '../src/onlineMenuLogic';
```

die Blöcke `describe('nextTab', …)` und `describe('parseTab', …)` vollständig ersetzen durch:

```ts
describe('tabs', () => {
  it('has three tabs with German labels', () => {
    expect(TABS).toEqual(['host', 'join', 'list']);
    expect(TAB_LABELS).toEqual({ host: 'Raum erstellen', join: 'Beitreten', list: 'Raumliste' });
  });
});

describe('nextTab', () => {
  it('wechselt mit den Pfeiltasten und bricht um', () => {
    expect(nextTab('host', 'ArrowRight')).toBe('join');
    expect(nextTab('join', 'ArrowRight')).toBe('list');
    expect(nextTab('list', 'ArrowRight')).toBe('host');
    expect(nextTab('host', 'ArrowLeft')).toBe('list');
    expect(nextTab('list', 'ArrowLeft')).toBe('join');
  });
  it('ignoriert andere Tasten', () => {
    expect(nextTab('host', 'Enter')).toBe('host');
    expect(nextTab('list', 'ArrowDown')).toBe('list');
  });
});

describe('parseTab', () => {
  it('erkennt join und list, alles andere ist host', () => {
    expect(parseTab('join')).toBe('join');
    expect(parseTab('list')).toBe('list');
    expect(parseTab('host')).toBe('host');
    expect(parseTab('LIST')).toBe('host');
    expect(parseTab(null)).toBe('host');
    expect(parseTab(42)).toBe('host');
  });
});

describe('createRequest', () => {
  it('sends only filled fields, cleaned', () => {
    expect(createRequest({ roomName: '  Bude ', visibility: 'private', password: ' pw ' })).toEqual({
      ok: true,
      value: { roomName: 'Bude', visibility: 'private', password: 'pw' },
    });
    expect(createRequest({ roomName: ' ', visibility: 'public', password: '' })).toEqual({ ok: true, value: { visibility: 'public' } });
  });

  it('explains too long fields in German', () => {
    expect(createRequest({ roomName: 'x'.repeat(25), visibility: 'public', password: '' })).toEqual({
      ok: false,
      error: 'Raumname: höchstens 24 Zeichen.',
    });
    expect(createRequest({ roomName: '', visibility: 'public', password: 'x'.repeat(17) })).toEqual({
      ok: false,
      error: 'Passwort: höchstens 16 Zeichen.',
    });
  });
});

describe('shouldReportClose', () => {
  it('reports a lost connection only inside a room', () => {
    expect(shouldReportClose('')).toBe(false);
    expect(shouldReportClose('ABCD')).toBe(true);
  });
});
```

- [ ] **Step 2: Fehlschlag sehen**

Run: `cd packages/client; npx vitest run test/onlineMenuLogic.test.ts`
Expected: FAIL (`TABS`, `createRequest` fehlen; `nextTab('join','ArrowRight')` ist noch `'host'`).

- [ ] **Step 3: Implementieren**

`packages/client/src/onlineMenuLogic.ts` vollständig ersetzen:

```ts
import { cleanField, MAX_PASSWORD_LENGTH, MAX_ROOM_NAME_LENGTH, ROOM_CODE_CHARS, ROOM_CODE_LENGTH } from '@pfandraiders/core';
import type { RoomVisibility } from '@pfandraiders/core';

export type MenuTab = 'host' | 'join' | 'list';

export const TABS: readonly MenuTab[] = ['host', 'join', 'list'];

export const TAB_LABELS: Record<MenuTab, string> = { host: 'Raum erstellen', join: 'Beitreten', list: 'Raumliste' };

/** Raumcode bereinigen: Großbuchstaben, nur erlaubte Zeichen, höchstens ROOM_CODE_LENGTH. */
export function sanitizeRoomCode(raw: string): string {
  let out = '';
  for (const ch of raw.toUpperCase()) {
    if (ROOM_CODE_CHARS.includes(ch)) out += ch;
    if (out.length >= ROOM_CODE_LENGTH) break;
  }
  return out;
}

/** Tab nach Pfeiltaste; ArrowLeft/ArrowRight wechseln (mit Umbruch), andere Tasten ändern nichts. */
export function nextTab(current: MenuTab, key: string): MenuTab {
  if (key !== 'ArrowLeft' && key !== 'ArrowRight') return current;
  const i = TABS.indexOf(current);
  const step = key === 'ArrowRight' ? 1 : -1;
  return TABS[(i + step + TABS.length) % TABS.length];
}

/** Gespeicherten Tab lesen; alles Unbekannte ergibt 'host'. */
export function parseTab(raw: unknown): MenuTab {
  return raw === 'join' || raw === 'list' ? raw : 'host';
}

/** Eingaben des Tabs "Raum erstellen" (roh) */
export interface CreateForm {
  roomName: string;
  visibility: RoomVisibility;
  password: string;
}

export type CreateRequest =
  | { ok: true; value: { roomName?: string; visibility: RoomVisibility; password?: string } }
  | { ok: false; error: string };

/** Bereinigt wie der Server (cleanField); leere Felder entfallen, zu lange ergeben einen deutschen Hinweis. */
export function createRequest(form: CreateForm): CreateRequest {
  const roomName = cleanField(form.roomName, MAX_ROOM_NAME_LENGTH);
  if (roomName === null) return { ok: false, error: `Raumname: höchstens ${MAX_ROOM_NAME_LENGTH} Zeichen.` };
  const password = cleanField(form.password, MAX_PASSWORD_LENGTH);
  if (password === null) return { ok: false, error: `Passwort: höchstens ${MAX_PASSWORD_LENGTH} Zeichen.` };
  const value: { roomName?: string; visibility: RoomVisibility; password?: string } = { visibility: form.visibility };
  if (roomName !== '') value.roomName = roomName;
  if (password !== '') value.password = password;
  return { ok: true, value };
}

/**
 * Verbindungsverlust melden? Ohne Raum schließt der Server ein ungenutztes Socket nach 30 s Leerlauf
 * (etwa beim Stöbern in der Raumliste); das ist kein Fehler, die nächste Aktion verbindet neu.
 */
export function shouldReportClose(room: string): boolean {
  return room !== '';
}
```

- [ ] **Step 4: Tests und Typecheck**

- [ ] **Step 4: `onlineMenu.ts` kompilierbar halten**

`MenuTab` hat jetzt drei Werte; das Literal `tabLabels` in `packages/client/src/onlineMenu.ts` (Zeile 181) hätte keinen Schlüssel `list` und bricht den Typecheck. Die Zeile

```ts
      const tabLabels: Record<MenuTab, string> = { host: 'Raum erstellen', join: 'Beitreten' };
```

ersetzen durch

```ts
      const tabLabels = TAB_LABELS;
```

und den Import `import { nextTab, parseTab, sanitizeRoomCode } from './onlineMenuLogic';` ersetzen durch `import { nextTab, parseTab, sanitizeRoomCode, TAB_LABELS } from './onlineMenuLogic';`. Die Tab-Leiste zeigt bis Task 7 weiter zwei Tabs (Schleife über `['host', 'join']`); ein gespeicherter Tab `'list'` fällt bis dahin in den Beitreten-Zweig, was harmlos ist.

- [ ] **Step 5: Tests und Typecheck**

Run: `cd packages/client; npx vitest run test/onlineMenuLogic.test.ts; npx tsc --noEmit`
Expected: PASS, keine Typfehler.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/onlineMenuLogic.ts packages/client/test/onlineMenuLogic.test.ts packages/client/src/onlineMenu.ts
git commit -m "feat(client): three online menu tabs and create request

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Figurenraster als reine Logik

**Files:**
- Create: `packages/client/src/avatarGrid.ts`
- Create: `packages/client/test/avatarGrid.test.ts`

**Interfaces:**
- Consumes: `AVATAR_COUNT`, `RosterEntry` (core), `ALL_CHARACTERS` (`playerChars.ts`).
- Produces: `AVATAR_COLUMNS = 8`, `AvatarCell = { index: number; character: string; taken: boolean; own: boolean; takenBy: string | null }`, `avatarCells(roster: readonly RosterEntry[], you: string): AvatarCell[]`, `takenByOthers(roster, you): Set<number>`, `stepAvatar(current: number, key: string, taken: ReadonlySet<number>, columns?: number): number`.

- [ ] **Step 1: Failing test**

`packages/client/test/avatarGrid.test.ts`:

```ts
import type { RosterEntry } from '@pfandraiders/core';
import { describe, expect, it } from 'vitest';
import { AVATAR_COLUMNS, avatarCells, stepAvatar, takenByOthers } from '../src/avatarGrid';

const r = (id: string, name: string, avatar: number): RosterEntry => ({ id, name, color: 0xffffff, connected: true, ready: false, avatar });

describe('avatarCells', () => {
  it('lists all 24 figures in order and marks own and taken ones', () => {
    const cells = avatarCells([r('p1', 'Anna', 1), r('p2', 'Bob', 14)], 'p2');
    expect(cells).toHaveLength(24);
    expect(cells[0]).toEqual({ index: 0, character: 'm01', taken: false, own: false, takenBy: null });
    expect(cells[1]).toEqual({ index: 1, character: 'm02', taken: true, own: false, takenBy: 'Anna' });
    expect(cells[14]).toEqual({ index: 14, character: 'f03', taken: false, own: true, takenBy: null });
  });

  it('knows the figures taken by the others', () => {
    expect([...takenByOthers([r('p1', 'Anna', 1), r('p2', 'Bob', 14)], 'p2')]).toEqual([1]);
  });
});

describe('stepAvatar', () => {
  it('moves left/right by one and up/down by a row, with wrap-around', () => {
    expect(AVATAR_COLUMNS).toBe(8);
    const none = new Set<number>();
    expect(stepAvatar(0, 'ArrowRight', none)).toBe(1);
    expect(stepAvatar(0, 'ArrowLeft', none)).toBe(23);
    expect(stepAvatar(2, 'ArrowDown', none)).toBe(10);
    expect(stepAvatar(18, 'ArrowDown', none)).toBe(2);
    expect(stepAvatar(2, 'ArrowUp', none)).toBe(18);
  });

  it('skips taken figures', () => {
    expect(stepAvatar(0, 'ArrowRight', new Set([1, 2]))).toBe(3);
    expect(stepAvatar(2, 'ArrowDown', new Set([10]))).toBe(18);
  });

  it('stays when everything else is taken or the key is not an arrow', () => {
    const allButZero = new Set(Array.from({ length: 23 }, (_, i) => i + 1));
    expect(stepAvatar(0, 'ArrowRight', allButZero)).toBe(0);
    expect(stepAvatar(5, 'Enter', new Set())).toBe(5);
  });
});
```

- [ ] **Step 2: Fehlschlag sehen**

Run: `cd packages/client; npx vitest run test/avatarGrid.test.ts`
Expected: FAIL (Modul fehlt).

- [ ] **Step 3: Implementieren**

`packages/client/src/avatarGrid.ts`:

```ts
import { AVATAR_COUNT } from '@pfandraiders/core';
import type { RosterEntry } from '@pfandraiders/core';
import { ALL_CHARACTERS } from './playerChars';

/** Spalten des Figurenrasters in der Lobby (24 Figuren = 3 Reihen) */
export const AVATAR_COLUMNS = 8;

export interface AvatarCell {
  index: number;
  /** Schlüssel des Bogens (m01..f12) */
  character: string;
  /** von einem anderen Spieler belegt */
  taken: boolean;
  /** eigene Figur */
  own: boolean;
  /** Name dessen, der sie hat (nur bei taken) */
  takenBy: string | null;
}

/** Alle Figuren in Reihenfolge, mit Belegung laut Raumliste. */
export function avatarCells(roster: readonly RosterEntry[], you: string): AvatarCell[] {
  return Array.from({ length: AVATAR_COUNT }, (_, index) => {
    const holder = roster.find((p) => p.avatar === index);
    const own = holder?.id === you;
    return {
      index,
      character: ALL_CHARACTERS[index],
      taken: holder !== undefined && !own,
      own,
      takenBy: holder && !own ? holder.name : null,
    };
  });
}

/** Figuren der anderen Spieler */
export function takenByOthers(roster: readonly RosterEntry[], you: string): Set<number> {
  return new Set(roster.filter((p) => p.id !== you).map((p) => p.avatar));
}

const DELTA: Record<string, (columns: number) => number> = {
  ArrowLeft: () => -1,
  ArrowRight: () => 1,
  ArrowUp: (c) => -c,
  ArrowDown: (c) => c,
};

/**
 * Nächste freie Figur in Pfeilrichtung (links/rechts eins, hoch/runter eine Reihe), mit Umlauf über alle 24;
 * vergebene werden übersprungen. Ist nichts frei oder keine Pfeiltaste: bleibt `current`.
 */
export function stepAvatar(current: number, key: string, taken: ReadonlySet<number>, columns = AVATAR_COLUMNS): number {
  // hasOwn: geerbte Schlüssel wie 'toString' sind keine Pfeiltasten
  const delta = Object.hasOwn(DELTA, key) ? DELTA[key](columns) : undefined;
  if (delta === undefined) return current;
  let i = current;
  for (let n = 0; n < AVATAR_COUNT; n++) {
    i = (((i + delta) % AVATAR_COUNT) + AVATAR_COUNT) % AVATAR_COUNT;
    if (i === current) return current;
    if (!taken.has(i)) return i;
  }
  return current;
}
```

- [ ] **Step 4: Tests und Typecheck**

Run: `cd packages/client; npx vitest run test/avatarGrid.test.ts; npx tsc --noEmit`
Expected: PASS. (`Object.hasOwn` ist in `lib: ES2022` aus `tsconfig.base.json` enthalten.)

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/avatarGrid.ts packages/client/test/avatarGrid.test.ts
git commit -m "feat(client): avatar grid logic

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Endwertung als reine Logik und Fußzeile der Rangliste

**Files:**
- Create: `packages/client/src/finalView.ts`
- Create: `packages/client/test/finalView.test.ts`
- Modify: `packages/client/src/text.ts:139-142` (`resultFooter`)
- Modify: `packages/client/test/text.test.ts` (Block `describe('resultFooter', …)`)

**Interfaces:**
- Consumes: `finalRanking`, `RankEntry`, `RosterEntry`, `RoomPhase` aus core.
- Produces: `FinalRow = { place: number; id: string; name: string; total: number; avatar: number | null; color: number; isWinner: boolean; isViewer: boolean; left: boolean }`, `finalRows(entries, roster, you): FinalRow[]`, `winnerText(rows): string`, `finalFooter(isHost: boolean, actionLabel: string): string[]`, `OnlineScene`, `sceneForPhase(phase: RoomPhase, hasShopState: boolean): OnlineScene`, `resultFooter(role, labels, final = false): string[]`.

- [ ] **Step 1: Failing tests**

`packages/client/test/finalView.test.ts`:

```ts
import type { RankEntry, RosterEntry } from '@pfandraiders/core';
import { describe, expect, it } from 'vitest';
import { finalFooter, finalRows, sceneForPhase, winnerText } from '../src/finalView';

const e = (id: string, total: number): RankEntry => ({ id, money: 0, round: 0, total });
const r = (id: string, name: string, avatar: number, color = 0x123456): RosterEntry => ({ id, name, color, connected: true, ready: false, avatar });

describe('finalRows', () => {
  it('sorts by total, shares places on ties and marks winners and the viewer', () => {
    const rows = finalRows([e('p3', 100), e('p1', 500), e('p2', 500)], [r('p1', 'Anna', 1), r('p2', 'Bob', 14), r('p3', 'Cara', 0)], 'p3');
    expect(rows.map((x) => [x.place, x.name, x.total, x.isWinner, x.isViewer])).toEqual([
      [1, 'Anna', 500, true, false],
      [1, 'Bob', 500, true, false],
      [3, 'Cara', 100, false, true],
    ]);
    expect(rows[0]).toMatchObject({ avatar: 1, color: 0x123456, left: false });
  });

  it('shows players who left as "(gegangen)" in grey without a figure', () => {
    const [row] = finalRows([e('p9', 50)], [], 'p1');
    expect(row).toMatchObject({ name: '(gegangen)', avatar: null, color: 0x888888, left: true });
  });
});

describe('winnerText', () => {
  it('names one, two or more overall winners', () => {
    const roster = [r('p1', 'Anna', 1), r('p2', 'Bob', 2), r('p3', 'Cara', 3)];
    expect(winnerText(finalRows([e('p1', 9), e('p2', 1)], roster, 'p1'))).toBe('Gesamtsieger: Anna');
    expect(winnerText(finalRows([e('p1', 9), e('p2', 9)], roster, 'p1'))).toBe('Gesamtsieger: Anna und Bob');
    expect(winnerText(finalRows([e('p1', 9), e('p2', 9), e('p3', 9)], roster, 'p1'))).toBe('Gesamtsieger: Anna, Bob und Cara');
    expect(winnerText([])).toBe('Keine Wertung');
  });
});

describe('finalFooter', () => {
  it('gives the host the way back and lets the others wait', () => {
    expect(finalFooter(true, 'E')).toEqual(['Zur Lobby: E oder Klick', 'Raum verlassen: Esc']);
    expect(finalFooter(false, 'E')).toEqual(['Warte auf den Host…', 'Raum verlassen: Esc']);
  });
});

describe('sceneForPhase', () => {
  it('picks the scene after the online dialog', () => {
    expect(sceneForPhase('final', false)).toBe('final');
    expect(sceneForPhase('shop', true)).toBe('shop');
    expect(sceneForPhase('shop', false)).toBe('game');
    expect(sceneForPhase('playing', false)).toBe('game');
  });
});
```

In `packages/client/test/text.test.ts` im Block `describe('resultFooter', …)` einen Test ergänzen:

```ts
  it('points to the final ranking after the last round', () => {
    expect(resultFooter('guest', KEYS, true)).toEqual(['Weiter zur Endwertung: R oder E', 'Menü: Esc']);
    expect(resultFooter('host', KEYS, false)).toEqual(['Weiter zum Shop: R oder E', 'Menü: Esc']);
  });
```

(`KEYS` ist in `text.test.ts` schon definiert; die Erwartung `'… R oder E'` passt zum bestehenden Test `'Weiter zum Shop: R oder E'`.)

- [ ] **Step 2: Fehlschlag sehen**

Run: `cd packages/client; npx vitest run test/finalView.test.ts test/text.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementieren**

`packages/client/src/finalView.ts`:

```ts
import { finalRanking } from '@pfandraiders/core';
import type { RankEntry, RoomPhase, RosterEntry } from '@pfandraiders/core';

/** Grau für Spieler, die den Raum verlassen haben */
const LEFT_COLOR = 0x888888;

export interface FinalRow {
  /** Platz; gleicher Gesamtverdienst teilt sich den Platz (1, 1, 3) */
  place: number;
  id: string;
  name: string;
  /** Gesamtverdienst (Cent) */
  total: number;
  /** Figur aus der Raumliste; null = nicht mehr im Raum */
  avatar: number | null;
  color: number;
  isWinner: boolean;
  isViewer: boolean;
  /** hat den Raum verlassen */
  left: boolean;
}

/** Zeilen der Endwertung: nach Gesamtverdienst (finalRanking), Namen/Figuren/Farben aus der Raumliste. */
export function finalRows(entries: readonly RankEntry[], roster: readonly RosterEntry[], you: string): FinalRow[] {
  const rows: FinalRow[] = [];
  finalRanking(entries).forEach((entry, i) => {
    const place = i > 0 && rows[i - 1].total === entry.total ? rows[i - 1].place : i + 1;
    const member = roster.find((p) => p.id === entry.id);
    rows.push({
      place,
      id: entry.id,
      name: member ? member.name : '(gegangen)',
      total: entry.total,
      avatar: member ? member.avatar : null,
      color: member ? member.color : LEFT_COLOR,
      isWinner: place === 1,
      isViewer: entry.id === you,
      left: !member,
    });
  });
  return rows;
}

/** "Gesamtsieger: Anna", "… Anna und Bob", "… Anna, Bob und Cara"; ohne Zeilen "Keine Wertung". */
export function winnerText(rows: readonly FinalRow[]): string {
  const names = rows.filter((r) => r.isWinner).map((r) => r.name);
  if (names.length === 0) return 'Keine Wertung';
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} und ${names[names.length - 1]}`;
  return `Gesamtsieger: ${list}`;
}

/** Fußzeile der Endwertung: Host holt alle zurück in die Lobby, die anderen warten. */
export function finalFooter(isHost: boolean, actionLabel: string): string[] {
  const first = isHost ? `Zur Lobby: ${actionLabel} oder Klick` : 'Warte auf den Host…';
  return [first, 'Raum verlassen: Esc'];
}

export type OnlineScene = 'game' | 'shop' | 'final';

/** Szene nach dem Online-Dialog: Endwertung, Shop (mit eigenem Stand) oder Spiel. */
export function sceneForPhase(phase: RoomPhase, hasShopState: boolean): OnlineScene {
  if (phase === 'final') return 'final';
  if (phase === 'shop' && hasShopState) return 'shop';
  return 'game';
}
```

`packages/client/src/text.ts`, `resultFooter` ersetzen:

```ts
/** Fußzeile am Rundenende: in der Serie geht es für alle in den Shop, nach der letzten Runde zur Endwertung. */
export function resultFooter(_role: 'local' | 'host' | 'guest', labels: KeyLabels, final = false): string[] {
  const next = final ? 'Weiter zur Endwertung' : 'Weiter zum Shop';
  return [`${next}: R oder ${labels.action}`, 'Menü: Esc'];
}
```

- [ ] **Step 4: Tests und Typecheck**

Run: `cd packages/client; npx vitest run test/finalView.test.ts test/text.test.ts; npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/finalView.ts packages/client/test/finalView.test.ts packages/client/src/text.ts packages/client/test/text.test.ts
git commit -m "feat(client): final ranking view logic

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: OnlineConnection für Räume, Raumliste, Figur, Rundenzahl und toLobby

**Files:**
- Modify: `packages/client/src/online.ts`
- Modify: `packages/client/test/online.test.ts`

**Interfaces:**
- Consumes: `parseRoomList` (Task 2), `isRounds`, `DEFAULT_ROUNDS`, `RoomInfo`, `RoomVisibility` (core); Helfer `lobbyMsg(host, phase, roundMs)` und `roster()` in `online.test.ts` (aus Plan 1, Task 8).
- Produces: `CreateOptions`, `JoinOptions`, Felder `roomName: string`, `visibility: RoomVisibility`, `locked: boolean`, `rounds: number`, `round: number`, `rooms: RoomInfo[]`, `onRooms: (() => void) | null`; Methoden `create(name: string, opts?: CreateOptions)`, `join(room: string, name: string, token?: string, opts?: JoinOptions)`, `listRooms()`, `setAvatar(avatar: number)`, `setRounds(rounds: number)`, `toLobby()`, `ownAvatar(): number | null`.

- [ ] **Step 1: Failing tests**

An `packages/client/test/online.test.ts` anhängen:

```ts
describe('rooms, room list, avatars and round count', () => {
  it('sends create with only the given options', () => {
    const { socket, conn } = setup();
    conn.create('Anna', { roomName: 'Bude', visibility: 'private', password: 'pw', avatar: 3 });
    conn.create('Anna', { roomName: '', password: '' });
    expect(socket.sent).toEqual([
      { t: 'create', name: 'Anna', roomName: 'Bude', visibility: 'private', password: 'pw', avatar: 3 },
      { t: 'create', name: 'Anna' },
    ]);
  });

  it('sends join with password and avatar next to the token', () => {
    const { socket, conn } = setup();
    conn.join('ABCD', 'Bob', undefined, { password: 'pw', avatar: 0 });
    conn.join('ABCD', 'Bob', 'tok', {});
    expect(socket.sent).toEqual([
      { t: 'join', room: 'ABCD', name: 'Bob', password: 'pw', avatar: 0 },
      { t: 'join', room: 'ABCD', name: 'Bob', token: 'tok' },
    ]);
  });

  it('reconnects with the token only, never with a password', () => {
    const sockets = [new FakeSocket(), new FakeSocket()];
    let k = 0;
    const conn = new OnlineConnection('ws://test', () => sockets[k++]);
    conn.connect();
    sockets[0].open();
    conn.join('ABCD', 'Bob', undefined, { password: 'geheim' });
    sockets[0].receive({ t: 'joined', room: 'ABCD', you: 'p2', token: 'tok' });
    conn.reopen();
    sockets[1].open();
    expect(sockets[1].sent).toEqual([{ t: 'join', room: 'ABCD', name: 'Bob', token: 'tok' }]);
  });

  it('reads room name, visibility, lock and round count from lobby and keeps old values for garbage', () => {
    const { socket, conn } = setup();
    socket.receive({ ...lobbyMsg('p1', 'lobby', DEFAULT_ROUND_MS), roomName: 'Bude', visibility: 'private', locked: true, rounds: 5 } as ServerMessage);
    expect(conn).toMatchObject({ roomName: 'Bude', visibility: 'private', locked: true, rounds: 5 });
    socket.onmessage?.({
      data: JSON.stringify({ ...lobbyMsg('p1', 'lobby', DEFAULT_ROUND_MS), roomName: 7, visibility: 'x', locked: 'ja', rounds: 2 }),
    });
    expect(conn).toMatchObject({ roomName: 'Bude', visibility: 'private', locked: true, rounds: 5 });
  });

  it('reads rounds and the round number from start', () => {
    const { socket, conn } = setup();
    socket.receive({ ...(startMessage() as Extract<ServerMessage, { t: 'start' }>), rounds: 1, round: 1 });
    expect(conn.rounds).toBe(1);
    expect(conn.round).toBe(1);
  });

  it('stores a valid room list, calls onRooms and ignores garbage', () => {
    const { socket, conn } = setup();
    let calls = 0;
    conn.onRooms = () => calls++;
    const room = { code: 'ABCD', name: 'Bude', host: 'Anna', players: 1, max: 8, phase: 'lobby' as const, locked: false };
    socket.receive({ t: 'rooms', rooms: [room] });
    expect(conn.rooms).toEqual([room]);
    socket.onmessage?.({ data: JSON.stringify({ t: 'rooms', rooms: 'kaputt' }) });
    expect(conn.rooms).toEqual([room]);
    expect(calls).toBe(1);
  });

  it('sends listRooms and setAvatar when open, setRounds and toLobby only as host', () => {
    const { socket, conn } = setup();
    socket.receive({ t: 'joined', room: 'ABCD', you: 'p2', token: 't' });
    socket.receive(lobbyMsg('p1', 'lobby', DEFAULT_ROUND_MS));
    conn.listRooms();
    conn.setAvatar(5);
    conn.setRounds(1);
    conn.toLobby();
    expect(socket.sent).toEqual([{ t: 'listRooms' }, { t: 'setAvatar', avatar: 5 }]);
    socket.receive(lobbyMsg('p2', 'final', DEFAULT_ROUND_MS));
    conn.setRounds(1);
    conn.toLobby();
    expect(socket.sent.slice(-2)).toEqual([{ t: 'setRounds', rounds: 1 }, { t: 'toLobby' }]);
  });

  it('knows its own avatar from the roster', () => {
    const { socket, conn } = setup();
    expect(conn.ownAvatar()).toBeNull();
    socket.receive({ t: 'joined', room: 'ABCD', you: 'p2', token: 't' });
    socket.receive(lobbyMsg('p1', 'lobby', DEFAULT_ROUND_MS));
    expect(conn.ownAvatar()).toBe(14);
  });

  it('keeps the chat when the room goes final and back to lobby', () => {
    const { socket, conn } = setup();
    socket.receive({ t: 'chathistory', messages: [{ id: 'p1', name: 'Anna', color: ROOM_COLORS[0], text: 'Hallo', at: 1 }] });
    socket.receive({ t: 'phase', phase: 'final' });
    socket.receive({ t: 'phase', phase: 'lobby' });
    expect(conn.roomPhase).toBe('lobby');
    expect(conn.chat.map((m) => m.text)).toEqual(['Hallo']);
  });
});
```

Hinweis zum Reconnect-Test: Die Socket-Fabrik liefert nacheinander zwei `FakeSocket`s, damit `reopen()` ein neues Socket bekommt (wie bei einem echten Verbindungsabbruch).

- [ ] **Step 2: Fehlschlag sehen**

Run: `cd packages/client; npx vitest run test/online.test.ts`
Expected: FAIL (`listRooms is not a function`, falsche gesendete Nachrichten).

- [ ] **Step 3: Implementieren**

In `packages/client/src/online.ts`:

a) Importe:

```ts
import { DEFAULT_MAP_ID, DEFAULT_ROUND_MS, DEFAULT_ROUNDS, isMapId, isRounds, parseServerBuild, stateFromSnapshot } from '@pfandraiders/core';
```

und im Typ-Import `RoomInfo` und `RoomVisibility` ergänzen (nach `RankEntry`). Zusätzlich:

```ts
import { parseRoomList } from './roomList';
```

b) Vor `export class OnlineConnection` einfügen:

```ts
/** Angaben beim Anlegen eines Raums (leere Felder werden nicht gesendet) */
export interface CreateOptions {
  roomName?: string;
  visibility?: RoomVisibility;
  password?: string;
  /** Wunschfigur */
  avatar?: number;
}

/** Angaben beim Beitritt (leeres Passwort wird nicht gesendet) */
export interface JoinOptions {
  password?: string;
  avatar?: number;
}
```

c) In der Klasse nach `ranking: RankEntry[] = [];` einfügen:

```ts
  /** Raumname, Sichtbarkeit und Passwortschutz laut Lobby-Nachricht */
  roomName = '';
  visibility: RoomVisibility = 'public';
  locked = false;
  /** Rundenzahl der Serie (0 = offen) und laufende Runde ab 1 (0 = noch keine) */
  rounds: number = DEFAULT_ROUNDS;
  round = 0;
  /** Letzte Raumliste vom Server */
  rooms: RoomInfo[] = [];
  /** Neue Raumliste in `rooms`. */
  onRooms: (() => void) | null = null;
```

d) `create` und `join` ersetzen:

```ts
  create(name: string, opts: CreateOptions = {}): void {
    this.lastName = name;
    const msg: Extract<ClientMessage, { t: 'create' }> = { t: 'create', name };
    if (opts.roomName) msg.roomName = opts.roomName;
    if (opts.visibility) msg.visibility = opts.visibility;
    if (opts.password) msg.password = opts.password;
    if (opts.avatar !== undefined) msg.avatar = opts.avatar;
    this.sendMsg(msg);
  }

  /** Beitritt; ein Passwort wird nur gesendet, nie gespeichert (die Wiederverbindung nutzt das Token). */
  join(room: string, name: string, token?: string, opts: JoinOptions = {}): void {
    this.lastName = name;
    const msg: Extract<ClientMessage, { t: 'join' }> = { t: 'join', room, name };
    if (token) msg.token = token;
    if (opts.password) msg.password = opts.password;
    if (opts.avatar !== undefined) msg.avatar = opts.avatar;
    this.sendMsg(msg);
  }
```

e) Nach `endSeries()` einfügen:

```ts
  /** Öffentliche Räume abfragen (auch ohne Raum; der Server antwortet höchstens einmal pro Sekunde). */
  listRooms(): void {
    if (this.status !== 'open') return;
    this.sendMsg({ t: 'listRooms' });
  }

  /** Eigene Figur wählen (nur Lobby; der Server prüft Phase und Belegung). */
  setAvatar(avatar: number): void {
    if (this.status !== 'open') return;
    this.sendMsg({ t: 'setAvatar', avatar });
  }

  /** Rundenzahl setzen (nur Host; der Server prüft zusätzlich). */
  setRounds(rounds: number): void {
    if (this.status !== 'open' || !this.isHost()) return;
    this.sendMsg({ t: 'setRounds', rounds });
  }

  /** Nach der Endwertung alle zurück in die Lobby (nur Host; der Server prüft zusätzlich). */
  toLobby(): void {
    if (this.status !== 'open' || !this.isHost()) return;
    this.sendMsg({ t: 'toLobby' });
  }

  /** Eigene Figur laut Raumliste; null = noch unbekannt. */
  ownAvatar(): number | null {
    return this.roster.find((r) => r.id === this.you)?.avatar ?? null;
  }
```

f) Im `handle`-`switch` den Fall `'lobby'` ersetzen:

```ts
      case 'lobby':
        this.host = msg.host;
        this.roster = msg.players;
        this.roomPhase = msg.phase;
        if (typeof msg.roundMs === 'number' && Number.isFinite(msg.roundMs) && msg.roundMs > 0) this.roundMs = msg.roundMs;
        if (typeof msg.roomName === 'string') this.roomName = msg.roomName;
        if (msg.visibility === 'public' || msg.visibility === 'private') this.visibility = msg.visibility;
        if (typeof msg.locked === 'boolean') this.locked = msg.locked;
        if (isRounds(msg.rounds)) this.rounds = msg.rounds;
        this.onLobby?.();
        break;
```

g) Im Fall `'start'` vor `this.roomPhase = 'playing';` einfügen:

```ts
        if (isRounds(msg.rounds)) this.rounds = msg.rounds;
        if (typeof msg.round === 'number' && Number.isInteger(msg.round) && msg.round >= 1) this.round = msg.round;
```

h) Vor `case 'error':` einfügen:

```ts
      case 'rooms': {
        const rooms = parseRoomList(msg.rooms);
        if (!rooms) break;
        this.rooms = rooms;
        this.onRooms?.();
        break;
      }
```

- [ ] **Step 4: Tests und Typecheck**

Run: `cd packages/client; npx vitest run; npx tsc --noEmit`
Expected: alle Client-Tests PASS (auch die bestehenden `create`/`join`-Tests), keine Typfehler.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/online.ts packages/client/test/online.test.ts
git commit -m "feat(client): online connection for rooms, room list, avatar, round count and toLobby

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Online-Dialog mit drei Tabs und Fortsetzen der Lobby

**Files:**
- Modify: `packages/client/src/onlineMenu.ts` (Importe, Zeilen 86–256: Kommentar, Signatur, Handler, `form`, `need`, `renderEntry`, `switchTab`; `renderLobby` bleibt in dieser Task unverändert)

**Interfaces:**
- Consumes: `TABS`, `TAB_LABELS`, `nextTab`, `parseTab`, `sanitizeRoomCode`, `createRequest`, `shouldReportClose` (Task 3); `roomRows`, `firstSelectable`, `moveSelection`, `listAction`, `refreshAllowed`, `ROOM_LIST_HEADER`, `EMPTY_ROOM_LIST_TEXT` (Task 2); `loadAvatarWish` (Task 1); `OnlineConnection.create/join/listRooms/rooms/onRooms` (Task 6); `defaultRoomName`, `MAX_NAME_LENGTH`, `MAX_PASSWORD_LENGTH`, `MAX_ROOM_NAME_LENGTH` (core).
- Produces: `showOnlineMenu(url, socketFactory?, opts?: { joinCode?: string; resume?: OnlineConnection })`; der Dialog endet (resolve) bei `start`, Shop-Stand in `shop` und bei Phase `final`.

- [ ] **Step 1: Importe ersetzen**

Die Importzeilen 1–10 von `packages/client/src/onlineMenu.ts` ersetzen durch:

```ts
import type { ChatMessage, ErrorCode, RosterEntry, RoomVisibility } from '@pfandraiders/core';
import {
  defaultRoomName,
  MAX_CHAT_LENGTH,
  MAX_NAME_LENGTH,
  MAX_PASSWORD_LENGTH,
  MAX_ROOM_NAME_LENGTH,
  ROOM_CODE_LENGTH,
  ROUND_MS_CHOICES,
} from '@pfandraiders/core';
import { buildLabel, currentBuild, versionMismatch } from './buildInfo';
import { chatColorHex, rosterDiff } from './chatLogic';
import { createRequest, nextTab, parseTab, sanitizeRoomCode, shouldReportClose, TAB_LABELS, TABS } from './onlineMenuLogic';
import type { MenuTab } from './onlineMenuLogic';
import { OnlineConnection } from './online';
import { EMPTY_ROOM_LIST_TEXT, firstSelectable, listAction, moveSelection, refreshAllowed, ROOM_LIST_HEADER, roomRows } from './roomList';
import { roundMsLabel } from './roundTime';
import { loadAvatarWish } from './settings';
import { buildJoinLink, copyText } from './shareLink';
import type { SocketFactory } from './online';
```

- [ ] **Step 2: Kommentar, Signatur und Verbindungs-Handler**

Den JSDoc-Kommentar und die Signatur von `showOnlineMenu` (Zeilen 86–95) ersetzen durch:

```ts
/**
 * Zeigt ein Overlay zum Erstellen, Betreten oder Auswählen eines Raums und die Lobby.
 * Löst mit der Verbindung auf, sobald der Server die Runde startet, ein Rückkehrer im Shop landet oder die
 * Endwertung läuft. Löst mit null auf, wenn abgebrochen wird.
 * `joinCode` (aus einem Teilen-Link): Dialog öffnet auf "Beitreten" mit diesem Raumcode.
 * `resume`: bestehende Verbindung (nach der Endwertung zurück in der Lobby); zeigt direkt die Lobby.
 */
export function showOnlineMenu(
  url: string,
  socketFactory: SocketFactory = (u) => new WebSocket(u) as unknown as ReturnType<SocketFactory>,
  opts: { joinCode?: string; resume?: OnlineConnection } = {},
): Promise<OnlineConnection | null> {
```

Die Zeile `const conn = new OnlineConnection(url, socketFactory);` ersetzen durch:

```ts
    const conn = opts.resume ?? new OnlineConnection(url, socketFactory);
```

In `finish` nach `conn.onPhase = null;` ergänzen:

```ts
      conn.onRooms = null;
```

Den Block von `conn.onError = (code, text) => showError(ERRORS[code] ?? text);` bis einschließlich `conn.onShopState = () => { … };` ersetzen durch:

```ts
    /** Selbst gewählte Figur, bis die Lobby sie bestätigt (dann wird sie als Wunsch gemerkt) */
    let pendingWish: number | null = null;
    conn.onError = (code, text) => {
      if (code === 'avatar_taken') pendingWish = null;
      showError(ERRORS[code] ?? text);
    };
    conn.onClosed = () => {
      // Ohne Raum schließt der Server ein ungenutztes Socket nach 30 s; die nächste Aktion verbindet neu
      if (shouldReportClose(conn.room)) showError('Verbindung zum Server verloren.');
    };
    conn.onStart = () => finish(conn);
    // Rückkehr oder Beitritt zwischen zwei Runden: direkt in den Shop
    conn.onShopState = () => {
      if (conn.roomPhase === 'shop') finish(conn);
    };
    // Beitritt oder Rückkehr während der Endwertung: zur Endwertung
    conn.onPhase = () => {
      if (conn.roomPhase === 'final') finish(conn);
    };
```

- [ ] **Step 3: Formularzustand und Verbindungsaufbau**

Die Zeile `const form = { name: safeGet(NAME_KEY) ?? '', code: '', tab: parseTab(localGet(TAB_KEY)) };` ersetzen durch:

```ts
    const form = {
      name: safeGet(NAME_KEY) ?? '',
      code: '',
      tab: parseTab(localGet(TAB_KEY)),
      roomName: '',
      visibility: 'public' as RoomVisibility,
      createPassword: '',
      joinPassword: '',
    };
    /** Raumliste: gewählte Zeile, letzte Anfrage, schon eine Antwort da, offene Passwortabfrage */
    const list = { selected: -1, lastRefresh: -Infinity, loaded: false, prompt: null as { code: string; name: string } | null, password: '' };
```

Die Funktion `need` ersetzen durch:

```ts
    /** Verbindung aufbauen, falls keine offen ist (auch nach dem Leerlauf-Schließen ohne Raum). */
    const connectIfNeeded = (): boolean => {
      if (conn.status === 'idle' || conn.status === 'closed') {
        showError('');
        try {
          conn.connect();
        } catch {
          showError('Server nicht erreichbar.');
          return false;
        }
      }
      return true;
    };
    const need = () => {
      if (form.name.trim().length === 0) {
        showError('Bitte einen Namen eingeben.');
        return false;
      }
      safeSet(NAME_KEY, form.name.trim(), true);
      return connectIfNeeded();
    };
```

(`whenOpen` bleibt unverändert.)

Danach einfügen:

```ts
    const doCreate = () => {
      const req = createRequest({ roomName: form.roomName, visibility: form.visibility, password: form.createPassword });
      if (!req.ok) return showError(req.error);
      if (need()) whenOpen(() => conn.create(form.name.trim(), { ...req.value, avatar: loadAvatarWish() }));
    };
    const doJoin = (rawCode: string, password: string) => {
      const room = sanitizeRoomCode(rawCode);
      if (room.length !== ROOM_CODE_LENGTH) return showError('Bitte einen Raumcode eingeben.');
      if (!need()) return;
      const token = safeGet(TOKEN_KEY(room)) ?? undefined;
      whenOpen(() => conn.join(room, form.name.trim(), token, { password: password.trim() || undefined, avatar: loadAvatarWish() }));
    };
    /** Liste neu laden (höchstens einmal pro Sekunde); die Antwort zeichnet drawList. */
    let drawList: (() => void) | null = null;
    const refreshList = () => {
      const now = Date.now();
      if (!refreshAllowed(list.lastRefresh, now)) return;
      list.lastRefresh = now;
      if (!connectIfNeeded()) return;
      whenOpen(() => conn.listRooms());
    };
    conn.onRooms = () => {
      list.loaded = true;
      drawList?.();
    };
```

- [ ] **Step 4: `renderEntry` ersetzen**

Die gesamte Funktion `const renderEntry = (focusTab = false) => { … };` ersetzen durch:

```ts
    const fieldStyle = 'width:100%;box-sizing:border-box;margin-bottom:8px;font:inherit';
    const labelStyle = 'color:#aaa;font-size:14px;margin-bottom:4px';
    const renderEntry = (focusTab = false) => {
      drawList = null;
      box.replaceChildren();
      box.appendChild(el('div', { textContent: 'Online spielen' }, 'font-size:22px;margin-bottom:8px'));
      box.appendChild(el('div', { textContent: `Server: ${url}` }, 'color:#aaa;font-size:14px;margin-bottom:10px'));

      // Name gilt für alle Tabs (auch für die Raumliste)
      const name = el('input', { placeholder: 'Dein Name', maxLength: MAX_NAME_LENGTH, value: form.name }, fieldStyle);
      name.setAttribute('aria-label', 'Dein Name');
      box.append(el('div', { textContent: 'Dein Name' }, labelStyle), name);

      const tabBar = el('div', { role: 'tablist' }, 'display:flex;margin-bottom:12px;border-bottom:1px solid #555');
      const tabButtons = new Map<MenuTab, HTMLButtonElement>();
      for (const id of TABS) {
        const active = form.tab === id;
        const b = el(
          'button',
          { textContent: TAB_LABELS[id], role: 'tab', tabIndex: active ? 0 : -1 },
          `flex:1 1 0;min-width:0;font:inherit;color:${active ? '#fff' : '#999'};background:${active ? '#333' : '#1a1a1a'};border:0;border-bottom:3px solid ${active ? '#ffca28' : 'transparent'};padding:8px 6px;cursor:pointer`,
        );
        b.setAttribute('aria-selected', String(active));
        b.onclick = () => switchTab(id, false);
        b.onkeydown = (e) => {
          const next = nextTab(id, e.key);
          if (next === id) return;
          e.preventDefault();
          switchTab(next, true);
        };
        tabButtons.set(id, b);
        tabBar.appendChild(b);
      }
      box.appendChild(tabBar);

      const cancel = el('button', { textContent: 'Abbrechen' }, 'font:inherit');
      cancel.onclick = () => finish(null);

      if (form.tab === 'host') {
        const roomName = el('input', { maxLength: MAX_ROOM_NAME_LENGTH, value: form.roomName }, fieldStyle);
        roomName.setAttribute('aria-label', 'Raumname');
        const placeholder = () => (roomName.placeholder = form.name.trim() ? defaultRoomName(form.name.trim()) : 'Raumname (optional)');
        placeholder();
        roomName.oninput = () => {
          form.roomName = roomName.value;
        };
        const visButton = el('button', {}, 'font:inherit;margin-right:8px');
        const visHint = el('span', {}, 'color:#aaa;font-size:14px');
        const drawVis = () => {
          visButton.textContent = form.visibility === 'public' ? 'Öffentlich' : 'Privat';
          visButton.setAttribute('aria-pressed', String(form.visibility === 'private'));
          visHint.textContent = form.visibility === 'public' ? 'In der Raumliste sichtbar.' : 'Nur mit Code oder Link.';
        };
        drawVis();
        visButton.onclick = () => {
          form.visibility = form.visibility === 'public' ? 'private' : 'public';
          drawVis();
        };
        const password = el('input', { type: 'password', placeholder: 'Passwort (optional)', maxLength: MAX_PASSWORD_LENGTH, value: form.createPassword }, fieldStyle);
        password.setAttribute('aria-label', 'Passwort');
        password.autocomplete = 'off';
        password.oninput = () => {
          form.createPassword = password.value;
        };
        const create = el('button', { textContent: 'Raum erstellen' }, 'font:inherit;margin-right:8px');
        create.onclick = doCreate;
        name.oninput = () => {
          form.name = name.value;
          placeholder();
        };
        for (const input of [name, roomName, password]) {
          input.onkeydown = (e) => {
            if (e.key === 'Enter') create.click();
          };
        }
        const visRow = el('div', {}, 'margin-bottom:8px');
        visRow.append(visButton, visHint);
        box.append(
          el('div', { textContent: 'Du wirst Host und bekommst einen Raumcode.' }, 'color:#aaa;font-size:14px;margin-bottom:8px'),
          el('div', { textContent: 'Raumname' }, labelStyle),
          roomName,
          el('div', { textContent: 'Sichtbarkeit' }, labelStyle),
          visRow,
          el('div', { textContent: 'Passwort' }, labelStyle),
          password,
          create,
          cancel,
          message,
        );
        if (focusTab) tabButtons.get('host')?.focus();
        else (name.value.trim() === '' ? name : roomName).focus();
        return;
      }

      name.oninput = () => {
        form.name = name.value;
      };

      if (form.tab === 'join') {
        const code = el('input', { placeholder: 'Raumcode', maxLength: ROOM_CODE_LENGTH, value: form.code }, `${fieldStyle};text-transform:uppercase`);
        code.setAttribute('aria-label', 'Raumcode');
        code.oninput = () => {
          code.value = sanitizeRoomCode(code.value);
          form.code = code.value;
        };
        const password = el('input', { type: 'password', placeholder: 'Passwort (optional)', maxLength: MAX_PASSWORD_LENGTH, value: form.joinPassword }, fieldStyle);
        password.setAttribute('aria-label', 'Passwort');
        password.autocomplete = 'off';
        password.oninput = () => {
          form.joinPassword = password.value;
        };
        const join = el('button', { textContent: 'Beitreten' }, 'font:inherit;margin-right:8px');
        join.onclick = () => doJoin(form.code, form.joinPassword);
        name.onkeydown = (e) => {
          if (e.key !== 'Enter') return;
          if (sanitizeRoomCode(code.value).length === 0) code.focus();
          else join.click();
        };
        for (const input of [code, password]) {
          input.onkeydown = (e) => {
            if (e.key === 'Enter') join.click();
          };
        }
        box.append(
          el('div', { textContent: 'Raumcode' }, labelStyle),
          code,
          el('div', { textContent: 'Passwort (leer lassen, wenn der Raum keins hat)' }, labelStyle),
          password,
          join,
          cancel,
          message,
        );
        if (focusTab) tabButtons.get('join')?.focus();
        else (name.value.trim() === '' ? name : code).focus();
        return;
      }

      // Raumliste
      const cols = 'grid-template-columns:minmax(0,2fr) minmax(0,1.3fr) 4em 4.5em';
      const header = el('div', {}, `display:grid;${cols};gap:6px;padding:2px 4px;color:#aaa;font-size:14px;border-bottom:1px solid #555`);
      for (const text of ROOM_LIST_HEADER) header.appendChild(el('span', { textContent: text }));
      const listBox = el('div', { tabIndex: 0 }, 'height:180px;max-height:30vh;overflow-y:auto;background:#111;border:1px solid #555;margin-bottom:8px;outline:none;font-size:14px');
      listBox.setAttribute('role', 'listbox');
      listBox.setAttribute('aria-label', 'Öffentliche Räume');
      const promptArea = el('div', {}, 'margin-bottom:8px');
      const refresh = el('button', { textContent: 'Aktualisieren (R)' }, 'font:inherit;margin-right:8px');
      refresh.onclick = refreshList;

      const rows = () => roomRows(conn.rooms);
      const choose = (i: number) => {
        const action = listAction(rows()[i]);
        if (!action) return;
        if (action.kind === 'join') {
          list.prompt = null;
          doJoin(action.code, '');
          return;
        }
        list.prompt = { code: action.code, name: action.name };
        list.password = '';
        drawList?.();
      };
      drawList = () => {
        const all = rows();
        if (list.selected >= all.length || (list.selected >= 0 && !all[list.selected].joinable) || list.selected < 0) {
          list.selected = firstSelectable(all);
        }
        listBox.replaceChildren();
        if (all.length === 0) {
          listBox.appendChild(el('div', { textContent: list.loaded ? EMPTY_ROOM_LIST_TEXT : 'Lade…' }, 'color:#888;padding:4px'));
        }
        all.forEach((r, i) => {
          const sel = i === list.selected;
          const line = el(
            'div',
            {},
            `display:grid;${cols};gap:6px;padding:3px 4px;color:${r.joinable ? '#fff' : '#666'};background:${sel ? '#333' : 'transparent'};cursor:${r.joinable ? 'pointer' : 'default'}`,
          );
          line.setAttribute('role', 'option');
          line.setAttribute('aria-selected', String(sel));
          line.setAttribute('aria-disabled', String(!r.joinable));
          for (const text of [`${r.locked ? '🔒 ' : ''}${r.name}`, r.host, r.players, r.status]) {
            line.appendChild(el('span', { textContent: text }, 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap'));
          }
          if (r.joinable) {
            line.onclick = () => {
              list.selected = i;
              choose(i);
            };
          }
          listBox.appendChild(line);
        });
        promptArea.replaceChildren();
        const prompt = list.prompt;
        if (prompt) {
          const pw = el('input', { type: 'password', placeholder: 'Passwort', maxLength: MAX_PASSWORD_LENGTH, value: list.password }, fieldStyle);
          pw.setAttribute('aria-label', `Passwort für ${prompt.name}`);
          pw.autocomplete = 'off';
          pw.oninput = () => {
            list.password = pw.value;
          };
          const go = el('button', { textContent: 'Beitreten' }, 'font:inherit;margin-right:8px');
          go.onclick = () => doJoin(prompt.code, list.password);
          const back = el('button', { textContent: 'Zurück' }, 'font:inherit');
          back.onclick = () => {
            list.prompt = null;
            drawList?.();
            listBox.focus();
          };
          pw.onkeydown = (e) => {
            if (e.key === 'Enter') go.click();
            if (e.key === 'Escape') back.click();
          };
          promptArea.append(el('div', { textContent: `Passwort für „${prompt.name}“` }, labelStyle), pw, go, back);
          pw.focus();
        }
      };
      listBox.onkeydown = (e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          list.selected = moveSelection(rows(), list.selected, e.key === 'ArrowDown' ? 1 : -1);
          drawList?.();
          listBox.children[list.selected]?.scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'Enter') {
          e.preventDefault();
          choose(list.selected);
        } else if (e.key === 'r' || e.key === 'R') {
          e.preventDefault();
          refreshList();
        }
      };
      box.append(
        el('div', { textContent: 'Öffentliche Räume. Graue Räume laufen schon oder sind voll.' }, 'color:#aaa;font-size:14px;margin-bottom:6px'),
        header,
        listBox,
        promptArea,
        refresh,
        cancel,
        message,
      );
      drawList?.();
      refreshList();
      if (focusTab) tabButtons.get('list')?.focus();
      else listBox.focus();
    };
```

- [ ] **Step 5: Start mit Fortsetzen**

Die letzte Zeile vor `});` von `showOnlineMenu`, `renderEntry();`, ersetzen durch:

```ts
    // Zurück aus der Endwertung: dieselbe Verbindung, gleich die Lobby (der Chat liegt schon in conn.chat)
    if (opts.resume) renderLobby();
    else renderEntry();
```

- [ ] **Step 6: Typecheck und Tests**

Run: `cd packages/client; npx tsc --noEmit; npx vitest run`
Expected: keine Typfehler, alle Tests PASS.

- [ ] **Step 7: Manuell prüfen**

In zwei Terminals: `npm run dev:server` und `npm run dev` (Repo-Wurzel), Browser auf die angezeigte Vite-Adresse.
1. "Online spielen": Name oben, drei Tabs; Pfeil rechts/links auf einem Tab wechselt, der Tab bleibt nach Neuladen gemerkt.
2. Tab "Raum erstellen": Platzhalter des Raumnamens folgt dem Namen ("Annas Raum"); "Öffentlich"/"Privat" schaltet um; Raum mit Passwort "pw" erstellen → Lobby.
3. Zweites Browserfenster, Tab "Raumliste": der Raum steht mit 🔒, "1/8", "Lobby"; Pfeile wählen, Enter öffnet die Passwortabfrage; falsches Passwort → "Passwort falsch oder nötig.", Feld bleibt; richtiges → Lobby.
4. Privater Raum erscheint nicht in der Liste; "Keine öffentlichen Räume" bei leerer Liste.
5. Raumliste 40 s offen lassen, dann "Aktualisieren": keine Fehlermeldung, Liste lädt neu.
6. Tab "Beitreten" mit Code und Passwort funktioniert; ohne Passwort → Hinweis.

- [ ] **Step 8: Commit**

```bash
git add packages/client/src/onlineMenu.ts
git commit -m "feat(client): online dialog with create, join and room list tabs

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Lobby mit Raumname, Schloss, Figurenraster und Rundenzahl

**Files:**
- Modify: `packages/client/src/onlineMenu.ts` (Importe ergänzen, Hilfsfunktion `avatarSprite`, Funktion `renderLobby` ersetzen)

**Interfaces:**
- Consumes: `avatarCells`, `stepAvatar`, `takenByOthers`, `AVATAR_COLUMNS` (Task 4); `roundsLabel` (Task 1); `saveAvatarWish` (Task 1); `OnlineConnection.roomName/locked/visibility/rounds/setAvatar/setRounds/ownAvatar` (Task 6); `ALL_CHARACTERS`, `CHAR_FRAME_W`, `CHAR_FRAME_H` (`playerChars.ts`); `CHARACTER_URLS` (`characterAssets.ts`); `ROUNDS_CHOICES` (core); `pendingWish` (Task 7, im selben Closure).
- Produces: Lobby-Ansicht nach Spec §5.4.

- [ ] **Step 1: Importe ergänzen**

In `packages/client/src/onlineMenu.ts`:
- im core-Wert-Import `ROUNDS_CHOICES` ergänzen (nach `ROUND_MS_CHOICES`);
- `import { roundMsLabel } from './roundTime';` ersetzen durch `import { roundMsLabel, roundsLabel } from './roundTime';`;
- `import { loadAvatarWish } from './settings';` ersetzen durch `import { loadAvatarWish, saveAvatarWish } from './settings';`;
- ergänzen:

```ts
import { AVATAR_COLUMNS, avatarCells, stepAvatar, takenByOthers } from './avatarGrid';
import { CHARACTER_URLS } from './characterAssets';
import { ALL_CHARACTERS, CHAR_FRAME_H, CHAR_FRAME_W } from './playerChars';
```

- [ ] **Step 2: Hilfsfunktion für Figurenbilder**

Nach der Funktion `el(…)` (vor `showOnlineMenu`) einfügen:

```ts
/**
 * Erstes Bild eines Figurenbogens (vorn, Stand: Spalte 0, Zeile 0) als Pixelgrafik.
 * Bögen haben 4 x 3 Bilder zu CHAR_FRAME_W x CHAR_FRAME_H px.
 */
function avatarSprite(index: number, scale: number): HTMLDivElement {
  const key = ALL_CHARACTERS[index] ?? ALL_CHARACTERS[0];
  const d = el(
    'div',
    {},
    `width:${CHAR_FRAME_W * scale}px;height:${CHAR_FRAME_H * scale}px;flex:none;background-repeat:no-repeat;background-position:0 0;background-size:${CHAR_FRAME_W * 4 * scale}px ${CHAR_FRAME_H * 3 * scale}px;image-rendering:pixelated`,
  );
  const src = CHARACTER_URLS[key];
  if (src) d.style.backgroundImage = `url("${src}")`;
  return d;
}
```

- [ ] **Step 3: `renderLobby` ersetzen**

Die gesamte Funktion `const renderLobby = () => { … };` ersetzen durch:

```ts
    const renderLobby = () => {
      box.replaceChildren();
      const title = el('div', {}, 'font-size:24px;margin-bottom:2px;overflow-wrap:anywhere');
      const codeLine = el('div', {}, 'color:#ccc;font-size:15px;margin-bottom:4px');
      box.append(title, codeLine);
      box.appendChild(el('div', { textContent: 'Code oder Link weitergeben, damit Freunde beitreten.' }, 'color:#aaa;font-size:14px;margin-bottom:4px'));
      // Teilen-Link: <Adresse>?join=CODE (ein ?server= bleibt erhalten, ein Passwort nie); "Kopiert!" verschwindet nach kurzer Zeit
      const shareRow = el('div', {}, 'margin-bottom:6px;font-size:14px');
      const copyButton = el('button', { textContent: 'Link kopieren' }, 'font:inherit;margin-right:8px');
      const copyStatus = el('span', { textContent: '' }, 'color:#a5d6a7;overflow-wrap:anywhere');
      let copyTimer: ReturnType<typeof setTimeout> | null = null;
      copyButton.onclick = () => {
        const link = buildJoinLink(window.location.href, conn.room);
        void copyText(link).then((ok) => {
          if (copyTimer !== null) clearTimeout(copyTimer);
          copyStatus.style.color = ok ? '#a5d6a7' : '#ffa726';
          copyStatus.textContent = ok ? 'Kopiert!' : `Kopieren ging nicht: ${link}`;
          copyTimer = ok ? setTimeout(() => (copyStatus.textContent = ''), 2000) : null;
        });
      };
      shareRow.append(copyButton, copyStatus);
      box.appendChild(shareRow);
      if (conn.serverBuild) {
        box.appendChild(el('div', { textContent: `Server: ${buildLabel(conn.serverBuild)}` }, 'color:#888;font-size:12px;margin-bottom:4px'));
      }
      if (versionMismatch(currentBuild(), conn.serverBuild)) {
        box.appendChild(
          el(
            'div',
            { textContent: 'Achtung: Client und Server haben verschiedene Versionen. Seite neu laden (Strg+F5) oder den Host informieren.' },
            'color:#ffa726;font-size:13px;margin-bottom:4px',
          ),
        );
      }

      // Spielerliste mit Figur, Farbe und Host-Markierung
      const players = el('div', {}, 'margin:6px 0 10px');
      const drawPlayers = (list: RosterEntry[]) => {
        players.replaceChildren();
        for (const p of list) {
          const row = el('div', {}, 'display:flex;align-items:center;gap:6px;margin-bottom:2px');
          row.appendChild(avatarSprite(p.avatar, 1));
          const label = el('span', { textContent: `${p.name}${p.id === conn.host ? ' (Host)' : ''}${p.connected ? '' : ' (getrennt)'}` });
          label.style.color = chatColorHex(p.color);
          if (p.id === conn.you) label.style.fontWeight = 'bold';
          row.appendChild(label);
          players.appendChild(row);
        }
      };

      // Figurauswahl: Raster 8 x 3, vergebene halbdurchsichtig, eigene gelb umrandet; Pfeile oder Klick
      const CELL = CHAR_FRAME_W * 2 + 6;
      const grid = el('div', { tabIndex: 0 }, `display:grid;grid-template-columns:repeat(${AVATAR_COLUMNS}, ${CELL}px);gap:4px;margin-bottom:10px;outline:none`);
      grid.setAttribute('role', 'listbox');
      grid.setAttribute('aria-label', 'Figur wählen (Pfeiltasten oder Klick)');
      const choose = (avatar: number) => {
        pendingWish = avatar;
        conn.setAvatar(avatar);
      };
      const drawGrid = () => {
        grid.replaceChildren();
        for (const cell of avatarCells(conn.roster, conn.you)) {
          const b = el(
            'div',
            { title: cell.takenBy ? `vergeben an ${cell.takenBy}` : cell.own ? 'deine Figur' : 'frei' },
            `height:${CHAR_FRAME_H * 2 + 6}px;display:flex;align-items:center;justify-content:center;box-sizing:border-box;border:2px solid ${cell.own ? '#ffca28' : '#333'};background:${cell.own ? '#3a3320' : '#1a1a1a'};opacity:${cell.taken ? 0.3 : 1};cursor:${cell.taken || cell.own ? 'default' : 'pointer'}`,
          );
          b.setAttribute('role', 'option');
          b.setAttribute('aria-selected', String(cell.own));
          b.setAttribute('aria-disabled', String(cell.taken));
          b.appendChild(avatarSprite(cell.index, 2));
          if (!cell.taken && !cell.own) b.onclick = () => choose(cell.index);
          grid.appendChild(b);
        }
      };
      grid.onkeydown = (e) => {
        const own = conn.ownAvatar();
        if (own === null) return;
        const next = stepAvatar(own, e.key, takenByOthers(conn.roster, conn.you));
        if (e.key.startsWith('Arrow')) e.preventDefault();
        if (next !== own) choose(next);
      };

      // Chat: unverändert (Nachrichten vom Server und Systemzeilen; nur Textknoten, nie HTML)
      const chatLog = el('div', { role: 'log' }, 'height:120px;max-height:20vh;overflow-y:auto;background:#111;border:1px solid #555;padding:4px 6px;font-size:14px;margin-bottom:6px;overflow-wrap:anywhere');
      chatLog.setAttribute('aria-label', 'Chat');
      const chatInput = el('input', { placeholder: 'Nachricht…', maxLength: MAX_CHAT_LENGTH }, 'width:100%;box-sizing:border-box;margin-bottom:10px;font:inherit');
      chatInput.setAttribute('aria-label', 'Chatnachricht');
      const shown = new WeakSet<ChatMessage>();
      const MAX_LINES = 80;
      const append = (line: HTMLElement) => {
        const atBottom = chatLog.scrollTop + chatLog.clientHeight >= chatLog.scrollHeight - 4;
        chatLog.appendChild(line);
        while (chatLog.childElementCount > MAX_LINES) chatLog.firstElementChild?.remove();
        if (atBottom) chatLog.scrollTop = chatLog.scrollHeight;
      };
      const chatLine = (m: ChatMessage) => {
        const line = el('div');
        const who = el('span', { textContent: m.name });
        who.style.color = chatColorHex(m.color);
        if (m.id === conn.you) who.style.fontWeight = 'bold';
        line.append(who, document.createTextNode(`: ${m.text}`));
        return line;
      };
      const systemLine = (text: string) => el('div', { textContent: text }, 'color:#888;font-style:italic');
      const showChat = () => {
        for (const m of conn.chat) {
          if (shown.has(m)) continue;
          shown.add(m);
          append(chatLine(m));
        }
      };
      showChat();
      chatInput.onkeydown = (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const text = chatInput.value;
        if (text.trim().length === 0) return;
        conn.sendChat(text);
        chatInput.value = '';
      };
      conn.onChat = showChat;

      // Host: Rundenzeit und Rundenzahl; Gäste sehen die Werte
      const roundRow = el('div', {}, 'margin-bottom:6px');
      const roundText = el('span', { textContent: '' });
      const roundSelect = el('select', {}, 'font:inherit;margin-left:6px');
      for (const ms of ROUND_MS_CHOICES) roundSelect.appendChild(el('option', { value: String(ms), textContent: roundMsLabel(ms) }));
      roundSelect.onchange = () => conn.setRoundMs(Number(roundSelect.value));
      roundRow.append(el('span', { textContent: 'Rundenzeit:' }), roundSelect, roundText);
      const roundsRow = el('div', {}, 'margin-bottom:10px');
      const roundsText = el('span', { textContent: '' });
      const roundsSelect = el('select', {}, 'font:inherit;margin-left:6px');
      for (const n of ROUNDS_CHOICES) roundsSelect.appendChild(el('option', { value: String(n), textContent: roundsLabel(n) }));
      roundsSelect.onchange = () => conn.setRounds(Number(roundsSelect.value));
      roundsRow.append(el('span', { textContent: 'Runden:' }), roundsSelect, roundsText);

      const start = el('button', { textContent: 'Spiel starten' }, 'font:inherit;margin-right:8px');
      const hint = el('div', { textContent: 'Warte auf den Host…' }, 'color:#aaa');
      const leave = el('button', { textContent: 'Verlassen' }, 'font:inherit');
      const refresh = () => {
        title.textContent = conn.roomName || `Raum ${conn.room}`;
        codeLine.textContent = `Code ${conn.room}${conn.locked ? '   🔒 Passwort' : ''}${conn.visibility === 'private' ? '   privat' : ''}`;
        drawPlayers(conn.roster);
        drawGrid();
        const host = conn.isHost();
        start.style.display = host ? 'inline-block' : 'none';
        hint.style.display = host ? 'none' : 'block';
        start.disabled = conn.roster.filter((p) => p.connected).length < 2;
        roundSelect.style.display = host ? 'inline-block' : 'none';
        roundSelect.value = String(conn.roundMs);
        roundText.textContent = host ? '' : ` ${roundMsLabel(conn.roundMs)}`;
        roundsSelect.style.display = host ? 'inline-block' : 'none';
        roundsSelect.value = String(conn.rounds);
        roundsText.textContent = host ? '' : ` ${roundsLabel(conn.rounds)}`;
      };
      // Die erste Spielerliste nach dem Beitritt wird nicht gemeldet
      let prevRoster: RosterEntry[] | null = null;
      const onLobby = () => {
        for (const text of rosterDiff(prevRoster, conn.roster)) append(systemLine(text));
        prevRoster = [...conn.roster];
        // Selbst gewählte Figur bestätigt: als Wunsch für das nächste Mal merken
        const own = conn.ownAvatar();
        if (pendingWish !== null && own === pendingWish) {
          saveAvatarWish(own);
          pendingWish = null;
        }
        refresh();
      };
      start.onclick = () => conn.requestStart();
      leave.onclick = () => {
        safeRemove(TOKEN_KEY(conn.room));
        finish(null);
      };
      box.append(
        players,
        el('div', { textContent: 'Deine Figur' }, 'color:#aaa;font-size:14px;margin-bottom:4px'),
        grid,
        chatLog,
        chatInput,
        roundRow,
        roundsRow,
        start,
        hint,
        leave,
        message,
      );
      conn.onLobby = onLobby;
      refresh();
    };
```

Hinweis: `pendingWish` ist in Task 7 in `showOnlineMenu` mit `let` vor `conn.onError` angelegt; `renderLobby` liegt im selben Closure.

- [ ] **Step 4: Typecheck und Tests**

Run: `cd packages/client; npx tsc --noEmit; npx vitest run`
Expected: keine Typfehler, alle Tests PASS.

- [ ] **Step 5: Manuell prüfen**

Mit Server und Vite (wie Task 7):
1. Lobby zeigt groß den Raumnamen, darunter "Code ABCD   🔒 Passwort" (bzw. "privat"), "Link kopieren" kopiert `?join=ABCD` ohne Passwort.
2. Spielerliste mit kleiner Figur; Host markiert.
3. Raster: eigene Figur gelb umrandet, Figur des anderen Fensters halbdurchsichtig mit Tooltip; Klick auf freie Figur wechselt in beiden Fenstern; Pfeiltasten im Raster springen über vergebene; nach Neuladen und neuem Beitritt kommt die zuletzt gewählte Figur (wenn frei).
4. Host sieht "Runden:" mit offen/1 Runde/3 Runden/5 Runden; Gast sieht den Wert als Text und er ändert sich mit.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/onlineMenu.ts
git commit -m "feat(client): lobby with room name, lock, avatar grid and round count

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Endwertung, Figur im Spiel und Rückkehr in die Lobby

**Files:**
- Create: `packages/client/src/scenes/FinalScene.ts`
- Modify: `packages/client/src/main.ts`
- Modify: `packages/client/src/scenes/GameScene.ts` (Import Zeile 12; Zeilen 200–203; 264–269; 316–321; 435–446; Reconnect-Block aus Plan 1 in `tickReconnect`; neue Methode `backToLobby`)
- Modify: `packages/client/src/scenes/ShopScene.ts` (`onPhase` und Prüfung in `create`, `goTo`)
- Modify: `packages/client/src/scenes/MenuScene.ts` (`init`, `create`, `openOnline`)
- Modify: `packages/client/src/hud.ts` (`ResultsPanel.show`, `PlayerHud`-Konstruktor)
- Modify: `packages/client/test/shareLink.test.ts` (Test "no password")

**Interfaces:**
- Consumes: `finalRows`, `winnerText`, `finalFooter`, `sceneForPhase` (Task 5); `characterOfAvatar` (Task 1); `OnlineConnection.toLobby/leave/close/ranking/roster/isHost` (Task 6); `showOnlineMenu(..., { resume })` (Task 7); `resultFooter(role, labels, final)` (Task 5).
- Produces: Szene `'final'`; `MenuScene.init({ resumeOnline })`; `GameScene.backToLobby()`; `PlayerHud(…, viewerId, isFinal, charOf)`.

- [ ] **Step 1: Failing test für den Teilen-Link**

In `packages/client/test/shareLink.test.ts` im Block `describe('buildJoinLink', …)` ergänzen:

```ts
  it('never carries a password, even if one is in the current address', () => {
    const link = buildJoinLink('https://example.org/spiel/?password=geheim&join=WXYZ&pw=geheim#x', 'abcd');
    expect(link).toBe('https://example.org/spiel/?join=ABCD');
    expect(link).not.toContain('geheim');
  });
```

Run: `cd packages/client; npx vitest run test/shareLink.test.ts`
Expected: PASS (das Verhalten besteht schon; der Test pinnt Spec §5.5).

- [ ] **Step 2: `FinalScene` anlegen**

`packages/client/src/scenes/FinalScene.ts`:

```ts
import Phaser from 'phaser';
import { createSource } from '../devices';
import { finalFooter, finalRows, winnerText } from '../finalView';
import { formatMoney } from '../format';
import { GAME_H, GAME_W } from '../layout';
import type { OnlineConnection } from '../online';
import { charFrameIndex, characterOfAvatar } from '../playerChars';
import { loadOnlineDevice } from '../settings';
import { sfx } from '../sfx';
import { ShopNav } from '../shopNav';
import type { InputSource } from '../sources';
import { charTexture } from '../textureKeys';

const MAX_ROWS = 8;
const ROW_H = 36;
const TOP = 112;
const FONT = { fontFamily: 'monospace', fontSize: '18px', color: '#ffffff' };
const toCss = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

/**
 * Endwertung der Serie (Phase final): Rangliste nach Gesamtverdienst mit Figur und Gesamtsieger.
 * Nur der Host holt alle zurück in die Lobby; die anderen warten. Esc verlässt den Raum.
 */
export class FinalScene extends Phaser.Scene {
  private online: OnlineConnection | null = null;
  private leaving = false;
  private requested = false;
  private source!: InputSource;
  /** Aktionstaste nur als neuer Druck (eine aus Rangliste oder Shop gehaltene Taste zählt nicht) */
  private nav = new ShopNav();
  private escKey!: Phaser.Input.Keyboard.Key;
  private winner!: Phaser.GameObjects.Text;
  private rowImages: Phaser.GameObjects.Image[] = [];
  private rowTexts: Phaser.GameObjects.Text[] = [];
  private footer!: Phaser.GameObjects.Text;
  private button!: Phaser.GameObjects.Text;

  constructor() {
    super('final');
  }

  init(data?: { online?: OnlineConnection }): void {
    this.online = data?.online ?? null;
    this.leaving = false;
    this.requested = false;
    this.nav = new ShopNav();
    this.rowImages = [];
    this.rowTexts = [];
  }

  create(): void {
    const online = this.online;
    if (!online) {
      this.scene.start('menu');
      return;
    }
    this.escKey = this.input.keyboard!.addKey('ESC');
    this.source = createSource(this, loadOnlineDevice());
    this.add.rectangle(0, 0, GAME_W, GAME_H, 0x000000, 0.9).setOrigin(0, 0);
    this.add.text(GAME_W / 2, 20, 'Endwertung', { ...FONT, fontSize: '32px', color: '#ffee58' }).setOrigin(0.5, 0);
    this.winner = this.add.text(GAME_W / 2, 66, '', { ...FONT, fontSize: '20px', align: 'center', wordWrap: { width: GAME_W - 40 } }).setOrigin(0.5, 0);
    const left = GAME_W / 2 - 220;
    for (let i = 0; i < MAX_ROWS; i++) {
      const y = TOP + i * ROW_H;
      this.rowImages.push(this.add.image(left, y + 10, charTexture('m01'), charFrameIndex('down', 0)).setScale(2).setVisible(false));
      this.rowTexts.push(this.add.text(left + 26, y, '', FONT).setVisible(false));
    }
    this.button = this.add
      .text(GAME_W / 2, GAME_H - 64, '[ Zur Lobby ]', { ...FONT, fontSize: '22px', color: '#ffee58' })
      .setOrigin(0.5, 1)
      .setInteractive({ useHandCursor: true })
      .setVisible(false);
    this.button.on('pointerdown', () => this.requestLobby());
    this.footer = this.add.text(GAME_W / 2, GAME_H - 12, '', { ...FONT, fontSize: '16px', color: '#aaaaaa', align: 'center' }).setOrigin(0.5, 1);

    online.onPhase = () => {
      if (online.roomPhase === 'lobby') this.backToLobby();
    };
    online.onClosed = () => this.leave('Verbindung zum Server verloren.');
    online.onStart = null;
    online.onError = null;
    online.onShopState = null;
    online.onJoined = null;
    online.onLobby = null;
    online.onChat = null;
    if (online.status === 'closed') this.leave('Verbindung zum Server verloren.');
    else if (online.roomPhase === 'lobby') this.backToLobby();
  }

  update(_time: number, delta: number): void {
    const online = this.online;
    if (!online || this.leaving) return;
    if (Phaser.Input.Keyboard.JustDown(this.escKey)) {
      this.leave();
      return;
    }
    // Wie im Shop: Was beim ersten Bild schon gedrückt ist (Aktionstaste von "Serie beenden" oder der Rangliste),
    // zählt nicht; sonst würde der Host die Endwertung sofort für alle überspringen
    for (const cmd of this.nav.update(this.source.read(), delta)) {
      if (cmd === 'confirm') this.requestLobby();
    }
    this.render(online);
  }

  /** Jedes Bild neu: Ranglistenzeilen, Gesamtsieger und Fußzeile (ein neuer Host bekommt sofort den Knopf). */
  private render(online: OnlineConnection): void {
    const rows = finalRows(online.ranking, online.roster, online.you).slice(0, MAX_ROWS);
    this.winner.setText(winnerText(rows));
    this.rowTexts.forEach((t, i) => {
      const row = rows[i];
      const img = this.rowImages[i];
      t.setVisible(row !== undefined);
      img.setVisible(row !== undefined && row.avatar !== null);
      if (!row) return;
      const mark = (row.isWinner ? '★' : ' ') + (row.isViewer ? '>' : ' ');
      t.setText(`${mark}${`${row.place}.`.padEnd(4)}${row.name.padEnd(17)}${formatMoney(row.total).padStart(10)}`);
      t.setColor(toCss(row.color));
      if (row.avatar !== null) {
        const key = charTexture(characterOfAvatar(row.avatar, i));
        if (this.textures.exists(key)) img.setTexture(key, charFrameIndex('down', 0));
        else img.setVisible(false);
      }
    });
    const host = online.isHost();
    this.button.setVisible(host);
    this.footer.setText(finalFooter(host, this.source.labels.action).join('\n'));
  }

  /** Nur der Host: alle zurück in die Lobby (einmal; der Server bestätigt mit phase lobby). */
  private requestLobby(): void {
    const online = this.online;
    if (!online || this.requested || !online.isHost()) return;
    this.requested = true;
    sfx.play('pickup');
    online.toLobby();
  }

  /** Der Raum ist wieder in der Lobby: dieselbe Verbindung im Online-Dialog weiterführen. */
  private backToLobby(): void {
    if (this.leaving || !this.online) return;
    this.leaving = true;
    const online = this.online;
    online.onPhase = null;
    online.onClosed = null;
    this.scene.start('menu', { resumeOnline: online });
  }

  /** Raum verlassen (Platz freigeben) und ins Menü. */
  private leave(notice?: string): void {
    if (this.leaving) return;
    this.leaving = true;
    const online = this.online;
    if (online) {
      online.onPhase = null;
      online.onClosed = null;
      online.leave();
      online.close();
    }
    this.scene.start('menu', notice ? { notice } : undefined);
  }
}
```

`packages/client/src/main.ts`: Import `import { FinalScene } from './scenes/FinalScene';` ergänzen und die Szenenliste ersetzen durch:

```ts
  scene: [BootScene, MenuScene, LobbyScene, GameScene, ShopScene, FinalScene],
```

- [ ] **Step 3: HUD-Rangliste mit Figur und Fußzeile**

Spec §3.7 verlangt die gewählte Figur auch in der Rangliste. Das Ergebnisfeld am Rundenende bekommt je Zeile ein kleines Figurenbild (Bild 0 des Bogens, Maßstab 1) in der Lücke der Platz-Spalte (`"★>1.   "`, die Spalte ist 7 Zeichen breit, das Bild sitzt ab Zeichen 4,6), damit die Zeilenbreite gleich bleibt.

In `packages/client/src/hud.ts`:

a) Import ergänzen:

```ts
import { charFrameIndex } from './playerChars';
```

b) In `class ResultsPanel` nach `private readonly rows: Phaser.GameObjects.Text[];` einfügen:

```ts
  /** Figur je Zeile (Bild 0 des Bogens); unsichtbar ohne Bogen */
  private readonly images: Phaser.GameObjects.Image[];
```

c) Im Konstruktor nach dem Block `this.rows = Array.from(…);` einfügen:

```ts
    this.images = Array.from({ length: MAX_RESULT_ROWS }, () => scene.add.image(0, 0, '__DEFAULT').setOrigin(0, 0));
```

und die Zeile `this.objects = [this.bg, this.title, this.header, ...this.rows, this.footer];` ersetzen durch:

```ts
    this.objects = [this.bg, this.title, this.header, ...this.rows, ...this.images, this.footer];
```

(Die folgende Schleife setzt Scroll-Faktor und Tiefe für alle `objects`; `Image` hat beide Methoden. Weil die Bilder in `objects` stehen, ignorieren die Weltkameras sie wie die Texte.)

d) Signatur von `show` um zwei Parameter nach `colorOf: (id: string) => number,` erweitern:

```ts
    final: boolean,
    charOf: (id: string) => string | null,
```

und darin `const footerLines = resultFooter(role, labels);` ersetzen durch `const footerLines = resultFooter(role, labels, final);`. In der Schleife `this.rows.forEach((t, i) => { … });` direkt nach `t.setPosition(left, top + PANEL_PAD + TITLE_H + i * ROW_H);` einfügen:

```ts
      const img = this.images[i];
      const key = charOf(row.id);
      img.setVisible(key !== null);
      if (key !== null) {
        // Breite eines Zeichens aus der Kopfzeile (gleiche Monospace-Schrift); Bild in der Lücke der Platz-Spalte
        const charW = this.header.width / resultHeader().length;
        img.setTexture(key, charFrameIndex('down', 0)).setPosition(left + charW * 4.6, top + PANEL_PAD + TITLE_H + i * ROW_H + 2);
      }
```

und in derselben Schleife die Zeile `t.setVisible(row !== undefined);` ergänzen um das Ausblenden des Bilds:

```ts
      t.setVisible(row !== undefined);
      if (!row) this.images[i].setVisible(false);
```

(die nachfolgende Zeile `if (!row) return;` bleibt).

e) `PlayerHud`-Konstruktor: nach `viewerId = '',` zwei Parameter ergänzen:

```ts
    /** Online nach der letzten Runde: Fußzeile "Weiter zur Endwertung" */
    private readonly isFinal: () => boolean = () => false,
    /** Bogen-Textur der Figur eines Spielers (null = keine), für das Ergebnisfeld */
    private readonly charOf: (id: string) => string | null = () => null,
```

f) Aufruf (Zeile 252) ersetzen durch:

```ts
      this.results.show(state, this.viewerId || p.id, this.role(), this.labels, this.nameOf, this.colorOf, this.isFinal(), this.charOf);
```

- [ ] **Step 4: GameScene**

In `packages/client/src/scenes/GameScene.ts`:

a) Import Zeile 12 ersetzen:

```ts
import { CHAR_ORIGIN_Y, charFrameIndex, characterFor, characterIndex, characterOfAvatar } from '../playerChars';
```

b) `onPhase` in `create` (Zeilen 200–203) ersetzen:

```ts
      // Host holt nach der Endwertung zurück in die Lobby, während hier noch die Rangliste steht
      online.onPhase = () => {
        if (online.roomPhase === 'lobby') this.backToLobby();
      };
```

c) Figurenwahl (Zeilen 264–269) ersetzen:

```ts
    // Figur je Spieler: online die gewählte Figur aus der Raumliste (sonst nach Position), lokal nach Slot-Index
    const orderIds = this.online ? this.online.roster.map((r) => r.id) : this.slots.map((s) => s.id);
    const playerIds = Object.keys(state.players);
    for (const p of Object.values(state.players)) {
      const color = this.playerColors.get(p.id) ?? 0xffffff;
      const index = characterIndex(p.id, orderIds, playerIds);
      const avatar = this.online?.roster.find((r) => r.id === p.id)?.avatar;
      const sheet = charTexture(this.online ? characterOfAvatar(avatar, index) : characterFor(index));
```

(der Rest der Schleife ab `const charKey = …` bleibt).

d) HUD-Erzeugung (Zeilen 316–321): nach `const colorOf = …;` einfügen

```ts
    const isFinal = (): boolean => online?.roomPhase === 'final';
```

und im `new PlayerHud(…)`-Aufruf `this.slots[i].id)` ersetzen durch

```ts
this.slots[i].id, isFinal, (id) => this.charKeys.get(id) ?? null)
```

(`this.charKeys` ist zu diesem Zeitpunkt schon gefüllt, siehe Schleife aus Schritt c; sie enthält online den Bogen der gewählten Figur, lokal den des Slots, und `null`, wenn die Textur fehlt.)

e) Weiter nach der Rangliste (Zeilen 435–446), online-Zweig: `this.scene.start('shop', { online });` ersetzen durch

```ts
        // Nach der letzten Runde (oder wenn die Serie inzwischen beendet ist) zur Endwertung, sonst in den Shop
        this.scene.start(online.roomPhase === 'final' ? 'final' : 'shop', { online });
```

f) In `tickReconnect` den in Plan 1 eingefügten Block

```ts
    // Zurück, aber die Serie ist vorbei: Endwertung gibt es erst mit Plan 2, also ins Menü
    if (this.joinedSeen && online.roomPhase === 'final') {
      this.leaveToMenu('Die Serie ist vorbei.');
      return true;
    }
```

ersetzen durch

```ts
    // Zurück, aber die Serie ist vorbei: zur Endwertung; ist der Raum schon wieder in der Lobby: dorthin
    if (this.joinedSeen && online.roomPhase === 'final') {
      this.plan = null;
      online.onClosed = null;
      online.onError = null;
      online.onJoined = null;
      this.scene.start('final', { online });
      return true;
    }
    if (this.joinedSeen && online.roomPhase === 'lobby') {
      this.plan = null;
      this.backToLobby();
      return true;
    }
```

g) Nach `leaveToMenu(…)` die Methode einfügen:

```ts
  /** Raum ist wieder in der Lobby (nach der Endwertung): Verbindung behalten, Lobby im Online-Dialog zeigen. */
  private backToLobby(): void {
    const online = this.online;
    if (!online) return;
    online.onClosed = null;
    online.onStart = null;
    online.onError = null;
    online.onJoined = null;
    online.onPhase = null;
    this.scene.start('menu', { resumeOnline: online });
  }
```

- [ ] **Step 5: ShopScene**

In `packages/client/src/scenes/ShopScene.ts`:

a) Den in Plan 1 geänderten `onPhase` ersetzen:

```ts
      online.onPhase = () => {
        // Host beendet die Serie: Endwertung; nach der Endwertung zurück in die Lobby
        if (online.roomPhase === 'final') this.goTo('final', { online });
        else if (online.roomPhase === 'lobby') this.goTo('menu', { resumeOnline: online });
      };
```

b) Die Prüfung am Ende des Online-Zweigs in `create` ersetzen:

```ts
      if (online.status === 'closed') this.leaveOnline('Verbindung zum Server verloren.');
      // Serie ist zu Ende (letzte Runde oder vom Host beendet), während dieser Spieler noch auf der Rangliste stand
      else if (online.roomPhase === 'final') this.goTo('final', { online });
      else if (online.roomPhase === 'lobby') this.goTo('menu', { resumeOnline: online });
```

c) Signatur von `goTo` ändern: `private goTo(scene: 'game' | 'menu' | 'final', data: object): void {` (Rumpf unverändert).

- [ ] **Step 6: MenuScene**

In `packages/client/src/scenes/MenuScene.ts`:

a) Importe ergänzen:

```ts
import { sceneForPhase } from '../finalView';
import type { OnlineConnection } from '../online';
```

b) Feld nach `private notice = '';` einfügen:

```ts
  /** Verbindung, deren Raum nach der Endwertung wieder in der Lobby ist (Online-Dialog fortsetzen) */
  private resumeOnline: OnlineConnection | null = null;
```

c) `init` ersetzen:

```ts
  init(data?: { notice?: string; resumeOnline?: OnlineConnection }): void {
    this.notice = data?.notice ?? '';
    this.resumeOnline = data?.resumeOnline ?? null;
  }
```

d) In `create` die beiden letzten Zeilen

```ts
    const joinCode = takeJoinCode();
    if (joinCode) this.openOnline(joinCode);
```

ersetzen durch

```ts
    // Zurück aus der Endwertung: gleich wieder in die Lobby derselben Verbindung
    if (this.resumeOnline) {
      const conn = this.resumeOnline;
      this.resumeOnline = null;
      this.openOnline(undefined, conn);
      return;
    }
    // Geöffneter Teilen-Link: gleich in den Online-Dialog, Tab "Beitreten" mit dem Raumcode
    const joinCode = takeJoinCode();
    if (joinCode) this.openOnline(joinCode);
```

(der Kommentar `// Geöffneter Teilen-Link: …` über den alten Zeilen entfällt, er steht jetzt im neuen Block).

e) `openOnline` ersetzen:

```ts
  private openOnline(joinCode?: string, resume?: OnlineConnection): void {
    const url = resolveServerUrl(window.location.search, import.meta.env.VITE_SERVER_URL as string | undefined);
    this.busy = true;
    this.input.keyboard!.enabled = false; // Tasten gehören dem Eingabefeld
    const done = (): void => {
      this.busy = false;
      if (this.input.keyboard) {
        this.input.keyboard.resetKeys(); // im Eingabefeld gedrückte Tasten nicht als Menü-Eingabe werten
        this.input.keyboard.enabled = true;
      }
    };
    showOnlineMenu(url, undefined, { joinCode, resume }).then(
      (conn) => {
        done();
        if (conn) this.scene.start(sceneForPhase(conn.roomPhase, conn.shop !== null), { online: conn });
      },
      () => done(),
    );
  }
```

- [ ] **Step 7: Typecheck und Tests**

Run: `cd packages/client; npx tsc --noEmit; npx vitest run`
Expected: keine Typfehler, alle Tests PASS.

- [ ] **Step 8: Manuell prüfen**

Server mit kurzer Runde starten: `ROUND_MS=20000 npm run dev:server` (PowerShell: `$env:ROUND_MS='20000'; npm run dev:server`), dazu `npm run dev`, zwei Fenster.
1. Lobby: Figuren unterschiedlich wählen; im Spiel und im Ergebnisfeld am Rundenende tragen die Spieler genau diese Figuren (lokal weiter die Slot-Figuren).
2. Host stellt "Runden: 1 Runde"; nach der Runde zeigt die Rangliste "Weiter zur Endwertung: R oder …"; weiter → "Endwertung" mit Figuren, "Gesamtsieger: …"; Host sieht "[ Zur Lobby ]", Gast "Warte auf den Host…".
3. Host kommt mit gehaltener Aktionstaste aus Rangliste bzw. Shop in die Endwertung: sie bleibt stehen. Erst ein neuer Druck der Aktionstaste oder ein Klick auf "Zur Lobby" bringt beide in derselben Lobby, Chatverlauf von vorher ist da, Figuren gleich, Rundenzahl gleich.
4. Mit "3 Runden" nach Runde 1 im Shop "Serie beenden" → Endwertung der bisherigen Runde.
5. Host schließt in der Endwertung sein Fenster: Gast wird Host und sieht nach kurzer Zeit "[ Zur Lobby ]".
6. Gast lädt in der Endwertung neu: Wiederverbindung führt zur Endwertung.

- [ ] **Step 9: Commit**

```bash
git add packages/client/src/scenes/FinalScene.ts packages/client/src/main.ts packages/client/src/scenes/GameScene.ts packages/client/src/scenes/ShopScene.ts packages/client/src/scenes/MenuScene.ts packages/client/src/hud.ts packages/client/test/shareLink.test.ts
git commit -m "feat(client): final ranking scene, chosen avatars in game and back to the lobby

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: README

**Files:**
- Modify: `README.md` (Absatz Serie, Zeile 40; Absatz Online-Dialog, Zeile 121)

**Interfaces:**
- Consumes: Verhalten aus Plan 1 und Tasks 1–9.
- Produces: Doku.

- [ ] **Step 1: Serien-Absatz**

In `README.md` im Absatz, der mit `Ein Raum (online) bzw. eine lokale Runde spielt eine Serie:` beginnt, den ersten Satz

```
Ein Raum (online) bzw. eine lokale Runde spielt eine Serie: Lobby, Runde, Rangliste, Shop-Phase, nächste Runde, bis der Host die Serie beendet (online im Shop „Serie beenden“, lokal mit Esc).
```

ersetzen durch

```
Ein Raum (online) bzw. eine lokale Runde spielt eine Serie: Lobby, Runde, Rangliste, Shop-Phase, nächste Runde. Online legt der Host in der Lobby die Rundenzahl fest (1, 3 oder 5 Runden oder „offen“, Standard 3). Nach der letzten Runde (oder wenn der Host im Shop „Serie beenden“ wählt) folgt statt des Shops die Endwertung nach Gesamtverdienst mit dem Gesamtsieger; der Host holt mit „Zur Lobby“ alle zurück in dieselbe Lobby (Code, Name, Passwort, Figuren, Einstellungen und Chat bleiben, Geld und Käufe beginnen neu), die anderen sehen „Warte auf den Host…“. Lokal endet die Serie mit Esc.
```

- [ ] **Step 2: Online-Absatz**

Den ersten Satz des Absatzes, der mit `Im Hauptmenü öffnet "Online spielen" einen Dialog mit zwei Tabs:` beginnt,

```
Im Hauptmenü öffnet "Online spielen" einen Dialog mit zwei Tabs: "Raum erstellen" (Host) und "Beitreten" (mit Raumcode; Pfeiltasten wechseln den Tab, der gewählte Tab wird gemerkt).
```

ersetzen durch

```
Im Hauptmenü öffnet "Online spielen" einen Dialog; oben steht der eigene Name (gilt für alle Tabs), darunter drei Tabs (Pfeiltasten wechseln, der gewählte Tab wird gemerkt): „Raum erstellen“ mit Raumname (Standard „<Name>s Raum“, bis 24 Zeichen), Sichtbarkeit (Öffentlich = in der Raumliste, Privat = nur per Code oder Link) und optionalem Passwort (bis 16 Zeichen); „Beitreten“ mit Raumcode und optionalem Passwort; „Raumliste“ mit allen öffentlichen Räumen (Raumname, Host, Spieler, Status; 🔒 = Passwort). In der Liste wählen Pfeil hoch/runter, Enter oder Klick tritt bei (bei 🔒 erst Passwort eingeben), R oder „Aktualisieren“ lädt neu; laufende oder volle Räume sind grau. Ein Passwort braucht man bei jedem Beitritt, nicht aber bei der Rückkehr nach einem Verbindungsabbruch; nach 5 falschen Versuchen pro Minute muss man kurz warten. In der Lobby stehen Raumname, Code und Schloss, die Spieler mit ihrer Figur und ein Raster mit allen 24 Figuren: Jede Figur gibt es pro Raum nur einmal, die eigene ist gelb umrandet, vergebene sind blass; Pfeiltasten oder Klick wählen, der Browser merkt sich die Wahl für das nächste Mal. Der Host stellt Rundenzeit und Rundenzahl ein.
```

und im selben Absatz nach `Wer den Link öffnet, landet direkt im Online-Dialog auf „Beitreten“ mit vorausgefülltem Raumcode und gibt nur noch seinen Namen ein;` den Halbsatz ` ein Passwort steht nie im Link;` einfügen (vor `?join=` verschwindet …), sodass es heißt: `… und gibt nur noch seinen Namen ein; ein Passwort steht nie im Link; `?join=` verschwindet dabei aus der Adresszeile.`

Zusätzlich im selben Absatz den Satz `ist die Runde inzwischen vorbei, geht es direkt in die Shop-Phase.` ersetzen durch `ist die Runde inzwischen vorbei, geht es direkt in die Shop-Phase bzw. zur Endwertung oder in die Lobby.`

- [ ] **Step 3: Gesamtprüfung**

Run (Repo-Wurzel): `npm test; npm run typecheck`
Expected: alles grün.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: online rooms, room list, avatars and final ranking in README

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec-Abdeckung:**
- §3.7 Figur in Spiel, Rangliste, Lobby; Wunsch in `localStorage` → Task 1 (`characterOfAvatar`, `loadAvatarWish`/`saveAvatarWish`), Task 6 (Wunsch bei `create`/`join`), Task 8 (Lobby-Liste, Raster), Task 9 (Spiel über `GameScene`, Rundenrangliste über das Ergebnisfeld in `hud.ts`, Endwertung über `FinalScene`; Ruling 18).
- §4.4 "Endwertung" mit Gesamtsieger → Task 5, Task 9.
- §4.5 vorzeitiges Ende → ShopScene führt bei `final` in die Endwertung (Task 9).
- §4.6 Knopf nur für Host, "Warte auf den Host…", neuer Host bekommt den Knopf → Task 5 (`finalFooter`), Task 9 (Fußzeile je Bild).
- §4.7 Chat bleibt → Task 6 (Test), Task 7 (`resume`), Task 9 (Rückkehr nutzt dieselbe Verbindung).
- §5.1 drei Tabs, Pfeiltasten, gemerkt → Task 3, Task 7.
- §5.2 Erstellen/Beitreten mit Feldern und Hinweis bei `wrong_password` → Task 3, Task 7 (Text aus Plan 1).
- §5.3 Raumliste: Kopfzeile, Zeilen, R/Klick, Pfeile/Enter/Klick, Passwortabfrage, Name oben, leere Liste → Task 2, Task 7.
- §5.4 Lobby: Raumname groß, Code, Link, Schloss, Spielerliste mit Figur/Farbe/Host, Raster, Rundenzeit und Rundenzahl, Chat → Task 8.
- §5.5 Link ohne Passwort → Task 9 (Test), Global Constraints.
- Tests (Spec "Client"): Menümodell der Tabs (Task 3), Raumlisten-Zeilen grau/beitretbar (Task 2), Passwortabfrage (`listAction`, Task 2), Avatar-Raster (Task 4), Endwertungstext (Task 5), Link ohne Passwort (Task 9).
- README und Töne → Task 10, Ruling 16 (`pickup` in `FinalScene.requestLobby`).

**Platzhalter-Scan:** Jeder Code-Schritt enthält vollständigen Code; jede Stelle hat genau eine verbindliche Fassung. DOM-Verhalten (Tasks 7–9) ist über die reinen Module getestet und zusätzlich mit konkreten manuellen Prüfschritten beschrieben.

**Typkonsistenz:** `characterOfAvatar(avatar: unknown, fallbackIndex: number)` in Task 1 und Task 9; `createRequest(form: CreateForm)` liefert `{ ok, value | error }` in Task 3 und Task 7; `listAction(row)` liefert `{ kind: 'join' | 'password' }` in Task 2 und Task 7; `stepAvatar(current, key, taken)` und `takenByOthers(roster, you)` in Task 4 und Task 8; `finalFooter(isHost, actionLabel): string[]` in Task 5 und Task 9; `sceneForPhase(phase, hasShopState)` in Task 5 und Task 9 (`conn.shop !== null`); `showOnlineMenu(url, factory, { joinCode, resume })` in Task 7 und Task 9; `MenuScene.init({ resumeOnline })` in Task 9 für `FinalScene`, `GameScene`, `ShopScene`.

**Review Focus:** alle fünf Punkte haben einen Test oder eine benannte Prüfung in der genannten Task.
