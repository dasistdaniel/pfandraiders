# PfandRaiders Phase 2b (eigene Klauen-Taste, Klauen immer möglich) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Klauen bekommt eine eigene Taste (Gamepad: B). Ein Spieler kann jeden Mitspieler bestehlen, sobald dessen Container Flaschen enthält, egal was das Opfer gerade tut.

**Architecture:** Änderung der Diebstahlregeln in `core` (neues Eingabefeld `steal`, neues Spielerfeld `stealHeld` für die Flanke, `canBeRobbed` ohne Moduszwang, `updateSteal` ohne Sucher-Sperre) und Verdrahtung der neuen Taste im Client (Tastaturbelegung, Gamepad-B, Hinweistexte, README). Der Rest von Phase 2 bleibt unverändert.

**Tech Stack:** wie Phase 2.

**Spec:** `docs/superpowers/specs/2026-10-02-pfandraiders-design.md` §4 (Diebstahl, geändert). Dieser Plan ersetzt die Entscheidungen 1 bis 3 und 7 des Phase-2-Plans (`2026-10-02-phase-2-diebstahl-splitscreen.md`).

## Entscheidungen (vom Nutzer vorgegeben, Rest vom Plan)

1. **Eigene Taste:** Tastatur 1 `Q`, Tastatur 2 `/` (Phaser-Name `FORWARD_SLASH`), Gamepad `B`. Die Aktionstaste klaut nicht mehr.
2. **Immer möglich:** Das Opfer muss nur Flaschen im Container haben, nicht geschützt sein (Schutzzeit nach einem Diebstahl bleibt) und in Reichweite stehen. Es muss nicht suchen.
3. **Wer klauen darf:** Jeder, der stillsteht, die Klauen-Taste hält und freien Platz im Container hat, auch wenn er gerade sucht. Die Klauen-Taste hat Vorrang vor Suchen und bricht eine laufende Suche des Diebs ab.
4. **Abbruch:** Dieb läuft los oder lässt die Taste los, Opfer geht außer Reichweite, Opfer verliert alle Flaschen oder wird geschützt. (Das Opfer kann also weglaufen.)
5. **Bolzenschneider:** löst beim neuen Drücken der Klauen-Taste aus (statt der Aktionstaste), wenn ein gültiges Opfer in Reichweite ist. Sonst unverändert (100 %, begrenzt durch freien Platz, Item verbraucht sich nur beim echten Diebstahl).
6. Alles andere (2 s, 50 % aufgerundet, wertvollste zuerst, 3 s Schutz, Bolzenschneider 6,00 €) bleibt.

## Global Constraints

- `core` darf weder Phaser noch DOM noch Netzwerk importieren, kein `Math.random`. Alle Spielwerte nur in `config.ts`.
- Client-Logiktests dürfen Phaser nicht importieren. Der Client enthält keine Regeln.
- Commit-Nachrichten enden mit der Zeile `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Alle bestehenden Tests, die nichts mit Klauen zu tun haben, bleiben unverändert grün.

## Review Focus

- Die Aktionstaste allein klaut nie (Task 1).
- Klauen funktioniert gegen ein Opfer, das nur dasteht oder läuft, solange es Flaschen hat und in Reichweite ist (Task 1).
- Klauen-Taste hat Vorrang vor Suchen, ein Dieb mit vollem Container startet nicht, nichts geht verloren (Task 1).
- Bolzenschneider: nur auf neuen Druck der Klauen-Taste, nicht wenn die Taste schon vorher gehalten wurde (Task 1).
- Alle Schutz-, Abbruch- und Platzregeln aus Phase 2 gelten weiter (Task 1).
- Hinweise und README nennen die richtigen Tasten für jedes Gerät (Task 2).

---

## File Structure

```
packages/core/src/types.ts      Input.steal, NO_INPUT.steal, Player.stealHeld
packages/core/src/game.ts       newPlayer: stealHeld false
packages/core/src/theft.ts      canBeRobbed ohne Modus, updateSteal ohne Sucher-Sperre
packages/core/src/step.ts       Steal-Flanke, eigener Zweig
packages/core/test/theft.test.ts            ersetzen
packages/core/test/determinism-theft.test.ts anpassen
packages/core/test/determinism.test.ts       steal: false im skriptierten Input
packages/client/src/input.ts, sources.ts, devices.ts, text.ts   Taste verdrahten
packages/client/test/input.test.ts, sources.test.ts, text.test.ts anpassen
README.md                       Steuerung
```

---

### Task 1: Klauen-Regeln im Core

**Files:**
- Modify: `packages/core/src/types.ts`, `game.ts`, `theft.ts`, `step.ts`
- Modify (ersetzen): `packages/core/test/theft.test.ts`
- Modify: `packages/core/test/determinism-theft.test.ts`, `packages/core/test/determinism.test.ts`

**Interfaces:**
- Produces: `Input.steal: boolean` (Klauen-Taste gehalten), `NO_INPUT.steal = false`, `Player.stealHeld: boolean`. `updateSteal(state, thief, pressed, dtMs)` behält die Signatur, `pressed` ist jetzt die Flanke der Klauen-Taste.

- [ ] **Step 1: Tests ersetzen (rot)**

`packages/core/test/theft.test.ts` komplett ersetzen:
```ts
import { describe, expect, it } from 'vitest';
import { totalBottles } from '../src/bottles';
import { CONFIG } from '../src/config';
import { isBeingRobbed } from '../src/theft';
import { input, newGame, runFor, runSteps, teleport, setSpot, THIEF_ROWS } from './helpers';

const STEAL = { p1: input({ steal: true }) };

/** p2 trägt 4 Plastik (Tasche, 8 Plätze), p1 ist Dieb mit leeren Händen (3 Plätze). p2 steht 16 px neben p1. */
function setup() {
  const s = newGame(THIEF_ROWS, ['p1', 'p2']);
  setSpot(s, 0, { plastic: 1 });
  s.players.p2.containerLevel = 1;
  s.players.p2.bottles = { plastic: 4, glass: 0, crate: 0 };
  return s;
}

describe('stealing', () => {
  it('takes half of the victim container after the steal time, even if the victim just stands there', () => {
    const s = setup();
    runFor(s, STEAL, CONFIG.steal.durationMs + 300);
    expect(s.players.p1.bottles.plastic).toBe(2);
    expect(s.players.p2.bottles.plastic).toBe(2);
    expect(s.players.p2.shieldMs).toBeGreaterThan(0);
    expect(s.players.p1.mode).toBe('walking');
  });

  it('also works while the victim is searching and leaves the victim search running', () => {
    const s = setup();
    runFor(s, { p1: input({ steal: true }), p2: input({ action: true }) }, CONFIG.steal.durationMs + 300);
    expect(s.players.p1.bottles.plastic).toBe(2);
    expect(s.players.p2.bottles.plastic).toBe(2);
    expect(s.players.p2.mode).toBe('searching');
  });

  it('warns the victim while the steal is in progress', () => {
    const s = setup();
    runSteps(s, STEAL, 50);
    expect(s.players.p1.mode).toBe('stealing');
    expect(s.players.p1.stealTargetId).toBe('p2');
    expect(isBeingRobbed(s, 'p2')).toBe(true);
    expect(isBeingRobbed(s, 'p1')).toBe(false);
  });

  it('rounds the stolen amount up', () => {
    const s = setup();
    s.players.p2.bottles = { plastic: 3, glass: 0, crate: 0 };
    runFor(s, STEAL, CONFIG.steal.durationMs + 300);
    expect(s.players.p1.bottles.plastic).toBe(2);
    expect(s.players.p2.bottles.plastic).toBe(1);
  });

  it('takes the most valuable bottles first', () => {
    const s = setup();
    s.players.p2.bottles = { plastic: 2, glass: 1, crate: 1 };
    runFor(s, STEAL, CONFIG.steal.durationMs + 300);
    expect(s.players.p1.bottles).toEqual({ plastic: 0, glass: 1, crate: 1 });
  });

  it('steals nothing from a victim with an empty container', () => {
    const s = setup();
    s.players.p2.bottles = { plastic: 0, glass: 0, crate: 0 };
    runFor(s, STEAL, CONFIG.steal.durationMs + 300);
    expect(totalBottles(s.players.p1.bottles)).toBe(0);
    expect(s.players.p2.shieldMs).toBe(0);
    expect(s.players.p1.stealTargetId).toBeNull();
  });

  it('does not start with a full thief container and loses nothing', () => {
    const s = setup();
    s.players.p1.bottles = { plastic: 3, glass: 0, crate: 0 };
    runFor(s, STEAL, CONFIG.steal.durationMs + 300);
    expect(s.players.p1.bottles.plastic).toBe(3);
    expect(s.players.p2.bottles.plastic).toBe(4);
    expect(s.players.p1.stealTargetId).toBeNull();
    expect(s.players.p1.mode).toBe('walking');
  });

  it('limits the loot to the free room of the thief', () => {
    const s = setup();
    s.players.p1.bottles = { plastic: 2, glass: 0, crate: 0 };
    runFor(s, STEAL, CONFIG.steal.durationMs + 300);
    expect(s.players.p1.bottles.plastic).toBe(3);
    expect(s.players.p2.bottles.plastic).toBe(3);
  });

  it('aborts when the thief walks away and steals nothing', () => {
    const s = setup();
    runSteps(s, STEAL, 50);
    runSteps(s, { p1: input({ steal: true, moveX: -1 }) }, 1);
    expect(s.players.p1.stealProgressMs).toBe(0);
    expect(s.players.p1.stealTargetId).toBeNull();
    expect(s.players.p1.mode).toBe('walking');
    expect(totalBottles(s.players.p1.bottles)).toBe(0);
  });

  it('aborts when the thief releases the steal key', () => {
    const s = setup();
    runSteps(s, STEAL, 50);
    runSteps(s, { p1: input({}) }, 1);
    expect(s.players.p1.stealProgressMs).toBe(0);
    expect(s.players.p1.mode).toBe('walking');
    expect(isBeingRobbed(s, 'p2')).toBe(false);
  });

  it('aborts when the victim runs out of reach', () => {
    const s = setup();
    runSteps(s, STEAL, 50);
    runSteps(s, { p1: input({ steal: true }), p2: input({ moveX: 1 }) }, 120);
    expect(totalBottles(s.players.p1.bottles)).toBe(0);
    expect(s.players.p2.bottles.plastic).toBe(4);
    expect(s.players.p1.stealProgressMs).toBe(0);
  });

  it('shields the victim so a second theft cannot follow at once', () => {
    const s = setup();
    runFor(s, STEAL, CONFIG.steal.durationMs + 300);
    expect(s.players.p1.bottles.plastic).toBe(2);
    runSteps(s, STEAL, 50);
    expect(s.players.p1.bottles.plastic).toBe(2);
    expect(s.players.p1.mode).not.toBe('stealing');
  });

  it('counts the shield down to zero', () => {
    const s = setup();
    s.players.p2.shieldMs = 100;
    runSteps(s, {}, 10, 20);
    expect(s.players.p2.shieldMs).toBe(0);
  });

  it('never steals with the action key alone', () => {
    const s = setup();
    runFor(s, { p1: input({ action: true }), p2: input({ action: true }) }, CONFIG.steal.durationMs + 300);
    expect(totalBottles(s.players.p1.bottles)).toBe(0);
    expect(s.players.p1.mode).not.toBe('stealing');
    expect(s.players.p2.bottles.plastic).toBe(4);
  });

  it('never steals from itself', () => {
    const s = setup();
    runFor(s, { p2: input({ steal: true }) }, CONFIG.steal.durationMs + 300);
    expect(s.players.p2.stealTargetId).toBeNull();
    expect(s.players.p2.bottles.plastic).toBe(4);
  });

  it('lets the steal key win over searching and cancels the thief search', () => {
    const s = setup();
    teleport(s, 'p1', { x: 44, y: 24 }); // jetzt liegt auch der Spot (x=56) in Reichweite von p1
    runSteps(s, { p1: input({ action: true }) }, 20);
    expect(s.players.p1.mode).toBe('searching');
    runSteps(s, { p1: input({ action: true, steal: true }) }, 1);
    expect(s.players.p1.mode).toBe('stealing');
    expect(s.players.p1.searchSpotId).toBeNull();
  });
});

describe('bolt cutters', () => {
  it('steals everything at once on the first press of the steal key and is used up', () => {
    const s = setup();
    s.players.p1.containerLevel = 3;
    s.players.p1.item = 'bolt_cutters';
    runSteps(s, STEAL, 1);
    expect(s.players.p1.bottles.plastic).toBe(4);
    expect(s.players.p2.bottles.plastic).toBe(0);
    expect(s.players.p1.item).toBeNull();
    expect(s.players.p2.shieldMs).toBeGreaterThan(0);
  });

  it('is limited by the free room of the thief', () => {
    const s = setup();
    s.players.p1.item = 'bolt_cutters';
    runSteps(s, STEAL, 1);
    expect(s.players.p1.bottles.plastic).toBe(3);
    expect(s.players.p2.bottles.plastic).toBe(1);
    expect(s.players.p1.item).toBeNull();
  });

  it('is kept when the victim has no bottles', () => {
    const s = setup();
    s.players.p1.item = 'bolt_cutters';
    s.players.p2.bottles = { plastic: 0, glass: 0, crate: 0 };
    runSteps(s, STEAL, 1);
    expect(s.players.p1.item).toBe('bolt_cutters');
  });

  it('is kept when the victim is shielded', () => {
    const s = setup();
    s.players.p1.item = 'bolt_cutters';
    s.players.p2.shieldMs = 5000;
    runSteps(s, STEAL, 1);
    expect(s.players.p1.item).toBe('bolt_cutters');
    expect(s.players.p2.bottles.plastic).toBe(4);
  });

  it('is not used when the key was already held before the victim came into reach', () => {
    const s = setup();
    s.players.p1.item = 'bolt_cutters';
    teleport(s, 'p2', { x: 120, y: 24 }); // weit weg
    runSteps(s, STEAL, 5); // Taste gedrückt, kein Opfer in Reichweite
    teleport(s, 'p2', { x: 40, y: 24 });
    runSteps(s, STEAL, 5);
    expect(s.players.p1.item).toBe('bolt_cutters');
    expect(s.players.p1.mode).toBe('stealing'); // normaler Diebstahl läuft stattdessen
  });

  it('is not triggered by the action key', () => {
    const s = setup();
    s.players.p1.item = 'bolt_cutters';
    runSteps(s, { p1: input({ action: true }) }, 5);
    expect(s.players.p1.item).toBe('bolt_cutters');
    expect(s.players.p2.bottles.plastic).toBe(4);
  });
});
```

Run: `npm test -w @pfandraiders/core -- test/theft.test.ts`
Expected: FAIL (TypeScript/Runtime: `steal` unbekannt bzw. kein Diebstahl).

- [ ] **Step 2: Typen und Spielerfeld**

`packages/core/src/types.ts`: im Interface `Input` nach `action: boolean;` einfügen:
```ts
  /** Klauen-Taste gehalten */
  steal: boolean;
```
und `NO_INPUT` ersetzen durch:
```ts
export const NO_INPUT: Input = { moveX: 0, moveY: 0, action: false, steal: false, buy: null };
```
Im Interface `Player` nach `actionHeld: boolean;` einfügen:
```ts
  /** Klauen-Taste im vorigen Tick gedrückt, für die Flanke (Bolzenschneider) */
  stealHeld: boolean;
```
`packages/core/src/game.ts`: in `newPlayer` nach `actionHeld: false,` einfügen: `stealHeld: false,`.

- [ ] **Step 3: `theft.ts` anpassen**

In `canBeRobbed` die Zeile `victim.mode === 'searching' &&` entfernen. In `updateSteal` den Kommentar über der Funktion ersetzen durch:
```ts
/**
 * Ein Diebstahlschritt für einen Spieler, der die Klauen-Taste hält und stillsteht.
 * Gibt true zurück, wenn er gerade klaut (oder in diesem Schritt fertig geworden ist).
 * `pressed` ist true im Schritt, in dem die Klauen-Taste neu gedrückt wurde (löst den Bolzenschneider aus).
 * Bei false verändert die Funktion nichts außer einem veralteten Ziel, das der Aufrufer mit cancelSteal löscht.
 */
```
und die Zielwahl ersetzen:
```ts
  const current = thief.stealTargetId === null ? undefined : state.players[thief.stealTargetId];
  const target =
    current !== undefined && canBeRobbed(thief, current)
      ? current
      : findStealTarget(state, thief);
  if (target === null) return false;
```
(alter `let target`-Block mit `thief.mode !== 'searching'`-Zweig entfällt).

- [ ] **Step 4: `step.ts` anpassen**

In `updatePlayer` direkt nach `p.actionHeld = input.action;` einfügen:
```ts
  const stealPressed = input.steal && !p.stealHeld;
  p.stealHeld = input.steal;
```
und den Zweig `} else if (input.action && !deposited && updateSteal(state, p, pressed, dt)) {` ersetzen durch:
```ts
  } else if (input.steal && updateSteal(state, p, stealPressed, dt)) {
```
(der Suchzweig `input.action && !deposited && updateSearch` bleibt unverändert).

- [ ] **Step 5: Determinismus-Tests anpassen**

`packages/core/test/determinism-theft.test.ts`: in `normalTheft` den Aufruf ersetzen durch
`step(s, { p1: input({ steal: true }), p2: input({ action: true }) }, 20);`
und in `cutters` die Zeile in der Schleife ersetzen durch
`step(s, { p1: input({ steal: t === 0 }), p2: input({ action: true }) }, 20);`

`packages/core/test/determinism.test.ts`: im Objekt, das `scripted()` zurückgibt, nach `action: ...` die Zeile `steal: false,` einfügen (damit der Typ `Input` stimmt).

- [ ] **Step 6: Alles prüfen**

Run: `npm test -w @pfandraiders/core && npm run typecheck -w @pfandraiders/core`
Expected: PASS, alle Phase-1/2-Tests außer den hier geänderten unverändert grün. Schlägt ein Test wegen einer anderen Stelle fehl, die ein `Input`-Objekt von Hand baut, dort `steal: false` ergänzen und im Bericht nennen.

- [ ] **Step 7: Commit**

```bash
git add packages/core
git commit -m "feat(core): dedicated steal key, stealing possible whenever the victim carries bottles

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Klauen-Taste im Client

**Files:**
- Modify: `packages/client/src/input.ts`, `sources.ts`, `devices.ts`, `text.ts`
- Modify: `packages/client/test/input.test.ts`, `sources.test.ts`, `text.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: Task 1 (`Input.steal`).
- Produces: `KeyState.steal: boolean` (gehalten), `PadSnapshot.b`, `HeldKeys.steal`, `KeyLabels.steal`.

- [ ] **Step 1: Tests anpassen (rot)**

- `input.test.ts`: in der Konstante `NONE` die Zeile `steal: false,` ergänzen und einen Test anfügen:
```ts
  it('passes the steal key through as held', () => {
    expect(buildInput({ ...NONE, steal: true })).toMatchObject({ steal: true, action: false });
    expect(buildInput(NONE)).toMatchObject({ steal: false });
  });
```
- `sources.test.ts`: in `IDLE` `b: false,` ergänzen; im `held`-Helfer `steal: false,` ergänzen. Tests anfügen:
```ts
  it('maps B to the steal key', () => {
    expect(padToHeld({ ...IDLE, b: true })).toMatchObject({ steal: true, action: false });
    expect(padToHeld(IDLE)).toMatchObject({ steal: false });
  });
```
(im `padToHeld`-describe) und
```ts
  it('passes the steal key through as held, not as an edge', () => {
    const t = new EdgeTracker();
    expect(t.apply(held({ steal: true })).steal).toBe(true);
    expect(t.apply(held({ steal: true })).steal).toBe(true);
  });
```
(im `EdgeTracker`-describe).
- `text.test.ts`: `KEYS` bekommt `steal: 'Q'`, `KEYS2` bekommt `steal: '/'`. Erwartete Hinweise: `'[Q halten] Klauen'` bzw. `'[Q] Bolzenschneider einsetzen'` (KEYS) und `'[/ halten] Klauen'` bzw. `'[/] Bolzenschneider einsetzen'` (KEYS2). Im Test "offers stealing next to a searching victim with free room" das `s.players.p2.mode = 'searching';` entfernen (Opfer muss nicht suchen) und den Titel auf "next to a victim who carries bottles" ändern. Neuer Test: das Klauen angeboten wird auch, wenn der Spieler selbst gerade sucht (`s.players.p1.mode = 'searching'` setzen, Hinweis weiterhin enthalten).

Run: `npm test -w @pfandraiders/client`
Expected: FAIL.

- [ ] **Step 2: Implementieren**

`input.ts`: in `KeyState` nach `action: boolean;` einfügen `/** Klauen-Taste gehalten */ steal: boolean;`. In `buildInput` nach `action: k.action,` einfügen `steal: k.steal,`.

`sources.ts`: `KeyLabels` um `steal: string;` erweitern; `PadSnapshot` um `b: boolean;`; `HeldKeys` um `steal: boolean;`; `padToHeld` liefert zusätzlich `steal: s.b,`; `EdgeTracker.apply` gibt zusätzlich `steal: h.steal,` zurück (gehalten, keine Flanke).

`devices.ts`:
- `KeyboardLayout` um `steal: string;` erweitern. Tastatur 1: `steal: 'Q'`, Labels `{ action: 'E', upgrade: '1', item: '2', steal: 'Q' }`. Tastatur 2: `steal: 'FORWARD_SLASH'`, Labels `{ action: 'Enter', upgrade: ',', item: '.', steal: '/' }`.
- `KeyboardSource`: `steal` in die Liste der `addKeys`-Namen aufnehmen und `read()` um `steal: k[l.steal].isDown,` ergänzen.
- `GamepadSource`: im Snapshot `b: pad.B,` ergänzen (und in `IDLE_PAD` `b: false`), Labels `{ action: 'A', upgrade: 'X', item: 'Y', steal: 'B' }`.

`text.ts` in `hintLines`: die Bedingung `p.mode !== 'searching' && !full && findStealTarget(state, p)` durch `!full && findStealTarget(state, p)` ersetzen und die Texte durch `` `[${labels.steal}] Bolzenschneider einsetzen` `` bzw. `` `[${labels.steal} halten] Klauen` `` ersetzen.

`README.md`: in der Steuerungstabelle eine Spalte "Klauen" ergänzen (Tastatur 1 `Q`, Tastatur 2 `/`, Gamepad `B`) und den Absatz darunter ersetzen durch: "Aktion: Suchen (halten), Pfand abgeben (drücken am Pfandautomaten). Klauen: Klauen-Taste halten (2 s) neben einem Mitspieler, der Flaschen im Container hat, egal was er gerade macht. Mit dem Bolzenschneider (im Shop 6,00 €) klaut ein neuer Druck der Klauen-Taste sofort alles, was in den eigenen Container passt. `R` oder die Aktionstaste startet nach Rundenende (nach kurzer Sperre) neu."

- [ ] **Step 3: Alles prüfen**

Run: `npm test && npm run typecheck && npm run build`
Expected: PASS, Build ohne Fehler.

- [ ] **Step 4: Commit**

```bash
git add packages/client README.md
git commit -m "feat(client): wire the steal key (keyboard Q and slash, gamepad B)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Abnahme

- [ ] `npm test`, `npm run typecheck`, `npm run build` grün.
- [ ] Handtest im Browser: Klauen mit Q (Tastatur 1) gegen einen Mitspieler, der nur dasteht und Flaschen trägt. Opfer sieht die Warnung. Die Aktionstaste klaut nicht. Hinweis zeigt die richtige Taste je Gerät. Gamepad B nur mit echter Hardware.
