# Serie, Shop-Phase und Kampf: Kern und Server – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kern und Server spielen eine Serie von Runden mit Shop-Phase dazwischen; Spieler können sich schlagen, ausknocken und ausrauben; Kaufen läuft nur noch über Shop-Nachrichten.

**Architecture:** Der Kern (`packages/core`) bekommt die reine, deterministische Logik: neue Spielerfelder, einen Shop-Katalog in `CONFIG.shop`, `shop.ts` (Fortschritt, Kaufprüfung, Kauf), `fight.ts` (Schlag), Ausrauben in `theft.ts`, Knockout/Aufstehen/Essen in `health.ts` und eine Rundenübergabe über `createGame(..., { progress })`. Der Server-Raum (`packages/server/src/room.ts`) bekommt die Phasen `lobby`/`playing`/`shop`, hält den Fortschritt je Spieler zwischen den Runden und startet die nächste Runde, sobald alle verbundenen Spieler bereit sind. Der Client wird in der letzten Aufgabe nur so weit angepasst, dass er kompiliert, seine Tests grün sind und Online-Serien (ohne Shop-Oberfläche) weiterlaufen; die Shop-Oberfläche folgt in Plan 2.

**Tech Stack:** TypeScript 5.7, npm workspaces (`@pfandraiders/core`, `@pfandraiders/server`, `@pfandraiders/client`), Vitest 3, `ws` auf dem Server, Phaser 3 im Client.

**Spec:** `docs/superpowers/specs/2026-10-08-serie-shop-kampf-design.md` (ergänzt `docs/superpowers/specs/2026-10-02-pfandraiders-design.md`).

**Voraussetzung:** Dieser Plan setzt voraus, dass PR #32 (Branch `fix/police-gamepad`) vor der Umsetzung in `master` gemergt ist und der Arbeitsbranch darauf aufsetzt. Alle Pfade und Zeilen beziehen sich auf diesen Stand (unter anderem `Npc.pathX/pathY/pathMs`, `packages/core/src/path.ts`, `packages/client/src/settings.ts` mit Online-Gerät, `packages/client/src/notices.ts`). Vor Task 1: `git log --oneline -1 fix/police-gamepad` muss in `git log master` enthalten sein; sonst erst rebasen.

## Global Constraints

- Alle Texte für Spieler sind deutsch (Fehlermeldungen des Servers, HUD, Shop-Namen), mit echten Umlauten.
- Code-Kommentare sind deutsch wie im bestehenden Code; Bezeichner bleiben englisch.
- Jeder Commit endet mit der Zeile `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (nach einer Leerzeile).
- `todo.md` und `idee.md` werden nie gestaged oder committet. Immer mit expliziten Pfaden `git add <pfad>` arbeiten, nie `git add -A` oder `git add .`.
- Kein Python, keine Python-Skripte; Hilfsskripte nur in TypeScript (`npx tsx`).
- Der Kern bleibt deterministisch: kein `Math.random`, kein `Date.now`, keine Iteration über unsortierte Mengen mit Seiteneffekt außer `Object.keys`/`Object.values` von `state.players` (Einfügereihenfolge). Gleicher Seed und gleiche Eingaben ergeben denselben Zustand.
- Snapshots bleiben eine Allow-List je Betrachter (`packages/core/src/snapshot.ts`): jedes neue `Player`-Feld wird dort für fremde Spieler ausdrücklich entschieden, und `packages/core/test/snapshot.test.ts` pinnt die Schlüssel.
- Am Ende des Plans sind `npm test` und `npm run typecheck` im Repo-Wurzelverzeichnis grün (core, client, server). Zwischen Task 1 und Task 11 dürfen Typecheck und Tests von client und server rot sein; core muss nach jeder Task grün sein, server ab Task 10, client ab Task 11.
- Rundenzeiten: erlaubt 3, 5, 7, 10 Minuten (`180000`, `300000`, `420000`, `600000` ms), Standard 5 Minuten.
- Mehrfachkauf: Stückzahl höchstens 99, kein Teilkauf.
- Schlag: Reichweite 20 px, Abklingzeit 600 ms, Schaden 20, Untergrenze 5.
- Knockout: 20 s, mit Upgrade 15, 10, 5 s. Aufstehen am selben Ort mit 60 Leben und 3 s Schutz.
- Ausrauben: einmal pro Knockout, 50 % der Flaschen (`CONFIG.steal.fraction`, aufgerundet), begrenzt durch die Kapazität des Räubers.

## Namenstabelle (verbindlich für Plan 1, 2 und 3)

| Ort | Name | Typ / Form |
| --- | --- | --- |
| `types.ts` | `Input` | `{ moveX: -1\|0\|1; moveY: -1\|0\|1; action: boolean; steal: boolean; attack: boolean; eat: boolean }` (kein `buy` mehr) |
| `types.ts` | `NO_INPUT` | `{ moveX: 0, moveY: 0, action: false, steal: false, attack: false, eat: false }` |
| `types.ts` | `UpgradeId` | `'knockout' \| 'speed' \| 'search' \| 'punch' \| 'armor'` |
| `types.ts` | `Upgrades` | `Record<UpgradeId, number>` (Stufe 0 bis 3) |
| `types.ts` | `Inventory` | `{ dog_treat: number; food: number; bolt_cutters: boolean }` |
| `types.ts` | `WeaponId` | `'fist' \| 'sling' \| 'pistol'` |
| `types.ts` | `ShopCategory` | `'bags' \| 'upgrades' \| 'attack' \| 'defense'` |
| `types.ts` | `ShopItemId` | `'bag' \| 'knockout' \| 'speed' \| 'search' \| 'punch' \| 'bolt_cutters' \| 'sling' \| 'pistol' \| 'dog_treat' \| 'food' \| 'armor'` |
| `Player` | neu | `attackHeld`, `eatHeld`, `inventory`, `upgrades`, `weapon`, `attackCooldownMs`, `robbed`, `earnedRound`, `earnedTotal` |
| `Player` | entfällt | `item` |
| `config.ts` | `CONFIG.shop` | `{ maxStack: 99, items: Record<ShopItemId, ShopItemDef> }` |
| `config.ts` | `CONFIG.fight` | `{ radius: 20, cooldownMs: 600, damage: 20, minDamage: 5 }` |
| `shop.ts` | `Progress` | `Pick<Player, 'money' \| 'containerLevel' \| 'upgrades' \| 'inventory' \| 'earnedTotal'>` |
| `shop.ts` | Funktionen | `freshProgress()`, `progressOf(p)`, `noUpgrades()`, `emptyInventory()`, `upgradeValue(p, id)`, `ownedOf(p, item)`, `maxOf(item)`, `shopItemsOf(category)`, `isShopCategory(v)`, `isShopItemId(v)`, `checkShopBuy(p, category, item, qty)`, `shopBuy(p, category, item, qty)` |
| `shop.ts` | Konstanten | `SHOP_CATEGORIES`, `SHOP_CATEGORY_NAMES`, `BUY_REFUSAL_TEXT` |
| `shop.ts` | `BuyResult` | `{ ok: true; cost: number } \| { ok: false; reason: BuyRefusal }` |
| `game.ts` | `GameOptions` | `{ roundMs?: number; progress?: Record<string, Progress> }` |
| `health.ts` | neu | `knockoutMsOf(p)`, `eatFood(p)` |
| `search.ts` | neu | `searchMsOf(p)` |
| `fight.ts` | neu | `punchDamage(a, v)`, `findAttackTarget(state, a)`, `tryAttack(state, a)` |
| `theft.ts` | neu | `canBeLooted(thief, victim)`, `findLootTarget(state, thief)`, `tryLoot(state, thief)` |
| `ranking.ts` | `RankEntry` | `{ id: string; money: number; round: number; total: number }` |
| `protocol.ts` | `RoomPhase` | `'lobby' \| 'playing' \| 'shop'` |
| `protocol.ts` | `RosterEntry` | `{ id; name; color; connected: boolean; ready: boolean }` |
| `protocol.ts` | Rundenzeit | `ROUND_MS_CHOICES`, `DEFAULT_ROUND_MS`, `isRoundMs(v)` |
| `protocol.ts` | Client → Server | `start {roundMs?}`, `ready {ready}`, `shopBuy {category, item, qty}`, `setRoundMs {roundMs}`, `endSeries` |
| `protocol.ts` | Server → Client | `lobby {…, phase, roundMs}`, `start {…, roundMs}`, `phase {phase}`, `shopState {you: Progress; ready: boolean}`, `ranking {entries: RankEntry[]}` |
| `protocol.ts` | `ErrorCode` neu | `'wrong_phase'`, `'cannot_buy'` |
| `room.ts` | Methoden neu | `roundMs()`, `setReady(m, ready)`, `shopBuy(m, category, item, qty)`, `setRoundMs(byId, roundMs)`, `endSeries(byId)`, `start(byId, roundMs?)` |

## Entscheidungen zu Lücken der Spec (Rulings)

1. **Knockout behält Flaschen, Geld und Inventar.** Sonst wäre das Ausrauben (§4.4) wirkungslos. `knockOut` leert die Flaschen nicht mehr und verliert kein Item.
2. **Jeder Knockout dauert `knockoutMsOf(p)`**, egal ob durch Hunger, Hund oder Schlag.
3. **Normaler Diebstahl trifft nur Wache** (`canBeRobbed` verlangt `unconsciousMs === 0`). Ausgeknockte werden nur über das Ausrauben bestohlen.
4. **Ausrauben** (Klauen-Taste neben einem Ausgeknockten): Schutz des Opfers zählt nicht, die Abklingzeit des Räubers wird weder geprüft noch gesetzt, der Bolzenschneider wird nicht benutzt, das Opfer bekommt keinen Schutz. Ist der Container des Räubers voll, passiert nichts und `robbed` bleibt `false`. Ausrauben hat Vorrang vor dem normalen Diebstahl im selben Tastendruck. Wie Klauen nur im Stand.
5. **Schlag:** jeder Druck außerhalb der Abklingzeit startet die Abklingzeit, auch ohne Treffer. Ziel ist der nächste wache Spieler in Reichweite, auch wenn er Schutz hat (dann 0 Schaden). Schlagen geht auch im Laufen und bricht die eigene Suche ab. Der Schlag gibt dem Opfer keinen Schutz.
6. **Essen** bekommt eine eigene Eingabe `Input.eat` (Flanke über `Player.eatHeld`): eine Portion aus dem Inventar heilt `CONFIG.health.food.heal` (30), nicht bei vollem Leben und nicht bewusstlos. Das Leckerli wirkt wie bisher automatisch beim Hundebiss und kostet eine Portion.
7. **Bolzenschneider:** höchstens einer (`inventory.bolt_cutters`), wird beim Klauen verbraucht und kann in der nächsten Shop-Phase neu gekauft werden.
8. **Preise und Wirkungen** (nicht in der Spec, Startwerte für späteres Balancing, alle in `CONFIG.shop`): Tasche 1,50/4,00/9,00 € (wie `upgradePrices`); Knockout kürzer 2/5/10 € (20/15/10/5 s); Laufgeschwindigkeit 2/5/10 € (×1,00/1,08/1,16/1,24); Schneller suchen 2/5/10 € (×1,00/0,85/0,70/0,55 der Suchzeit); Stärkerer Schlag 2,50/6/12 € (+0/5/10/15 Schaden); Rüstung 2,50/6/12 € (−0/4/8/12 Schaden); Bolzenschneider 6 €; Leckerli 1 €; Essen 1 €; Steinschleuder 8 € und Pistole 20 € (nicht verfügbar).
9. **Kaufregeln:** Stufen-Einträge und einmalige Einträge nur mit `qty = 1`; Verbrauchsgüter mit `1 <= qty` und Bestand + qty `<= 99`; sonst Ablehnung ohne Teilkauf. Kaufen ist auch nach "Bereit" erlaubt.
10. **Rangliste:** sortiert nach Rundenverdienst, dann Gesamtverdienst, dann id. `RankEntry.money` bleibt (Geld jetzt). Fremde Verdienste sind im Snapshot wie fremdes Geld bis Rundenende verborgen.
11. **Raumphasen:** `RoomPhase = 'lobby' | 'playing' | 'shop'`. `GameState.phase` bleibt `'running' | 'ended'`. Am Rundenende geht der Raum sofort in `shop`; die Rangliste kommt als `ranking`-Nachricht und steht im letzten Snapshot (`phase 'ended'`). Die Anzeige der Rangliste vor dem Shop ist Sache des Clients (Plan 2).
12. **Serie beenden:** neue Nachricht `endSeries` (nur Host, nur in `shop`): zurück in die Lobby, Fortschritt verfällt, getrennte Spieler fallen heraus.
13. **Getrennte Spieler in der Frist** bleiben Mitglied, behalten ihren Fortschritt, zählen nicht für "alle bereit" und spielen die nächste Runde als stehende Figur mit. Nach Ablauf der Frist (oder mit `leave`) fallen sie außerhalb der laufenden Runde heraus, ihr Fortschritt verfällt.
14. **"Alle bereit" wird geprüft** bei `ready`, beim Trennen (`leave`), bei `leaveForGood` und beim Ablauf der Frist. Ohne verbundene Spieler startet keine Runde. Es gibt in der Shop-Phase keine Mindestspielerzahl.
15. **Beitritt in der Shop-Phase** ist erlaubt: neuer Spieler mit leerem Fortschritt, nicht bereit. Während `playing` bleibt er abgelehnt (`already_started`). Wer per Token in der Shop-Phase zurückkehrt, bekommt `phase`, `ranking` und `shopState` und ist nicht bereit.
16. **Rundenzeit:** `start` trägt optional `roundMs`; gültige Werte setzen die Wahl, ungültige Zahlen den Standard, fehlendes Feld lässt die Wahl unverändert. `setRoundMs` (nur Host, nur `lobby`/`shop`) akzeptiert nur erlaubte Werte (sonst `bad_message`). `ROUND_MS` aus der Umgebung überschreibt die Wahl des Hosts (für Tests). Die `lobby`-Nachricht trägt die wirksame Rundenzeit. `CONFIG.roundMs` wird 5 Minuten.
17. **`shopState` ist privat:** jeder bekommt nur seinen eigenen Fortschritt und sein eigenes "bereit". Wer sonst bereit ist, steht in `RosterEntry.ready` (öffentlich).
18. **Fremde Spieler im Snapshot:** `inventory` leer, `upgrades` alle 0, `attackHeld`/`eatHeld` false, `weapon` öffentlich, `attackCooldownMs` öffentlich (für eine Schlaganimation), `robbed` öffentlich (für den Hinweis "Ausrauben"), `earnedRound`/`earnedTotal` erst nach Rundenende.
19. **Client zwischen Plan 1 und 2:** die alten Kauftasten bleiben belegt, wirken aber nicht mehr; Schlagen und Essen haben noch keine Taste. Online drücken am Rundenende alle `R`/Aktion für "bereit"; damit läuft die Serie ohne Shop-Oberfläche weiter. Lokal startet `R` wie bisher eine frische Runde.
20. **`MapData.shops` bleibt bis Plan 3 bestehen**, wird aber von keiner Spiellogik mehr benutzt.

## Review Focus

1. **Letzter nicht bereiter Spieler trennt sich in der Shop-Phase:** die nächste Runde startet sofort für die übrigen (Test in Task 10).
2. **Zwei Kaufnachrichten, die zusammen mehr kosten als das Geld:** die zweite wird abgelehnt, Geld nie negativ (Test in Task 10).
3. **Stückzahl an der Grenze** (Bestand 98, Kauf 2): Ablehnung `maxed`, kein Teilkauf (Test in Task 2).
4. **Ausgeknockter mit vollem Räuber-Container:** kein Raub, `robbed` bleibt false, ein späterer Raub geht noch (Test in Task 7).
5. **Rückkehr per Token in der Shop-Phase:** bekommt seinen alten Fortschritt (nicht leer) und ist nicht bereit (Test in Task 10).

## Dateien

- Modify: `packages/core/src/types.ts` – Eingabe, Spielerfelder, Shop-Typen
- Modify: `packages/core/src/config.ts` – `CONFIG.shop`, `CONFIG.fight`, Rundenzeit 5 min, entfernte Werte
- Create: `packages/core/src/shop.ts` – Fortschritt, Katalog-Helfer, Kauf
- Create: `packages/core/src/fight.ts` – Schlag
- Modify: `packages/core/src/game.ts` – neue Felder, Fortschritt übernehmen
- Modify: `packages/core/src/step.ts` – Flanken für Schlagen/Essen, Ausrauben, kein Kaufbefehl
- Modify: `packages/core/src/economy.ts` – Kauf entfernt, Verdienst
- Modify: `packages/core/src/health.ts` – Knockout, Aufstehen am Ort, Essen
- Modify: `packages/core/src/theft.ts` – Bolzenschneider aus dem Inventar, Ausrauben
- Modify: `packages/core/src/npc.ts` – Leckerli aus dem Inventar
- Modify: `packages/core/src/movement.ts`, `packages/core/src/search.ts` – Upgrades
- Modify: `packages/core/src/ranking.ts`, `packages/core/src/snapshot.ts`, `packages/core/src/sanitize.ts`, `packages/core/src/protocol.ts`, `packages/core/src/index.ts`
- Modify: `packages/server/src/room.ts`, `packages/server/src/server.ts`
- Modify (nur Lauffähigkeit): `packages/client/src/input.ts`, `connection.ts`, `online.ts`, `text.ts`, `hud.ts`, `soundEvents.ts`, `onlineMenu.ts`, `scenes/GameScene.ts`
- Tests: `packages/core/test/*.test.ts` (neu: `shop.test.ts`, `fight.test.ts`), `packages/server/test/room.test.ts`, `packages/server/test/roomSeries.test.ts` (neu), `packages/server/test/server.test.ts`, `packages/server/test/handler.test.ts`, `packages/server/test/roomChat.test.ts`, Client-Tests wie in Task 11.

Testbefehle (im Repo-Wurzelverzeichnis):
- Core: `npm test -w @pfandraiders/core` und `npm run typecheck -w @pfandraiders/core`
- Server: `npm test -w @pfandraiders/server` und `npm run typecheck -w @pfandraiders/server`
- Client: `npm test -w @pfandraiders/client` und `npm run typecheck -w @pfandraiders/client`
- Einzeldatei: `npx vitest run test/<datei>.test.ts` im jeweiligen Paketordner, zum Beispiel `cd packages/core && npx vitest run test/shop.test.ts`

---

### Task 1: Eingabe ohne Kaufbefehl, mit Schlagen und Essen

**Files:**
- Modify: `packages/core/src/types.ts:5-39`
- Modify: `packages/core/src/sanitize.ts` (ganze Datei)
- Modify: `packages/core/src/step.ts:1-10,56`
- Modify: `packages/core/src/economy.ts:1-3,68-111`
- Test: `packages/core/test/sanitize.test.ts`, `packages/core/test/economy.test.ts`, `packages/core/test/health.test.ts`, `packages/core/test/determinism.test.ts`, `packages/core/test/determinism-events.test.ts`, `packages/core/test/npc.test.ts`, `packages/core/test/protocol.test.ts`

**Interfaces:**
- Consumes: nichts
- Produces: `Input` mit `attack: boolean` und `eat: boolean`, ohne `buy`; `NO_INPUT` mit beiden Feldern `false`; `sanitizeInput(raw: unknown): Input`. `BuyCommand`, `BUY_COMMANDS`, `tryBuy`, `tryUpgrade`, `tryBuyItem`, `tryEat`, `nextUpgrade` gibt es nicht mehr.

- [ ] **Step 1: Write the failing test**

Ersetze `packages/core/test/sanitize.test.ts` vollständig durch:

```ts
import { describe, expect, it } from 'vitest';
import { sanitizeInput } from '../src/sanitize';
import { NO_INPUT } from '../src/types';

describe('sanitizeInput', () => {
  it('keeps a valid input', () => {
    const i = { moveX: -1, moveY: 1, action: true, steal: true, attack: true, eat: true };
    expect(sanitizeInput(i)).toEqual(i);
  });

  it('has no buy field any more and drops one that is sent', () => {
    const out = sanitizeInput({ ...NO_INPUT, buy: 'upgrade' });
    expect('buy' in out).toBe(false);
    expect(out).toEqual(NO_INPUT);
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
      attack: 'true',
      eat: {},
    });
    expect(out).toEqual(NO_INPUT);
    expect(sanitizeInput({ moveX: NaN, moveY: Infinity })).toEqual(NO_INPUT);
  });

  it('returns a fresh object and ignores extra fields', () => {
    const raw = { moveX: 1, extra: 'x' };
    const out = sanitizeInput(raw);
    expect(out).not.toBe(raw);
    expect('extra' in out).toBe(false);
  });

  it('has attack and eat off in NO_INPUT', () => {
    expect(NO_INPUT).toEqual({ moveX: 0, moveY: 0, action: false, steal: false, attack: false, eat: false });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run test/sanitize.test.ts`
Expected: FAIL (`keeps a valid input` liefert kein `attack`, `has attack and eat off in NO_INPUT` sieht `buy: null`).

- [ ] **Step 3: Write minimal implementation**

In `packages/core/src/types.ts` die Zeilen 5 bis 7 (`ItemId` bleibt vorerst, nur `BuyCommand` fällt weg) und das `Input`-Interface samt `NO_INPUT` so ersetzen:

```ts
export type ItemId = 'bolt_cutters' | 'dog_treat';
```

```ts
export interface Input {
  moveX: -1 | 0 | 1;
  moveY: -1 | 0 | 1;
  /** Aktionstaste gehalten */
  action: boolean;
  /** Klauen-Taste gehalten (wirkt beim Drücken: klauen oder ausrauben) */
  steal: boolean;
  /** Schlagen-Taste gehalten (wirkt beim Drücken) */
  attack: boolean;
  /** Essen-Taste gehalten (wirkt beim Drücken: eine Portion aus dem Inventar) */
  eat: boolean;
}

export const NO_INPUT: Input = { moveX: 0, moveY: 0, action: false, steal: false, attack: false, eat: false };
```

`packages/core/src/sanitize.ts` vollständig ersetzen:

```ts
import { NO_INPUT } from './types';
import type { Input } from './types';

function axis(v: unknown): -1 | 0 | 1 {
  return v === -1 || v === 1 ? v : 0;
}

/** Macht aus beliebigen Daten (zum Beispiel aus dem Netz) eine gültige Eingabe. Alles Ungültige wird zu "keine Eingabe". */
export function sanitizeInput(raw: unknown): Input {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ...NO_INPUT };
  const r = raw as Record<string, unknown>;
  return {
    moveX: axis(r.moveX),
    moveY: axis(r.moveY),
    action: r.action === true,
    steal: r.steal === true,
    attack: r.attack === true,
    eat: r.eat === true,
  };
}
```

In `packages/core/src/step.ts` den Import `tryBuy` streichen (Zeile 2 wird `import { updateDeposit } from './economy';`) und die Zeile `if (input.buy !== null) tryBuy(state, p, input.buy);` samt Leerzeile löschen.

In `packages/core/src/economy.ts` den Typ-Import auf `import type { GameState, Input, Player, Point } from './types';` ändern und alles ab `export function nextUpgrade(` bis zum Dateiende (Funktionen `nextUpgrade`, `tryUpgrade`, `tryBuyItem`, `tryEat`, `tryBuy`) löschen.

- [ ] **Step 4: Update the other core tests to the new input**

1. `packages/core/test/economy.test.ts`: Zeile 4 (`import { capacityOf, nextUpgrade, tryBuy } from '../src/economy';`) ganz löschen (die verbleibenden Tests benutzen keine dieser Funktionen); die Konstante `BUY` (Zeile 9) und die Funktion `atShop` (Zeilen 17 bis 21) löschen; die `describe`-Blöcke `'container upgrade'`, `'special item'`, `'dog treat'` und `'tryBuy with bogus commands'` (ab Zeile 185 bis Dateiende) löschen.
2. `packages/core/test/health.test.ts`: den ganzen Block `describe('food', () => { … });` löschen (Task 4 bringt neue Esstests). In `it('ignores all input while unconscious'` die Eingabe `input({ moveX: 1, action: true, steal: true, buy: 'upgrade' })` durch `input({ moveX: 1, action: true, steal: true, attack: true, eat: true })` ersetzen.
3. `packages/core/test/determinism.test.ts`:
   - in `scripted` die Zeile `buy: tick % 400 === 0 ? 'upgrade' : null,` durch `attack: false,` und `eat: false,` (zwei Zeilen) ersetzen;
   - jedes `{ moveX: 0, moveY: 0, action: true, steal: false, buy: null }` durch `{ ...NO_INPUT, action: true }` ersetzen, `{ moveX: 0, moveY: 0, action: holdAction, steal: false, buy: null }` durch `{ ...NO_INPUT, action: holdAction }`;
   - die Zeile `const shop = s.map.shops[0];`, den ganzen Zweig `} else if (phase === 3) { … }` (Kauf am Shop) sowie alle Vorkommen von `upgradeSucceeded` (Rückgabetyp, `let`, Rückgabeobjekt und die beiden `expect`-Zeilen) löschen. Phase 3 fällt damit in den letzten `else`-Zweig ("bis Rundenende laufen").
4. `packages/core/test/determinism-events.test.ts`: `import { NO_INPUT } from '../src/types';` ergänzen; in `scripted` die Zeile `buy: …` durch `attack: tick % 97 < 3,` und `eat: tick % 300 === 0,` ersetzen; `const idle: Input = { moveX: 0, moveY: 0, action: false, steal: false, buy: null };` durch `const idle: Input = { ...NO_INPUT };` ersetzen.
5. `packages/core/test/npc.test.ts`: beide Zeilen `const idle: Input = { moveX: 0, moveY: 0, action: false, steal: false, buy: null };` durch `const idle: Input = { ...NO_INPUT };` ersetzen (`NO_INPUT` aus `'../src/types'` importieren, falls noch nicht da).
6. `packages/core/test/protocol.test.ts`: in `it('accepts input and sanitizes its payload'` die erwartete Eingabe `{ moveX: 0, moveY: 0, action: true, steal: false, buy: null }` durch `{ moveX: 0, moveY: 0, action: true, steal: false, attack: false, eat: false }` ersetzen.

- [ ] **Step 5: Run tests and typecheck**

Run: `npm test -w @pfandraiders/core && npm run typecheck -w @pfandraiders/core`
Expected: PASS, keine Typfehler im Kern.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/sanitize.ts packages/core/src/step.ts packages/core/src/economy.ts packages/core/test/sanitize.test.ts packages/core/test/economy.test.ts packages/core/test/health.test.ts packages/core/test/determinism.test.ts packages/core/test/determinism-events.test.ts packages/core/test/npc.test.ts packages/core/test/protocol.test.ts
git commit -m "feat(core): Eingabe ohne Kaufbefehl, mit Schlagen und Essen

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Spielerfortschritt, Inventar und Shop-Katalog

**Files:**
- Modify: `packages/core/src/types.ts` (Typen `ItemId` raus, neue Typen, `Player`)
- Modify: `packages/core/src/config.ts` (`items` raus, `shop` rein, `health.food`)
- Create: `packages/core/src/shop.ts`
- Modify: `packages/core/src/game.ts`, `packages/core/src/theft.ts:53-58`, `packages/core/src/npc.ts` (Leckerli in `updateDog`), `packages/core/src/health.ts:6-16`, `packages/core/src/snapshot.ts:26-45`, `packages/core/src/index.ts`
- Test: Create `packages/core/test/shop.test.ts`; Modify `game.test.ts`, `snapshot.test.ts`, `theft.test.ts`, `npc.test.ts`, `health.test.ts`, `determinism-theft.test.ts`, `steal-config.test.ts`

**Interfaces:**
- Consumes: `Input` aus Task 1
- Produces:
  - Typen `UpgradeId`, `Upgrades`, `Inventory`, `WeaponId`, `ShopCategory`, `ShopItemId` (siehe Namenstabelle)
  - `Player.inventory: Inventory`, `Player.upgrades: Upgrades`, `Player.weapon: WeaponId`, `Player.earnedRound: number`, `Player.earnedTotal: number`; `Player.item` entfällt
  - `ShopKind = 'level' | 'once' | 'stack'`, `ShopItemDef { category; name; kind; prices: readonly number[]; values: readonly number[]; available: boolean }`, `CONFIG.shop = { maxStack: 99, items: Record<ShopItemId, ShopItemDef> }`, `CONFIG.health.food = { heal: 30 }`
  - aus `shop.ts`: `Progress`, `SHOP_CATEGORIES`, `SHOP_CATEGORY_NAMES`, `isShopCategory`, `isShopItemId`, `shopItemsOf`, `noUpgrades`, `emptyInventory`, `freshProgress`, `progressOf`, `upgradeValue`, `ownedOf`, `maxOf`, `BuyRefusal`, `BuyResult`, `BUY_REFUSAL_TEXT`, `checkShopBuy`, `shopBuy`
  - `GameOptions.progress?: Record<string, Progress>`

- [ ] **Step 1: Write the failing test**

Create `packages/core/test/shop.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { createGame } from '../src/game';
import { CITY_MAP } from '../src/maps';
import {
  BUY_REFUSAL_TEXT,
  checkShopBuy,
  freshProgress,
  isShopCategory,
  isShopItemId,
  maxOf,
  ownedOf,
  progressOf,
  SHOP_CATEGORIES,
  shopBuy,
  shopItemsOf,
  upgradeValue,
} from '../src/shop';
import type { Progress } from '../src/shop';

function rich(money = 100_000): Progress {
  return { ...freshProgress(), money };
}

describe('shop catalog', () => {
  it('has the four categories with their entries in menu order', () => {
    expect(SHOP_CATEGORIES).toEqual(['bags', 'upgrades', 'attack', 'defense']);
    expect(shopItemsOf('bags')).toEqual(['bag']);
    expect(shopItemsOf('upgrades')).toEqual(['knockout', 'speed', 'search']);
    expect(shopItemsOf('attack')).toEqual(['punch', 'bolt_cutters', 'sling', 'pistol']);
    expect(shopItemsOf('defense')).toEqual(['dog_treat', 'food', 'armor']);
  });

  it('prices the bags like upgradePrices and marks ranged weapons as not available', () => {
    expect(CONFIG.shop.items.bag.prices).toEqual(CONFIG.upgradePrices);
    expect(CONFIG.shop.items.sling.available).toBe(false);
    expect(CONFIG.shop.items.pistol.available).toBe(false);
    expect(CONFIG.shop.maxStack).toBe(99);
  });

  it('has a value for every level of every leveled upgrade', () => {
    for (const id of ['knockout', 'speed', 'search', 'punch', 'armor'] as const) {
      const def = CONFIG.shop.items[id];
      expect(def.kind).toBe('level');
      expect(def.values.length).toBe(def.prices.length + 1);
    }
    expect(CONFIG.shop.items.knockout.values).toEqual([20000, 15000, 10000, 5000]);
  });

  it('recognises categories and items and nothing else', () => {
    expect(isShopCategory('defense')).toBe(true);
    expect(isShopCategory('__proto__')).toBe(false);
    expect(isShopItemId('food')).toBe(true);
    expect(isShopItemId('toString')).toBe(false);
    expect(isShopItemId(5)).toBe(false);
  });

  it('has a German text for every refusal', () => {
    for (const text of Object.values(BUY_REFUSAL_TEXT)) expect(text.length).toBeGreaterThan(3);
  });
});

describe('shopBuy', () => {
  it('buys the next bag level for its price', () => {
    const p = rich(1000);
    expect(shopBuy(p, 'bags', 'bag', 1)).toEqual({ ok: true, cost: 150 });
    expect(p.containerLevel).toBe(1);
    expect(p.money).toBe(850);
    expect(shopBuy(p, 'bags', 'bag', 1)).toEqual({ ok: true, cost: 400 });
    expect(p.containerLevel).toBe(2);
  });

  it('refuses the bag beyond the shopping cart', () => {
    const p = rich();
    p.containerLevel = CONFIG.containers.length - 1;
    expect(shopBuy(p, 'bags', 'bag', 1)).toEqual({ ok: false, reason: 'maxed' });
  });

  it('raises an upgrade level and its value', () => {
    const p = rich();
    shopBuy(p, 'upgrades', 'knockout', 1);
    expect(p.upgrades.knockout).toBe(1);
    expect(upgradeValue(p, 'knockout')).toBe(15000);
    shopBuy(p, 'upgrades', 'knockout', 1);
    shopBuy(p, 'upgrades', 'knockout', 1);
    expect(upgradeValue(p, 'knockout')).toBe(5000);
    expect(shopBuy(p, 'upgrades', 'knockout', 1)).toEqual({ ok: false, reason: 'maxed' });
  });

  it('buys several consumables at once for quantity times price', () => {
    const p = rich(1000);
    expect(shopBuy(p, 'defense', 'food', 7)).toEqual({ ok: true, cost: 700 });
    expect(p.inventory.food).toBe(7);
    expect(p.money).toBe(300);
  });

  it('refuses without partial purchase when the money is short', () => {
    const p = rich(250);
    expect(shopBuy(p, 'defense', 'dog_treat', 3)).toEqual({ ok: false, reason: 'no_money' });
    expect(p.inventory.dog_treat).toBe(0);
    expect(p.money).toBe(250);
  });

  it('refuses more than 99 of a consumable in total, also at the border', () => {
    const p = rich();
    p.inventory.food = 98;
    expect(shopBuy(p, 'defense', 'food', 2)).toEqual({ ok: false, reason: 'maxed' });
    expect(p.inventory.food).toBe(98);
    expect(shopBuy(p, 'defense', 'food', 1)).toEqual({ ok: true, cost: 100 });
    expect(p.inventory.food).toBe(99);
    expect(maxOf('food')).toBe(99);
  });

  it('allows exactly one bolt cutters', () => {
    const p = rich();
    expect(shopBuy(p, 'attack', 'bolt_cutters', 1)).toEqual({ ok: true, cost: 600 });
    expect(p.inventory.bolt_cutters).toBe(true);
    expect(ownedOf(p, 'bolt_cutters')).toBe(1);
    expect(shopBuy(p, 'attack', 'bolt_cutters', 1)).toEqual({ ok: false, reason: 'maxed' });
  });

  it('refuses quantities other than one for leveled and single entries', () => {
    const p = rich();
    expect(shopBuy(p, 'bags', 'bag', 2)).toEqual({ ok: false, reason: 'bad_qty' });
    expect(shopBuy(p, 'attack', 'bolt_cutters', 2)).toEqual({ ok: false, reason: 'bad_qty' });
  });

  it('refuses bad quantities, unknown items, wrong categories and unavailable weapons', () => {
    const p = rich();
    for (const qty of [0, -1, 1.5, 100, Number.NaN, '3']) {
      expect(checkShopBuy(p, 'defense', 'food', qty)).toEqual({ ok: false, reason: 'bad_qty' });
    }
    expect(checkShopBuy(p, 'defense', 'cake', 1)).toEqual({ ok: false, reason: 'unknown_item' });
    expect(checkShopBuy(p, 'kitchen', 'food', 1)).toEqual({ ok: false, reason: 'unknown_item' });
    expect(checkShopBuy(p, 'attack', 'food', 1)).toEqual({ ok: false, reason: 'wrong_category' });
    expect(checkShopBuy(p, 'attack', 'sling', 1)).toEqual({ ok: false, reason: 'unavailable' });
    expect(p).toEqual(rich());
  });
});

describe('progress', () => {
  it('starts empty', () => {
    expect(freshProgress()).toEqual({
      money: 0,
      containerLevel: 0,
      upgrades: { knockout: 0, speed: 0, search: 0, punch: 0, armor: 0 },
      inventory: { dog_treat: 0, food: 0, bolt_cutters: false },
      earnedTotal: 0,
    });
  });

  it('copies deeply', () => {
    const a = rich(5);
    const b = progressOf(a);
    b.upgrades.speed = 2;
    b.inventory.food = 3;
    expect(a.upgrades.speed).toBe(0);
    expect(a.inventory.food).toBe(0);
  });

  it('is carried into a new game and only the per-round fields are fresh', () => {
    const prog = rich(777);
    prog.containerLevel = 2;
    prog.upgrades.armor = 1;
    prog.inventory.dog_treat = 4;
    prog.earnedTotal = 1234;
    const s = createGame(1, CITY_MAP, ['a', 'b'], { progress: { a: prog } });
    expect(s.players.a).toMatchObject({
      money: 777,
      containerLevel: 2,
      upgrades: { armor: 1 },
      inventory: { dog_treat: 4, food: 0, bolt_cutters: false },
      earnedTotal: 1234,
      earnedRound: 0,
      weapon: 'fist',
      health: CONFIG.health.max,
      bottles: { plastic: 0, glass: 0, crate: 0 },
    });
    expect(s.players.b.money).toBe(0);
    s.players.a.inventory.dog_treat = 0;
    expect(prog.inventory.dog_treat).toBe(4); // keine geteilten Objekte
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run test/shop.test.ts`
Expected: FAIL mit "Failed to resolve import ../src/shop".

- [ ] **Step 3: Types and config**

In `packages/core/src/types.ts` die Zeile `export type ItemId = 'bolt_cutters' | 'dog_treat';` ersetzen durch:

```ts
/** Upgrades mit Stufen (die Tasche ist containerLevel) */
export type UpgradeId = 'knockout' | 'speed' | 'search' | 'punch' | 'armor';
/** Stufe je Upgrade, 0 = nicht gekauft */
export type Upgrades = Record<UpgradeId, number>;
/** Verbrauchsgüter (Stückzahl) und der Bolzenschneider (höchstens einer) */
export interface Inventory {
  dog_treat: number;
  food: number;
  bolt_cutters: boolean;
}
/** Waffe; bisher nur die Faust, Fernkampf folgt in einem späteren Plan */
export type WeaponId = 'fist' | 'sling' | 'pistol';
export type ShopCategory = 'bags' | 'upgrades' | 'attack' | 'defense';
export type ShopItemId =
  | 'bag'
  | 'knockout'
  | 'speed'
  | 'search'
  | 'punch'
  | 'bolt_cutters'
  | 'sling'
  | 'pistol'
  | 'dog_treat'
  | 'food'
  | 'armor';
```

Im `Player`-Interface die beiden Zeilen `/** Special Item im einzigen Slot, null = keins */` und `item: ItemId | null;` ersetzen durch:

```ts
  /** Verbrauchsgüter und Bolzenschneider (bleiben über Runden) */
  inventory: Inventory;
  /** Upgrade-Stufen (bleiben über Runden) */
  upgrades: Upgrades;
  /** Waffe, bisher immer 'fist' */
  weapon: WeaponId;
```

und direkt vor `/** Startpunkt, hier erscheint …` einfügen:

```ts
  /** Rundenverdienst in Cent (Pfand dieser Runde) */
  earnedRound: number;
  /** Gesamtverdienst der Serie in Cent (alle Runden, inklusive der laufenden) */
  earnedTotal: number;
```

In `packages/core/src/config.ts`:

1. Zeile 1 wird `import type { BottleKind, ShopCategory, ShopItemId, SpotType } from './types';`.
2. Nach `export type Range = …` einfügen:

```ts
/** level: Stufen (Preis je nächste Stufe), once: höchstens einmal, stack: Stückzahl bis CONFIG.shop.maxStack */
export type ShopKind = 'level' | 'once' | 'stack';

export interface ShopItemDef {
  category: ShopCategory;
  /** Anzeigename im Shop */
  name: string;
  kind: ShopKind;
  /** level: Preis in Cent von Stufe i auf i + 1; once/stack: [Preis je Stück] */
  prices: readonly number[];
  /** level: Wirkung je Stufe (Index = Stufe, Länge = prices.length + 1); sonst leer */
  values: readonly number[];
  /** false = wird grau mit "bald" angezeigt und ist nicht kaufbar */
  available: boolean;
}

/** Preis in Cent, um von Taschenstufe i auf i + 1 zu kommen */
const UPGRADE_PRICES: readonly number[] = [150, 400, 900];
```

3. `upgradePrices: [150, 400, 900],` wird `upgradePrices: UPGRADE_PRICES,`.
4. Den Block `items: { … } as Record<ItemId, { name: string; price: number }>,` löschen.
5. `food: { price: 100, heal: 30 },` wird `food: { heal: 30 },` mit Kommentar `/** Eine Portion Essen aus dem Inventar heilt so viel */` davor.
6. Vor `health: {` einfügen:

```ts
  /**
   * Shop-Phase (Spec §3). Reihenfolge der Einträge = Reihenfolge im Shop. Preise und Wirkungen sind
   * Startwerte für das spätere Balancing.
   */
  shop: {
    /** Höchster Bestand eines Verbrauchsguts */
    maxStack: 99,
    items: {
      bag: { category: 'bags', name: 'Größere Tasche', kind: 'level', prices: UPGRADE_PRICES, values: [], available: true },
      /** values: Knockout-Dauer in ms */
      knockout: { category: 'upgrades', name: 'Knockout kürzer', kind: 'level', prices: [200, 500, 1000], values: [20000, 15000, 10000, 5000], available: true },
      /** values: Faktor auf die Laufgeschwindigkeit */
      speed: { category: 'upgrades', name: 'Laufgeschwindigkeit', kind: 'level', prices: [200, 500, 1000], values: [1, 1.08, 1.16, 1.24], available: true },
      /** values: Faktor auf die Suchzeit */
      search: { category: 'upgrades', name: 'Schneller suchen', kind: 'level', prices: [200, 500, 1000], values: [1, 0.85, 0.7, 0.55], available: true },
      /** values: zusätzlicher Schaden je Schlag */
      punch: { category: 'attack', name: 'Stärkerer Schlag', kind: 'level', prices: [250, 600, 1200], values: [0, 5, 10, 15], available: true },
      bolt_cutters: { category: 'attack', name: 'Bolzenschneider', kind: 'once', prices: [600], values: [], available: true },
      sling: { category: 'attack', name: 'Steinschleuder', kind: 'once', prices: [800], values: [], available: false },
      pistol: { category: 'attack', name: 'Pistole', kind: 'once', prices: [2000], values: [], available: false },
      dog_treat: { category: 'defense', name: 'Leckerli', kind: 'stack', prices: [100], values: [], available: true },
      food: { category: 'defense', name: 'Essen', kind: 'stack', prices: [100], values: [], available: true },
      /** values: weniger Schaden je Schlag */
      armor: { category: 'defense', name: 'Rüstung', kind: 'level', prices: [250, 600, 1200], values: [0, 4, 8, 12], available: true },
    } as Record<ShopItemId, ShopItemDef>,
  },
```

- [ ] **Step 4: shop.ts**

Create `packages/core/src/shop.ts`:

```ts
import { CONFIG } from './config';
import type { Inventory, Player, ShopCategory, ShopItemId, UpgradeId, Upgrades } from './types';

/** Was ein Spieler von Runde zu Runde mitnimmt (Spec §1.2). */
export type Progress = Pick<Player, 'money' | 'containerLevel' | 'upgrades' | 'inventory' | 'earnedTotal'>;

export const SHOP_CATEGORIES: readonly ShopCategory[] = ['bags', 'upgrades', 'attack', 'defense'];

export const SHOP_CATEGORY_NAMES: Record<ShopCategory, string> = {
  bags: 'Taschen',
  upgrades: 'Upgrades',
  attack: 'Angriff',
  defense: 'Verteidigung',
};

const UPGRADE_IDS: readonly string[] = ['knockout', 'speed', 'search', 'punch', 'armor'];

export function isShopCategory(v: unknown): v is ShopCategory {
  return typeof v === 'string' && (SHOP_CATEGORIES as readonly string[]).includes(v);
}

export function isShopItemId(v: unknown): v is ShopItemId {
  return typeof v === 'string' && Object.hasOwn(CONFIG.shop.items, v);
}

function isUpgradeId(v: ShopItemId): v is UpgradeId {
  return UPGRADE_IDS.includes(v);
}

/** Einträge einer Kategorie in Katalogreihenfolge */
export function shopItemsOf(category: ShopCategory): ShopItemId[] {
  return (Object.keys(CONFIG.shop.items) as ShopItemId[]).filter((id) => CONFIG.shop.items[id].category === category);
}

export function noUpgrades(): Upgrades {
  return { knockout: 0, speed: 0, search: 0, punch: 0, armor: 0 };
}

export function emptyInventory(): Inventory {
  return { dog_treat: 0, food: 0, bolt_cutters: false };
}

/** Fortschritt eines neuen Spielers: nichts. */
export function freshProgress(): Progress {
  return { money: 0, containerLevel: 0, upgrades: noUpgrades(), inventory: emptyInventory(), earnedTotal: 0 };
}

/** Tiefe Kopie, damit Runde, Raum und Nachrichten keine Objekte teilen. */
export function progressOf(p: Progress): Progress {
  return {
    money: p.money,
    containerLevel: p.containerLevel,
    upgrades: { ...p.upgrades },
    inventory: { ...p.inventory },
    earnedTotal: p.earnedTotal,
  };
}

/** Wirkung der aktuellen Stufe eines Upgrades (values[Stufe] aus CONFIG.shop). */
export function upgradeValue(p: Pick<Player, 'upgrades'>, id: UpgradeId): number {
  return CONFIG.shop.items[id].values[p.upgrades[id]];
}

/** Besitz: Stufe (Tasche, Upgrades), 0 oder 1 (einmalige Dinge) oder Stückzahl (Verbrauchsgüter). */
export function ownedOf(p: Progress, item: ShopItemId): number {
  if (item === 'bag') return p.containerLevel;
  if (isUpgradeId(item)) return p.upgrades[item];
  if (item === 'bolt_cutters') return p.inventory.bolt_cutters ? 1 : 0;
  if (item === 'dog_treat' || item === 'food') return p.inventory[item];
  return 0; // Fernkampf: noch nicht kaufbar
}

/** Höchster Besitz: Zahl der Stufen, 1 oder CONFIG.shop.maxStack. */
export function maxOf(item: ShopItemId): number {
  const def = CONFIG.shop.items[item];
  if (def.kind === 'level') return def.prices.length;
  if (def.kind === 'once') return 1;
  return CONFIG.shop.maxStack;
}

export type BuyRefusal = 'unknown_item' | 'wrong_category' | 'unavailable' | 'bad_qty' | 'maxed' | 'no_money';

export type BuyResult = { ok: true; cost: number } | { ok: false; reason: BuyRefusal };

export const BUY_REFUSAL_TEXT: Record<BuyRefusal, string> = {
  unknown_item: 'Unbekannter Artikel.',
  wrong_category: 'Der Artikel gehört nicht in diese Kategorie.',
  unavailable: 'Gibt es noch nicht.',
  bad_qty: 'Ungültige Menge.',
  maxed: 'Mehr geht nicht.',
  no_money: 'Nicht genug Geld.',
};

/**
 * Prüft einen Kauf, ohne etwas zu ändern. Stufen und einmalige Dinge nur einzeln, Verbrauchsgüter
 * bis zum Bestand CONFIG.shop.maxStack. Kein Teilkauf: reicht das Geld nicht für alles, wird abgelehnt.
 */
export function checkShopBuy(p: Progress, category: unknown, item: unknown, qty: unknown): BuyResult {
  if (!isShopCategory(category) || !isShopItemId(item)) return { ok: false, reason: 'unknown_item' };
  const def = CONFIG.shop.items[item];
  if (def.category !== category) return { ok: false, reason: 'wrong_category' };
  if (!def.available) return { ok: false, reason: 'unavailable' };
  if (typeof qty !== 'number' || !Number.isInteger(qty) || qty < 1 || qty > CONFIG.shop.maxStack) {
    return { ok: false, reason: 'bad_qty' };
  }
  if (def.kind !== 'stack' && qty !== 1) return { ok: false, reason: 'bad_qty' };
  const owned = ownedOf(p, item);
  if (owned + qty > maxOf(item)) return { ok: false, reason: 'maxed' };
  const cost = def.kind === 'level' ? def.prices[owned] : def.prices[0] * qty;
  if (p.money < cost) return { ok: false, reason: 'no_money' };
  return { ok: true, cost };
}

/** Kauft (wenn checkShopBuy zustimmt) und bucht Geld und Besitz. Verändert `p` nur bei Erfolg. */
export function shopBuy(p: Progress, category: unknown, item: unknown, qty: unknown): BuyResult {
  const r = checkShopBuy(p, category, item, qty);
  if (!r.ok) return r;
  const id = item as ShopItemId;
  p.money -= r.cost;
  if (id === 'bag') p.containerLevel++;
  else if (isUpgradeId(id)) p.upgrades[id]++;
  else if (id === 'bolt_cutters') p.inventory.bolt_cutters = true;
  else if (id === 'dog_treat' || id === 'food') p.inventory[id] += qty as number;
  return r;
}
```

In `packages/core/src/index.ts` nach `export * from './economy';` einfügen: `export * from './shop';`.

- [ ] **Step 5: game.ts, theft.ts, npc.ts, health.ts, snapshot.ts**

`packages/core/src/game.ts`:

```ts
import { emptyBottles } from './bottles';
import { CONFIG } from './config';
import { rollContents } from './loot';
import { nextRandom, randInt } from './rng';
import { freshProgress, progressOf } from './shop';
import type { Progress } from './shop';
import type { GameState, MapData, Player, Point, Spot, SpotDef } from './types';

export interface GameOptions {
  roundMs?: number;
  /** Fortschritt aus früheren Runden der Serie je Spieler-id; fehlt ein Spieler, beginnt er leer. */
  progress?: Record<string, Progress>;
}
```

In `createGame` die Spielerschleife ersetzen durch:

```ts
  const progress = options.progress ?? {};
  playerIds.forEach((id, i) => {
    const own = Object.hasOwn(progress, id) ? progress[id] : freshProgress();
    state.players[id] = newPlayer(id, map.spawns[i % map.spawns.length], own);
  });
```

und `newPlayer` vollständig ersetzen:

```ts
function newPlayer(id: string, at: Point, prog: Progress): Player {
  // Kopie: die Runde verändert Geld und Inventar, der Aufrufer behält seinen Stand
  const own = progressOf(prog);
  return {
    id,
    x: at.x,
    y: at.y,
    money: own.money,
    bottles: emptyBottles(),
    containerLevel: own.containerLevel,
    mode: 'walking',
    searchSpotId: null,
    searchProgressMs: 0,
    depositMs: 0,
    actionHeld: false,
    stealHeld: false,
    inventory: own.inventory,
    upgrades: own.upgrades,
    weapon: 'fist',
    stealCooldownMs: 0,
    shieldMs: 0,
    health: CONFIG.health.max,
    unconsciousMs: 0,
    earnedRound: 0,
    earnedTotal: own.earnedTotal,
    spawn: { x: at.x, y: at.y },
  };
}
```

`packages/core/src/theft.ts`, in `tryInstantSteal`:

```ts
  if (thief.inventory.bolt_cutters) {
    takeLoot(thief, target, 1);
    thief.inventory.bolt_cutters = false;
  } else {
    takeLoot(thief, target, CONFIG.steal.fraction);
  }
```

und im Kommentar über `tryInstantSteal` "das Item wird verbraucht" durch "der Bolzenschneider wird verbraucht" ersetzen.

`packages/core/src/npc.ts`, in `updateDog`:

```ts
  if (target.inventory.dog_treat > 0) {
    target.inventory.dog_treat--;
    npc.distractedMs = cfg.distractedMs;
  } else {
```

`packages/core/src/health.ts`: in `knockOut` die Zeile `p.item = null;` löschen und den Kommentar zu `/** Umfallen: Flaschen und ein Teil des Geldes gehen verloren, das Inventar bleibt. */` ändern (Task 4 ändert `knockOut` weiter).

`packages/core/src/snapshot.ts`: `import { noUpgrades } from './shop';` ergänzen und im Objekt `foreign` die Zeile `item: null,` ersetzen durch:

```ts
      inventory: { dog_treat: 0, food: 0, bolt_cutters: false },
      upgrades: noUpgrades(),
      weapon: p.weapon,
```

sowie vor `spawn: p.spawn,` einfügen:

```ts
      earnedRound: revealMoney ? p.earnedRound : 0,
      earnedTotal: revealMoney ? p.earnedTotal : 0,
```

Den Kommentar über `projectSnapshot` anpassen: "Fremdes Geld und fremde Verdienste (bis Rundenende), fremder Container-Inhalt, fremdes Inventar und fremde Upgrades, Such-, Abgabe- und Tastenzustände …".

- [ ] **Step 6: Update the existing tests**

1. `packages/core/test/game.test.ts`, `it('starts players without item, steal cooldown or shield'`: Titel `'starts players with an empty inventory, the fist and without cooldown or shield'`, Erwartung:

```ts
    expect(s.players.a).toMatchObject({
      inventory: { dog_treat: 0, food: 0, bolt_cutters: false },
      upgrades: { knockout: 0, speed: 0, search: 0, punch: 0, armor: 0 },
      weapon: 'fist',
      earnedRound: 0,
      earnedTotal: 0,
      stealCooldownMs: 0,
      shieldMs: 0,
    });
```

2. `packages/core/test/snapshot.test.ts`: in `game()` `s.players.p1.item = 'bolt_cutters';` durch `s.players.p1.inventory.bolt_cutters = true;` und `s.players.p2.item = 'dog_treat';` durch `s.players.p2.inventory.dog_treat = 3;` plus `s.players.p2.upgrades.armor = 2;` und `s.players.p2.earnedRound = 55;` ersetzen. In `'hides money, container contents and item of other players'` (Titel: `'hides money, container contents, inventory and upgrades of other players'`) `expect(other.item).toBeNull();` ersetzen durch:

```ts
    expect(other.inventory).toEqual({ dog_treat: 0, food: 0, bolt_cutters: false });
    expect(other.upgrades.armor).toBe(0);
    expect(other.earnedRound).toBe(0);
    expect(other.weapon).toBe('fist');
```

In `'reveals every player money once the round has ended'` `expect(snap.players.p2.item).toBeNull();` ersetzen durch:

```ts
    expect(snap.players.p2.inventory.dog_treat).toBe(0); // Inventar bleibt auch dann verborgen
    expect(snap.players.p2.earnedRound).toBe(55);
```

`PLAYER_KEYS` ersetzen durch:

```ts
  const PLAYER_KEYS = [
    'actionHeld', 'bottles', 'containerLevel', 'depositMs', 'earnedRound', 'earnedTotal', 'health', 'id', 'inventory',
    'mode', 'money', 'searchProgressMs', 'searchSpotId', 'shieldMs', 'spawn', 'stealCooldownMs', 'stealHeld',
    'unconsciousMs', 'upgrades', 'weapon', 'x', 'y',
  ];
```

3. `packages/core/test/theft.test.ts`, `describe('bolt cutters')`: jedes `s.players.p1.item = 'bolt_cutters';` durch `s.players.p1.inventory.bolt_cutters = true;`, jedes `expect(s.players.p1.item).toBeNull();` durch `expect(s.players.p1.inventory.bolt_cutters).toBe(false);` und jedes `expect(s.players.p1.item).toBe('bolt_cutters');` durch `expect(s.players.p1.inventory.bolt_cutters).toBe(true);` ersetzen.
4. `packages/core/test/npc.test.ts`: jedes `s.players.p1.item = 'dog_treat';` durch `s.players.p1.inventory.dog_treat = 1;`; `expect(s.players.p1.item).toBeNull();` durch `expect(s.players.p1.inventory.dog_treat).toBe(0);`; im Test `'does not use a bolt cutters item up on a bite'` `s.players.p1.item = 'bolt_cutters';` durch `s.players.p1.inventory.bolt_cutters = true;` und `expect(s.players.p1.item).toBe('bolt_cutters');` durch `expect(s.players.p1.inventory.bolt_cutters).toBe(true);`. Direkt nach `'is distracted by a treat instead of biting, and the treat is used up'` neu einfügen:

```ts
  it('uses only one of several treats per bite attempt', () => {
    const s = quiet(newGame(openRows(30, 5)));
    s.players.p1.inventory.dog_treat = 3;
    addNpc(s, 'dog', 30, 24);
    runSteps(s, {}, 3, 20);
    expect(s.players.p1.inventory.dog_treat).toBe(2);
    expect(s.players.p1.health).toBeGreaterThan(CONFIG.health.max - 1);
  });
```

5. `packages/core/test/health.test.ts`, `knocked()`: `p.item = 'bolt_cutters';` durch `p.inventory.bolt_cutters = true;`. Im Test `'drops bottles and item and loses a quarter of the money (rounded down)'` den Titel zu `'drops bottles, keeps the inventory and loses a quarter of the money (rounded down)'` und `expect(p.item).toBeNull();` zu `expect(p.inventory.bolt_cutters).toBe(true);` ändern.
6. `packages/core/test/determinism-theft.test.ts`: `s.players.p1.item = 'bolt_cutters';` durch `s.players.p1.inventory.bolt_cutters = true;`, `expect(a.players.p1.item).toBeNull();` durch `expect(a.players.p1.inventory.bolt_cutters).toBe(false);`, Testtitel `'… and the item was used'` zu `'… and the cutters were used'`.
7. `packages/core/test/steal-config.test.ts`: Titel `'steal and shop config'`; den Test `'has a priced bolt cutters item'` ersetzen durch:

```ts
  it('has priced bolt cutters in the attack category', () => {
    expect(CONFIG.shop.items.bolt_cutters.prices[0]).toBeGreaterThan(0);
    expect(CONFIG.shop.items.bolt_cutters.name).toBe('Bolzenschneider');
    expect(CONFIG.shop.items.bolt_cutters.category).toBe('attack');
  });
```

- [ ] **Step 7: Run tests and typecheck**

Run: `npm test -w @pfandraiders/core && npm run typecheck -w @pfandraiders/core`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/config.ts packages/core/src/shop.ts packages/core/src/game.ts packages/core/src/theft.ts packages/core/src/npc.ts packages/core/src/health.ts packages/core/src/snapshot.ts packages/core/src/index.ts packages/core/test/shop.test.ts packages/core/test/game.test.ts packages/core/test/snapshot.test.ts packages/core/test/theft.test.ts packages/core/test/npc.test.ts packages/core/test/health.test.ts packages/core/test/determinism-theft.test.ts packages/core/test/steal-config.test.ts
git commit -m "feat(core): Fortschritt, Inventar und Shop-Katalog

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Rundenverdienst, Gesamtverdienst und Rangliste

**Files:**
- Modify: `packages/core/src/economy.ts:23-28` (`depositOne`)
- Modify: `packages/core/src/ranking.ts` (ganze Datei)
- Test: `packages/core/test/ranking.test.ts`, `packages/core/test/economy.test.ts`

**Interfaces:**
- Consumes: `Player.earnedRound`, `Player.earnedTotal` (Task 2)
- Produces: `RankEntry { id: string; money: number; round: number; total: number }`; `ranking(state: GameState): RankEntry[]` sortiert nach `round` absteigend, dann `total` absteigend, dann `id`.

- [ ] **Step 1: Write the failing test**

`packages/core/test/ranking.test.ts` vollständig ersetzen:

```ts
import { describe, expect, it } from 'vitest';
import { ranking } from '../src/ranking';
import { newGame, SEARCH_ROWS } from './helpers';

describe('ranking', () => {
  it('sorts by round earnings, then total earnings, then id', () => {
    const s = newGame(SEARCH_ROWS, ['p3', 'p1', 'p2', 'p4']);
    s.players.p1.earnedRound = 5;
    s.players.p1.earnedTotal = 50;
    s.players.p2.earnedRound = 9;
    s.players.p2.earnedTotal = 9;
    s.players.p3.earnedRound = 5;
    s.players.p3.earnedTotal = 50;
    s.players.p4.earnedRound = 5;
    s.players.p4.earnedTotal = 80;
    s.players.p4.money = 3;
    expect(ranking(s)).toEqual([
      { id: 'p2', money: 0, round: 9, total: 9 },
      { id: 'p4', money: 3, round: 5, total: 80 },
      { id: 'p1', money: 0, round: 5, total: 50 },
      { id: 'p3', money: 0, round: 5, total: 50 },
    ]);
  });

  it('is not changed by money spent earlier (money is not the key)', () => {
    const s = newGame(SEARCH_ROWS, ['p1', 'p2']);
    s.players.p1.money = 10_000;
    s.players.p2.earnedRound = 1;
    expect(ranking(s)[0].id).toBe('p2');
  });
});
```

In `packages/core/test/economy.test.ts` im Block `describe('timed deposit'` am Ende einfügen:

```ts
  it('adds every deposited bottle to money, round earnings and total earnings', () => {
    const s = atDropoff();
    s.players.p1.money = 40;
    s.players.p1.earnedTotal = 1000;
    s.players.p1.bottles = { plastic: 1, glass: 1, crate: 0 };
    runFor(s, PRESS, CONFIG.depositEveryMs + 40);
    const value = CONFIG.bottleValue.plastic + CONFIG.bottleValue.glass;
    expect(s.players.p1.money).toBe(40 + value);
    expect(s.players.p1.earnedRound).toBe(value);
    expect(s.players.p1.earnedTotal).toBe(1000 + value);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run test/ranking.test.ts test/economy.test.ts`
Expected: FAIL (`round`/`total` fehlen, `earnedRound` bleibt 0).

- [ ] **Step 3: Write minimal implementation**

`depositOne` in `packages/core/src/economy.ts`:

```ts
/** Gibt die wertvollste Flasche ab und schreibt ihren Wert gut (Geld, Rundenverdienst, Gesamtverdienst). Der Aufrufer prüft die Nähe. */
export function depositOne(p: Player): void {
  const kind = VALUE_ORDER.find((k) => p.bottles[k] > 0);
  if (kind === undefined) return;
  const value = CONFIG.bottleValue[kind];
  p.bottles[kind]--;
  p.money += value;
  p.earnedRound += value;
  p.earnedTotal += value;
}
```

`packages/core/src/ranking.ts`:

```ts
import type { GameState } from './types';

export interface RankEntry {
  id: string;
  /** Geld jetzt (Cent) */
  money: number;
  /** Rundenverdienst (Cent) */
  round: number;
  /** Gesamtverdienst der Serie (Cent) */
  total: number;
}

/**
 * Höchster Rundenverdienst zuerst, bei Gleichstand höherer Gesamtverdienst, dann nach id.
 * Flaschen im Container zählen nicht; ausgegebenes Geld mindert keinen Verdienst.
 */
export function ranking(state: GameState): RankEntry[] {
  return Object.values(state.players)
    .map((p) => ({ id: p.id, money: p.money, round: p.earnedRound, total: p.earnedTotal }))
    .sort((a, b) => b.round - a.round || b.total - a.total || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test -w @pfandraiders/core && npm run typecheck -w @pfandraiders/core`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/economy.ts packages/core/src/ranking.ts packages/core/test/ranking.test.ts packages/core/test/economy.test.ts
git commit -m "feat(core): Runden- und Gesamtverdienst, Rangliste danach

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Knockout nach Upgrade, Aufstehen am Ort, Essen aus dem Inventar

**Files:**
- Modify: `packages/core/src/types.ts` (`Player.eatHeld`, `Player.robbed`)
- Modify: `packages/core/src/config.ts` (`health.unconsciousMs`, `health.moneyLossFraction` entfernen)
- Modify: `packages/core/src/health.ts` (ganze Datei)
- Modify: `packages/core/src/step.ts` (Flanke Essen)
- Modify: `packages/core/src/game.ts` (`newPlayer`), `packages/core/src/snapshot.ts`
- Test: `packages/core/test/health.test.ts`, `packages/core/test/snapshot.test.ts`

**Interfaces:**
- Consumes: `upgradeValue(p, 'knockout')` aus `shop.ts`, `Input.eat`
- Produces: `knockoutMsOf(p: Pick<Player, 'upgrades'>): number`; `knockOut(p: Player): void` (behält Flaschen, Geld, Inventar; setzt `robbed = false`); `eatFood(p: Player): boolean`; `Player.eatHeld: boolean`; `Player.robbed: boolean`.

- [ ] **Step 1: Write the failing test**

In `packages/core/test/health.test.ts` den Import ergänzen: `import { damage, eatFood, knockoutMsOf } from '../src/health';` (statt nur `damage`). Den ganzen Block `describe('knock out', …)` ersetzen durch:

```ts
describe('knock out', () => {
  function knocked() {
    const s = newGame(SEARCH_ROWS);
    const p = s.players.p1;
    p.money = 1001;
    p.bottles = { plastic: 2, glass: 1, crate: 0 };
    p.inventory.bolt_cutters = true;
    p.inventory.food = 2;
    damage(p, 1000);
    return s;
  }

  it('keeps bottles, money and inventory', () => {
    const p = knocked().players.p1;
    expect(p.bottles).toEqual({ plastic: 2, glass: 1, crate: 0 });
    expect(p.money).toBe(1001);
    expect(p.inventory).toEqual({ dog_treat: 0, food: 2, bolt_cutters: true });
    expect(p.mode).toBe('unconscious');
    expect(p.health).toBe(0);
    expect(p.robbed).toBe(false);
  });

  it('lasts 20 s without upgrade and 15, 10, 5 s with the knockout upgrade', () => {
    for (const [level, ms] of [[0, 20000], [1, 15000], [2, 10000], [3, 5000]] as const) {
      const s = newGame(SEARCH_ROWS);
      s.players.p1.upgrades.knockout = level;
      damage(s.players.p1, 1000);
      expect(s.players.p1.unconsciousMs).toBe(ms);
      expect(knockoutMsOf(s.players.p1)).toBe(ms);
    }
  });

  it('uses the same duration when hunger knocks the player out', () => {
    const s = newGame(SEARCH_ROWS);
    s.players.p1.upgrades.knockout = 2;
    s.players.p1.health = 0.05;
    runSteps(s, {}, 30, 20);
    expect(s.players.p1.unconsciousMs).toBeGreaterThan(10000 - 600);
    expect(s.players.p1.unconsciousMs).toBeLessThanOrEqual(10000);
  });

  it('cancels searching', () => {
    const s = newGame(SEARCH_ROWS);
    const p = s.players.p1;
    p.searchSpotId = 0;
    p.searchProgressMs = 500;
    damage(p, 1000);
    expect(p.searchSpotId).toBeNull();
    expect(p.searchProgressMs).toBe(0);
  });

  it('ignores all input while unconscious', () => {
    const s = knocked();
    runSteps(s, { p1: input({ moveX: 1, action: true, steal: true, attack: true, eat: true }) }, 50, 20);
    expect(s.players.p1.x).toBe(24);
    expect(s.players.p1.mode).toBe('unconscious');
    expect(s.players.p1.inventory.food).toBe(2);
  });

  it('takes no further damage while unconscious', () => {
    const s = knocked();
    const left = s.players.p1.unconsciousMs;
    damage(s.players.p1, 50);
    expect(s.players.p1.unconsciousMs).toBe(left);
    expect(s.players.p1.health).toBe(0);
  });

  it('stands up where he fell with revive health and shield', () => {
    const s = knocked();
    teleport(s, 'p1', { x: 100, y: 24 });
    runFor(s, {}, knockoutMsOf(s.players.p1) + 100);
    const p = s.players.p1;
    expect(p.x).toBe(100);
    expect(p.y).toBe(24);
    expect(p.mode).toBe('walking');
    expect(p.health).toBeGreaterThan(CONFIG.health.reviveHealth - 1);
    expect(p.health).toBeLessThanOrEqual(CONFIG.health.reviveHealth);
    expect(p.shieldMs).toBeGreaterThan(CONFIG.health.spawnShieldMs - 200);
  });

  it('never lets health go below zero or become NaN', () => {
    const s = newGame(SEARCH_ROWS);
    damage(s.players.p1, 250);
    expect(s.players.p1.health).toBe(0);
    runSteps(s, {}, 10, 20);
    expect(Number.isNaN(s.players.p1.health)).toBe(false);
    expect(s.players.p1.health).toBeGreaterThanOrEqual(0);
  });
});

describe('eating from the inventory', () => {
  const EAT = { p1: input({ eat: true }) };

  it('heals one portion on the key press and uses it up', () => {
    const s = newGame(SEARCH_ROWS);
    s.players.p1.health = 50;
    s.players.p1.inventory.food = 2;
    runSteps(s, EAT, 1);
    expect(s.players.p1.health).toBeCloseTo(50 + CONFIG.health.food.heal, 1);
    expect(s.players.p1.inventory.food).toBe(1);
  });

  it('eats only once while the key is held', () => {
    const s = newGame(SEARCH_ROWS);
    s.players.p1.health = 10;
    s.players.p1.inventory.food = 5;
    runSteps(s, EAT, 20);
    expect(s.players.p1.inventory.food).toBe(4);
    runSteps(s, { p1: input({}) }, 1);
    runSteps(s, EAT, 1);
    expect(s.players.p1.inventory.food).toBe(3);
  });

  it('caps health at the maximum', () => {
    const s = newGame(SEARCH_ROWS);
    s.players.p1.health = 95;
    s.players.p1.inventory.food = 1;
    runSteps(s, EAT, 1);
    expect(s.players.p1.health).toBe(CONFIG.health.max);
  });

  it('does nothing without food or at full health', () => {
    const s = newGame(SEARCH_ROWS);
    s.players.p1.health = 50;
    expect(eatFood(s.players.p1)).toBe(false);
    s.players.p1.health = CONFIG.health.max;
    s.players.p1.inventory.food = 1;
    expect(eatFood(s.players.p1)).toBe(false);
    expect(s.players.p1.inventory.food).toBe(1);
  });
});
```

Im Block `describe('hunger'` bleibt alles. In `packages/core/test/snapshot.test.ts` `PLAYER_KEYS` um `'eatHeld'` und `'robbed'` ergänzen (alphabetisch einsortiert); die Liste lautet dann:

```ts
  const PLAYER_KEYS = [
    'actionHeld', 'bottles', 'containerLevel', 'depositMs', 'earnedRound', 'earnedTotal', 'eatHeld', 'health', 'id',
    'inventory', 'mode', 'money', 'robbed', 'searchProgressMs', 'searchSpotId', 'shieldMs', 'spawn', 'stealCooldownMs',
    'stealHeld', 'unconsciousMs', 'upgrades', 'weapon', 'x', 'y',
  ];
```

und im Block `describe('projectSnapshot'` einfügen:

```ts
  it('shows whether a foreign player was robbed but never his eat key', () => {
    const s = game();
    s.players.p2.robbed = true;
    s.players.p2.eatHeld = true;
    const other = projectSnapshot(s, 'p1').players.p2;
    expect(other.robbed).toBe(true);
    expect(other.eatHeld).toBe(false);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run test/health.test.ts test/snapshot.test.ts`
Expected: FAIL (`eatFood`/`knockoutMsOf` nicht exportiert, Knockout leert Flaschen).

- [ ] **Step 3: Write minimal implementation**

`packages/core/src/types.ts`, im `Player` nach `stealHeld: boolean;` einfügen:

```ts
  /** Essen-Taste im vorigen Tick gedrückt, für die Flanke */
  eatHeld: boolean;
```

und nach `unconsciousMs: number;` einfügen:

```ts
  /** In diesem Knockout schon ausgeraubt (einmal pro Knockout, Spec §4.4) */
  robbed: boolean;
```

Den Kommentar zu `spawn` ändern: `/** Startpunkt dieser Runde */`.

`packages/core/src/config.ts`, im Block `health` die Zeilen `unconsciousMs: 10000,` sowie `/** Anteil des Geldes … */` und `moneyLossFraction: 0.25,` löschen; den Kommentar zu `reviveHealth` auf `/** Leben nach dem Aufstehen */` und zu `spawnShieldMs` auf `/** Schutz nach dem Aufstehen */` ändern. (Die Knockout-Dauer steht jetzt in `CONFIG.shop.items.knockout.values`.)

`packages/core/src/health.ts` vollständig ersetzen:

```ts
import { CONFIG } from './config';
import { cancelSearch } from './search';
import { upgradeValue } from './shop';
import type { Player } from './types';

/** Dauer eines Knockouts nach der Stufe "Knockout kürzer": 20 s, 15 s, 10 s, 5 s. */
export function knockoutMsOf(p: Pick<Player, 'upgrades'>): number {
  return upgradeValue(p, 'knockout');
}

/**
 * Umfallen: Flaschen, Geld und Inventar bleiben. Der Spieler liegt knockoutMsOf(p) lang und kann
 * in dieser Zeit einmal ausgeraubt werden (robbed wird zurückgesetzt).
 */
export function knockOut(p: Player): void {
  p.health = 0;
  p.unconsciousMs = knockoutMsOf(p);
  p.robbed = false;
  cancelSearch(p);
  p.depositMs = 0;
  p.mode = 'unconscious';
}

/** Schaden. Bewusstlose nehmen keinen Schaden. Unterbricht das Suchen. */
export function damage(p: Player, amount: number): void {
  if (p.unconsciousMs > 0) return;
  cancelSearch(p);
  p.mode = 'walking';
  p.health = Math.max(0, p.health - amount);
  if (p.health <= 0) knockOut(p);
}

/**
 * Hunger, Bewusstlosigkeit und Aufstehen für einen Tick. Aufgestanden wird an derselben Stelle.
 * Gibt true zurück, wenn der Spieler in diesem Tick bewusstlos ist und keine Eingabe wirkt.
 */
export function updateHealth(p: Player, dtMs: number): boolean {
  if (p.unconsciousMs > 0) {
    p.unconsciousMs = Math.max(0, p.unconsciousMs - dtMs);
    if (p.unconsciousMs > 0) return true;
    p.health = CONFIG.health.reviveHealth;
    p.shieldMs = CONFIG.health.spawnShieldMs;
    p.robbed = false;
    return false;
  }
  p.health -= dtMs / CONFIG.health.hungerEveryMs;
  if (p.health <= 0) {
    knockOut(p);
    return true;
  }
  return false;
}

/** Isst eine Portion aus dem Inventar: heilt bis zum Maximum. Nicht bewusstlos, nicht bei vollem Leben. */
export function eatFood(p: Player): boolean {
  if (p.unconsciousMs > 0 || p.inventory.food <= 0 || p.health >= CONFIG.health.max) return false;
  p.inventory.food--;
  p.health = Math.min(CONFIG.health.max, p.health + CONFIG.health.food.heal);
  return true;
}
```

`packages/core/src/step.ts`: Import `import { eatFood, updateHealth } from './health';`. In `updatePlayer` nach `p.stealHeld = input.steal;` einfügen:

```ts
  const eatPressed = input.eat && !p.eatHeld;
  p.eatHeld = input.eat;
```

und direkt nach dem `if (updateHealth(p, dt)) { … }`-Block:

```ts
  if (eatPressed) eatFood(p);
```

`packages/core/src/game.ts`, in `newPlayer` nach `stealHeld: false,` `eatHeld: false,` und nach `unconsciousMs: 0,` `robbed: false,` einfügen.

`packages/core/src/snapshot.ts`, im Objekt `foreign` nach `stealHeld: false,` `eatHeld: false,` und nach `unconsciousMs: p.unconsciousMs,` `robbed: p.robbed,` einfügen.

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test -w @pfandraiders/core && npm run typecheck -w @pfandraiders/core`
Expected: PASS. (Kein anderer Kerntest erwartet das Aufstehen am Startpunkt.)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/config.ts packages/core/src/health.ts packages/core/src/step.ts packages/core/src/game.ts packages/core/src/snapshot.ts packages/core/test/health.test.ts packages/core/test/snapshot.test.ts
git commit -m "feat(core): Knockout nach Upgrade, Aufstehen am Ort, Essen aus dem Inventar

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Upgrades Laufgeschwindigkeit und schnelleres Suchen

**Files:**
- Modify: `packages/core/src/movement.ts:64-65`
- Modify: `packages/core/src/search.ts`
- Test: `packages/core/test/movement.test.ts`, `packages/core/test/search.test.ts`

**Interfaces:**
- Consumes: `upgradeValue(p, 'speed' | 'search')`
- Produces: `searchMsOf(p: Pick<Player, 'upgrades'>): number` (aus `search.ts`, über `index.ts` exportiert). `walk` berücksichtigt `upgrades.speed`.

- [ ] **Step 1: Write the failing test**

Am Ende von `packages/core/test/movement.test.ts` einfügen (Imports `CONFIG`, `input`, `newGame`, `openRows`, `runSteps` aus den vorhandenen Imports ergänzen, falls sie fehlen):

```ts
describe('speed upgrade', () => {
  it('walks faster by the factor of each level', () => {
    for (const level of [0, 1, 2, 3]) {
      const s = newGame(openRows(60, 5));
      s.players.p1.upgrades.speed = level;
      const x0 = s.players.p1.x;
      runSteps(s, { p1: input({ moveX: 1 }) }, 10, 20);
      const expected = (CONFIG.playerSpeed * CONFIG.shop.items.speed.values[level] * 200) / 1000;
      expect(s.players.p1.x - x0).toBeCloseTo(expected, 6);
    }
  });
});
```

Am Ende von `packages/core/test/search.test.ts` einfügen (Import `import { searchMsOf } from '../src/search';` ergänzen):

```ts
describe('search upgrade', () => {
  it('shortens the search time by the factor of the level', () => {
    expect(searchMsOf({ upgrades: { knockout: 0, speed: 0, search: 0, punch: 0, armor: 0 } })).toBe(CONFIG.searchMs);
    expect(searchMsOf({ upgrades: { knockout: 0, speed: 0, search: 3, punch: 0, armor: 0 } })).toBe(
      Math.round(CONFIG.searchMs * 0.55),
    );
  });

  it('finishes a search earlier with the upgrade', () => {
    const s = newGame(SEARCH_ROWS);
    setSpot(s, 0, { plastic: 2 });
    teleport(s, 'p1', s.spots[0]);
    s.players.p1.upgrades.search = 3;
    const ms = searchMsOf(s.players.p1);
    runFor(s, { p1: input({ action: true }) }, ms - 40);
    expect(s.players.p1.bottles.plastic).toBe(0);
    runFor(s, { p1: input({ action: true }) }, 60);
    expect(s.players.p1.bottles.plastic).toBe(2);
  });
});
```

(`SEARCH_ROWS`, `setSpot`, `teleport`, `runFor`, `input`, `newGame`, `CONFIG` sind in `search.test.ts` bereits importiert; fehlende ergänzen.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run test/movement.test.ts test/search.test.ts`
Expected: FAIL (`searchMsOf` fehlt, Geschwindigkeit ohne Faktor).

- [ ] **Step 3: Write minimal implementation**

`packages/core/src/movement.ts`: `import { upgradeValue } from './shop';` ergänzen und in `walk`:

```ts
  const speed =
    CONFIG.playerSpeed * CONFIG.containers[p.containerLevel].speedMult * upgradeValue(p, 'speed');
```

`packages/core/src/search.ts`: Import `import { upgradeValue } from './shop';` und `import type { GameState, Player, Spot } from './types';` bleibt. Neue Funktion nach `cancelSearch`:

```ts
/** Suchdauer nach der Stufe "Schneller suchen" (ganze ms). */
export function searchMsOf(p: Pick<Player, 'upgrades'>): number {
  return Math.round(CONFIG.searchMs * upgradeValue(p, 'search'));
}
```

und in `updateSearch` `if (p.searchProgressMs >= CONFIG.searchMs) {` durch `if (p.searchProgressMs >= searchMsOf(p)) {` ersetzen.

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test -w @pfandraiders/core && npm run typecheck -w @pfandraiders/core`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/movement.ts packages/core/src/search.ts packages/core/test/movement.test.ts packages/core/test/search.test.ts
git commit -m "feat(core): Upgrades für Laufgeschwindigkeit und Suchzeit

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Schlagen

**Files:**
- Create: `packages/core/src/fight.ts`
- Modify: `packages/core/src/types.ts` (`attackHeld`, `attackCooldownMs`)
- Modify: `packages/core/src/config.ts` (`fight`)
- Modify: `packages/core/src/step.ts`, `packages/core/src/game.ts`, `packages/core/src/snapshot.ts`, `packages/core/src/index.ts`
- Test: Create `packages/core/test/fight.test.ts`; Modify `packages/core/test/snapshot.test.ts`

**Interfaces:**
- Consumes: `damage(p, amount)` und `knockoutMsOf(p)` (Task 4), `upgradeValue` (Task 2), `Input.attack`
- Produces: `CONFIG.fight = { radius: 20, cooldownMs: 600, damage: 20, minDamage: 5 }`; `Player.attackHeld: boolean`; `Player.attackCooldownMs: number`; `punchDamage(attacker: Player, victim: Player): number`; `findAttackTarget(state: GameState, attacker: Player): Player | null`; `tryAttack(state: GameState, attacker: Player): boolean`.

- [ ] **Step 1: Write the failing test**

Create `packages/core/test/fight.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { findAttackTarget, punchDamage } from '../src/fight';
import { damage, knockoutMsOf } from '../src/health';
import { input, newGame, runSteps, setSpot, teleport, THIEF_ROWS } from './helpers';

const PUNCH = { p1: input({ attack: true }) };
const IDLE = { p1: input({}) };

/** p1 (x=24) steht 16 px neben p2 (x=40), beide mit vollem Leben */
function setup() {
  return newGame(THIEF_ROWS, ['p1', 'p2']);
}

describe('punch', () => {
  it('hits the nearest awake player in reach for 20 health and starts the cooldown', () => {
    const s = setup();
    runSteps(s, PUNCH, 1);
    expect(s.players.p2.health).toBeCloseTo(CONFIG.health.max - CONFIG.fight.damage, 1);
    expect(s.players.p1.attackCooldownMs).toBe(CONFIG.fight.cooldownMs);
    expect(s.players.p1.health).toBeGreaterThan(CONFIG.health.max - 1);
  });

  it('acts on the press only, not while the key is held', () => {
    const s = setup();
    runSteps(s, PUNCH, 60); // 1200 ms gehalten
    expect(s.players.p2.health).toBeGreaterThan(CONFIG.health.max - CONFIG.fight.damage - 1);
  });

  it('does nothing during the 600 ms cooldown and hits again after it', () => {
    const s = setup();
    runSteps(s, PUNCH, 1);
    runSteps(s, IDLE, 1);
    runSteps(s, PUNCH, 1); // nach 40 ms
    expect(s.players.p2.health).toBeGreaterThan(CONFIG.health.max - CONFIG.fight.damage - 1);
    runSteps(s, IDLE, 30); // insgesamt über 600 ms
    runSteps(s, PUNCH, 1);
    expect(s.players.p2.health).toBeLessThan(CONFIG.health.max - 2 * CONFIG.fight.damage + 1);
  });

  it('misses beyond 20 px but still starts the cooldown', () => {
    const s = setup();
    teleport(s, 'p2', { x: 24 + CONFIG.fight.radius + 1, y: 24 });
    runSteps(s, PUNCH, 1);
    expect(s.players.p2.health).toBeGreaterThan(CONFIG.health.max - 1);
    expect(s.players.p1.attackCooldownMs).toBe(CONFIG.fight.cooldownMs);
  });

  it('deals no damage to a shielded player', () => {
    const s = setup();
    s.players.p2.shieldMs = 2000;
    runSteps(s, PUNCH, 1);
    expect(s.players.p2.health).toBeGreaterThan(CONFIG.health.max - 1);
  });

  it('adds the punch upgrade and subtracts the armor of the victim', () => {
    const s = setup();
    s.players.p1.upgrades.punch = 3;
    expect(punchDamage(s.players.p1, s.players.p2)).toBe(CONFIG.fight.damage + 15);
    s.players.p2.upgrades.armor = 3;
    expect(punchDamage(s.players.p1, s.players.p2)).toBe(CONFIG.fight.damage + 15 - 12);
    s.players.p1.upgrades.punch = 0;
    expect(punchDamage(s.players.p1, s.players.p2)).toBe(CONFIG.fight.damage - 12);
  });

  it('never deals less than the minimum damage', () => {
    const s = setup();
    const armor = CONFIG.shop.items.armor.values as number[];
    const saved = [...armor];
    try {
      armor[3] = 100;
      s.players.p2.upgrades.armor = 3;
      expect(punchDamage(s.players.p1, s.players.p2)).toBe(CONFIG.fight.minDamage);
    } finally {
      armor.splice(0, armor.length, ...saved);
    }
  });

  it('knocks the victim out at zero health for the victim knockout time', () => {
    const s = setup();
    s.players.p2.health = 15;
    s.players.p2.upgrades.knockout = 1;
    runSteps(s, PUNCH, 1);
    expect(s.players.p2.mode).toBe('unconscious');
    expect(s.players.p2.unconsciousMs).toBeGreaterThan(knockoutMsOf(s.players.p2) - 100);
  });

  it('ignores unconscious players as targets', () => {
    const s = setup();
    damage(s.players.p2, 1000);
    expect(findAttackTarget(s, s.players.p1)).toBeNull();
  });

  it('cannot punch while unconscious', () => {
    const s = setup();
    damage(s.players.p1, 1000);
    runSteps(s, PUNCH, 1);
    expect(s.players.p2.health).toBeGreaterThan(CONFIG.health.max - 1);
    expect(s.players.p1.attackCooldownMs).toBe(0);
  });

  it('cancels the own search and interrupts the search of the victim', () => {
    const s = setup();
    setSpot(s, 0, { plastic: 1 });
    runSteps(s, { p2: input({ action: true }) }, 5);
    expect(s.players.p2.mode).toBe('searching');
    runSteps(s, { p1: input({ attack: true }), p2: input({ action: true }) }, 1);
    expect(s.players.p2.searchSpotId).toBeNull();
  });

  it('works while walking', () => {
    const s = setup();
    runSteps(s, { p1: input({ attack: true, moveY: 1 }) }, 1);
    expect(s.players.p2.health).toBeLessThan(CONFIG.health.max - CONFIG.fight.damage + 1);
  });

  it('replays identically', () => {
    const run = () => {
      const s = setup();
      for (let t = 0; t < 300; t++) {
        runSteps(s, { p1: input({ attack: t % 7 < 2, moveX: t % 50 < 25 ? 1 : -1 }), p2: input({ attack: t % 11 < 3 }) }, 1);
      }
      return JSON.stringify(s);
    };
    expect(run()).toBe(run());
  });
});
```

In `packages/core/test/snapshot.test.ts` `PLAYER_KEYS` um `'attackCooldownMs'` und `'attackHeld'` ergänzen (alphabetisch nach `'actionHeld'`):

```ts
  const PLAYER_KEYS = [
    'actionHeld', 'attackCooldownMs', 'attackHeld', 'bottles', 'containerLevel', 'depositMs', 'earnedRound',
    'earnedTotal', 'eatHeld', 'health', 'id', 'inventory', 'mode', 'money', 'robbed', 'searchProgressMs',
    'searchSpotId', 'shieldMs', 'spawn', 'stealCooldownMs', 'stealHeld', 'unconsciousMs', 'upgrades', 'weapon', 'x', 'y',
  ];
```

und im Block `describe('projectSnapshot'`:

```ts
  it('shows the attack cooldown of a foreign player but not his attack key', () => {
    const s = game();
    s.players.p2.attackCooldownMs = 300;
    s.players.p2.attackHeld = true;
    const other = projectSnapshot(s, 'p1').players.p2;
    expect(other.attackCooldownMs).toBe(300);
    expect(other.attackHeld).toBe(false);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run test/fight.test.ts`
Expected: FAIL mit "Failed to resolve import ../src/fight".

- [ ] **Step 3: Write minimal implementation**

`packages/core/src/config.ts`, nach dem Block `steal: { … },` einfügen:

```ts
  /** Schlagen (Spec §4.1) */
  fight: {
    /** größter Abstand zum Opfer in Pixeln */
    radius: 20,
    /** so lange nach einem Schlag (auch ohne Treffer) kein neuer */
    cooldownMs: 600,
    /** Grundschaden; Schlag-Upgrade erhöht, Rüstung des Opfers senkt */
    damage: 20,
    /** Untergrenze des Schadens */
    minDamage: 5,
  },
```

`packages/core/src/types.ts`, im `Player` nach `eatHeld: boolean;`:

```ts
  /** Schlagen-Taste im vorigen Tick gedrückt, für die Flanke */
  attackHeld: boolean;
```

und nach `stealCooldownMs: number;`:

```ts
  /** Restzeit, bis der Spieler wieder schlagen kann, 0 = bereit */
  attackCooldownMs: number;
```

Create `packages/core/src/fight.ts`:

```ts
import { CONFIG } from './config';
import { distance } from './economy';
import { damage } from './health';
import { upgradeValue } from './shop';
import type { GameState, Player } from './types';

/** Schaden eines Schlags: Grundschaden plus Schlag-Upgrade minus Rüstung des Opfers, mindestens minDamage. */
export function punchDamage(attacker: Player, victim: Player): number {
  const raw = CONFIG.fight.damage + upgradeValue(attacker, 'punch') - upgradeValue(victim, 'armor');
  return Math.max(CONFIG.fight.minDamage, raw);
}

/**
 * Nächster wacher Mitspieler in Schlagweite. Schutz zählt hier nicht (er verhindert nur den Schaden).
 * Gleichstand: Reihenfolge der Spieler.
 */
export function findAttackTarget(state: GameState, attacker: Player): Player | null {
  let best: Player | null = null;
  let bestDist = Infinity;
  for (const id of Object.keys(state.players)) {
    const victim = state.players[id];
    if (victim.id === attacker.id || victim.unconsciousMs > 0) continue;
    const d = distance(attacker, victim);
    if (d <= CONFIG.fight.radius && d < bestDist) {
      best = victim;
      bestDist = d;
    }
  }
  return best;
}

/**
 * Schlag im Schritt, in dem die Schlagen-Taste neu gedrückt wurde. Während der Abklingzeit passiert
 * nichts. Sonst beginnt die Abklingzeit (auch ohne Treffer), und der nächste wache Spieler in
 * Reichweite verliert punchDamage Leben, außer er hat Schutz. Gibt true zurück, wenn geschlagen wurde.
 */
export function tryAttack(state: GameState, attacker: Player): boolean {
  if (attacker.attackCooldownMs > 0) return false;
  attacker.attackCooldownMs = CONFIG.fight.cooldownMs;
  const target = findAttackTarget(state, attacker);
  if (target && target.shieldMs === 0) damage(target, punchDamage(attacker, target));
  return true;
}
```

`packages/core/src/index.ts`: nach `export * from './theft';` `export * from './fight';` einfügen.

`packages/core/src/step.ts`: `import { tryAttack } from './fight';` ergänzen. In `updatePlayer` nach den Zeilen für `eatPressed`:

```ts
  const attackPressed = input.attack && !p.attackHeld;
  p.attackHeld = input.attack;
```

nach `p.stealCooldownMs = Math.max(0, p.stealCooldownMs - dt);`:

```ts
  p.attackCooldownMs = Math.max(0, p.attackCooldownMs - dt);
```

und nach `if (eatPressed) eatFood(p);`:

```ts
  // Schlagen geht auch im Laufen; die eigene Suche bricht ab
  if (attackPressed && tryAttack(state, p)) cancelSearch(p);
```

`packages/core/src/game.ts`, `newPlayer`: nach `eatHeld: false,` `attackHeld: false,`, nach `stealCooldownMs: 0,` `attackCooldownMs: 0,`.

`packages/core/src/snapshot.ts`, `foreign`: nach `eatHeld: false,` `attackHeld: false,`, nach `stealCooldownMs: 0,` `attackCooldownMs: p.attackCooldownMs,`.

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test -w @pfandraiders/core && npm run typecheck -w @pfandraiders/core`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/fight.ts packages/core/src/types.ts packages/core/src/config.ts packages/core/src/step.ts packages/core/src/game.ts packages/core/src/snapshot.ts packages/core/src/index.ts packages/core/test/fight.test.ts packages/core/test/snapshot.test.ts
git commit -m "feat(core): Schlagen mit Abklingzeit, Schutz, Upgrade und Rüstung

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Ausgeknockte ausrauben

**Files:**
- Modify: `packages/core/src/theft.ts` (ganze Datei)
- Modify: `packages/core/src/step.ts` (Klauen-Zweig)
- Test: `packages/core/test/theft.test.ts`

**Interfaces:**
- Consumes: `Player.robbed`, `knockOut` (Task 4)
- Produces: `canBeRobbed(thief, victim): boolean` (jetzt nur Wache); `canBeLooted(thief: Player, victim: Player): boolean`; `findLootTarget(state: GameState, thief: Player): Player | null`; `tryLoot(state: GameState, thief: Player): boolean`. Der Klauen-Druck ruft zuerst `tryLoot`, dann `tryInstantSteal`.

- [ ] **Step 1: Write the failing test**

Am Ende von `packages/core/test/theft.test.ts` einfügen (Imports `damage` aus `'../src/health'` und `canBeLooted`, `canBeRobbed` aus `'../src/theft'` ergänzen):

```ts
describe('robbing a knocked-out player', () => {
  /** p2 (Tasche) trägt 4 Plastik und liegt ausgeknockt 16 px neben p1 */
  function knockedSetup() {
    const s = setup();
    damage(s.players.p2, 1000);
    return s;
  }

  it('takes half of the bottles once and marks the victim as robbed', () => {
    const s = knockedSetup();
    runSteps(s, STEAL, 1);
    expect(s.players.p1.bottles.plastic).toBe(2);
    expect(s.players.p2.bottles.plastic).toBe(2);
    expect(s.players.p2.robbed).toBe(true);
    runSteps(s, RELEASE, 1);
    runSteps(s, STEAL, 1);
    expect(s.players.p1.bottles.plastic).toBe(2);
    expect(s.players.p2.bottles.plastic).toBe(2);
  });

  it('neither needs nor starts the steal cooldown and gives no shield', () => {
    const s = knockedSetup();
    s.players.p1.stealCooldownMs = 4000;
    runSteps(s, STEAL, 1);
    expect(s.players.p1.bottles.plastic).toBe(2);
    expect(s.players.p1.stealCooldownMs).toBeLessThan(4000);
    expect(s.players.p1.stealCooldownMs).toBeGreaterThan(3900);
    expect(s.players.p2.shieldMs).toBe(0);
  });

  it('does not use the bolt cutters', () => {
    const s = knockedSetup();
    s.players.p1.containerLevel = 3;
    s.players.p1.inventory.bolt_cutters = true;
    runSteps(s, STEAL, 1);
    expect(s.players.p1.bottles.plastic).toBe(2);
    expect(s.players.p1.inventory.bolt_cutters).toBe(true);
  });

  it('is limited by the room of the robber and does nothing with a full container', () => {
    const s = knockedSetup();
    s.players.p1.bottles = { plastic: 3, glass: 0, crate: 0 }; // Hände voll
    runSteps(s, STEAL, 1);
    expect(s.players.p2.bottles.plastic).toBe(4);
    expect(s.players.p2.robbed).toBe(false);
    s.players.p1.bottles = { plastic: 2, glass: 0, crate: 0 }; // ein Platz frei
    runSteps(s, RELEASE, 1);
    runSteps(s, STEAL, 1);
    expect(s.players.p1.bottles.plastic).toBe(3);
    expect(s.players.p2.bottles.plastic).toBe(3);
    expect(s.players.p2.robbed).toBe(true);
  });

  it('is possible again after the next knockout', () => {
    const s = knockedSetup();
    runSteps(s, STEAL, 1);
    expect(s.players.p2.robbed).toBe(true);
    s.players.p2.unconsciousMs = 0;
    s.players.p2.health = 50;
    s.players.p2.robbed = false;
    damage(s.players.p2, 1000);
    expect(s.players.p2.robbed).toBe(false);
    s.players.p1.bottles = { plastic: 0, glass: 0, crate: 0 };
    runSteps(s, RELEASE, 1);
    runSteps(s, STEAL, 1);
    expect(s.players.p1.bottles.plastic).toBe(1);
  });

  it('never lets the normal theft hit an unconscious player', () => {
    const s = knockedSetup();
    s.players.p2.robbed = true;
    expect(canBeRobbed(s.players.p1, s.players.p2)).toBe(false);
    expect(canBeLooted(s.players.p1, s.players.p2)).toBe(false);
    runSteps(s, STEAL, 1);
    expect(s.players.p2.bottles.plastic).toBe(4);
  });

  it('is out of reach beyond the steal radius', () => {
    const s = knockedSetup();
    teleport(s, 'p2', { x: 24 + CONFIG.steal.radius + 1, y: 24 });
    expect(canBeLooted(s.players.p1, s.players.p2)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run test/theft.test.ts`
Expected: FAIL (`canBeLooted` fehlt; der normale Diebstahl nimmt dem Bewusstlosen Flaschen).

- [ ] **Step 3: Write minimal implementation**

`packages/core/src/theft.ts` vollständig ersetzen:

```ts
import { totalBottles, transferBottles } from './bottles';
import { CONFIG } from './config';
import { capacityOf, distance } from './economy';
import type { GameState, Player } from './types';

/** Kann der wache `victim` jetzt von `thief` bestohlen werden? */
export function canBeRobbed(thief: Player, victim: Player): boolean {
  return (
    victim.id !== thief.id &&
    victim.unconsciousMs === 0 &&
    victim.shieldMs === 0 &&
    totalBottles(victim.bottles) > 0 &&
    distance(thief, victim) <= CONFIG.steal.radius
  );
}

/** Kann der ausgeknockte `victim` jetzt von `thief` ausgeraubt werden? Einmal pro Knockout, Schutz zählt nicht. */
export function canBeLooted(thief: Player, victim: Player): boolean {
  return (
    victim.id !== thief.id &&
    thief.unconsciousMs === 0 &&
    victim.unconsciousMs > 0 &&
    !victim.robbed &&
    totalBottles(victim.bottles) > 0 &&
    distance(thief, victim) <= CONFIG.steal.radius
  );
}

/** Nächster Spieler, für den `ok` gilt. Gleichstand: Reihenfolge der Spieler. */
function nearest(state: GameState, thief: Player, ok: (thief: Player, victim: Player) => boolean): Player | null {
  let best: Player | null = null;
  let bestDist = Infinity;
  for (const id of Object.keys(state.players)) {
    const victim = state.players[id];
    if (!ok(thief, victim)) continue;
    const d = distance(thief, victim);
    if (d < bestDist) {
      best = victim;
      bestDist = d;
    }
  }
  return best;
}

/** Nächstes gültiges (waches) Opfer in Reichweite. */
export function findStealTarget(state: GameState, thief: Player): Player | null {
  return nearest(state, thief, canBeRobbed);
}

/** Nächster ausraubbarer Ausgeknockter in Reichweite. */
export function findLootTarget(state: GameState, thief: Player): Player | null {
  return nearest(state, thief, canBeLooted);
}

/** Überträgt fraction der Flaschen des Opfers (aufgerundet), begrenzt durch den freien Platz des Diebs. */
function moveLoot(thief: Player, victim: Player, fraction: number): void {
  const want = Math.ceil(totalBottles(victim.bottles) * fraction);
  const room = capacityOf(thief) - totalBottles(thief.bottles);
  const count = Math.max(0, Math.min(want, room));
  transferBottles(victim.bottles, thief.bottles, totalBottles(thief.bottles) + count);
}

/**
 * Sofort-Diebstahl im Schritt, in dem die Klauen-Taste neu gedrückt wurde.
 * Nimmt dem nächsten gültigen Opfer CONFIG.steal.fraction seines Containers ab (aufgerundet,
 * begrenzt durch den freien Platz); mit Bolzenschneider alles, der Bolzenschneider wird verbraucht.
 * Das Opfer bekommt Schutz, der Dieb eine Abklingzeit. Gibt true zurück, wenn geklaut wurde.
 * Während der Abklingzeit, mit vollem Container oder ohne Opfer passiert nichts.
 */
export function tryInstantSteal(state: GameState, thief: Player): boolean {
  if (thief.stealCooldownMs > 0) return false;
  if (totalBottles(thief.bottles) >= capacityOf(thief)) return false;
  const target = findStealTarget(state, thief);
  if (target === null) return false;

  if (thief.inventory.bolt_cutters) {
    moveLoot(thief, target, 1);
    thief.inventory.bolt_cutters = false;
  } else {
    moveLoot(thief, target, CONFIG.steal.fraction);
  }
  target.shieldMs = CONFIG.steal.shieldMs;
  thief.stealCooldownMs = CONFIG.steal.cooldownMs;
  return true;
}

/**
 * Ausrauben im Schritt, in dem die Klauen-Taste neu gedrückt wurde (Spec §4.4): nimmt dem nächsten
 * Ausgeknockten CONFIG.steal.fraction seiner Flaschen (aufgerundet, begrenzt durch den freien Platz)
 * und setzt `robbed`. Ohne Abklingzeit, ohne Schutz, ohne Bolzenschneider. Mit vollem Container passiert
 * nichts (der Ausgeknockte bleibt ausraubbar). Gibt true zurück, wenn ausgeraubt wurde.
 */
export function tryLoot(state: GameState, thief: Player): boolean {
  if (totalBottles(thief.bottles) >= capacityOf(thief)) return false;
  const target = findLootTarget(state, thief);
  if (target === null) return false;
  moveLoot(thief, target, CONFIG.steal.fraction);
  target.robbed = true;
  return true;
}
```

`packages/core/src/step.ts`: Import auf `import { tryInstantSteal, tryLoot } from './theft';` ändern und den Zweig ersetzen:

```ts
  } else if (stealPressed && (tryLoot(state, p) || tryInstantSteal(state, p))) {
    cancelSearch(p);
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test -w @pfandraiders/core && npm run typecheck -w @pfandraiders/core`
Expected: PASS (auch die bisherigen Diebstahltests in `theft.test.ts` und `determinism-theft.test.ts`).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/theft.ts packages/core/src/step.ts packages/core/test/theft.test.ts
git commit -m "feat(core): Ausgeknockte einmal pro Knockout ausrauben

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Protokoll für Serie, Shop und Rundenzeit

**Files:**
- Modify: `packages/core/src/protocol.ts`
- Modify: `packages/core/src/config.ts:9` (`roundMs`)
- Test: `packages/core/test/protocol.test.ts`, `packages/core/test/config.test.ts`

**Interfaces:**
- Consumes: `isShopCategory`, `isShopItemId`, `Progress` (Task 2), `RankEntry` (Task 3), `CONFIG.shop.maxStack`
- Produces:
  - `ROUND_MS_CHOICES: readonly number[] = [180000, 300000, 420000, 600000]`, `DEFAULT_ROUND_MS = 300000`, `isRoundMs(v: unknown): v is number`
  - `RoomPhase = 'lobby' | 'playing' | 'shop'`
  - `RosterEntry.ready: boolean`
  - `ErrorCode` plus `'wrong_phase' | 'cannot_buy'`
  - `ClientMessage` plus `{ t: 'start'; roundMs?: number }`, `{ t: 'ready'; ready: boolean }`, `{ t: 'shopBuy'; category: ShopCategory; item: ShopItemId; qty: number }`, `{ t: 'setRoundMs'; roundMs: number }`, `{ t: 'endSeries' }`
  - `ServerMessage`: `lobby` mit `roundMs: number`, `start` mit `roundMs: number`, neu `{ t: 'phase'; phase: RoomPhase }`, `{ t: 'shopState'; you: Progress; ready: boolean }`, `{ t: 'ranking'; entries: RankEntry[] }`
  - `CONFIG.roundMs = 5 * 60 * 1000`

- [ ] **Step 1: Write the failing test**

In `packages/core/test/protocol.test.ts` (Imports `DEFAULT_ROUND_MS`, `isRoundMs`, `ROUND_MS_CHOICES` aus `'../src/protocol'` und `CONFIG` aus `'../src/config'` ergänzen) einen neuen Block anhängen:

```ts
describe('series messages', () => {
  it('allows 3, 5, 7 and 10 minutes, default 5', () => {
    expect(ROUND_MS_CHOICES).toEqual([180_000, 300_000, 420_000, 600_000]);
    expect(DEFAULT_ROUND_MS).toBe(300_000);
    expect(CONFIG.roundMs).toBe(DEFAULT_ROUND_MS);
    expect(isRoundMs(420_000)).toBe(true);
    expect(isRoundMs(400_000)).toBe(false);
    expect(isRoundMs('300000')).toBe(false);
  });

  it('accepts start with and without a round time and keeps only finite numbers', () => {
    expect(parseClientMessage({ t: 'start' })).toEqual({ t: 'start' });
    expect(parseClientMessage({ t: 'start', roundMs: 420_000 })).toEqual({ t: 'start', roundMs: 420_000 });
    expect(parseClientMessage({ t: 'start', roundMs: 123 })).toEqual({ t: 'start', roundMs: 123 });
    expect(parseClientMessage({ t: 'start', roundMs: 'x' })).toEqual({ t: 'start' });
    expect(parseClientMessage({ t: 'start', roundMs: Number.POSITIVE_INFINITY })).toEqual({ t: 'start' });
  });

  it('accepts ready only with a boolean', () => {
    expect(parseClientMessage({ t: 'ready', ready: true })).toEqual({ t: 'ready', ready: true });
    expect(parseClientMessage({ t: 'ready', ready: false })).toEqual({ t: 'ready', ready: false });
    expect(parseClientMessage({ t: 'ready', ready: 1 })).toBeNull();
    expect(parseClientMessage({ t: 'ready' })).toBeNull();
  });

  it('accepts shopBuy with known category and item and a quantity from 1 to 99', () => {
    expect(parseClientMessage({ t: 'shopBuy', category: 'defense', item: 'food', qty: 99 })).toEqual({
      t: 'shopBuy',
      category: 'defense',
      item: 'food',
      qty: 99,
    });
    for (const qty of [0, 100, 1.5, -3, '2', null]) {
      expect(parseClientMessage({ t: 'shopBuy', category: 'defense', item: 'food', qty })).toBeNull();
    }
    expect(parseClientMessage({ t: 'shopBuy', category: 'defense', item: '__proto__', qty: 1 })).toBeNull();
    expect(parseClientMessage({ t: 'shopBuy', category: 'toString', item: 'food', qty: 1 })).toBeNull();
  });

  it('accepts setRoundMs only with an allowed value', () => {
    expect(parseClientMessage({ t: 'setRoundMs', roundMs: 180_000 })).toEqual({ t: 'setRoundMs', roundMs: 180_000 });
    expect(parseClientMessage({ t: 'setRoundMs', roundMs: 200_000 })).toBeNull();
  });

  it('accepts endSeries and drops extra fields', () => {
    expect(parseClientMessage({ t: 'endSeries', junk: 1 })).toEqual({ t: 'endSeries' });
  });
});
```

In `packages/core/test/config.test.ts` hinzufügen:

```ts
  it('plays five minutes per round by default', () => {
    expect(CONFIG.roundMs).toBe(5 * 60 * 1000);
  });
```

(in den vorhandenen `describe`-Block).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run test/protocol.test.ts test/config.test.ts`
Expected: FAIL (`ROUND_MS_CHOICES` fehlt, `CONFIG.roundMs` ist 10 Minuten).

- [ ] **Step 3: Write minimal implementation**

`packages/core/src/config.ts`: `roundMs: 10 * 60 * 1000,` wird

```ts
  /** Standard-Rundenzeit (5 Minuten); der Host wählt in der Lobby 3, 5, 7 oder 10 Minuten */
  roundMs: 5 * 60 * 1000,
```

`packages/core/src/protocol.ts`:

Imports oben ersetzen:

```ts
import { CONFIG } from './config';
import { sanitizeInput } from './sanitize';
import { isShopCategory, isShopItemId } from './shop';
import type { Progress } from './shop';
import type { RankEntry } from './ranking';
import type { MapId } from './maps';
import type { GameState, Input, MapData, ShopCategory, ShopItemId } from './types';
```

Nach `MAX_BUILD_FIELD_LENGTH` einfügen:

```ts
/** Erlaubte Rundenzeiten in ms: 3, 5, 7, 10 Minuten (Spec §2) */
export const ROUND_MS_CHOICES: readonly number[] = [180_000, 300_000, 420_000, 600_000];
/** Standard-Rundenzeit: 5 Minuten */
export const DEFAULT_ROUND_MS = CONFIG.roundMs;

export function isRoundMs(v: unknown): v is number {
  return typeof v === 'number' && ROUND_MS_CHOICES.includes(v);
}
```

`ErrorCode` um zwei Fälle erweitern:

```ts
  | 'chat_closed'
  /** Nachricht passt nicht zur Phase des Raums (etwa Kaufen während der Runde) */
  | 'wrong_phase'
  /** Kauf abgelehnt (Geld, Bestand, Artikel) */
  | 'cannot_buy';
```

`ClientMessage` ersetzen:

```ts
export type ClientMessage =
  | { t: 'create'; name: string }
  | { t: 'join'; room: string; name: string; token?: string }
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
  /** Rundenzeit setzen (nur Host, nur Lobby oder Shop) */
  | { t: 'setRoundMs'; roundMs: number }
  /** Serie beenden, zurück in die Lobby (nur Host, nur Shop) */
  | { t: 'endSeries' };
```

`RosterEntry` erweitern:

```ts
export interface RosterEntry {
  id: string;
  name: string;
  color: number;
  connected: boolean;
  /** Shop-Phase: hat "Bereit" gedrückt (sonst immer false) */
  ready: boolean;
}

/** lobby = Warteraum, playing = Runde läuft, shop = Rangliste und Einkaufen zwischen den Runden */
export type RoomPhase = 'lobby' | 'playing' | 'shop';
```

`ServerMessage` ersetzen:

```ts
export type ServerMessage =
  | { t: 'error'; code: ErrorCode; message: string }
  | { t: 'joined'; room: string; you: string; token: string; build?: ServerBuild }
  | { t: 'lobby'; room: string; host: string; players: RosterEntry[]; phase: RoomPhase; roundMs: number }
  | { t: 'start'; mapId: MapId; map: MapData; you: string; players: RosterEntry[]; snap: Snapshot; roundMs: number }
  | { t: 'snap'; snap: Snapshot; ack: number }
  | ({ t: 'chat' } & ChatMessage)
  /** Bisheriger Chat des Raums, direkt nach joined */
  | { t: 'chathistory'; messages: ChatMessage[] }
  /** Phase des Raums hat gewechselt (auch nach einer Rückkehr in die Shop-Phase) */
  | { t: 'phase'; phase: RoomPhase }
  /** Eigener Stand in der Shop-Phase (nur an diesen Spieler) */
  | { t: 'shopState'; you: Progress; ready: boolean }
  /** Rangliste der letzten Runde (Runden- und Gesamtverdienst) */
  | { t: 'ranking'; entries: RankEntry[] };
```

In `parseClientMessage` den Fall `'start'` ersetzen und neue Fälle vor `default:` einfügen:

```ts
    case 'start':
      // Ungültige Zahlen setzt der Raum auf den Standard; Nicht-Zahlen gelten als "nicht angegeben"
      return typeof m.roundMs === 'number' && Number.isFinite(m.roundMs)
        ? { t: 'start', roundMs: m.roundMs }
        : { t: 'start' };
```

```ts
    case 'ready':
      return typeof m.ready === 'boolean' ? { t: 'ready', ready: m.ready } : null;
    case 'shopBuy': {
      const qty = m.qty;
      if (!isShopCategory(m.category) || !isShopItemId(m.item)) return null;
      if (typeof qty !== 'number' || !Number.isInteger(qty) || qty < 1 || qty > CONFIG.shop.maxStack) return null;
      return { t: 'shopBuy', category: m.category, item: m.item, qty };
    }
    case 'setRoundMs':
      return isRoundMs(m.roundMs) ? { t: 'setRoundMs', roundMs: m.roundMs } : null;
    case 'endSeries':
      return { t: 'endSeries' };
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test -w @pfandraiders/core && npm run typecheck -w @pfandraiders/core`
Expected: PASS. (Ein Test, der `CONFIG.roundMs` als 10 Minuten voraussetzt, gibt es im Kern nicht; `game.test.ts` und `movement.test.ts` rechnen relativ.)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/protocol.ts packages/core/src/config.ts packages/core/test/protocol.test.ts packages/core/test/config.test.ts
git commit -m "feat(core): Protokoll für Serie, Shop-Phase und Rundenzeit

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Server-Raum spielt eine Serie mit Shop-Phase

**Files:**
- Modify: `packages/server/src/room.ts` (ganze Datei, siehe unten)
- Test: Create `packages/server/test/roomSeries.test.ts`; Modify `packages/server/test/room.test.ts`, `packages/server/test/roomChat.test.ts`

**Interfaces:**
- Consumes: `createGame(seed, map, ids, { roundMs, progress })`, `freshProgress`, `progressOf`, `ranking`, `DEFAULT_ROUND_MS`, `isRoundMs`, Nachrichten aus Task 8
- Produces (in `Room`): `phase: RoomPhase`, `progress: Map<string, Progress>`, `roundMs(): number`, `start(byId: string, roundMs?: number): Result<void>`, `setReady(m: Member, ready: boolean): Result<void>`; `Member.ready: boolean`. Task 10 ergänzt `shopBuy`, `setRoundMs`, `endSeries`.

- [ ] **Step 1: Write the failing test**

Create `packages/server/test/roomSeries.test.ts`:

```ts
import { DEFAULT_ROUND_MS, NO_INPUT } from '@pfandraiders/core';
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

/** Raum mit drei verbundenen Spielern; die erste Runde ist nach zwei Ticks vorbei (roundMs 100). */
function series(opts: { roundMs?: number } = { roundMs: 100 }) {
  let time = 0;
  const room = new Room('ABCD', { now: () => time, random: () => 0.5, roundMs: opts.roundMs });
  const conns = [new FakeConn(), new FakeConn(), new FakeConn()];
  const members = ['Anna', 'Bob', 'Cara'].map((name, i) => {
    const r = room.join(name, conns[i]);
    if (!r.ok) throw new Error('join failed');
    return r.value;
  });
  const advance = (ms: number) => {
    time += ms;
  };
  const endRound = () => {
    for (let i = 0; i < 100 && room.phase === 'playing'; i++) room.tick();
  };
  return { room, conns, members, advance, endRound };
}

describe('series phases', () => {
  it('goes lobby -> playing -> shop and tells everybody', () => {
    const { room, conns, endRound } = series();
    expect(room.phase).toBe('lobby');
    expect(room.start('p1').ok).toBe(true);
    expect(room.phase).toBe('playing');
    expect(conns[1].last('phase').phase).toBe('playing');
    endRound();
    expect(room.phase).toBe('shop');
    expect(conns[2].last('phase').phase).toBe('shop');
    expect(conns[0].last('lobby').phase).toBe('shop');
    expect(conns[0].last('ranking').entries.map((e) => e.id).sort()).toEqual(['p1', 'p2', 'p3']);
    expect(conns[0].last('shopState')).toMatchObject({ ready: false, you: { money: 0, containerLevel: 0 } });
  });

  it('keeps money, levels and inventory into the next round and resets the rest', () => {
    const { room, members, endRound } = series();
    room.start('p1');
    const p = room.state!.players.p1;
    p.money = 900;
    p.earnedRound = 900;
    p.earnedTotal = 900;
    p.containerLevel = 1;
    p.upgrades.speed = 2;
    p.inventory.food = 3;
    p.bottles = { plastic: 2, glass: 0, crate: 0 };
    p.health = 12;
    endRound();
    for (const m of members) room.setReady(m, true);
    expect(room.phase).toBe('playing');
    const q = room.state!.players.p1;
    expect(q).toMatchObject({
      money: 900,
      containerLevel: 1,
      upgrades: { speed: 2 },
      inventory: { food: 3 },
      earnedTotal: 900,
      earnedRound: 0,
      bottles: { plastic: 0, glass: 0, crate: 0 },
    });
    expect(q.health).toBe(100);
    expect(room.state!.tick).toBe(0);
  });

  it('starts the next round only when all connected players are ready, and ready can be taken back', () => {
    const { room, members, conns, endRound } = series();
    room.start('p1');
    endRound();
    room.setReady(members[0], true);
    room.setReady(members[1], true);
    expect(room.phase).toBe('shop');
    expect(conns[2].last('lobby').players.map((p) => p.ready)).toEqual([true, true, false]);
    room.setReady(members[1], false);
    room.setReady(members[2], true);
    expect(room.phase).toBe('shop');
    room.setReady(members[1], true);
    expect(room.phase).toBe('playing');
    expect(conns[0].of('start')).toHaveLength(2);
  });

  it('starts at once when the last player who is not ready disconnects', () => {
    const { room, members, endRound } = series();
    room.start('p1');
    endRound();
    room.setReady(members[0], true);
    room.setReady(members[1], true);
    room.leave(members[2].conn!);
    expect(room.phase).toBe('playing');
    // der Getrennte spielt als stehende Figur mit und behält seinen Platz
    expect(Object.keys(room.state!.players)).toEqual(['p1', 'p2', 'p3']);
  });

  it('also starts when the last unready player leaves for good, and drops his progress', () => {
    const { room, members, endRound } = series();
    room.start('p1');
    endRound();
    room.setReady(members[0], true);
    room.setReady(members[1], true);
    room.leaveForGood(members[2].conn!);
    expect(room.phase).toBe('playing');
    expect(Object.keys(room.state!.players)).toEqual(['p1', 'p2']);
    expect(room.progress.has('p3')).toBe(false);
  });

  it('does not wait for a disconnected player and keeps him as a standing figure after his grace runs out', () => {
    const { room, members, advance, endRound } = series();
    room.start('p1');
    endRound();
    room.leave(members[2].conn!);
    room.setReady(members[0], true);
    expect(room.phase).toBe('shop');
    room.setReady(members[1], true);
    expect(room.phase).toBe('playing'); // p3 ist getrennt und zählt nicht
    expect(Object.keys(room.state!.players)).toEqual(['p1', 'p2', 'p3']);
    advance(SERVER_CONFIG.graceMs + 1);
    room.tick();
    expect(room.members.map((m) => m.id)).toEqual(['p1', 'p2', 'p3']); // in der laufenden Runde bleibt er Statist
  });

  it('does not start a round when nobody is connected', () => {
    const { room, members, endRound } = series();
    room.start('p1');
    endRound();
    for (const m of members) room.leave(m.conn!);
    expect(room.phase).toBe('shop');
  });

  it('gives a player who returns with his token in the shop phase his progress, and he is not ready', () => {
    const { room, members, endRound } = series();
    room.start('p1');
    room.state!.players.p2.money = 444;
    endRound();
    room.setReady(members[1], true);
    room.leave(members[1].conn!);
    const back = new FakeConn();
    expect(room.join('Bob', back, members[1].token).ok).toBe(true);
    expect(back.last('phase').phase).toBe('shop');
    expect(back.last('shopState')).toMatchObject({ ready: false, you: { money: 444 } });
    expect(back.of('ranking')).toHaveLength(1);
    expect(members[1].ready).toBe(false);
  });

  it('lets a new player join in the shop phase with empty progress', () => {
    const { room, endRound } = series();
    room.start('p1');
    endRound();
    const d = new FakeConn();
    const r = room.join('Dora', d);
    expect(r.ok).toBe(true);
    expect(d.last('shopState').you.money).toBe(0);
    expect(room.progress.get('p4')?.money).toBe(0);
  });

  it('refuses ready outside the shop phase', () => {
    const { room, members } = series();
    expect(room.setReady(members[0], true)).toMatchObject({ ok: false, code: 'wrong_phase' });
    room.start('p1');
    expect(room.setReady(members[0], true)).toMatchObject({ ok: false, code: 'wrong_phase' });
  });

  it('sends the round time with start and in the lobby message', () => {
    const { room, conns } = series({});
    expect(conns[0].last('lobby').roundMs).toBe(DEFAULT_ROUND_MS);
    expect(room.start('p1', 420_000).ok).toBe(true);
    expect(conns[1].last('start').roundMs).toBe(420_000);
    expect(room.state!.timeLeftMs).toBe(420_000);
  });

  it('uses the default for an invalid round time in start', () => {
    const { room } = series({});
    room.start('p1', 123_456);
    expect(room.state!.timeLeftMs).toBe(DEFAULT_ROUND_MS);
  });

  it('applies the inputs without any buy merging', () => {
    const { room, members } = series({});
    room.start('p1');
    room.setInput(members[0], 1, { ...NO_INPUT, attack: true });
    expect(members[0].input).toEqual({ ...NO_INPUT, attack: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/server && npx vitest run test/roomSeries.test.ts`
Expected: FAIL (Phase `running` statt `playing`, `setReady` fehlt).

- [ ] **Step 3: Write the implementation**

`packages/server/src/room.ts` vollständig ersetzen:

```ts
import {
  CHAT_HISTORY_SIZE,
  createGame,
  DEFAULT_MAP_ID,
  DEFAULT_ROUND_MS,
  freshProgress,
  isRoundMs,
  MAP_DEFS,
  MAX_ROOM_PLAYERS,
  MIN_START_PLAYERS,
  NO_INPUT,
  progressOf,
  projectSnapshot,
  ranking,
  ROOM_COLORS,
  step,
} from '@pfandraiders/core';
import type {
  ChatMessage,
  ErrorCode,
  GameState,
  Input,
  MapData,
  MapId,
  Progress,
  RankEntry,
  RoomPhase,
  RosterEntry,
  ServerBuild,
  ServerMessage,
} from '@pfandraiders/core';
import { randomUUID } from 'node:crypto';
import { currentBuild } from './buildInfo';
import { SERVER_CONFIG } from './config';

/** Übertragungsweg zu einem Spieler. Der Raum kennt keine Sockets. */
export interface Conn {
  send(msg: ServerMessage): void;
  /** Verbindung beenden (optional; der Raum selbst nutzt es nicht) */
  close?(code: number, reason: string): void;
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
  /** Zuletzt gesendete Eingabe */
  input: Input;
  ackSeq: number;
  /** Shop-Phase: hat "Bereit" gedrückt */
  ready: boolean;
}

export interface RoomOptions {
  /** Kennung der Karte (Standard DEFAULT_MAP_ID); bestimmt die Karte und wird mit start gesendet. */
  mapId?: MapId;
  /** Überschreibt die Kartendaten von mapId (für Tests). */
  map?: MapData;
  stepMs?: number;
  graceMs?: number;
  emptyMs?: number;
  /** Feste Rundenlänge (Umgebung ROUND_MS, für Tests); hat Vorrang vor der Wahl des Hosts. */
  roundMs?: number;
  now?: () => number;
  random?: () => number;
  /** Build des Servers für joined (Standard currentBuild()). */
  build?: ServerBuild;
}

export type Result<T> = { ok: true; value: T } | { ok: false; code: ErrorCode; message: string };

function fail<T>(code: ErrorCode, message: string): Result<T> {
  return { ok: false, code, message };
}

const OK: Result<void> = { ok: true, value: undefined };

export class Room {
  phase: RoomPhase = 'lobby';
  members: Member[] = [];
  state: GameState | null = null;
  /** Fortschritt der Serie je Spieler-id (Geld, Tasche, Upgrades, Inventar, Gesamtverdienst); leer in der Lobby */
  readonly progress = new Map<string, Progress>();
  private nextId = 1;
  private lastActive: number;
  private readonly mapId: MapId;
  private readonly map: MapData;
  private readonly stepMs: number;
  private readonly graceMs: number;
  private readonly emptyMs: number;
  private readonly fixedRoundMs: number | undefined;
  /** Vom Host gewählte Rundenzeit */
  private chosenRoundMs: number = DEFAULT_ROUND_MS;
  /** Rangliste der letzten Runde, für Nachzügler in der Shop-Phase */
  private lastRanking: RankEntry[] = [];
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly build: ServerBuild;
  /** Letzte Chatnachrichten der Lobby (nur im Speicher) */
  private chatHistory: ChatMessage[] = [];
  /** Zeitpunkte der angenommenen Chatnachrichten je Mitglied (Ratenbegrenzung) */
  private chatTimes = new Map<string, number[]>();

  constructor(
    readonly code: string,
    opts: RoomOptions = {},
  ) {
    this.mapId = opts.mapId ?? DEFAULT_MAP_ID;
    this.map = opts.map ?? MAP_DEFS[this.mapId].map;
    this.stepMs = opts.stepMs ?? SERVER_CONFIG.stepMs;
    this.graceMs = opts.graceMs ?? SERVER_CONFIG.graceMs;
    // Ein leerer Raum darf nie vor Ablauf der Rückkehrfrist verschwinden
    this.emptyMs = Math.max(opts.emptyMs ?? SERVER_CONFIG.emptyRoomMs, this.graceMs + 15_000);
    this.fixedRoundMs = opts.roundMs;
    this.now = opts.now ?? (() => Date.now());
    this.random = opts.random ?? Math.random;
    this.build = opts.build ?? currentBuild();
    this.lastActive = this.now();
  }

  /** Rundenzeit der nächsten Runde: ROUND_MS (falls gesetzt), sonst die Wahl des Hosts. */
  roundMs(): number {
    return this.fixedRoundMs ?? this.chosenRoundMs;
  }

  /** Host = erster verbundener Spieler in Beitrittsreihenfolge. */
  hostId(): string {
    return this.members.find((m) => m.conn !== null)?.id ?? '';
  }

  roster(): RosterEntry[] {
    return this.members.map((m) => ({
      id: m.id,
      name: m.name,
      color: m.color,
      connected: m.conn !== null,
      ready: m.ready,
    }));
  }

  lobbyMessage(): ServerMessage {
    return {
      t: 'lobby',
      room: this.code,
      host: this.hostId(),
      players: this.roster(),
      phase: this.phase,
      roundMs: this.roundMs(),
    };
  }

  private broadcastLobby(): void {
    const msg = this.lobbyMessage();
    for (const m of this.members) m.conn?.send(msg);
  }

  private broadcast(msg: ServerMessage): void {
    for (const m of this.members) m.conn?.send(msg);
  }

  private connected(): Member[] {
    return this.members.filter((m) => m.conn !== null);
  }

  /** Entfernt ein Mitglied samt Fortschritt (nur außerhalb der laufenden Runde). */
  private drop(m: Member): void {
    this.members = this.members.filter((x) => x !== m);
    this.progress.delete(m.id);
  }

  /**
   * Markiert Mitglieder nach der Frist als abgelaufen; außerhalb der Runde fliegen sie raus
   * (ihr Fortschritt verfällt). In der Shop-Phase kann das die nächste Runde auslösen.
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
    if (this.phase === 'shop') {
      this.broadcastLobby();
      this.checkAllReady();
    }
  }

  join(name: string, conn: Conn, token?: string): Result<Member> {
    this.lastActive = this.now();
    this.expireMembers();

    // Rückkehr mit Token (nur innerhalb der Frist)
    if (token !== undefined) {
      const back = this.members.find((m) => m.token === token && !m.expired);
      if (back) {
        back.conn = conn;
        back.disconnectedAt = null;
        back.ready = false; // wer wieder verbindet, ist nicht bereit
        conn.send({ t: 'joined', room: this.code, you: back.id, token: back.token, build: this.build });
        this.sendChatHistory(conn);
        if (this.phase === 'playing' && this.state) this.sendStart(back);
        if (this.phase === 'shop') this.sendShop(back);
        this.broadcastLobby();
        return { ok: true, value: back };
      }
    }

    if (this.phase === 'playing') return fail('already_started', 'Die Runde läuft bereits.');
    if (this.members.length >= MAX_ROOM_PLAYERS) return fail('room_full', 'Der Raum ist voll.');
    if (this.members.some((m) => m.name.toLowerCase() === name.toLowerCase())) {
      return fail('name_taken', 'Der Name ist schon vergeben.');
    }

    const used = new Set(this.members.map((m) => m.color));
    const free = ROOM_COLORS.find((c) => !used.has(c));
    const member: Member = {
      id: `p${this.nextId++}`,
      name,
      color: free ?? ROOM_COLORS[this.members.length % ROOM_COLORS.length],
      token: randomUUID(),
      conn,
      disconnectedAt: null,
      expired: false,
      input: { ...NO_INPUT },
      ackSeq: 0,
      ready: false,
    };
    this.members.push(member);
    conn.send({ t: 'joined', room: this.code, you: member.id, token: member.token, build: this.build });
    this.sendChatHistory(conn);
    if (this.phase === 'shop') {
      // Beitritt zwischen zwei Runden: leerer Fortschritt, spielt ab der nächsten Runde mit
      this.progress.set(member.id, freshProgress());
      this.sendShop(member);
    }
    this.broadcastLobby();
    return { ok: true, value: member };
  }

  private sendChatHistory(conn: Conn): void {
    conn.send({ t: 'chathistory', messages: this.chatHistory.map((m) => ({ ...m })) });
  }

  /** Ohne verbundene Spieler wird der Chat vergessen (ein Nachzügler sieht keine alten Nachrichten). */
  private forgetChatIfEmpty(): void {
    if (this.connected().length > 0) return;
    this.chatHistory = [];
    this.chatTimes.clear();
  }

  /**
   * Chatnachricht eines Mitglieds (Text schon mit cleanChat bereinigt). Nur in der Lobby;
   * pro Mitglied höchstens eine Nachricht je chatMinGapMs und chatMaxPerWindow je chatWindowMs.
   * Geht an alle verbundenen Mitglieder, auch an den Absender.
   */
  chat(conn: Conn, text: string): Result<void> {
    const member = this.members.find((m) => m.conn === conn);
    if (!member) return fail('not_in_room', 'Du bist in keinem Raum.');
    if (this.phase !== 'lobby') return fail('chat_closed', 'Chat gibt es nur in der Lobby.');
    const now = this.now();
    const times = (this.chatTimes.get(member.id) ?? []).filter((t) => now - t < SERVER_CONFIG.chatWindowMs);
    const last = times[times.length - 1];
    if ((last !== undefined && now - last < SERVER_CONFIG.chatMinGapMs) || times.length >= SERVER_CONFIG.chatMaxPerWindow) {
      this.chatTimes.set(member.id, times);
      return fail('chat_too_fast', 'Zu schnell.');
    }
    times.push(now);
    this.chatTimes.set(member.id, times);
    this.lastActive = now;
    const msg: ChatMessage = { id: member.id, name: member.name, color: member.color, text, at: now };
    this.chatHistory.push(msg);
    if (this.chatHistory.length > CHAT_HISTORY_SIZE) {
      this.chatHistory.splice(0, this.chatHistory.length - CHAT_HISTORY_SIZE);
    }
    for (const m of this.members) m.conn?.send({ t: 'chat', ...msg });
    return OK;
  }

  /**
   * Verbindung weg. In der Lobby verschwindet der Spieler; im Spiel steht seine Figur still weiter;
   * in der Shop-Phase behält er seinen Fortschritt bis zum Ende der Frist und zählt nicht mehr für "alle bereit".
   */
  leave(conn: Conn): void {
    const member = this.members.find((m) => m.conn === conn);
    if (!member) return;
    this.lastActive = this.now();
    member.conn = null;
    member.disconnectedAt = this.now();
    member.input = { ...NO_INPUT };
    member.ready = false;
    if (this.phase === 'lobby') this.drop(member);
    this.forgetChatIfEmpty();
    this.broadcastLobby();
    this.checkAllReady();
  }

  /**
   * Absichtliches Verlassen: der Platz wird sofort frei, das Token gilt nicht mehr (keine Frist).
   * In der Lobby und in der Shop-Phase verschwindet der Spieler samt Fortschritt; während der Runde
   * bleibt die Figur als Statist stehen (ihr Verdienst zählt für die Rangliste) und fällt am Rundenende heraus.
   */
  leaveForGood(conn: Conn): void {
    const member = this.members.find((m) => m.conn === conn);
    if (!member) return;
    this.lastActive = this.now();
    member.conn = null;
    member.disconnectedAt = this.now();
    member.expired = true;
    member.input = { ...NO_INPUT };
    member.ready = false;
    if (this.phase !== 'playing') this.drop(member);
    this.forgetChatIfEmpty();
    this.broadcastLobby();
    this.checkAllReady();
  }

  /**
   * Startet die Serie (nur Host, nur in der Lobby, mindestens MIN_START_PLAYERS verbunden).
   * `roundMs`: gültiger Wert setzt die Rundenzeit, ungültige Zahl den Standard, fehlend = unverändert.
   */
  start(byId: string, roundMs?: number): Result<void> {
    this.lastActive = this.now();
    if (byId === '' || this.hostId() !== byId) return fail('not_host', 'Nur der Host kann starten.');
    if (this.phase !== 'lobby') return fail('already_started', 'Die Serie läuft schon.');
    if (this.connected().length < MIN_START_PLAYERS) {
      return fail('need_players', 'Mindestens zwei Spieler nötig.');
    }
    if (roundMs !== undefined) this.chosenRoundMs = isRoundMs(roundMs) ? roundMs : DEFAULT_ROUND_MS;
    // Getrennte Spieler der Lobby sind schon entfernt; neue Serie, leerer Fortschritt
    this.members = this.connected();
    this.progress.clear();
    for (const m of this.members) this.progress.set(m.id, freshProgress());
    this.startRound();
    return OK;
  }

  /** Neue Runde mit allen Mitgliedern (auch getrennten in der Frist) und ihrem Fortschritt. */
  private startRound(): void {
    const seed = Math.floor(this.random() * 0x100000000) >>> 0;
    const ids = this.members.map((m) => m.id);
    const progress: Record<string, Progress> = {};
    for (const id of ids) progress[id] = this.progress.get(id) ?? freshProgress();
    this.state = createGame(seed, this.map, ids, { roundMs: this.roundMs(), progress });
    for (const m of this.members) {
      m.input = { ...NO_INPUT };
      m.ackSeq = 0;
      m.ready = false;
    }
    this.phase = 'playing';
    // Chat ist nur in der Lobby offen; die Zähler werden nicht mehr gebraucht
    this.chatTimes.clear();
    this.broadcast({ t: 'phase', phase: 'playing' });
    for (const m of this.members) this.sendStart(m);
    this.broadcastLobby();
  }

  private sendStart(m: Member): void {
    if (!this.state || !m.conn) return;
    m.conn.send({
      t: 'start',
      mapId: this.mapId,
      map: this.state.map,
      you: m.id,
      players: this.roster(),
      snap: projectSnapshot(this.state, m.id),
      roundMs: this.roundMs(),
    });
  }

  /** Alles, was ein Spieler in der Shop-Phase braucht: Phase, Rangliste der letzten Runde, eigener Stand. */
  private sendShop(m: Member): void {
    if (!m.conn) return;
    m.conn.send({ t: 'phase', phase: 'shop' });
    m.conn.send({ t: 'ranking', entries: this.lastRanking.map((e) => ({ ...e })) });
    this.sendShopState(m);
  }

  /** Eigener Stand, nur an diesen Spieler (fremder Fortschritt bleibt privat). */
  private sendShopState(m: Member): void {
    if (!m.conn) return;
    const own = this.progress.get(m.id) ?? freshProgress();
    m.conn.send({ t: 'shopState', you: progressOf(own), ready: m.ready });
  }

  /** Bereit / nicht bereit in der Shop-Phase. Sind danach alle Verbundenen bereit, beginnt die nächste Runde. */
  setReady(m: Member, ready: boolean): Result<void> {
    if (this.phase !== 'shop') return fail('wrong_phase', 'Bereit gibt es nur im Shop.');
    if (m.conn === null) return OK;
    this.lastActive = this.now();
    m.ready = ready;
    this.sendShopState(m);
    this.broadcastLobby();
    this.checkAllReady();
    return OK;
  }

  /** Shop-Phase: alle verbundenen Spieler bereit (und mindestens einer verbunden) -> nächste Runde. */
  private checkAllReady(): void {
    if (this.phase !== 'shop') return;
    const live = this.connected();
    if (live.length === 0 || !live.every((m) => m.ready)) return;
    this.startRound();
  }

  /** Runde vorbei: Fortschritt sichern, Rangliste senden, Shop-Phase. */
  private endRound(): void {
    const state = this.state;
    if (!state) return;
    for (const m of this.members) {
      const p = state.players[m.id];
      if (p) this.progress.set(m.id, progressOf(p));
    }
    this.lastRanking = ranking(state);
    this.phase = 'shop';
    for (const m of this.members) m.ready = false;
    // Wer die Runde endgültig verlassen hat (oder dessen Frist ablief), fällt jetzt heraus
    for (const m of this.members.filter((x) => x.conn === null && x.expired)) this.drop(m);
    for (const m of this.members) this.sendShop(m);
    this.broadcastLobby();
  }

  /** Letzte Eingabe merken. */
  setInput(m: Member, seq: number, input: Input): void {
    if (m.conn === null) return;
    this.lastActive = this.now();
    if (Number.isSafeInteger(seq) && seq >= 0) m.ackSeq = Math.max(m.ackSeq, seq);
    m.input = { ...input };
  }

  /** Ein Serverschritt: Eingaben anwenden, `step`, Snapshots senden. */
  tick(): void {
    const now = this.now();
    this.expireMembers();
    if (this.phase !== 'playing' || !this.state) return;
    if (this.connected().length > 0) this.lastActive = now;

    const inputs: Record<string, Input> = {};
    for (const m of this.members) inputs[m.id] = m.conn ? m.input : NO_INPUT;
    step(this.state, inputs, this.stepMs);

    for (const m of this.members) {
      m.conn?.send({ t: 'snap', snap: projectSnapshot(this.state, m.id), ack: m.ackSeq });
    }
    if (this.state.phase === 'ended') this.endRound();
  }

  /** Leerer Raum, der lange genug leer war. */
  isDead(): boolean {
    return this.connected().length === 0 && this.now() - this.lastActive >= this.emptyMs;
  }
}
```

- [ ] **Step 4: Update the existing server tests**

1. `packages/server/test/room.test.ts`:
   - jedes `expect(room.phase).toBe('running')` durch `expect(room.phase).toBe('playing')` ersetzen, `room.phase === 'running'` durch `room.phase === 'playing'`;
   - jedes `expect(room.phase).toBe('ended')` durch `expect(room.phase).toBe('shop')` und `expect(a.last('lobby').phase).toBe('ended')` durch `expect(a.last('lobby').phase).toBe('shop')` ersetzen (Zeilen mit `snap.phase` bleiben `'ended'`);
   - den Test `'applies a buy command exactly once, also if a newer input without it arrives first'` löschen;
   - den Test `'can start another round after the end with the same members'` ersetzen durch:

```ts
  it('starts the next round when everybody is ready after the end, with the same members', () => {
    const { room, a, ma, mb } = twoPlayers({ roundMs: 100 });
    room.start('p1');
    room.tick();
    room.tick();
    expect(room.phase).toBe('shop');
    expect(room.start('p1')).toMatchObject({ ok: false, code: 'already_started' });
    room.setReady(ma, true);
    room.setReady(mb, true);
    expect(room.phase).toBe('playing');
    expect(a.of('start')).toHaveLength(2);
    expect(room.state!.tick).toBe(0);
  });
```

   - den Test `'F6d: a new round drops disconnected members and keeps the other ids stable'` ersetzen durch:

```ts
  it('F6d: a disconnected member in the grace period plays the next round as a standing figure', () => {
    const { room, ma, mb, mc } = threePlayers({ roundMs: 100 });
    room.start('p1');
    room.leave(mb.conn!);
    room.tick();
    room.tick();
    expect(room.phase).toBe('shop');
    room.setReady(ma, true);
    room.setReady(mc, true);
    expect(room.phase).toBe('playing');
    expect(room.members.map((m) => m.id)).toEqual(['p1', 'p2', 'p3']);
    expect(Object.keys(room.state!.players)).toEqual(['p1', 'p2', 'p3']);
  });
```

2. `packages/server/test/roomChat.test.ts`: `room.phase = 'ended';` durch `room.phase = 'shop';` ersetzen.

- [ ] **Step 5: Run tests**

Run: `cd packages/server && npx vitest run test/roomSeries.test.ts test/room.test.ts test/roomChat.test.ts`
Expected: PASS. (`server.ts` kompiliert erst nach Task 10 mit den neuen Nachrichten; `vitest` prüft keine Typen.)

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/room.ts packages/server/test/roomSeries.test.ts packages/server/test/room.test.ts packages/server/test/roomChat.test.ts
git commit -m "feat(server): Raum spielt eine Serie mit Shop-Phase und Bereit

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Kaufen, Rundenzeit, Serie beenden und Nachrichten im Server

**Files:**
- Modify: `packages/server/src/room.ts` (drei neue Methoden)
- Modify: `packages/server/src/server.ts:224-236` und neue Fälle im `switch`
- Test: `packages/server/test/roomSeries.test.ts`, `packages/server/test/handler.test.ts`, `packages/server/test/server.test.ts`

**Interfaces:**
- Consumes: `shopBuy(p, category, item, qty)`, `BUY_REFUSAL_TEXT`, `isRoundMs` (Kern), `Room.setReady` (Task 9)
- Produces: `Room.shopBuy(m: Member, category: ShopCategory, item: ShopItemId, qty: number): Result<void>`; `Room.setRoundMs(byId: string, roundMs: number): Result<void>`; `Room.endSeries(byId: string): Result<void>`; `handleMessage` verarbeitet `start {roundMs}`, `ready`, `shopBuy`, `setRoundMs`, `endSeries`.

- [ ] **Step 1: Write the failing test**

An `packages/server/test/roomSeries.test.ts` anhängen:

```ts
describe('buying in the shop phase', () => {
  function inShop() {
    const s = series();
    s.room.start('p1');
    s.room.state!.players.p1.money = 1000;
    s.endRound();
    return s;
  }

  it('buys with enough money and answers with the new own state only to the buyer', () => {
    const { room, members, conns } = inShop();
    const before = conns[1].of('shopState').length;
    expect(room.shopBuy(members[0], 'defense', 'food', 3).ok).toBe(true);
    expect(room.progress.get('p1')).toMatchObject({ money: 700, inventory: { food: 3 } });
    expect(conns[0].last('shopState').you).toMatchObject({ money: 700, inventory: { food: 3 } });
    expect(conns[1].of('shopState')).toHaveLength(before);
  });

  it('refuses without money and without partial purchase', () => {
    const { room, members } = inShop();
    const r = room.shopBuy(members[0], 'defense', 'food', 11);
    expect(r).toMatchObject({ ok: false, code: 'cannot_buy', message: 'Nicht genug Geld.' });
    expect(room.progress.get('p1')).toMatchObject({ money: 1000, inventory: { food: 0 } });
  });

  it('never lets two purchases together spend more than the money', () => {
    const { room, members } = inShop();
    expect(room.shopBuy(members[0], 'defense', 'food', 6).ok).toBe(true);
    expect(room.shopBuy(members[0], 'defense', 'food', 6)).toMatchObject({ ok: false, code: 'cannot_buy' });
    expect(room.progress.get('p1')!.money).toBe(400);
  });

  it('refuses buying outside the shop phase', () => {
    const { room, members } = series();
    expect(room.shopBuy(members[0], 'defense', 'food', 1)).toMatchObject({ ok: false, code: 'wrong_phase' });
    room.start('p1');
    expect(room.shopBuy(members[0], 'defense', 'food', 1)).toMatchObject({ ok: false, code: 'wrong_phase' });
  });

  it('carries bought items into the next round', () => {
    const { room, members } = inShop();
    room.shopBuy(members[0], 'attack', 'bolt_cutters', 1);
    room.shopBuy(members[0], 'bags', 'bag', 1);
    for (const m of members) room.setReady(m, true);
    expect(room.state!.players.p1).toMatchObject({ money: 250, containerLevel: 1, inventory: { bolt_cutters: true } });
  });
});

describe('round time and ending the series', () => {
  it('lets only the host set the round time, in lobby and shop', () => {
    const { room, conns, endRound } = series({});
    expect(room.setRoundMs('p2', 600_000)).toMatchObject({ ok: false, code: 'not_host' });
    expect(room.setRoundMs('p1', 600_000).ok).toBe(true);
    expect(conns[2].last('lobby').roundMs).toBe(600_000);
    room.start('p1');
    expect(room.state!.timeLeftMs).toBe(600_000);
    expect(room.setRoundMs('p1', 180_000)).toMatchObject({ ok: false, code: 'wrong_phase' });
    room.state!.timeLeftMs = 1;
    endRound();
    expect(room.setRoundMs('p1', 180_000).ok).toBe(true);
    expect(room.roundMs()).toBe(180_000);
  });

  it('keeps ROUND_MS from the environment over the host choice', () => {
    const { room, conns } = series({ roundMs: 1000 });
    room.setRoundMs('p1', 600_000);
    expect(room.roundMs()).toBe(1000);
    expect(conns[0].last('lobby').roundMs).toBe(1000);
  });

  it('lets only the host end the series in the shop phase, back to the lobby without progress', () => {
    const { room, conns, members, endRound } = series();
    expect(room.endSeries('p1')).toMatchObject({ ok: false, code: 'wrong_phase' });
    room.start('p1');
    endRound();
    room.leave(members[2].conn!);
    expect(room.endSeries('p2')).toMatchObject({ ok: false, code: 'not_host' });
    expect(room.endSeries('p1').ok).toBe(true);
    expect(room.phase).toBe('lobby');
    expect(room.state).toBeNull();
    expect(room.progress.size).toBe(0);
    expect(room.members.map((m) => m.id)).toEqual(['p1', 'p2']);
    expect(conns[1].last('phase').phase).toBe('lobby');
    expect(room.start('p1').ok).toBe(true);
    expect(room.state!.players.p1.money).toBe(0);
  });
});
```

In `packages/server/test/handler.test.ts` die Konstante `INPUT` ersetzen durch

```ts
const INPUT = { t: 'input', seq: 1, input: { moveX: 1, moveY: 0, action: false, steal: false, attack: false, eat: false } };
```

und am Dateiende anhängen:

```ts
describe('series messages', () => {
  it('routes start with round time, ready, shopBuy, setRoundMs and endSeries to the room', () => {
    const { env, manager } = setup();
    const a = fakeConn();
    const b = fakeConn();
    const created = manager.create('Anna', a.conn);
    if (!created.ok) throw new Error('create failed');
    const { room, member } = created.value;
    const bob = room.join('Bob', b.conn);
    if (!bob.ok) throw new Error('join failed');
    const sa: Session = { ...newSession(1000), room, member };
    const sb: Session = { ...newSession(1000), room, member: bob.value };
    const send = (s: Session, c: ReturnType<typeof fakeConn>, msg: unknown) =>
      handleMessage(env, s, c.conn, fakeSock(), JSON.stringify(msg));

    send(sa, a, { t: 'setRoundMs', roundMs: 180_000 });
    expect(room.roundMs()).toBe(180_000);
    send(sb, b, { t: 'setRoundMs', roundMs: 600_000 });
    expect(b.sent.at(-1)).toMatchObject({ t: 'error', code: 'not_host' });
    send(sa, a, { t: 'start', roundMs: 420_000 });
    expect(room.phase).toBe('playing');
    expect(room.state!.timeLeftMs).toBe(420_000);
    send(sa, a, { t: 'shopBuy', category: 'defense', item: 'food', qty: 1 });
    expect(a.sent.at(-1)).toMatchObject({ t: 'error', code: 'wrong_phase' });

    room.state!.players.p1.money = 500;
    room.state!.timeLeftMs = 1;
    room.tick();
    expect(room.phase).toBe('shop');
    send(sa, a, { t: 'shopBuy', category: 'defense', item: 'food', qty: 2 });
    expect(room.progress.get('p1')!.inventory.food).toBe(2);
    send(sa, a, { t: 'shopBuy', category: 'defense', item: 'food', qty: 100 });
    expect(a.sent.at(-1)).toMatchObject({ t: 'error', code: 'bad_message' });
    send(sa, a, { t: 'ready', ready: true });
    expect(room.members[0].ready).toBe(true);
    send(sa, a, { t: 'endSeries' });
    expect(room.phase).toBe('lobby');
  });
});
```

(`Session`, `newSession`, `handleMessage`, `fakeConn`, `fakeSock` und `setup` stehen schon oben in der Datei.)

In `packages/server/test/server.test.ts` jedes `input: { moveX: 1, moveY: 0, action: false, steal: false, buy: null }` durch `input: { moveX: 1, moveY: 0, action: false, steal: false, attack: false, eat: false }` ersetzen. Im Test `'hides private data of the other player in the snapshots on the wire'`: `room.state!.players.p1.item = 'bolt_cutters';` durch `room.state!.players.p1.inventory.bolt_cutters = true;`, `expect(seenByB.snap.players.p1.item).toBeNull();` durch `expect(seenByB.snap.players.p1.inventory.bolt_cutters).toBe(false);` und `expect(seenByA.snap.players.p1.item).toBe('bolt_cutters');` durch `expect(seenByA.snap.players.p1.inventory.bolt_cutters).toBe(true);` ersetzen.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/server && npx vitest run test/roomSeries.test.ts test/handler.test.ts`
Expected: FAIL (`shopBuy`, `setRoundMs`, `endSeries` fehlen; der Handler kennt die Nachrichten nicht).

- [ ] **Step 3: Write minimal implementation**

`packages/server/src/room.ts`: Imports um `BUY_REFUSAL_TEXT` und `shopBuy` (Werte) sowie `ShopCategory` und `ShopItemId` (Typen) erweitern. Nach `setReady` einfügen:

```ts
  /** Kauf in der Shop-Phase; abgelehnt ohne Teilkauf. Der neue eigene Stand geht nur an den Käufer. */
  shopBuy(m: Member, category: ShopCategory, item: ShopItemId, qty: number): Result<void> {
    if (this.phase !== 'shop') return fail('wrong_phase', 'Kaufen geht nur im Shop.');
    if (m.conn === null) return OK;
    this.lastActive = this.now();
    let own = this.progress.get(m.id);
    if (!own) {
      own = freshProgress();
      this.progress.set(m.id, own);
    }
    const r = shopBuy(own, category, item, qty);
    if (!r.ok) return fail('cannot_buy', BUY_REFUSAL_TEXT[r.reason]);
    this.sendShopState(m);
    return OK;
  }

  /** Rundenzeit wählen (nur Host, nur Lobby oder Shop; der Wert ist schon gegen ROUND_MS_CHOICES geprüft). */
  setRoundMs(byId: string, roundMs: number): Result<void> {
    if (byId === '' || this.hostId() !== byId) return fail('not_host', 'Nur der Host kann die Rundenzeit ändern.');
    if (this.phase === 'playing') return fail('wrong_phase', 'Die Rundenzeit ändert sich erst zwischen den Runden.');
    if (!isRoundMs(roundMs)) return fail('bad_message', 'Ungültige Rundenzeit.');
    this.lastActive = this.now();
    this.chosenRoundMs = roundMs;
    this.broadcastLobby();
    return OK;
  }

  /** Serie beenden (nur Host, nur Shop): zurück in die Lobby, Fortschritt verfällt, Getrennte fallen heraus. */
  endSeries(byId: string): Result<void> {
    if (byId === '' || this.hostId() !== byId) return fail('not_host', 'Nur der Host kann die Serie beenden.');
    if (this.phase !== 'shop') return fail('wrong_phase', 'Die Serie lässt sich nur im Shop beenden.');
    this.lastActive = this.now();
    this.phase = 'lobby';
    this.state = null;
    this.progress.clear();
    this.lastRanking = [];
    this.members = this.connected();
    for (const m of this.members) m.ready = false;
    this.broadcast({ t: 'phase', phase: 'lobby' });
    this.broadcastLobby();
    return OK;
  }
```

`packages/server/src/server.ts`, Fall `'start'`:

```ts
    case 'start': {
      if (!session.room || !session.member) return reply(conn, 'not_in_room', 'Du bist in keinem Raum.');
      if (!isCurrent()) return;
      const r = session.room.start(session.member.id, msg.roundMs);
      if (!r.ok) reply(conn, r.code, r.message);
      return;
    }
```

und nach dem Fall `'leave'` (vor der schließenden Klammer des `switch`) einfügen:

```ts
    case 'ready': {
      if (!session.room || !session.member) return reply(conn, 'not_in_room', 'Du bist in keinem Raum.');
      if (!isCurrent()) return;
      const r = session.room.setReady(session.member, msg.ready);
      if (!r.ok) reply(conn, r.code, r.message);
      return;
    }
    case 'shopBuy': {
      if (!session.room || !session.member) return reply(conn, 'not_in_room', 'Du bist in keinem Raum.');
      if (!isCurrent()) return;
      const r = session.room.shopBuy(session.member, msg.category, msg.item, msg.qty);
      if (!r.ok) reply(conn, r.code, r.message);
      return;
    }
    case 'setRoundMs': {
      if (!session.room || !session.member) return reply(conn, 'not_in_room', 'Du bist in keinem Raum.');
      if (!isCurrent()) return;
      const r = session.room.setRoundMs(session.member.id, msg.roundMs);
      if (!r.ok) reply(conn, r.code, r.message);
      return;
    }
    case 'endSeries': {
      if (!session.room || !session.member) return reply(conn, 'not_in_room', 'Du bist in keinem Raum.');
      if (!isCurrent()) return;
      const r = session.room.endSeries(session.member.id);
      if (!r.ok) reply(conn, r.code, r.message);
      return;
    }
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test -w @pfandraiders/server && npm run typecheck -w @pfandraiders/server`
Expected: PASS, keine Typfehler im Server.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/room.ts packages/server/src/server.ts packages/server/test/roomSeries.test.ts packages/server/test/handler.test.ts packages/server/test/server.test.ts
git commit -m "feat(server): Kaufen, Rundenzeit und Serie beenden

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Client bleibt lauffähig

**Files:**
- Modify: `packages/client/src/input.ts`, `packages/client/src/connection.ts`, `packages/client/src/online.ts`, `packages/client/src/text.ts`, `packages/client/src/hud.ts`, `packages/client/src/soundEvents.ts`, `packages/client/src/onlineMenu.ts`, `packages/client/src/scenes/GameScene.ts`
- Test: `packages/client/test/input.test.ts`, `connection.test.ts`, `online.test.ts`, `text.test.ts`, `soundEvents.test.ts`

**Interfaces:**
- Consumes: `Input` (Task 1), `Player.inventory`, `RankEntry.round/total`, `searchMsOf`, `RoomPhase`, `RosterEntry.ready`, Nachrichten `phase`/`ready`, `DEFAULT_ROUND_MS`
- Produces: `OnlineConnection.roomPhase: RoomPhase`, `OnlineConnection.setReady(ready: boolean): void`; `ResultRow { place; id; name; round: number; total: number; isWinner; isViewer }`; `resultFooter(role, labels)` mit Online-Text "Bereit für die nächste Runde". Plan 2 baut darauf auf.

- [ ] **Step 1: Write the failing tests**

1. `packages/client/test/input.test.ts`: die Tests `'maps the buy keys'`, `'prefers the upgrade when both buy keys come in the same frame'`, `'maps the treat and food keys'`, `'prefers upgrade, then bolt cutters, then treat, then food when several come in one frame'` und `'lets the treat win over food when both come in one frame'` löschen. In `'passes the action through'` `{ action: true, buy: null }` durch `{ action: true }` ersetzen. Neuer Test:

```ts
  it('ignores the former buy keys and sends neither attack nor eat yet', () => {
    const all = { ...NONE, buyUpgrade: true, buyItem: true, buyTreat: true, buyFood: true };
    const out = buildInput(all);
    expect(out).toEqual({ moveX: 0, moveY: 0, action: false, steal: false, attack: false, eat: false });
    expect('buy' in out).toBe(false);
  });
```

2. `packages/client/test/connection.test.ts`: die Konstante `BUY` und die Tests `'applies a buy command exactly once even if several steps run in one frame'` und `'keeps a buy command until a step actually runs'` löschen. Neuer Test:

```ts
  it('passes the eat key to the step', () => {
    const state = shopGame();
    state.players.p1.health = 50;
    state.players.p1.inventory.food = 1;
    const conn = new LocalConnection(state, ['p1']);
    conn.setInput('p1', { ...NO_INPUT, eat: true });
    conn.update(LOCAL_STEP_MS);
    expect(conn.getState().players.p1.inventory.food).toBe(0);
  });
```

3. `packages/client/test/online.test.ts`:
   - Import um `DEFAULT_ROUND_MS` ergänzen;
   - in `roster()` jedem Eintrag `ready: false` geben;
   - in `startMessage` `roundMs: DEFAULT_ROUND_MS` ergänzen;
   - in jedem `socket.receive({ t: 'lobby', … })` `roundMs: DEFAULT_ROUND_MS` ergänzen;
   - die Tests `'sends a buy command exactly once, also when it arrives between frames'` und `'drops a buy command pressed during the outage'` löschen;
   - neue Tests:

```ts
  it('sends a changed attack or eat key at once, not only with the heartbeat', () => {
    const { socket, conn } = setup();
    socket.receive(startMessage());
    conn.update(10);
    const before = socket.sent.filter((m) => m.t === 'input').length;
    conn.setInput('p1', { ...NO_INPUT, attack: true });
    conn.update(10);
    conn.setInput('p1', { ...NO_INPUT, eat: true });
    conn.update(10);
    const inputs = socket.sent.filter((m) => m.t === 'input') as Extract<ClientMessage, { t: 'input' }>[];
    expect(inputs.length).toBe(before + 2);
    expect(inputs.at(-2)!.input.attack).toBe(true);
    expect(inputs.at(-1)!.input.eat).toBe(true);
  });

  it('tracks the room phase and sends ready', () => {
    const { socket, conn } = setup();
    expect(conn.roomPhase).toBe('lobby');
    socket.receive({ t: 'phase', phase: 'shop' });
    expect(conn.roomPhase).toBe('shop');
    conn.setReady(true);
    expect(socket.sent.at(-1)).toEqual({ t: 'ready', ready: true });
    socket.receive({ t: 'lobby', room: 'ABCD', host: 'p1', players: roster(), phase: 'playing', roundMs: DEFAULT_ROUND_MS });
    expect(conn.roomPhase).toBe('playing');
  });
```

4. `packages/client/test/text.test.ts`:
   - die Tests `'shows the item name when carrying one'`, `'offers upgrade and item at the shop'`, `'says the item slot is taken instead of offering a second item'`, `'says fully upgraded at the last level'`, `'uses the given keys in shop hints'`, `'offers food and the treat at the shop with the device keys'` und `'hides the treat offer when the item slot is taken but still offers food'` löschen;
   - in `'shows time, money, container and bottles'` `'10:00'` durch `'Zeit 5:00'` ersetzen (`formatTime` zeigt Minuten ohne führende Null);
   - jedes `s.players.p1.item = 'bolt_cutters';` durch `s.players.p1.inventory.bolt_cutters = true;` ersetzen;
   - in `'lists players by money with places'` (Titel `'lists players by round earnings with places'`) `s.players.p1.money = 500;` → `s.players.p1.earnedRound = 500;` und `s.players.p2.money = 1230;` → `s.players.p2.earnedRound = 1230;`; erwartete Zeilen bleiben gleich;
   - in `'uses the given name resolver for the ranking'` `s.players.p1.money = 500;` → `s.players.p1.earnedRound = 500;`;
   - `moneyGame` setzt `s.players[ids[i]].earnedRound = m;` und `s.players[ids[i]].earnedTotal = m * 2;` statt `money`;
   - in `'handles a single player'` wird die Erwartung `[{ place: 1, id: 'p1', name: 'P1', round: 300, total: 600, isWinner: true, isViewer: true }]`;
   - `'orders two players by money'` heißt `'orders two players by round earnings'`;
   - `describe('resultFooter')` ersetzen:

```ts
describe('resultFooter', () => {
  it('shows restart and menu locally', () => {
    expect(resultFooter('local', KEYS)).toEqual(['Neue Runde: R oder E', 'Menü: Esc']);
  });

  it('asks everybody online to get ready for the next round', () => {
    const expected = ['Bereit für die nächste Runde: R oder E', 'Menü: Esc'];
    expect(resultFooter('host', KEYS)).toEqual(expected);
    expect(resultFooter('guest', KEYS)).toEqual(expected);
  });
});
```

5. `packages/client/test/soundEvents.test.ts`:
   - `'plays buy for upgrade, item and food'` heißt `'plays buy for a container upgrade and for spending'`; die Zeile mit `s.players.a.item = 'dog_treat'` löschen; in `fed` `CONFIG.health.food.price` durch `100` ersetzen;
   - in `'recognises a bolt-cutter theft and keeps it silent for bystanders'` `s.players.a.item = 'bolt_cutters';` durch `s.players.a.inventory.bolt_cutters = true;` und `s.players.a.item = null;` durch `s.players.a.inventory.bolt_cutters = false;` ersetzen;
   - neuer Test:

```ts
  it('copies the inventory deeply so a used bolt cutter is seen in the local game', () => {
    const s = fresh();
    s.players.a.inventory.bolt_cutters = true;
    const copy = snapshotForSound(s);
    s.players.a.inventory.bolt_cutters = false;
    expect(copy.players.a.inventory.bolt_cutters).toBe(true);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/client && npx vitest run test/input.test.ts test/connection.test.ts test/online.test.ts test/text.test.ts test/soundEvents.test.ts`
Expected: FAIL (`roomPhase`, `setReady` fehlen, `buy` noch im Input, `round`/`total` fehlen, Inventar wird flach kopiert).

- [ ] **Step 3: Write minimal implementation**

`packages/client/src/input.ts`, `buildInput`:

```ts
/** Die früheren Kauftasten (buy*) wirken nicht mehr; Schlagen und Essen bekommen in Plan 2 eigene Tasten. */
export function buildInput(k: KeyState): Input {
  return {
    moveX: axis(k.left, k.right),
    moveY: axis(k.up, k.down),
    action: k.action,
    steal: k.steal,
    attack: false,
    eat: false,
  };
}
```

`packages/client/src/connection.ts`:

```ts
  setInput(playerId: string, input: Input): void {
    this.inputs[playerId] = { ...input };
  }

  update(deltaMs: number): void {
    this.accumulator += Math.min(deltaMs, MAX_FRAME_MS);
    while (this.accumulator >= LOCAL_STEP_MS) {
      step(this.state, this.inputs, LOCAL_STEP_MS);
      this.accumulator -= LOCAL_STEP_MS;
    }
  }
```

`packages/client/src/online.ts`:
- Typ-Import um `RoomPhase` erweitern.
- `sameInput`:

```ts
function sameInput(a: Input, b: Input): boolean {
  return (
    a.moveX === b.moveX &&
    a.moveY === b.moveY &&
    a.action === b.action &&
    a.steal === b.steal &&
    a.attack === b.attack &&
    a.eat === b.eat
  );
}
```

- Feld `private pendingBuy: Input['buy'] = null;` löschen, ebenso die Zeile `this.pendingBuy = null; // …` in `reopen()`.
- Neues öffentliches Feld nach `chat`:

```ts
  /** Phase des Raums laut Server (lobby, playing, shop). */
  roomPhase: RoomPhase = 'lobby';
```

- Neue Methode nach `requestStart`:

```ts
  /** Shop-Phase: bereit oder nicht mehr bereit (der Server prüft die Phase). */
  setReady(ready: boolean): void {
    if (this.status !== 'open') return;
    this.sendMsg({ t: 'ready', ready });
  }
```

- In `handle`, Fall `'lobby'`: `this.roomPhase = msg.phase;` ergänzen; neuer Fall vor `'error'`:

```ts
      case 'phase':
        this.roomPhase = msg.phase;
        break;
```

- `setInput`:

```ts
  setInput(playerId: string, input: Input): void {
    if (playerId !== this.you) return;
    this.pendingInput = { ...input };
  }
```

- `sendInputIfNeeded`: `const input: Input = { ...this.pendingInput, buy: this.pendingBuy };` durch `const input: Input = { ...this.pendingInput };` ersetzen und `this.pendingBuy = null;` löschen.

`packages/client/src/text.ts`:
- Imports: `isNear`, `nextUpgrade` bleiben nur, soweit benutzt: `isNear` bleibt (Pfandautomat), `nextUpgrade` entfällt.
- `statusLines`: die Zeile mit `p.item` ersetzen durch `lines.push(health);`.
- `hintLines`: den ganzen Zweig `if (isNear(state.map.shops, p)) { … } else if (isNear(state.map.dropoffs, p)) {` ersetzen durch `if (isNear(state.map.dropoffs, p)) {` (Inhalt unverändert); beim Klauen `p.item !== null` durch `p.inventory.bolt_cutters`.
- `resultLines`: ``(r, i) => `${i + 1}. ${nameOf(r.id)}  ${formatMoney(r.money)}` `` wird ``(r, i) => `${i + 1}. ${nameOf(r.id)}  ${formatMoney(r.round)}` ``.
- `ResultRow` und `resultRows`:

```ts
export interface ResultRow {
  place: number;
  id: string;
  name: string;
  /** Rundenverdienst (Cent) */
  round: number;
  /** Gesamtverdienst der Serie (Cent) */
  total: number;
  isWinner: boolean;
  isViewer: boolean;
}

const MAX_NAME_LENGTH = 16;

/** Ergebniszeilen in Ranglistenreihenfolge; gleicher Rundenverdienst teilt sich den Platz (1, 1, 3). */
export function resultRows(
  state: GameState,
  viewerId: string,
  nameOf: (id: string) => string = playerName,
): ResultRow[] {
  const rows: ResultRow[] = [];
  ranking(state).forEach((r, i) => {
    const place = i > 0 && rows[i - 1].round === r.round ? rows[i - 1].place : i + 1;
    rows.push({
      place,
      id: r.id,
      name: nameOf(r.id).slice(0, MAX_NAME_LENGTH),
      round: r.round,
      total: r.total,
      isWinner: place === 1,
      isViewer: r.id === viewerId,
    });
  });
  return rows;
}

export function resultFooter(role: 'local' | 'host' | 'guest', labels: KeyLabels): string[] {
  const first = role === 'local' ? `Neue Runde: R oder ${labels.action}` : `Bereit für die nächste Runde: R oder ${labels.action}`;
  return [first, 'Menü: Esc'];
}
```

`packages/client/src/hud.ts`:
- Import `searchMsOf` aus `@pfandraiders/core` (statt `CONFIG`, falls `CONFIG` sonst unbenutzt ist).
- `progress = p.searchProgressMs / CONFIG.searchMs;` → `progress = p.searchProgressMs / searchMsOf(p);`
- In `ResultsPanel.show`: ``t.setText(`${mark}${row.place}. ${row.name}  ${formatMoney(row.money)}`);`` → ``t.setText(`${mark}${row.place}. ${row.name}  ${formatMoney(row.round)}  (gesamt ${formatMoney(row.total)})`);``

`packages/client/src/soundEvents.ts`:
- `(pt.item === 'bolt_cutters' && t.item === null)` → `(pt.inventory.bolt_cutters && !t.inventory.bolt_cutters)`
- `if (p.containerLevel > q.containerLevel || (q.item === null && p.item !== null) || spent) {` → `if (p.containerLevel > q.containerLevel || spent) {`
- Kommentar über `spent`: `// Geld sinkt bei Bewusstsein nur durch Käufe`
- `snapshotForSound`: `players[id] = { ...p, bottles: { ...p.bottles }, inventory: { ...p.inventory }, upgrades: { ...p.upgrades }, spawn: { ...p.spawn } };`

`packages/client/src/onlineMenu.ts`, `ERRORS` um zwei Einträge ergänzen:

```ts
  wrong_phase: 'Das geht gerade nicht.',
  cannot_buy: 'Kauf abgelehnt.',
```

`packages/client/src/scenes/GameScene.ts`, im Block nach Rundenende:

```ts
    if (state.phase === 'ended' && this.endedForMs >= RESTART_DELAY_MS && !this.plan && (restartPressed || confirmPressed)) {
      if (this.online) {
        // Zwischen den Runden: alle melden "bereit", der Server startet die nächste Runde der Serie
        this.online.setReady(true);
      } else {
        this.scene.restart({ slots: this.slots });
        return;
      }
    }
```

- [ ] **Step 4: Run all tests and typechecks**

Run: `npm test && npm run typecheck`
Expected: PASS in core, client und server.

- [ ] **Step 5: Manual smoke test (online)**

Run in zwei Terminals: `ROUND_MS=20000 npm run dev:server` und `npm run dev`. Zwei Browserfenster, Raum erstellen und beitreten, starten. Nach 20 s zeigt jedes Fenster die Rangliste mit Runden- und Gesamtverdienst; beide drücken `R`; die zweite Runde startet, das Geld aus Runde 1 ist im HUD noch da.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/input.ts packages/client/src/connection.ts packages/client/src/online.ts packages/client/src/text.ts packages/client/src/hud.ts packages/client/src/soundEvents.ts packages/client/src/onlineMenu.ts packages/client/src/scenes/GameScene.ts packages/client/test/input.test.ts packages/client/test/connection.test.ts packages/client/test/online.test.ts packages/client/test/text.test.ts packages/client/test/soundEvents.test.ts
git commit -m "fix(client): bleibt mit Serie und neuem Input lauffähig

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-Review

1. **Spec-Abdeckung:** §1.1 Ablauf und Host beendet (Task 9, 10), §1.2/1.3 Erhalt und Reset (Task 2, 9), §1.4 Runden- und Gesamtverdienst (Task 3), §1.5 getrennte Spieler (Task 9, Ruling 13); §2 Rundenzeit (Task 8, 9, 10); §3.1/3.2 Shop-Phase und Bereit (Task 9); §3.3 Bedienung (Plan 2); §3.4 Katalog (Task 2); §3.5 Mehrfachkauf (Task 2, 10); §3.6 Inventar (Task 2); §3.7 Kauftasten entfallen (Task 1, 11); §4.1 Schlag (Task 6); §4.2 Knockout-Dauer (Task 4); §4.3 Aufstehen am Ort (Task 4); §4.4 Ausrauben (Task 7); §4.5 kein Geldverlust (Task 4); §4.6 Hunde/Polizei ignorieren Ausgeknockte (bestehend: `wants` und `damage`, Test in Task 4 `takes no further damage`); §4.7 `weapon: 'fist'` und nicht verfügbare Einträge (Task 2); §5 Karten (Plan 3); §6 Protokoll und Allow-List (Task 2, 4, 6, 8).
2. **Platzhalter:** keine offenen Stellen; Testanpassungen sind als exakte Ersetzungen angegeben.
3. **Typkonsistenz:** `Progress`, `shopBuy`, `checkShopBuy`, `upgradeValue`, `knockoutMsOf`, `searchMsOf`, `tryAttack`, `tryLoot`, `RankEntry.round/total`, `RoomPhase`, `RosterEntry.ready`, `Room.setReady/shopBuy/setRoundMs/endSeries/roundMs` sind überall gleich benannt.
4. **Review Focus:** alle fünf Punkte haben einen Test (Task 2: Bestand 98 + 2; Task 7: voller Container; Task 9: letzter Unbereiter trennt sich, Rückkehr per Token; Task 10: zwei Käufe über das Geld).
