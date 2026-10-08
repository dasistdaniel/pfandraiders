# Shop-Phase im Client – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Client spielt die Serie lokal und online: Tasten für Schlagen und Essen, HUD mit Inventar, Rangliste mit Runden- und Gesamtverdienst, eine Shop-Szene, die nur mit den Bewegungstasten (plus Aktionstaste) bedient wird (online zusätzlich mit der Maus), eine Rundenzeit-Wahl in beiden Lobbys und Sounds für Schlag und Ausrauben.

**Architecture:** Alle Logik steckt in reinen, ohne Phaser testbaren Modulen: `shopModel.ts` (Auswahl, Menge, Aktionen, Zeilenansicht), `shopNav.ts` (Tastenflanken und Wiederholung aus `KeyState`), `localShop.ts` (lokaler Fortschritt und "Bereit" je Spieler), `shopGuard.ts` (Prüfung der Server-Daten), `roundTime.ts` (Rundenzeit-Wahl). Die neue Phaser-Szene `ShopScene` zeichnet ein Feld je lokalem Spieler (online eines) und verbindet Modell, Eingabe und Verbindung. `GameScene`, `LobbyScene`, `MenuScene` und `onlineMenu.ts` werden für den Ablauf Runde → Rangliste → Shop → Runde verdrahtet.

**Tech Stack:** TypeScript 5.7, Phaser 3, Vitest 3, npm workspaces; Kernfunktionen aus `@pfandraiders/core`.

**Spec:** `docs/superpowers/specs/2026-10-08-serie-shop-kampf-design.md`

**Voraussetzungen:** PR #32 (`fix/police-gamepad`) ist in `master` gemergt, und Plan `docs/superpowers/plans/2026-10-08-serie-core-server.md` ist umgesetzt und gemergt (Kern und Server können Serie, Shop, Schlag, Ausrauben; der Client ist dort nur lauffähig gehalten). Alle Pfade beziehen sich auf diesen Stand.

## Global Constraints

- Alle Texte für Spieler sind deutsch, mit echten Umlauten.
- Code-Kommentare deutsch wie im bestehenden Code; Bezeichner englisch.
- Jeder Commit endet mit der Zeile `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (nach einer Leerzeile).
- `todo.md` und `idee.md` werden nie gestaged oder committet; immer `git add <pfad>` mit expliziten Pfaden.
- Kein Python; Hilfsskripte nur in TypeScript.
- Der Kern bleibt deterministisch; der Client rechnet nie Spiellogik nach, die der Kern schon hat (Kaufprüfung: `checkShopBuy`/`shopBuy` aus dem Kern).
- Snapshots bleiben eine Allow-List je Betrachter; der Client verlässt sich nur auf Felder, die für fremde Spieler freigegeben sind (`attackCooldownMs`, `robbed`, `weapon`, Position, Leben, Modus).
- Shop-Bedienung (Spec §3.3): **nur Bewegungstasten des eigenen Geräts** (hoch/runter Eintrag, links/rechts Kategorie oder Menge) und **die Aktionstaste** (kaufen bzw. "Bereit"). Keine Zahlentasten, keine weiteren Tasten. Gamepad: Stick oder Steuerkreuz und A. **Maus nur online**, lokal (einzeln und Splitscreen) keine Mausbedienung im Shop. Esc verlässt die Szene (wie überall), ist aber keine Shop-Bedienung.
- Am Ende jeder Task sind `npm test -w @pfandraiders/client` und `npm run typecheck -w @pfandraiders/client` grün; am Ende des Plans `npm test` und `npm run typecheck` im Wurzelverzeichnis.

## Namenstabelle (aus Plan 1, verbindlich)

| Ort | Name | Typ / Form |
| --- | --- | --- |
| core | `Input` | `{ moveX; moveY; action; steal; attack: boolean; eat: boolean }` |
| core | `Player` neu | `attackHeld`, `eatHeld`, `inventory: { dog_treat: number; food: number; bolt_cutters: boolean }`, `upgrades: Record<UpgradeId, number>`, `weapon: 'fist' \| 'sling' \| 'pistol'`, `attackCooldownMs`, `robbed`, `earnedRound`, `earnedTotal` |
| core | `Progress` | `Pick<Player, 'money' \| 'containerLevel' \| 'upgrades' \| 'inventory' \| 'earnedTotal'>` |
| core | Shop | `SHOP_CATEGORIES`, `SHOP_CATEGORY_NAMES`, `shopItemsOf(c)`, `ownedOf(p, item)`, `maxOf(item)`, `checkShopBuy(p, c, item, qty)`, `shopBuy(p, c, item, qty)`, `BuyRefusal`, `BuyResult`, `BUY_REFUSAL_TEXT`, `freshProgress()`, `progressOf(p)`, `noUpgrades()`, `upgradeValue(p, id)` |
| core | `CONFIG.shop.items[id]` | `{ category; name; kind: 'level' \| 'once' \| 'stack'; prices; values; available }`, `CONFIG.shop.maxStack = 99` |
| core | `CONFIG.fight` | `{ radius: 20, cooldownMs: 600, damage: 20, minDamage: 5 }` |
| core | Kampf | `findAttackTarget(state, p)`, `findLootTarget(state, p)`, `searchMsOf(p)`, `knockoutMsOf(p)` |
| core | `RankEntry` | `{ id; money; round; total }` |
| core | Protokoll | `RoomPhase = 'lobby' \| 'playing' \| 'shop'`; `RosterEntry.ready`; `ROUND_MS_CHOICES`, `DEFAULT_ROUND_MS`, `isRoundMs`; Client: `ready`, `shopBuy`, `setRoundMs`, `endSeries`; Server: `phase`, `shopState {you, ready}`, `ranking {entries}`, `lobby.roundMs`, `start.roundMs` |
| client (Plan 1) | `OnlineConnection` | `roomPhase: RoomPhase`, `setReady(ready)`, `ResultRow { place; id; name; round; total; isWinner; isViewer }` |

## Entscheidungen (Rulings)

1. **Tasten:** Tastatur 1 Schlagen `F`, Essen `C`; Tastatur 2 Schlagen `.`, Essen `,`; Gamepad Schlagen X, Essen Y. Die alten Kauftasten (1 bis 4, `,` `.` `;` `'`, X/Y/RB/LB als Kauf) entfallen. `EdgeTracker` entfällt, weil Schlagen und Essen als gehaltene Tasten gesendet werden (die Flanke macht der Kern).
2. **Links/rechts im Shop:** auf einer Zeile mit Verbrauchsgut (Leckerli, Essen) ändern links/rechts die Menge (1 bis zum freien Bestand, höchstens 99), auf allen anderen Zeilen wechseln sie die Kategorie (mit Umlauf). Hoch/runter laufen mit Umlauf über die Einträge der Kategorie, dann "Bereit", online beim Host zusätzlich "Serie beenden". Ein Zeilen- oder Kategoriewechsel setzt die Menge auf 1.
3. **Gehaltene Richtung wiederholt** nach 350 ms alle 90 ms (für Mengen bis 99). Was beim Betreten der Szene schon gedrückt ist, zählt nicht.
4. **Aktionstaste** auf einem Eintrag kauft (Menge mal Preis); auf "Bereit" schaltet sie bereit/nicht bereit um; auf "Serie beenden" beendet sie die Serie (nur online Host). Nicht kaufbare Einträge (grau) melden den Grund (`BUY_REFUSAL_TEXT`), "bald"-Einträge sind grau mit "bald".
5. **Maus online:** Klick auf eine Kategorie wählt sie, Klick auf einen Eintrag wählt ihn, Knöpfe `−`, `+`, `Kaufen`, `Bereit` (und beim Host `Serie beenden`) unten im Feld. Lokal werden keine Objekte interaktiv (`shopPointerEnabled(false) === false`).
6. **Rangliste vor dem Shop:** das Ergebnisfeld am Rundenende zeigt Platz, Name, Rundenverdienst und Gesamtverdienst; `R` oder Aktion führt in den Shop (lokal und online), Esc ins Menü (Serie endet für diesen Spieler).
7. **Lokale Serie:** `GameScene` → `ShopScene` mit `{ slots, progress, roundMs }`; sind alle lokalen Spieler bereit, startet `GameScene` mit diesem Fortschritt. Esc im Shop beendet die lokale Serie (Menü).
8. **Online im Shop:** Verbindungsabbruch führt ins Menü mit Hinweis (keine automatische Wiederverbindung in der Shop-Szene); der Server hält den Platz, und "Online spielen" tritt mit dem gespeicherten Token wieder bei und landet direkt im Shop. Beendet der Host die Serie, geht es für alle mit "Der Host hat die Serie beendet." ins Menü. Esc im Shop verlässt den Raum (`leave`).
9. **Rundenzeit:** online wählt der Host in der Lobby per Auswahlfeld (3/5/7/10 min), die anderen sehen den Wert; lokal in der Lobby mit links/rechts eines beliebigen Geräts, gespeichert im Browser (`pfandraiders.roundMs`). `?round=` bleibt als Testhilfe und hat Vorrang.
10. **Sounds:** neuer Sound `punch` beim eigenen Schlag (Abklingzeit springt hoch), `hit` statt `bite`, wenn der eigene Lebensverlust von einem Schlag kommt (fremde Abklingzeit sprang in Schlagweite hoch), Ausrauben spielt `stealSuccess` für den Räuber, Kaufen im Shop `buy`.
11. **Schlag sichtbar:** in den ersten 150 ms nach einem Schlag ist die Figur 15 % größer (`isSwinging(p)`).

## Review Focus

1. **Gehaltene Aktionstaste beim Wechsel von der Rangliste in den Shop** darf keinen Kauf auslösen (Test in Task 5: erster Frame zählt nicht).
2. **Menge über dem freien Bestand** (Bestand 97, Menge 5 gewählt): die Menge wird auf 2 begrenzt, nie mehr angeboten als kaufbar (Test in Task 4).
3. **Ungültiger `shopState` vom Server** (negatives Geld, Upgrade-Stufe 9, fehlendes Inventar): wird verworfen, der alte Stand bleibt (Test in Task 7).
4. **Splitscreen mit zwei Spielern an einer Tastatur:** jedes Feld folgt nur seinem Gerät; "Bereit" eines Spielers startet nichts, erst beide (Test in Task 6 über `LocalShop`).
5. **Online-Rückkehr während der Shop-Phase** landet im Shop, nicht in einer leeren Spielszene (Test in Task 7: `onlineMenu`-Auflösung über `shopState`; manuell in Task 10).

## Dateien

- Modify: `packages/client/src/input.ts`, `sources.ts`, `devices.ts`, `menuModel.ts` – Tasten
- Modify: `packages/client/src/text.ts`, `hud.ts` – HUD und Rangliste
- Create: `packages/client/src/roundTime.ts`; Modify: `packages/client/src/settings.ts` – Rundenzeit
- Create: `packages/client/src/shopModel.ts`, `shopNav.ts`, `localShop.ts`, `shopGuard.ts`, `fightView.ts`
- Create: `packages/client/src/scenes/ShopScene.ts`; Modify: `packages/client/src/main.ts`
- Modify: `packages/client/src/online.ts`, `onlineMenu.ts`, `scenes/GameScene.ts`, `scenes/LobbyScene.ts`, `scenes/MenuScene.ts`, `soundEvents.ts`, `sound.ts`
- Tests: `packages/client/test/` – `input.test.ts`, `sources.test.ts`, `menuModel.test.ts`, `text.test.ts`, `roundTime.test.ts` (neu), `settings.test.ts`, `shopModel.test.ts` (neu), `shopNav.test.ts` (neu), `localShop.test.ts` (neu), `shopGuard.test.ts` (neu), `online.test.ts`, `soundEvents.test.ts`, `sound.test.ts`, `fightView.test.ts` (neu)

Testbefehle: `npm test -w @pfandraiders/client`, `npm run typecheck -w @pfandraiders/client`, einzeln `cd packages/client && npx vitest run test/<datei>.test.ts`.

---

### Task 1: Tasten für Schlagen und Essen statt Kauftasten

**Files:**
- Modify: `packages/client/src/input.ts` (ganze Datei)
- Modify: `packages/client/src/sources.ts` (ganze Datei)
- Modify: `packages/client/src/devices.ts:6-51,67-113,115-160`
- Modify: `packages/client/src/menuModel.ts:39-41`
- Test: `packages/client/test/input.test.ts`, `packages/client/test/sources.test.ts`, `packages/client/test/menuModel.test.ts`, `packages/client/test/text.test.ts` (nur `KEYS`-Konstanten)

**Interfaces:**
- Consumes: `Input` aus dem Kern
- Produces: `KeyState { left; right; up; down; action; steal; attack; eat }` (alles gehalten); `KeyLabels { action; steal; attack; eat }`; `PAD_LABELS = { action: 'A', steal: 'B', attack: 'X', eat: 'Y' }`; `padToHeld(s: PadSnapshot): KeyState`; `buildInput(k: KeyState): Input`. `HeldKeys` und `EdgeTracker` entfallen.

- [ ] **Step 1: Write the failing tests**

`packages/client/test/input.test.ts` vollständig ersetzen:

```ts
import { describe, expect, it } from 'vitest';
import { buildInput } from '../src/input';
import type { KeyState } from '../src/input';

const NONE: KeyState = {
  left: false,
  right: false,
  up: false,
  down: false,
  action: false,
  steal: false,
  attack: false,
  eat: false,
};

describe('buildInput', () => {
  it('maps directions to axes', () => {
    expect(buildInput({ ...NONE, left: true })).toMatchObject({ moveX: -1, moveY: 0 });
    expect(buildInput({ ...NONE, right: true, down: true })).toMatchObject({ moveX: 1, moveY: 1 });
    expect(buildInput({ ...NONE, up: true })).toMatchObject({ moveX: 0, moveY: -1 });
  });

  it('cancels opposite keys', () => {
    expect(buildInput({ ...NONE, left: true, right: true })).toMatchObject({ moveX: 0 });
    expect(buildInput({ ...NONE, up: true, down: true })).toMatchObject({ moveY: 0 });
  });

  it('passes action, steal, attack and eat through as held keys', () => {
    expect(buildInput({ ...NONE, action: true, steal: true, attack: true, eat: true })).toEqual({
      moveX: 0,
      moveY: 0,
      action: true,
      steal: true,
      attack: true,
      eat: true,
    });
    expect(buildInput(NONE)).toEqual({ moveX: 0, moveY: 0, action: false, steal: false, attack: false, eat: false });
  });
});
```

In `packages/client/test/sources.test.ts`:
- Import auf `import { padToHeld, PAD_LABELS, STICK_DEADZONE } from '../src/sources';` und `import type { PadSnapshot } from '../src/sources';` ändern;
- die Tests `'maps buttons: A action, X upgrade, Y item'` und `'maps the shoulder buttons: RB treat, LB food'` ersetzen durch:

```ts
  it('maps buttons: A action, B steal, X attack, Y eat, shoulders do nothing', () => {
    expect(padToHeld({ ...IDLE, a: true })).toMatchObject({ action: true, attack: false, eat: false });
    expect(padToHeld({ ...IDLE, x: true })).toMatchObject({ attack: true, eat: false });
    expect(padToHeld({ ...IDLE, y: true })).toMatchObject({ eat: true, attack: false });
    expect(padToHeld({ ...IDLE, l1: true, r1: true })).toEqual(padToHeld(IDLE));
  });

  it('labels the pad buttons like padToHeld maps them', () => {
    expect(PAD_LABELS).toEqual({ action: 'A', steal: 'B', attack: 'X', eat: 'Y' });
  });
```

- den ganzen Block `describe('EdgeTracker', …)` löschen.

In `packages/client/test/menuModel.test.ts` im Block `describe('controlLines'` ergänzen:

```ts
  it('names steal, attack and eat and no buy keys', () => {
    expect(lines[0]).toBe('Tastatur 1 (WASD, E): Aktion E, Klauen Q, Schlagen F, Essen C');
    expect(lines[1]).toBe('Tastatur 2 (Pfeile, Enter): Aktion Enter, Klauen /, Schlagen ., Essen ,');
    expect(lines[2]).toBe('Gamepad (Stick/Steuerkreuz): Aktion A, Klauen B, Schlagen X, Essen Y');
  });
```

In `packages/client/test/text.test.ts` die beiden Konstanten ersetzen:

```ts
const KEYS: KeyLabels = { action: 'E', steal: 'Q', attack: 'F', eat: 'C' };
const KEYS2: KeyLabels = { action: 'Enter', steal: '/', attack: '.', eat: ',' };
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/client && npx vitest run test/input.test.ts test/sources.test.ts test/menuModel.test.ts`
Expected: FAIL (`attack`/`eat` fehlen, Beschriftungen nennen Kauftasten).

- [ ] **Step 3: Write the implementation**

`packages/client/src/input.ts`:

```ts
import type { Input } from '@pfandraiders/core';

/** Tastenzustand eines Geräts in einem Frame. Alles gehalten; Flanken (Klauen, Schlagen, Essen) erkennt der Kern. */
export interface KeyState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  action: boolean;
  /** Klauen-Taste gehalten */
  steal: boolean;
  /** Schlagen-Taste gehalten */
  attack: boolean;
  /** Essen-Taste gehalten */
  eat: boolean;
}

function axis(negative: boolean, positive: boolean): -1 | 0 | 1 {
  return ((positive ? 1 : 0) - (negative ? 1 : 0)) as -1 | 0 | 1;
}

export function buildInput(k: KeyState): Input {
  return {
    moveX: axis(k.left, k.right),
    moveY: axis(k.up, k.down),
    action: k.action,
    steal: k.steal,
    attack: k.attack,
    eat: k.eat,
  };
}
```

`packages/client/src/sources.ts`:

```ts
import type { DeviceRef } from './devices';
import type { KeyState } from './input';

/** Beschriftung der Tasten eines Geräts für Hinweistexte. */
export interface KeyLabels {
  action: string;
  steal: string;
  attack: string;
  eat: string;
}

/** Beschriftung der Gamepad-Tasten, passend zu padToHeld. */
export const PAD_LABELS: KeyLabels = { action: 'A', steal: 'B', attack: 'X', eat: 'Y' };

/** Ein Gerät, das einem Spieler gehört. Phaser-Anbindung steht in devices.ts. */
export interface InputSource {
  readonly label: string;
  readonly labels: KeyLabels;
  /** Eingabe dieses Frames (alles gehalten). */
  read(): KeyState;
  /** Wurde die Bestätigungstaste in diesem Frame neu gedrückt (Neustart nach Rundenende)? */
  confirmPressed(): boolean;
}

export interface PadSnapshot {
  stickX: number;
  stickY: number;
  a: boolean;
  x: boolean;
  y: boolean;
  b: boolean;
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  l1: boolean;
  r1: boolean;
}

/** Sticks unterhalb dieses Betrags zählen als in Ruhe. */
export const STICK_DEADZONE = 0.4;

/** A = Aktion, B = Klauen, X = Schlagen, Y = Essen. Stick und Steuerkreuz laufen. Schultertasten sind frei. */
export function padToHeld(s: PadSnapshot): KeyState {
  return {
    left: s.left || s.stickX < -STICK_DEADZONE,
    right: s.right || s.stickX > STICK_DEADZONE,
    up: s.up || s.stickY < -STICK_DEADZONE,
    down: s.down || s.stickY > STICK_DEADZONE,
    action: s.a,
    steal: s.b,
    attack: s.x,
    eat: s.y,
  };
}

/**
 * Zählt ein neu gedrücktes Gamepad-B (`pressed`: Indizes der Pads mit neuem B-Druck) als "zurück ins Menü"?
 * Lokal jedes Pad. Online nur das gewählte Gerät, damit ein fremdes oder liegendes Pad nicht versehentlich hinauswirft.
 */
export function padBLeaves(online: boolean, device: DeviceRef | undefined, pressed: ReadonlySet<number>): boolean {
  if (!online) return pressed.size > 0;
  return device?.kind === 'pad' && pressed.has(device.index);
}
```

`packages/client/src/devices.ts`:
- Import-Zeile 3 wird `import { PAD_LABELS, padToHeld } from './sources';`.
- `KeyboardLayout`: die Felder `buyUpgrade`, `buyItem`, `buyTreat`, `buyFood` durch `attack: string;` und `eat: string;` ersetzen.
- `KEYBOARD_LAYOUTS`:

```ts
export const KEYBOARD_LAYOUTS: KeyboardLayout[] = [
  {
    name: 'Tastatur 1 (WASD, E)',
    left: 'A',
    right: 'D',
    up: 'W',
    down: 'S',
    action: 'E',
    steal: 'Q',
    attack: 'F',
    eat: 'C',
    labels: { action: 'E', steal: 'Q', attack: 'F', eat: 'C' },
  },
  {
    name: 'Tastatur 2 (Pfeile, Enter)',
    left: 'LEFT',
    right: 'RIGHT',
    up: 'UP',
    down: 'DOWN',
    action: 'ENTER',
    steal: 'FORWARD_SLASH',
    attack: 'PERIOD',
    eat: 'COMMA',
    labels: { action: 'Enter', steal: '/', attack: '.', eat: ',' },
  },
];
```

- In `KeyboardSource` die Namensliste ersetzen durch `const names = [layout.left, layout.right, layout.up, layout.down, layout.action, layout.steal, layout.attack, layout.eat];` und `read()` durch:

```ts
  read(): KeyState {
    const l = this.layout;
    const k = this.keys;
    return {
      left: k[l.left].isDown,
      right: k[l.right].isDown,
      up: k[l.up].isDown,
      down: k[l.down].isDown,
      action: k[l.action].isDown,
      steal: k[l.steal].isDown,
      attack: k[l.attack].isDown,
      eat: k[l.eat].isDown,
    };
  }
```

- In `GamepadSource` das Feld `private readonly edges = new EdgeTracker();` löschen; `read()` gibt `padToHeld(IDLE_PAD)` bzw. `padToHeld({ … })` direkt zurück (ohne `this.edges.apply(…)`).

`packages/client/src/menuModel.ts`, in `controlLines`:

```ts
  const fmt = (l: KeyLabels): string => `Aktion ${l.action}, Klauen ${l.steal}, Schlagen ${l.attack}, Essen ${l.eat}`;
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test -w @pfandraiders/client && npm run typecheck -w @pfandraiders/client`
Expected: PASS (seit Plan 1 nutzt `text.ts` nur noch `labels.action` und `labels.steal`).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/input.ts packages/client/src/sources.ts packages/client/src/devices.ts packages/client/src/menuModel.ts packages/client/test/input.test.ts packages/client/test/sources.test.ts packages/client/test/menuModel.test.ts packages/client/test/text.test.ts
git commit -m "feat(client): Tasten für Schlagen und Essen statt Kauftasten

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: HUD mit Inventar, Kampfhinweisen und Rangliste der Serie

**Files:**
- Modify: `packages/client/src/text.ts` (`statusLines`, `hintLines`, `alertText`, `resultFooter`)
- Modify: `packages/client/src/hud.ts` (`ResultsPanel.show`)
- Test: `packages/client/test/text.test.ts`

**Interfaces:**
- Consumes: `findAttackTarget`, `findLootTarget`, `CONFIG.health.food.heal`, `KeyLabels` (Task 1), `ResultRow` (Plan 1)
- Produces: `statusLines(state, p)` dritte Zeile `Leben N/100` plus Inventar; `hintLines` mit `[Q] Ausrauben`, `[F] Schlagen`, `[C] Essen …`; `alertText` mit "(ausgeraubt)"; `resultFooter(role, labels)` = `['Weiter zum Shop: R oder <Aktion>', 'Menü: Esc']` für alle Rollen; `resultHeader(): string`.

- [ ] **Step 1: Write the failing tests**

An `packages/client/test/text.test.ts` anhängen (`resultHeader` zum Import aus `'../src/text'` hinzufügen):

```ts
describe('inventory and fight hints', () => {
  function duo(): GameState {
    return createGame(1, parseMap(['#######', '#@@...#', '#######']), ['p1', 'p2']);
  }

  it('shows the inventory after the health', () => {
    const s = duo();
    s.players.p1.inventory = { dog_treat: 2, food: 3, bolt_cutters: true };
    expect(statusLines(s, s.players.p1)[2]).toBe('Leben 100/100   Essen 3   Leckerli 2   Bolzenschneider');
  });

  it('shows only the health without inventory', () => {
    const s = duo();
    expect(statusLines(s, s.players.p1)[2]).toBe('Leben 100/100');
  });

  it('offers punching an awake player in reach, but not during the cooldown', () => {
    const s = duo();
    expect(hintLines(s, s.players.p1, KEYS)).toContain('[F] Schlagen');
    s.players.p1.attackCooldownMs = 300;
    expect(hintLines(s, s.players.p1, KEYS)).not.toContain('[F] Schlagen');
  });

  it('offers robbing a knocked-out player who was not robbed yet', () => {
    const s = duo();
    s.players.p2.bottles = { plastic: 2, glass: 0, crate: 0 };
    s.players.p2.unconsciousMs = 5000;
    s.players.p2.health = 0;
    expect(hintLines(s, s.players.p1, KEYS)).toContain('[Q] Ausrauben');
    expect(hintLines(s, s.players.p1, KEYS)).not.toContain('[F] Schlagen');
    s.players.p2.robbed = true;
    expect(hintLines(s, s.players.p1, KEYS)).not.toContain('[Q] Ausrauben');
  });

  it('offers eating when food is there and a portion would not be wasted', () => {
    const s = duo();
    s.players.p1.inventory.food = 2;
    s.players.p1.health = 100 - CONFIG.health.food.heal;
    expect(hintLines(s, s.players.p1, KEYS)).toContain('[C] Essen (+30 Leben, noch 2)');
    s.players.p1.health = 100 - CONFIG.health.food.heal + 1;
    expect(hintLines(s, s.players.p1, KEYS).some((l) => l.includes('Essen'))).toBe(false);
  });

  it('tells an unconscious player that he was robbed', () => {
    const s = duo();
    s.players.p1.unconsciousMs = 4200;
    s.players.p1.robbed = true;
    expect(alertText(s, s.players.p1).split('\n')[0]).toBe('Bewusstlos! Noch 5 s (ausgeraubt)');
  });
});

describe('series ranking texts', () => {
  it('has a header with round and total earnings', () => {
    expect(resultHeader()).toBe('Platz  Name              Runde     Gesamt');
  });
});
```

`describe('resultFooter')` ersetzen:

```ts
describe('resultFooter', () => {
  it('leads to the shop for every role', () => {
    for (const role of ['local', 'host', 'guest'] as const) {
      expect(resultFooter(role, KEYS)).toEqual(['Weiter zum Shop: R oder E', 'Menü: Esc']);
    }
  });
});
```

In `'lists players by round earnings with places'` die letzte erwartete Zeile `'Neue Runde: R oder E'` durch `'Weiter zum Shop: R oder E'` ersetzen und in `'names the action key in the last results line'` `'Neue Runde: R oder Enter'` durch `'Weiter zum Shop: R oder Enter'`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/client && npx vitest run test/text.test.ts`
Expected: FAIL (Inventar nicht angezeigt, `resultHeader` fehlt).

- [ ] **Step 3: Write the implementation**

`packages/client/src/text.ts`:
- Kern-Imports um `findAttackTarget` und `findLootTarget` ergänzen.
- Neue Hilfsfunktion und `statusLines`:

```ts
/** Inventar als kurze Teile, nur was vorhanden ist. */
function inventoryParts(p: Player): string[] {
  const parts: string[] = [];
  if (p.inventory.food > 0) parts.push(`Essen ${p.inventory.food}`);
  if (p.inventory.dog_treat > 0) parts.push(`Leckerli ${p.inventory.dog_treat}`);
  if (p.inventory.bolt_cutters) parts.push('Bolzenschneider');
  return parts;
}

export function statusLines(state: GameState, p: Player): string[] {
  const lines = [
    `Zeit ${formatTime(state.timeLeftMs)}   Geld ${formatMoney(p.money)}`,
    `${containerOf(p).name} ${totalBottles(p.bottles)}/${capacityOf(p)}` +
      `   Pl${p.bottles.plastic} Gl${p.bottles.glass} Ka${p.bottles.crate}`,
  ];
  lines.push([`Leben ${Math.ceil(p.health)}/${CONFIG.health.max}`, ...inventoryParts(p)].join('   '));
  return lines;
}
```

- In `hintLines` nach dem Such-Hinweis und vor dem Klau-Hinweis einfügen:

```ts
  if (!full && findLootTarget(state, p)) lines.push(`[${labels.steal}] Ausrauben`);
```

und ganz am Ende vor `return lines;`:

```ts
  if (p.attackCooldownMs === 0 && findAttackTarget(state, p)) lines.push(`[${labels.attack}] Schlagen`);
  const food = p.inventory.food;
  if (food > 0 && p.health <= CONFIG.health.max - CONFIG.health.food.heal) {
    lines.push(`[${labels.eat}] Essen (+${CONFIG.health.food.heal} Leben, noch ${food})`);
  }
```

- In `alertText` die Zeile für Bewusstlose ersetzen:

```ts
  if (p.unconsciousMs > 0) {
    lines.push(`Bewusstlos! Noch ${Math.ceil(p.unconsciousMs / 1000)} s${p.robbed ? ' (ausgeraubt)' : ''}`);
  }
```

- `resultLines`: letzte Zeile `` `Neue Runde: R oder ${labels.action}` `` wird `` `Weiter zum Shop: R oder ${labels.action}` ``.
- `resultFooter` und neu `resultHeader`:

```ts
/** Kopfzeile des Ergebnisfelds (Spalten wie in hud.ts). */
export function resultHeader(): string {
  return 'Platz  Name              Runde     Gesamt';
}

/** Fußzeile am Rundenende: in der Serie geht es für alle in den Shop. */
export function resultFooter(_role: 'local' | 'host' | 'guest', labels: KeyLabels): string[] {
  return [`Weiter zum Shop: R oder ${labels.action}`, 'Menü: Esc'];
}
```

`packages/client/src/hud.ts`, `ResultsPanel`:
- Import `resultHeader` aus `./text`.
- Neues Feld `private readonly header: Phaser.GameObjects.Text;`, im Konstruktor nach `this.title`:

```ts
    this.header = scene.add
      .text(0, 0, resultHeader(), { ...FONT, fontSize: '13px', color: '#aaaaaa' })
      .setOrigin(0, 0);
```

und `this.objects = [this.bg, this.title, this.header, ...this.rows, this.footer];`.
- `TITLE_H` von `36` auf `54` erhöhen (Platz für die Kopfzeile).
- In `show`: `this.header.setPosition(left, top + PANEL_PAD + 34).setVisible(true);` und die Zeilen formatieren:

```ts
      const mark = (row.isWinner ? '★' : ' ') + (row.isViewer ? '>' : ' ');
      const place = `${mark}${row.place}.`.padEnd(7);
      const name = row.name.padEnd(17);
      t.setText(`${place}${name}${formatMoney(row.round).padStart(9)}  ${formatMoney(row.total).padStart(9)}`);
```

- `PANEL_MAX_W` von `360` auf `440` erhöhen, damit die vier Spalten passen.

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test -w @pfandraiders/client && npm run typecheck -w @pfandraiders/client`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/text.ts packages/client/src/hud.ts packages/client/test/text.test.ts
git commit -m "feat(client): HUD mit Inventar, Kampfhinweisen und Serien-Rangliste

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Rundenzeit-Wahl (Helfer und Einstellung)

**Files:**
- Create: `packages/client/src/roundTime.ts`
- Modify: `packages/client/src/settings.ts` (am Ende anhängen)
- Test: Create `packages/client/test/roundTime.test.ts`; Modify `packages/client/test/settings.test.ts`

**Interfaces:**
- Consumes: `ROUND_MS_CHOICES`, `DEFAULT_ROUND_MS`, `isRoundMs`
- Produces: `roundMsLabel(ms: number): string`; `stepRoundMs(ms: number, dir: -1 | 1): number`; `loadLocalRoundMs(store?): number`; `saveLocalRoundMs(ms: number, store?): void`.

- [ ] **Step 1: Write the failing tests**

Create `packages/client/test/roundTime.test.ts`:

```ts
import { DEFAULT_ROUND_MS } from '@pfandraiders/core';
import { describe, expect, it } from 'vitest';
import { roundMsLabel, stepRoundMs } from '../src/roundTime';

describe('roundMsLabel', () => {
  it('shows whole minutes and other values in seconds', () => {
    expect(roundMsLabel(180_000)).toBe('3 min');
    expect(roundMsLabel(600_000)).toBe('10 min');
    expect(roundMsLabel(20_000)).toBe('20 s');
  });
});

describe('stepRoundMs', () => {
  it('walks through 3, 5, 7, 10 minutes without wrapping', () => {
    expect(stepRoundMs(300_000, 1)).toBe(420_000);
    expect(stepRoundMs(420_000, 1)).toBe(600_000);
    expect(stepRoundMs(600_000, 1)).toBe(600_000);
    expect(stepRoundMs(300_000, -1)).toBe(180_000);
    expect(stepRoundMs(180_000, -1)).toBe(180_000);
  });

  it('starts from the default for an unknown value', () => {
    expect(stepRoundMs(12_345, 1)).toBe(420_000);
    expect(stepRoundMs(Number.NaN, -1)).toBe(180_000);
    expect(DEFAULT_ROUND_MS).toBe(300_000);
  });
});
```

An `packages/client/test/settings.test.ts` anhängen (Imports `loadLocalRoundMs`, `saveLocalRoundMs` aus `'../src/settings'` ergänzen):

```ts
describe('local round time', () => {
  function memory(): KeyValueStore & { data: Map<string, string> } {
    const data = new Map<string, string>();
    return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
  }

  it('defaults to five minutes and remembers an allowed choice', () => {
    const store = memory();
    expect(loadLocalRoundMs(store)).toBe(300_000);
    saveLocalRoundMs(420_000, store);
    expect(loadLocalRoundMs(store)).toBe(420_000);
  });

  it('ignores stored values that are not allowed and never throws', () => {
    const store = memory();
    store.data.set('pfandraiders.roundMs', '123');
    expect(loadLocalRoundMs(store)).toBe(300_000);
    saveLocalRoundMs(999, store);
    expect(store.data.get('pfandraiders.roundMs')).toBe('123');
    const broken: KeyValueStore = {
      getItem: () => {
        throw new Error('gesperrt');
      },
      setItem: () => {
        throw new Error('gesperrt');
      },
    };
    expect(loadLocalRoundMs(broken)).toBe(300_000);
    expect(() => saveLocalRoundMs(300_000, broken)).not.toThrow();
  });
});
```

(`KeyValueStore` als Typ aus `'../src/settings'` importieren, falls noch nicht.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/client && npx vitest run test/roundTime.test.ts test/settings.test.ts`
Expected: FAIL ("Failed to resolve import ../src/roundTime", `loadLocalRoundMs` fehlt).

- [ ] **Step 3: Write the implementation**

Create `packages/client/src/roundTime.ts`:

```ts
import { DEFAULT_ROUND_MS, ROUND_MS_CHOICES } from '@pfandraiders/core';

/** "3 min", "10 min"; andere Werte (ROUND_MS zum Testen) in Sekunden. */
export function roundMsLabel(ms: number): string {
  return ms % 60_000 === 0 ? `${ms / 60_000} min` : `${Math.round(ms / 1000)} s`;
}

/** Nächste bzw. vorige erlaubte Rundenzeit, ohne Umlauf; unbekannte Werte gehen vom Standard aus. */
export function stepRoundMs(ms: number, dir: -1 | 1): number {
  const i = ROUND_MS_CHOICES.indexOf(ms);
  const from = i >= 0 ? i : ROUND_MS_CHOICES.indexOf(DEFAULT_ROUND_MS);
  const to = Math.min(ROUND_MS_CHOICES.length - 1, Math.max(0, from + dir));
  return ROUND_MS_CHOICES[to];
}
```

An `packages/client/src/settings.ts` anhängen (Import `import { DEFAULT_ROUND_MS, isRoundMs } from '@pfandraiders/core';` oben ergänzen):

```ts
// ---- Rundenzeit lokal ----

const LOCAL_ROUND_KEY = 'pfandraiders.roundMs';

/** Rundenzeit der lokalen Lobby (3, 5, 7 oder 10 min). Wirft nie; Unbekanntes ergibt 5 min. */
export function loadLocalRoundMs(store: KeyValueStore | undefined = defaultStore()): number {
  try {
    const n = Number(store?.getItem(LOCAL_ROUND_KEY));
    return isRoundMs(n) ? n : DEFAULT_ROUND_MS;
  } catch {
    return DEFAULT_ROUND_MS;
  }
}

export function saveLocalRoundMs(ms: number, store: KeyValueStore | undefined = defaultStore()): void {
  if (!isRoundMs(ms)) return;
  try {
    store?.setItem(LOCAL_ROUND_KEY, String(ms));
  } catch {
    // Speicher gesperrt: Wahl gilt nur für diese Sitzung
  }
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test -w @pfandraiders/client && npm run typecheck -w @pfandraiders/client`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/roundTime.ts packages/client/src/settings.ts packages/client/test/roundTime.test.ts packages/client/test/settings.test.ts
git commit -m "feat(client): Rundenzeit wählen und lokal merken

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Reines Shop-Modell

**Files:**
- Create: `packages/client/src/shopModel.ts`
- Test: Create `packages/client/test/shopModel.test.ts`

**Interfaces:**
- Consumes: `SHOP_CATEGORIES`, `SHOP_CATEGORY_NAMES`, `shopItemsOf`, `ownedOf`, `maxOf`, `checkShopBuy`, `CONFIG`, `Progress`, `ShopCategory`, `ShopItemId`, `BuyRefusal`, `formatMoney`
- Produces:
  - `type ShopDir = 'up' | 'down' | 'left' | 'right'`
  - `type ShopAction = { kind: 'buy'; category: ShopCategory; item: ShopItemId; qty: number } | { kind: 'refused'; reason: BuyRefusal } | { kind: 'ready'; ready: boolean } | { kind: 'endSeries' }`
  - `interface ShopRowView { kind: 'item' | 'ready' | 'end'; item: ShopItemId | null; name: string; detail: string; price: string; state: 'normal' | 'grey' | 'soon'; selected: boolean }`
  - `interface ShopCategoryView { category: ShopCategory; name: string; selected: boolean }`
  - `class ShopModel { constructor(opts?: { canEndSeries?: boolean }); categoryIndex; row; qty; ready; get category(): ShopCategory; rowCount(): number; categories(): ShopCategoryView[]; rows(p: Progress): ShopRowView[]; move(dir: ShopDir, p: Progress): void; activate(p: Progress): ShopAction | null; buyAction(p: Progress): ShopAction | null; toggleReady(): ShopAction; setReady(ready: boolean): void; selectCategory(i: number): void; selectRow(i: number): void; changeQty(delta: number, p: Progress): void; maxQty(p: Progress): number }`
  - `shopPointerEnabled(online: boolean): boolean`

- [ ] **Step 1: Write the failing test**

Create `packages/client/test/shopModel.test.ts`:

```ts
import { freshProgress } from '@pfandraiders/core';
import type { Progress } from '@pfandraiders/core';
import { describe, expect, it } from 'vitest';
import { ShopModel, shopPointerEnabled } from '../src/shopModel';

function rich(money = 100_000): Progress {
  return { ...freshProgress(), money };
}

describe('ShopModel navigation', () => {
  it('starts in Taschen on the first entry with quantity 1 and not ready', () => {
    const m = new ShopModel();
    expect(m.category).toBe('bags');
    expect(m.row).toBe(0);
    expect(m.qty).toBe(1);
    expect(m.ready).toBe(false);
    expect(m.categories().map((c) => c.name)).toEqual(['Taschen', 'Upgrades', 'Angriff', 'Verteidigung']);
  });

  it('switches the category with left and right and wraps around', () => {
    const m = new ShopModel();
    const p = rich();
    m.move('right', p);
    m.move('right', p);
    expect(m.category).toBe('attack');
    m.move('left', p);
    m.move('left', p);
    expect(m.category).toBe('bags');
    m.move('left', p); // Umlauf nach links
    expect(m.category).toBe('defense');
    expect(m.row).toBe(0);
  });

  it('moves up and down over the entries and Bereit, with wrap-around', () => {
    const m = new ShopModel();
    const p = rich();
    m.move('right', p); // Upgrades: knockout, speed, search, Bereit
    expect(m.rowCount()).toBe(4);
    m.move('up', p);
    expect(m.rows(p)[m.row].kind).toBe('ready');
    m.move('down', p);
    expect(m.row).toBe(0);
  });

  it('has an extra row to end the series only when allowed', () => {
    const host = new ShopModel({ canEndSeries: true });
    expect(host.rows(rich()).map((r) => r.kind)).toEqual(['item', 'ready', 'end']);
    expect(new ShopModel().rows(rich()).map((r) => r.kind)).toEqual(['item', 'ready']);
  });

  it('changes the quantity with left and right on a consumable row, otherwise the category', () => {
    const m = new ShopModel();
    const p = rich();
    m.selectCategory(3); // Verteidigung: Leckerli, Essen, Rüstung
    m.selectRow(1); // Essen
    m.move('right', p);
    m.move('right', p);
    expect(m.qty).toBe(3);
    m.move('left', p);
    expect(m.qty).toBe(2);
    expect(m.category).toBe('defense');
    m.move('down', p); // Rüstung
    expect(m.qty).toBe(1);
    m.move('right', p);
    expect(m.category).toBe('bags');
  });

  it('never goes below 1 or above the free stock (max 99)', () => {
    const m = new ShopModel();
    const p = rich();
    p.inventory.food = 97;
    m.selectCategory(3);
    m.selectRow(1);
    m.move('left', p);
    expect(m.qty).toBe(1);
    for (let i = 0; i < 10; i++) m.move('right', p);
    expect(m.qty).toBe(2);
    expect(m.maxQty(p)).toBe(2);
    m.changeQty(50, p);
    expect(m.qty).toBe(2);
  });

  it('ignores mouse selections out of range', () => {
    const m = new ShopModel();
    m.selectCategory(9);
    m.selectRow(-1);
    m.selectRow(99);
    expect(m.category).toBe('bags');
    expect(m.row).toBe(0);
  });
});

describe('ShopModel actions', () => {
  it('buys the selected entry with the chosen quantity and resets the quantity', () => {
    const m = new ShopModel();
    const p = rich();
    m.selectCategory(3);
    m.selectRow(1);
    m.changeQty(4, p);
    expect(m.activate(p)).toEqual({ kind: 'buy', category: 'defense', item: 'food', qty: 5 });
    expect(m.qty).toBe(1);
  });

  it('reports why an entry cannot be bought instead of buying', () => {
    const m = new ShopModel();
    expect(m.activate(rich(10))).toEqual({ kind: 'refused', reason: 'no_money' });
    m.selectCategory(2);
    m.selectRow(2); // Steinschleuder
    expect(m.activate(rich())).toEqual({ kind: 'refused', reason: 'unavailable' });
  });

  it('toggles ready on the Bereit row and ends the series on its row', () => {
    const m = new ShopModel({ canEndSeries: true });
    const p = rich();
    m.selectRow(1);
    expect(m.activate(p)).toEqual({ kind: 'ready', ready: true });
    expect(m.ready).toBe(true);
    expect(m.activate(p)).toEqual({ kind: 'ready', ready: false });
    m.selectRow(2);
    expect(m.activate(p)).toEqual({ kind: 'endSeries' });
  });

  it('offers a buy button action only on an entry row', () => {
    const m = new ShopModel();
    const p = rich();
    expect(m.buyAction(p)).toEqual({ kind: 'buy', category: 'bags', item: 'bag', qty: 1 });
    m.selectRow(1);
    expect(m.buyAction(p)).toBeNull();
    expect(m.toggleReady()).toEqual({ kind: 'ready', ready: true });
  });

  it('takes the ready state from outside (server)', () => {
    const m = new ShopModel();
    m.setReady(true);
    expect(m.ready).toBe(true);
  });
});

describe('ShopModel rows', () => {
  it('describes the next bag, greys it without money and says when it is fully upgraded', () => {
    const m = new ShopModel();
    const p = rich(100);
    expect(m.rows(p)[0]).toMatchObject({ name: 'Tasche', detail: '8 Plätze', price: '1,50 €', state: 'grey', selected: true });
    p.money = 1000;
    expect(m.rows(p)[0].state).toBe('normal');
    p.containerLevel = 3;
    expect(m.rows(p)[0]).toMatchObject({ name: 'Einkaufswagen', detail: 'voll ausgebaut', price: '', state: 'grey' });
  });

  it('describes leveled upgrades with their next effect', () => {
    const m = new ShopModel();
    const p = rich();
    m.selectCategory(1);
    const rows = m.rows(p);
    expect(rows[0]).toMatchObject({ name: 'Knockout kürzer', detail: 'Stufe 0 → 1: 15 s', price: '2,00 €' });
    p.upgrades.knockout = 3;
    expect(m.rows(p)[0]).toMatchObject({ detail: 'Stufe 3 (max)', price: '', state: 'grey' });
  });

  it('shows ranged weapons grey with "bald"', () => {
    const m = new ShopModel();
    m.selectCategory(2);
    const rows = m.rows(rich());
    expect(rows[2]).toMatchObject({ name: 'Steinschleuder', detail: 'bald', price: '', state: 'soon' });
    expect(rows[3]).toMatchObject({ name: 'Pistole', state: 'soon' });
  });

  it('shows quantity and total only on the selected consumable row', () => {
    const m = new ShopModel();
    const p = rich();
    p.inventory.dog_treat = 4;
    m.selectCategory(3);
    m.selectRow(0);
    m.changeQty(2, p);
    const rows = m.rows(p);
    expect(rows[0]).toMatchObject({ name: 'Leckerli', detail: '◄ 3 ►  (hast 4)', price: '3,00 €' });
    expect(rows[1]).toMatchObject({ name: 'Essen', detail: '(hast 0)', price: '1,00 €' });
  });

  it('labels Bereit by state', () => {
    const m = new ShopModel();
    m.setReady(true);
    expect(m.rows(rich()).at(-1)).toMatchObject({ kind: 'ready', name: 'Bereit ✓ (nochmal: zurücknehmen)' });
  });
});

describe('shopPointerEnabled', () => {
  it('is on only online', () => {
    expect(shopPointerEnabled(true)).toBe(true);
    expect(shopPointerEnabled(false)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/client && npx vitest run test/shopModel.test.ts`
Expected: FAIL ("Failed to resolve import ../src/shopModel").

- [ ] **Step 3: Write the implementation**

Create `packages/client/src/shopModel.ts`:

```ts
import { checkShopBuy, CONFIG, maxOf, ownedOf, SHOP_CATEGORIES, SHOP_CATEGORY_NAMES, shopItemsOf } from '@pfandraiders/core';
import type { BuyRefusal, Progress, ShopCategory, ShopItemId } from '@pfandraiders/core';
import { formatMoney } from './format';

export type ShopDir = 'up' | 'down' | 'left' | 'right';

export type ShopAction =
  | { kind: 'buy'; category: ShopCategory; item: ShopItemId; qty: number }
  | { kind: 'refused'; reason: BuyRefusal }
  | { kind: 'ready'; ready: boolean }
  | { kind: 'endSeries' };

export interface ShopRowView {
  kind: 'item' | 'ready' | 'end';
  item: ShopItemId | null;
  name: string;
  detail: string;
  /** Preis der gewählten Menge, leer wenn nichts zu kaufen ist */
  price: string;
  /** grey = nicht kaufbar (Geld, Stufe, Besitz), soon = noch nicht im Spiel ("bald") */
  state: 'normal' | 'grey' | 'soon';
  selected: boolean;
}

export interface ShopCategoryView {
  category: ShopCategory;
  name: string;
  selected: boolean;
}

/** Maus im Shop nur online (Spec §3.3); lokal bleibt alles bei den Bewegungstasten. */
export function shopPointerEnabled(online: boolean): boolean {
  return online;
}

/** Wirkung einer Upgrade-Stufe als kurzer Text. */
function effectText(item: ShopItemId, level: number): string {
  const v = CONFIG.shop.items[item].values[level];
  switch (item) {
    case 'knockout':
      return `${v / 1000} s`;
    case 'speed':
      return `+${Math.round((v - 1) * 100)} % Tempo`;
    case 'search':
      return `−${Math.round((1 - v) * 100)} % Suchzeit`;
    case 'punch':
      return `+${v} Schaden`;
    case 'armor':
      return `−${v} Schaden`;
    default:
      return '';
  }
}

/**
 * Auswahl im Shop eines Spielers. Rein, ohne Phaser: Kategorie, Zeile, Menge und "bereit".
 * Zeilen: Einträge der Kategorie, dann "Bereit", optional "Serie beenden".
 */
export class ShopModel {
  categoryIndex = 0;
  row = 0;
  qty = 1;
  ready = false;
  private readonly canEndSeries: boolean;

  constructor(opts: { canEndSeries?: boolean } = {}) {
    this.canEndSeries = opts.canEndSeries ?? false;
  }

  get category(): ShopCategory {
    return SHOP_CATEGORIES[this.categoryIndex];
  }

  private items(): ShopItemId[] {
    return shopItemsOf(this.category);
  }

  rowCount(): number {
    return this.items().length + 1 + (this.canEndSeries ? 1 : 0);
  }

  /** Eintrag der aktuellen Zeile oder null ("Bereit", "Serie beenden"). */
  private currentItem(): ShopItemId | null {
    return this.items()[this.row] ?? null;
  }

  private rowKind(i: number): ShopRowView['kind'] {
    const n = this.items().length;
    return i < n ? 'item' : i === n ? 'ready' : 'end';
  }

  categories(): ShopCategoryView[] {
    return SHOP_CATEGORIES.map((c, i) => ({ category: c, name: SHOP_CATEGORY_NAMES[c], selected: i === this.categoryIndex }));
  }

  /** Größte wählbare Menge auf der aktuellen Zeile: freier Bestand eines Verbrauchsguts, sonst 1. */
  maxQty(p: Progress): number {
    const item = this.currentItem();
    if (!item || CONFIG.shop.items[item].kind !== 'stack') return 1;
    return Math.max(1, maxOf(item) - ownedOf(p, item));
  }

  private onStackRow(): boolean {
    const item = this.currentItem();
    return item !== null && CONFIG.shop.items[item].kind === 'stack';
  }

  move(dir: ShopDir, p: Progress): void {
    if (dir === 'up' || dir === 'down') {
      const n = this.rowCount();
      this.row = (this.row + (dir === 'down' ? 1 : -1) + n) % n;
      this.qty = 1;
      return;
    }
    const d = dir === 'right' ? 1 : -1;
    if (this.onStackRow()) {
      this.changeQty(d, p);
      return;
    }
    const n = SHOP_CATEGORIES.length;
    this.selectCategory((this.categoryIndex + d + n) % n);
  }

  /** Maus und Tastatur: Kategorie wählen (erste Zeile, Menge 1). Außerhalb des Bereichs wirkungslos. */
  selectCategory(i: number): void {
    if (!Number.isInteger(i) || i < 0 || i >= SHOP_CATEGORIES.length) return;
    this.categoryIndex = i;
    this.row = 0;
    this.qty = 1;
  }

  /** Maus: Zeile wählen. Außerhalb des Bereichs wirkungslos. */
  selectRow(i: number): void {
    if (!Number.isInteger(i) || i < 0 || i >= this.rowCount()) return;
    if (i !== this.row) this.qty = 1;
    this.row = i;
  }

  /** Menge ändern, begrenzt auf 1 bis maxQty. */
  changeQty(delta: number, p: Progress): void {
    if (!this.onStackRow() || !Number.isFinite(delta)) return;
    this.qty = Math.min(this.maxQty(p), Math.max(1, Math.round(this.qty + delta)));
  }

  /** Kauf der aktuellen Zeile (Knopf "Kaufen"); null, wenn die Zeile kein Eintrag ist. */
  buyAction(p: Progress): ShopAction | null {
    const item = this.currentItem();
    if (!item) return null;
    const qty = Math.min(this.qty, this.maxQty(p));
    const check = checkShopBuy(p, this.category, item, qty);
    if (!check.ok) return { kind: 'refused', reason: check.reason };
    this.qty = 1;
    return { kind: 'buy', category: this.category, item, qty };
  }

  /** "Bereit" umschalten (Knopf oder Zeile). */
  toggleReady(): ShopAction {
    this.ready = !this.ready;
    return { kind: 'ready', ready: this.ready };
  }

  /** Stand vom Server oder vom lokalen Shop übernehmen. */
  setReady(ready: boolean): void {
    this.ready = ready;
  }

  /** Aktionstaste auf der aktuellen Zeile. */
  activate(p: Progress): ShopAction | null {
    const kind = this.rowKind(this.row);
    if (kind === 'item') return this.buyAction(p);
    if (kind === 'ready') return this.toggleReady();
    return { kind: 'endSeries' };
  }

  rows(p: Progress): ShopRowView[] {
    const out: ShopRowView[] = this.items().map((item, i) => this.itemRow(p, item, i === this.row));
    const n = out.length;
    out.push({
      kind: 'ready',
      item: null,
      name: this.ready ? 'Bereit ✓ (nochmal: zurücknehmen)' : 'Bereit',
      detail: '',
      price: '',
      state: 'normal',
      selected: this.row === n,
    });
    if (this.canEndSeries) {
      out.push({ kind: 'end', item: null, name: 'Serie beenden', detail: '', price: '', state: 'normal', selected: this.row === n + 1 });
    }
    return out;
  }

  private itemRow(p: Progress, item: ShopItemId, selected: boolean): ShopRowView {
    const def = CONFIG.shop.items[item];
    const owned = ownedOf(p, item);
    const max = maxOf(item);
    const row: ShopRowView = { kind: 'item', item, name: def.name, detail: '', price: '', state: 'normal', selected };
    if (!def.available) return { ...row, detail: 'bald', state: 'soon' };
    if (item === 'bag') {
      if (owned >= max) return { ...row, name: CONFIG.containers[owned].name, detail: 'voll ausgebaut', state: 'grey' };
      const next = CONFIG.containers[owned + 1];
      row.name = next.name;
      row.detail = `${next.capacity} Plätze`;
    } else if (def.kind === 'level') {
      if (owned >= max) return { ...row, detail: `Stufe ${max} (max)`, state: 'grey' };
      row.detail = `Stufe ${owned} → ${owned + 1}: ${effectText(item, owned + 1)}`;
    } else if (def.kind === 'once') {
      if (owned >= max) return { ...row, detail: 'vorhanden', state: 'grey' };
    } else {
      row.detail = selected ? `◄ ${this.qty} ►  (hast ${owned})` : `(hast ${owned})`;
    }
    const qty = selected && def.kind === 'stack' ? Math.min(this.qty, this.maxQty(p)) : 1;
    const check = checkShopBuy(p, def.category, item, qty);
    const cost = def.kind === 'level' ? def.prices[owned] : def.prices[0] * qty;
    row.price = formatMoney(cost);
    if (!check.ok) row.state = 'grey';
    return row;
  }
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test -w @pfandraiders/client && npm run typecheck -w @pfandraiders/client`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/shopModel.ts packages/client/test/shopModel.test.ts
git commit -m "feat(client): reines Shop-Modell mit Kategorien, Menge und Bereit

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Shop-Navigation aus den Bewegungstasten

**Files:**
- Create: `packages/client/src/shopNav.ts`
- Test: Create `packages/client/test/shopNav.test.ts`

**Interfaces:**
- Consumes: `KeyState` (Task 1), `ShopDir` (Task 4)
- Produces: `type ShopNavCommand = ShopDir | 'confirm'`; `NAV_REPEAT_DELAY_MS = 350`; `NAV_REPEAT_EVERY_MS = 90`; `class ShopNav { update(k: KeyState, dtMs: number): ShopNavCommand[] }`.

- [ ] **Step 1: Write the failing test**

Create `packages/client/test/shopNav.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { KeyState } from '../src/input';
import { NAV_REPEAT_DELAY_MS, NAV_REPEAT_EVERY_MS, ShopNav } from '../src/shopNav';

const NONE: KeyState = { left: false, right: false, up: false, down: false, action: false, steal: false, attack: false, eat: false };
const k = (over: Partial<KeyState>): KeyState => ({ ...NONE, ...over });

describe('ShopNav', () => {
  it('ignores keys that are already held on the first frame', () => {
    const nav = new ShopNav();
    expect(nav.update(k({ action: true, down: true }), 16)).toEqual([]);
    expect(nav.update(k({ action: true, down: true }), 16)).toEqual([]);
    expect(nav.update(k({}), 16)).toEqual([]);
    expect(nav.update(k({ action: true }), 16)).toEqual(['confirm']);
  });

  it('gives one command per new press', () => {
    const nav = new ShopNav();
    nav.update(NONE, 16);
    expect(nav.update(k({ up: true }), 16)).toEqual(['up']);
    expect(nav.update(k({ up: true }), 16)).toEqual([]);
    expect(nav.update(k({ right: true }), 16)).toEqual(['right']);
    expect(nav.update(k({ action: true }), 16)).toEqual(['confirm']);
    expect(nav.update(k({ action: true }), 16)).toEqual([]);
  });

  it('repeats a held direction after the delay at a fixed rate', () => {
    const nav = new ShopNav();
    nav.update(NONE, 16);
    expect(nav.update(k({ right: true }), 16)).toEqual(['right']);
    expect(nav.update(k({ right: true }), NAV_REPEAT_DELAY_MS - 1)).toEqual([]);
    expect(nav.update(k({ right: true }), 1)).toEqual(['right']);
    expect(nav.update(k({ right: true }), NAV_REPEAT_EVERY_MS * 3)).toEqual(['right', 'right', 'right']);
  });

  it('prefers up, down, left, right in this order when several are held', () => {
    const nav = new ShopNav();
    nav.update(NONE, 16);
    expect(nav.update(k({ left: true, down: true }), 16)).toEqual(['down']);
  });

  it('never uses steal, attack or eat', () => {
    const nav = new ShopNav();
    nav.update(NONE, 16);
    expect(nav.update(k({ steal: true, attack: true, eat: true }), 16)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/client && npx vitest run test/shopNav.test.ts`
Expected: FAIL ("Failed to resolve import ../src/shopNav").

- [ ] **Step 3: Write the implementation**

Create `packages/client/src/shopNav.ts`:

```ts
import type { KeyState } from './input';
import type { ShopDir } from './shopModel';

export type ShopNavCommand = ShopDir | 'confirm';

/** Gehaltene Richtung wiederholt sich nach so langer Zeit ... */
export const NAV_REPEAT_DELAY_MS = 350;
/** ... und dann in diesem Abstand (für Mengen bis 99). */
export const NAV_REPEAT_EVERY_MS = 90;

/** Wie viele Wiederholungen nach `t` ms Halten fällig sind (0 vor der Verzögerung). */
function repeats(t: number): number {
  return t < NAV_REPEAT_DELAY_MS ? 0 : Math.floor((t - NAV_REPEAT_DELAY_MS) / NAV_REPEAT_EVERY_MS) + 1;
}

/**
 * Macht aus dem Tastenzustand eines Geräts Shop-Befehle: nur Bewegungstasten und die Aktionstaste (Spec §3.3).
 * Was beim ersten Frame schon gedrückt ist (etwa die Aktionstaste von der Rangliste), zählt nicht.
 */
export class ShopNav {
  private first = true;
  private dir: ShopDir | null = null;
  private heldMs = 0;
  private prevAction = false;

  update(k: KeyState, dtMs: number): ShopNavCommand[] {
    const dir: ShopDir | null = k.up ? 'up' : k.down ? 'down' : k.left ? 'left' : k.right ? 'right' : null;
    const dt = Number.isFinite(dtMs) && dtMs > 0 ? dtMs : 0;
    if (this.first) {
      this.first = false;
      this.dir = dir;
      this.heldMs = 0;
      this.prevAction = k.action;
      // gehaltene Richtung vom Vorbild zählt erst nach dem Loslassen
      if (dir !== null) this.heldMs = -Infinity;
      return [];
    }
    const out: ShopNavCommand[] = [];
    if (dir === null) {
      this.dir = null;
    } else if (dir !== this.dir) {
      this.dir = dir;
      this.heldMs = 0;
      out.push(dir);
    } else if (this.heldMs !== -Infinity) {
      const before = this.heldMs;
      this.heldMs += dt;
      for (let i = repeats(before); i < repeats(this.heldMs); i++) out.push(dir);
    }
    if (k.action && !this.prevAction) out.push('confirm');
    this.prevAction = k.action;
    return out;
  }
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test -w @pfandraiders/client && npm run typecheck -w @pfandraiders/client`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/shopNav.ts packages/client/test/shopNav.test.ts
git commit -m "feat(client): Shop-Navigation nur mit Bewegungs- und Aktionstaste

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Lokaler Shop (Fortschritt und Bereit je Spieler)

**Files:**
- Create: `packages/client/src/localShop.ts`
- Test: Create `packages/client/test/localShop.test.ts`

**Interfaces:**
- Consumes: `shopBuy`, `freshProgress`, `progressOf`, `GameState`, `Progress`, `BuyResult`
- Produces: `class LocalShop { constructor(ids: string[], progress: Record<string, Progress>); static fromState(state: GameState, ids: string[]): Record<string, Progress>; progress(id: string): Progress; isReady(id: string): boolean; buy(id: string, category: unknown, item: unknown, qty: unknown): BuyResult; setReady(id: string, ready: boolean): void; allReady(): boolean; result(): Record<string, Progress> }`.

- [ ] **Step 1: Write the failing test**

Create `packages/client/test/localShop.test.ts`:

```ts
import { CITY_MAP, createGame, freshProgress } from '@pfandraiders/core';
import { describe, expect, it } from 'vitest';
import { LocalShop } from '../src/localShop';

describe('LocalShop', () => {
  it('takes the progress of each local player from the ended round', () => {
    const s = createGame(1, CITY_MAP, ['p1', 'p2']);
    s.players.p1.money = 500;
    s.players.p1.earnedTotal = 500;
    s.players.p2.inventory.food = 2;
    const prog = LocalShop.fromState(s, ['p1', 'p2']);
    expect(prog.p1).toMatchObject({ money: 500, earnedTotal: 500 });
    expect(prog.p2.inventory.food).toBe(2);
    s.players.p2.inventory.food = 0;
    expect(prog.p2.inventory.food).toBe(2);
  });

  it('buys per player with the core rules', () => {
    const shop = new LocalShop(['p1', 'p2'], { p1: { ...freshProgress(), money: 300 } });
    expect(shop.buy('p1', 'defense', 'food', 3)).toEqual({ ok: true, cost: 300 });
    expect(shop.progress('p1').inventory.food).toBe(3);
    expect(shop.buy('p2', 'defense', 'food', 1)).toEqual({ ok: false, reason: 'no_money' });
    expect(shop.buy('p1', 'defense', 'food', 1)).toEqual({ ok: false, reason: 'no_money' });
  });

  it('starts only when every local player is ready, and ready can be taken back', () => {
    const shop = new LocalShop(['p1', 'p2'], {});
    expect(shop.allReady()).toBe(false);
    shop.setReady('p1', true);
    expect(shop.allReady()).toBe(false);
    shop.setReady('p2', true);
    expect(shop.allReady()).toBe(true);
    shop.setReady('p1', false);
    expect(shop.allReady()).toBe(false);
    expect(shop.isReady('p2')).toBe(true);
  });

  it('gives a deep copy of the result for the next round', () => {
    const shop = new LocalShop(['p1'], { p1: { ...freshProgress(), money: 100 } });
    const out = shop.result();
    out.p1.money = 0;
    expect(shop.progress('p1').money).toBe(100);
  });

  it('ignores unknown players', () => {
    const shop = new LocalShop(['p1'], {});
    shop.setReady('nobody', true);
    expect(shop.buy('nobody', 'defense', 'food', 1)).toEqual({ ok: false, reason: 'unknown_item' });
    expect(shop.allReady()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/client && npx vitest run test/localShop.test.ts`
Expected: FAIL ("Failed to resolve import ../src/localShop").

- [ ] **Step 3: Write the implementation**

Create `packages/client/src/localShop.ts`:

```ts
import { freshProgress, progressOf, shopBuy } from '@pfandraiders/core';
import type { BuyResult, GameState, Progress } from '@pfandraiders/core';

/** Shop-Phase im lokalen Spiel: Fortschritt und "bereit" je lokalem Spieler. Rein, ohne Phaser. */
export class LocalShop {
  private readonly own = new Map<string, Progress>();
  private readonly ready = new Map<string, boolean>();

  constructor(
    private readonly ids: string[],
    progress: Record<string, Progress>,
  ) {
    for (const id of ids) {
      this.own.set(id, progressOf(Object.hasOwn(progress, id) ? progress[id] : freshProgress()));
      this.ready.set(id, false);
    }
  }

  /** Fortschritt aller lokalen Spieler aus dem Zustand am Rundenende (tiefe Kopie). */
  static fromState(state: GameState, ids: string[]): Record<string, Progress> {
    const out: Record<string, Progress> = {};
    for (const id of ids) {
      const p = state.players[id];
      out[id] = p ? progressOf(p) : freshProgress();
    }
    return out;
  }

  progress(id: string): Progress {
    return this.own.get(id) ?? freshProgress();
  }

  isReady(id: string): boolean {
    return this.ready.get(id) ?? false;
  }

  buy(id: string, category: unknown, item: unknown, qty: unknown): BuyResult {
    const p = this.own.get(id);
    if (!p) return { ok: false, reason: 'unknown_item' };
    return shopBuy(p, category, item, qty);
  }

  setReady(id: string, ready: boolean): void {
    if (this.ready.has(id)) this.ready.set(id, ready);
  }

  allReady(): boolean {
    return this.ids.length > 0 && this.ids.every((id) => this.ready.get(id) === true);
  }

  /** Fortschritt für die nächste Runde (tiefe Kopie). */
  result(): Record<string, Progress> {
    const out: Record<string, Progress> = {};
    for (const id of this.ids) out[id] = progressOf(this.progress(id));
    return out;
  }
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test -w @pfandraiders/client && npm run typecheck -w @pfandraiders/client`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/localShop.ts packages/client/test/localShop.test.ts
git commit -m "feat(client): lokaler Shop mit Fortschritt und Bereit je Spieler

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Online-Verbindung für Phase, Shop-Stand, Rangliste und Rundenzeit

**Files:**
- Create: `packages/client/src/shopGuard.ts`
- Modify: `packages/client/src/online.ts`
- Modify: `packages/client/src/onlineMenu.ts` (Auflösen in der Shop-Phase, Rundenzeit-Wahl)
- Test: Create `packages/client/test/shopGuard.test.ts`; Modify `packages/client/test/online.test.ts`

**Interfaces:**
- Consumes: `Progress`, `RankEntry`, `CONFIG`, `noUpgrades`, `ROUND_MS_CHOICES`, `DEFAULT_ROUND_MS`, `roundMsLabel` (Task 3)
- Produces:
  - `parseProgress(x: unknown): Progress | null`, `parseRanking(x: unknown): RankEntry[] | null`
  - `OnlineConnection`: Felder `roundMs: number`, `shop: Progress | null`, `shopReady: boolean`, `ranking: RankEntry[]`; Rückrufe `onPhase: (() => void) | null`, `onShopState: (() => void) | null`; Methoden `shopBuy(category: ShopCategory, item: ShopItemId, qty: number): void`, `setRoundMs(ms: number): void`, `endSeries(): void`
  - `showOnlineMenu` löst auch auf, wenn der Raum in der Shop-Phase ist und der eigene `shopState` da ist.

- [ ] **Step 1: Write the failing tests**

Create `packages/client/test/shopGuard.test.ts`:

```ts
import { freshProgress } from '@pfandraiders/core';
import { describe, expect, it } from 'vitest';
import { parseProgress, parseRanking } from '../src/shopGuard';

describe('parseProgress', () => {
  it('accepts a valid progress and copies it', () => {
    const p = { ...freshProgress(), money: 120, containerLevel: 2 };
    p.upgrades.armor = 3;
    p.inventory.food = 99;
    const out = parseProgress(JSON.parse(JSON.stringify(p)));
    expect(out).toEqual(p);
  });

  it('rejects broken values', () => {
    const ok = freshProgress();
    const bad: unknown[] = [
      null,
      [],
      { ...ok, money: -1 },
      { ...ok, money: 1.5 },
      { ...ok, containerLevel: 4 },
      { ...ok, upgrades: { ...ok.upgrades, speed: 9 } },
      { ...ok, upgrades: { knockout: 0 } },
      { ...ok, inventory: { dog_treat: 0, food: 0 } },
      { ...ok, inventory: { dog_treat: 0, food: 'x', bolt_cutters: false } },
      { ...ok, earnedTotal: Number.NaN },
    ];
    for (const b of bad) expect(parseProgress(b)).toBeNull();
  });
});

describe('parseRanking', () => {
  it('accepts entries with id, money, round and total', () => {
    const e = [{ id: 'p1', money: 5, round: 3, total: 9 }];
    expect(parseRanking(e)).toEqual(e);
  });

  it('rejects anything else', () => {
    expect(parseRanking({})).toBeNull();
    expect(parseRanking([{ id: 'p1', money: 5, round: 3 }])).toBeNull();
    expect(parseRanking([{ id: 5, money: 5, round: 3, total: 1 }])).toBeNull();
  });
});
```

An `packages/client/test/online.test.ts` anhängen (Import `freshProgress` ergänzen):

```ts
describe('shop phase messages', () => {
  it('stores the own shop state and ready flag and tells the scene', () => {
    const { socket, conn } = setup();
    let calls = 0;
    conn.onShopState = () => calls++;
    socket.receive({ t: 'shopState', you: { ...freshProgress(), money: 250 }, ready: true });
    expect(conn.shop?.money).toBe(250);
    expect(conn.shopReady).toBe(true);
    expect(calls).toBe(1);
  });

  it('keeps the old shop state when a broken one arrives', () => {
    const { socket, conn } = setup();
    socket.receive({ t: 'shopState', you: { ...freshProgress(), money: 250 }, ready: false });
    socket.onmessage?.({ data: JSON.stringify({ t: 'shopState', you: { money: -5 }, ready: true }) });
    expect(conn.shop?.money).toBe(250);
    expect(conn.shopReady).toBe(false);
  });

  it('stores the ranking and the phase and calls onPhase', () => {
    const { socket, conn } = setup();
    let phases = 0;
    conn.onPhase = () => phases++;
    socket.receive({ t: 'ranking', entries: [{ id: 'p1', money: 5, round: 5, total: 5 }] });
    socket.receive({ t: 'phase', phase: 'shop' });
    expect(conn.ranking).toEqual([{ id: 'p1', money: 5, round: 5, total: 5 }]);
    expect(conn.roomPhase).toBe('shop');
    expect(phases).toBe(1);
  });

  it('sends shopBuy, and setRoundMs and endSeries only as host', () => {
    const { socket, conn } = setup();
    socket.receive({ t: 'joined', room: 'ABCD', you: 'p2', token: 't' });
    socket.receive({ t: 'lobby', room: 'ABCD', host: 'p1', players: roster(), phase: 'lobby', roundMs: 420_000 });
    expect(conn.roundMs).toBe(420_000);
    conn.shopBuy('defense', 'food', 3);
    conn.setRoundMs(180_000);
    conn.endSeries();
    expect(socket.sent.filter((m) => m.t !== 'join')).toEqual([{ t: 'shopBuy', category: 'defense', item: 'food', qty: 3 }]);
    socket.receive({ t: 'lobby', room: 'ABCD', host: 'p2', players: roster(), phase: 'shop', roundMs: 420_000 });
    conn.setRoundMs(180_000);
    conn.endSeries();
    expect(socket.sent.slice(-2)).toEqual([{ t: 'setRoundMs', roundMs: 180_000 }, { t: 'endSeries' }]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/client && npx vitest run test/shopGuard.test.ts test/online.test.ts`
Expected: FAIL ("Failed to resolve import ../src/shopGuard", `shop`/`shopBuy` fehlen).

- [ ] **Step 3: Write the implementation**

Create `packages/client/src/shopGuard.ts`:

```ts
import { CONFIG, noUpgrades } from '@pfandraiders/core';
import type { Progress, RankEntry, UpgradeId } from '@pfandraiders/core';

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function nonNegInt(x: unknown): x is number {
  return typeof x === 'number' && Number.isInteger(x) && x >= 0;
}

/** Prüft den eigenen Shop-Stand vom Server; null = verwerfen (alter Stand bleibt). */
export function parseProgress(x: unknown): Progress | null {
  if (!isObj(x)) return null;
  const { money, containerLevel, upgrades, inventory, earnedTotal } = x;
  if (!nonNegInt(money) || !nonNegInt(earnedTotal)) return null;
  if (!nonNegInt(containerLevel) || containerLevel >= CONFIG.containers.length) return null;
  if (!isObj(upgrades) || !isObj(inventory)) return null;
  const up = noUpgrades();
  for (const id of Object.keys(up) as UpgradeId[]) {
    const v = upgrades[id];
    if (!nonNegInt(v) || v > CONFIG.shop.items[id].prices.length) return null;
    up[id] = v;
  }
  const { dog_treat, food, bolt_cutters } = inventory;
  if (!nonNegInt(dog_treat) || !nonNegInt(food) || typeof bolt_cutters !== 'boolean') return null;
  if (dog_treat > CONFIG.shop.maxStack || food > CONFIG.shop.maxStack) return null;
  return { money, containerLevel, upgrades: up, inventory: { dog_treat, food, bolt_cutters }, earnedTotal };
}

/** Prüft die Rangliste vom Server; null = verwerfen. */
export function parseRanking(x: unknown): RankEntry[] | null {
  if (!Array.isArray(x)) return null;
  const out: RankEntry[] = [];
  for (const e of x) {
    if (!isObj(e) || typeof e.id !== 'string') return null;
    if (!nonNegInt(e.money) || !nonNegInt(e.round) || !nonNegInt(e.total)) return null;
    out.push({ id: e.id, money: e.money, round: e.round, total: e.total });
  }
  return out;
}
```

`packages/client/src/online.ts`:
- Kern-Imports um `DEFAULT_ROUND_MS` (Wert) und `Progress`, `RankEntry`, `ShopCategory`, `ShopItemId` (Typen) ergänzen; `import { parseProgress, parseRanking } from './shopGuard';`.
- Neue Felder nach `roomPhase`:

```ts
  /** Rundenzeit laut Server (Lobby-Nachricht oder start) */
  roundMs: number = DEFAULT_ROUND_MS;
  /** Eigener Stand in der Shop-Phase; null = noch keiner */
  shop: Progress | null = null;
  /** Eigenes "bereit" laut Server */
  shopReady = false;
  /** Rangliste der letzten Runde */
  ranking: RankEntry[] = [];
  /** Phase des Raums hat gewechselt (phase-Nachricht). */
  onPhase: (() => void) | null = null;
  /** Neuer eigener Shop-Stand. */
  onShopState: (() => void) | null = null;
```

- Neue Methoden nach `setReady`:

```ts
  /** Shop-Phase: kaufen (der Server prüft Geld, Bestand und Phase). */
  shopBuy(category: ShopCategory, item: ShopItemId, qty: number): void {
    if (this.status !== 'open') return;
    this.sendMsg({ t: 'shopBuy', category, item, qty });
  }

  /** Rundenzeit setzen (nur Host; der Server prüft zusätzlich). */
  setRoundMs(ms: number): void {
    if (this.status !== 'open' || !this.isHost()) return;
    this.sendMsg({ t: 'setRoundMs', roundMs: ms });
  }

  /** Serie beenden (nur Host, nur Shop; der Server prüft zusätzlich). */
  endSeries(): void {
    if (this.status !== 'open' || !this.isHost()) return;
    this.sendMsg({ t: 'endSeries' });
  }
```

- In `handle`:
  - Fall `'lobby'`: nach `this.roomPhase = msg.phase;` ergänzen: `if (typeof msg.roundMs === 'number' && Number.isFinite(msg.roundMs) && msg.roundMs > 0) this.roundMs = msg.roundMs;`
  - Fall `'start'`: vor `this.onStart?.();` ergänzen: `if (typeof msg.roundMs === 'number' && Number.isFinite(msg.roundMs) && msg.roundMs > 0) this.roundMs = msg.roundMs;` und `this.roomPhase = 'playing';`
  - Fall `'phase'` ersetzen:

```ts
      case 'phase':
        if (msg.phase !== 'lobby' && msg.phase !== 'playing' && msg.phase !== 'shop') break;
        this.roomPhase = msg.phase;
        this.onPhase?.();
        break;
      case 'shopState': {
        const you = parseProgress(msg.you);
        if (!you || typeof msg.ready !== 'boolean') break;
        this.shop = you;
        this.shopReady = msg.ready;
        this.onShopState?.();
        break;
      }
      case 'ranking': {
        const entries = parseRanking(msg.entries);
        if (entries) this.ranking = entries;
        break;
      }
```

`packages/client/src/onlineMenu.ts`:
- Imports: `import { ROUND_MS_CHOICES } from '@pfandraiders/core';` (zur bestehenden Kern-Importzeile hinzufügen) und `import { roundMsLabel } from './roundTime';`.
- In `finish` zusätzlich `conn.onShopState = null;` und `conn.onPhase = null;`.
- Nach `conn.onStart = () => finish(conn);`:

```ts
    // Rückkehr oder Beitritt zwischen zwei Runden: direkt in den Shop
    conn.onShopState = () => {
      if (conn.roomPhase === 'shop') finish(conn);
    };
```

- In `renderLobby` nach dem Chat-Eingabefeld eine Zeile für die Rundenzeit:

```ts
      const roundRow = el('div', {}, 'margin-bottom:10px');
      const roundText = el('span', { textContent: '' });
      const roundSelect = el('select', {}, 'font:inherit;margin-left:6px');
      for (const ms of ROUND_MS_CHOICES) roundSelect.appendChild(el('option', { value: String(ms), textContent: roundMsLabel(ms) }));
      roundSelect.onchange = () => conn.setRoundMs(Number(roundSelect.value));
      roundRow.append(el('span', { textContent: 'Rundenzeit:' }), roundSelect, roundText);
```

- In `refresh` ergänzen:

```ts
        roundSelect.style.display = conn.isHost() ? 'inline-block' : 'none';
        roundSelect.value = String(conn.roundMs);
        roundText.textContent = conn.isHost() ? '' : ` ${roundMsLabel(conn.roundMs)}`;
```

- `box.append(list, chatLog, chatInput, start, hint, leave, message);` wird `box.append(list, chatLog, chatInput, roundRow, start, hint, leave, message);`.

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test -w @pfandraiders/client && npm run typecheck -w @pfandraiders/client`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/shopGuard.ts packages/client/src/online.ts packages/client/src/onlineMenu.ts packages/client/test/shopGuard.test.ts packages/client/test/online.test.ts
git commit -m "feat(client): Verbindung kennt Phase, Shop-Stand, Rangliste und Rundenzeit

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Sounds für Schlag, Treffer und Ausrauben; Schlag sichtbar

**Files:**
- Modify: `packages/client/src/soundEvents.ts`
- Modify: `packages/client/src/sound.ts` (`RECIPES`)
- Create: `packages/client/src/fightView.ts`
- Test: `packages/client/test/soundEvents.test.ts`, `packages/client/test/sound.test.ts`, Create `packages/client/test/fightView.test.ts`

**Interfaces:**
- Consumes: `CONFIG.fight`, `Player.attackCooldownMs`, `Player.robbed`
- Produces: `SoundId` plus `'punch' | 'hit'`; `SWING_MS = 150`; `isSwinging(p: Pick<Player, 'attackCooldownMs'>): boolean`.

- [ ] **Step 1: Write the failing tests**

An `packages/client/test/soundEvents.test.ts` anhängen:

```ts
describe('fight sounds', () => {
  it('plays punch for the own swing only', () => {
    const p = fresh();
    const n = next(p, (s) => { s.players.a.attackCooldownMs = CONFIG.fight.cooldownMs; });
    expect(detectSounds(p, n, ['a'])).toEqual(['punch']);
    expect(detectSounds(p, n, ['b'])).toEqual([]);
  });

  it('plays hit instead of bite when an opponent in reach swung', () => {
    const p = next(fresh(), (s) => {
      s.players.b.x = s.players.a.x + 10;
      s.players.b.y = s.players.a.y;
    });
    const n = next(p, (s) => {
      s.players.b.attackCooldownMs = CONFIG.fight.cooldownMs;
      s.players.a.health -= CONFIG.fight.damage;
    });
    expect(detectSounds(p, n, ['a'])).toEqual(['hit']);
  });

  it('plays stealSuccess and no pickup for the robber of a knocked-out player', () => {
    const p = next(fresh(), (s) => {
      s.players.b.bottles.plastic = 4;
      s.players.b.unconsciousMs = 10000;
      s.players.b.health = 0;
    });
    const n = next(p, (s) => {
      s.players.b.bottles.plastic = 2;
      s.players.b.robbed = true;
      s.players.a.bottles.plastic = 2;
    });
    expect(detectSounds(p, n, ['a'])).toEqual(['stealSuccess']);
  });
});
```

Create `packages/client/test/fightView.test.ts`:

```ts
import { CONFIG } from '@pfandraiders/core';
import { describe, expect, it } from 'vitest';
import { isSwinging, SWING_MS } from '../src/fightView';

describe('isSwinging', () => {
  it('is true only in the first moments after a punch', () => {
    expect(isSwinging({ attackCooldownMs: CONFIG.fight.cooldownMs })).toBe(true);
    expect(isSwinging({ attackCooldownMs: CONFIG.fight.cooldownMs - SWING_MS + 1 })).toBe(true);
    expect(isSwinging({ attackCooldownMs: CONFIG.fight.cooldownMs - SWING_MS })).toBe(false);
    expect(isSwinging({ attackCooldownMs: 0 })).toBe(false);
  });
});
```

In `packages/client/test/sound.test.ts` in der Liste `['pickup', 'pling', 'buy', …, 'tick']` (Test, der jede Sound-ID abspielt) `'punch'` und `'hit'` ergänzen.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/client && npx vitest run test/soundEvents.test.ts test/fightView.test.ts test/sound.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write the implementation**

Create `packages/client/src/fightView.ts`:

```ts
import { CONFIG } from '@pfandraiders/core';
import type { Player } from '@pfandraiders/core';

/** So lange nach einem Schlag wirkt die Figur größer (Schlag sichtbar, auch für Fremde: attackCooldownMs ist öffentlich). */
export const SWING_MS = 150;

export function isSwinging(p: Pick<Player, 'attackCooldownMs'>): boolean {
  return p.attackCooldownMs > CONFIG.fight.cooldownMs - SWING_MS;
}
```

`packages/client/src/soundEvents.ts`:
- `SoundId` um `| 'punch'` und `| 'hit'` erweitern.
- Konstante nach `BITE_NEAR`: `const PUNCH_NEAR = CONFIG.fight.radius + 6;`
- Nach der Diebstahl-Schleife (vor `for (const p of Object.values(next.players)) {` mit den eigenen Sounds) Räuber von Ausgeknockten erkennen:

```ts
  // Ausrauben: ein Ausgeknockter wird "robbed" und verliert Flaschen; Räuber ist, wer dabei Flaschen gewann
  for (const v of Object.values(next.players)) {
    const pv = prev.players[v.id];
    if (!pv || pv.robbed || !v.robbed || v.unconsciousMs === 0) continue;
    if (totalBottles(v.bottles) >= totalBottles(pv.bottles)) continue;
    for (const t of Object.values(next.players)) {
      const pt = prev.players[t.id];
      if (!pt || t.id === v.id || totalBottles(t.bottles) <= totalBottles(pt.bottles)) continue;
      thieves.add(t.id);
      if (audible(t.id)) out.add('stealSuccess');
      break;
    }
  }
```

- In der Schleife über die eigenen Spieler den Biss-Block ersetzen:

```ts
    if (p.attackCooldownMs > q.attackCooldownMs) out.add('punch');
    if (q.unconsciousMs === 0) {
      const drop = q.health - p.health;
      const punched = punchedNear(prev, next, q);
      if (punched && drop >= CONFIG.fight.minDamage - 1) out.add('hit');
      // Ein Biss, der zum Umfallen führt, setzt Leben auf 0 und hat einen Hund in Reichweite.
      else if (drop >= BITE_MIN_DROP || (knockedOut && dogNear(prev, q))) out.add('bite');
    }
```

- Neue Hilfsfunktion neben `dogNear`:

```ts
/** Hat ein anderer Spieler in Schlagweite von `p` in diesem Schritt geschlagen (Abklingzeit sprang hoch)? */
function punchedNear(prev: GameState, next: GameState, p: Player): boolean {
  return Object.values(next.players).some((o) => {
    const before = prev.players[o.id];
    return (
      o.id !== p.id &&
      before !== undefined &&
      o.attackCooldownMs > before.attackCooldownMs &&
      Math.hypot(o.x - p.x, o.y - p.y) <= PUNCH_NEAR
    );
  });
}
```

`packages/client/src/sound.ts`, in `RECIPES` ergänzen:

```ts
  /** eigener Schlag: kurzer dumpfer Luftzug */
  punch: { wave: 'sawtooth', gain: 0.6, notes: [{ f: 0, d: 0.06 }], noise: true },
  /** selbst getroffen: tiefer Schlag mit Abfall */
  hit: { wave: 'square', gain: 0.8, notes: [{ f: 220, d: 0.15, to: 90 }] },
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test -w @pfandraiders/client && npm run typecheck -w @pfandraiders/client`
Expected: PASS (auch `'plays bite on a large health drop but not on hunger'`, dort schlägt niemand).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/soundEvents.ts packages/client/src/sound.ts packages/client/src/fightView.ts packages/client/test/soundEvents.test.ts packages/client/test/sound.test.ts packages/client/test/fightView.test.ts
git commit -m "feat(client): Sounds für Schlag, Treffer und Ausrauben, Schlag sichtbar

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Shop-Szene

**Files:**
- Create: `packages/client/src/scenes/ShopScene.ts`
- Modify: `packages/client/src/main.ts`

**Interfaces:**
- Consumes: `ShopModel`, `shopPointerEnabled` (Task 4), `ShopNav` (Task 5), `LocalShop` (Task 6), `OnlineConnection` mit `shop`, `shopReady`, `shopBuy`, `setReady`, `endSeries`, `onShopState`, `onPhase`, `onStart`, `onError`, `onClosed`, `roster`, `isHost()`, `leave()`, `close()` (Task 7), `createSource`, `viewportsFor`, `playerName`, `formatMoney`, `BUY_REFUSAL_TEXT`, `sfx`, `loadOnlineDevice`
- Produces: Phaser-Szene `'shop'` mit `init(data?: ShopSceneData)`; `ShopSceneData { slots?: PlayerSlot[]; progress?: Record<string, Progress>; roundMs?: number; online?: OnlineConnection }`. Startet `'game'` mit `{ slots, progress, roundMs }` (lokal) bzw. `{ online }` (online), `'menu'` mit `{ notice }` beim Verlassen.

Die Szene enthält keine eigene Logik außer Darstellung und Verdrahtung; alles Prüfbare liegt in den Modulen aus Task 4 bis 7. Darum gibt es hier keinen Unit-Test, sondern den Typecheck und einen manuellen Test.

- [ ] **Step 1: Write the scene**

Create `packages/client/src/scenes/ShopScene.ts`:

```ts
import Phaser from 'phaser';
import { BUY_REFUSAL_TEXT, freshProgress, ROOM_COLORS } from '@pfandraiders/core';
import type { Progress } from '@pfandraiders/core';
import { createSource } from '../devices';
import type { PlayerSlot } from '../devices';
import { formatMoney } from '../format';
import { GAME_H, GAME_W, viewportsFor } from '../layout';
import type { Rect } from '../layout';
import { LocalShop } from '../localShop';
import type { OnlineConnection } from '../online';
import { loadOnlineDevice } from '../settings';
import { sfx } from '../sfx';
import { ShopModel, shopPointerEnabled } from '../shopModel';
import type { ShopAction, ShopRowView } from '../shopModel';
import { ShopNav } from '../shopNav';
import type { InputSource } from '../sources';
import { playerName } from '../text';

export interface ShopSceneData {
  /** Lokal: Spieler, ihr Fortschritt nach der Runde und die Rundenzeit der Serie */
  slots?: PlayerSlot[];
  progress?: Record<string, Progress>;
  roundMs?: number;
  /** Online: Verbindung (Stand und Bereit kommen vom Server) */
  online?: OnlineConnection;
}

const COLOR = { text: '#ffffff', grey: '#777777', soon: '#555555', selected: '#ffee58', message: '#ff8a80', hint: '#aaaaaa' };
const MESSAGE_MS = 2500;
/** Höchstens so viele Zeilen hat eine Kategorie (Angriff: 4 Einträge, Bereit, Serie beenden) */
const MAX_ROWS = 6;

interface PanelUi {
  bg: Phaser.GameObjects.Rectangle;
  title: Phaser.GameObjects.Text;
  money: Phaser.GameObjects.Text;
  cats: Phaser.GameObjects.Text[];
  rows: Phaser.GameObjects.Text[];
  message: Phaser.GameObjects.Text;
  others: Phaser.GameObjects.Text;
  hint: Phaser.GameObjects.Text;
}

interface Panel {
  id: string;
  name: string;
  color: number;
  view: Rect;
  model: ShopModel;
  nav: ShopNav;
  source: InputSource;
  ui: PanelUi;
  message: string;
  messageMs: number;
}

const toCss = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

/** Shop-Phase zwischen zwei Runden: ein Feld je lokalem Spieler (online eines), Bedienung nur mit Bewegungs- und Aktionstaste. */
export class ShopScene extends Phaser.Scene {
  private panels: Panel[] = [];
  private online: OnlineConnection | null = null;
  private local: LocalShop | null = null;
  private slots: PlayerSlot[] = [];
  private roundMs: number | undefined;
  private escKey!: Phaser.Input.Keyboard.Key;
  private leaving = false;
  private lastMoney: number | null = null;

  constructor() {
    super('shop');
  }

  init(data?: ShopSceneData): void {
    this.online = data?.online ?? null;
    this.slots = data?.slots ?? [];
    this.roundMs = data?.roundMs;
    this.local = this.online ? null : new LocalShop(this.slots.map((s) => s.id), data?.progress ?? {});
    this.panels = [];
    this.leaving = false;
    this.lastMoney = null;
  }

  create(): void {
    if (!this.online && this.slots.length === 0) {
      this.scene.start('menu');
      return;
    }
    this.escKey = this.input.keyboard!.addKey('ESC');
    const online = this.online;
    if (online) {
      const me = online.roster.find((r) => r.id === online.you);
      const view = { x: 0, y: 0, w: GAME_W, h: GAME_H };
      this.panels.push(this.makePanel(online.you, me?.name ?? 'Du', me?.color ?? ROOM_COLORS[0], view, createSource(this, loadOnlineDevice()), online.isHost()));
      this.lastMoney = online.shop?.money ?? null;
      online.onShopState = () => {
        const money = online.shop?.money ?? null;
        if (money !== null && this.lastMoney !== null && money < this.lastMoney) sfx.play('buy');
        this.lastMoney = money;
        this.panels[0]?.model.setReady(online.shopReady);
      };
      online.onStart = () => this.goTo('game', { online });
      online.onPhase = () => {
        if (online.roomPhase === 'lobby') this.leaveOnline('Der Host hat die Serie beendet.');
      };
      online.onError = (_code, message) => this.say(this.panels[0], message);
      online.onClosed = () => this.leaveOnline('Verbindung zum Server verloren.');
      online.onLobby = null;
      online.onJoined = null;
      this.panels[0].model.setReady(online.shopReady);
      if (online.status === 'closed') this.leaveOnline('Verbindung zum Server verloren.');
    } else {
      const views = viewportsFor(this.slots.length);
      this.slots.forEach((s, i) => {
        this.panels.push(this.makePanel(s.id, playerName(s.id), s.color, views[i], createSource(this, s.device), false));
      });
    }
  }

  update(_time: number, delta: number): void {
    if (this.leaving) return;
    if (Phaser.Input.Keyboard.JustDown(this.escKey)) {
      if (this.online) this.leaveOnline();
      else this.goTo('menu');
      return;
    }
    for (const panel of this.panels) {
      const progress = this.progressOf(panel.id);
      for (const cmd of panel.nav.update(panel.source.read(), delta)) {
        if (cmd === 'confirm') this.run(panel, panel.model.activate(progress));
        else panel.model.move(cmd, progress);
      }
      panel.messageMs = Math.max(0, panel.messageMs - delta);
      this.render(panel);
    }
    if (this.local?.allReady()) {
      this.goTo('game', { slots: this.slots, progress: this.local.result(), roundMs: this.roundMs });
    }
  }

  private progressOf(id: string): Progress {
    if (this.local) return this.local.progress(id);
    return this.online?.shop ?? freshProgress();
  }

  private run(panel: Panel, action: ShopAction | null): void {
    if (!action) return;
    switch (action.kind) {
      case 'refused':
        this.say(panel, BUY_REFUSAL_TEXT[action.reason]);
        return;
      case 'buy':
        if (this.local) {
          const r = this.local.buy(panel.id, action.category, action.item, action.qty);
          if (r.ok) sfx.play('buy');
          else this.say(panel, BUY_REFUSAL_TEXT[r.reason]);
        } else {
          this.online?.shopBuy(action.category, action.item, action.qty);
        }
        return;
      case 'ready':
        if (this.local) this.local.setReady(panel.id, action.ready);
        else this.online?.setReady(action.ready);
        return;
      case 'endSeries':
        this.online?.endSeries();
        return;
    }
  }

  private say(panel: Panel | undefined, text: string): void {
    if (!panel) return;
    panel.message = text;
    panel.messageMs = MESSAGE_MS;
  }

  private makePanel(id: string, name: string, color: number, view: Rect, source: InputSource, canEndSeries: boolean): Panel {
    const small = view.h < 300;
    const size = small ? 13 : 16;
    const font = { fontFamily: 'monospace', fontSize: `${size}px`, color: COLOR.text };
    const x = view.x + 12;
    const bg = this.add.rectangle(view.x, view.y, view.w, view.h, 0x000000, 0.85).setOrigin(0, 0).setStrokeStyle(2, color, 1);
    const title = this.add.text(x, view.y + 8, '', { ...font, fontSize: `${size + 4}px`, color: toCss(color) });
    const money = this.add.text(x, view.y + 8 + size + 10, '', font);
    const catY = view.y + 8 + 2 * (size + 10);
    const cats = [0, 1, 2, 3].map((i) => this.add.text(x + i * Math.floor((view.w - 24) / 4), catY, '', font));
    const rowH = size + 8;
    const rowsY = catY + size + 14;
    const rows = Array.from({ length: MAX_ROWS }, (_, i) =>
      this.add.text(x, rowsY + i * rowH, '', { ...font, wordWrap: { width: view.w - 24 } }),
    );
    const message = this.add.text(x, rowsY + MAX_ROWS * rowH + 4, '', { ...font, color: COLOR.message });
    const others = this.add.text(x, rowsY + MAX_ROWS * rowH + size + 10, '', { ...font, color: COLOR.hint, wordWrap: { width: view.w - 24 } });
    const hint = this.add
      .text(x, view.y + view.h - 8, '', { ...font, fontSize: `${size - 2}px`, color: COLOR.hint, wordWrap: { width: view.w - 24 } })
      .setOrigin(0, 1);
    const panel: Panel = {
      id,
      name,
      color,
      view,
      model: new ShopModel({ canEndSeries }),
      nav: new ShopNav(),
      source,
      ui: { bg, title, money, cats, rows, message, others, hint },
      message: '',
      messageMs: 0,
    };
    if (shopPointerEnabled(this.online !== null)) this.wireMouse(panel, font, x, view.y + view.h - 8 - 2 * (size + 10));
    return panel;
  }

  /** Nur online: Klick auf Kategorie und Eintrag wählt, Knöpfe für Menge, Kaufen, Bereit, Serie beenden. */
  private wireMouse(panel: Panel, font: Phaser.Types.GameObjects.Text.TextStyle, x: number, y: number): void {
    const progress = (): Progress => this.progressOf(panel.id);
    panel.ui.cats.forEach((t, i) => {
      t.setInteractive({ useHandCursor: true }).on('pointerdown', () => panel.model.selectCategory(i));
    });
    panel.ui.rows.forEach((t, i) => {
      t.setInteractive({ useHandCursor: true }).on('pointerdown', () => panel.model.selectRow(i));
    });
    const buttons: [string, () => void][] = [
      ['[ − ]', () => panel.model.changeQty(-1, progress())],
      ['[ + ]', () => panel.model.changeQty(1, progress())],
      ['[ Kaufen ]', () => this.run(panel, panel.model.buyAction(progress()))],
      ['[ Bereit ]', () => this.run(panel, panel.model.toggleReady())],
    ];
    if (this.online?.isHost()) buttons.push(['[ Serie beenden ]', () => this.run(panel, { kind: 'endSeries' })]);
    let bx = x;
    for (const [label, onClick] of buttons) {
      const b = this.add.text(bx, y, label, { ...font, color: COLOR.selected }).setInteractive({ useHandCursor: true });
      b.on('pointerdown', onClick);
      bx += b.width + 12;
    }
  }

  private render(panel: Panel): void {
    const p = this.progressOf(panel.id);
    const ui = panel.ui;
    ui.title.setText(`Shop – ${panel.name}`);
    ui.money.setText(`Geld ${formatMoney(p.money)}   Gesamtverdienst ${formatMoney(p.earnedTotal)}`);
    panel.model.categories().forEach((c, i) => {
      ui.cats[i].setText(c.selected ? `[${c.name}]` : c.name).setColor(c.selected ? COLOR.selected : COLOR.text);
    });
    const rows = panel.model.rows(p);
    ui.rows.forEach((t, i) => {
      const r = rows[i];
      t.setVisible(r !== undefined);
      if (r) t.setText(rowText(r)).setColor(rowColor(r));
    });
    ui.message.setText(panel.messageMs > 0 ? panel.message : '');
    ui.others.setText(this.othersText(panel));
    const action = panel.source.labels.action;
    ui.hint.setText(`Hoch/runter: wählen   Links/rechts: Kategorie oder Menge   ${action}: kaufen / bereit   Esc: verlassen`);
  }

  /** Wer ist schon bereit? Online aus der Raumliste, lokal aus dem lokalen Shop. */
  private othersText(panel: Panel): string {
    if (this.online) {
      const list = this.online.roster.filter((r) => r.connected).map((r) => `${r.ready ? '✓' : '…'} ${r.name}`);
      return `Bereit: ${list.join('   ')}`;
    }
    const ready = this.local?.isReady(panel.id) ?? false;
    return ready ? 'Warte auf die anderen…' : '';
  }

  private goTo(scene: 'game' | 'menu', data: object): void {
    if (this.leaving) return;
    this.leaving = true;
    if (this.online) {
      this.online.onShopState = null;
      this.online.onPhase = null;
      this.online.onError = null;
      this.online.onClosed = null;
      if (scene !== 'game') this.online.onStart = null;
    }
    this.scene.start(scene, data);
  }

  /** Online verlassen: Platz freigeben (außer die Verbindung ist schon weg) und ins Menü. */
  private leaveOnline(notice?: string): void {
    const online = this.online;
    if (online) {
      online.onStart = null;
      online.leave();
      online.close();
    }
    this.goTo('menu', notice ? { notice } : {});
  }
}

function rowText(r: ShopRowView): string {
  const mark = r.selected ? '> ' : '  ';
  const detail = r.detail ? `  ${r.detail}` : '';
  const price = r.price ? `   ${r.price}` : '';
  return `${mark}${r.name}${detail}${price}`;
}

function rowColor(r: ShopRowView): string {
  if (r.state === 'soon') return COLOR.soon;
  if (r.selected) return COLOR.selected;
  return r.state === 'grey' ? COLOR.grey : COLOR.text;
}
```

`packages/client/src/main.ts`: `import { ShopScene } from './scenes/ShopScene';` und `scene: [BootScene, MenuScene, LobbyScene, GameScene, ShopScene],`.

- [ ] **Step 2: Typecheck and tests**

Run: `npm run typecheck -w @pfandraiders/client && npm test -w @pfandraiders/client`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/scenes/ShopScene.ts packages/client/src/main.ts
git commit -m "feat(client): Shop-Szene mit Feld je Spieler, Maus nur online

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Ablauf Runde → Rangliste → Shop → Runde verdrahten

**Files:**
- Modify: `packages/client/src/scenes/GameScene.ts` (`init`, `create`, Rundenende, Wiederverbindung, Figurengröße beim Schlag)
- Modify: `packages/client/src/scenes/LobbyScene.ts` (Rundenzeit-Wahl, Start mit `roundMs`)
- Modify: `packages/client/src/scenes/MenuScene.ts:382-386`

**Interfaces:**
- Consumes: `ShopScene` (Task 9), `LocalShop.fromState` (Task 6), `isSwinging` (Task 8), `loadLocalRoundMs`, `saveLocalRoundMs`, `stepRoundMs`, `roundMsLabel` (Task 3), `OnlineConnection.roomPhase/shop` (Task 7)
- Produces: `GameScene.init(data?: { slots?: PlayerSlot[]; online?: OnlineConnection; progress?: Record<string, Progress>; roundMs?: number })`; `LobbyScene` startet `'game'` mit `{ slots, roundMs }`.

- [ ] **Step 1: GameScene**

In `packages/client/src/scenes/GameScene.ts`:

1. Imports ergänzen: `import type { Progress } from '@pfandraiders/core';` (zur bestehenden Typ-Importzeile), `import { isSwinging } from '../fightView';`, `import { LocalShop } from '../localShop';`, `loadLocalRoundMs` zur Importzeile aus `'../settings'`.
2. Felder nach `private slots: PlayerSlot[] = [];`:

```ts
  /** Lokale Serie: Fortschritt aus der Shop-Phase (leer in der ersten Runde) und Rundenzeit der Serie. */
  private progress: Record<string, Progress> | undefined;
  private roundMs: number | undefined;
```

3. `init`:

```ts
  init(data?: { slots?: PlayerSlot[]; online?: OnlineConnection; progress?: Record<string, Progress>; roundMs?: number }): void {
    this.online = data?.online ?? null;
    this.slots = data?.slots ?? [];
    this.progress = data?.progress;
    this.roundMs = data?.roundMs;
  }
```

4. Im lokalen Zweig von `create` die Erzeugung des Zustands:

```ts
      // ?round= (Testhilfe) hat Vorrang, sonst die Wahl aus der Lobby, sonst die gespeicherte
      if (roundSec > 0) this.roundMs = roundSec * 1000;
      this.roundMs ??= loadLocalRoundMs();
      state = createGame(seed, MAP_DEFS[this.mapId].map, ids, { roundMs: this.roundMs, progress: this.progress });
```

5. Rundenende in `update` ersetzen (der Block mit `restartPressed || confirmPressed`):

```ts
    if (state.phase === 'ended' && this.endedForMs >= RESTART_DELAY_MS && !this.plan && (restartPressed || confirmPressed)) {
      if (this.online) {
        const online = this.online;
        online.onClosed = null;
        online.onError = null;
        online.onJoined = null;
        this.scene.start('shop', { online });
      } else {
        const ids = this.slots.map((s) => s.id);
        this.scene.start('shop', { slots: this.slots, progress: LocalShop.fromState(state, ids), roundMs: this.roundMs });
      }
      return;
    }
```

6. In `tickReconnect` direkt nach `if (online.status !== 'open') this.joinedWatch = null;` einfügen:

```ts
    // Zurück, aber die Runde ist schon vorbei und der Raum im Shop: dorthin
    if (this.joinedSeen && online.roomPhase === 'shop' && online.shop) {
      this.plan = null;
      online.onClosed = null;
      online.onError = null;
      online.onJoined = null;
      this.scene.start('shop', { online });
      return true;
    }
```

7. In der Spielerschleife von `update` nach `body.setAlpha(unconscious ? 0.6 : 1);`: `body.setScale(isSwinging(p) ? 1.15 : 1);`

- [ ] **Step 2: LobbyScene**

In `packages/client/src/scenes/LobbyScene.ts`:

1. Imports: `import { loadLocalRoundMs, saveLocalRoundMs } from '../settings';` und `import { roundMsLabel, stepRoundMs } from '../roundTime';`.
2. Felder: `private roundMs = 300_000;`, `private roundKeys: { left: Phaser.Input.Keyboard.Key[]; right: Phaser.Input.Keyboard.Key[] } = { left: [], right: [] };` und `padPrev` um `left`/`right` erweitern: `private padPrev: Record<number, { a: boolean; b: boolean; start: boolean; left: boolean; right: boolean }> = {};`
3. In `create` nach `this.slots = [];`: `this.roundMs = loadLocalRoundMs();`. Im Testhilfe-Pfad `this.scene.start('game', { slots, roundMs: this.roundMs });`. Nach `this.backKey = …`:

```ts
    const kb = this.input.keyboard!;
    this.roundKeys = { left: [kb.addKey('A'), kb.addKey('LEFT')], right: [kb.addKey('D'), kb.addKey('RIGHT')] };
```

4. In `update` vor `let backPressed = false;`:

```ts
    let roundDir: -1 | 0 | 1 = 0;
    if (this.roundKeys.left.some((k) => Phaser.Input.Keyboard.JustDown(k))) roundDir = -1;
    if (this.roundKeys.right.some((k) => Phaser.Input.Keyboard.JustDown(k))) roundDir = 1;
```

und in der Pad-Schleife (die Zeile `const prev = …` und die Zuweisung `this.padPrev[pad.index] = …` ersetzen):

```ts
      const left = pad.left || pad.leftStick.x < -0.5;
      const right = pad.right || pad.leftStick.x > 0.5;
      const prev = this.padPrev[pad.index] ?? { a: pad.A, b: pad.B, start: false, left, right };
      if (left && !prev.left) roundDir = -1;
      if (right && !prev.right) roundDir = 1;
```

```ts
      this.padPrev[pad.index] = { a: pad.A, b: pad.B, start, left, right };
```

danach:

```ts
    if (roundDir !== 0) {
      this.roundMs = stepRoundMs(this.roundMs, roundDir);
      saveLocalRoundMs(this.roundMs);
    }
```

5. Start: `this.scene.start('game', { slots: this.slots, roundMs: this.roundMs });`.
6. In `lines()` nach der Beitrittszeile (vor der leeren Zeile) einfügen: `lines.push(`Rundenzeit: ◄ ${roundMsLabel(this.roundMs)} ►  (links/rechts)`);`.

- [ ] **Step 3: MenuScene**

In `packages/client/src/scenes/MenuScene.ts`, `openOnline`: `if (conn) this.scene.start('game', { online: conn });` wird

```ts
        if (conn) this.scene.start(conn.roomPhase === 'shop' && conn.shop ? 'shop' : 'game', { online: conn });
```

- [ ] **Step 4: Typecheck and all tests**

Run: `npm run typecheck && npm test`
Expected: PASS in core, client und server.

- [ ] **Step 5: Manual verification**

1. Lokal: `npm run dev`, Browser `http://localhost:5173/?round=20`. Lokal spielen, zwei Spieler (E und Enter), in der Lobby mit A/D die Rundenzeit ändern (Anzeige ◄ … ►, nach Neuladen gemerkt). Start. In der Runde: `F` schlägt den anderen (Hinweis `[F] Schlagen`, Figur wird kurz größer, Ton), `C` isst nicht ohne Essen. Nach 20 s Rangliste mit Runde/Gesamt, `E` → Shop mit zwei Feldern. Spieler 1 nur mit W/A/S/D/E, Spieler 2 nur mit Pfeilen/Enter. Mausklicks lokal bewirken nichts. Essen auf Menge 3 stellen (rechts), kaufen; Steinschleuder ist grau "bald". Beide "Bereit" → neue Runde, gekauftes Essen steht im HUD, `C` isst.
2. Online: `ROUND_MS=20000 npm run dev:server` und `npm run dev` in zwei Browsern. Host sieht das Auswahlfeld "Rundenzeit" (bei gesetztem `ROUND_MS` zeigt der Gast "20 s"). Nach der Runde: Rangliste, `E` → Shop. Mit der Maus Kategorie, Eintrag, `+`, `Kaufen`, `Bereit` klicken. Den Gast-Tab neu laden: "Online spielen" → Beitreten mit gespeichertem Code landet direkt im Shop. Beide bereit → Runde 2. Im Shop beendet der Host über "Serie beenden": beide landen mit Hinweis im Menü.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/scenes/GameScene.ts packages/client/src/scenes/LobbyScene.ts packages/client/src/scenes/MenuScene.ts
git commit -m "feat(client): Serie lokal und online mit Rangliste und Shop-Phase

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-Review

1. **Spec-Abdeckung:** §1.1 Ablauf (Task 10), §1.4 Rangliste mit beiden Werten (Task 2), §2.1 Rundenzeit in beiden Lobbys (Task 3, 7, 10), §3.3 Bedienung nur Bewegungstasten, Gamepad, Maus nur online, je Spieler ein Feld (Task 4, 5, 9), §3.4 Kategorien und graue "bald"-Einträge (Task 4), §3.5 Menge links/rechts und +/− (Task 4, 9), §3.7 keine Kauftasten (Task 1), §4.1 Schlagen-Taste (Task 1, 2, 8), Essen-Taste (Task 1, 2), §6 neue Nachrichten im Client (Task 7). Tests laut Spec: Shop-Modell rein (Task 4), Tastatur/Gamepad-Navigation (Task 5), Maus (Task 4 über die Modellmethoden und `shopPointerEnabled`), graue Einträge (Task 4).
2. **Platzhalter:** keine; Szene in Task 9 vollständig, Verdrahtung in Task 10 als exakte Ersetzungen.
3. **Typkonsistenz:** `ShopModel`-Methoden (`move`, `activate`, `buyAction`, `toggleReady`, `setReady`, `selectCategory`, `selectRow`, `changeQty`, `maxQty`, `rows`, `categories`), `ShopNav.update`, `LocalShop` (`fromState`, `progress`, `isReady`, `buy`, `setReady`, `allReady`, `result`), `OnlineConnection` (`shop`, `shopReady`, `ranking`, `roundMs`, `onPhase`, `onShopState`, `shopBuy`, `setRoundMs`, `endSeries`) sind in Tests, Szene und Verdrahtung gleich benannt.
4. **Review Focus:** gehaltene Aktionstaste (Task 5, erster Frame), Menge über freiem Bestand (Task 4), kaputter `shopState` (Task 7), Splitscreen-Bereit (Task 6), Rückkehr in den Shop (Task 7 Auflösung über `onShopState`, Task 10 manuell).
