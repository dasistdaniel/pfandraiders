# PfandRaiders Phase 4 (Server und Online-Multiplayer) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 2 bis 8 Spieler spielen online über Raumcodes. Ein Node-Server (Docker, VPS) führt `core` autoritativ aus, Clients senden nur Eingaben und bekommen gefilterte Snapshots. Der Client läuft weiter statisch auf GitHub Pages.

**Architecture:** `core` bekommt reine, netzwerkfreie Bausteine: `sanitizeInput`, das Protokoll (`protocol.ts` mit Nachrichtentypen und Validator) und die Snapshot-Projektion (`snapshot.ts`, versteckt fremdes Geld, Container-Inhalt und Items). Neues Paket `@pfandraiders/server`: `Room` (Lobby, Spielstart, 20-Hz-Tick, Wiederverbindung, ohne Socket testbar), `RoomManager`, WebSocket-Anbindung mit `ws` (Origin-Prüfung, Ratenbegrenzung, Nachrichtenvalidierung). Der Client bekommt `OnlineConnection` (implementiert `GameConnection`, interpoliert fremde Spieler), ein DOM-Menü zum Erstellen und Betreten von Räumen und eine verallgemeinerte `GameScene`.

**Tech Stack:** wie bisher plus `ws` (Server), `esbuild` (Server-Bundle), `tsx` (Server im Entwicklungsmodus), Docker und Caddy (Auslieferung), GitHub Actions (CI und Pages).

**Spec:** `docs/superpowers/specs/2026-10-02-pfandraiders-design.md` §2 (Hosting), §3 (Aufbau), §5 (Netzwerk und Lobby), §6 Phase 4, §8 (Integrationstest mit Bot-Clients).

**Vorarbeit:** Phase 3 ist auf `master`. Arbeit auf Branch `phase-4-online` (bereits angelegt).

## Entscheidungen zum Plan (Spec ist dort still oder ungenau, bitte beim Lesen prüfen)

1. **Protokoll:** JSON über einen WebSocket je Spieler. Client an Server: `create`, `join`, `start`, `input`. Server an Client: `error`, `joined`, `lobby`, `start`, `snap`. Alle Nachrichten sind in `core/src/protocol.ts` als Typen definiert und werden serverseitig mit einem Validator geprüft. Nachrichten über 4 KB werden abgelehnt.
2. **Räume:** 4 Zeichen aus `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (ohne mehrdeutige Zeichen), 2 bis 8 Spieler, kein Account, Name 1 bis 16 Zeichen und je Raum eindeutig (ohne Beachtung der Groß-/Kleinschreibung). Der erste Spieler ist Host. Verlässt der Host den Raum, wird der nächste verbundene Spieler Host. Beitreten ist in der Lobby und zwischen den Runden möglich, nicht mitten in einer Runde (außer Wiederverbindung mit Token). Mindestens 2 verbundene Spieler zum Starten. Nach Rundenende kann der Host mit derselben Nachricht `start` eine neue Runde starten ("Nochmal").
3. **Tick und Snapshots:** 20 Ticks pro Sekunde (50 ms). Pro Tick ein `step` mit festem `dt = 50`, danach ein Snapshot pro verbundenem Spieler (individuell projiziert). Volle Snapshots als JSON (kein Delta, kein Binärformat). Das reicht für 8 Spieler grob geschätzt bei unter 100 kB/s je Client; Optimierung nur bei Bedarf.
4. **Was ein Spieler von anderen sieht (Spec §5):** Positionen, Zustand (`mode`), Leben, Container-Stufe, Schutz, Klauen-Warnung (`stealTargetId`, `stealProgressMs`). Verborgen: Geld (0, erst nach Rundenende sichtbar), Container-Inhalt (nur ein Wahrheitswert "hat Flaschen" als 1 Plastikflasche, weil Klauen-Hinweis und `canBeRobbed` das brauchen), Item (`null`), Such- und Tastenzustände. Spots zeigen nur voll oder leer. Der Zufalls-Zustand des Servers (`rngState`) wird nie gesendet. Die Karte wird einmal beim Start gesendet, nicht in jedem Snapshot.
5. **Eingaben:** Der Server hält pro Spieler die zuletzt gesendete Eingabe und wendet sie jeden Tick an. Der einmalige Kaufbefehl (`buy`) bleibt bis zum nächsten Tick erhalten und wird dann verbraucht (wie im lokalen Modus). Eingaben werden mit `sanitizeInput` bereinigt (nur erlaubte Werte), Müll wird zu "keine Eingabe". Der Client sendet bei Änderung sofort und sonst alle 100 ms (Lebenszeichen). Pro Verbindung höchstens 120 Nachrichten pro Sekunde.
6. **Wiederverbindung:** Beim Beitritt bekommt jeder Spieler ein Token (im Client in `sessionStorage`). Bricht die Verbindung ab, steht die Figur regungslos weiter im Spiel. Innerhalb von 30 s kann der Client mit `join` (Raumcode, Name, Token) zurück und bekommt sofort einen neuen `start` mit aktuellem Snapshot. Nach 30 s ist das Token ungültig, die Figur bleibt als Statist (Geld zählt für die Rangliste).
7. **Aufräumen:** Ein Raum ohne verbundenen Spieler wird nach 2 min gelöscht. Höchstens 100 Räume gleichzeitig. Eine Verbindung ohne Antwort auf Ping (alle 15 s) wird getrennt. Origin-Prüfung über die Umgebungsvariable `ALLOWED_ORIGINS` (kommagetrennt, leer = alles erlaubt, nur für Entwicklung).
8. **Client online:** Ein Spieler pro Browser, Steuerung Tastatur 1 (`WASD`, `E`, `Q`, `1` bis `4`). Die Figuren der anderen werden mit 100 ms Verzögerung interpoliert, die eigene Figur direkt aus dem neuesten Snapshot (keine Prediction in Phase 4). Gamepad online und Prediction sind nicht Teil dieser Phase.
9. **Menü:** Im Online-Menü (Taste `O` in der Lobby) wird in einem schlichten HTML-Overlay Name und Raumcode eingegeben. Die Server-Adresse kommt aus `VITE_SERVER_URL` (Build) oder dem URL-Parameter `?server=`, Vorgabe `ws://localhost:8080`.
10. **Auslieferung:** Der Server wird mit `esbuild` zu einer einzigen Datei gebündelt (`dist/server.cjs`) und läuft in `node:22-alpine`. `deploy/` enthält Docker Compose mit Caddy (automatisches TLS, Domain per `DOMAIN`). GitHub Actions: CI (Tests, Typecheck, Build) und Pages-Deploy. Das Einrichten von VPS, Domain und GitHub-Pages-Einstellung ist Handarbeit des Entwicklers (siehe README, Task 5 und 9).
11. **Nicht in Phase 4:** Prediction, Delta-Snapshots, Gamepad im Online-Modus, öffentliches Matchmaking, Chat, Persistenz, Lastverteilung über mehrere Server.

## Global Constraints

- `core` darf weder Phaser noch DOM noch Netzwerk importieren, kein `Math.random`. Das Protokoll in `core` enthält nur Typen und reine Funktionen.
- Der Server ist die einzige Quelle der Regeln. Der Client sendet nur Eingaben und zeigt Snapshots an. Server und Client teilen `core`.
- Fremdes Geld, fremder Container-Inhalt, fremde Items und der Zufalls-Zustand erreichen nie einen anderen Client (außer Geld nach Rundenende).
- Alle Eingaben aus dem Netz werden validiert, bevor sie `core` erreichen. Ein ungültiger `dtMs` erreicht `step` nie (und `step` wehrt NaN selbst ab).
- Alle Spielwerte nur in `core/src/config.ts`. Serverwerte (Port, Tickrate, Fristen) stehen in `packages/server/src/config.ts`.
- Dateien sind UTF-8, Umlaute in Kommentaren und Texten heil (prüfen mit `TextDecoder('utf-8', {fatal: true})`).
- Client-Logiktests dürfen Phaser nicht importieren.
- Commit-Nachrichten enden mit der Zeile `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Alle bestehenden Tests bleiben grün.

## Review Focus

- Ein anderer Spieler erfährt nie dein Geld, deinen Container-Inhalt, dein Item oder `rngState`, auch nicht über Spots, NPCs oder `lobby`-Nachrichten (Tasks 2, 4).
- Böse oder kaputte Nachrichten (kein JSON, falsche Typen, riesige Zahlen, unbekannte `t`, `__proto__`, zu lange Namen, zu große Nachrichten) bringen den Server nicht zum Absturz und ändern keinen Spielzustand (Tasks 1, 4).
- Nur der Host kann starten, nur mit mindestens 2 verbundenen Spielern, nicht doppelt während einer Runde (Task 3).
- Eingabe-Flut wird begrenzt, die Verbindung bleibt gesund (Task 4).
- Wiederverbindung mit Token klappt innerhalb der Frist und scheitert danach und mit falschem Token; fremdes Token eines anderen Raums hilft nicht (Task 3).
- Host-Wechsel beim Verlassen, leere Räume werden gelöscht, Raumcodes kollidieren nicht (Tasks 3, 4).
- Kaufbefehle gehen weder verloren noch doppelt (Tasks 3, 6).
- Interpolation: fremde Figuren springen nicht, neu auftauchende Figuren und NPCs brechen sie nicht (Task 6).
- Server-Bundle startet ohne `node_modules` (Task 5).

---

## File Structure

```
packages/core/src/
  sanitize.ts   neu: BUY_COMMANDS, sanitizeInput
  protocol.ts   neu: Nachrichtentypen, Konstanten, parseClientMessage
  snapshot.ts   neu: Snapshot, projectSnapshot, stateFromSnapshot
  step.ts       ändern: dt NaN abwehren
  index.ts      ändern: Exporte
packages/core/test/  sanitize.test.ts protocol.test.ts snapshot.test.ts timer.test.ts(ändern)
packages/server/
  package.json tsconfig.json vitest.config.ts(optional)
  src/ config.ts room.ts rooms.ts server.ts index.ts
  test/ room.test.ts rooms.test.ts server.test.ts
  Dockerfile
deploy/  docker-compose.yml Caddyfile
.github/workflows/  ci.yml pages.yml
packages/client/src/
  interpolate.ts online.ts (OnlineConnection) onlineMenu.ts
  connection.ts (ändern: GameConnection optional erweitern)
  scenes/GameScene.ts scenes/LobbyScene.ts (ändern)
packages/client/test/  interpolate.test.ts online.test.ts
package.json (Root-Skripte), README.md
```

---

### Task 1: Eingaben bereinigen, Protokoll, `step` gegen NaN

**Files:**
- Create: `packages/core/src/sanitize.ts`, `packages/core/src/protocol.ts`
- Modify: `packages/core/src/step.ts`, `packages/core/src/index.ts`
- Test: `packages/core/test/sanitize.test.ts`, `packages/core/test/protocol.test.ts`, `packages/core/test/timer.test.ts`

**Interfaces:**
- Produces: `BUY_COMMANDS`, `sanitizeInput(raw: unknown): Input`; `ClientMessage`, `ServerMessage`, `RosterEntry`, `ErrorCode`, `Snapshot`-unabhängige Typen (der Typ `Snapshot` kommt in Task 2; `ServerMessage` referenziert ihn über `import type`, daher in Task 1 nur den Typ `Snapshot` als Platzhalter-Import aus `./snapshot` vermeiden: siehe Step 3), Konstanten `ROOM_CODE_CHARS`, `ROOM_CODE_LENGTH`, `MAX_ROOM_PLAYERS`, `MIN_START_PLAYERS`, `MAX_NAME_LENGTH`, `MAX_MESSAGE_BYTES`, `ROOM_COLORS`; `parseClientMessage(raw: unknown): ClientMessage | null`.

- [ ] **Step 1: Failing Tests schreiben**

`packages/core/test/sanitize.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { sanitizeInput } from '../src/sanitize';
import { NO_INPUT } from '../src/types';

describe('sanitizeInput', () => {
  it('keeps a valid input', () => {
    const i = { moveX: -1, moveY: 1, action: true, steal: true, buy: 'food' };
    expect(sanitizeInput(i)).toEqual(i);
  });

  it('accepts every buy command and null', () => {
    for (const buy of ['upgrade', 'food', 'bolt_cutters', 'dog_treat']) {
      expect(sanitizeInput({ ...NO_INPUT, buy }).buy).toBe(buy);
    }
    expect(sanitizeInput({ ...NO_INPUT, buy: null }).buy).toBeNull();
  });

  it('turns anything that is not an object into no input', () => {
    for (const bad of [null, undefined, 5, 'x', true, []]) {
      expect(sanitizeInput(bad)).toEqual(NO_INPUT);
    }
  });

  it('clamps out-of-range and wrong-typed fields to safe values', () => {
    const out = sanitizeInput({
      moveX: 1000,
      moveY: '1',
      action: 'yes',
      steal: 1,
      buy: 'nonsense',
    });
    expect(out).toEqual(NO_INPUT);
    expect(sanitizeInput({ moveX: NaN, moveY: Infinity })).toEqual(NO_INPUT);
    expect(sanitizeInput({ buy: '__proto__' }).buy).toBeNull();
    expect(sanitizeInput({ buy: 'constructor' }).buy).toBeNull();
  });

  it('returns a fresh object and ignores extra fields', () => {
    const raw = { moveX: 1, extra: 'x' };
    const out = sanitizeInput(raw);
    expect(out).not.toBe(raw);
    expect('extra' in out).toBe(false);
  });
});
```

`packages/core/test/protocol.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  MAX_NAME_LENGTH,
  parseClientMessage,
  ROOM_CODE_CHARS,
  ROOM_CODE_LENGTH,
} from '../src/protocol';

describe('parseClientMessage', () => {
  it('accepts create with a trimmed name', () => {
    expect(parseClientMessage({ t: 'create', name: '  Anna  ' })).toEqual({ t: 'create', name: 'Anna' });
  });

  it('rejects names that are empty, too long or not strings', () => {
    expect(parseClientMessage({ t: 'create', name: '   ' })).toBeNull();
    expect(parseClientMessage({ t: 'create', name: 'x'.repeat(MAX_NAME_LENGTH + 1) })).toBeNull();
    expect(parseClientMessage({ t: 'create', name: 5 })).toBeNull();
    expect(parseClientMessage({ t: 'create' })).toBeNull();
  });

  it('removes control characters from names', () => {
    expect(parseClientMessage({ t: 'create', name: 'A\u0000n\nna' })).toEqual({ t: 'create', name: 'Anna' });
  });

  it('accepts join with an uppercase room code and optional token', () => {
    const code = ROOM_CODE_CHARS.slice(0, ROOM_CODE_LENGTH);
    expect(parseClientMessage({ t: 'join', room: code.toLowerCase(), name: 'Bo' })).toEqual({
      t: 'join',
      room: code,
      name: 'Bo',
    });
    expect(parseClientMessage({ t: 'join', room: code, name: 'Bo', token: 'abc' })).toEqual({
      t: 'join',
      room: code,
      name: 'Bo',
      token: 'abc',
    });
  });

  it('rejects bad room codes and bad tokens', () => {
    expect(parseClientMessage({ t: 'join', room: 'AB', name: 'Bo' })).toBeNull();
    expect(parseClientMessage({ t: 'join', room: 'ABCDE', name: 'Bo' })).toBeNull();
    expect(parseClientMessage({ t: 'join', room: 'AB!D', name: 'Bo' })).toBeNull();
    expect(parseClientMessage({ t: 'join', room: 'ABCD', name: 'Bo', token: 5 })).toBeNull();
    expect(parseClientMessage({ t: 'join', room: 'ABCD', name: 'Bo', token: 'x'.repeat(200) })).toBeNull();
  });

  it('accepts start', () => {
    expect(parseClientMessage({ t: 'start' })).toEqual({ t: 'start' });
  });

  it('accepts input and sanitizes its payload', () => {
    expect(parseClientMessage({ t: 'input', seq: 7, input: { moveX: 5, action: true } })).toEqual({
      t: 'input',
      seq: 7,
      input: { moveX: 0, moveY: 0, action: true, steal: false, buy: null },
    });
  });

  it('rejects input with a bad sequence number', () => {
    expect(parseClientMessage({ t: 'input', seq: 'a', input: {} })).toBeNull();
    expect(parseClientMessage({ t: 'input', seq: -1, input: {} })).toBeNull();
    expect(parseClientMessage({ t: 'input', seq: 1.5, input: {} })).toBeNull();
    expect(parseClientMessage({ t: 'input', seq: Number.MAX_SAFE_INTEGER + 10, input: {} })).toBeNull();
  });

  it('rejects unknown types, non-objects and prototype tricks', () => {
    for (const bad of [null, undefined, 5, 'x', [], { t: 'nope' }, { t: 5 }, {}, { t: '__proto__' }]) {
      expect(parseClientMessage(bad)).toBeNull();
    }
  });
});
```

Am Ende von `packages/core/test/timer.test.ts` im bestehenden `describe` anhängen:
```ts
  it('ignores non-finite time steps instead of poisoning the state', () => {
    const s = createGame(1, map, ['p1']);
    step(s, {}, Number.NaN);
    step(s, {}, Number.POSITIVE_INFINITY);
    expect(Number.isNaN(s.timeLeftMs)).toBe(false);
    expect(s.timeLeftMs).toBeGreaterThan(CONFIG.roundMs - 200);
    expect(Number.isNaN(s.players.p1.health)).toBe(false);
  });
```
(`map`, `createGame`, `step`, `CONFIG` sind in dieser Datei bereits importiert bzw. definiert; sonst ergänzen.)

Run: `npm test -w @pfandraiders/core -- test/sanitize.test.ts test/protocol.test.ts test/timer.test.ts`
Expected: FAIL (Module fehlen, NaN-Test schlägt fehl).

- [ ] **Step 2: `sanitize.ts` schreiben**

`packages/core/src/sanitize.ts`:
```ts
import { NO_INPUT } from './types';
import type { BuyCommand, Input } from './types';

export const BUY_COMMANDS: readonly BuyCommand[] = ['upgrade', 'food', 'bolt_cutters', 'dog_treat'];

function axis(v: unknown): -1 | 0 | 1 {
  return v === -1 || v === 1 ? v : 0;
}

/** Macht aus beliebigen Daten (zum Beispiel aus dem Netz) eine gültige Eingabe. Alles Ungültige wird zu "keine Eingabe". */
export function sanitizeInput(raw: unknown): Input {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ...NO_INPUT };
  const r = raw as Record<string, unknown>;
  const buy =
    typeof r.buy === 'string' && (BUY_COMMANDS as readonly string[]).includes(r.buy)
      ? (r.buy as BuyCommand)
      : null;
  return {
    moveX: axis(r.moveX),
    moveY: axis(r.moveY),
    action: r.action === true,
    steal: r.steal === true,
    buy,
  };
}
```

- [ ] **Step 3: `protocol.ts` schreiben**

Die Server-Nachrichten brauchen den Snapshot-Typ aus Task 2. Damit Task 1 für sich kompiliert, definiert `protocol.ts` den Snapshot-Typ selbst nicht, sondern nutzt `Omit<GameState, 'map'>` direkt unter dem Namen `Snapshot`; `snapshot.ts` (Task 2) importiert diesen Typ von dort statt ihn neu zu definieren.

`packages/core/src/protocol.ts`:
```ts
import { sanitizeInput } from './sanitize';
import type { GameState, Input, MapData } from './types';

/** Vom Server gesendeter Zustand ohne die (statische) Karte. */
export type Snapshot = Omit<GameState, 'map'>;

export const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 4;
export const MAX_ROOM_PLAYERS = 8;
export const MIN_START_PLAYERS = 2;
export const MAX_NAME_LENGTH = 16;
export const MAX_TOKEN_LENGTH = 64;
/** Größte erlaubte Nachricht vom Client in Bytes */
export const MAX_MESSAGE_BYTES = 4096;
/** Spielerfarben (0xRRGGBB), Index = Beitrittsreihenfolge */
export const ROOM_COLORS = [
  0xef5350, 0xab47bc, 0x26c6da, 0xec407a, 0xffa726, 0x66bb6a, 0x8d6e63, 0x5c6bc0,
];

export type ErrorCode =
  | 'bad_message'
  | 'room_not_found'
  | 'room_full'
  | 'name_taken'
  | 'not_host'
  | 'already_started'
  | 'need_players'
  | 'not_in_room'
  | 'rate_limited'
  | 'too_many_rooms';

export type ClientMessage =
  | { t: 'create'; name: string }
  | { t: 'join'; room: string; name: string; token?: string }
  | { t: 'start' }
  | { t: 'input'; seq: number; input: Input };

export interface RosterEntry {
  id: string;
  name: string;
  color: number;
  connected: boolean;
}

export type RoomPhase = 'lobby' | 'running' | 'ended';

export type ServerMessage =
  | { t: 'error'; code: ErrorCode; message: string }
  | { t: 'joined'; room: string; you: string; token: string }
  | { t: 'lobby'; room: string; host: string; players: RosterEntry[]; phase: RoomPhase }
  | { t: 'start'; map: MapData; you: string; players: RosterEntry[]; snap: Snapshot }
  | { t: 'snap'; snap: Snapshot; ack: number };

function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  // Steuerzeichen entfernen, Ränder trimmen
  const name = raw.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (name.length === 0 || name.length > MAX_NAME_LENGTH) return null;
  return name;
}

function cleanRoom(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.toUpperCase();
  if (code.length !== ROOM_CODE_LENGTH) return null;
  for (const ch of code) if (!ROOM_CODE_CHARS.includes(ch)) return null;
  return code;
}

/** Prüft eine Client-Nachricht (bereits aus JSON geparst). null = ungültig. */
export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const m = raw as Record<string, unknown>;
  switch (m.t) {
    case 'create': {
      const name = cleanName(m.name);
      return name === null ? null : { t: 'create', name };
    }
    case 'join': {
      const name = cleanName(m.name);
      const room = cleanRoom(m.room);
      if (name === null || room === null) return null;
      if (m.token === undefined) return { t: 'join', room, name };
      if (typeof m.token !== 'string' || m.token.length === 0 || m.token.length > MAX_TOKEN_LENGTH) {
        return null;
      }
      return { t: 'join', room, name, token: m.token };
    }
    case 'start':
      return { t: 'start' };
    case 'input': {
      const seq = m.seq;
      if (typeof seq !== 'number' || !Number.isSafeInteger(seq) || seq < 0) return null;
      return { t: 'input', seq, input: sanitizeInput(m.input) };
    }
    default:
      return null;
  }
}
```
Hinweis: `Object.hasOwn`-Prüfung für `m.t` ist nicht nötig, weil `switch` nur auf exakte Zeichenketten vergleicht (`'__proto__'` fällt in `default`).

- [ ] **Step 4: `step.ts` gegen NaN härten und exportieren**

In `packages/core/src/step.ts` die Zeile `const dt = Math.min(Math.max(dtMs, 0), CONFIG.maxStepMs);` ersetzen durch:
```ts
  const dt = Number.isFinite(dtMs) ? Math.min(Math.max(dtMs, 0), CONFIG.maxStepMs) : 0;
```
`packages/core/src/index.ts` ergänzen:
```ts
export * from './sanitize';
export * from './protocol';
```

- [ ] **Step 5: Tests und Typecheck**

Run: `npm test -w @pfandraiders/core && npm run typecheck -w @pfandraiders/core`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core
git commit -m "feat(core): add input sanitizing, wire protocol types and NaN-safe step

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Snapshot-Projektion

**Files:**
- Create: `packages/core/src/snapshot.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/snapshot.test.ts`

**Interfaces:**
- Consumes: `Snapshot` aus `protocol.ts`.
- Produces: `projectSnapshot(state: GameState, viewerId: string): Snapshot`, `stateFromSnapshot(map: MapData, snap: Snapshot): GameState`.

- [ ] **Step 1: Failing Tests schreiben**

`packages/core/test/snapshot.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { totalBottles } from '../src/bottles';
import { canBeRobbed, findStealTarget, isBeingRobbed } from '../src/theft';
import { projectSnapshot, stateFromSnapshot } from '../src/snapshot';
import { input, newGame, runSteps, THIEF_ROWS } from './helpers';

function game() {
  const s = newGame(THIEF_ROWS, ['p1', 'p2']);
  s.players.p1.money = 1234;
  s.players.p1.bottles = { plastic: 2, glass: 1, crate: 1 };
  s.players.p1.item = 'bolt_cutters';
  s.players.p1.containerLevel = 1;
  s.players.p2.money = 777;
  s.players.p2.bottles = { plastic: 0, glass: 3, crate: 0 };
  s.players.p2.item = 'dog_treat';
  s.rngState = 987654321;
  return s;
}

describe('projectSnapshot', () => {
  it('keeps everything of the viewer', () => {
    const s = game();
    const snap = projectSnapshot(s, 'p1');
    expect(snap.players.p1).toEqual(s.players.p1);
  });

  it('hides money, container contents and item of other players', () => {
    const s = game();
    const other = projectSnapshot(s, 'p1').players.p2;
    expect(other.money).toBe(0);
    expect(other.item).toBeNull();
    expect(other.bottles).toEqual({ plastic: 1, glass: 0, crate: 0 }); // nur "hat Flaschen"
    expect(other.containerLevel).toBe(s.players.p2.containerLevel);
    expect(other.health).toBe(s.players.p2.health);
    expect(other.x).toBe(s.players.p2.x);
  });

  it('shows no bottles for other players with an empty container', () => {
    const s = game();
    s.players.p2.bottles = { plastic: 0, glass: 0, crate: 0 };
    expect(totalBottles(projectSnapshot(s, 'p1').players.p2.bottles)).toBe(0);
  });

  it('never leaks the server random state or timers', () => {
    const snap = projectSnapshot(game(), 'p1');
    expect(snap.rngState).toBe(0);
    expect(snap.nextNpcMs).toBe(0);
    expect(JSON.stringify(snap)).not.toContain('987654321');
  });

  it('does not leak search progress or key state of other players', () => {
    const s = game();
    s.players.p2.searchSpotId = 0;
    s.players.p2.searchProgressMs = 1500;
    s.players.p2.actionHeld = true;
    s.players.p2.stealHeld = true;
    const other = projectSnapshot(s, 'p1').players.p2;
    expect(other.searchSpotId).toBeNull();
    expect(other.searchProgressMs).toBe(0);
    expect(other.actionHeld).toBe(false);
    expect(other.stealHeld).toBe(false);
  });

  it('keeps the public theft warning of other players', () => {
    const s = game();
    s.players.p2.stealTargetId = 'p1';
    s.players.p2.stealProgressMs = 400;
    const snap = projectSnapshot(s, 'p1');
    expect(snap.players.p2.stealTargetId).toBe('p1');
    expect(isBeingRobbed(stateFromSnapshot(s.map, snap), 'p1')).toBe(true);
  });

  it('shows spots only as full or empty', () => {
    const s = game();
    s.spots[0].contents = { plastic: 2, glass: 1, crate: 0 };
    s.spots[0].refillInMs = 12345;
    const spot = projectSnapshot(s, 'p1').spots[0];
    expect(spot.contents).toEqual({ plastic: 1, glass: 0, crate: 0 });
    expect(spot.refillInMs).toBe(0);
    s.spots[0].contents = { plastic: 0, glass: 0, crate: 0 };
    expect(totalBottles(projectSnapshot(s, 'p1').spots[0].contents)).toBe(0);
  });

  it('reveals every player money once the round has ended', () => {
    const s = game();
    s.phase = 'ended';
    const snap = projectSnapshot(s, 'p1');
    expect(snap.players.p2.money).toBe(777);
    expect(snap.players.p1.money).toBe(1234);
    expect(snap.players.p2.bottles.plastic).toBe(1); // Container-Inhalt bleibt auch dann verborgen
    expect(snap.players.p2.item).toBeNull();
  });

  it('does not contain the map and does not alias the server state', () => {
    const s = game();
    const snap = projectSnapshot(s, 'p1');
    expect('map' in snap).toBe(false);
    snap.players.p1.money = 1;
    snap.spots[0].contents.plastic = 99;
    expect(s.players.p1.money).toBe(1234);
    expect(s.spots[0].contents.plastic).not.toBe(99);
  });

  it('survives a JSON round trip unchanged', () => {
    const snap = projectSnapshot(game(), 'p2');
    expect(JSON.parse(JSON.stringify(snap))).toEqual(snap);
  });

  it('keeps the steal hint working for the viewer through the projection', () => {
    const s = game();
    s.players.p1.bottles = { plastic: 0, glass: 0, crate: 0 };
    s.players.p1.containerLevel = 1;
    const view = stateFromSnapshot(s.map, projectSnapshot(s, 'p1'));
    expect(canBeRobbed(view.players.p1, view.players.p2)).toBe(true);
    expect(findStealTarget(view, view.players.p1)?.id).toBe('p2');
  });

  it('still projects correctly after the game has run', () => {
    const s = game();
    runSteps(s, { p1: input({ moveX: 1 }) }, 10, 20);
    const snap = projectSnapshot(s, 'p2');
    expect(snap.tick).toBe(10);
    expect(snap.players.p1.x).toBe(s.players.p1.x);
    expect(snap.players.p1.money).toBe(0);
  });
});

describe('stateFromSnapshot', () => {
  it('puts the map back to build a full GameState', () => {
    const s = game();
    const snap = projectSnapshot(s, 'p1');
    const state = stateFromSnapshot(s.map, snap);
    expect(state.map).toBe(s.map);
    expect(state.tick).toBe(s.tick);
    expect(state.players.p1.money).toBe(1234);
  });
});
```

Run: `npm test -w @pfandraiders/core -- test/snapshot.test.ts`
Expected: FAIL, "Failed to resolve import ../src/snapshot".

- [ ] **Step 2: `snapshot.ts` schreiben**

`packages/core/src/snapshot.ts`:
```ts
import { totalBottles } from './bottles';
import type { Snapshot } from './protocol';
import type { GameState, MapData } from './types';

/**
 * Der Zustand, den ein bestimmter Spieler sehen darf (Spec §5).
 * Fremdes Geld (bis Rundenende), fremder Container-Inhalt, fremde Items,
 * Such- und Tastenzustände und der Zufalls-Zustand werden entfernt.
 * Vom fremden Container bleibt nur "hat Flaschen" (als eine Plastikflasche).
 */
export function projectSnapshot(state: GameState, viewerId: string): Snapshot {
  const { map: _map, ...rest } = state;
  // JSON-Kopie: kein Aliasing mit dem Serverzustand
  const snap = JSON.parse(JSON.stringify(rest)) as Snapshot;
  const revealMoney = snap.phase === 'ended';

  for (const p of Object.values(snap.players)) {
    if (p.id === viewerId) continue;
    p.bottles = { plastic: totalBottles(p.bottles) > 0 ? 1 : 0, glass: 0, crate: 0 };
    p.item = null;
    if (!revealMoney) p.money = 0;
    p.searchSpotId = null;
    p.searchProgressMs = 0;
    p.actionHeld = false;
    p.stealHeld = false;
  }
  for (const spot of snap.spots) {
    spot.contents = { plastic: totalBottles(spot.contents) > 0 ? 1 : 0, glass: 0, crate: 0 };
    spot.refillInMs = 0;
  }
  snap.rngState = 0;
  snap.nextNpcMs = 0;
  snap.nextNpcId = 0;
  return snap;
}

/** Setzt aus Karte und Snapshot einen vollständigen GameState zusammen (für Anzeige und Hinweise im Client). */
export function stateFromSnapshot(map: MapData, snap: Snapshot): GameState {
  return { ...snap, map };
}
```

`packages/core/src/index.ts` ergänzen: `export * from './snapshot';`
(Der Typ `Snapshot` wird nur aus `protocol.ts` exportiert, `snapshot.ts` importiert ihn.)

- [ ] **Step 3: Tests und Typecheck**

Run: `npm test -w @pfandraiders/core && npm run typecheck -w @pfandraiders/core`
Expected: PASS. Fällt der Test 'hides ... bottles' durch, weil `ROOM_COLORS` oder ähnliches fehlt, ist `protocol.ts` aus Task 1 unvollständig: dort beheben.

- [ ] **Step 4: Commit**

```bash
git add packages/core
git commit -m "feat(core): add per-viewer snapshot projection that hides private data

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Server-Paket und `Room`

**Files:**
- Create: `packages/server/package.json`, `packages/server/tsconfig.json`, `packages/server/src/config.ts`, `packages/server/src/room.ts`
- Test: `packages/server/test/room.test.ts`
- Modify: `package.json` (Root-Skripte)

**Interfaces:**
- Produces: `Conn { send(msg: ServerMessage): void }`, `Member`, `Room` mit `join`, `leave`, `start`, `setInput`, `tick`, `isDead`, `lobbyMessage`, `hostId`; `SERVER_CONFIG`.
- `Room` kennt keine Sockets und keine echte Uhr (Zeit über `now()`, Zufall über `random()` injizierbar).

- [ ] **Step 1: Paketdateien**

`packages/server/package.json`:
```json
{
  "name": "@pfandraiders/server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "node dist/server.cjs",
    "build": "esbuild src/index.ts --bundle --platform=node --target=node22 --format=cjs --external:bufferutil --external:utf-8-validate --outfile=dist/server.cjs",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@pfandraiders/core": "*",
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "@types/ws": "^8.5.0",
    "esbuild": "^0.25.0",
    "tsx": "^4.19.0"
  }
}
```
`packages/server/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "types": ["node"] },
  "include": ["src", "test"]
}
```
Root-`package.json` Skripte ergänzen: `"dev:server": "npm run dev -w @pfandraiders/server"`, `"build:server": "npm run build -w @pfandraiders/server"`. Run: `npm install` (installiert `ws`, `esbuild`, `tsx`, `@types/ws`; falls `@types/node` fehlt: `npm install -D @types/node -w @pfandraiders/server`).

`packages/server/src/config.ts`:
```ts
/** Serverwerte (Spielwerte stehen in core/config.ts). */
export const SERVER_CONFIG = {
  /** Tickdauer in ms: 20 Ticks pro Sekunde */
  stepMs: 50,
  /** So lange kann ein getrennter Spieler mit seinem Token zurückkehren */
  graceMs: 30_000,
  /** Raum ohne verbundenen Spieler wird nach so langer Zeit gelöscht */
  emptyRoomMs: 120_000,
  maxRooms: 100,
  /** Höchstens so viele Nachrichten pro Sekunde und Verbindung */
  maxMessagesPerSecond: 120,
  pingEveryMs: 15_000,
};
```

- [ ] **Step 2: Failing Tests schreiben**

`packages/server/test/room.test.ts`:
```ts
import { CITY_MAP, MAX_ROOM_PLAYERS, NO_INPUT } from '@pfandraiders/core';
import type { Input, ServerMessage } from '@pfandraiders/core';
import { describe, expect, it } from 'vitest';
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

function setup(opts: { roundMs?: number } = {}) {
  let time = 0;
  const room = new Room('ABCD', { now: () => time, random: () => 0.5, roundMs: opts.roundMs });
  const advance = (ms: number) => {
    time += ms;
  };
  return { room, advance };
}

function twoPlayers(opts: { roundMs?: number } = {}) {
  const { room, advance } = setup(opts);
  const a = new FakeConn();
  const b = new FakeConn();
  const ra = room.join('Anna', a);
  const rb = room.join('Bob', b);
  if (!ra.ok || !rb.ok) throw new Error('join failed');
  return { room, advance, a, b, ma: ra.value, mb: rb.value };
}

const MOVE_RIGHT: Input = { ...NO_INPUT, moveX: 1 };

describe('joining', () => {
  it('assigns increasing ids, colors and a token, and the first player is host', () => {
    const { room, ma, mb } = twoPlayers();
    expect(ma.id).toBe('p1');
    expect(mb.id).toBe('p2');
    expect(ma.token).not.toBe(mb.token);
    expect(ma.token.length).toBeGreaterThan(10);
    expect(ma.color).not.toBe(mb.color);
    expect(room.hostId()).toBe('p1');
  });

  it('broadcasts the lobby to everybody after each change', () => {
    const { a, b } = twoPlayers();
    expect(a.last('lobby').players.map((p) => p.name)).toEqual(['Anna', 'Bob']);
    expect(b.last('lobby').host).toBe('p1');
    expect(b.last('lobby').phase).toBe('lobby');
  });

  it('rejects a duplicate name regardless of case', () => {
    const { room } = twoPlayers();
    const r = room.join('ANNA', new FakeConn());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('name_taken');
  });

  it('rejects the ninth player', () => {
    const { room } = setup();
    for (let i = 0; i < MAX_ROOM_PLAYERS; i++) expect(room.join(`P${i}`, new FakeConn()).ok).toBe(true);
    const r = room.join('Extra', new FakeConn());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('room_full');
  });

  it('rejects new players during a running round', () => {
    const { room } = twoPlayers();
    expect(room.start('p1').ok).toBe(true);
    const r = room.join('Late', new FakeConn());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('already_started');
  });
});

describe('start', () => {
  it('lets only the host start, and only with two connected players', () => {
    const { room } = setup();
    const a = new FakeConn();
    room.join('Anna', a);
    expect(room.start('p1')).toMatchObject({ ok: false, code: 'need_players' });
    room.join('Bob', new FakeConn());
    expect(room.start('p2')).toMatchObject({ ok: false, code: 'not_host' });
    expect(room.start('p1').ok).toBe(true);
    expect(room.start('p1')).toMatchObject({ ok: false, code: 'already_started' });
  });

  it('sends every player a start message with the map, their id, the roster and their own snapshot', () => {
    const { room, a, b } = twoPlayers();
    room.start('p1');
    const sa = a.last('start');
    const sb = b.last('start');
    expect(sa.you).toBe('p1');
    expect(sb.you).toBe('p2');
    expect(sa.map.cols).toBe(CITY_MAP.cols);
    expect(sa.players).toHaveLength(2);
    expect(Object.keys(sa.snap.players)).toEqual(['p1', 'p2']);
    expect(room.phase).toBe('running');
  });
});

describe('ticking', () => {
  it('steps the game and sends each player an individually projected snapshot', () => {
    const { room, a, b } = twoPlayers();
    room.start('p1');
    room.state!.players.p1.money = 500;
    room.state!.players.p2.money = 300;
    room.tick();
    const sa = a.last('snap').snap;
    const sb = b.last('snap').snap;
    expect(sa.tick).toBe(1);
    expect(sa.players.p1.money).toBe(500);
    expect(sa.players.p2.money).toBe(0); // fremdes Geld verborgen
    expect(sb.players.p2.money).toBe(300);
    expect(sb.players.p1.money).toBe(0);
    expect(sa.rngState).toBe(0);
  });

  it('applies the last received input every tick until a new one arrives', () => {
    const { room, a, ma } = twoPlayers();
    room.start('p1');
    const x0 = room.state!.players.p1.x;
    room.setInput(ma, 1, MOVE_RIGHT);
    room.tick();
    room.tick();
    const x2 = room.state!.players.p1.x;
    expect(x2).toBeGreaterThan(x0);
    room.setInput(ma, 2, NO_INPUT);
    room.tick();
    expect(room.state!.players.p1.x).toBe(x2);
    expect(a.last('snap').ack).toBe(2);
  });

  it('applies a buy command exactly once, also if a newer input without it arrives first', () => {
    const { room, ma } = twoPlayers();
    room.start('p1');
    const shop = room.state!.map.shops[0];
    room.state!.players.p1.x = shop.x;
    room.state!.players.p1.y = shop.y;
    room.state!.players.p1.money = 10_000;
    room.setInput(ma, 1, { ...NO_INPUT, buy: 'upgrade' });
    room.setInput(ma, 2, NO_INPUT); // überschreibt vor dem Tick, der Kauf darf nicht verloren gehen
    room.tick();
    room.tick();
    room.tick();
    expect(room.state!.players.p1.containerLevel).toBe(1);
  });

  it('ignores input from members that are not connected and uses no input for them', () => {
    const { room, ma } = twoPlayers();
    room.start('p1');
    room.setInput(ma, 1, MOVE_RIGHT);
    room.tick();
    const x = room.state!.players.p1.x;
    room.leave(ma.conn!);
    room.tick();
    room.tick();
    expect(room.state!.players.p1.x).toBe(x); // steht still
  });

  it('ends the round, tells everybody and reveals the money', () => {
    const { room, a, b } = twoPlayers({ roundMs: 100 });
    room.start('p1');
    room.state!.players.p2.money = 321;
    room.tick();
    room.tick();
    expect(room.phase).toBe('ended');
    expect(a.last('lobby').phase).toBe('ended');
    expect(a.last('snap').snap.phase).toBe('ended');
    expect(a.last('snap').snap.players.p2.money).toBe(321);
    const ticks = a.of('snap').length;
    room.tick();
    expect(a.of('snap').length).toBe(ticks); // nach dem Ende keine Snapshots mehr
    expect(b.of('snap').length).toBe(ticks);
  });

  it('can start another round after the end with the same members', () => {
    const { room, a } = twoPlayers({ roundMs: 100 });
    room.start('p1');
    room.tick();
    room.tick();
    expect(room.phase).toBe('ended');
    expect(room.start('p1').ok).toBe(true);
    expect(room.phase).toBe('running');
    expect(a.of('start')).toHaveLength(2);
    expect(room.state!.tick).toBe(0);
  });
});

describe('leaving and reconnecting', () => {
  it('removes a leaving player from the lobby completely', () => {
    const { room, a, ma, mb } = twoPlayers();
    room.leave(mb.conn!);
    expect(room.members.map((m) => m.id)).toEqual(['p1']);
    expect(a.last('lobby').players).toHaveLength(1);
    expect(room.hostId()).toBe(ma.id);
  });

  it('moves the host role to the next connected player when the host leaves', () => {
    const { room, b, ma } = twoPlayers();
    room.leave(ma.conn!);
    expect(room.hostId()).toBe('p2');
    expect(b.last('lobby').host).toBe('p2');
  });

  it('keeps a disconnected player in a running game and lets him back in with the token', () => {
    const { room, advance, ma } = twoPlayers();
    room.start('p1');
    const oldConn = ma.conn!;
    room.leave(oldConn);
    expect(room.state!.players.p1).toBeDefined();
    advance(10_000);
    const fresh = new FakeConn();
    const r = room.join('Anna', fresh, ma.token);
    expect(r.ok).toBe(true);
    expect(fresh.last('start').you).toBe('p1');
    expect(fresh.last('start').snap.tick).toBe(room.state!.tick);
    room.tick();
    expect(fresh.of('snap')).toHaveLength(1);
  });

  it('refuses the token after the grace period and for a wrong token', () => {
    const { room, advance, ma } = twoPlayers();
    room.start('p1');
    room.leave(ma.conn!);
    expect(room.join('Anna', new FakeConn(), 'wrong-token')).toMatchObject({ ok: false });
    advance(31_000);
    room.tick();
    expect(room.join('Anna', new FakeConn(), ma.token)).toMatchObject({ ok: false, code: 'already_started' });
    expect(room.state!.players.p1).toBeDefined(); // Figur bleibt als Statist
  });

  it('does not accept a token of a different room', () => {
    const { room } = twoPlayers();
    const other = new Room('WXYZ');
    const c = new FakeConn();
    const r = other.join('Cara', c);
    if (!r.ok) throw new Error('join failed');
    expect(room.join('Cara', new FakeConn(), r.value.token)).toMatchObject({ ok: false });
  });
});

describe('room lifetime', () => {
  it('is dead after two minutes without any connected member', () => {
    const { room, advance, ma, mb } = twoPlayers();
    expect(room.isDead()).toBe(false);
    room.start('p1');
    room.leave(ma.conn!);
    room.leave(mb.conn!);
    advance(119_000);
    expect(room.isDead()).toBe(false);
    advance(2_000);
    expect(room.isDead()).toBe(true);
  });
});
```

Run: `npm test -w @pfandraiders/server`
Expected: FAIL, "Failed to resolve import ../src/room".

- [ ] **Step 3: `room.ts` schreiben**

`packages/server/src/room.ts`:
```ts
import {
  CITY_MAP,
  createGame,
  MAX_ROOM_PLAYERS,
  MIN_START_PLAYERS,
  NO_INPUT,
  projectSnapshot,
  ROOM_COLORS,
  step,
} from '@pfandraiders/core';
import type {
  ErrorCode,
  GameState,
  Input,
  MapData,
  RoomPhase,
  RosterEntry,
  ServerMessage,
} from '@pfandraiders/core';
import { randomUUID } from 'node:crypto';
import { SERVER_CONFIG } from './config';

/** Übertragungsweg zu einem Spieler. Der Raum kennt keine Sockets. */
export interface Conn {
  send(msg: ServerMessage): void;
}

export interface Member {
  id: string;
  name: string;
  color: number;
  token: string;
  conn: Conn | null;
  disconnectedAt: number | null;
  /** Token ist nach der Frist ungültig */
  expired: boolean;
  /** Zuletzt gesendete Eingabe (der Kaufbefehl bleibt bis zum nächsten Tick erhalten) */
  input: Input;
  ackSeq: number;
}

export interface RoomOptions {
  map?: MapData;
  stepMs?: number;
  graceMs?: number;
  emptyMs?: number;
  roundMs?: number;
  now?: () => number;
  random?: () => number;
}

export type Result<T> = { ok: true; value: T } | { ok: false; code: ErrorCode; message: string };

function fail<T>(code: ErrorCode, message: string): Result<T> {
  return { ok: false, code, message };
}

export class Room {
  phase: RoomPhase = 'lobby';
  members: Member[] = [];
  state: GameState | null = null;
  private nextId = 1;
  private lastActive: number;
  private readonly map: MapData;
  private readonly stepMs: number;
  private readonly graceMs: number;
  private readonly emptyMs: number;
  private readonly roundMs: number | undefined;
  private readonly now: () => number;
  private readonly random: () => number;

  constructor(
    readonly code: string,
    opts: RoomOptions = {},
  ) {
    this.map = opts.map ?? CITY_MAP;
    this.stepMs = opts.stepMs ?? SERVER_CONFIG.stepMs;
    this.graceMs = opts.graceMs ?? SERVER_CONFIG.graceMs;
    this.emptyMs = opts.emptyMs ?? SERVER_CONFIG.emptyRoomMs;
    this.roundMs = opts.roundMs;
    this.now = opts.now ?? (() => Date.now());
    this.random = opts.random ?? Math.random;
    this.lastActive = this.now();
  }

  /** Host = erster verbundener Spieler in Beitrittsreihenfolge. */
  hostId(): string {
    return this.members.find((m) => m.conn !== null)?.id ?? '';
  }

  roster(): RosterEntry[] {
    return this.members.map((m) => ({ id: m.id, name: m.name, color: m.color, connected: m.conn !== null }));
  }

  lobbyMessage(): ServerMessage {
    return { t: 'lobby', room: this.code, host: this.hostId(), players: this.roster(), phase: this.phase };
  }

  private broadcastLobby(): void {
    const msg = this.lobbyMessage();
    for (const m of this.members) m.conn?.send(msg);
  }

  private connected(): Member[] {
    return this.members.filter((m) => m.conn !== null);
  }

  join(name: string, conn: Conn, token?: string): Result<Member> {
    this.lastActive = this.now();

    // Rückkehr mit Token (nur innerhalb der Frist)
    if (token !== undefined) {
      const back = this.members.find((m) => m.token === token && !m.expired);
      if (back) {
        back.conn = conn;
        back.disconnectedAt = null;
        conn.send({ t: 'joined', room: this.code, you: back.id, token: back.token });
        if (this.phase === 'running' && this.state) this.sendStart(back);
        this.broadcastLobby();
        return { ok: true, value: back };
      }
    }

    if (this.phase === 'running') return fail('already_started', 'Die Runde läuft bereits.');
    if (this.members.length >= MAX_ROOM_PLAYERS) return fail('room_full', 'Der Raum ist voll.');
    if (this.members.some((m) => m.name.toLowerCase() === name.toLowerCase())) {
      return fail('name_taken', 'Der Name ist schon vergeben.');
    }

    const index = this.members.length;
    const member: Member = {
      id: `p${this.nextId++}`,
      name,
      color: ROOM_COLORS[index % ROOM_COLORS.length],
      token: randomUUID(),
      conn,
      disconnectedAt: null,
      expired: false,
      input: { ...NO_INPUT },
      ackSeq: 0,
    };
    this.members.push(member);
    conn.send({ t: 'joined', room: this.code, you: member.id, token: member.token });
    this.broadcastLobby();
    return { ok: true, value: member };
  }

  /** Verbindung weg. In der Lobby verschwindet der Spieler, im Spiel steht seine Figur still weiter. */
  leave(conn: Conn): void {
    const member = this.members.find((m) => m.conn === conn);
    if (!member) return;
    this.lastActive = this.now();
    member.conn = null;
    member.disconnectedAt = this.now();
    member.input = { ...NO_INPUT };
    if (this.phase !== 'running') {
      this.members = this.members.filter((m) => m !== member);
    }
    this.broadcastLobby();
  }

  start(byId: string): Result<void> {
    this.lastActive = this.now();
    if (this.hostId() !== byId) return fail('not_host', 'Nur der Host kann starten.');
    if (this.phase === 'running') return fail('already_started', 'Die Runde läuft schon.');
    if (this.connected().length < MIN_START_PLAYERS) {
      return fail('need_players', 'Mindestens zwei Spieler nötig.');
    }
    // Getrennte Spieler fallen zwischen den Runden heraus
    this.members = this.connected();
    const seed = Math.floor(this.random() * 0x100000000) >>> 0;
    this.state = createGame(seed, this.map, this.members.map((m) => m.id), {
      roundMs: this.roundMs,
    });
    for (const m of this.members) {
      m.input = { ...NO_INPUT };
      m.ackSeq = 0;
    }
    this.phase = 'running';
    for (const m of this.members) this.sendStart(m);
    this.broadcastLobby();
    return { ok: true, value: undefined };
  }

  private sendStart(m: Member): void {
    if (!this.state || !m.conn) return;
    m.conn.send({
      t: 'start',
      map: this.state.map,
      you: m.id,
      players: this.roster(),
      snap: projectSnapshot(this.state, m.id),
    });
  }

  /** Letzte Eingabe merken. Ein noch nicht verbrauchter Kaufbefehl bleibt erhalten. */
  setInput(m: Member, seq: number, input: Input): void {
    if (m.conn === null) return;
    this.lastActive = this.now();
    m.ackSeq = Math.max(m.ackSeq, seq);
    m.input = { ...input, buy: input.buy ?? m.input.buy };
  }

  /** Ein Serverschritt: Eingaben anwenden, `step`, Snapshots senden. */
  tick(): void {
    const now = this.now();
    for (const m of this.members) {
      if (m.disconnectedAt !== null && now - m.disconnectedAt > this.graceMs) m.expired = true;
    }
    if (this.phase !== 'running' || !this.state) return;
    if (this.connected().length > 0) this.lastActive = now;

    const inputs: Record<string, Input> = {};
    for (const m of this.members) inputs[m.id] = m.conn ? m.input : NO_INPUT;
    step(this.state, inputs, this.stepMs);
    // Einmalige Befehle sind verbraucht
    for (const m of this.members) m.input = { ...m.input, buy: null };

    for (const m of this.members) {
      m.conn?.send({ t: 'snap', snap: projectSnapshot(this.state, m.id), ack: m.ackSeq });
    }
    if (this.state.phase === 'ended') {
      this.phase = 'ended';
      this.broadcastLobby();
    }
  }

  /** Leerer Raum, der lange genug leer war. */
  isDead(): boolean {
    return this.connected().length === 0 && this.now() - this.lastActive >= this.emptyMs;
  }
}
```

- [ ] **Step 4: Tests und Typecheck**

Run: `npm test -w @pfandraiders/server && npm run typecheck -w @pfandraiders/server`
Expected: PASS. Bei Abweichungen den Ablauf von Hand nachrechnen (Tick-Reihenfolge, Kaufbefehl), den Test nicht lockern. Typfehler wegen `node:crypto` beheben mit `@types/node` (siehe Step 1).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json packages/server
git commit -m "feat(server): add room logic with lobby, ticking, snapshots and reconnect

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `RoomManager`, WebSocket-Server, Integrationstest

**Files:**
- Create: `packages/server/src/rooms.ts`, `packages/server/src/server.ts`, `packages/server/src/index.ts`
- Test: `packages/server/test/rooms.test.ts`, `packages/server/test/server.test.ts`

**Interfaces:**
- Produces: `RoomManager` (`create(name, conn)`, `get(code)`, `sweep()`, `tickAll()`, `size`), `startServer(opts): RunningServer` mit `{ port, manager, close(): Promise<void> }`, `ServerOptions { port; allowedOrigins?: string[]; stepMs?: number; roundMs?: number; now?; random? }`.

- [ ] **Step 1: Failing Tests schreiben**

`packages/server/test/rooms.test.ts`:
```ts
import { ROOM_CODE_CHARS, ROOM_CODE_LENGTH } from '@pfandraiders/core';
import { describe, expect, it } from 'vitest';
import { RoomManager } from '../src/rooms';

const conn = { send() {} };

describe('RoomManager', () => {
  it('creates rooms with valid, unique codes and puts the creator in', () => {
    const m = new RoomManager({ maxRooms: 10 });
    const codes = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const r = m.create(`P${i}`, conn);
      if (!r.ok) throw new Error('create failed');
      expect(r.value.room.code).toHaveLength(ROOM_CODE_LENGTH);
      for (const ch of r.value.room.code) expect(ROOM_CODE_CHARS).toContain(ch);
      expect(r.value.member.id).toBe('p1');
      codes.add(r.value.room.code);
    }
    expect(codes.size).toBe(10);
    expect(m.size).toBe(10);
  });

  it('refuses to create more rooms than allowed', () => {
    const m = new RoomManager({ maxRooms: 1 });
    expect(m.create('A', conn).ok).toBe(true);
    expect(m.create('B', conn)).toMatchObject({ ok: false, code: 'too_many_rooms' });
  });

  it('finds rooms by code', () => {
    const m = new RoomManager({ maxRooms: 5 });
    const r = m.create('A', conn);
    if (!r.ok) throw new Error('create failed');
    expect(m.get(r.value.room.code)).toBe(r.value.room);
    expect(m.get('ZZZZ')).toBeUndefined();
  });

  it('retries on a code collision', () => {
    const seq = [0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5];
    let i = 0;
    const m = new RoomManager({ maxRooms: 5, random: () => seq[i++ % seq.length] });
    const a = m.create('A', conn);
    const b = m.create('B', conn);
    if (!a.ok || !b.ok) throw new Error('create failed');
    expect(a.value.room.code).not.toBe(b.value.room.code);
  });

  it('sweeps dead rooms', () => {
    let t = 0;
    const m = new RoomManager({ maxRooms: 5, now: () => t, emptyMs: 1000 });
    const r = m.create('A', conn);
    if (!r.ok) throw new Error('create failed');
    r.value.room.leave(conn);
    t = 2000;
    m.sweep();
    expect(m.size).toBe(0);
  });
});
```

`packages/server/test/server.test.ts` (Integrationstest mit echten WebSockets und Bots):
```ts
import { MAX_MESSAGE_BYTES, ROOM_CODE_LENGTH } from '@pfandraiders/core';
import type { ClientMessage, ServerMessage } from '@pfandraiders/core';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { startServer } from '../src/server';
import type { RunningServer } from '../src/server';

let server: RunningServer;
const sockets: WebSocket[] = [];

afterEach(async () => {
  for (const s of sockets.splice(0)) s.terminate();
  await server?.close();
});

class Bot {
  messages: ServerMessage[] = [];
  private waiters: Array<() => void> = [];
  constructor(readonly ws: WebSocket) {
    ws.on('message', (data) => {
      this.messages.push(JSON.parse(String(data)) as ServerMessage);
      for (const w of this.waiters.splice(0)) w();
    });
  }
  send(msg: ClientMessage | unknown): void {
    this.ws.send(JSON.stringify(msg));
  }
  async until<T extends ServerMessage['t']>(
    t: T,
    pred: (m: Extract<ServerMessage, { t: T }>) => boolean = () => true,
    timeoutMs = 3000,
  ): Promise<Extract<ServerMessage, { t: T }>> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const hit = this.messages.find((m): m is Extract<ServerMessage, { t: T }> => m.t === t && pred(m as never));
      if (hit) return hit;
      const left = deadline - Date.now();
      if (left <= 0) throw new Error(`timeout waiting for ${t}; got ${this.messages.map((m) => m.t).join(',')}`);
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, left);
        this.waiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  }
}

async function connect(port: number, headers: Record<string, string> = {}): Promise<Bot> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers });
  sockets.push(ws);
  const bot = new Bot(ws);
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
    ws.once('unexpected-response', (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)));
  });
  return bot;
}

async function twoBotsInStartedRoom() {
  server = await startServer({ port: 0, stepMs: 20 });
  const a = await connect(server.port);
  const b = await connect(server.port);
  a.send({ t: 'create', name: 'Anna' });
  const joinedA = await a.until('joined');
  expect(joinedA.room).toHaveLength(ROOM_CODE_LENGTH);
  b.send({ t: 'join', room: joinedA.room, name: 'Bob' });
  const joinedB = await b.until('joined');
  a.send({ t: 'start' });
  await a.until('start');
  await b.until('start');
  return { a, b, code: joinedA.room, joinedA, joinedB };
}

describe('websocket server', () => {
  it('plays a full flow: create, join, start, inputs, snapshots', async () => {
    const { a, b } = await twoBotsInStartedRoom();
    a.send({ t: 'input', seq: 1, input: { moveX: 1, moveY: 0, action: false, steal: false, buy: null } });
    const first = await a.until('snap');
    const moved = await a.until('snap', (m) => m.snap.players.p1.x > first.snap.players.p1.x);
    expect(moved.ack).toBe(1);
    const seenByB = await b.until('snap', (m) => m.snap.players.p1.x > first.snap.players.p1.x);
    expect(seenByB.snap.players.p2).toBeDefined();
  });

  it('hides private data of the other player in the snapshots on the wire', async () => {
    const { a, b, code } = await twoBotsInStartedRoom();
    const room = server.manager.get(code)!;
    room.state!.players.p1.money = 4242;
    room.state!.players.p1.bottles = { plastic: 3, glass: 0, crate: 0 };
    room.state!.players.p1.item = 'bolt_cutters';
    const seenByB = await b.until('snap', (m) => m.snap.players.p1.bottles.plastic === 1);
    expect(seenByB.snap.players.p1.money).toBe(0);
    expect(seenByB.snap.players.p1.item).toBeNull();
    expect(seenByB.snap.rngState).toBe(0);
    const seenByA = await a.until('snap', (m) => m.snap.players.p1.money === 4242);
    expect(seenByA.snap.players.p1.item).toBe('bolt_cutters');
    expect(seenByA.snap.players.p1.bottles.plastic).toBe(3);
  });

  it('survives malformed and hostile messages and keeps the connection usable', async () => {
    server = await startServer({ port: 0, stepMs: 20 });
    const a = await connect(server.port);
    a.ws.send('this is not json');
    await a.until('error', (m) => m.code === 'bad_message');
    a.send({ t: 'nope' });
    a.send({ t: '__proto__' });
    a.send({ t: 'create', name: 5 });
    a.send({ t: 'join', room: 'ZZ', name: 'x' });
    a.send({ t: 'input', seq: 'x', input: 1 });
    a.send([1, 2, 3]);
    a.send(null);
    await a.until('error', (m) => m.code === 'bad_message');
    a.send({ t: 'create', name: 'Anna' }); // danach funktioniert noch alles
    await a.until('joined');
  });

  it('rejects messages that are too large', async () => {
    server = await startServer({ port: 0, stepMs: 20 });
    const a = await connect(server.port);
    const closed = new Promise<number>((resolve) => a.ws.once('close', (code) => resolve(code)));
    a.ws.send('x'.repeat(MAX_MESSAGE_BYTES * 4));
    await expect(closed).resolves.toBeGreaterThan(0);
    // Server lebt weiter
    const b = await connect(server.port);
    b.send({ t: 'create', name: 'Bob' });
    await b.until('joined');
  });

  it('answers input before joining a room with an error instead of crashing', async () => {
    server = await startServer({ port: 0, stepMs: 20 });
    const a = await connect(server.port);
    a.send({ t: 'input', seq: 1, input: {} });
    await a.until('error', (m) => m.code === 'not_in_room');
    a.send({ t: 'start' });
    await a.until('error', (m) => m.code === 'not_in_room');
  });

  it('reports unknown rooms and lets only the host start', async () => {
    server = await startServer({ port: 0, stepMs: 20 });
    const a = await connect(server.port);
    const b = await connect(server.port);
    a.send({ t: 'join', room: 'ABCD', name: 'Anna' });
    await a.until('error', (m) => m.code === 'room_not_found');
    a.send({ t: 'create', name: 'Anna' });
    const { room } = await a.until('joined');
    b.send({ t: 'join', room, name: 'Bob' });
    await b.until('joined');
    b.send({ t: 'start' });
    await b.until('error', (m) => m.code === 'not_host');
  });

  it('lets a disconnected player come back with the token and get a fresh start message', async () => {
    const { a, code, joinedA } = await twoBotsInStartedRoom();
    a.ws.close();
    await new Promise((r) => setTimeout(r, 100));
    const again = await connect(server.port);
    again.send({ t: 'join', room: code, name: 'Anna', token: joinedA.token });
    await again.until('joined');
    const start = await again.until('start');
    expect(start.you).toBe('p1');
    await again.until('snap');
  });

  it('refuses a rejoin with a wrong token during a running round', async () => {
    const { code } = await twoBotsInStartedRoom();
    const c = await connect(server.port);
    c.send({ t: 'join', room: code, name: 'Cara', token: 'bogus' });
    await c.until('error', (m) => m.code === 'already_started');
  });

  it('rejects connections from origins that are not allowed', async () => {
    server = await startServer({ port: 0, stepMs: 20, allowedOrigins: ['https://good.example'] });
    await expect(connect(server.port, { Origin: 'https://evil.example' })).rejects.toThrow();
    const ok = await connect(server.port, { Origin: 'https://good.example' });
    ok.send({ t: 'create', name: 'Anna' });
    await ok.until('joined');
  });

  it('throttles a message flood without taking the server down', async () => {
    server = await startServer({ port: 0, stepMs: 20 });
    const a = await connect(server.port);
    a.send({ t: 'create', name: 'Anna' });
    await a.until('joined');
    for (let i = 0; i < 2000; i++) a.send({ t: 'input', seq: i, input: {} });
    await a.until('error', (m) => m.code === 'rate_limited');
    const b = await connect(server.port);
    b.send({ t: 'create', name: 'Bob' });
    await b.until('joined');
  });
});
```

Run: `npm test -w @pfandraiders/server -- test/rooms.test.ts test/server.test.ts`
Expected: FAIL (Module fehlen).

- [ ] **Step 2: `rooms.ts` schreiben**

`packages/server/src/rooms.ts`:
```ts
import { ROOM_CODE_CHARS, ROOM_CODE_LENGTH } from '@pfandraiders/core';
import { SERVER_CONFIG } from './config';
import { Room } from './room';
import type { Conn, Member, Result, RoomOptions } from './room';

export interface ManagerOptions extends RoomOptions {
  maxRooms?: number;
}

export class RoomManager {
  private rooms = new Map<string, Room>();
  private readonly maxRooms: number;
  private readonly random: () => number;

  constructor(private readonly opts: ManagerOptions = {}) {
    this.maxRooms = opts.maxRooms ?? SERVER_CONFIG.maxRooms;
    this.random = opts.random ?? Math.random;
  }

  get size(): number {
    return this.rooms.size;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  private newCode(): string {
    for (;;) {
      let code = '';
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
        code += ROOM_CODE_CHARS[Math.floor(this.random() * ROOM_CODE_CHARS.length)];
      }
      if (!this.rooms.has(code)) return code;
    }
  }

  /** Neuer Raum, der Ersteller tritt als Host bei. */
  create(name: string, conn: Conn): Result<{ room: Room; member: Member }> {
    if (this.rooms.size >= this.maxRooms) {
      return { ok: false, code: 'too_many_rooms', message: 'Der Server ist ausgelastet.' };
    }
    const room = new Room(this.newCode(), this.opts);
    const joined = room.join(name, conn);
    if (!joined.ok) return joined;
    this.rooms.set(room.code, room);
    return { ok: true, value: { room, member: joined.value } };
  }

  tickAll(): void {
    for (const room of this.rooms.values()) room.tick();
  }

  /** Löscht Räume, die lange leer waren. */
  sweep(): void {
    for (const [code, room] of this.rooms) {
      if (room.isDead()) this.rooms.delete(code);
    }
  }
}
```
Hinweis zum Test 'retries on a code collision': Der Zufallsgenerator liefert zuerst viermal `0` (Code `AAAA`), dann viermal `0.5` (anderer Code). Gibt `newCode` bei einer Kollision denselben Wert erneut, läuft die Schleife weiter, bis sich der Code unterscheidet: der Test deckt das mit der Folge `[0,0,0,0,0.5,...]` ab, weil der zweite Raum zuerst `AAAA` (Kollision) und dann den Code aus den `0.5`-Werten bekommt. Passt die Folge nicht, im Test die Folge anpassen, nicht die Logik.

- [ ] **Step 3: `server.ts` schreiben**

`packages/server/src/server.ts`:
```ts
import { MAX_MESSAGE_BYTES, parseClientMessage } from '@pfandraiders/core';
import type { ErrorCode, ServerMessage } from '@pfandraiders/core';
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import { SERVER_CONFIG } from './config';
import type { Member, Room } from './room';
import { RoomManager } from './rooms';

export interface ServerOptions {
  port: number;
  /** Erlaubte Origins. Leer oder fehlend = alle (nur für Entwicklung). */
  allowedOrigins?: string[];
  stepMs?: number;
  roundMs?: number;
  now?: () => number;
  random?: () => number;
}

export interface RunningServer {
  port: number;
  manager: RoomManager;
  close(): Promise<void>;
}

interface Session {
  room: Room | null;
  member: Member | null;
  tokens: number;
  lastRefill: number;
  alive: boolean;
}

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function error(ws: WebSocket, code: ErrorCode, message: string): void {
  send(ws, { t: 'error', code, message });
}

export function startServer(opts: ServerOptions): Promise<RunningServer> {
  const stepMs = opts.stepMs ?? SERVER_CONFIG.stepMs;
  const allowed = opts.allowedOrigins ?? [];
  const manager = new RoomManager({
    stepMs,
    roundMs: opts.roundMs,
    now: opts.now,
    random: opts.random,
  });

  const wss = new WebSocketServer({
    port: opts.port,
    maxPayload: MAX_MESSAGE_BYTES,
    verifyClient: (info, done) => {
      if (allowed.length === 0 || (info.origin && allowed.includes(info.origin))) {
        done(true);
      } else {
        done(false, 403, 'origin not allowed');
      }
    },
  });

  const sessions = new Map<WebSocket, Session>();

  wss.on('connection', (ws) => {
    const session: Session = {
      room: null,
      member: null,
      tokens: SERVER_CONFIG.maxMessagesPerSecond,
      lastRefill: Date.now(),
      alive: true,
    };
    sessions.set(ws, session);
    const conn = { send: (msg: ServerMessage) => send(ws, msg) };

    ws.on('pong', () => {
      session.alive = true;
    });

    ws.on('message', (data) => {
      // Ratenbegrenzung: Token-Eimer, pro Sekunde maxMessagesPerSecond Nachrichten
      const now = Date.now();
      session.tokens = Math.min(
        SERVER_CONFIG.maxMessagesPerSecond,
        session.tokens + ((now - session.lastRefill) / 1000) * SERVER_CONFIG.maxMessagesPerSecond,
      );
      session.lastRefill = now;
      if (session.tokens < 1) {
        error(ws, 'rate_limited', 'Zu viele Nachrichten.');
        return;
      }
      session.tokens -= 1;

      let parsed: unknown;
      try {
        parsed = JSON.parse(String(data));
      } catch {
        error(ws, 'bad_message', 'Kein gültiges JSON.');
        return;
      }
      const msg = parseClientMessage(parsed);
      if (msg === null) {
        error(ws, 'bad_message', 'Ungültige Nachricht.');
        return;
      }

      switch (msg.t) {
        case 'create': {
          if (session.room) {
            error(ws, 'bad_message', 'Du bist schon in einem Raum.');
            return;
          }
          const r = manager.create(msg.name, conn);
          if (!r.ok) return error(ws, r.code, r.message);
          session.room = r.value.room;
          session.member = r.value.member;
          return;
        }
        case 'join': {
          if (session.room) {
            error(ws, 'bad_message', 'Du bist schon in einem Raum.');
            return;
          }
          const room = manager.get(msg.room);
          if (!room) return error(ws, 'room_not_found', 'Raum nicht gefunden.');
          const r = room.join(msg.name, conn, msg.token);
          if (!r.ok) return error(ws, r.code, r.message);
          session.room = room;
          session.member = r.value;
          return;
        }
        case 'start': {
          if (!session.room || !session.member) return error(ws, 'not_in_room', 'Du bist in keinem Raum.');
          const r = session.room.start(session.member.id);
          if (!r.ok) error(ws, r.code, r.message);
          return;
        }
        case 'input': {
          if (!session.room || !session.member) return error(ws, 'not_in_room', 'Du bist in keinem Raum.');
          session.room.setInput(session.member, msg.seq, msg.input);
          return;
        }
      }
    });

    ws.on('close', () => {
      session.room?.leave(conn);
      sessions.delete(ws);
    });
    ws.on('error', () => ws.terminate());
  });

  const tickTimer = setInterval(() => manager.tickAll(), stepMs);
  const sweepTimer = setInterval(() => manager.sweep(), 10_000);
  const pingTimer = setInterval(() => {
    for (const [ws, session] of sessions) {
      if (!session.alive) {
        ws.terminate();
        continue;
      }
      session.alive = false;
      ws.ping();
    }
  }, SERVER_CONFIG.pingEveryMs);

  return new Promise((resolve) => {
    wss.on('listening', () => {
      const address = wss.address();
      const port = typeof address === 'object' && address ? address.port : opts.port;
      resolve({
        port,
        manager,
        close: () =>
          new Promise<void>((done) => {
            clearInterval(tickTimer);
            clearInterval(sweepTimer);
            clearInterval(pingTimer);
            for (const ws of wss.clients) ws.terminate();
            wss.close(() => done());
          }),
      });
    });
  });
}
```

`packages/server/src/index.ts`:
```ts
import { startServer } from './server';

const port = Number(process.env.PORT ?? 8080);
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

startServer({ port, allowedOrigins }).then((srv) => {
  console.log(`PfandRaiders server listening on :${srv.port}`);
  if (allowedOrigins.length === 0) {
    console.warn('ALLOWED_ORIGINS is empty: every origin may connect (development only).');
  }
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => process.exit(0));
}
```

- [ ] **Step 4: Tests und Typecheck**

Run: `npm test -w @pfandraiders/server && npm run typecheck -w @pfandraiders/server`
Expected: PASS. Verhalten, auf das zu achten ist: (a) 'rejects messages that are too large' erwartet, dass `ws` bei Überschreitung von `maxPayload` die Verbindung mit Code 1009 schließt; (b) 'throttles ...' erwartet `rate_limited` nach etwa 120 schnellen Nachrichten; (c) 'rejects connections from origins' erwartet, dass `verifyClient` die Verbindung mit HTTP 403 ablehnt. Weicht `ws` in einer Version ab (zum Beispiel Signatur von `verifyClient`), minimal anpassen und im Bericht nennen.

- [ ] **Step 5: Commit**

```bash
git add packages/server
git commit -m "feat(server): add room manager and hardened websocket server with integration tests

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Bündeln, Docker, Deploy-Dateien, README

**Files:**
- Create: `packages/server/Dockerfile`, `deploy/docker-compose.yml`, `deploy/Caddyfile`, `.dockerignore`
- Modify: `README.md`

**Interfaces:** keine neuen Code-Schnittstellen.

- [ ] **Step 1: Server bündeln und prüfen**

Run: `npm run build -w @pfandraiders/server`
Expected: legt `packages/server/dist/server.cjs` an. Dann ein Smoke-Test ohne `node_modules`-Auflösung: kopiere die Datei in ein leeres temporäres Verzeichnis, starte sie dort mit `PORT=18080 node server.cjs` und prüfe mit einem kurzen Node-Skript (`ws` aus dem Repo darf dafür genutzt werden), dass `create` mit `joined` beantwortet wird. Beende den Server danach. Das Ergebnis kommt in den Bericht.

`packages/server/dist` steht in `.gitignore` (Eintrag `dist` gilt bereits global).

- [ ] **Step 2: Dockerfile**

`packages/server/Dockerfile` (Build-Kontext ist das Repo-Root):
```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
RUN npm ci
COPY packages/core packages/core
COPY packages/server packages/server
RUN npm run build -w @pfandraiders/server

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/packages/server/dist/server.cjs ./server.cjs
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080 >/dev/null 2>&1 || exit 1
CMD ["node", "server.cjs"]
```
Hinweis zum Healthcheck: Der WebSocket-Server antwortet auf einfaches HTTP-GET mit `426 Upgrade Required`. `wget` meldet das als Fehler. Falls der Healthcheck dadurch dauerhaft fehlschlägt, ihn durch einen TCP-Check ersetzen: `CMD nc -z 127.0.0.1 8080 || exit 1`.

`.dockerignore`:
```
node_modules
**/node_modules
**/dist
.git
.superpowers
docs
```

`deploy/docker-compose.yml`:
```yaml
services:
  server:
    build:
      context: ..
      dockerfile: packages/server/Dockerfile
    restart: unless-stopped
    environment:
      PORT: "8080"
      ALLOWED_ORIGINS: ${ALLOWED_ORIGINS:?ALLOWED_ORIGINS setzen, zum Beispiel https://dasistdaniel.github.io}
  caddy:
    image: caddy:2
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    environment:
      DOMAIN: ${DOMAIN:?DOMAIN setzen, zum Beispiel play.example.org}
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - server
volumes:
  caddy_data:
  caddy_config:
```
`deploy/Caddyfile`:
```
{$DOMAIN} {
	reverse_proxy server:8080
}
```

- [ ] **Step 3: Docker-Build prüfen, falls Docker vorhanden**

Run: `docker --version`. Ist Docker installiert: `docker build -f packages/server/Dockerfile -t pfandraiders-server .` und `docker run --rm -d -p 18080:8080 --name pr-test pfandraiders-server`, dann das Smoke-Skript aus Step 1 gegen `ws://127.0.0.1:18080`, danach `docker stop pr-test`. Ist Docker nicht installiert, im Bericht klar festhalten, dass der Container-Build nicht geprüft wurde (der Entwickler prüft ihn auf dem VPS).

- [ ] **Step 4: README**

In `README.md` einen Abschnitt "Online spielen und Server" ergänzen mit: lokalem Start (`npm run dev:server` und `npm run dev`, Server-Adresse per `?server=ws://localhost:8080`), der Umgebungsvariablen `PORT` und `ALLOWED_ORIGINS`, dem Bauen (`npm run build:server`), dem Docker-Start auf dem VPS (`cd deploy`, `DOMAIN=... ALLOWED_ORIGINS=... docker compose up -d --build`), dem Hinweis, dass der Client für GitHub Pages mit der Repository-Variable `SERVER_URL` (zum Beispiel `wss://play.example.org`) gebaut wird, und der Handarbeit (DNS-Eintrag der Domain auf den VPS, Ports 80 und 443 offen, GitHub Pages in den Repository-Einstellungen auf "GitHub Actions" stellen).

- [ ] **Step 5: Alles prüfen und committen**

Run: `npm test && npm run typecheck && npm run build && npm run build:server`
Expected: grün.
```bash
git add packages/server/Dockerfile deploy .dockerignore README.md
git commit -m "feat(server): add bundle, Dockerfile, compose with Caddy and deploy docs

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Interpolation und `OnlineConnection`

**Files:**
- Create: `packages/client/src/interpolate.ts`, `packages/client/src/online.ts`
- Modify: `packages/client/src/connection.ts` (nur Interface-Erweiterung, optional)
- Test: `packages/client/test/interpolate.test.ts`, `packages/client/test/online.test.ts`

**Interfaces:**
- Produces: `interpolateSnapshot(older, newer, alpha, latest, youId): Snapshot` (rein); `SocketLike`, `SocketFactory`, `OnlineConnection implements GameConnection` mit `connect()`, `create(name)`, `join(room, name, token?)`, `startGame()`, `requestStart()`-Alias, `setInput`, `update`, `getState`, `roster`, `you`, `room`, `host`, `isHost()`, `status` (`'connecting' | 'open' | 'closed'`) und Rückrufen `onLobby`, `onStart`, `onError`, `onClosed`, `onJoined`.
- `GameConnection` bekommt optionale Felder, die nur `OnlineConnection` füllt: keine Pflicht für `LocalConnection`.

- [ ] **Step 1: Failing Tests schreiben**

`packages/client/test/interpolate.test.ts`:
```ts
import { createGame, parseMap, projectSnapshot } from '@pfandraiders/core';
import type { Snapshot } from '@pfandraiders/core';
import { describe, expect, it } from 'vitest';
import { interpolateSnapshot } from '../src/interpolate';

function snapAt(x2: number, xn = 0, ids = ['p1', 'p2']): Snapshot {
  const s = createGame(1, parseMap(['#########', '#@@.....#', '#########']), ids);
  s.players.p1.x = 24;
  if (s.players.p2) s.players.p2.x = x2;
  s.npcs = xn
    ? [{ id: 7, kind: 'dog', x: xn, y: 24, lifeMs: 1000, targetId: null, cooldownMs: 0, distractedMs: 0, checkMs: 0 }]
    : [];
  return projectSnapshot(s, 'p1');
}

describe('interpolateSnapshot', () => {
  it('moves other players between the two snapshots', () => {
    const a = snapAt(40);
    const b = snapAt(80);
    const out = interpolateSnapshot(a, b, 0.5, b, 'p1');
    expect(out.players.p2.x).toBeCloseTo(60, 5);
  });

  it('takes the own player straight from the latest snapshot without delay', () => {
    const a = snapAt(40);
    const b = snapAt(80);
    a.players.p1.x = 10;
    b.players.p1.x = 30;
    const out = interpolateSnapshot(a, b, 0.5, b, 'p1');
    expect(out.players.p1.x).toBe(30);
  });

  it('takes every non-position field from the latest snapshot', () => {
    const a = snapAt(40);
    const b = snapAt(80);
    b.timeLeftMs = 1234;
    b.players.p2.health = 55;
    const out = interpolateSnapshot(a, b, 0.25, b, 'p1');
    expect(out.timeLeftMs).toBe(1234);
    expect(out.players.p2.health).toBe(55);
  });

  it('interpolates npcs by id and shows new npcs at their latest position', () => {
    const a = snapAt(40, 100);
    const b = snapAt(40, 140);
    expect(interpolateSnapshot(a, b, 0.5, b, 'p1').npcs[0].x).toBeCloseTo(120, 5);
    const none = snapAt(40, 0);
    expect(interpolateSnapshot(none, b, 0.5, b, 'p1').npcs[0].x).toBe(140);
  });

  it('copes with a player that is missing in the older snapshot', () => {
    const only1 = snapAt(0, 0, ['p1']);
    const both = snapAt(80);
    const out = interpolateSnapshot(only1, both, 0.5, both, 'p1');
    expect(out.players.p2.x).toBe(80);
  });

  it('does not change its inputs', () => {
    const a = snapAt(40);
    const b = snapAt(80);
    const before = JSON.stringify([a, b]);
    interpolateSnapshot(a, b, 0.5, b, 'p1');
    expect(JSON.stringify([a, b])).toBe(before);
  });

  it('clamps alpha to [0, 1]', () => {
    const a = snapAt(40);
    const b = snapAt(80);
    expect(interpolateSnapshot(a, b, -3, b, 'p1').players.p2.x).toBe(40);
    expect(interpolateSnapshot(a, b, 9, b, 'p1').players.p2.x).toBe(80);
  });
});
```

`packages/client/test/online.test.ts`:
```ts
import { CITY_MAP, createGame, NO_INPUT, projectSnapshot, ROOM_COLORS } from '@pfandraiders/core';
import type { ClientMessage, ServerMessage } from '@pfandraiders/core';
import { describe, expect, it } from 'vitest';
import { OnlineConnection } from '../src/online';
import type { SocketLike } from '../src/online';

class FakeSocket implements SocketLike {
  sent: ClientMessage[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  closed = false;
  send(data: string): void {
    this.sent.push(JSON.parse(data) as ClientMessage);
  }
  close(): void {
    this.closed = true;
    this.onclose?.();
  }
  open(): void {
    this.onopen?.();
  }
  receive(msg: ServerMessage): void {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
}

function roster() {
  return [
    { id: 'p1', name: 'Anna', color: ROOM_COLORS[0], connected: true },
    { id: 'p2', name: 'Bob', color: ROOM_COLORS[1], connected: true },
  ];
}

function setup() {
  const socket = new FakeSocket();
  const conn = new OnlineConnection('ws://test', () => socket);
  conn.connect();
  socket.open();
  return { socket, conn };
}

function startMessage(tickValue = 0, x2 = 40): ServerMessage {
  const s = createGame(1, CITY_MAP, ['p1', 'p2']);
  s.tick = tickValue;
  s.players.p2.x = x2;
  return { t: 'start', map: CITY_MAP, you: 'p1', players: roster(), snap: projectSnapshot(s, 'p1') };
}

function snapMessage(tickValue: number, x2: number): ServerMessage {
  const s = createGame(1, CITY_MAP, ['p1', 'p2']);
  s.tick = tickValue;
  s.players.p2.x = x2;
  return { t: 'snap', snap: projectSnapshot(s, 'p1'), ack: 0 };
}

describe('OnlineConnection messages', () => {
  it('sends create and join with the given data', () => {
    const { socket, conn } = setup();
    conn.create('Anna');
    conn.join('abcd', 'Bob', 'tok');
    expect(socket.sent).toEqual([
      { t: 'create', name: 'Anna' },
      { t: 'join', room: 'abcd', name: 'Bob', token: 'tok' },
    ]);
  });

  it('records room, own id and token from joined and exposes the roster from lobby', () => {
    const { socket, conn } = setup();
    socket.receive({ t: 'joined', room: 'ABCD', you: 'p2', token: 'secret' });
    expect(conn.room).toBe('ABCD');
    expect(conn.you).toBe('p2');
    expect(conn.token).toBe('secret');
    socket.receive({ t: 'lobby', room: 'ABCD', host: 'p1', players: roster(), phase: 'lobby' });
    expect(conn.roster).toHaveLength(2);
    expect(conn.isHost()).toBe(false);
    socket.receive({ t: 'lobby', room: 'ABCD', host: 'p2', players: roster(), phase: 'lobby' });
    expect(conn.isHost()).toBe(true);
  });

  it('builds a full game state on start and fires onStart', () => {
    const { socket, conn } = setup();
    let started = 0;
    conn.onStart = () => started++;
    socket.receive(startMessage());
    expect(started).toBe(1);
    expect(conn.localPlayerIds).toEqual(['p1']);
    const state = conn.getState();
    expect(state.map.cols).toBe(CITY_MAP.cols);
    expect(Object.keys(state.players)).toEqual(['p1', 'p2']);
  });

  it('reports errors and a closed connection', () => {
    const { socket, conn } = setup();
    const errors: string[] = [];
    let closed = 0;
    conn.onError = (code) => errors.push(code);
    conn.onClosed = () => closed++;
    socket.receive({ t: 'error', code: 'room_full', message: 'voll' });
    expect(errors).toEqual(['room_full']);
    socket.close();
    expect(closed).toBe(1);
    expect(conn.status).toBe('closed');
  });

  it('ignores malformed server messages without throwing', () => {
    const { socket, conn } = setup();
    expect(() => socket.onmessage?.({ data: 'not json' })).not.toThrow();
    expect(() => socket.onmessage?.({ data: '{"t":"snap"}' })).not.toThrow();
    expect(conn.status).toBe('open');
  });

  it('only the host sends start', () => {
    const { socket, conn } = setup();
    socket.receive({ t: 'joined', room: 'ABCD', you: 'p2', token: 't' });
    socket.receive({ t: 'lobby', room: 'ABCD', host: 'p1', players: roster(), phase: 'lobby' });
    conn.requestStart();
    expect(socket.sent.some((m) => m.t === 'start')).toBe(false);
    socket.receive({ t: 'lobby', room: 'ABCD', host: 'p2', players: roster(), phase: 'lobby' });
    conn.requestStart();
    expect(socket.sent.filter((m) => m.t === 'start')).toHaveLength(1);
  });
});

describe('OnlineConnection input', () => {
  it('sends a changed input at once with a rising sequence number', () => {
    const { socket, conn } = setup();
    socket.receive(startMessage());
    conn.setInput('p1', { ...NO_INPUT, moveX: 1 });
    conn.update(10);
    conn.setInput('p1', { ...NO_INPUT, moveX: -1 });
    conn.update(10);
    const inputs = socket.sent.filter((m) => m.t === 'input') as Extract<ClientMessage, { t: 'input' }>[];
    expect(inputs.map((m) => m.input.moveX)).toEqual([1, -1]);
    expect(inputs[1].seq).toBeGreaterThan(inputs[0].seq);
  });

  it('repeats an unchanged input only as a heartbeat every 100 ms', () => {
    const { socket, conn } = setup();
    socket.receive(startMessage());
    conn.setInput('p1', { ...NO_INPUT, moveX: 1 });
    conn.update(10); // sofort gesendet
    conn.update(10);
    conn.update(10);
    expect(socket.sent.filter((m) => m.t === 'input')).toHaveLength(1);
    conn.update(90); // 100 ms seit dem letzten Senden
    expect(socket.sent.filter((m) => m.t === 'input')).toHaveLength(2);
  });

  it('sends a buy command exactly once, also when it arrives between frames', () => {
    const { socket, conn } = setup();
    socket.receive(startMessage());
    conn.setInput('p1', { ...NO_INPUT, buy: 'upgrade' });
    conn.setInput('p1', NO_INPUT); // nächster Frame meldet "nicht gedrückt"
    conn.update(10);
    conn.update(200);
    const inputs = socket.sent.filter((m) => m.t === 'input') as Extract<ClientMessage, { t: 'input' }>[];
    expect(inputs.filter((m) => m.input.buy === 'upgrade')).toHaveLength(1);
  });

  it('does not send inputs before a game has started', () => {
    const { socket, conn } = setup();
    conn.setInput('p1', { ...NO_INPUT, moveX: 1 });
    conn.update(200);
    expect(socket.sent.filter((m) => m.t === 'input')).toHaveLength(0);
  });
});

describe('OnlineConnection rendering state', () => {
  it('shows other players with a 100 ms delay, interpolated between snapshots', () => {
    const { socket, conn } = setup();
    socket.receive(startMessage(0, 40));
    conn.update(100);
    socket.receive(snapMessage(1, 80)); // kommt bei Uhr 100 an
    conn.update(50); // Uhr 150, Renderzeit 50: zwischen Start (Uhr 0, x 40) und Snapshot (Uhr 100, x 80)
    expect(conn.getState().players.p2.x).toBeCloseTo(60, 3);
    conn.update(100); // Uhr 250, Renderzeit 150: hinter dem letzten Snapshot
    expect(conn.getState().players.p2.x).toBe(80);
  });

  it('keeps the own player at the latest server position', () => {
    const { socket, conn } = setup();
    socket.receive(startMessage(0));
    const s = createGame(1, CITY_MAP, ['p1', 'p2']);
    s.players.p1.x = 200;
    conn.update(100);
    socket.receive({ t: 'snap', snap: projectSnapshot(s, 'p1'), ack: 0 });
    conn.update(10);
    expect(conn.getState().players.p1.x).toBe(200);
  });

  it('drops old snapshots so memory stays bounded', () => {
    const { socket, conn } = setup();
    socket.receive(startMessage(0));
    for (let i = 1; i <= 200; i++) {
      conn.update(50);
      socket.receive(snapMessage(i, 40 + i));
    }
    conn.update(200); // Renderzeit hinter dem neuesten Snapshot
    expect(conn.bufferedSnapshots()).toBeLessThanOrEqual(32);
    expect(conn.getState().tick).toBe(200);
  });
});
```

Run: `npm test -w @pfandraiders/client -- test/interpolate.test.ts test/online.test.ts`
Expected: FAIL (Module fehlen).

- [ ] **Step 2: `interpolate.ts` schreiben**

`packages/client/src/interpolate.ts`:
```ts
import type { Snapshot } from '@pfandraiders/core';

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Mischt Positionen fremder Spieler und der NPCs zwischen zwei älteren Snapshots,
 * alle anderen Felder kommen aus dem neuesten Snapshot. Die eigene Figur bleibt
 * ohne Verzögerung an der Position des neuesten Snapshots. Verändert keine Eingabe.
 */
export function interpolateSnapshot(
  older: Snapshot,
  newer: Snapshot,
  alpha: number,
  latest: Snapshot,
  youId: string,
): Snapshot {
  const t = Math.min(1, Math.max(0, alpha));

  const players: Snapshot['players'] = {};
  for (const [id, p] of Object.entries(latest.players)) {
    const a = older.players[id];
    const b = newer.players[id];
    players[id] = id === youId || !a || !b ? p : { ...p, x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
  }

  const npcs = latest.npcs.map((n) => {
    const a = older.npcs.find((x) => x.id === n.id);
    const b = newer.npcs.find((x) => x.id === n.id);
    return !a || !b ? n : { ...n, x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
  });

  return { ...latest, players, npcs };
}
```

- [ ] **Step 3: `online.ts` schreiben**

`packages/client/src/online.ts`:
```ts
import { stateFromSnapshot } from '@pfandraiders/core';
import type {
  ClientMessage,
  ErrorCode,
  GameState,
  Input,
  MapData,
  RosterEntry,
  ServerMessage,
  Snapshot,
} from '@pfandraiders/core';
import { NO_INPUT } from '@pfandraiders/core';
import type { GameConnection } from './connection';
import { interpolateSnapshot } from './interpolate';

/** Fremde Figuren werden so viel später gezeigt, damit zwischen zwei Snapshots interpoliert werden kann. */
export const INTERP_DELAY_MS = 100;
/** Ungeänderte Eingaben werden trotzdem so oft wiederholt (Lebenszeichen). */
export const HEARTBEAT_MS = 100;
const MAX_BUFFER = 32;

export interface SocketLike {
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((e: { data: string }) => void) | null;
  onclose: (() => void) | null;
}

export type SocketFactory = (url: string) => SocketLike;

export type ConnStatus = 'idle' | 'connecting' | 'open' | 'closed';

interface Buffered {
  at: number;
  snap: Snapshot;
}

function sameInput(a: Input, b: Input): boolean {
  return (
    a.moveX === b.moveX &&
    a.moveY === b.moveY &&
    a.action === b.action &&
    a.steal === b.steal &&
    a.buy === b.buy
  );
}

export class OnlineConnection implements GameConnection {
  localPlayerIds: string[] = [];
  status: ConnStatus = 'idle';
  room = '';
  you = '';
  token = '';
  host = '';
  roster: RosterEntry[] = [];

  onJoined: (() => void) | null = null;
  onLobby: (() => void) | null = null;
  onStart: (() => void) | null = null;
  onError: ((code: ErrorCode, message: string) => void) | null = null;
  onClosed: (() => void) | null = null;

  private socket: SocketLike | null = null;
  private map: MapData | null = null;
  private buffer: Buffered[] = [];
  private clock = 0;
  private seq = 0;
  private pendingInput: Input = { ...NO_INPUT };
  private pendingBuy: Input['buy'] = null;
  private lastSent: Input | null = null;
  private sinceSent = 0;
  private rendered: GameState | null = null;

  constructor(
    private readonly url: string,
    private readonly factory: SocketFactory,
  ) {}

  connect(): void {
    this.status = 'connecting';
    const socket = this.factory(this.url);
    this.socket = socket;
    socket.onopen = () => {
      this.status = 'open';
    };
    socket.onmessage = (e) => this.handle(e.data);
    socket.onclose = () => {
      this.status = 'closed';
      this.onClosed?.();
    };
  }

  close(): void {
    this.socket?.close();
  }

  private sendMsg(msg: ClientMessage): void {
    this.socket?.send(JSON.stringify(msg));
  }

  create(name: string): void {
    this.sendMsg({ t: 'create', name });
  }

  join(room: string, name: string, token?: string): void {
    this.sendMsg(token ? { t: 'join', room, name, token } : { t: 'join', room, name });
  }

  isHost(): boolean {
    return this.you !== '' && this.host === this.you;
  }

  /** Nur der Host darf starten (der Server prüft zusätzlich). */
  requestStart(): void {
    if (this.isHost()) this.sendMsg({ t: 'start' });
  }

  private handle(raw: string): void {
    let msg: ServerMessage;
    try {
      msg = JSON.parse(raw) as ServerMessage;
    } catch {
      return;
    }
    switch (msg?.t) {
      case 'joined':
        this.room = msg.room;
        this.you = msg.you;
        this.token = msg.token;
        this.localPlayerIds = [msg.you];
        this.onJoined?.();
        break;
      case 'lobby':
        this.host = msg.host;
        this.roster = msg.players;
        this.onLobby?.();
        break;
      case 'start':
        this.map = msg.map;
        this.you = msg.you;
        this.localPlayerIds = [msg.you];
        this.roster = msg.players;
        this.buffer = [{ at: this.clock, snap: msg.snap }];
        this.rendered = stateFromSnapshot(msg.map, msg.snap);
        this.seq = 0;
        this.lastSent = null;
        this.onStart?.();
        break;
      case 'snap':
        if (!this.map || !msg.snap || typeof msg.snap.tick !== 'number' || !msg.snap.players) break;
        this.buffer.push({ at: this.clock, snap: msg.snap });
        if (this.buffer.length > MAX_BUFFER) this.buffer.splice(0, this.buffer.length - MAX_BUFFER);
        break;
      case 'error':
        this.onError?.(msg.code, msg.message);
        break;
      default:
        break;
    }
  }

  setInput(playerId: string, input: Input): void {
    if (playerId !== this.you) return;
    // Ein Kaufbefehl geht nicht verloren, wenn der nächste Frame "nicht gedrückt" meldet.
    if (input.buy !== null) this.pendingBuy = input.buy;
    this.pendingInput = { ...input, buy: null };
  }

  update(deltaMs: number): void {
    this.clock += deltaMs;
    this.sinceSent += deltaMs;
    this.sendInputIfNeeded();
    this.rendered = this.computeRendered();
  }

  private sendInputIfNeeded(): void {
    if (!this.map || this.status !== 'open') return;
    const input: Input = { ...this.pendingInput, buy: this.pendingBuy };
    const changed = this.lastSent === null || !sameInput(this.lastSent, input);
    if (!changed && this.sinceSent < HEARTBEAT_MS) return;
    this.sendMsg({ t: 'input', seq: ++this.seq, input });
    this.lastSent = input;
    this.sinceSent = 0;
    this.pendingBuy = null;
  }

  private computeRendered(): GameState | null {
    if (!this.map || this.buffer.length === 0) return this.rendered;
    const latest = this.buffer[this.buffer.length - 1];
    const renderTime = this.clock - INTERP_DELAY_MS;
    let snap = latest.snap;
    if (this.buffer.length > 1 && renderTime < latest.at) {
      let i = this.buffer.length - 1;
      while (i > 0 && this.buffer[i - 1].at > renderTime) i--;
      const newer = this.buffer[i];
      const older = this.buffer[Math.max(0, i - 1)];
      const span = newer.at - older.at;
      const alpha = span > 0 ? (renderTime - older.at) / span : 1;
      snap = interpolateSnapshot(older.snap, newer.snap, alpha, latest.snap, this.you);
    }
    return stateFromSnapshot(this.map, snap);
  }

  getState(): GameState {
    if (!this.rendered) throw new Error('no game state yet');
    return this.rendered;
  }

  bufferedSnapshots(): number {
    return this.buffer.length;
  }
}
```
Hinweis: Im Test 'shows other players with a 100 ms delay ...' ist die Uhr beim `start` 0, der Snapshot kommt bei Uhr 100. Nach `update(50)` (Uhr 150) ist die Renderzeit 50, also zwischen Puffer-Eintrag 0 (Uhr 0, x 40) und Eintrag 1 (Uhr 100, x 80): Alpha 0,5, also x 60. Nach weiteren 100 ms (Uhr 250) ist die Renderzeit 150 > 100 (Uhr des neuesten): der neueste Snapshot gilt. Die Schleife oben liefert dasselbe; ändert eine Abweichung die Logik, den Ablauf von Hand nachrechnen und nicht den Test lockern.

`packages/client/src/connection.ts`: Das Interface bleibt unverändert (`OnlineConnection` erfüllt es). Nur den Kommentar `Online kommt in Phase 4 dazu.` aktualisieren auf `Lokal: LocalConnection, online: OnlineConnection.`

- [ ] **Step 4: Tests und Typecheck**

Run: `npm test -w @pfandraiders/client && npm run typecheck -w @pfandraiders/client`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client
git commit -m "feat(client): add snapshot interpolation and OnlineConnection

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: `GameScene` für Online-Spiele verallgemeinern

**Files:**
- Modify: `packages/client/src/scenes/GameScene.ts`

**Interfaces:**
- Consumes: `OnlineConnection` (Task 6).
- Produces: `GameScene.init(data?: { slots?: PlayerSlot[]; online?: OnlineConnection })`. Lokal verhält sich die Szene wie bisher. Online zeigt sie alle Spieler des Snapshots, eine Kamera und ein HUD für den eigenen Spieler.

Keine Unit-Tests (Phaser). Prüfung: Typecheck, Build, Handtest in Task 8.

- [ ] **Step 1: Szene umbauen**

Die Änderungen an `packages/client/src/scenes/GameScene.ts`, jeweils auf dem bestehenden Code aufbauend (die Datei vor dem Ändern lesen):

1. Importe: aus `'../connection'` den Typ `GameConnection` statt `LocalConnection` für das Feld importieren (`LocalConnection` bleibt als Wert für den lokalen Pfad), aus `'../online'` den Typ `OnlineConnection`, aus `@pfandraiders/core` zusätzlich `ROOM_COLORS`.
2. Felder: `private conn!: GameConnection;` (statt `LocalConnection`), `private online: OnlineConnection | null = null;`, `bodies` und `warnings` werden zu `Map<string, Phaser.GameObjects.Rectangle>` bzw. `Map<string, Phaser.GameObjects.Text>` (Schlüssel = Spieler-ID), `private playerColors = new Map<string, number>();`.
3. `init`:
```ts
  init(data?: { slots?: PlayerSlot[]; online?: OnlineConnection }): void {
    this.online = data?.online ?? null;
    this.slots = data?.slots ?? [];
  }
```
4. Anfang von `create()`: Die Bedingung `if (this.slots.length === 0)` wird zu `if (this.slots.length === 0 && !this.online)`. Danach den Zustand je Modus beschaffen:
```ts
    let state: GameState;
    this.playerColors = new Map();
    if (this.online) {
      const online = this.online;
      this.conn = online;
      state = online.getState();
      // Ein Spieler pro Browser, Tastatur 1. Farben kommen aus der Raumliste des Servers.
      for (const r of online.roster) this.playerColors.set(r.id, r.color);
      this.slots = [{ id: online.you, color: this.playerColors.get(online.you) ?? ROOM_COLORS[0], device: { kind: 'keyboard', layout: 0 } }];
      // Neue Runde (Server schickt erneut `start`) und Verbindungsverlust
      online.onStart = () => this.scene.restart({ online });
      online.onClosed = () => this.scene.start('lobby', { notice: 'Verbindung zum Server verloren.' });
    } else {
      /* bisheriger lokaler Code: params, seed, createGame, LocalConnection, ?events=now */
      for (const s of this.slots) this.playerColors.set(s.id, s.color);
    }
```
   Der bisherige lokale Block (`const params ... this.conn = new LocalConnection(state, ids); ... if (params.get('events') === 'now') {...}`) wandert in den `else`-Zweig und weist `state` zu. `this.sources = this.slots.map(createSource)` bleibt für beide Modi (online erzeugt es für den einen Slot). `drawMap`, Zonen-Rechtecke und Spot-Rechtecke werden danach aus `state` erzeugt, wie bisher.
5. Körper für alle Spieler des Zustands erzeugen (statt nur für `this.slots`):
```ts
    this.bodies = new Map();
    this.warnings = new Map();
    for (const p of Object.values(state.players)) {
      const color = this.playerColors.get(p.id) ?? 0xffffff;
      const body = this.add.rectangle(p.x, p.y, CONFIG.playerHalf * 2, CONFIG.playerHalf * 2, color).setDepth(5);
      this.bodies.set(p.id, body);
      this.warnings.set(
        p.id,
        this.add.text(p.x, p.y - 8, '!', { ...FONT, color: '#ff5252', fontSize: '12px' }).setOrigin(0.5, 1).setDepth(6).setVisible(false),
      );
    }
```
6. Kameras folgen `this.bodies.get(this.slots[i].id)!`. Die HUDs benutzen weiter `this.slots[i]` (Farbe, Name `playerName(id)`; online besser den Namen aus der Raumliste: `online.roster.find(r => r.id === id)?.name ?? playerName(id)`).
7. `update()`:
   - Eingaben: `this.slots.forEach(... this.conn.setInput(slot.id, buildInput(this.sources[i].read())))` bleibt.
   - Neustart: Die Bedingung bleibt (Sperre 1,5 s nach Rundenende, `JustDown(R)` und `confirmPressed` werden weiter jeden Frame abgefragt). Der Neustart unterscheidet:
```ts
      if (this.online) this.online.requestStart(); // nur der Host löst aus, alle bekommen danach `start`
      else this.scene.restart({ slots: this.slots });
```
   - Darstellung: Statt über `this.slots` über alle Spieler des Zustands iterieren:
```ts
    for (const p of Object.values(state.players)) {
      const body = this.bodies.get(p.id);
      if (!body) continue; // Spieler, die nach dem Start nicht in der Liste waren
      body.setPosition(p.x, p.y);
      body.setAlpha(p.mode === 'unconscious' ? 0.35 : 1);
      this.warnings.get(p.id)?.setPosition(p.x, p.y - 8).setVisible(isBeingRobbed(state, p.id));
    }
    this.slots.forEach((slot, i) => this.huds[i].update(state, state.players[slot.id]));
```
   Spots, Zonen und NPCs wie bisher aus `state`.
8. Online zeigt `GameScene` einen Hinweis, solange die Verbindung weg ist, nicht nötig: `onClosed` wechselt in die Lobby (Wiederverbindung kommt in Task 8).

Der lokale Modus muss sich exakt wie vorher verhalten (die bisherigen Handtests dürfen sich nicht ändern).

- [ ] **Step 2: `LobbyScene` nimmt `notice` entgegen**

In `packages/client/src/scenes/LobbyScene.ts`: `init(data?: { notice?: string })` speichert `this.notice = data?.notice ?? ''` und `lines()` hängt, wenn gesetzt, eine Zeile mit dem Hinweis an. (Der Online-Menüaufruf folgt in Task 8.)

- [ ] **Step 3: Prüfen**

Run: `npm run typecheck && npm test && npm run build`
Expected: grün. Der lokale Modus ist nur per Handtest prüfbar: nach Task 8 gemeinsam.

- [ ] **Step 4: Commit**

```bash
git add packages/client
git commit -m "feat(client): let GameScene run on a local or an online connection

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Online-Menü, Lobby-Anbindung, Wiederverbindung

**Files:**
- Create: `packages/client/src/onlineMenu.ts`, `packages/client/src/serverUrl.ts`
- Modify: `packages/client/src/scenes/LobbyScene.ts`, `packages/server/src/index.ts` (optionale Variable `ROUND_MS`), `README.md`
- Test: `packages/client/test/serverUrl.test.ts`

**Interfaces:**
- Produces: `resolveServerUrl(search: string, envUrl: string | undefined): string` (rein), `showOnlineMenu(url: string): Promise<OnlineConnection>` (löst auf, sobald der Server `start` sendet; wird mit `null` aufgelöst, wenn der Nutzer abbricht).

- [ ] **Step 1: Failing Test schreiben**

`packages/client/test/serverUrl.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { resolveServerUrl } from '../src/serverUrl';

describe('resolveServerUrl', () => {
  it('prefers the ?server= parameter', () => {
    expect(resolveServerUrl('?server=wss://x.example', 'ws://env')).toBe('wss://x.example');
  });

  it('falls back to the build-time URL, then to localhost', () => {
    expect(resolveServerUrl('', 'wss://env.example')).toBe('wss://env.example');
    expect(resolveServerUrl('', undefined)).toBe('ws://localhost:8080');
    expect(resolveServerUrl('', '')).toBe('ws://localhost:8080');
  });

  it('only accepts ws:// and wss:// addresses from the parameter', () => {
    expect(resolveServerUrl('?server=javascript:alert(1)', 'ws://env')).toBe('ws://env');
    expect(resolveServerUrl('?server=https://x.example', undefined)).toBe('ws://localhost:8080');
  });
});
```
Run: `npm test -w @pfandraiders/client -- test/serverUrl.test.ts`. Expected: FAIL.

- [ ] **Step 2: `serverUrl.ts`**

`packages/client/src/serverUrl.ts`:
```ts
const DEFAULT_URL = 'ws://localhost:8080';

function valid(url: string | null | undefined): url is string {
  return typeof url === 'string' && /^wss?:\/\/[^\s]+$/.test(url);
}

/** Server-Adresse: ?server=… (nur ws/wss), sonst Build-Variable, sonst localhost. */
export function resolveServerUrl(search: string, envUrl: string | undefined): string {
  const param = new URLSearchParams(search).get('server');
  if (valid(param)) return param;
  if (valid(envUrl)) return envUrl;
  return DEFAULT_URL;
}
```

- [ ] **Step 3: `onlineMenu.ts` (DOM-Overlay)**

`packages/client/src/onlineMenu.ts`:
```ts
import type { ErrorCode, RosterEntry } from '@pfandraiders/core';
import { OnlineConnection } from './online';

const TOKEN_KEY = (room: string) => `pfandraiders.token.${room}`;
const NAME_KEY = 'pfandraiders.name';

function safeGet(key: string): string | null {
  try {
    return sessionStorage.getItem(key) ?? localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string, persistent = false): void {
  try {
    sessionStorage.setItem(key, value);
    if (persistent) localStorage.setItem(key, value);
  } catch {
    /* Speicher nicht verfügbar: dann geht es ohne */
  }
}

const ERRORS: Record<ErrorCode, string> = {
  bad_message: 'Ungültige Eingabe.',
  room_not_found: 'Raum nicht gefunden.',
  room_full: 'Der Raum ist voll.',
  name_taken: 'Der Name ist schon vergeben.',
  not_host: 'Nur der Host kann starten.',
  already_started: 'Die Runde läuft bereits.',
  need_players: 'Mindestens zwei Spieler nötig.',
  not_in_room: 'Du bist in keinem Raum.',
  rate_limited: 'Zu viele Nachrichten.',
  too_many_rooms: 'Der Server ist ausgelastet.',
};

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  style = '',
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  Object.assign(e, props);
  if (style) e.setAttribute('style', style);
  return e;
}

/**
 * Zeigt ein Overlay zum Erstellen oder Betreten eines Raums und die Spielerliste.
 * Löst mit der Verbindung auf, sobald der Server die Runde startet. Löst mit null auf, wenn abgebrochen wird.
 */
export function showOnlineMenu(url: string, socketFactory = (u: string) => new WebSocket(u)): Promise<OnlineConnection | null> {
  return new Promise((resolve) => {
    const root = el('div', {}, 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.85);color:#fff;font:14px monospace;z-index:10');
    const box = el('div', {}, 'background:#222;padding:20px;border:2px solid #888;min-width:280px;max-width:90vw');
    root.appendChild(box);
    document.body.appendChild(root);

    const conn = new OnlineConnection(url, (u) => socketFactory(u) as never);
    let finished = false;
    const finish = (result: OnlineConnection | null) => {
      if (finished) return;
      finished = true;
      conn.onStart = null;
      root.remove();
      if (result === null) conn.close();
      resolve(result);
    };

    const message = el('div', {}, 'color:#ff8a80;min-height:1.2em;margin-top:8px');
    const showError = (text: string) => {
      message.textContent = text;
    };
    conn.onError = (code, text) => showError(ERRORS[code] ?? text);
    conn.onClosed = () => {
      showError('Verbindung zum Server verloren.');
    };
    conn.onStart = () => finish(conn);

    const renderEntry = () => {
      box.replaceChildren();
      box.appendChild(el('div', { textContent: 'Online spielen' }, 'font-size:18px;margin-bottom:8px'));
      box.appendChild(el('div', { textContent: `Server: ${url}` }, 'color:#aaa;font-size:11px;margin-bottom:10px'));
      const name = el('input', { placeholder: 'Dein Name', maxLength: 16, value: safeGet(NAME_KEY) ?? '' }, 'width:100%;box-sizing:border-box;margin-bottom:8px;font:inherit');
      const code = el('input', { placeholder: 'Raumcode', maxLength: 4 }, 'width:100%;box-sizing:border-box;margin-bottom:8px;font:inherit;text-transform:uppercase');
      const create = el('button', { textContent: 'Raum erstellen' }, 'font:inherit;margin-right:8px');
      const join = el('button', { textContent: 'Beitreten' }, 'font:inherit;margin-right:8px');
      const cancel = el('button', { textContent: 'Abbrechen' }, 'font:inherit');
      box.append(name, code, create, join, cancel, message);

      const need = () => {
        if (name.value.trim().length === 0) {
          showError('Bitte einen Namen eingeben.');
          return false;
        }
        safeSet(NAME_KEY, name.value.trim(), true);
        if (conn.status === 'idle' || conn.status === 'closed') {
          showError('');
          conn.connect();
        }
        return true;
      };
      const whenOpen = (fn: () => void) => {
        const t0 = Date.now();
        const wait = () => {
          if (conn.status === 'open') return fn();
          if (conn.status === 'closed' || Date.now() - t0 > 5000) return showError('Server nicht erreichbar.');
          setTimeout(wait, 50);
        };
        wait();
      };
      create.onclick = () => {
        if (need()) whenOpen(() => conn.create(name.value.trim()));
      };
      join.onclick = () => {
        if (!need()) return;
        const room = code.value.trim().toUpperCase();
        whenOpen(() => conn.join(room, name.value.trim(), safeGet(TOKEN_KEY(room)) ?? undefined));
      };
      cancel.onclick = () => finish(null);
    };

    const renderLobby = () => {
      box.replaceChildren();
      box.appendChild(el('div', { textContent: `Raum ${conn.room}` }, 'font-size:20px;letter-spacing:4px;margin-bottom:4px'));
      box.appendChild(el('div', { textContent: 'Code weitergeben, damit Freunde beitreten.' }, 'color:#aaa;font-size:11px;margin-bottom:10px'));
      const list = el('div', {}, 'margin-bottom:10px');
      const draw = (players: RosterEntry[]) => {
        list.replaceChildren();
        for (const p of players) {
          const hex = `#${p.color.toString(16).padStart(6, '0')}`;
          const row = el('div', { textContent: `${p.name}${p.id === conn.host ? ' (Host)' : ''}${p.connected ? '' : ' (getrennt)'}` }, `color:${hex}`);
          list.appendChild(row);
        }
      };
      draw(conn.roster);
      const start = el('button', { textContent: 'Spiel starten' }, 'font:inherit;margin-right:8px');
      const hint = el('div', { textContent: 'Warte auf den Host…' }, 'color:#aaa');
      const leave = el('button', { textContent: 'Verlassen' }, 'font:inherit');
      const refresh = () => {
        draw(conn.roster);
        start.style.display = conn.isHost() ? 'inline-block' : 'none';
        hint.style.display = conn.isHost() ? 'none' : 'block';
        start.disabled = conn.roster.filter((p) => p.connected).length < 2;
      };
      start.onclick = () => conn.requestStart();
      leave.onclick = () => finish(null);
      box.append(list, start, hint, leave, message);
      conn.onLobby = refresh;
      refresh();
    };

    conn.onJoined = () => {
      safeSet(TOKEN_KEY(conn.room), conn.token);
      showError('');
      renderLobby();
    };

    renderEntry();
  });
}
```
Hinweise: `socketFactory` erzeugt im Browser einen echten `WebSocket`; dessen Ereignisfelder (`onopen`, `onmessage`, `onclose`) passen zu `SocketLike`. Falls der Typ nicht passt, ein kleines Adapterobjekt nutzen, das `send`, `close` und die drei Felder durchreicht. Der Wiederverbindungsversuch nach Verlust läuft über das Menü: der Spieler öffnet es erneut, gibt Namen und Code ein und `join` sendet automatisch das gespeicherte Token (Frist 30 s auf dem Server).

- [ ] **Step 4: `LobbyScene` einbinden**

In `packages/client/src/scenes/LobbyScene.ts`:
- Import: `import { showOnlineMenu } from '../onlineMenu';` und `import { resolveServerUrl } from '../serverUrl';`.
- In `create()` (Nicht-Debug-Pfad): `this.input.keyboard!.addKey('O')` als `onlineKey` merken.
- In `update()`: bei `JustDown(this.onlineKey)` und nicht schon geöffnet: Menü öffnen:
```ts
      const url = resolveServerUrl(window.location.search, import.meta.env.VITE_SERVER_URL as string | undefined);
      this.menuOpen = true;
      this.input.keyboard!.enabled = false; // Tasten gehören dem Eingabefeld
      showOnlineMenu(url).then((conn) => {
        this.menuOpen = false;
        this.input.keyboard!.enabled = true;
        if (conn) this.scene.start('game', { online: conn });
      });
```
  Solange `menuOpen` gilt, verarbeitet `update()` keine weiteren Tasten.
- In `lines()` die Zeile `Online spielen: Taste O` ergänzen.

- [ ] **Step 5: Tests, Typecheck, Build**

Run: `npm test && npm run typecheck && npm run build`
Expected: grün. Falls `import.meta.env` Typfehler zeigt: `packages/client/tsconfig.json` hat `types: ["vite/client"]`; sonst in `src/vite-env.d.ts` `/// <reference types="vite/client" />` anlegen.

- [ ] **Step 6: Commit**

```bash
git add packages/client README.md
git commit -m "feat(client): add online menu, server URL resolution and lobby entry

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Handtest mit zwei Browser-Tabs (nur Controller)**

Terminal 1: `npm run dev:server`. Terminal 2: `npm run dev`. Zwei Tabs mit `http://localhost:5173/?server=ws://localhost:8080` (bei stehender Animationsschleife das `requestAnimationFrame`-Shim wie in früheren Phasen verwenden).
1. Tab A: Lobby, `O` drücken, Name "Anna", "Raum erstellen": Raumcode erscheint.
2. Tab B: `O`, Name "Bob", Code eintippen, "Beitreten": beide sehen die Spielerliste, nur A sieht "Spiel starten".
3. A startet: beide Tabs wechseln ins Spiel, jeder sieht beide Figuren, eigenes HUD mit eigenem Geld.
4. Beide laufen (WASD), Figur des anderen bewegt sich flüssig im eigenen Tab, kein Springen.
5. Suchen, Abgeben, Klauen funktioniert wie lokal. Das Geld des anderen ist im eigenen Tab nie sichtbar, nach Rundenende (`?round` wird online ignoriert, der Server nutzt 10 min; für den Test den Server mit kleiner Rundenzeit starten, falls vorhanden, sonst bis zum Ende warten oder die Dev-Variable `ROUND_MS` der Task nutzen) steht die Rangliste mit beiden Beträgen im HUD.
6. Tab B schließen und innerhalb von 30 s neu öffnen, Menü, selber Name und Code: Rückkehr ins laufende Spiel.
7. Server stoppen: beide Tabs fallen in die Lobby mit Hinweis "Verbindung zum Server verloren."

Punkt 5 braucht eine kurze Runde: Der Server liest dafür die optionale Umgebungsvariable `ROUND_MS` (in `packages/server/src/index.ts` an `startServer({ roundMs })` durchreichen). Das wird in diesem Task ergänzt: `const roundMs = process.env.ROUND_MS ? Number(process.env.ROUND_MS) : undefined;` und `startServer({ port, allowedOrigins, roundMs })`.

---

### Task 9: CI und GitHub Pages

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/workflows/pages.yml`

- [ ] **Step 1: CI-Workflow**

`.github/workflows/ci.yml`:
```yaml
name: CI
on:
  pull_request:
  push:
    branches: [master]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
      - run: npm run build:server
```

- [ ] **Step 2: Pages-Workflow**

`.github/workflows/pages.yml`:
```yaml
name: Pages
on:
  push:
    branches: [master]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run build
        env:
          VITE_SERVER_URL: ${{ vars.SERVER_URL }}
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: packages/client/dist
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 3: Prüfen und committen**

Die YAML-Dateien auf Syntax prüfen (`node -e` mit einem YAML-Parser ist nicht verfügbar; stattdessen sorgfältig lesen und, falls `actionlint` oder Python-YAML installiert ist, damit prüfen; sonst im Bericht festhalten, dass die Workflows erst auf GitHub laufen). `npm run build` mit gesetztem `VITE_SERVER_URL=wss://example.test` lokal ausführen und mit `grep -r "wss://example.test" packages/client/dist` bestätigen, dass die Adresse im Bundle steht.
```bash
git add .github
git commit -m "ci: add CI workflow and GitHub Pages deployment

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Ende von Phase 4: Abnahme

- [ ] `npm test`, `npm run typecheck`, `npm run build`, `npm run build:server` grün.
- [ ] Handtest Punkte 1 bis 7 aus Task 8 erfüllt.
- [ ] Der Server-Container ist (falls Docker vorhanden) gebaut und per Smoke-Skript geprüft, sonst als "nicht geprüft" vermerkt.
- [ ] Der Entwickler richtet auf dem VPS ein: DNS-Eintrag der Domain, `cd deploy && DOMAIN=... ALLOWED_ORIGINS=https://dasistdaniel.github.io docker compose up -d --build`; auf GitHub: Pages auf "GitHub Actions" stellen und die Repository-Variable `SERVER_URL` (zum Beispiel `wss://play.example.org`) setzen. Danach spielt er mit einem Freund eine Runde über das Internet.
- [ ] Danach Plan für Phase 5 (Politur: Pixelgrafik, Sound, Menüs, Tiled-Karte, Prediction falls nötig).

## Self-Review (Spec-Abdeckung)

- Spec §2 Hosting (Pages plus Docker auf VPS): Tasks 5 und 9. §3 `server`-Paket und `OnlineConnection`: Tasks 3, 4, 6. §5 Lobby, Nachrichten, Tick 20 Hz, Snapshots, Interpolation, Verbindungsabbruch, Grenzen: Tasks 1 bis 8. §5 "Geld und Containerinhalt anderer nicht senden": Task 2 und Test auf der Leitung in Task 4. §8 Integrationstest mit Bot-Clients: Task 4.
- Aus den früheren Reviews aufgenommen: Eingabe-Validierung (Task 1), NaN-`dt` (Task 1), Snapshot-Projektion (Task 2), Reihenfolge-Effekte bleiben unverändert (Spielerreihenfolge nach Beitritt, Hinweis für spätere Rotation), `?events=now` bleibt nur lokal (Task 7).
- Abweichungen und Ergänzungen: JSON-Vollsnapshots statt Delta, keine Prediction, nur Tastatur 1 online, "ausgetretene" Spieler bleiben als Statisten, Raumlimit 8 statt 4 (Spec nennt 2 bis 8).
- Typkonsistenz: `ClientMessage`, `ServerMessage`, `RosterEntry`, `Snapshot` (aus `protocol.ts`), `Conn`, `Member`, `Room`, `RoomManager`, `RunningServer`, `SocketLike`, `OnlineConnection` sind in allen Tasks gleich benannt.
