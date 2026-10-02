# PfandRaiders Phase 2 (Diebstahl und lokaler Splitscreen) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 2 bis 4 Spieler spielen lokal im Splitscreen (Tastatur und Gamepad). Sie können einander beim Suchen bestehlen. Ein einmaliges Special Item, der Bolzenschneider, erlaubt den Sofort-Diebstahl.

**Architecture:** `core` bekommt Diebstahl (`theft.ts`), das Special Item (Kauf im Shop) und drei neue Spielerfelder. Der Client bekommt Eingabequellen (Tastatur-Layouts, Gamepad), eine Lobby-Szene zum Beitreten, eine Splitscreen-Aufteilung mit je einer Kamera und einer HUD-Gruppe pro Spieler. Spiellogik bleibt komplett in `core`. Der Client kennt keine Regeln.

**Tech Stack:** wie Phase 1 (TypeScript, Vitest, Vite, Phaser 3 mit Gamepad-Plugin).

**Spec:** `docs/superpowers/specs/2026-10-02-pfandraiders-design.md` (§4 Diebstahl, Special Item; §1 lokaler Modus; §6 Phase 2; §9 Risiko Splitscreen)

**Vorarbeit:** Phase 1 ist auf `master` gemerged. Arbeit auf einem neuen Branch `phase-2-diebstahl-splitscreen` von `master`.

## Entscheidungen zum Plan (die Spec ist dort still, bitte beim Lesen prüfen)

1. **Taste:** Klauen läuft über dieselbe Aktionstaste wie Suchen und Abgeben. Vorrang: Abgeben (Taste neu gedrückt am Automaten) vor Klauen vor Suchen.
2. **Wer kann klauen:** Nur wer gerade nicht sucht. Zwei Spieler, die am selben Spot suchen, beklauen sich nicht von selbst. Wer frei ist (Zustand `walking`) und die Aktionstaste hält, nahe an einem suchenden Opfer, klaut statt zu suchen.
3. **"Berührt oder getroffen" aus der Spec:** Phase 2 hat keinen Nahkampf. Der Diebstahl bricht ab, wenn der Dieb sich bewegt oder die Taste loslässt, das Opfer die Suche beendet (Loslassen oder Weglaufen) oder jemand außer Reichweite gerät. Aktive Abwehr kommt frühestens mit Phase 3.
4. **Beute:** 50 % des Opfer-Containers, aufgerundet, wertvollste Flaschen zuerst, begrenzt durch den freien Platz des Diebs. Ist der Container des Diebs voll, kann er nicht klauen. Hat das Opfer nichts im Container, ist kein Diebstahl möglich.
5. **Schutzzeit:** Nach einem erfolgreichen Diebstahl ist das Opfer 3 s lang geschützt (`CONFIG.steal.shieldMs`), sonst könnte man es sofort leerklauen.
6. **Bolzenschneider:** Im Shop für 6,00 € kaufbar (Taste `2`), ein Slot, einmalig. Beim neuen Drücken der Aktionstaste nahe einem gültigen Opfer klaut er sofort 100 %, wiederum begrenzt durch den freien Platz des Diebs. Das Item verbraucht sich nur, wenn der Diebstahl wirklich passiert.
7. **Tastaturbelegung:** Tastatur 1: `WASD`, `E` Aktion, `1` Container-Upgrade, `2` Bolzenschneider. Tastatur 2: Pfeiltasten, `Enter` Aktion, `,` Upgrade, `.` Bolzenschneider. Gamepad: linker Stick oder Steuerkreuz laufen, `A` Aktion, `X` Upgrade, `Y` Bolzenschneider. Beitreten in der Lobby mit der Aktionstaste des Geräts, Start mit Leertaste oder Start-Taste des Gamepads. Die Pfeiltasten-/Leertaste-Alternative für einen einzelnen Spieler aus Phase 1 entfällt, ein Spieler wählt in der Lobby Tastatur 1 oder 2.
8. **Bildschirm:** Spielfläche wird 480 x 270. Ein Spieler sieht die ganze Höhe der Karte fast vollständig (30 x 17 Kacheln sichtbar), bei 2 Spielern zwei Hälften, bei 3 bis 4 Spielern Viertel (bei 3 bleibt das vierte leer). Kamera-Zoom bleibt 1.
9. **Gamepad ist nicht automatisiert testbar.** Die Abbildung von Knöpfen auf Eingaben ist als reine Funktion getestet, die echte Hardware prüft der Entwickler am Ende von Task 10 von Hand.

## Global Constraints

- `core` darf weder Phaser noch DOM noch Netzwerk importieren, kein `Math.random` (nur `rng.ts`). Alle Spielwerte (Radius, Dauer, Anteil, Schutzzeit, Itempreis) nur in `packages/core/src/config.ts`.
- Geld ist ganzzahlig in Cent. Formatierung nur im Client.
- `step` verändert den Zustand direkt und gibt ihn zurück. Spieler ohne Eingabe bekommen `NO_INPUT`.
- Diebstahl nur, wenn das Opfer im Zustand `searching` ist (Spec §4).
- Standarddiebstahl: Dieb steht beim Opfer, hält die Taste 2000 ms, Opfer wird gewarnt, Dieb erhält 50 %. Bolzenschneider: 100 % sofort.
- Lokal 2 bis 4 Spieler, jeder mit eigener Kamera. Kein Mischmodus lokal plus online.
- Commit-Nachrichten enden mit der Zeile `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Tests in `packages/client` dürfen Phaser nicht importieren (nur reine Logik testen).

## Review Focus

- Zwei Spieler suchen am selben Spot und halten beide die Aktionstaste: keiner beklaut den anderen (Task 3).
- Dieb mit vollem Container oder Opfer mit leerem Container: Diebstahl startet nicht, nichts geht verloren (Task 3).
- Opfer lässt die Taste los oder läuft weg, Dieb läuft los oder lässt los: Fortschritt ist weg, es wird nichts gestohlen (Task 3).
- Nach einem Diebstahl kein sofortiger Folgediebstahl (Schutzzeit), und sie läuft herunter (Task 3).
- Bolzenschneider: nur bei gültigem Opfer verbraucht, Beute durch freien Platz des Diebs begrenzt, Kauf bei zu wenig Geld, belegtem Slot oder zu weit vom Shop abgelehnt (Tasks 2, 3).
- Viewports bei 1 bis 4 Spielern liegen komplett im Bild und überlappen nicht (Task 6).
- Gamepad: Stick-Totzone, Kauftasten lösen nur einmal pro Druck aus (Task 7).
- Ein Spieler, der Gamepad abzieht, lässt das Spiel nicht abstürzen (Task 9, Handtest).

---

## File Structure

```
packages/core/src/
  types.ts        ändern: ItemId, BuyCommand, Mode 'stealing', Player-Felder, Input.buy
  config.ts       ändern: steal, items
  game.ts         ändern: neue Spielerfelder, doppelte ids ablehnen
  economy.ts      ändern: tryBuyItem, tryBuy
  search.ts       ändern: cancelSearch setzt mode nicht mehr
  theft.ts        neu: Diebstahl
  step.ts         ändern: updatePlayer neu, Schutzzeit, Modus-Sync
  index.ts        ändern: Export theft
packages/core/test/
  helpers.ts      ändern: THIEF_ROWS
  steal-config.test.ts  neu
  game.test.ts    ändern: neue Felder, doppelte ids
  economy.test.ts ändern: Bolzenschneider kaufen
  theft.test.ts   neu
  determinism-theft.test.ts  neu
packages/client/src/
  input.ts        ändern: KeyState (buyUpgrade, buyItem)
  sources.ts      neu: InputSource, padToHeld, EdgeTracker (rein)
  devices.ts      neu: Tastatur-Layouts, KeyboardSource, GamepadSource, DeviceRef, PlayerSlot (Phaser)
  layout.ts       neu: viewportsFor (rein)
  text.ts         neu: HUD-Texte (rein)
  hud.ts          neu: PlayerHud (Phaser)
  main.ts         ändern: 480x270, Gamepad, Szenen
  scenes/LobbyScene.ts  neu
  scenes/GameScene.ts   ändern: N Spieler
packages/client/test/
  input.test.ts (ändern)  sources.test.ts  layout.test.ts  text.test.ts
README.md         ändern
```

---

### Task 1: Datenmodell für Diebstahl und Item

**Files:**
- Modify: `packages/core/src/types.ts`, `packages/core/src/config.ts`, `packages/core/src/game.ts`
- Create: `packages/core/test/steal-config.test.ts`
- Modify: `packages/core/test/game.test.ts`

**Interfaces:**
- Produces: Typen `ItemId = 'bolt_cutters'`, `BuyCommand = 'upgrade' | ItemId`; `Mode` um `'stealing'`; `Input.buy: BuyCommand | null`; Spielerfelder `item: ItemId | null`, `stealTargetId: string | null`, `stealProgressMs: number`, `shieldMs: number`; `CONFIG.steal = { radius, durationMs, fraction, shieldMs }`; `CONFIG.items.bolt_cutters = { name, price }`; `createGame` wirft bei doppelten ids.

- [ ] **Step 1: Failing Tests schreiben**

`packages/core/test/steal-config.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { CONFIG, TILE } from '../src/config';

describe('steal and item config', () => {
  it('has sane theft values', () => {
    expect(CONFIG.steal.radius).toBeGreaterThan(0);
    expect(CONFIG.steal.radius).toBeLessThanOrEqual(2 * CONFIG.interactRadius); // Dieb und Opfer müssen sich sehen können
    expect(CONFIG.steal.durationMs).toBeGreaterThan(0);
    expect(CONFIG.steal.fraction).toBeGreaterThan(0);
    expect(CONFIG.steal.fraction).toBeLessThanOrEqual(1);
    expect(CONFIG.steal.shieldMs).toBeGreaterThan(0);
  });

  it('has a priced bolt cutters item', () => {
    expect(CONFIG.items.bolt_cutters.price).toBeGreaterThan(0);
    expect(CONFIG.items.bolt_cutters.name.length).toBeGreaterThan(0);
  });

  it('keeps the steal radius within a tile and a half so players must really be next to each other', () => {
    expect(CONFIG.steal.radius).toBeLessThanOrEqual(TILE * 1.5);
  });
});
```

An `packages/core/test/game.test.ts` in der bestehenden `describe('createGame', ...)` zwei Tests ergänzen (vor der schließenden `});` des describe-Blocks):
```ts
  it('starts players without item, theft state or shield', () => {
    const s = createGame(1, CITY_MAP, ['a']);
    expect(s.players.a).toMatchObject({
      item: null,
      stealTargetId: null,
      stealProgressMs: 0,
      shieldMs: 0,
    });
  });

  it('refuses duplicate player ids', () => {
    expect(() => createGame(1, CITY_MAP, ['a', 'a'])).toThrow(/duplicate/);
  });
```

- [ ] **Step 2: Tests laufen lassen, Fehlschlag prüfen**

Run: `npm test -w @pfandraiders/core -- test/steal-config.test.ts test/game.test.ts`
Expected: FAIL (`CONFIG.steal` undefined, neue Felder fehlen, kein `duplicate`-Fehler).

- [ ] **Step 3: Typen ändern**

In `packages/core/src/types.ts`:

Zeile `export type Mode = 'walking' | 'searching';` ersetzen durch:
```ts
export type Mode = 'walking' | 'searching' | 'stealing';
export type ItemId = 'bolt_cutters';
/** Kaufbefehl: 'upgrade' = nächste Container-Stufe, sonst ein Special Item */
export type BuyCommand = 'upgrade' | ItemId;
```

Im Interface `Input` die Zeile `buy: 'upgrade' | null;` ersetzen durch `buy: BuyCommand | null;`.

Im Interface `Player` nach `actionHeld: boolean;` einfügen:
```ts
  /** Special Item im einzigen Slot, null = keins */
  item: ItemId | null;
  /** Opfer, das gerade bestohlen wird */
  stealTargetId: string | null;
  stealProgressMs: number;
  /** Restzeit des Schutzes nach einem Diebstahl, 0 = angreifbar */
  shieldMs: number;
```

- [ ] **Step 4: Config ändern**

In `packages/core/src/config.ts` die erste Zeile ersetzen durch:
```ts
import type { BottleKind, ItemId, SpotType } from './types';
```
und nach der Zeile `upgradePrices: [150, 400, 900],` einfügen:
```ts
  /** Diebstahl */
  steal: {
    /** größter Abstand Dieb zu Opfer in Pixeln */
    radius: 20,
    /** so lange hält der Dieb die Taste */
    durationMs: 2000,
    /** Anteil des Opfer-Containers */
    fraction: 0.5,
    /** Schutz des Opfers nach einem Diebstahl */
    shieldMs: 3000,
  },
  items: {
    bolt_cutters: { name: 'Bolzenschneider', price: 600 },
  } as Record<ItemId, { name: string; price: number }>,
```

- [ ] **Step 5: `createGame` ändern**

In `packages/core/src/game.ts`: In `createGame` direkt nach der Zeile `if (map.spawns.length === 0) throw new Error('map has no spawn point');` einfügen:
```ts
  if (new Set(playerIds).size !== playerIds.length) throw new Error('duplicate player id');
```
In `newPlayer` nach `actionHeld: false,` einfügen:
```ts
    item: null,
    stealTargetId: null,
    stealProgressMs: 0,
    shieldMs: 0,
```

- [ ] **Step 6: Tests und Typecheck**

Run: `npm test -w @pfandraiders/core && npm run typecheck -w @pfandraiders/core`
Expected: PASS, Typecheck sauber. (Der Client-Typecheck bleibt grün, `buy: 'upgrade' | null` aus `buildInput` ist weiterhin gültig.)

- [ ] **Step 7: Commit**

```bash
git add packages/core
git commit -m "feat(core): add item and theft state to player model

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Special Item kaufen

**Files:**
- Modify: `packages/core/src/economy.ts`, `packages/core/src/step.ts`
- Modify: `packages/core/test/economy.test.ts`

**Interfaces:**
- Consumes: `ItemId`, `BuyCommand`, `CONFIG.items` aus Task 1.
- Produces: `tryBuyItem(state, p, item): boolean`, `tryBuy(state, p, cmd): boolean` in `economy.ts`.

- [ ] **Step 1: Failing Tests schreiben**

Am Ende von `packages/core/test/economy.test.ts` anhängen (die Hilfsfunktionen `atShop()` und die Imports stehen dort bereits; `newGame`, `SEARCH_ROWS`, `input`, `runSteps`, `CONFIG` sind importiert):
```ts
describe('special item', () => {
  const BUY_ITEM = { p1: input({ buy: 'bolt_cutters' }) };

  it('buys the bolt cutters at the shop', () => {
    const s = atShop();
    s.players.p1.money = CONFIG.items.bolt_cutters.price + 50;
    runSteps(s, BUY_ITEM, 1);
    expect(s.players.p1.item).toBe('bolt_cutters');
    expect(s.players.p1.money).toBe(50);
  });

  it('refuses when money is short by one cent', () => {
    const s = atShop();
    s.players.p1.money = CONFIG.items.bolt_cutters.price - 1;
    runSteps(s, BUY_ITEM, 1);
    expect(s.players.p1.item).toBeNull();
    expect(s.players.p1.money).toBe(CONFIG.items.bolt_cutters.price - 1);
  });

  it('refuses when the item slot is already taken', () => {
    const s = atShop();
    s.players.p1.item = 'bolt_cutters';
    s.players.p1.money = 100_000;
    runSteps(s, BUY_ITEM, 1);
    expect(s.players.p1.money).toBe(100_000);
  });

  it('refuses away from the shop', () => {
    const s = newGame(SEARCH_ROWS); // Spawn ist weit vom Shop
    s.players.p1.money = 100_000;
    runSteps(s, BUY_ITEM, 1);
    expect(s.players.p1.item).toBeNull();
    expect(s.players.p1.money).toBe(100_000);
  });

  it('keeps the container upgrade working next to the item purchase', () => {
    const s = atShop();
    s.players.p1.money = 100_000;
    runSteps(s, { p1: input({ buy: 'upgrade' }) }, 1);
    expect(s.players.p1.containerLevel).toBe(1);
    expect(s.players.p1.item).toBeNull();
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `npm test -w @pfandraiders/core -- test/economy.test.ts`
Expected: FAIL (`bolt_cutters` wird nicht gekauft: Item bleibt `null`).

- [ ] **Step 3: `economy.ts` erweitern**

In `packages/core/src/economy.ts` die Zeile `import type { GameState, Player, Point } from './types';` ersetzen durch:
```ts
import type { BuyCommand, GameState, ItemId, Player, Point } from './types';
```
und am Dateiende anhängen:
```ts
/** Kauft ein Special Item, wenn Shop in Reichweite, Slot frei und Geld reicht. */
export function tryBuyItem(state: GameState, p: Player, item: ItemId): boolean {
  if (!isNear(state.map.shops, p)) return false;
  if (p.item !== null) return false;
  const price = CONFIG.items[item].price;
  if (p.money < price) return false;
  p.money -= price;
  p.item = item;
  return true;
}

export function tryBuy(state: GameState, p: Player, cmd: BuyCommand): boolean {
  return cmd === 'upgrade' ? tryUpgrade(state, p) : tryBuyItem(state, p, cmd);
}
```

- [ ] **Step 4: `step.ts` anpassen**

In `packages/core/src/step.ts` den Import `import { deposit, isNear, tryUpgrade } from './economy';` ersetzen durch `import { deposit, isNear, tryBuy } from './economy';` und die Zeile `if (input.buy === 'upgrade') tryUpgrade(state, p);` ersetzen durch:
```ts
  if (input.buy !== null) tryBuy(state, p, input.buy);
```

- [ ] **Step 5: Tests und Typecheck**

Run: `npm test -w @pfandraiders/core && npm run typecheck -w @pfandraiders/core`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core
git commit -m "feat(core): buy the bolt cutters at the shop

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Diebstahl

**Files:**
- Create: `packages/core/src/theft.ts`
- Modify: `packages/core/src/search.ts`, `packages/core/src/step.ts`, `packages/core/src/index.ts`
- Modify: `packages/core/test/helpers.ts`
- Test: `packages/core/test/theft.test.ts`

**Interfaces:**
- Consumes: Task 1 und 2.
- Produces: in `theft.ts`: `cancelSteal(p)`, `canBeRobbed(thief, victim): boolean`, `findStealTarget(state, thief): Player | null`, `isBeingRobbed(state, victimId): boolean`, `updateSteal(state, thief, pressed, dtMs): boolean`. `Player.mode` wird am Ende jedes Spielerupdates aus `stealTargetId`/`searchSpotId` abgeleitet. `cancelSearch` ändert `mode` nicht mehr.
- Hilfen in `helpers.ts`: `THIEF_ROWS`.

Regelkurzfassung (siehe "Entscheidungen" oben): Opfer muss `searching` sein, nicht geschützt, Flaschen im Container haben und höchstens `CONFIG.steal.radius` entfernt sein. Dieb darf nicht gerade selbst suchen, muss freien Platz haben und die Aktionstaste halten. Nach `durationMs` bekommt er `ceil(Anteil)` der Opfer-Flaschen, begrenzt durch seinen freien Platz. Opfer ist danach `shieldMs` geschützt.

- [ ] **Step 1: Hilfsdaten ergänzen**

In `packages/core/test/helpers.ts` unterhalb von `TWO_PLAYER_ROWS` einfügen:
```ts
/** p1 (x=24) steht 16 px neben p2 (x=40). Der Spot (x=56) liegt nur bei p2 in Reichweite. */
export const THIEF_ROWS = ['#########', '#@@b.D.S#', '#########'];
```

- [ ] **Step 2: Failing Tests schreiben**

`packages/core/test/theft.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { totalBottles } from '../src/bottles';
import { CONFIG } from '../src/config';
import { isBeingRobbed } from '../src/theft';
import { input, newGame, runFor, runSteps, setSpot, teleport, THIEF_ROWS } from './helpers';

const BOTH_HOLD = { p1: input({ action: true }), p2: input({ action: true }) };

/** p2 sucht und trägt 4 Plastik (Tasche, 8 Plätze). p1 ist Dieb mit leeren Händen (3 Plätze). */
function setup() {
  const s = newGame(THIEF_ROWS, ['p1', 'p2']);
  setSpot(s, 0, { plastic: 1 });
  s.players.p2.containerLevel = 1;
  s.players.p2.bottles = { plastic: 4, glass: 0, crate: 0 };
  return s;
}

describe('stealing', () => {
  it('takes half of the victim container after the steal time', () => {
    const s = setup();
    runFor(s, BOTH_HOLD, CONFIG.steal.durationMs + 300);
    expect(s.players.p1.bottles.plastic).toBe(2);
    expect(s.players.p2.bottles.plastic).toBe(2);
    expect(s.players.p2.shieldMs).toBeGreaterThan(0);
    expect(s.players.p1.mode).toBe('walking');
    expect(s.players.p2.mode).toBe('searching'); // seine Suche läuft weiter
  });

  it('warns the victim while the steal is in progress', () => {
    const s = setup();
    runSteps(s, BOTH_HOLD, 50);
    expect(s.players.p1.mode).toBe('stealing');
    expect(s.players.p1.stealTargetId).toBe('p2');
    expect(isBeingRobbed(s, 'p2')).toBe(true);
    expect(isBeingRobbed(s, 'p1')).toBe(false);
  });

  it('rounds the stolen amount up', () => {
    const s = setup();
    s.players.p2.bottles = { plastic: 3, glass: 0, crate: 0 };
    runFor(s, BOTH_HOLD, CONFIG.steal.durationMs + 300);
    expect(s.players.p1.bottles.plastic).toBe(2); // ceil(1.5)
    expect(s.players.p2.bottles.plastic).toBe(1);
  });

  it('takes the most valuable bottles first', () => {
    const s = setup();
    s.players.p2.bottles = { plastic: 2, glass: 1, crate: 1 };
    runFor(s, BOTH_HOLD, CONFIG.steal.durationMs + 300);
    expect(s.players.p1.bottles).toEqual({ plastic: 0, glass: 1, crate: 1 });
  });

  it('steals nothing from a victim who is not searching', () => {
    const s = setup();
    runFor(s, { p1: input({ action: true }), p2: input({}) }, CONFIG.steal.durationMs + 300);
    expect(totalBottles(s.players.p1.bottles)).toBe(0);
    expect(s.players.p2.bottles.plastic).toBe(4);
  });

  it('steals nothing from a victim with an empty container', () => {
    const s = setup();
    s.players.p2.bottles = { plastic: 0, glass: 0, crate: 0 };
    runFor(s, BOTH_HOLD, CONFIG.steal.durationMs + 300);
    expect(totalBottles(s.players.p1.bottles)).toBe(0);
    expect(s.players.p2.shieldMs).toBe(0);
    expect(s.players.p1.stealTargetId).toBeNull();
  });

  it('does not start with a full thief container and loses nothing', () => {
    const s = setup();
    s.players.p1.bottles = { plastic: 3, glass: 0, crate: 0 }; // Hände fassen 3
    runFor(s, BOTH_HOLD, CONFIG.steal.durationMs + 300);
    expect(s.players.p1.bottles.plastic).toBe(3);
    expect(s.players.p2.bottles.plastic).toBe(4);
    expect(s.players.p1.stealTargetId).toBeNull();
    expect(s.players.p1.mode).toBe('walking');
  });

  it('limits the loot to the free room of the thief', () => {
    const s = setup();
    s.players.p1.bottles = { plastic: 2, glass: 0, crate: 0 }; // 1 Platz frei
    runFor(s, BOTH_HOLD, CONFIG.steal.durationMs + 300);
    expect(s.players.p1.bottles.plastic).toBe(3);
    expect(s.players.p2.bottles.plastic).toBe(3);
  });

  it('aborts when the thief walks away and steals nothing', () => {
    const s = setup();
    runSteps(s, BOTH_HOLD, 50);
    runSteps(s, { p1: input({ action: true, moveX: -1 }), p2: input({ action: true }) }, 1);
    expect(s.players.p1.stealProgressMs).toBe(0);
    expect(s.players.p1.stealTargetId).toBeNull();
    expect(s.players.p1.mode).toBe('walking');
    expect(totalBottles(s.players.p1.bottles)).toBe(0);
  });

  it('aborts when the thief releases the key', () => {
    const s = setup();
    runSteps(s, BOTH_HOLD, 50);
    runSteps(s, { p1: input({}), p2: input({ action: true }) }, 1);
    expect(s.players.p1.stealProgressMs).toBe(0);
    expect(s.players.p1.mode).toBe('walking');
    expect(isBeingRobbed(s, 'p2')).toBe(false);
  });

  it('aborts when the victim stops searching', () => {
    const s = setup();
    runSteps(s, BOTH_HOLD, 50);
    runSteps(s, { p1: input({ action: true }), p2: input({}) }, 120); // Opfer lässt los
    expect(totalBottles(s.players.p1.bottles)).toBe(0);
    expect(s.players.p2.bottles.plastic).toBe(4);
    expect(s.players.p1.stealProgressMs).toBe(0);
  });

  it('aborts when the victim walks out of reach', () => {
    const s = setup();
    runSteps(s, BOTH_HOLD, 50);
    runSteps(s, { p1: input({ action: true }), p2: input({ moveX: 1, action: true }) }, 120);
    expect(totalBottles(s.players.p1.bottles)).toBe(0);
    expect(s.players.p2.bottles.plastic).toBe(4);
  });

  it('shields the victim so a second theft cannot follow at once', () => {
    const s = setup();
    runFor(s, BOTH_HOLD, CONFIG.steal.durationMs + 300);
    expect(s.players.p1.bottles.plastic).toBe(2);
    runSteps(s, BOTH_HOLD, 50); // weitere 1000 ms, Schutz dauert 3000 ms
    expect(s.players.p1.bottles.plastic).toBe(2);
    expect(s.players.p1.mode).not.toBe('stealing');
  });

  it('counts the shield down to zero', () => {
    const s = setup();
    s.players.p2.shieldMs = 100;
    runSteps(s, {}, 10, 20);
    expect(s.players.p2.shieldMs).toBe(0);
  });

  it('does not let two players who both search the same spot rob each other', () => {
    const s = setup();
    teleport(s, 'p1', { x: 44, y: 24 }); // jetzt auch p1 in Reichweite des Spots (x=56)
    for (let i = 0; i < 155; i++) {
      runSteps(s, BOTH_HOLD, 1);
      expect(s.players.p1.mode).not.toBe('stealing');
      expect(s.players.p2.mode).not.toBe('stealing');
    }
    expect(s.players.p2.bottles.plastic).toBeGreaterThanOrEqual(4); // nichts verloren
  });

  it('never steals from itself', () => {
    const s = setup();
    runFor(s, { p2: input({ action: true }) }, CONFIG.steal.durationMs + 300);
    expect(s.players.p2.stealTargetId).toBeNull();
  });
});

describe('bolt cutters', () => {
  /** p2 beginnt zu suchen (Schritt 1), p1 drückt die Aktionstaste neu (Schritt 2) */
  function useCutters(s: ReturnType<typeof setup>) {
    runSteps(s, { p2: input({ action: true }) }, 1);
    runSteps(s, BOTH_HOLD, 1);
  }

  it('steals everything at once and is used up', () => {
    const s = setup();
    s.players.p1.containerLevel = 3; // 30 Plätze
    s.players.p1.item = 'bolt_cutters';
    useCutters(s);
    expect(s.players.p1.bottles.plastic).toBe(4);
    expect(s.players.p2.bottles.plastic).toBe(0);
    expect(s.players.p1.item).toBeNull();
    expect(s.players.p2.shieldMs).toBeGreaterThan(0);
  });

  it('is limited by the free room of the thief', () => {
    const s = setup();
    s.players.p1.item = 'bolt_cutters'; // Hände: 3 Plätze
    useCutters(s);
    expect(s.players.p1.bottles.plastic).toBe(3);
    expect(s.players.p2.bottles.plastic).toBe(1);
    expect(s.players.p1.item).toBeNull();
  });

  it('is kept when there is no valid victim', () => {
    const s = setup();
    s.players.p1.item = 'bolt_cutters';
    s.players.p2.bottles = { plastic: 0, glass: 0, crate: 0 };
    useCutters(s);
    expect(s.players.p1.item).toBe('bolt_cutters');
  });

  it('is kept when the victim is shielded', () => {
    const s = setup();
    s.players.p1.item = 'bolt_cutters';
    s.players.p2.shieldMs = 5000;
    useCutters(s);
    expect(s.players.p1.item).toBe('bolt_cutters');
    expect(s.players.p2.bottles.plastic).toBe(4);
  });

  it('is not used when the key is only held and not pressed', () => {
    const s = setup();
    s.players.p1.item = 'bolt_cutters';
    // p1 hält die Taste von Anfang an, drückt sie also nie "neu" während p2 sucht
    runSteps(s, BOTH_HOLD, 10);
    expect(s.players.p1.item).toBe('bolt_cutters');
    expect(s.players.p1.mode).toBe('stealing'); // normaler Diebstahl läuft stattdessen
  });
});
```

- [ ] **Step 3: Tests laufen lassen, Fehlschlag prüfen**

Run: `npm test -w @pfandraiders/core -- test/theft.test.ts`
Expected: FAIL, "Failed to resolve import ../src/theft".

- [ ] **Step 4: `theft.ts` schreiben**

`packages/core/src/theft.ts`:
```ts
import { totalBottles, transferBottles } from './bottles';
import { CONFIG } from './config';
import { capacityOf, distance } from './economy';
import type { GameState, Player } from './types';

export function cancelSteal(p: Player): void {
  p.stealTargetId = null;
  p.stealProgressMs = 0;
}

/** Kann `victim` jetzt von `thief` bestohlen werden? */
export function canBeRobbed(thief: Player, victim: Player): boolean {
  return (
    victim.id !== thief.id &&
    victim.mode === 'searching' &&
    victim.shieldMs === 0 &&
    totalBottles(victim.bottles) > 0 &&
    distance(thief, victim) <= CONFIG.steal.radius
  );
}

/** Nächstes gültiges Opfer in Reichweite. Gleichstand: Reihenfolge der Spieler. */
export function findStealTarget(state: GameState, thief: Player): Player | null {
  let best: Player | null = null;
  let bestDist = Infinity;
  for (const id of Object.keys(state.players)) {
    const victim = state.players[id];
    if (!canBeRobbed(thief, victim)) continue;
    const d = distance(thief, victim);
    if (d < bestDist) {
      best = victim;
      bestDist = d;
    }
  }
  return best;
}

/** Läuft gerade ein Diebstahl gegen diesen Spieler? Für die Warnung im Client. */
export function isBeingRobbed(state: GameState, victimId: string): boolean {
  return Object.values(state.players).some(
    (p) => p.stealTargetId === victimId && p.stealProgressMs > 0,
  );
}

function takeLoot(thief: Player, victim: Player, fraction: number): void {
  const want = Math.ceil(totalBottles(victim.bottles) * fraction);
  const room = capacityOf(thief) - totalBottles(thief.bottles);
  const count = Math.max(0, Math.min(want, room));
  transferBottles(victim.bottles, thief.bottles, totalBottles(thief.bottles) + count);
  victim.shieldMs = CONFIG.steal.shieldMs;
}

/**
 * Ein Diebstahlschritt für einen Spieler, der die Aktionstaste hält und stillsteht.
 * Gibt true zurück, wenn er gerade klaut (oder in diesem Schritt fertig geworden ist).
 * `pressed` ist true im Schritt, in dem die Taste neu gedrückt wurde (löst den Bolzenschneider aus).
 * Bei false verändert die Funktion nichts außer einem veralteten Ziel, das der Aufrufer mit cancelSteal löscht.
 */
export function updateSteal(
  state: GameState,
  thief: Player,
  pressed: boolean,
  dtMs: number,
): boolean {
  if (totalBottles(thief.bottles) >= capacityOf(thief)) return false;

  const current = thief.stealTargetId === null ? undefined : state.players[thief.stealTargetId];
  let target: Player | null = null;
  if (current !== undefined && canBeRobbed(thief, current)) {
    target = current;
  } else if (thief.mode !== 'searching') {
    // Wer gerade selbst sucht, wechselt nicht zum Klauen.
    target = findStealTarget(state, thief);
  }
  if (target === null) return false;

  if (thief.item === 'bolt_cutters' && pressed) {
    takeLoot(thief, target, 1);
    thief.item = null;
    cancelSteal(thief);
    return true;
  }

  if (thief.stealTargetId !== target.id) {
    thief.stealTargetId = target.id;
    thief.stealProgressMs = 0;
  }
  thief.stealProgressMs += dtMs;
  if (thief.stealProgressMs >= CONFIG.steal.durationMs) {
    takeLoot(thief, target, CONFIG.steal.fraction);
    cancelSteal(thief);
  }
  return true;
}
```

- [ ] **Step 5: `search.ts` anpassen**

In `packages/core/src/search.ts`:
- In `cancelSearch` die Zeile `p.mode = 'walking';` entfernen. Die Funktion lautet danach:
```ts
export function cancelSearch(p: Player): void {
  p.searchSpotId = null;
  p.searchProgressMs = 0;
}
```
- In `updateSearch` die Zeile `p.mode = 'searching';` entfernen. (Den Modus leitet `step.ts` am Ende jedes Spielerupdates ab.)

- [ ] **Step 6: `step.ts` auf die Endfassung bringen**

`packages/core/src/step.ts` komplett ersetzen durch:
```ts
import { CONFIG } from './config';
import { deposit, isNear, tryBuy } from './economy';
import { walk } from './movement';
import { cancelSearch, refillSpot, updateSearch } from './search';
import { cancelSteal, updateSteal } from './theft';
import { NO_INPUT } from './types';
import type { GameState, Input, Player } from './types';

/**
 * Ein Simulationsschritt. Verändert `state` direkt und gibt ihn zurück.
 * Spieler ohne Eintrag in `inputs` bekommen NO_INPUT.
 */
export function step(
  state: GameState,
  inputs: Record<string, Input>,
  dtMs: number,
): GameState {
  if (state.phase === 'ended') return state;
  const dt = Math.min(Math.max(dtMs, 0), CONFIG.maxStepMs);
  state.tick++;

  for (const id of Object.keys(state.players)) {
    updatePlayer(state, state.players[id], inputs[id] ?? NO_INPUT, dt);
  }

  for (const spot of state.spots) refillSpot(state, spot, dt);

  state.timeLeftMs -= dt;
  if (state.timeLeftMs <= 0) {
    state.timeLeftMs = 0;
    state.phase = 'ended';
  }
  return state;
}

function updatePlayer(state: GameState, p: Player, input: Input, dt: number): void {
  const pressed = input.action && !p.actionHeld;
  p.actionHeld = input.action;
  p.shieldMs = Math.max(0, p.shieldMs - dt);

  if (input.buy !== null) tryBuy(state, p, input.buy);

  let deposited = false;
  if (pressed && isNear(state.map.dropoffs, p)) {
    deposit(p);
    deposited = true;
  }

  if (input.moveX !== 0 || input.moveY !== 0) {
    cancelSearch(p);
    cancelSteal(p);
    walk(state.map, p, input, dt);
  } else if (input.action && !deposited && updateSteal(state, p, pressed, dt)) {
    cancelSearch(p);
  } else if (input.action && !deposited && updateSearch(state, p, dt)) {
    cancelSteal(p);
  } else {
    cancelSearch(p);
    cancelSteal(p);
  }

  p.mode =
    p.stealTargetId !== null ? 'stealing' : p.searchSpotId !== null ? 'searching' : 'walking';
}
```

- [ ] **Step 7: Export ergänzen**

In `packages/core/src/index.ts` die Zeile `export * from './search';` ergänzen um darunter:
```ts
export * from './theft';
```

- [ ] **Step 8: Alle Tests und Typecheck**

Run: `npm test -w @pfandraiders/core && npm run typecheck -w @pfandraiders/core`
Expected: PASS, auch alle Phase-1-Tests (Suche, Abgeben, Determinismus). Schlägt ein bestehender Test wegen des Modus fehl, ist die Ursache fast sicher ein Verlassen auf `cancelSearch` als Modus-Setzer: dann den Test nicht ändern, sondern prüfen, ob `p.mode` am Ende von `updatePlayer` gesetzt wird.

- [ ] **Step 9: Commit**

```bash
git add packages/core
git commit -m "feat(core): add theft between searching players and bolt cutters

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Determinismus mit Diebstahl

**Files:**
- Test: `packages/core/test/determinism-theft.test.ts`

**Interfaces:**
- Consumes: Task 3, `THIEF_ROWS`.

- [ ] **Step 1: Test schreiben**

`packages/core/test/determinism-theft.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { totalBottles } from '../src/bottles';
import { createGame } from '../src/game';
import { parseMap } from '../src/map';
import { step } from '../src/step';
import type { GameState } from '../src/types';
import { input, THIEF_ROWS } from './helpers';

function base(seed: number): GameState {
  const s = createGame(seed, parseMap(THIEF_ROWS), ['p1', 'p2'], { roundMs: 60000 });
  s.spots[0].contents = { plastic: 1, glass: 0, crate: 0 };
  s.spots[0].refillInMs = 0;
  s.players.p2.containerLevel = 1;
  s.players.p2.bottles = { plastic: 4, glass: 0, crate: 0 };
  return s;
}

/** Normaler Diebstahl über 2 Sekunden */
function normalTheft(seed: number): GameState {
  const s = base(seed);
  for (let t = 0; t < 200; t++) {
    step(s, { p1: input({ action: true }), p2: input({ action: true }) }, 20);
  }
  return s;
}

/** Sofort-Diebstahl mit dem Bolzenschneider */
function cutters(seed: number): GameState {
  const s = base(seed);
  s.players.p1.containerLevel = 3;
  s.players.p1.item = 'bolt_cutters';
  step(s, { p2: input({ action: true }) }, 20);
  for (let t = 0; t < 200; t++) {
    step(s, { p1: input({ action: t === 0 }), p2: input({ action: true }) }, 20);
  }
  return s;
}

describe('determinism with theft', () => {
  it('replays a normal theft identically and the theft really happened', () => {
    const a = normalTheft(7);
    const b = normalTheft(7);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(totalBottles(a.players.p1.bottles)).toBe(2);
    expect(a.players.p2.shieldMs).toBeGreaterThan(0);
  });

  it('replays a bolt cutters theft identically and the item was used', () => {
    const a = cutters(7);
    const b = cutters(7);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(totalBottles(a.players.p1.bottles)).toBe(4);
    expect(a.players.p1.item).toBeNull();
  });
});
```

- [ ] **Step 2: Test laufen lassen**

Run: `npm test -w @pfandraiders/core -- test/determinism-theft.test.ts`
Expected: PASS. Schlägt ein Gleichheitstest fehl, steckt Nicht-Determinismus im Core (zum Beispiel Objektreihenfolge). Ursache beheben, Test nicht lockern. Schlägt nur eine Zählung fehl, stimmt das Szenario nicht mit den Regeln überein: Ursache klären, nicht die Zahl anpassen.

- [ ] **Step 3: Commit**

```bash
git add packages/core/test/determinism-theft.test.ts
git commit -m "test(core): pin determinism of theft and bolt cutters

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Eingabe mit zwei Kauftasten

**Files:**
- Modify: `packages/client/src/input.ts`, `packages/client/test/input.test.ts`
- Modify: `packages/client/src/scenes/GameScene.ts` (nur damit der Typecheck grün bleibt, siehe Step 4)

**Interfaces:**
- Produces: `KeyState = { left, right, up, down, action: boolean; buyUpgrade: boolean; buyItem: boolean }` (Kauftasten nur im Frame des neuen Drückens true). `buildInput(k): Input` mit `buy: 'upgrade' | 'bolt_cutters' | null`. Bei beiden Kauftasten gewinnt das Upgrade.

- [ ] **Step 1: Failing Tests schreiben**

`packages/client/test/input.test.ts` komplett ersetzen:
```ts
import { describe, expect, it } from 'vitest';
import { buildInput } from '../src/input';

const NONE = {
  left: false,
  right: false,
  up: false,
  down: false,
  action: false,
  buyUpgrade: false,
  buyItem: false,
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

  it('passes the action through', () => {
    expect(buildInput({ ...NONE, action: true })).toMatchObject({ action: true, buy: null });
  });

  it('maps the buy keys', () => {
    expect(buildInput({ ...NONE, buyUpgrade: true })).toMatchObject({ buy: 'upgrade' });
    expect(buildInput({ ...NONE, buyItem: true })).toMatchObject({ buy: 'bolt_cutters' });
  });

  it('prefers the upgrade when both buy keys come in the same frame', () => {
    expect(buildInput({ ...NONE, buyUpgrade: true, buyItem: true })).toMatchObject({ buy: 'upgrade' });
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `npm test -w @pfandraiders/client -- test/input.test.ts`
Expected: FAIL (`buyUpgrade` unbekannt, `buy` bleibt `null`).

- [ ] **Step 3: `input.ts` ersetzen**

`packages/client/src/input.ts`:
```ts
import type { Input } from '@pfandraiders/core';

export interface KeyState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  action: boolean;
  /** true nur im Frame, in dem die Taste neu gedrückt wurde */
  buyUpgrade: boolean;
  /** true nur im Frame, in dem die Taste neu gedrückt wurde */
  buyItem: boolean;
}

function axis(negative: boolean, positive: boolean): -1 | 0 | 1 {
  return ((positive ? 1 : 0) - (negative ? 1 : 0)) as -1 | 0 | 1;
}

export function buildInput(k: KeyState): Input {
  return {
    moveX: axis(k.left, k.right),
    moveY: axis(k.up, k.down),
    action: k.action,
    buy: k.buyUpgrade ? 'upgrade' : k.buyItem ? 'bolt_cutters' : null,
  };
}
```

- [ ] **Step 4: `GameScene.ts` kompilierbar halten**

In `packages/client/src/scenes/GameScene.ts` im Aufruf `buildInput({ ... })` die Zeile `buy: Phaser.Input.Keyboard.JustDown(k.ONE),` ersetzen durch:
```ts
        buyUpgrade: Phaser.Input.Keyboard.JustDown(k.ONE),
        buyItem: false,
```
(Task 10 ersetzt die Szene ohnehin vollständig.)

- [ ] **Step 5: Tests und Typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/client
git commit -m "feat(client): map a second buy key for special items

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Splitscreen-Aufteilung

**Files:**
- Create: `packages/client/src/layout.ts`
- Test: `packages/client/test/layout.test.ts`

**Interfaces:**
- Produces: `interface Rect { x: number; y: number; w: number; h: number }`, `GAME_W = 480`, `GAME_H = 270`, `viewportsFor(n: number, width = GAME_W, height = GAME_H, gap = 2): Rect[]`. 1 Spieler: ganzes Bild. 2: linke und rechte Hälfte. 3 und 4: Viertel in der Reihenfolge links oben, rechts oben, links unten, rechts unten. Wirft bei n außerhalb 1 bis 4 oder nicht ganzzahlig.

- [ ] **Step 1: Failing Tests schreiben**

`packages/client/test/layout.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { GAME_H, GAME_W, viewportsFor } from '../src/layout';
import type { Rect } from '../src/layout';

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

describe('viewportsFor', () => {
  it('gives one player the whole screen', () => {
    expect(viewportsFor(1)).toEqual([{ x: 0, y: 0, w: GAME_W, h: GAME_H }]);
  });

  it('splits two players into a left and a right half with a gap', () => {
    const [a, b] = viewportsFor(2);
    expect(a).toMatchObject({ x: 0, y: 0, h: GAME_H });
    expect(b).toMatchObject({ y: 0, h: GAME_H });
    expect(b.x).toBe(a.w + 2);
    expect(b.x + b.w).toBe(GAME_W);
  });

  it('gives three and four players quarters in reading order', () => {
    const four = viewportsFor(4);
    expect(four).toHaveLength(4);
    expect(four[0]).toMatchObject({ x: 0, y: 0 });
    expect(four[1].x).toBeGreaterThan(0);
    expect(four[1].y).toBe(0);
    expect(four[2].x).toBe(0);
    expect(four[2].y).toBeGreaterThan(0);
    expect(four[3].x).toBeGreaterThan(0);
    expect(four[3].y).toBeGreaterThan(0);
    expect(viewportsFor(3)).toEqual(four.slice(0, 3));
  });

  it.each([1, 2, 3, 4])('keeps %i viewports inside the screen and apart from each other', (n) => {
    const views = viewportsFor(n);
    for (const v of views) {
      expect(v.w).toBeGreaterThan(0);
      expect(v.h).toBeGreaterThan(0);
      expect(v.x).toBeGreaterThanOrEqual(0);
      expect(v.y).toBeGreaterThanOrEqual(0);
      expect(v.x + v.w).toBeLessThanOrEqual(GAME_W);
      expect(v.y + v.h).toBeLessThanOrEqual(GAME_H);
    }
    for (let i = 0; i < views.length; i++) {
      for (let j = i + 1; j < views.length; j++) {
        expect(overlaps(views[i], views[j])).toBe(false);
      }
    }
  });

  it('rejects unsupported player counts', () => {
    expect(() => viewportsFor(0)).toThrow(/player count/);
    expect(() => viewportsFor(5)).toThrow(/player count/);
    expect(() => viewportsFor(1.5)).toThrow(/player count/);
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `npm test -w @pfandraiders/client -- test/layout.test.ts`
Expected: FAIL, "Failed to resolve import ../src/layout".

- [ ] **Step 3: Implementieren**

`packages/client/src/layout.ts`:
```ts
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Logische Spielfläche in Pixeln. Phaser skaliert sie auf das Fenster. */
export const GAME_W = 480;
export const GAME_H = 270;

/**
 * Aufteilung des Bildes für 1 bis 4 Spieler. `gap` Pixel Abstand zwischen den Ansichten.
 * Bei 3 Spielern bleibt das vierte Viertel leer.
 */
export function viewportsFor(
  n: number,
  width = GAME_W,
  height = GAME_H,
  gap = 2,
): Rect[] {
  if (!Number.isInteger(n) || n < 1 || n > 4) throw new Error(`unsupported player count ${n}`);
  if (n === 1) return [{ x: 0, y: 0, w: width, h: height }];

  const w1 = Math.floor((width - gap) / 2);
  const w2 = width - gap - w1;
  if (n === 2) {
    return [
      { x: 0, y: 0, w: w1, h: height },
      { x: w1 + gap, y: 0, w: w2, h: height },
    ];
  }

  const h1 = Math.floor((height - gap) / 2);
  const h2 = height - gap - h1;
  const quarters: Rect[] = [
    { x: 0, y: 0, w: w1, h: h1 },
    { x: w1 + gap, y: 0, w: w2, h: h1 },
    { x: 0, y: h1 + gap, w: w1, h: h2 },
    { x: w1 + gap, y: h1 + gap, w: w2, h: h2 },
  ];
  return quarters.slice(0, n);
}
```

- [ ] **Step 4: Tests und Typecheck**

Run: `npm test -w @pfandraiders/client && npm run typecheck -w @pfandraiders/client`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client
git commit -m "feat(client): add splitscreen viewport layout

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Eingabequellen (rein) und Gamepad-Abbildung

**Files:**
- Create: `packages/client/src/sources.ts`
- Test: `packages/client/test/sources.test.ts`

**Interfaces:**
- Consumes: `KeyState` aus Task 5.
- Produces: `interface InputSource { readonly label: string; read(): KeyState; confirmPressed(): boolean }`; `interface PadSnapshot { stickX, stickY: number; a, x, y, left, right, up, down: boolean }`; `interface HeldKeys { left, right, up, down, action, buyUpgrade, buyItem: boolean }`; `STICK_DEADZONE = 0.4`; `padToHeld(s: PadSnapshot): HeldKeys`; `class EdgeTracker { apply(h: HeldKeys): KeyState }` (Kauftasten nur beim Übergang von nicht gehalten zu gehalten).

- [ ] **Step 1: Failing Tests schreiben**

`packages/client/test/sources.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { EdgeTracker, padToHeld, STICK_DEADZONE } from '../src/sources';
import type { HeldKeys, PadSnapshot } from '../src/sources';

const IDLE: PadSnapshot = {
  stickX: 0,
  stickY: 0,
  a: false,
  x: false,
  y: false,
  left: false,
  right: false,
  up: false,
  down: false,
};

describe('padToHeld', () => {
  it('maps buttons: A action, X upgrade, Y item', () => {
    expect(padToHeld({ ...IDLE, a: true })).toMatchObject({ action: true, buyUpgrade: false, buyItem: false });
    expect(padToHeld({ ...IDLE, x: true })).toMatchObject({ buyUpgrade: true });
    expect(padToHeld({ ...IDLE, y: true })).toMatchObject({ buyItem: true });
  });

  it('maps the d-pad', () => {
    expect(padToHeld({ ...IDLE, left: true })).toMatchObject({ left: true, right: false });
    expect(padToHeld({ ...IDLE, down: true })).toMatchObject({ down: true, up: false });
  });

  it('ignores stick values inside the dead zone', () => {
    const inside = STICK_DEADZONE - 0.01;
    const h = padToHeld({ ...IDLE, stickX: inside, stickY: -inside });
    expect(h).toMatchObject({ left: false, right: false, up: false, down: false });
  });

  it('maps the stick outside the dead zone, including both axes at once', () => {
    const out = STICK_DEADZONE + 0.1;
    expect(padToHeld({ ...IDLE, stickX: -out })).toMatchObject({ left: true, right: false });
    expect(padToHeld({ ...IDLE, stickX: out, stickY: out })).toMatchObject({ right: true, down: true });
    expect(padToHeld({ ...IDLE, stickY: -out })).toMatchObject({ up: true });
  });

  it('combines stick and d-pad', () => {
    expect(padToHeld({ ...IDLE, left: true, stickX: 1 })).toMatchObject({ left: true, right: true });
  });
});

describe('EdgeTracker', () => {
  const held = (over: Partial<HeldKeys>): HeldKeys => ({
    left: false,
    right: false,
    up: false,
    down: false,
    action: false,
    buyUpgrade: false,
    buyItem: false,
    ...over,
  });

  it('reports a buy key only on the frame it goes down', () => {
    const t = new EdgeTracker();
    expect(t.apply(held({ buyUpgrade: true })).buyUpgrade).toBe(true);
    expect(t.apply(held({ buyUpgrade: true })).buyUpgrade).toBe(false);
    expect(t.apply(held({})).buyUpgrade).toBe(false);
    expect(t.apply(held({ buyUpgrade: true })).buyUpgrade).toBe(true);
  });

  it('tracks the two buy keys independently', () => {
    const t = new EdgeTracker();
    expect(t.apply(held({ buyUpgrade: true })).buyItem).toBe(false);
    expect(t.apply(held({ buyUpgrade: true, buyItem: true }))).toMatchObject({
      buyUpgrade: false,
      buyItem: true,
    });
  });

  it('passes movement and action through unchanged', () => {
    const t = new EdgeTracker();
    expect(t.apply(held({ left: true, action: true }))).toMatchObject({ left: true, action: true });
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `npm test -w @pfandraiders/client -- test/sources.test.ts`
Expected: FAIL, "Failed to resolve import ../src/sources".

- [ ] **Step 3: Implementieren**

`packages/client/src/sources.ts`:
```ts
import type { KeyState } from './input';

/** Ein Gerät, das einem Spieler gehört. Phaser-Anbindung steht in devices.ts. */
export interface InputSource {
  readonly label: string;
  /** Eingabe dieses Frames. Kauftasten sind nur im Frame des neuen Drückens true. */
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
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
}

/** Gehaltene Zustände, noch ohne Flankenerkennung. */
export interface HeldKeys {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  action: boolean;
  buyUpgrade: boolean;
  buyItem: boolean;
}

/** Sticks unterhalb dieses Betrags zählen als in Ruhe. */
export const STICK_DEADZONE = 0.4;

/** A = Aktion, X = Container-Upgrade, Y = Bolzenschneider. Stick und Steuerkreuz laufen. */
export function padToHeld(s: PadSnapshot): HeldKeys {
  return {
    left: s.left || s.stickX < -STICK_DEADZONE,
    right: s.right || s.stickX > STICK_DEADZONE,
    up: s.up || s.stickY < -STICK_DEADZONE,
    down: s.down || s.stickY > STICK_DEADZONE,
    action: s.a,
    buyUpgrade: s.x,
    buyItem: s.y,
  };
}

/** Macht aus gehaltenen Kauftasten Einzeldrücke. */
export class EdgeTracker {
  private prevUpgrade = false;
  private prevItem = false;

  apply(h: HeldKeys): KeyState {
    const k: KeyState = {
      left: h.left,
      right: h.right,
      up: h.up,
      down: h.down,
      action: h.action,
      buyUpgrade: h.buyUpgrade && !this.prevUpgrade,
      buyItem: h.buyItem && !this.prevItem,
    };
    this.prevUpgrade = h.buyUpgrade;
    this.prevItem = h.buyItem;
    return k;
  }
}
```

- [ ] **Step 4: Tests und Typecheck**

Run: `npm test -w @pfandraiders/client && npm run typecheck -w @pfandraiders/client`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client
git commit -m "feat(client): add input source interface and gamepad mapping

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: HUD-Texte

**Files:**
- Modify: `packages/core/src/index.ts` nur falls `ranking`/`findStealTarget` nicht exportiert sind (sie sind es nach Task 3)
- Create: `packages/client/src/text.ts`
- Test: `packages/client/test/text.test.ts`

**Interfaces:**
- Consumes: `@pfandraiders/core` (`createGame`, `parseMap`, `CONFIG`, `ranking`, `findStealTarget`, `findSearchableSpot`, `isNear`, `isBeingRobbed`, `nextUpgrade`, `bottlesValue`, `totalBottles`, `capacityOf`, `containerOf`), `formatMoney`, `formatTime`.
- Produces: `playerName(id): string` (`'p1'` → `'P1'`), `statusLines(state, p): string[]`, `hintLines(state, p): string[]`, `alertText(state, p): string`, `resultLines(state): string[]`.

Texte:
- `statusLines`: Zeile 1 `Zeit m:ss   Geld x,xx €`, Zeile 2 `<Container> n/cap   Pl.. Gl.. Ka..`, Zeile 3 nur mit Item `Item: Bolzenschneider`.
- `hintLines`: am Shop `[1] <Container> (<n> Plätze) <Preis>` oder `Voll ausgebaut`, dazu `[2] Bolzenschneider <Preis>` oder `Item-Slot belegt`; sonst am Pfandautomaten `[E] Pfand abgeben <Wert>` bzw. `Pfandautomat: nichts zum Abgeben`; bei durchsuchbarem Spot `[E halten] Suchen` bzw. `Container voll`; wenn gerade nicht suchend, mit freiem Platz und gültigem Opfer in Reichweite: `[E halten] Klauen` bzw. mit Item `[E] Bolzenschneider einsetzen`. Leer nach Rundenende.
- `alertText`: `! DU WIRST BESTOHLEN !` solange ein Diebstahl gegen den Spieler läuft; sonst, solange Schutz aktiv, `Bestohlen! Schutz <s> s`; sonst leer.
- `resultLines`: Kopf `Runde vorbei!`, dann je Platz `1. P1  12,30 €`, zum Schluss leere Zeile und `[R] Neue Runde`.

- [ ] **Step 1: Failing Tests schreiben**

`packages/client/test/text.test.ts`:
```ts
import { CONFIG, createGame, parseMap } from '@pfandraiders/core';
import type { GameState } from '@pfandraiders/core';
import { describe, expect, it } from 'vitest';
import { alertText, hintLines, playerName, resultLines, statusLines } from '../src/text';

// p1 (24,24) steht 16 px vom Shop (40,24). p2 liegt weit weg am Ende des Ganges.
function shopGame(): GameState {
  return createGame(1, parseMap(['#########', '#@S....@#', '#########']), ['p1', 'p2']);
}

describe('playerName', () => {
  it('upper-cases the id', () => {
    expect(playerName('p1')).toBe('P1');
  });
});

describe('statusLines', () => {
  it('shows time, money, container and bottles', () => {
    const s = shopGame();
    s.players.p1.money = 150;
    s.players.p1.bottles = { plastic: 2, glass: 1, crate: 0 };
    const lines = statusLines(s, s.players.p1);
    expect(lines[0]).toContain('10:00');
    expect(lines[0]).toContain('1,50 €');
    expect(lines[1]).toContain('Hände 3/3');
    expect(lines[1]).toContain('Pl2');
    expect(lines[1]).toContain('Gl1');
    expect(lines).toHaveLength(2);
  });

  it('shows the item name when carrying one', () => {
    const s = shopGame();
    s.players.p1.item = 'bolt_cutters';
    expect(statusLines(s, s.players.p1)[2]).toBe('Item: Bolzenschneider');
  });
});

describe('hintLines', () => {
  it('offers upgrade and item at the shop', () => {
    const s = shopGame();
    const lines = hintLines(s, s.players.p1);
    expect(lines.some((l) => l.startsWith('[1] Tasche'))).toBe(true);
    expect(lines.some((l) => l.startsWith('[2] Bolzenschneider'))).toBe(true);
  });

  it('says the item slot is taken instead of offering a second item', () => {
    const s = shopGame();
    s.players.p1.item = 'bolt_cutters';
    const lines = hintLines(s, s.players.p1);
    expect(lines).toContain('Item-Slot belegt');
    expect(lines.some((l) => l.startsWith('[2]'))).toBe(false);
  });

  it('says fully upgraded at the last level', () => {
    const s = shopGame();
    s.players.p1.containerLevel = CONFIG.containers.length - 1;
    expect(hintLines(s, s.players.p1)).toContain('Voll ausgebaut');
  });

  it('is empty away from everything', () => {
    const s = shopGame();
    expect(hintLines(s, s.players.p2)).toEqual([]);
  });

  it('offers stealing next to a searching victim with free room', () => {
    const s = createGame(1, parseMap(['#######', '#@@...#', '#######']), ['p1', 'p2']);
    s.players.p2.mode = 'searching';
    s.players.p2.bottles = { plastic: 2, glass: 0, crate: 0 };
    expect(hintLines(s, s.players.p1)).toContain('[E halten] Klauen');
    s.players.p1.item = 'bolt_cutters';
    expect(hintLines(s, s.players.p1)).toContain('[E] Bolzenschneider einsetzen');
  });

  it('does not offer stealing with a full container', () => {
    const s = createGame(1, parseMap(['#######', '#@@...#', '#######']), ['p1', 'p2']);
    s.players.p2.mode = 'searching';
    s.players.p2.bottles = { plastic: 2, glass: 0, crate: 0 };
    s.players.p1.bottles = { plastic: 3, glass: 0, crate: 0 };
    expect(hintLines(s, s.players.p1).some((l) => l.includes('Klauen'))).toBe(false);
  });

  it('is empty after the round has ended', () => {
    const s = shopGame();
    s.phase = 'ended';
    expect(hintLines(s, s.players.p1)).toEqual([]);
  });
});

describe('alertText', () => {
  it('warns while a theft against the player is in progress', () => {
    const s = shopGame();
    s.players.p2.stealTargetId = 'p1';
    s.players.p2.stealProgressMs = 40;
    expect(alertText(s, s.players.p1)).toBe('! DU WIRST BESTOHLEN !');
  });

  it('shows the shield after a theft and is empty otherwise', () => {
    const s = shopGame();
    expect(alertText(s, s.players.p1)).toBe('');
    s.players.p1.shieldMs = 2500;
    expect(alertText(s, s.players.p1)).toBe('Bestohlen! Schutz 3 s');
  });
});

describe('resultLines', () => {
  it('lists players by money with places', () => {
    const s = shopGame();
    s.players.p1.money = 500;
    s.players.p2.money = 1230;
    s.phase = 'ended';
    expect(resultLines(s)).toEqual([
      'Runde vorbei!',
      '1. P2  12,30 €',
      '2. P1  5,00 €',
      '',
      '[R] Neue Runde',
    ]);
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `npm test -w @pfandraiders/client -- test/text.test.ts`
Expected: FAIL, "Failed to resolve import ../src/text".

- [ ] **Step 3: Implementieren**

`packages/client/src/text.ts`:
```ts
import {
  bottlesValue,
  capacityOf,
  CONFIG,
  containerOf,
  findSearchableSpot,
  findStealTarget,
  isBeingRobbed,
  isNear,
  nextUpgrade,
  ranking,
  totalBottles,
} from '@pfandraiders/core';
import type { GameState, Player } from '@pfandraiders/core';
import { formatMoney, formatTime } from './format';

export function playerName(id: string): string {
  return id.toUpperCase();
}

export function statusLines(state: GameState, p: Player): string[] {
  const lines = [
    `Zeit ${formatTime(state.timeLeftMs)}   Geld ${formatMoney(p.money)}`,
    `${containerOf(p).name} ${totalBottles(p.bottles)}/${capacityOf(p)}` +
      `   Pl${p.bottles.plastic} Gl${p.bottles.glass} Ka${p.bottles.crate}`,
  ];
  if (p.item !== null) lines.push(`Item: ${CONFIG.items[p.item].name}`);
  return lines;
}

export function hintLines(state: GameState, p: Player): string[] {
  if (state.phase === 'ended') return [];
  const lines: string[] = [];

  if (isNear(state.map.shops, p)) {
    const up = nextUpgrade(p);
    lines.push(up ? `[1] ${up.name} (${up.capacity} Plätze) ${formatMoney(up.price)}` : 'Voll ausgebaut');
    lines.push(
      p.item === null
        ? `[2] ${CONFIG.items.bolt_cutters.name} ${formatMoney(CONFIG.items.bolt_cutters.price)}`
        : 'Item-Slot belegt',
    );
  } else if (isNear(state.map.dropoffs, p)) {
    lines.push(
      totalBottles(p.bottles) > 0
        ? `[E] Pfand abgeben ${formatMoney(bottlesValue(p.bottles))}`
        : 'Pfandautomat: nichts zum Abgeben',
    );
  }

  const full = totalBottles(p.bottles) >= capacityOf(p);
  if (findSearchableSpot(state, p)) {
    lines.push(full ? 'Container voll' : '[E halten] Suchen');
  }
  if (p.mode !== 'searching' && !full && findStealTarget(state, p)) {
    lines.push(p.item !== null ? '[E] Bolzenschneider einsetzen' : '[E halten] Klauen');
  }
  return lines;
}

export function alertText(state: GameState, p: Player): string {
  if (isBeingRobbed(state, p.id)) return '! DU WIRST BESTOHLEN !';
  if (p.shieldMs > 0) return `Bestohlen! Schutz ${Math.ceil(p.shieldMs / 1000)} s`;
  return '';
}

export function resultLines(state: GameState): string[] {
  const places = ranking(state).map(
    (r, i) => `${i + 1}. ${playerName(r.id)}  ${formatMoney(r.money)}`,
  );
  return ['Runde vorbei!', ...places, '', '[R] Neue Runde'];
}
```

- [ ] **Step 4: Tests und Typecheck**

Run: `npm test -w @pfandraiders/client && npm run typecheck -w @pfandraiders/client`
Expected: PASS. Sollte `@pfandraiders/core` eine der importierten Funktionen nicht exportieren, den Export in `packages/core/src/index.ts` ergänzen (nicht die Funktion im Client nachbauen).

- [ ] **Step 5: Commit**

```bash
git add packages
git commit -m "feat(client): add pure HUD text builders for multiple players

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Geräte, Lobby und Spielstart

**Files:**
- Create: `packages/client/src/devices.ts`, `packages/client/src/scenes/LobbyScene.ts`
- Modify: `packages/client/src/main.ts`

**Interfaces:**
- Consumes: `InputSource`, `padToHeld`, `EdgeTracker`, `PadSnapshot` (Task 7), `KeyState` (Task 5), `GAME_W`, `GAME_H` (Task 6).
- Produces: in `devices.ts`: `KEYBOARD_LAYOUTS: KeyboardLayout[]` (zwei Layouts), `type DeviceRef = { kind: 'keyboard'; layout: number } | { kind: 'pad'; index: number }`, `interface PlayerSlot { id: string; color: number; device: DeviceRef }`, `PLAYER_COLORS: number[]` (4 Farben), `createSource(scene: Phaser.Scene, ref: DeviceRef): InputSource`. `LobbyScene` (Schlüssel `'lobby'`) startet `'game'` mit `{ slots: PlayerSlot[] }`.

Für diesen Task gibt es keine Unit-Tests (Phaser). Prüfung: Typecheck, Build, Handtest in Task 10.

- [ ] **Step 1: `devices.ts` schreiben**

`packages/client/src/devices.ts`:
```ts
import Phaser from 'phaser';
import type { KeyState } from './input';
import { EdgeTracker, padToHeld } from './sources';
import type { InputSource } from './sources';

export interface KeyboardLayout {
  name: string;
  left: string;
  right: string;
  up: string;
  down: string;
  action: string;
  buyUpgrade: string;
  buyItem: string;
}

/** Phaser-Tastennamen. Zwei Spieler teilen sich eine Tastatur. */
export const KEYBOARD_LAYOUTS: KeyboardLayout[] = [
  {
    name: 'Tastatur 1 (WASD, E)',
    left: 'A',
    right: 'D',
    up: 'W',
    down: 'S',
    action: 'E',
    buyUpgrade: 'ONE',
    buyItem: 'TWO',
  },
  {
    name: 'Tastatur 2 (Pfeile, Enter)',
    left: 'LEFT',
    right: 'RIGHT',
    up: 'UP',
    down: 'DOWN',
    action: 'ENTER',
    buyUpgrade: 'COMMA',
    buyItem: 'PERIOD',
  },
];

export type DeviceRef =
  | { kind: 'keyboard'; layout: number }
  | { kind: 'pad'; index: number };

export interface PlayerSlot {
  id: string;
  color: number;
  device: DeviceRef;
}

export const PLAYER_COLORS = [0xef5350, 0xab47bc, 0x26c6da, 0xec407a];

type Key = Phaser.Input.Keyboard.Key;

class KeyboardSource implements InputSource {
  readonly label: string;
  private readonly keys: Record<string, Key>;

  constructor(
    keyboard: Phaser.Input.Keyboard.KeyboardPlugin,
    private readonly layout: KeyboardLayout,
  ) {
    this.label = layout.name;
    const names = [
      layout.left,
      layout.right,
      layout.up,
      layout.down,
      layout.action,
      layout.buyUpgrade,
      layout.buyItem,
    ];
    this.keys = keyboard.addKeys(names.join(',')) as Record<string, Key>;
  }

  read(): KeyState {
    const l = this.layout;
    const k = this.keys;
    return {
      left: k[l.left].isDown,
      right: k[l.right].isDown,
      up: k[l.up].isDown,
      down: k[l.down].isDown,
      action: k[l.action].isDown,
      buyUpgrade: Phaser.Input.Keyboard.JustDown(k[l.buyUpgrade]),
      buyItem: Phaser.Input.Keyboard.JustDown(k[l.buyItem]),
    };
  }

  confirmPressed(): boolean {
    return Phaser.Input.Keyboard.JustDown(this.keys[this.layout.action]);
  }
}

type Pad = Phaser.Input.Gamepad.Gamepad;

class GamepadSource implements InputSource {
  readonly label: string;
  private readonly edges = new EdgeTracker();
  private prevA = false;

  constructor(
    private readonly getPad: () => Pad | undefined,
    index: number,
  ) {
    this.label = `Gamepad ${index + 1}`;
  }

  read(): KeyState {
    const pad = this.getPad();
    // Abgezogenes Gamepad: Spieler steht still, das Spiel läuft weiter.
    if (!pad) return this.edges.apply(padToHeld(IDLE_PAD));
    return this.edges.apply(
      padToHeld({
        stickX: pad.leftStick.x,
        stickY: pad.leftStick.y,
        a: pad.A,
        x: pad.X,
        y: pad.Y,
        left: pad.left,
        right: pad.right,
        up: pad.up,
        down: pad.down,
      }),
    );
  }

  confirmPressed(): boolean {
    const a = this.getPad()?.A ?? false;
    const pressed = a && !this.prevA;
    this.prevA = a;
    return pressed;
  }
}

const IDLE_PAD = {
  stickX: 0,
  stickY: 0,
  a: false,
  x: false,
  y: false,
  left: false,
  right: false,
  up: false,
  down: false,
};

/** Baut die Eingabequelle für ein Gerät. Muss in der Szene aufgerufen werden, die sie nutzt. */
export function createSource(scene: Phaser.Scene, ref: DeviceRef): InputSource {
  if (ref.kind === 'keyboard') {
    return new KeyboardSource(scene.input.keyboard!, KEYBOARD_LAYOUTS[ref.layout]);
  }
  return new GamepadSource(() => scene.input.gamepad?.getPad(ref.index), ref.index);
}
```

- [ ] **Step 2: `LobbyScene.ts` schreiben**

`packages/client/src/scenes/LobbyScene.ts`:
```ts
import Phaser from 'phaser';
import { KEYBOARD_LAYOUTS, PLAYER_COLORS } from '../devices';
import type { DeviceRef, PlayerSlot } from '../devices';
import { GAME_H, GAME_W } from '../layout';

const FONT = { fontFamily: 'monospace', fontSize: '8px', color: '#ffffff' };
const MAX_PLAYERS = 4;
const PAD_START_BUTTON = 9;

function sameDevice(a: DeviceRef, b: DeviceRef): boolean {
  if (a.kind === 'keyboard' && b.kind === 'keyboard') return a.layout === b.layout;
  if (a.kind === 'pad' && b.kind === 'pad') return a.index === b.index;
  return false;
}

function describe(ref: DeviceRef): string {
  return ref.kind === 'keyboard' ? KEYBOARD_LAYOUTS[ref.layout].name : `Gamepad ${ref.index + 1}`;
}

export class LobbyScene extends Phaser.Scene {
  private slots: PlayerSlot[] = [];
  private text!: Phaser.GameObjects.Text;
  private joinKeys: Phaser.Input.Keyboard.Key[] = [];
  private startKey!: Phaser.Input.Keyboard.Key;
  private padPrev: Record<number, { a: boolean; start: boolean }> = {};

  constructor() {
    super('lobby');
  }

  create(): void {
    this.slots = [];
    this.padPrev = {};
    const params = new URLSearchParams(window.location.search);

    // Testhilfen: ?solo=1 startet sofort mit Tastatur 1, ?players=N startet N Spieler ohne Lobby.
    const debugCount = params.has('solo') ? 1 : Number(params.get('players'));
    if (debugCount >= 1 && debugCount <= MAX_PLAYERS) {
      const slots: PlayerSlot[] = Array.from({ length: debugCount }, (_, i) => ({
        id: `p${i + 1}`,
        color: PLAYER_COLORS[i],
        device: { kind: 'keyboard', layout: i % KEYBOARD_LAYOUTS.length },
      }));
      this.scene.start('game', { slots });
      return;
    }

    this.joinKeys = KEYBOARD_LAYOUTS.map((l) => this.input.keyboard!.addKey(l.action));
    this.startKey = this.input.keyboard!.addKey('SPACE');
    this.text = this.add.text(GAME_W / 2, GAME_H / 2, '', { ...FONT, align: 'center' }).setOrigin(0.5);
  }

  update(): void {
    if (!this.text) return; // Testhilfe-Pfad: create() hat schon zur Spielszene gewechselt
    KEYBOARD_LAYOUTS.forEach((_, layout) => {
      if (Phaser.Input.Keyboard.JustDown(this.joinKeys[layout])) {
        this.join({ kind: 'keyboard', layout });
      }
    });

    let startPressed = Phaser.Input.Keyboard.JustDown(this.startKey);
    for (const pad of this.input.gamepad?.gamepads ?? []) {
      if (!pad) continue;
      const prev = this.padPrev[pad.index] ?? { a: false, start: false };
      const start = pad.buttons[PAD_START_BUTTON]?.pressed ?? false;
      if (pad.A && !prev.a) this.join({ kind: 'pad', index: pad.index });
      if (start && !prev.start && this.slots.length > 0) startPressed = true;
      this.padPrev[pad.index] = { a: pad.A, start };
    }

    if (startPressed && this.slots.length > 0) {
      this.scene.start('game', { slots: this.slots });
      return;
    }
    this.text.setText(this.lines().join('\n'));
  }

  private join(device: DeviceRef): void {
    if (this.slots.length >= MAX_PLAYERS) return;
    if (this.slots.some((s) => sameDevice(s.device, device))) return;
    const n = this.slots.length;
    this.slots.push({ id: `p${n + 1}`, color: PLAYER_COLORS[n], device });
  }

  private lines(): string[] {
    const lines = ['PfandRaiders', '', 'Beitreten: Tastatur 1 = E, Tastatur 2 = Enter, Gamepad = A', ''];
    for (let i = 0; i < MAX_PLAYERS; i++) {
      const slot = this.slots[i];
      lines.push(slot ? `P${i + 1}: ${describe(slot.device)}` : `P${i + 1}: (frei)`);
    }
    lines.push('', this.slots.length > 0 ? 'Start: Leertaste oder Start-Taste' : 'Mindestens ein Spieler muss beitreten');
    return lines;
  }
}
```

- [ ] **Step 3: `main.ts` ersetzen**

`packages/client/src/main.ts`:
```ts
import Phaser from 'phaser';
import { GAME_H, GAME_W } from './layout';
import { GameScene } from './scenes/GameScene';
import { LobbyScene } from './scenes/LobbyScene';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_W,
  height: GAME_H,
  backgroundColor: '#111111',
  pixelArt: true,
  input: { gamepad: true },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [LobbyScene, GameScene],
});
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: Typecheck sauber ist erst nach Task 10 zu erwarten, weil `main.ts` die neue `GameScene`-Fassung nicht kennt. Für diesen Task genügt: `devices.ts` und `LobbyScene.ts` erzeugen keine eigenen Fehler. Der Befehl `npx tsc --noEmit -p packages/client 2>&1 | grep -E "devices|LobbyScene"` darf nichts ausgeben. Weichen Phaser-Typen ab (zum Beispiel `getPad`, `leftStick`), minimal anpassen und im Bericht nennen.

- [ ] **Step 5: Commit**

```bash
git add packages/client
git commit -m "feat(client): add input devices, lobby scene and gamepad plugin

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Splitscreen-Spielszene, README und Handtest

**Files:**
- Create: `packages/client/src/hud.ts`
- Modify (komplett ersetzen): `packages/client/src/scenes/GameScene.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: Tasks 5 bis 9, `@pfandraiders/core`.
- Produces: `class PlayerHud` mit `objects: Phaser.GameObjects.GameObject[]` und `update(state, p)`; `GameScene` nimmt `init(data: { slots: PlayerSlot[] })`.

- [ ] **Step 1: `hud.ts` schreiben**

`packages/client/src/hud.ts`:
```ts
import Phaser from 'phaser';
import { CONFIG } from '@pfandraiders/core';
import type { GameState, Player } from '@pfandraiders/core';
import type { Rect } from './layout';
import { alertText, hintLines, resultLines, statusLines } from './text';

const FONT = { fontFamily: 'monospace', fontSize: '8px', color: '#ffffff' };
const BAR_WIDTH = 40;

/**
 * HUD eines Spielers. Alle Objekte hängen an der Kamera (scrollFactor 0) und liegen
 * in den Koordinaten des eigenen Viewports. Die Szene versteckt sie vor den anderen Kameras.
 */
export class PlayerHud {
  readonly objects: Phaser.GameObjects.GameObject[];
  private readonly status: Phaser.GameObjects.Text;
  private readonly hint: Phaser.GameObjects.Text;
  private readonly alert: Phaser.GameObjects.Text;
  private readonly banner: Phaser.GameObjects.Text;
  private readonly barBg: Phaser.GameObjects.Rectangle;
  private readonly bar: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene, view: Rect, color: number, name: string) {
    const wrap = { wordWrap: { width: view.w - 8 } };
    this.status = scene.add.text(4, 4, '', { ...FONT, ...wrap });
    this.hint = scene.add.text(4, view.h - 4, '', { ...FONT, ...wrap }).setOrigin(0, 1);
    this.alert = scene.add
      .text(view.w / 2, 30, '', { ...FONT, color: '#ff5252', align: 'center' })
      .setOrigin(0.5, 0);
    this.banner = scene.add
      .text(view.w / 2, view.h / 2, '', {
        ...FONT,
        fontSize: '10px',
        align: 'center',
        backgroundColor: '#000000cc',
      })
      .setOrigin(0.5);
    this.barBg = scene.add
      .rectangle(view.w / 2 - BAR_WIDTH / 2, view.h - 30, BAR_WIDTH, 4, 0x000000)
      .setOrigin(0, 0);
    this.bar = scene.add
      .rectangle(view.w / 2 - BAR_WIDTH / 2, view.h - 30, 0, 4, 0xffee58)
      .setOrigin(0, 0);
    const tag = scene.add
      .text(view.w - 4, 4, name, { ...FONT, color: `#${color.toString(16).padStart(6, '0')}` })
      .setOrigin(1, 0);

    this.objects = [this.status, this.hint, this.alert, this.banner, this.barBg, this.bar, tag];
    for (const o of this.objects) {
      (o as Phaser.GameObjects.Text).setScrollFactor(0).setDepth(10);
    }
    this.bar.setDepth(11);
    this.banner.setDepth(20);
  }

  update(state: GameState, p: Player): void {
    this.status.setText(statusLines(state, p).join('\n'));
    this.hint.setText(hintLines(state, p).join('\n'));
    this.alert.setText(alertText(state, p));

    let progress = 0;
    if (p.mode === 'searching') {
      progress = p.searchProgressMs / CONFIG.searchMs;
      this.bar.setFillStyle(0xffee58);
    } else if (p.mode === 'stealing') {
      progress = p.stealProgressMs / CONFIG.steal.durationMs;
      this.bar.setFillStyle(0xff5252);
    }
    this.barBg.setVisible(progress > 0);
    this.bar.setVisible(progress > 0);
    this.bar.setSize(BAR_WIDTH * Math.min(progress, 1), 4);

    const ended = state.phase === 'ended';
    this.banner.setVisible(ended);
    this.banner.setText(ended ? resultLines(state).join('\n') : '');
  }
}
```

- [ ] **Step 2: `GameScene.ts` ersetzen**

`packages/client/src/scenes/GameScene.ts`:
```ts
import Phaser from 'phaser';
import { CITY_MAP, CONFIG, createGame, isBeingRobbed, TILE, totalBottles } from '@pfandraiders/core';
import type { MapData } from '@pfandraiders/core';
import { LocalConnection } from '../connection';
import { createSource } from '../devices';
import type { PlayerSlot } from '../devices';
import { PlayerHud } from '../hud';
import { buildInput } from '../input';
import { viewportsFor } from '../layout';
import type { InputSource } from '../sources';
import { playerName } from '../text';

const COLOR = {
  wall: 0x37474f,
  floor: 0x9e9e9e,
  spotFull: 0x66bb6a,
  spotEmpty: 0x616161,
  dropoff: 0x42a5f5,
  shop: 0xffca28,
};
const FONT = { fontFamily: 'monospace', fontSize: '8px', color: '#ffffff' };

export class GameScene extends Phaser.Scene {
  private slots: PlayerSlot[] = [];
  private conn!: LocalConnection;
  private sources: InputSource[] = [];
  private huds: PlayerHud[] = [];
  private bodies: Phaser.GameObjects.Rectangle[] = [];
  private warnings: Phaser.GameObjects.Text[] = [];
  private spotRects: Phaser.GameObjects.Rectangle[] = [];
  private restartKey!: Phaser.Input.Keyboard.Key;

  constructor() {
    super('game');
  }

  init(data: { slots: PlayerSlot[] }): void {
    this.slots = data.slots;
  }

  create(): void {
    const params = new URLSearchParams(window.location.search);
    const seed = params.has('seed')
      ? Number(params.get('seed'))
      : (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
    const roundSec = Number(params.get('round'));
    const ids = this.slots.map((s) => s.id);
    const state = createGame(seed, CITY_MAP, ids, {
      roundMs: roundSec > 0 ? roundSec * 1000 : undefined,
    });
    this.conn = new LocalConnection(state, ids);
    this.sources = this.slots.map((s) => createSource(this, s.device));

    this.spotRects = [];
    this.bodies = [];
    this.warnings = [];
    this.drawMap(state.map);
    for (const spot of state.spots) {
      this.spotRects.push(this.add.rectangle(spot.x, spot.y, 10, 10, COLOR.spotFull));
    }
    for (const slot of this.slots) {
      const p = state.players[slot.id];
      const body = this.add.rectangle(p.x, p.y, CONFIG.playerHalf * 2, CONFIG.playerHalf * 2, slot.color);
      body.setDepth(5);
      this.bodies.push(body);
      this.warnings.push(
        this.add.text(p.x, p.y - 8, '!', { ...FONT, color: '#ff5252', fontSize: '12px' }).setOrigin(0.5, 1).setDepth(6).setVisible(false),
      );
    }

    // Eine Kamera pro Spieler. Die erste ist Phasers Hauptkamera.
    const views = viewportsFor(this.slots.length);
    const cams = views.map((v, i) =>
      i === 0
        ? this.cameras.main.setViewport(v.x, v.y, v.w, v.h)
        : this.cameras.add(v.x, v.y, v.w, v.h),
    );
    cams.forEach((cam, i) => {
      cam.setBounds(0, 0, state.map.cols * TILE, state.map.rows * TILE);
      cam.startFollow(this.bodies[i], true, 0.15, 0.15);
    });

    // Jedes HUD erscheint nur in der Kamera seines Spielers.
    this.huds = views.map((v, i) => new PlayerHud(this, v, this.slots[i].color, playerName(this.slots[i].id)));
    this.huds.forEach((hud, i) => {
      cams.forEach((cam, j) => {
        if (i !== j) cam.ignore(hud.objects);
      });
    });

    this.restartKey = this.input.keyboard!.addKey('R');
  }

  update(_time: number, delta: number): void {
    this.slots.forEach((slot, i) => {
      this.conn.setInput(slot.id, buildInput(this.sources[i].read()));
    });
    this.conn.update(delta);

    const state = this.conn.getState();
    // JustDown und confirmPressed jeden Frame abfragen und so Druck aus der Spielphase verwerfen,
    // sonst löst ein alter Tastendruck beim Rundenende sofort einen Neustart aus.
    const restartPressed = Phaser.Input.Keyboard.JustDown(this.restartKey);
    const confirmPressed = this.sources.map((s) => s.confirmPressed()).some(Boolean);
    if (state.phase === 'ended' && (restartPressed || confirmPressed)) {
      this.scene.restart({ slots: this.slots });
      return;
    }

    state.spots.forEach((spot, i) => {
      this.spotRects[i].setFillStyle(totalBottles(spot.contents) > 0 ? COLOR.spotFull : COLOR.spotEmpty);
    });
    this.slots.forEach((slot, i) => {
      const p = state.players[slot.id];
      this.bodies[i].setPosition(p.x, p.y);
      this.warnings[i].setPosition(p.x, p.y - 8).setVisible(isBeingRobbed(state, slot.id));
      this.huds[i].update(state, p);
    });
  }

  private drawMap(map: MapData): void {
    const g = this.add.graphics();
    for (let r = 0; r < map.rows; r++) {
      for (let c = 0; c < map.cols; c++) {
        g.fillStyle(map.solid[r * map.cols + c] ? COLOR.wall : COLOR.floor, 1);
        g.fillRect(c * TILE, r * TILE, TILE, TILE);
      }
    }
    for (const d of map.dropoffs) this.marker(d.x, d.y, COLOR.dropoff, 'PFAND');
    for (const s of map.shops) this.marker(s.x, s.y, COLOR.shop, 'SHOP');
  }

  private marker(x: number, y: number, color: number, label: string): void {
    this.add.rectangle(x, y, TILE, TILE, color);
    this.add.text(x, y - TILE / 2, label, FONT).setOrigin(0.5, 1);
  }
}
```

Hinweise: Ergeben die Phaser-Typen oder das Kameraverhalten kleine Abweichungen (zum Beispiel `cam.ignore` mit Arrays, `scene.restart` mit Daten), minimal anpassen und im Bericht nennen. Regeln gehören nicht in diese Datei.

- [ ] **Step 3: README aktualisieren**

In `README.md` den Abschnitt zur Steuerung und die Testhilfen ersetzen durch:
```markdown
## Spielen

Lokal mit 1 bis 4 Spielern, jeder mit eigener Kamera. In der Lobby treten Spieler mit der Aktionstaste ihres Geräts bei, Start mit Leertaste oder Start-Taste des Gamepads.

| Gerät | Laufen | Aktion | Container-Upgrade | Bolzenschneider |
|---|---|---|---|---|
| Tastatur 1 | WASD | E | 1 | 2 |
| Tastatur 2 | Pfeile | Enter | , | . |
| Gamepad | Stick oder Steuerkreuz | A | X | Y |

Aktion: Suchen (halten), Pfand abgeben (drücken am Pfandautomaten), Klauen (halten bei einem suchenden Mitspieler, 2 s). Mit dem Bolzenschneider (im Shop 6,00 €) klaut ein neuer Druck der Aktionstaste sofort alles, was in den eigenen Container passt. `R` oder `A` startet nach Rundenende neu.

## Testhilfen per URL

`?solo=1` (ein Spieler, ohne Lobby), `?players=2` (n Spieler ohne Lobby, abwechselnd Tastatur 1 und 2), `?round=30` (Rundenlänge in Sekunden), `?seed=123` (feste Zufallsbefüllung).
```
(Die vorhandenen Abschnitte zu Entwickeln und Befehlen bleiben unverändert.)

- [ ] **Step 4: Typecheck, Tests, Build**

Run: `npm run typecheck && npm test && npm run build`
Expected: alles grün, Build ohne Fehler (Phaser-Chunk-Warnung ist normal).

- [ ] **Step 5: Commit**

```bash
git add packages/client README.md
git commit -m "feat(client): render splitscreen with one camera and HUD per player

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Handtest im Browser (nur Controller, nicht Implementer)**

Run: `npm run dev`, Seite öffnen, jeweils mit `?seed=1`. Falls die Animationsschleife im eingebetteten Browser steht (Pane versteckt), per Skript `requestAnimationFrame` durch `setTimeout` ersetzen wie in Phase 1.

1. `?solo=1`: ein Spieler, ganzes Bild, Suchen und Abgeben wie in Phase 1 (Regression).
2. Lobby ohne Parameter: `E` tritt als P1 bei, `Enter` als P2, Leertaste startet. Doppeltes Beitreten desselben Geräts wird ignoriert.
3. `?players=2`: Bild in zwei Hälften mit schmalem Spalt, jede Hälfte zeigt nur ihr eigenes HUD, jede Kamera folgt ihrem Spieler.
4. Diebstahl mit zwei Tastaturen: P2 sucht an einem Spot, P1 steht daneben und hält `E`. P2 sieht `! DU WIRST BESTOHLEN !` und das `!` über dem Spieler, P1 sieht einen roten Balken. Nach 2 s hat P1 die Hälfte, P2 sieht `Bestohlen! Schutz 3 s`.
5. Abbruch: P2 läuft mitten im Diebstahl los, P1 bekommt nichts.
6. Bolzenschneider: Geld per Suchen und Abgeben sammeln oder die Konstante `items.bolt_cutters.price` kurz lokal auf 10 setzen (danach zurücksetzen), am Shop `2` drücken, HUD zeigt `Item: Bolzenschneider`, beim suchenden Opfer `E` drücken, alles geht sofort rüber, Item weg.
7. `?players=4`: vier Viertel, kein Überlappen, HUD-Texte laufen nicht über den Rand.
8. Rundenende (`?round=20`): in jeder Ansicht die Rangliste, `R` startet mit denselben Spielern neu.
9. Echtes Gamepad (nur der Entwickler selbst, falls vorhanden): in der Lobby `A` drücken, Beitritt klappt, Laufen mit Stick und Steuerkreuz, `A` Aktion, `X` Upgrade, `Y` Item. Gamepad während des Spiels abziehen: Spiel läuft weiter, der Spieler steht still.

Abweichungen im Code beheben (kein Raten), Ergebnis jedes Punkts notieren.

---

## Ende von Phase 2: Abnahme

- [ ] `npm test` grün in beiden Paketen, `npm run typecheck` sauber, `npm run build` ohne Fehler.
- [ ] Handtest Punkte 1 bis 8 erfüllt (Punkt 9 wenn Hardware vorhanden).
- [ ] Balancing-Eindruck notieren (2 s Klauen, 50 %, 3 s Schutz, 6,00 € Bolzenschneider). Änderungen nur in `packages/core/src/config.ts`.
- [ ] Danach Plan für Phase 3 schreiben (Health, Hunde, Polizei, Event-Zonen, Essen). Dort gehört auch die aktive Abwehr beim Diebstahl hin, falls gewünscht.

## Self-Review (Spec-Abdeckung)

- Spec §4 Diebstahl (2 s halten, Warnung, Abbruch, 50 %, nur bei `suchen`): Tasks 1 bis 3. "Berührt oder getroffen" wird als Abbruch durch Weglaufen/Loslassen umgesetzt (Entscheidung 3).
- Spec §4 Special Item Bolzenschneider (Sofort-Diebstahl 100 %, einmalig, ein Slot, kaufbar): Tasks 1 bis 3.
- Spec §1 lokal 2 bis 4 Spieler, Splitscreen mit eigener Kamera, Gamepad: Tasks 6 bis 10.
- Spec §8 Tests: Regeln als Unit-Tests (Tasks 1 bis 4), Determinismus mit Diebstahl (Task 4), reine Client-Logik (Tasks 5 bis 8), Rendering per Handtest (Task 10).
- Spec §9 Risiko Splitscreen/Gamepad: früh genug in Tasks 6 bis 10, Handtest Punkt 3, 7, 9.
- Aus der Phase-1-Schlussreview übernommen: doppelte Spieler-ids (Task 1), `GameScene` ohne festes `PLAYER_ID` (Task 10), Ergebnisliste statt nur dem Sieger (Task 8/10). Weiter offen für Phase 4: Eingabe-Validierung (NaN-dt, ungültige Bewegungswerte), `lib` ES2022 für `core`, Snapshot-Filter.
- Typkonsistenz: `Input.buy` (`BuyCommand | null`), `KeyState.buyUpgrade/buyItem`, `Mode` mit `'stealing'`, `updateSteal(state, thief, pressed, dtMs)`, `canBeRobbed(thief, victim)`, `viewportsFor`, `PlayerSlot`, `DeviceRef` sind in allen Tasks gleich benannt.
