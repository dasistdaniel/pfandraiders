# Shop-Umbau PR 1 „Wirtschaft“ – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Shop bekommt den neuen Katalog für Taschen (stapelbar, Einkaufswagen als Miete), Upgrades (Taschenlampe, Kundenkarte, Kundenkarte+) und die Kategorie „Waffen“. Knockout kürzer, Laufgeschwindigkeit, Rüstung, Bolzenschneider, Steinschleuder, Pistole und Essen fallen weg. Essen findet man jetzt beim Suchen, und das HUD zeigt den Container als Flaschensymbole.

**Architecture:** Im Kern (`packages/core`) ersetzt ein Feld `items: Items` (Besitz je Shop-Artikel als Zahl) die Felder `containerLevel`, `upgrades`, `inventory` und `weapon`. Kapazität, Tempo, Suchzeit, Abgabetakt und Flaschenwert werden aus `items` abgeleitet (`economy.ts`, `search.ts`). Essensfunde würfelt `food.ts` beim Abschluss einer Suche; sie landen im privaten Feld `lastFood`. Mietsachen löscht die Kernfunktion `progressAfterRound`, die Server (`Room.endRound`) und lokaler Shop (`LocalShop.fromState`) beide benutzen. Im Client prüfen Guards die neue Form. Der Hinweis zum Essensfund entsteht aus einem Zustandsvergleich wie bei der Beschlagnahme. Die Flaschensymbole zeichnet eine Phaser-Grafik nach einem reinen Layout-Helfer.

**Tech Stack:** TypeScript 5.7, npm workspaces (`@pfandraiders/core`, `@pfandraiders/server`, `@pfandraiders/client`), Vitest 3, Phaser 3 im Client, `ws` auf dem Server.

**Spec:** `docs/superpowers/specs/2026-10-09-shop-umbau-design.md` (ergänzt `2026-10-08-serie-shop-kampf-design.md`). PR 2 folgt in `docs/superpowers/plans/2026-10-09-shop-umbau-waffen.md`.

**Ausgangsstand:** Branch `feature/shop-umbau` (von `master` bei `c0aaa2f`). Alle Pfade und Zeilennummern beziehen sich auf diesen Stand.

## Global Constraints

- Alle Texte für Spieler sind deutsch, mit echten Umlauten (Shop, HUD, Hinweise, README).
- Code-Kommentare sind deutsch wie im bestehenden Code; Bezeichner bleiben englisch.
- Jeder Commit endet nach einer Leerzeile mit `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- `todo.md` und `idee.md` werden nie gestaged oder committet. Immer `git add <pfad>` mit expliziten Pfaden, nie `git add -A` oder `git add .`.
- Das Verzeichnis `.claude/` wird nie gelöscht.
- Kein Python, keine Python-Skripte.
- Der Kern bleibt deterministisch: kein `Math.random`, kein `Date.now`; Zufall nur über `nextRandom`/`randInt` mit `state.rngState`.
- Snapshots bleiben eine Allow-List je Betrachter (`packages/core/src/snapshot.ts`). Jedes neue oder entfallene Feld von `Player` wird dort ausdrücklich behandelt, und die Schlüsselliste in `packages/core/test/snapshot.test.ts` wird angepasst. In PR 1: `items` und `lastFood` sind **privat**.
- Protokolländerungen (`Input` ohne `eat`, neue `ShopItemId`, neue `Progress`-Form) verlangen, dass Client und Server gemeinsam neu gebaut und ausgeliefert werden.
- Preise in `CONFIG.shop` sind erfundene Startwerte; das steht als Kommentar im Code.
- Rote Fenster: Der Kern ist nach **jeder** Task grün (`npx vitest run` und `npx tsc --noEmit` in `packages/core`). Server-Tests und Server-Typecheck dürfen in Task 1 bis 3 rot sein und sind ab Task 4 grün. Client-Typecheck darf in Task 1 bis 8 rot sein, die in einer Client-Task genannten Testdateien müssen in dieser Task grün sein. Ab Task 9 ist der ganze Client grün. Am Ende von Task 10 sind `npm test`, `npm run typecheck`, `npm run build` und `npm run build:server` im Wurzelverzeichnis grün.
- Testbefehle (Git Bash oder PowerShell): im Paketordner `npx vitest run <datei>`, z. B. `cd packages/core; npx vitest run test/shop.test.ts`.

## Namenstabelle (verbindlich für PR 1 und PR 2)

| Ort | Name | Typ / Form (Stand nach PR 1) |
| --- | --- | --- |
| `core/src/types.ts` | `ShopCategory` | `'bags' \| 'upgrades' \| 'weapons' \| 'defense'` |
| `core/src/types.ts` | `ShopItemId` | `'bag' \| 'backpack' \| 'cart' \| 'flashlight' \| 'card' \| 'card_plus' \| 'punch' \| 'dog_treat'` |
| `core/src/types.ts` | `Items` | `Record<ShopItemId, number>` |
| `core/src/types.ts` | `FoodFind` | `{ n: number; spot: SpotType; text: number; full: boolean }` |
| `core/src/types.ts` | `Player` neu | `items: Items`, `lastFood: FoodFind \| null` |
| `core/src/types.ts` | `Player` entfällt | `containerLevel`, `eatHeld`, `inventory`, `upgrades`, `weapon` |
| `core/src/types.ts` | `Input` | `{ moveX; moveY; action; steal; attack }` (ohne `eat`) |
| `core/src/types.ts` | entfällt | `UpgradeId`, `Upgrades`, `Inventory`, `WeaponId` |
| `core/src/config.ts` | `ShopKind` | `'level' \| 'once' \| 'count' \| 'stack'` (`count`: Stückzahl bis `max`, je Kauf genau eins) |
| `core/src/config.ts` | `ShopItemDef` | `{ category; name; kind: ShopKind; prices; values; max?: number; perRound?: boolean; requires?: ShopItemId }` (ohne `available`) |
| `core/src/config.ts` | `CONFIG.carry` | `{ base: 3, perUnit: { bag: 2, backpack: 5, cart: 10 }, cartSpeedMult: 0.7 }` |
| `core/src/config.ts` | `CONFIG.depositEveryMsCard` | `100` |
| `core/src/config.ts` | `CONFIG.shop.cardPlusBonusPct` | `10` |
| `core/src/config.ts` | `CONFIG.health.knockoutMs` | `20000` |
| `core/src/config.ts` | `CONFIG.health.food` | `{ heal: 30, chance: { bin: 0.1, bus_stop: 0.04, bench: 0.04, bush: 0.04, park: 0.04 } }` |
| `core/src/config.ts` | entfällt | `CONFIG.containers`, `CONFIG.upgradePrices`, `CONFIG.fight.minDamage` |
| `core/src/shop.ts` | `Progress` | `Pick<Player, 'money' \| 'items' \| 'earnedTotal'>` |
| `core/src/shop.ts` | `SHOP_ITEM_IDS` | `readonly ShopItemId[]` in Katalogreihenfolge |
| `core/src/shop.ts` | `LevelItemId` | `'flashlight' \| 'punch'` (PR 2: nur `'flashlight'`) |
| `core/src/shop.ts` | `noItems(): Items` | alles 0 |
| `core/src/shop.ts` | `progressAfterRound(p: Progress): Progress` | Kopie, Mietsachen (`perRound`) auf 0 |
| `core/src/shop.ts` | `upgradeValue(p: Pick<Player, 'items'>, id: LevelItemId): number` | `values[items[id]]` |
| `core/src/shop.ts` | `ownedOf(p: Pick<Progress, 'items'>, item: ShopItemId): number` | `p.items[item]` |
| `core/src/shop.ts` | `maxOf(item: ShopItemId): number` | level: Stufenzahl, once: 1, count/stack: `max ?? maxStack` |
| `core/src/shop.ts` | `BuyRefusal` | `'unknown_item' \| 'wrong_category' \| 'bad_qty' \| 'requires' \| 'maxed' \| 'no_money'` |
| `core/src/economy.ts` | `capacityOf(p: Pick<Player, 'items'>): number` | `3 + 2·bag + 5·backpack + 10·cart` |
| `core/src/economy.ts` | `speedMultOf(p: Pick<Player, 'items'>): number` | Wagen 0,7, sonst 1 |
| `core/src/economy.ts` | `depositEveryMsOf(p: Pick<Player, 'items'>): number` | Kundenkarte 100, sonst 150 |
| `core/src/economy.ts` | `bottleValueFor(p: Pick<Player, 'items'>, kind: BottleKind): number` | mit Kundenkarte+ `v + floor((v·10 + 50) / 100)` |
| `core/src/economy.ts` | `bottlesValueFor(p: Pick<Player, 'items'>, b: Bottles): number` | Summe von `bottleValueFor` |
| `core/src/economy.ts` | entfällt | `containerOf` |
| `core/src/food.ts` (neu) | `FOOD_TEXTS: Record<SpotType, readonly string[]>` | Texte aus Spec §5.3 |
| `core/src/food.ts` | `FOOD_FULL_SUFFIX` | `' Aber du bist schon satt.'` |
| `core/src/food.ts` | `foodText(f: Pick<FoodFind, 'spot' \| 'text' \| 'full'>): string` | |
| `core/src/food.ts` | `rollFood(state: GameState, p: Player, spot: SpotType): boolean` | ein Wurf, bei Fund ggf. ein zweiter für den Text |
| `core/src/fight.ts` | `punchDamage(attacker: Pick<Player, 'items'>): number` | ohne Opfer-Parameter |
| `core/src/health.ts` | entfällt | `knockoutMsOf`, `eatFood` |
| `core/test/helpers.ts` | `seedWhere(pred: (r: number) => boolean, from?: number): number` | erster `rngState`, dessen nächster Wurf `pred` erfüllt |
| `client/src/bottleIcons.ts` (neu) | `BOTTLE_ICON` | `{ w: 8, h: 10, gap: 2, perRow: 16 }` |
| `client/src/bottleIcons.ts` | `BOTTLE_ICON_COLORS` | `Record<BottleKind \| 'free', number>` |
| `client/src/bottleIcons.ts` | `BottleIcon` | `{ x: number; y: number; kind: BottleKind \| null }` |
| `client/src/bottleIcons.ts` | `bottleIcons(bottles: Bottles, capacity: number, perRow?: number): BottleIcon[]` | |
| `client/src/bottleIcons.ts` | `bottleIconsKey(bottles: Bottles, capacity: number): string` | |
| `client/src/soundEvents.ts` | `FoodNotice` | `{ id: string; text: string }` |
| `client/src/soundEvents.ts` | `detectFoodFinds(prev: GameState \| null, next: GameState, ownIds: string[] \| 'all'): FoodNotice[]` | |
| `client/src/input.ts` | `KeyState` | ohne `eat` |
| `client/src/sources.ts` | `KeyLabels` | `{ action; steal; attack }` (ohne `eat`) |
| `client/src/devices.ts` | `KeyboardLayout` | ohne `eat` |
| `client/src/shopModel.ts` | `ShopRowView.state` | `'normal' \| 'grey'` (ohne `'soon'`) |

## Entscheidungen zu Lücken der Spec (Rulings)

1. **Ein Feld für allen Besitz.** `items: Record<ShopItemId, number>` ersetzt `containerLevel`, `upgrades`, `inventory` und `weapon`. Stufen (Taschenlampe, Schlag), Stückzahlen (Tasche, Rucksack, Leckerli) und einmalige Dinge (0/1) stehen alle als Zahl darin. `ownedOf`, `shopBuy`, `parseProgress` und die Snapshot-Projektion werden dadurch einheitlich. Das Feld `weapon` (immer `'fist'`) entfällt mit Steinschleuder und Pistole.
2. **Neue Kennungen**: Kategorie `attack` → `weapons`, Artikel `search` → `flashlight`; neu `backpack`, `cart`, `card`, `card_plus`. `bag` bleibt die Tasche, hat jetzt aber die Art `count` mit `max: 4` (nicht mehr Stufen). Da sich `Progress` und `Input` ohnehin ändern, kosten neue Namen nichts zusätzlich.
3. **`available`, Ablehnung `unavailable` und Zeilenzustand `soon` entfallen**, weil es keine „bald“-Einträge mehr gibt. `ShopScene.rowColor` verliert den Zweig.
4. **Tasche und Rucksack je Kauf ein Stück**: neue Art `count` (Stückzahl bis `max`, Menge immer 1, sonst `bad_qty`). Grund: Mit Mengenwahl wäre die erste Zeile der ersten Kategorie eine Mengenzeile, und links/rechts würde beim Öffnen des Shops nicht mehr die Kategorie wechseln (`ShopModel.move`). Die Zeile zeigt `+2 Plätze  (hast n/4)`. Mengenwahl bleibt der Art `stack` vorbehalten (Leckerli, in PR 2 Pfefferspray).
5. **Voraussetzung**: `ShopItemDef.requires` (nur bei `card_plus`). Fehlt sie, lehnt `checkShopBuy` mit `'requires'` ab („Erst die Kundenkarte kaufen.“). Die Prüfung kommt nach Kategorie und Menge und vor Grenze und Geld. Der Shop zeigt die Zeile grau mit dem Hinweis „braucht Kundenkarte“.
6. **Kundenkarte+-Rundung**: je Flasche ganzzahlig `v + Math.floor((v * pct + 50) / 100)` mit `pct = CONFIG.shop.cardPlusBonusPct = 10`, also 8 → 9, 15 → 17, 25 → 28. Der Aufschlag zählt zu `money`, `earnedRound` und `earnedTotal` (Pfand ist Verdienst; die Rangliste liest `earnedRound`). Der Hinweis „Pfand abgeben (… €)“ zeigt den Wert mit Aufschlag (`bottlesValueFor`).
7. **Abgabetakt** ist eine Funktion je Spieler (`depositEveryMsOf`). `updateDeposit` benutzt sie an beiden Stellen, an denen bisher `CONFIG.depositEveryMs` stand.
8. **Mietsachen** (`perRound: true`, in PR 1 nur `cart`) werden in `progressAfterRound` auf 0 gesetzt. `progressOf` bleibt eine reine Kopie, denn `sendShopState` sendet den gekauften Wagen noch während der Shop-Phase. `Room.endRound` und `LocalShop.fromState` rufen `progressAfterRound` statt `progressOf`.
9. **Essensfund-Signal**: privates Feld `lastFood` mit Zähler `n` (Funde dieser Runde, beginnt bei 1), Spot-Art, Textindex und `full`. Der Kern würfelt bei **jeder abgeschlossenen Suche genau einmal** (`nextRandom(state) < chance`) und nur bei einem Fund und mehr als einem Text ein zweites Mal (`randInt`). Das verschiebt die Zufallsfolge für alles Spätere: Task 3 lässt deshalb die ganze Kern-Testsuite laufen und passt seed-abhängige Erwartungen an, falls welche brechen.
10. **„Schon satt“** heißt `Math.ceil(health) >= CONFIG.health.max`, gerechnet wie die Zahl im HUD (Hunger zieht ständig Bruchteile ab, sonst gäbe es den Fall fast nie).
11. **Hinweistext**: Der Client zeigt den Fund mit `NOTICE_MS` (3000 ms) über `Notices`. Erkennung: `next.lastFood.n > (prev.lastFood?.n ?? 0)`. Fallen mehrere Funde zwischen zwei Zustände, erscheint der letzte. Ohne vorigen Zustand (`prev === null`, etwa nach dem Wiederverbinden) erscheint nichts.
12. **Knockout** dauert fest `CONFIG.health.knockoutMs = 20000`.
13. **Schlag in PR 1**: `punch` bleibt mit Stufen (+5/+10/+15) unter „Waffen“. Ohne Rüstung braucht es keinen Mindestschaden: `CONFIG.fight.minDamage` entfällt, `punchDamage(attacker)` verliert den Opfer-Parameter. Die Schwelle für den Ton `hit` in `soundEvents.ts` wird `CONFIG.fight.damage - 1`.
14. **Ausrauben** nimmt immer `CONFIG.steal.fraction` (die Hälfte, aufgerundet, so viel passt).
15. **Essen-Taste**: In PR 1 verschwindet `eat` aus `Input`, `KeyState`, `KeyLabels`, `KeyboardLayout`, `padToHeld`, `sameInput`, Steuerungsübersicht und README. Die Tasten `C`, `,` und Gamepad `Y` sind danach frei; PR 2 belegt sie mit dem Pfefferspray.
16. **Ton `buy`**: Käufe gibt es nur noch im Shop (eigene Szene), Geld sinkt in der Runde also nie. Die Regel in `detectSounds` bleibt nur bei „Geld sinkt bei Bewusstsein“; der Vergleich von `containerLevel` entfällt.
17. **Flaschensymbole**: 16 je Zeile, 8 × 10 px, 2 px Abstand, also höchstens 2 Zeilen (Breite 158 px) ab `y = 68` bis `y = 90`. Darunter rücken der Suchbalken auf `BAR_Y = 94` und die Warnung auf `ALERT_Y = 110` (bis 3 Zeilen, also bis etwa y 167). Die Hinweise wachsen von unten (bis 4 Zeilen, ab etwa y 184 in der kleinsten Ansicht 478 × 268). Die Grafik hängt in `hud.objects`, damit fremde Kameras sie ignorieren. Neu gezeichnet wird nur, wenn sich `bottleIconsKey` ändert.
18. **Statuszeilen**: immer genau drei Zeilen (y 8 bis etwa 65): `Zeit m:ss   Geld x,yz €`, `Leben n/100` und die Besitzzeile mit zwei Leerzeichen zwischen den Teilen in dieser Reihenfolge: `Leckerli n`, `Wagen`, `Karte` oder `Karte+` (leer, wenn nichts da ist). Grund: Der feste Lebensbalken oben rechts liegt bei y 30 bis 42 und x ≥ Breite − 108 (370 in der 478 px breiten Ansicht); eine lange zweite Zeile liefe darunter. Die längste Besitzzeile nach PR 2 (`Leckerli 99  Spray 99  Wagen  Karte+  Ausweis`, 45 Zeichen, etwa 430 px) bleibt unter dem Umbruch von 462 px und liegt unterhalb des Balkens.
19. **`hintLines`** behält „Container voll“; die Kapazität kommt aus `capacityOf`.
20. **Prüfung der Snapshots** (`snapshotGuard.ts`): statt `containerLevel` muss `items` ein Objekt sein. **Prüfung des Shop-Stands** (`shopGuard.ts`): `items` muss für jede Kennung aus `SHOP_ITEM_IDS` eine ganze Zahl von 0 bis `maxOf(id)` haben; unbekannte Schlüssel werden ignoriert und nicht übernommen.

## Review Focus

1. **Online-Snapshots werden nach der Formänderung verworfen.** `isValidSnapshot` verlangte `containerLevel`; ohne Anpassung sähe online niemand mehr etwas, während Kern- und Servertests grün blieben. Erwartung: Ein echter projizierter Snapshot (eigene und fremde Figur) ist gültig. Test: Task 6 (`snapshotGuard.test.ts`, "accepts a real projected snapshot with items").
2. **Der gemietete Wagen hält zu lang oder zu kurz.** Gekauft im Shop, muss er die nächste Runde gelten, danach weg sein, online wie lokal. Test: Task 4 (`roomSeries.test.ts`, "rents the cart for exactly one round") und Task 6 (`localShop.test.ts`, "drops the rented cart after the round").
3. **Shop-Stand vom Server wird verworfen.** `parseProgress` kannte nur die alte Form. Erwartung: Ein voll ausgestatteter Stand kommt unverändert durch, zu große Zahlen werden abgelehnt. Test: Task 6 (`shopGuard.test.ts`, "accepts a full progress and copies it").
4. **Essensfund-Hinweis fehlt oder erscheint beim Falschen.** Erwartung: Der Finder sieht ihn auch, wenn zwei Funde zwischen zwei Snapshots liegen, Fremde nie, und `snapshotForSound` teilt `lastFood`/`items` nicht mit dem lokalen Zustand. Test: Task 8 (`soundEvents.test.ts`, "detectFoodFinds").
5. **Kundenkarte+ rundet falsch oder fehlt im Verdienst.** Erwartung: 9/17/28 ct je Flasche, Rundenverdienst und Gesamtverdienst mit Aufschlag, ohne Karte+ unverändert. Test: Task 2 (`economy.test.ts`, "adds the Kundenkarte+ bonus per bottle, rounded").

## Dateien

| Datei | Aufgabe |
| --- | --- |
| `packages/core/src/types.ts` | `Items`, `FoodFind`, neue `ShopCategory`/`ShopItemId`, `Player`, `Input` |
| `packages/core/src/config.ts` | neuer Katalog, `carry`, `depositEveryMsCard`, `knockoutMs`, Essenschancen |
| `packages/core/src/shop.ts` | Katalogfunktionen, `Progress`, `progressAfterRound` |
| `packages/core/src/economy.ts` | Kapazität, Tempo, Abgabetakt, Flaschenwert |
| `packages/core/src/food.ts` (neu) | Essensfunde |
| `packages/core/src/index.ts` | exportiert `food` |
| `packages/core/src/search.ts`, `theft.ts`, `fight.ts`, `health.ts`, `movement.ts`, `npc.ts`, `step.ts`, `sanitize.ts`, `snapshot.ts`, `game.ts` | auf `items` umstellen, Entfernungen |
| `packages/core/test/*` | siehe Tasks 1 bis 3 |
| `packages/server/src/room.ts` | `progressAfterRound` am Rundenende |
| `packages/server/test/roomSeries.test.ts`, `handler.test.ts`, `server.test.ts`, `roomFinal.test.ts` | neue Artikel und Formen |
| `packages/client/src/input.ts`, `sources.ts`, `devices.ts`, `menuModel.ts`, `online.ts` | ohne Essen-Taste |
| `packages/client/src/snapshotGuard.ts`, `shopGuard.ts`, `localShop.ts` | neue Formen, Mietsachen |
| `packages/client/src/shopModel.ts`, `scenes/ShopScene.ts` | Shop-Zeilen |
| `packages/client/src/soundEvents.ts`, `scenes/GameScene.ts` | Ton `buy`, Kopie, Essensfund-Hinweis |
| `packages/client/src/bottleIcons.ts` (neu), `hud.ts`, `text.ts` | HUD |
| `packages/client/test/*` | siehe Tasks 5 bis 9 |
| `README.md` | Steuerung, Shop, Kampf, Leben |

---

### Task 1: Kern – Besitz als `items`, neuer Katalog, Entfernungen

**Files:**
- Modify: `packages/core/src/types.ts:5-29` (Shop-Typen), `:50-63` (`Input`, `NO_INPUT`), `:85-131` (`Player`)
- Modify: `packages/core/src/config.ts` (ganze Datei ersetzen)
- Modify: `packages/core/src/shop.ts` (ganze Datei ersetzen)
- Modify: `packages/core/src/economy.ts:5-11`
- Modify: `packages/core/src/search.ts:1-32`
- Modify: `packages/core/src/theft.ts:47-66`
- Modify: `packages/core/src/fight.ts` (ganze Datei)
- Modify: `packages/core/src/health.ts` (ganze Datei)
- Modify: `packages/core/src/movement.ts:1-4`, `:65-67`
- Modify: `packages/core/src/npc.ts:215-216`
- Modify: `packages/core/src/step.ts` (ganze Datei)
- Modify: `packages/core/src/sanitize.ts:9-20`
- Modify: `packages/core/src/snapshot.ts:1-55`
- Modify: `packages/core/src/game.ts:53-83`
- Test: `packages/core/test/shop.test.ts` (ganze Datei ersetzen), `config.test.ts`, `steal-config.test.ts`, `game.test.ts`, `health.test.ts`, `fight.test.ts`, `theft.test.ts`, `determinism-theft.test.ts`, `determinism-events.test.ts`, `determinism.test.ts`, `countdown.test.ts`, `economy.test.ts`, `movement.test.ts`, `search.test.ts`, `npc.test.ts`, `path-city.test.ts`, `protocol.test.ts`, `sanitize.test.ts`, `snapshot.test.ts`

**Interfaces:**
- Consumes: bestehende Kernfunktionen (`transferBottles`, `damage`, `walk`, `boxBlocked`).
- Produces: alles aus der Namenstabelle unter `types.ts`, `config.ts`, `shop.ts` und `capacityOf`/`speedMultOf` in `economy.ts`; `punchDamage(attacker)`; `Player.lastFood` (in dieser Task immer `null`).

- [ ] **Step 1: Neuen Katalogtest schreiben (failing)**

`packages/core/test/shop.test.ts` komplett ersetzen:

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
  noItems,
  ownedOf,
  progressAfterRound,
  progressOf,
  SHOP_CATEGORIES,
  SHOP_CATEGORY_NAMES,
  SHOP_ITEM_IDS,
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
    expect(SHOP_CATEGORIES).toEqual(['bags', 'upgrades', 'weapons', 'defense']);
    expect(SHOP_CATEGORIES.map((c) => SHOP_CATEGORY_NAMES[c])).toEqual(['Taschen', 'Upgrades', 'Waffen', 'Verteidigung']);
    expect(shopItemsOf('bags')).toEqual(['bag', 'backpack', 'cart']);
    expect(shopItemsOf('upgrades')).toEqual(['flashlight', 'card', 'card_plus']);
    expect(shopItemsOf('weapons')).toEqual(['punch']);
    expect(shopItemsOf('defense')).toEqual(['dog_treat']);
    expect(SHOP_ITEM_IDS).toEqual(['bag', 'backpack', 'cart', 'flashlight', 'card', 'card_plus', 'punch', 'dog_treat']);
  });

  it('pins the start prices and limits', () => {
    const items = CONFIG.shop.items;
    expect([items.bag.prices[0], items.bag.kind, items.bag.max]).toEqual([150, 'count', 4]);
    expect([items.backpack.prices[0], items.backpack.kind, items.backpack.max]).toEqual([400, 'count', 2]);
    expect([items.cart.prices[0], items.cart.kind, items.cart.perRound]).toEqual([100, 'once', true]);
    expect(items.flashlight).toMatchObject({ name: 'Taschenlampe', kind: 'level', prices: [200, 500, 1000], values: [1, 0.85, 0.7, 0.55] });
    expect(items.card).toMatchObject({ name: 'Kundenkarte', kind: 'once', prices: [300] });
    expect(items.card_plus).toMatchObject({ name: 'Kundenkarte+', kind: 'once', prices: [600], requires: 'card' });
    expect(items.dog_treat).toMatchObject({ name: 'Leckerli', kind: 'stack', prices: [100] });
    expect(CONFIG.shop.maxStack).toBe(99);
    expect(CONFIG.shop.cardPlusBonusPct).toBe(10);
  });

  it('has a value for every level of every leveled entry', () => {
    for (const id of SHOP_ITEM_IDS) {
      const def = CONFIG.shop.items[id];
      if (def.kind === 'level') expect(def.values.length).toBe(def.prices.length + 1);
    }
  });

  it('recognises categories and items and nothing else', () => {
    expect(isShopCategory('weapons')).toBe(true);
    expect(isShopCategory('attack')).toBe(false);
    expect(isShopCategory('__proto__')).toBe(false);
    expect(isShopItemId('cart')).toBe(true);
    for (const gone of ['food', 'armor', 'speed', 'knockout', 'search', 'bolt_cutters', 'sling', 'pistol', 'toString', 5]) {
      expect(isShopItemId(gone)).toBe(false);
    }
  });

  it('has a German text for every refusal', () => {
    for (const text of Object.values(BUY_REFUSAL_TEXT)) expect(text.length).toBeGreaterThan(3);
    expect(BUY_REFUSAL_TEXT.requires).toBe('Erst die Kundenkarte kaufen.');
  });
});

describe('shopBuy', () => {
  it('stacks bags up to four, one per purchase', () => {
    const p = rich(1000);
    expect(shopBuy(p, 'bags', 'bag', 2)).toEqual({ ok: false, reason: 'bad_qty' });
    for (let i = 0; i < 4; i++) expect(shopBuy(p, 'bags', 'bag', 1)).toEqual({ ok: true, cost: 150 });
    expect(p.items.bag).toBe(4);
    expect(shopBuy(p, 'bags', 'bag', 1)).toEqual({ ok: false, reason: 'maxed' });
    expect(maxOf('bag')).toBe(4);
    expect(p.money).toBe(400);
  });

  it('stacks backpacks up to two', () => {
    const p = rich();
    expect(shopBuy(p, 'bags', 'backpack', 1)).toEqual({ ok: true, cost: 400 });
    expect(shopBuy(p, 'bags', 'backpack', 1)).toEqual({ ok: true, cost: 400 });
    expect(shopBuy(p, 'bags', 'backpack', 1)).toEqual({ ok: false, reason: 'maxed' });
    expect(maxOf('backpack')).toBe(2);
  });

  it('rents one cart', () => {
    const p = rich();
    expect(shopBuy(p, 'bags', 'cart', 1)).toEqual({ ok: true, cost: 100 });
    expect(ownedOf(p, 'cart')).toBe(1);
    expect(shopBuy(p, 'bags', 'cart', 1)).toEqual({ ok: false, reason: 'maxed' });
    expect(shopBuy(rich(), 'bags', 'cart', 2)).toEqual({ ok: false, reason: 'bad_qty' });
  });

  it('raises the flashlight level and its value', () => {
    const p = rich();
    expect(upgradeValue(p, 'flashlight')).toBe(1);
    expect(shopBuy(p, 'upgrades', 'flashlight', 1)).toEqual({ ok: true, cost: 200 });
    expect(upgradeValue(p, 'flashlight')).toBe(0.85);
    expect(shopBuy(p, 'upgrades', 'flashlight', 1)).toEqual({ ok: true, cost: 500 });
    expect(shopBuy(p, 'upgrades', 'flashlight', 1)).toEqual({ ok: true, cost: 1000 });
    expect(upgradeValue(p, 'flashlight')).toBe(0.55);
    expect(shopBuy(p, 'upgrades', 'flashlight', 1)).toEqual({ ok: false, reason: 'maxed' });
  });

  it('sells Kundenkarte+ only after the Kundenkarte', () => {
    const p = rich();
    expect(shopBuy(p, 'upgrades', 'card_plus', 1)).toEqual({ ok: false, reason: 'requires' });
    expect(p).toEqual(rich());
    expect(shopBuy(p, 'upgrades', 'card', 1)).toEqual({ ok: true, cost: 300 });
    expect(shopBuy(p, 'upgrades', 'card_plus', 1)).toEqual({ ok: true, cost: 600 });
    expect(shopBuy(p, 'upgrades', 'card_plus', 1)).toEqual({ ok: false, reason: 'maxed' });
  });

  it('keeps the punch levels under Waffen', () => {
    const p = rich();
    expect(shopBuy(p, 'weapons', 'punch', 1)).toEqual({ ok: true, cost: 250 });
    expect(upgradeValue(p, 'punch')).toBe(5);
  });

  it('refuses without partial purchase when the money is short', () => {
    const p = rich(250);
    expect(shopBuy(p, 'defense', 'dog_treat', 3)).toEqual({ ok: false, reason: 'no_money' });
    expect(p.items.dog_treat).toBe(0);
    expect(p.money).toBe(250);
  });

  it('refuses more than 99 treats in total, also at the border', () => {
    const p = rich();
    p.items.dog_treat = 98;
    expect(shopBuy(p, 'defense', 'dog_treat', 2)).toEqual({ ok: false, reason: 'maxed' });
    expect(shopBuy(p, 'defense', 'dog_treat', 1)).toEqual({ ok: true, cost: 100 });
    expect(p.items.dog_treat).toBe(99);
    expect(maxOf('dog_treat')).toBe(99);
  });

  it('refuses bad quantities, unknown items and wrong categories', () => {
    const p = rich();
    for (const qty of [0, -1, 1.5, 100, Number.NaN, '3']) {
      expect(checkShopBuy(p, 'defense', 'dog_treat', qty)).toEqual({ ok: false, reason: 'bad_qty' });
    }
    expect(checkShopBuy(p, 'upgrades', 'flashlight', 2)).toEqual({ ok: false, reason: 'bad_qty' });
    expect(checkShopBuy(p, 'defense', 'food', 1)).toEqual({ ok: false, reason: 'unknown_item' });
    expect(checkShopBuy(p, 'attack', 'punch', 1)).toEqual({ ok: false, reason: 'unknown_item' });
    expect(checkShopBuy(p, 'bags', 'dog_treat', 1)).toEqual({ ok: false, reason: 'wrong_category' });
    expect(p).toEqual(rich());
  });
});

describe('progress', () => {
  it('starts empty', () => {
    expect(freshProgress()).toEqual({ money: 0, items: noItems(), earnedTotal: 0 });
    expect(noItems()).toEqual({ bag: 0, backpack: 0, cart: 0, flashlight: 0, card: 0, card_plus: 0, punch: 0, dog_treat: 0 });
  });

  it('copies deeply', () => {
    const a = rich(5);
    const b = progressOf(a);
    b.items.bag = 2;
    expect(a.items.bag).toBe(0);
  });

  it('drops the rented cart after a round and keeps everything else', () => {
    const p = rich(500);
    p.items = { ...noItems(), bag: 4, backpack: 2, cart: 1, flashlight: 2, card: 1, card_plus: 1, punch: 1, dog_treat: 7 };
    const after = progressAfterRound(p);
    expect(after.items).toEqual({ ...p.items, cart: 0 });
    expect(after.money).toBe(500);
    expect(p.items.cart).toBe(1); // das Original bleibt
  });

  it('is carried into a new game and only the per-round fields are fresh', () => {
    const prog = rich(777);
    prog.items.bag = 2;
    prog.items.dog_treat = 4;
    prog.earnedTotal = 1234;
    const s = createGame(1, CITY_MAP, ['a', 'b'], { progress: { a: prog } });
    expect(s.players.a).toMatchObject({
      money: 777,
      items: { bag: 2, dog_treat: 4, cart: 0 },
      earnedTotal: 1234,
      earnedRound: 0,
      lastFood: null,
      health: CONFIG.health.max,
      bottles: { plastic: 0, glass: 0, crate: 0 },
    });
    expect(s.players.b.money).toBe(0);
    s.players.a.items.dog_treat = 0;
    expect(prog.items.dog_treat).toBe(4); // keine geteilten Objekte
  });
});
```

- [ ] **Step 2: Test laufen lassen, er scheitert**

Run: `cd packages/core; npx vitest run test/shop.test.ts`
Expected: FAIL (Import-Fehler `noItems`, `progressAfterRound`, `SHOP_ITEM_IDS` oder falsche Kategorien).

- [ ] **Step 3: Typen umstellen**

In `packages/core/src/types.ts` die Zeilen 5 bis 29 (`UpgradeId` bis `ShopItemId`) ersetzen durch:

```ts
export type ShopCategory = 'bags' | 'upgrades' | 'weapons' | 'defense';
export type ShopItemId =
  | 'bag'
  | 'backpack'
  | 'cart'
  | 'flashlight'
  | 'card'
  | 'card_plus'
  | 'punch'
  | 'dog_treat';
/** Besitz je Shop-Artikel: Stückzahl, Stufe oder 0/1. Bleibt über Runden, außer Mietsachen (perRound). */
export type Items = Record<ShopItemId, number>;
/** Letzter Essensfund dieser Runde (privat): n zählt die Funde ab 1, text ist der Index in FOOD_TEXTS[spot]. */
export interface FoodFind {
  n: number;
  spot: SpotType;
  text: number;
  /** Leben war schon voll (aufgerundet): Text bekommt FOOD_FULL_SUFFIX */
  full: boolean;
}
```

`Input` und `NO_INPUT` (Zeilen 50 bis 63) ersetzen durch:

```ts
export interface Input {
  moveX: -1 | 0 | 1;
  moveY: -1 | 0 | 1;
  /** Aktionstaste gehalten */
  action: boolean;
  /** Ausrauben-Taste gehalten (wirkt beim Drücken, nur bei Ausgeknockten) */
  steal: boolean;
  /** Schlagen-Taste gehalten (wirkt beim Drücken) */
  attack: boolean;
}

export const NO_INPUT: Input = { moveX: 0, moveY: 0, action: false, steal: false, attack: false };
```

`Player` (Zeilen 85 bis 131) ersetzen durch:

```ts
export interface Player {
  id: string;
  x: number;
  y: number;
  /** Cent */
  money: number;
  bottles: Bottles;
  /** Besitz aus dem Shop (Taschen, Upgrades, Schlag, Leckerli) */
  items: Items;
  mode: Mode;
  searchSpotId: number | null;
  searchProgressMs: number;
  /**
   * Abgabe am Pfandautomaten: Restzeit bis zur nächsten Flasche (Countdown, der Rest eines Schritts
   * wird übertragen). 0 = gibt gerade nicht ab; während der Abgabe immer > 0.
   */
  depositMs: number;
  /** Aktionstaste im vorigen Tick gedrückt, für Flankenerkennung */
  actionHeld: boolean;
  /** Ausrauben-Taste im vorigen Tick gedrückt, für die Flanke (Ausrauben wirkt nur beim Drücken) */
  stealHeld: boolean;
  /** Schlagen-Taste im vorigen Tick gedrückt, für die Flanke */
  attackHeld: boolean;
  /** Restzeit, bis der Spieler wieder schlagen kann, 0 = bereit */
  attackCooldownMs: number;
  /** Restzeit des Schutzes nach dem Aufstehen aus einem Knockout, 0 = angreifbar */
  shieldMs: number;
  /** Leben, 0 = bewusstlos (kann zwischen Ticks Nachkommastellen haben) */
  health: number;
  /** Restzeit der Bewusstlosigkeit, 0 = bei Bewusstsein */
  unconsciousMs: number;
  /** In diesem Knockout schon ausgeraubt (einmal pro Knockout, Spec §4.4) */
  robbed: boolean;
  /** Letzter Essensfund dieser Runde, null = noch keiner (für den Hinweis im Client) */
  lastFood: FoodFind | null;
  /** Rundenverdienst in Cent (Pfand dieser Runde) */
  earnedRound: number;
  /** Gesamtverdienst der Serie in Cent (alle Runden, inklusive der laufenden) */
  earnedTotal: number;
  /** Startpunkt dieser Runde */
  spawn: Point;
}
```

- [ ] **Step 4: `config.ts` ersetzen**

`packages/core/src/config.ts` komplett ersetzen:

```ts
import type { BottleKind, ShopCategory, ShopItemId, SpotType } from './types';

/** Kantenlänge einer Kachel in Pixeln */
export const TILE = 16;

export type Range = readonly [min: number, max: number];

/**
 * level: Stufen (Preis je nächste Stufe), once: höchstens einmal, count: Stückzahl bis max, je Kauf genau eins,
 * stack: Stückzahl bis max bzw. CONFIG.shop.maxStack, Menge im Shop wählbar
 */
export type ShopKind = 'level' | 'once' | 'count' | 'stack';

export interface ShopItemDef {
  category: ShopCategory;
  /** Anzeigename im Shop */
  name: string;
  kind: ShopKind;
  /** level: Preis in Cent von Stufe i auf i + 1; once/count/stack: [Preis je Stück] */
  prices: readonly number[];
  /** level: Wirkung je Stufe (Index = Stufe, Länge = prices.length + 1); sonst leer */
  values: readonly number[];
  /** count/stack: höchster Bestand (fehlt = CONFIG.shop.maxStack) */
  max?: number;
  /** Miete: gilt nur für die Runde nach dem Kauf und ist am Rundenende weg (progressAfterRound) */
  perRound?: boolean;
  /** Kauf erst, wenn dieser Artikel vorhanden ist */
  requires?: ShopItemId;
}

export const CONFIG = {
  /** Standard-Rundenzeit (5 Minuten); der Host wählt in der Lobby 3, 5, 7 oder 10 Minuten */
  roundMs: 5 * 60 * 1000,
  /** Countdown vor jeder Runde (5, 4, 3, 2, 1, LOS!); solange er läuft, steht die Welt still */
  countdownMs: 5000,
  /** größter Zeitschritt, den ein einzelner step verarbeitet */
  maxStepMs: 100,
  /** Pixel pro Sekunde */
  playerSpeed: 115,
  /** halbe Kantenlänge der Kollisionsbox */
  playerHalf: 5,
  /** halbe Kantenlänge des festen Kerns einer weichen Kachel (Baum, Laterne) um deren Mitte */
  softHalf: 3,
  /**
   * größter seitlicher Versatz, um den der Spieler an einer Kante vorbeigeschoben wird.
   * Muss >= playerHalf + softHalf + 1 sein, sonst blockiert ein weicher Kern bei mittigem Anlauf
   * (Kantenberührung zählt als blockiert, daher das +1).
   */
  slideMaxPx: 9,
  interactRadius: 20,
  searchMs: 1500,
  /** Am Pfandautomaten wird alle so viele ms eine Flasche abgegeben (die erste sofort beim Drücken) */
  depositEveryMs: 150,
  /** ... mit Kundenkarte */
  depositEveryMsCard: 100,
  refillMs: 30000,
  /** Wahrscheinlichkeit, dass ein Spot zu Rundenbeginn gefüllt ist */
  spotActiveChance: 0.85,
  /** Cent pro Flasche */
  bottleValue: { plastic: 8, glass: 15, crate: 25 } as Record<BottleKind, number>,
  /** Plätze: Hände plus je Tasche, Rucksack und Einkaufswagen (Spec §2.1); nur der Wagen bremst */
  carry: {
    base: 3,
    perUnit: { bag: 2, backpack: 5, cart: 10 },
    cartSpeedMult: 0.7,
  },
  /** Ausrauben eines Ausgeknockten (Spec §4.4) */
  steal: {
    /** größter Abstand Räuber zu Opfer in Pixeln */
    radius: 20,
    /** Anteil der Flaschen des Opfers (aufgerundet) */
    fraction: 0.5,
  },
  /** Schlagen (Spec §4.1) */
  fight: {
    /** größter Abstand zum Opfer in Pixeln */
    radius: 20,
    /** so lange nach einem Schlag (auch ohne Treffer) kein neuer */
    cooldownMs: 600,
    /** Grundschaden; das Schlag-Upgrade erhöht ihn */
    damage: 20,
  },
  /**
   * Shop-Phase (Spec 2026-10-09-shop-umbau §1). Reihenfolge der Einträge = Reihenfolge im Shop.
   * Alle Preise und Wirkungen sind erfundene Startwerte für das spätere Balancing.
   */
  shop: {
    /** Höchster Bestand eines Verbrauchsguts ohne eigenes max */
    maxStack: 99,
    /** Kundenkarte+: Aufschlag je Flasche in Prozent, kaufmännisch gerundet (Spec §3.3) */
    cardPlusBonusPct: 10,
    items: {
      bag: { category: 'bags', name: 'Tasche', kind: 'count', prices: [150], values: [], max: 4 },
      backpack: { category: 'bags', name: 'Rucksack', kind: 'count', prices: [400], values: [], max: 2 },
      cart: { category: 'bags', name: 'Einkaufswagen', kind: 'once', prices: [100], values: [], perRound: true },
      /** values: Faktor auf die Suchzeit */
      flashlight: { category: 'upgrades', name: 'Taschenlampe', kind: 'level', prices: [200, 500, 1000], values: [1, 0.85, 0.7, 0.55] },
      card: { category: 'upgrades', name: 'Kundenkarte', kind: 'once', prices: [300], values: [] },
      card_plus: { category: 'upgrades', name: 'Kundenkarte+', kind: 'once', prices: [600], values: [], requires: 'card' },
      /** values: zusätzlicher Schaden je Schlag */
      punch: { category: 'weapons', name: 'Stärkerer Schlag', kind: 'level', prices: [250, 600, 1200], values: [0, 5, 10, 15] },
      dog_treat: { category: 'defense', name: 'Leckerli', kind: 'stack', prices: [100], values: [] },
    } as Record<ShopItemId, ShopItemDef>,
  },
  health: {
    max: 100,
    /** alle so viele ms verliert ein Spieler 1 Leben durch Hunger */
    hungerEveryMs: 8000,
    /** Dauer eines Knockouts */
    knockoutMs: 20000,
    /** Essensfund beim Suchen (Spec §5): heilt so viel, Chance je abgeschlossener Suche nach Spot-Art */
    food: {
      heal: 30,
      chance: { bin: 0.1, bus_stop: 0.04, bench: 0.04, bush: 0.04, park: 0.04 } as Record<SpotType, number>,
    },
    /** Leben nach dem Aufstehen */
    reviveHealth: 60,
    /** Schutz nach dem Aufstehen */
    spawnShieldMs: 3000,
  },
  npc: {
    /** Neue NPCs erscheinen nur, solange weniger als so viele jagen (sitzende und streunende zählen nicht) */
    maxCount: 3,
    /** Harte Obergrenze aller NPCs inklusive sitzender und streunender (NPCs verschwinden nie) */
    maxTotal: 6,
    /** Nach einem Biss, einer Kontrolle oder dem Aufgeben lässt der NPC diesen Spieler so lange in Ruhe */
    restMs: 20000,
    /** Streunen: Ziele liegen höchstens so weit von der aktuellen Position (px, 5 Kacheln) */
    wanderRadius: 80,
    /** So viele Zufallsversuche für ein begehbares Ziel, sonst bleibt er stehen */
    wanderTries: 6,
    /** So nah am Ziel gilt er als angekommen (px) */
    wanderArriveRadius: 6,
    /** Kommt er so lange nicht um wanderProgressPx näher, sucht er sich (nach einer Pause) ein neues Ziel */
    wanderStuckMs: 1200,
    wanderProgressPx: 4,
    /** Pause zwischen zwei Wegstücken */
    wanderPauseMs: [1500, 4000] as Range,
    /** Ist der direkte Weg zum Ziel verbaut, sucht der NPC höchstens so oft einen neuen Weg um die Wände (ms) */
    pathEveryMs: 300,
    /** So nah am Wegpunkt gilt er als erreicht, dann wird sofort der nächste gesucht (px) */
    pathArrivePx: 1.5,
    firstSpawnMs: 15000,
    spawnEveryMs: [20000, 40000] as Range,
    dogChance: 0.6,
    dog: {
      speed: 100,
      /** Streunen mit diesem Anteil der Geschwindigkeit */
      roamSpeedMult: 0.6,
      /** Ausdauer: so lange jagt er ohne Biss, dann gibt er auf (setzt sich) */
      lifeMs: 30000,
      senseRadius: 160,
      biteRadius: 12,
      biteDamage: 15,
      biteCooldownMs: 1500,
      distractedMs: 8000,
      /** Nach einem Biss (oder wenn er aufgibt) sitzt der Hund so lange, dann streunt er */
      sitMs: 8000,
    },
    police: {
      speed: 80,
      roamSpeedMult: 0.7,
      /** Ausdauer: so lange verfolgt er ohne Kontrolle, dann gibt er auf (streunt) */
      lifeMs: 20000,
      senseRadius: 140,
      controlRadius: 22,
      checkMs: 2000,
      fraction: 0.5,
    },
  },
  zone: {
    announceMs: 20000,
    activeMs: 60000,
    firstIdleMs: [60000, 120000] as Range,
    idleMs: [90000, 150000] as Range,
    multiplier: 3,
    /** Nachfüllzeit eines Spots in einer aktiven Zone */
    refillMs: 8000,
  },
  /** Fundtabelle: pro Spot-Typ und Flaschenart [min, max] */
  spotTypes: {
    bus_stop: { plastic: [0, 2], glass: [0, 1], crate: [0, 0] },
    bench: { plastic: [0, 2], glass: [0, 1], crate: [0, 0] },
    bush: { plastic: [1, 3], glass: [0, 1], crate: [0, 0] },
    bin: { plastic: [1, 3], glass: [0, 2], crate: [0, 0] },
    park: { plastic: [0, 2], glass: [0, 2], crate: [0, 1] },
  } as Record<SpotType, Record<BottleKind, Range>>,
};
```

- [ ] **Step 5: `shop.ts` ersetzen**

`packages/core/src/shop.ts` komplett ersetzen:

```ts
import { CONFIG } from './config';
import type { Items, Player, ShopCategory, ShopItemId } from './types';

/** Was ein Spieler von Runde zu Runde mitnimmt (Spec §7.1). */
export type Progress = Pick<Player, 'money' | 'items' | 'earnedTotal'>;

export const SHOP_CATEGORIES: readonly ShopCategory[] = ['bags', 'upgrades', 'weapons', 'defense'];

export const SHOP_CATEGORY_NAMES: Record<ShopCategory, string> = {
  bags: 'Taschen',
  upgrades: 'Upgrades',
  weapons: 'Waffen',
  defense: 'Verteidigung',
};

/** Alle Artikel in Katalogreihenfolge (Reihenfolge von CONFIG.shop.items). */
export const SHOP_ITEM_IDS: readonly ShopItemId[] = Object.keys(CONFIG.shop.items) as ShopItemId[];

/** Artikel mit Stufen und einer Wirkung je Stufe */
export type LevelItemId = 'flashlight' | 'punch';

export function isShopCategory(v: unknown): v is ShopCategory {
  return typeof v === 'string' && (SHOP_CATEGORIES as readonly string[]).includes(v);
}

export function isShopItemId(v: unknown): v is ShopItemId {
  return typeof v === 'string' && Object.hasOwn(CONFIG.shop.items, v);
}

/** Einträge einer Kategorie in Katalogreihenfolge */
export function shopItemsOf(category: ShopCategory): ShopItemId[] {
  return SHOP_ITEM_IDS.filter((id) => CONFIG.shop.items[id].category === category);
}

/** Kein Besitz. Als Literal, damit ein neuer Artikel hier die Kompilierung scheitern lässt. */
export function noItems(): Items {
  return { bag: 0, backpack: 0, cart: 0, flashlight: 0, card: 0, card_plus: 0, punch: 0, dog_treat: 0 };
}

/** Fortschritt eines neuen Spielers: nichts. */
export function freshProgress(): Progress {
  return { money: 0, items: noItems(), earnedTotal: 0 };
}

/** Tiefe Kopie, damit Runde, Raum und Nachrichten keine Objekte teilen. */
export function progressOf(p: Progress): Progress {
  return { money: p.money, items: { ...p.items }, earnedTotal: p.earnedTotal };
}

/** Fortschritt nach dem Ende einer Runde: Kopie ohne Mietsachen (perRound, etwa der Einkaufswagen). */
export function progressAfterRound(p: Progress): Progress {
  const out = progressOf(p);
  for (const id of SHOP_ITEM_IDS) if (CONFIG.shop.items[id].perRound) out.items[id] = 0;
  return out;
}

/** Wirkung der aktuellen Stufe (values[Stufe] aus CONFIG.shop). */
export function upgradeValue(p: Pick<Player, 'items'>, id: LevelItemId): number {
  return CONFIG.shop.items[id].values[p.items[id]];
}

/** Besitz: Stufe, Stückzahl oder 0/1. */
export function ownedOf(p: Pick<Progress, 'items'>, item: ShopItemId): number {
  return p.items[item];
}

/** Höchster Besitz: Zahl der Stufen, 1 oder max bzw. CONFIG.shop.maxStack (count, stack). */
export function maxOf(item: ShopItemId): number {
  const def = CONFIG.shop.items[item];
  if (def.kind === 'level') return def.prices.length;
  if (def.kind === 'once') return 1;
  return def.max ?? CONFIG.shop.maxStack;
}

export type BuyRefusal = 'unknown_item' | 'wrong_category' | 'bad_qty' | 'requires' | 'maxed' | 'no_money';

export type BuyResult = { ok: true; cost: number } | { ok: false; reason: BuyRefusal };

export const BUY_REFUSAL_TEXT: Record<BuyRefusal, string> = {
  unknown_item: 'Unbekannter Artikel.',
  wrong_category: 'Der Artikel gehört nicht in diese Kategorie.',
  bad_qty: 'Ungültige Menge.',
  // Bisher hat nur die Kundenkarte+ eine Voraussetzung
  requires: 'Erst die Kundenkarte kaufen.',
  maxed: 'Mehr geht nicht.',
  no_money: 'Nicht genug Geld.',
};

/**
 * Prüft einen Kauf, ohne etwas zu ändern. Stufen, einmalige Dinge und count-Artikel (Tasche, Rucksack) nur einzeln,
 * stack-Ware in Mengen bis max bzw. CONFIG.shop.maxStack. Kein Teilkauf: reicht das Geld nicht für alles, wird abgelehnt.
 */
export function checkShopBuy(p: Progress, category: unknown, item: unknown, qty: unknown): BuyResult {
  if (!isShopCategory(category) || !isShopItemId(item)) return { ok: false, reason: 'unknown_item' };
  const def = CONFIG.shop.items[item];
  if (def.category !== category) return { ok: false, reason: 'wrong_category' };
  if (typeof qty !== 'number' || !Number.isInteger(qty) || qty < 1 || qty > CONFIG.shop.maxStack) {
    return { ok: false, reason: 'bad_qty' };
  }
  if (def.kind !== 'stack' && qty !== 1) return { ok: false, reason: 'bad_qty' };
  if (def.requires !== undefined && p.items[def.requires] === 0) return { ok: false, reason: 'requires' };
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
  p.money -= r.cost;
  p.items[item as ShopItemId] += qty as number;
  return r;
}
```

- [ ] **Step 6: Kapazität und Tempo in `economy.ts`**

In `packages/core/src/economy.ts` die Zeilen 5 bis 11 (`containerOf`, `capacityOf`) ersetzen durch:

```ts
/** Plätze: Hände plus Taschen, Rucksäcke und Einkaufswagen (Spec §2.1). */
export function capacityOf(p: Pick<Player, 'items'>): number {
  const c = CONFIG.carry;
  return c.base + p.items.bag * c.perUnit.bag + p.items.backpack * c.perUnit.backpack + p.items.cart * c.perUnit.cart;
}

/** Faktor auf das Lauftempo: nur der Einkaufswagen bremst (Spec §2.2). */
export function speedMultOf(p: Pick<Player, 'items'>): number {
  return p.items.cart > 0 ? CONFIG.carry.cartSpeedMult : 1;
}
```

- [ ] **Step 7: Suche, Diebstahl, Schlag, Gesundheit, Laufen, Hund**

`packages/core/src/search.ts` Zeilen 29 bis 32 ersetzen:

```ts
/** Suchdauer nach der Stufe der Taschenlampe (ganze ms). */
export function searchMsOf(p: Pick<Player, 'items'>): number {
  return Math.round(CONFIG.searchMs * upgradeValue(p, 'flashlight'));
}
```

`packages/core/src/theft.ts` Zeilen 47 bis 66 ersetzen:

```ts
/**
 * Ausrauben im Schritt, in dem die Ausrauben-Taste (Eingabe `steal`) neu gedrückt wurde (Spec §4.4): nimmt dem nächsten
 * Ausgeknockten CONFIG.steal.fraction seiner Flaschen (aufgerundet, begrenzt durch den freien Platz)
 * und setzt `robbed`. Ohne Abklingzeit, ohne Schutz. Mit vollem Container passiert nichts (der Ausgeknockte
 * bleibt ausraubbar). Gibt true zurück, wenn ausgeraubt wurde.
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

`packages/core/src/fight.ts` komplett ersetzen:

```ts
import { CONFIG } from './config';
import { distance } from './economy';
import { damage } from './health';
import { upgradeValue } from './shop';
import type { GameState, Player } from './types';

/** Schaden eines Schlags: Grundschaden plus Schlag-Upgrade. */
export function punchDamage(attacker: Pick<Player, 'items'>): number {
  return CONFIG.fight.damage + upgradeValue(attacker, 'punch');
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
  if (target && target.shieldMs === 0) damage(target, punchDamage(attacker));
  return true;
}
```

`packages/core/src/health.ts` komplett ersetzen:

```ts
import { CONFIG } from './config';
import { cancelSearch } from './search';
import type { Player } from './types';

/**
 * Umfallen: Flaschen, Geld und Besitz bleiben. Der Spieler liegt CONFIG.health.knockoutMs lang und kann
 * in dieser Zeit einmal ausgeraubt werden (robbed wird zurückgesetzt).
 */
export function knockOut(p: Player): void {
  p.health = 0;
  p.unconsciousMs = CONFIG.health.knockoutMs;
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
```

`packages/core/src/movement.ts`: Zeile 3 `import { upgradeValue } from './shop';` ersetzen durch `import { speedMultOf } from './economy';` und die Zeilen 66 bis 67 ersetzen:

```ts
  const speed = CONFIG.playerSpeed * speedMultOf(p);
```

`packages/core/src/npc.ts` Zeilen 215 bis 216 ersetzen:

```ts
  if (target.items.dog_treat > 0) {
    target.items.dog_treat--;
```

- [ ] **Step 8: Schritt, Eingabe, Snapshot, neues Spiel**

`packages/core/src/step.ts`: Zeile 4 ersetzen durch `import { updateHealth } from './health';` und die Funktion `updatePlayer` (Zeilen 50 bis 88) ersetzen:

```ts
function updatePlayer(state: GameState, p: Player, input: Input, dt: number): void {
  const pressed = input.action && !p.actionHeld;
  p.actionHeld = input.action;
  const stealPressed = input.steal && !p.stealHeld;
  p.stealHeld = input.steal;
  const attackPressed = input.attack && !p.attackHeld;
  p.attackHeld = input.attack;
  p.shieldMs = Math.max(0, p.shieldMs - dt);
  p.attackCooldownMs = Math.max(0, p.attackCooldownMs - dt);

  if (updateHealth(p, dt)) {
    // Bewusstlos: keine Eingabe wirksam (die Tastenflanken oben sind schon nachgeführt)
    p.mode = 'unconscious';
    p.depositMs = 0;
    return;
  }

  // Schlagen geht auch im Laufen; die eigene Suche bricht ab
  if (attackPressed && tryAttack(state, p)) cancelSearch(p);

  // Abgabe hat Vorrang: wer mit Flaschen am Automaten drückt, beginnt im selben Tick keine Suche
  const depositing = updateDeposit(state, p, input, dt, pressed);

  if (input.moveX !== 0 || input.moveY !== 0) {
    cancelSearch(p);
    walk(state.map, p, input, dt);
  } else if (stealPressed && tryLoot(state, p)) {
    cancelSearch(p);
  } else if (input.action && !depositing && updateSearch(state, p, dt, pressed)) {
    // sucht: eine neue Suche beginnt nur beim Drücken, eine laufende geht beim Halten weiter
  } else {
    cancelSearch(p);
  }

  p.mode = p.searchSpotId !== null ? 'searching' : 'walking';
}
```

`packages/core/src/sanitize.ts` Zeilen 12 bis 19 (das zurückgegebene Objekt) ersetzen:

```ts
  return {
    moveX: axis(r.moveX),
    moveY: axis(r.moveY),
    action: r.action === true,
    steal: r.steal === true,
    attack: r.attack === true,
  };
```

`packages/core/src/snapshot.ts`: Zeile 3 ersetzen durch `import { noItems } from './shop';`, den Kommentar in Zeile 8 bis 10 ersetzen durch

```ts
 * Fremdes Geld und fremde Verdienste (bis Rundenende), fremder Container-Inhalt, fremder Besitz (items),
 * fremde Essensfunde, Such-, Abgabe- und Tastenzustände und der Zufalls-Zustand werden entfernt.
 * Vom fremden Container bleibt nur "hat Flaschen" (als eine Plastikflasche).
```

und das Literal `foreign` (Zeilen 27 bis 53) ersetzen:

```ts
    const foreign: Player = {
      id: p.id,
      x: p.x,
      y: p.y,
      money: revealMoney ? p.money : 0,
      bottles: { plastic: totalBottles(p.bottles) > 0 ? 1 : 0, glass: 0, crate: 0 },
      items: noItems(),
      mode: p.mode,
      searchSpotId: null,
      searchProgressMs: 0,
      depositMs: 0,
      actionHeld: false,
      stealHeld: false,
      attackHeld: false,
      attackCooldownMs: p.attackCooldownMs,
      shieldMs: p.shieldMs,
      health: p.health,
      unconsciousMs: p.unconsciousMs,
      robbed: p.robbed,
      lastFood: null,
      earnedRound: revealMoney ? p.earnedRound : 0,
      earnedTotal: revealMoney ? p.earnedTotal : 0,
      spawn: p.spawn,
    };
```

`packages/core/src/game.ts` das Rückgabeobjekt von `newPlayer` (Zeilen 56 bis 82) ersetzen:

```ts
  return {
    id,
    x: at.x,
    y: at.y,
    money: own.money,
    bottles: emptyBottles(),
    items: own.items,
    mode: 'walking',
    searchSpotId: null,
    searchProgressMs: 0,
    depositMs: 0,
    actionHeld: false,
    stealHeld: false,
    attackHeld: false,
    attackCooldownMs: 0,
    shieldMs: 0,
    health: CONFIG.health.max,
    unconsciousMs: 0,
    robbed: false,
    lastFood: null,
    earnedRound: 0,
    earnedTotal: own.earnedTotal,
    spawn: { x: at.x, y: at.y },
  };
```

Und den Kommentar in Zeile 54 ersetzen durch `// Kopie: die Runde verändert Geld und Besitz, der Aufrufer behält seinen Stand`.

- [ ] **Step 9: Typecheck des Kerns**

Run: `cd packages/core; npx tsc --noEmit`
Expected: Fehler nur noch in `test/*.ts` (Quellcode kompiliert). Falls `src/` noch Fehler meldet: die genannte Stelle nach Step 3 bis 8 korrigieren.

- [ ] **Step 10: Bestehende Kerntests auf `items` umstellen**

Für jede Datei genau diese Änderungen:

`packages/core/test/config.test.ts`: die drei Tests in Zeilen 22 bis 37 (`has speed multipliers…`, `has exactly one upgrade price…`, `has strictly increasing capacities…`) ersetzen durch:

```ts
  it('carries 3 in the hands and 31 with every bag, backpack and the cart', () => {
    expect(CONFIG.carry.base).toBe(3);
    expect(CONFIG.carry.perUnit).toEqual({ bag: 2, backpack: 5, cart: 10 });
    const max = CONFIG.shop.items;
    expect(
      CONFIG.carry.base +
        (max.bag.max ?? 0) * CONFIG.carry.perUnit.bag +
        (max.backpack.max ?? 0) * CONFIG.carry.perUnit.backpack +
        CONFIG.carry.perUnit.cart,
    ).toBe(31);
  });

  it('slows only with the cart, by a factor in (0, 1]', () => {
    expect(CONFIG.carry.cartSpeedMult).toBe(0.7);
    expect(CONFIG.carry.cartSpeedMult).toBeGreaterThan(0);
  });

  it('knocks out for a fixed 20 s and finds food in bins more often', () => {
    expect(CONFIG.health.knockoutMs).toBe(20000);
    expect(CONFIG.health.food.chance).toEqual({ bin: 0.1, bus_stop: 0.04, bench: 0.04, bush: 0.04, park: 0.04 });
  });
```

`packages/core/test/steal-config.test.ts`: den Test `has priced bolt cutters in the attack category` (Zeilen 16 bis 20) ersetzen durch:

```ts
  it('has no bolt cutters any more', () => {
    expect(Object.hasOwn(CONFIG.shop.items, 'bolt_cutters')).toBe(false);
  });
```

`packages/core/test/game.test.ts`: oben `import { noItems } from '../src/shop';` ergänzen; in Zeile 17 `containerLevel: 0,` ersetzen durch `items: noItems(),`; im Test `starts players with an empty inventory…` (Zeilen 60 bis 70) den Titel in `'starts players without items, food find, cooldown or shield'` ändern und die Zeilen 63 bis 65 ersetzen durch:

```ts
      items: noItems(),
      lastFood: null,
```

`packages/core/test/health.test.ts`:
- Zeile 4: `import { damage } from '../src/health';`
- In `knocked()` die Zeilen 30 bis 31 ersetzen durch `p.items.dog_treat = 2;`
- Zeile 40: `expect(p.items.dog_treat).toBe(2);` und Titel des Tests `'keeps bottles, money and items'`.
- Die Tests `lasts 20 s without upgrade…` und `uses the same duration when hunger…` (Zeilen 46 bis 63) ersetzen durch:

```ts
  it('lasts the fixed knockout time, also after hunger', () => {
    const s = newGame(SEARCH_ROWS);
    damage(s.players.p1, 1000);
    expect(s.players.p1.unconsciousMs).toBe(CONFIG.health.knockoutMs);
    const t = newGame(SEARCH_ROWS);
    t.players.p1.health = 0.05;
    runSteps(t, {}, 30, 20);
    expect(t.players.p1.unconsciousMs).toBeGreaterThan(CONFIG.health.knockoutMs - 600);
    expect(t.players.p1.unconsciousMs).toBeLessThanOrEqual(CONFIG.health.knockoutMs);
  });
```

- Zeile 77: `eat: true` aus dem Input entfernen; Zeile 80 ersetzen durch `expect(s.players.p1.items.dog_treat).toBe(2);`.
- Zeile 94: `runFor(s, {}, CONFIG.health.knockoutMs + 100);`
- Den ganzen Block `describe('eating from the inventory', …)` (Zeilen 114 bis 154) löschen.

`packages/core/test/fight.test.ts`:
- Zeile 4: `import { damage } from '../src/health';`
- Die Tests `adds the punch upgrade and subtracts the armor…` und `never deals less than the minimum damage` (Zeilen 56 bis 76) ersetzen durch:

```ts
  it('adds the punch upgrade', () => {
    const s = setup();
    expect(punchDamage(s.players.p1)).toBe(CONFIG.fight.damage);
    s.players.p1.items.punch = 3;
    expect(punchDamage(s.players.p1)).toBe(CONFIG.fight.damage + 15);
  });
```

- Im Test `knocks the victim out at zero health…` (Zeilen 78 bis 86) die Zeile `s.players.p2.upgrades.knockout = 1;` löschen und die letzte Zeile ersetzen durch `expect(s.players.p2.unconsciousMs).toBeGreaterThan(CONFIG.health.knockoutMs - 100);`.

`packages/core/test/theft.test.ts`:
- Zeile 15: `s.players.p2.items.bag = 3;` (9 Plätze); Kommentar Zeile 11: `/** p2 trägt 4 Plastik (3 Taschen, 9 Plätze), p1 ist Dieb mit leeren Händen (3 Plätze). p2 steht 16 px neben p1. */`
- Den Test `keep their bottles even when the robber has bolt cutters…` (Zeilen 31 bis 41) ersetzen durch:

```ts
  it('keep their bottles even when the robber has a big container', () => {
    const s = setup();
    s.players.p1.items.cart = 1;
    runSteps(s, STEAL, 1);
    runSteps(s, RELEASE, 1);
    runSteps(s, STEAL, 1);
    expect(totalBottles(s.players.p1.bottles)).toBe(0);
    expect(s.players.p2.bottles.plastic).toBe(4);
  });
```

- Die vier Bolzenschneider-Tests (Zeilen 135 bis 162: `takes all bottles with the bolt cutters…`, `limits the bolt cutters loot…`, `keeps the bolt cutters when…`) ersetzen durch:

```ts
  it('always takes half, also with a big container', () => {
    const s = knockedSetup();
    s.players.p1.items.cart = 1;
    runSteps(s, STEAL, 1);
    expect(s.players.p1.bottles.plastic).toBe(2);
    expect(s.players.p2.bottles.plastic).toBe(2);
    expect(s.players.p2.robbed).toBe(true);
  });
```

`packages/core/test/determinism-theft.test.ts`: Zeile 15 `s.players.p2.items.bag = 3;`; die Funktion `cutters` (Zeilen 30 bis 38) und den Test `replays a bolt cutters robbery…` (Zeilen 50 bis 56) löschen.

`packages/core/test/determinism-events.test.ts`: Zeile 17 (`eat: tick % 300 === 0,`) löschen.
`packages/core/test/determinism.test.ts`: Zeile 17 (`eat: false,`) löschen.
`packages/core/test/countdown.test.ts`: Zeile 27: `p2: input({ moveY: 1 })` statt `input({ moveY: 1, eat: true })`.

`packages/core/test/economy.test.ts`: Zeile 54 ersetzen durch `s.players.p1.items = { ...s.players.p1.items, bag: 4, backpack: 2, cart: 1 }; // 31 Plätze`.

`packages/core/test/movement.test.ts`:
- Test `is slower with the shopping cart` (Zeilen 40 bis 45):

```ts
  it('is slower with the shopping cart, but not with bags and backpacks', () => {
    const s = newGame(openRows(20, 5));
    s.players.p1.items.cart = 1;
    runSteps(s, { p1: input({ moveX: 1 }) }, 50, 20);
    expect(s.players.p1.x - 24).toBeCloseTo(CONFIG.playerSpeed * CONFIG.carry.cartSpeedMult, 5);
    const t = newGame(openRows(20, 5));
    t.players.p1.items.bag = 4;
    t.players.p1.items.backpack = 2;
    runSteps(t, { p1: input({ moveX: 1 }) }, 50, 20);
    expect(t.players.p1.x - 24).toBeCloseTo(CONFIG.playerSpeed, 5);
  });
```

- Den Block `describe('speed upgrade', …)` (Zeilen 191 bis 201) löschen.

`packages/core/test/search.test.ts`: den Block `describe('search upgrade', …)` (Zeilen 219 bis 238) ersetzen durch:

```ts
describe('flashlight', () => {
  it('shortens the search time by the factor of the level', () => {
    const items = { ...noItems() };
    expect(searchMsOf({ items })).toBe(CONFIG.searchMs);
    expect(searchMsOf({ items: { ...items, flashlight: 1 } })).toBe(Math.round(CONFIG.searchMs * 0.85));
    expect(searchMsOf({ items: { ...items, flashlight: 2 } })).toBe(Math.round(CONFIG.searchMs * 0.7));
    expect(searchMsOf({ items: { ...items, flashlight: 3 } })).toBe(Math.round(CONFIG.searchMs * 0.55));
  });

  it('finishes a search earlier with the flashlight', () => {
    const s = newGame(SEARCH_ROWS);
    setSpot(s, 0, { plastic: 2 });
    teleport(s, 'p1', s.spots[0]);
    s.players.p1.items.flashlight = 3;
    const ms = searchMsOf(s.players.p1);
    runFor(s, { p1: input({ action: true }) }, ms - 40);
    expect(s.players.p1.bottles.plastic).toBe(0);
    runFor(s, { p1: input({ action: true }) }, 60);
    expect(s.players.p1.bottles.plastic).toBe(2);
  });
});
```

und oben `import { noItems } from '../src/shop';` ergänzen.

`packages/core/test/npc.test.ts`: in den Zeilen 131, 152, 155, 164, 167, 173 und 706 `inventory.dog_treat` durch `items.dog_treat` ersetzen; den Test `does not use a bolt cutters item up on a bite` (Zeilen 180 bis 187) löschen; Zeilen 366 und 577 `s.players.p1.containerLevel = 1;` durch `s.players.p1.items.bag = 3;` ersetzen.

`packages/core/test/path-city.test.ts`: Zeile 49 `s.players.p1.items.bag = 3;`.

`packages/core/test/protocol.test.ts`: Zeile 69 `input: { moveX: 0, moveY: 0, action: true, steal: false, attack: false },`; in den Zeilen 147 bis 157 jedes `item: 'food'` durch `item: 'dog_treat'` ersetzen.

`packages/core/test/sanitize.test.ts`: Zeile 7 `const i = { moveX: -1, moveY: 1, action: true, steal: true, attack: true };`; Zeile 30 (`eat: {},`) löschen; Test in Zeilen 43 bis 45 ersetzen:

```ts
  it('has attack off and no eat key in NO_INPUT, and drops a sent eat key', () => {
    expect(NO_INPUT).toEqual({ moveX: 0, moveY: 0, action: false, steal: false, attack: false });
    expect('eat' in sanitizeInput({ ...NO_INPUT, eat: true })).toBe(false);
  });
```

`packages/core/test/snapshot.test.ts`:
- Oben `import { noItems } from '../src/shop';` ergänzen.
- In `game()` (Zeilen 11 bis 16) ersetzen: `s.players.p1.items.bag = 3;` statt der Zeilen 11 und 12; `s.players.p2.items.dog_treat = 3;` und `s.players.p2.items.punch = 2;` statt der Zeilen 15 und 16; zusätzlich `s.players.p2.lastFood = { n: 1, spot: 'bin', text: 1, full: false };`.
- Test `shows whether a foreign player was robbed but never his eat key` (Zeilen 30 bis 37) ersetzen:

```ts
  it('shows whether a foreign player was robbed but never his food find', () => {
    const s = game();
    s.players.p2.robbed = true;
    const other = projectSnapshot(s, 'p1').players.p2;
    expect(other.robbed).toBe(true);
    expect(other.lastFood).toBeNull();
    expect(projectSnapshot(s, 'p2').players.p2.lastFood).toEqual({ n: 1, spot: 'bin', text: 1, full: false });
  });
```

- Im Test `hides money, container contents, inventory and upgrades…` die Zeilen 52 bis 57 ersetzen:

```ts
    expect(other.items).toEqual(noItems());
    expect(other.earnedRound).toBe(0);
    expect(other.bottles).toEqual({ plastic: 1, glass: 0, crate: 0 }); // nur "hat Flaschen"
```

  und den Titel in `'hides money, container contents and items of other players'` ändern.
- Zeile 129: `expect(snap.players.p2.items.dog_treat).toBe(0); // Besitz bleibt auch dann verborgen`
- Zeile 151: `s.players.p1.items.bag = 3;`
- `PLAYER_KEYS` (Zeilen 175 bis 179):

```ts
  const PLAYER_KEYS = [
    'actionHeld', 'attackCooldownMs', 'attackHeld', 'bottles', 'depositMs', 'earnedRound', 'earnedTotal',
    'health', 'id', 'items', 'lastFood', 'mode', 'money', 'robbed', 'searchProgressMs', 'searchSpotId',
    'shieldMs', 'spawn', 'stealHeld', 'unconsciousMs', 'x', 'y',
  ];
```

- [ ] **Step 11: Kern komplett grün**

Run: `cd packages/core; npx vitest run; npx tsc --noEmit`
Expected: alle Tests PASS, Typecheck ohne Fehler. Meldet `tsc` noch eine Testdatei mit `containerLevel`, `inventory`, `upgrades`, `weapon`, `eat` oder `food`: dort nach den Regeln aus Step 10 ersetzen (`containerLevel = 1` → `items.bag = 3`, `inventory.dog_treat` → `items.dog_treat`, `eat` streichen).

- [ ] **Step 12: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/config.ts packages/core/src/shop.ts packages/core/src/economy.ts packages/core/src/search.ts packages/core/src/theft.ts packages/core/src/fight.ts packages/core/src/health.ts packages/core/src/movement.ts packages/core/src/npc.ts packages/core/src/step.ts packages/core/src/sanitize.ts packages/core/src/snapshot.ts packages/core/src/game.ts packages/core/test
git commit -m "feat(core): items replace container level, upgrades and inventory; new shop catalog

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Kern – Kundenkarte und Kundenkarte+

**Files:**
- Modify: `packages/core/src/economy.ts` (Imports, `depositOne`, `updateDeposit`)
- Test: `packages/core/test/economy.test.ts`

**Interfaces:**
- Consumes: `Player.items` (Task 1), `CONFIG.depositEveryMsCard`, `CONFIG.shop.cardPlusBonusPct`.
- Produces: `depositEveryMsOf(p: Pick<Player, 'items'>): number`, `bottleValueFor(p: Pick<Player, 'items'>, kind: BottleKind): number`, `bottlesValueFor(p: Pick<Player, 'items'>, b: Bottles): number`.

- [ ] **Step 1: Failing tests**

Ans Ende von `packages/core/test/economy.test.ts` anhängen und oben `import { bottleValueFor, bottlesValueFor, depositEveryMsOf } from '../src/economy';` ergänzen:

```ts
describe('Kundenkarte', () => {
  it('deposits every 100 ms instead of 150 ms', () => {
    const s = atDropoff();
    expect(depositEveryMsOf(s.players.p1)).toBe(150);
    s.players.p1.items.card = 1;
    expect(depositEveryMsOf(s.players.p1)).toBe(100);
    s.players.p1.bottles = { plastic: 3, glass: 0, crate: 0 };
    runSteps(s, PRESS, 1); // erste Flasche sofort
    runSteps(s, PRESS, 4); // 80 ms: noch keine zweite
    expect(totalBottles(s.players.p1.bottles)).toBe(2);
    runSteps(s, PRESS, 1); // 100 ms
    expect(totalBottles(s.players.p1.bottles)).toBe(1);
    runSteps(s, PRESS, 5);
    expect(totalBottles(s.players.p1.bottles)).toBe(0);
  });
});

describe('Kundenkarte+', () => {
  it('adds the Kundenkarte+ bonus per bottle, rounded', () => {
    const s = atDropoff();
    const p = s.players.p1;
    expect([bottleValueFor(p, 'plastic'), bottleValueFor(p, 'glass'), bottleValueFor(p, 'crate')]).toEqual([8, 15, 25]);
    p.items.card = 1;
    p.items.card_plus = 1;
    expect([bottleValueFor(p, 'plastic'), bottleValueFor(p, 'glass'), bottleValueFor(p, 'crate')]).toEqual([9, 17, 28]);
    expect(bottlesValueFor(p, { plastic: 2, glass: 1, crate: 1 })).toBe(2 * 9 + 17 + 28);
    p.bottles = { plastic: 1, glass: 1, crate: 1 };
    p.earnedTotal = 100;
    runFor(s, PRESS, 400);
    expect(totalBottles(p.bottles)).toBe(0);
    expect(p.money).toBe(9 + 17 + 28);
    expect(p.earnedRound).toBe(9 + 17 + 28);
    expect(p.earnedTotal).toBe(100 + 9 + 17 + 28);
  });
});
```

- [ ] **Step 2: Run, FAIL**

Run: `cd packages/core; npx vitest run test/economy.test.ts`
Expected: FAIL (`depositEveryMsOf` ist nicht exportiert).

- [ ] **Step 3: Implementierung**

In `packages/core/src/economy.ts` Zeile 3 ersetzen durch `import type { BottleKind, Bottles, GameState, Input, Player, Point } from './types';` und hinter `speedMultOf` einfügen:

```ts
/** Abstand der Flaschen am Pfandautomaten: mit Kundenkarte kürzer (Spec §3.2). */
export function depositEveryMsOf(p: Pick<Player, 'items'>): number {
  return p.items.card > 0 ? CONFIG.depositEveryMsCard : CONFIG.depositEveryMs;
}

/**
 * Wert einer Flasche für diesen Spieler in Cent. Mit Kundenkarte+ plus CONFIG.shop.cardPlusBonusPct Prozent,
 * ganzzahlig kaufmännisch gerundet (8 -> 9, 15 -> 17, 25 -> 28 bei 10 %).
 */
export function bottleValueFor(p: Pick<Player, 'items'>, kind: BottleKind): number {
  const v = CONFIG.bottleValue[kind];
  if (p.items.card_plus === 0) return v;
  return v + Math.floor((v * CONFIG.shop.cardPlusBonusPct + 50) / 100);
}

/** Wert eines Flaschenbestands für diesen Spieler (für den Hinweis am Pfandautomaten). */
export function bottlesValueFor(p: Pick<Player, 'items'>, b: Bottles): number {
  return b.plastic * bottleValueFor(p, 'plastic') + b.glass * bottleValueFor(p, 'glass') + b.crate * bottleValueFor(p, 'crate');
}
```

In `depositOne` die Zeile `const value = CONFIG.bottleValue[kind];` ersetzen durch `const value = bottleValueFor(p, kind);`. In `updateDeposit` beide Vorkommen von `CONFIG.depositEveryMs` durch `depositEveryMsOf(p)` ersetzen und im Doc-Kommentar „alle CONFIG.depositEveryMs eine Flasche“ durch „alle depositEveryMsOf(p) eine Flasche“.

- [ ] **Step 4: Run, PASS**

Run: `cd packages/core; npx vitest run; npx tsc --noEmit`
Expected: PASS, keine Typfehler.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/economy.ts packages/core/test/economy.test.ts
git commit -m "feat(core): Kundenkarte deposits faster, Kundenkarte+ adds 10 % per bottle

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Kern – Essensfunde beim Suchen

**Files:**
- Create: `packages/core/src/food.ts`
- Modify: `packages/core/src/index.ts` (Export), `packages/core/src/search.ts` (Abschluss der Suche)
- Modify: `packages/core/test/helpers.ts` (`seedWhere`)
- Create: `packages/core/test/food.test.ts`

**Interfaces:**
- Consumes: `Player.lastFood`, `FoodFind` (Task 1), `CONFIG.health.food`, `nextRandom`, `randInt`.
- Produces: `FOOD_TEXTS`, `FOOD_FULL_SUFFIX`, `foodText`, `rollFood` (Namenstabelle); `seedWhere` in den Testhelfern.

- [ ] **Step 1: Testhelfer**

An `packages/core/test/helpers.ts` anhängen und oben `import { nextRandom } from '../src/rng';` ergänzen:

```ts
/** Erster rngState ab `from`, dessen nächster Wurf `pred` erfüllt (für Tests mit Zufall, etwa Essensfunde). */
export function seedWhere(pred: (r: number) => boolean, from = 1): number {
  for (let s = from; s < from + 1_000_000; s++) if (pred(nextRandom({ rngState: s }))) return s;
  throw new Error('no seed found');
}
```

- [ ] **Step 2: Failing tests**

`packages/core/test/food.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { FOOD_FULL_SUFFIX, FOOD_TEXTS, foodText, rollFood } from '../src/food';
import { nextRandom } from '../src/rng';
import type { GameState } from '../src/types';
import { input, newGame, runFor, SEARCH_ROWS, seedWhere, setSpot } from './helpers';

function hungry(): GameState {
  const s = newGame(SEARCH_ROWS);
  s.players.p1.health = 50;
  return s;
}

/** rngState nach `n` Würfen ab `seed` */
function after(seed: number, n: number): number {
  const r = { rngState: seed };
  for (let i = 0; i < n; i++) nextRandom(r);
  return r.rngState;
}

describe('food texts', () => {
  it('has the texts of the spec per spot type', () => {
    expect(FOOD_TEXTS).toEqual({
      bin: ['Cheeseburger im Müll gefunden! +30 Leben', 'Halber Döner aus der Tonne. Schmeckt erstaunlich okay.'],
      bench: ['Angebissene Currywurst auf der Bank. Egal, Hunger!'],
      bush: ['Kalte Pizza unterm Busch gefunden. Lecker!'],
      bus_stop: ['Vergessene Brezel an der Haltestelle. Noch knusprig.'],
      park: ['Halbes Eis im Gras. Noch nicht geschmolzen!'],
    });
  });

  it('appends the full suffix and falls back to the first text', () => {
    expect(FOOD_FULL_SUFFIX).toBe(' Aber du bist schon satt.');
    expect(foodText({ spot: 'park', text: 0, full: true })).toBe('Halbes Eis im Gras. Noch nicht geschmolzen! Aber du bist schon satt.');
    expect(foodText({ spot: 'bin', text: 1, full: false })).toBe('Halber Döner aus der Tonne. Schmeckt erstaunlich okay.');
    expect(foodText({ spot: 'bench', text: 7, full: false })).toBe('Angebissene Currywurst auf der Bank. Egal, Hunger!');
  });
});

describe('rollFood', () => {
  it('finds food below the chance, heals 30 and counts the find', () => {
    const s = hungry();
    s.rngState = seedWhere((r) => r < CONFIG.health.food.chance.bench);
    expect(rollFood(s, s.players.p1, 'bench')).toBe(true);
    expect(s.players.p1.health).toBe(80);
    expect(s.players.p1.lastFood).toEqual({ n: 1, spot: 'bench', text: 0, full: false });
  });

  it('finds nothing at or above the chance and draws exactly one number', () => {
    const s = hungry();
    const seed = seedWhere((r) => r >= CONFIG.health.food.chance.bin);
    s.rngState = seed;
    expect(rollFood(s, s.players.p1, 'bin')).toBe(false);
    expect(s.players.p1.health).toBe(50);
    expect(s.players.p1.lastFood).toBeNull();
    expect(s.rngState).toBe(after(seed, 1));
  });

  it('uses 10 % for bins and 4 % elsewhere', () => {
    const seed = seedWhere((r) => r >= 0.04 && r < 0.1);
    const bin = hungry();
    bin.rngState = seed;
    expect(rollFood(bin, bin.players.p1, 'bin')).toBe(true);
    for (const type of ['bench', 'bush', 'bus_stop', 'park'] as const) {
      const s = hungry();
      s.rngState = seed;
      expect(rollFood(s, s.players.p1, type)).toBe(false);
    }
  });

  it('draws a second number for the text only for a bin find', () => {
    const seed = seedWhere((r) => r < 0.04);
    const bin = hungry();
    bin.rngState = seed;
    rollFood(bin, bin.players.p1, 'bin');
    expect([0, 1]).toContain(bin.players.p1.lastFood!.text);
    expect(bin.rngState).toBe(after(seed, 2));
    const park = hungry();
    park.rngState = seed;
    rollFood(park, park.players.p1, 'park');
    expect(park.rngState).toBe(after(seed, 1));
  });

  it('caps the health, marks a full player and uses the food anyway', () => {
    const seed = seedWhere((r) => r < 0.04);
    for (const [health, full, healed] of [[100, true, 100], [99.5, true, 100], [99, false, 100], [80, false, 100]] as const) {
      const s = hungry();
      s.players.p1.health = health;
      s.rngState = seed;
      expect(rollFood(s, s.players.p1, 'bush')).toBe(true);
      expect(s.players.p1.health).toBe(healed);
      expect(s.players.p1.lastFood!.full).toBe(full);
    }
  });

  it('counts the finds of the round', () => {
    const s = hungry();
    const seed = seedWhere((r) => r < 0.04);
    s.rngState = seed;
    rollFood(s, s.players.p1, 'park');
    s.rngState = seed;
    rollFood(s, s.players.p1, 'park');
    expect(s.players.p1.lastFood!.n).toBe(2);
  });
});

describe('food while searching', () => {
  const HOLD = { p1: input({ action: true }) };

  it('rolls when a search completes and leaves the bottles alone', () => {
    const s = hungry();
    setSpot(s, 0, { plastic: 2 });
    runFor(s, HOLD, CONFIG.searchMs - 100);
    expect(s.players.p1.lastFood).toBeNull();
    s.rngState = seedWhere((r) => r < CONFIG.health.food.chance[s.spots[0].type]);
    runFor(s, HOLD, 200);
    expect(s.players.p1.bottles.plastic).toBe(2);
    expect(s.players.p1.lastFood).toMatchObject({ n: 1, spot: s.spots[0].type });
    expect(s.players.p1.health).toBeGreaterThan(79);
    expect(s.players.p1.health).toBeLessThan(80);
  });

  it('finds nothing when the roll misses', () => {
    const s = hungry();
    setSpot(s, 0, { plastic: 2 });
    runFor(s, HOLD, CONFIG.searchMs - 100);
    s.rngState = seedWhere((r) => r >= 0.1);
    runFor(s, HOLD, 200);
    expect(s.players.p1.bottles.plastic).toBe(2);
    expect(s.players.p1.lastFood).toBeNull();
    expect(s.players.p1.health).toBeLessThan(50);
  });
});
```

- [ ] **Step 3: Run, FAIL**

Run: `cd packages/core; npx vitest run test/food.test.ts`
Expected: FAIL (`../src/food` fehlt).

- [ ] **Step 4: `food.ts`**

`packages/core/src/food.ts`:

```ts
import { CONFIG } from './config';
import { nextRandom, randInt } from './rng';
import type { FoodFind, GameState, Player, SpotType } from './types';

/** Texte zum Essensfund je Spot-Art (Spec §5.3); FoodFind.text ist der Index. */
export const FOOD_TEXTS: Record<SpotType, readonly string[]> = {
  bin: ['Cheeseburger im Müll gefunden! +30 Leben', 'Halber Döner aus der Tonne. Schmeckt erstaunlich okay.'],
  bench: ['Angebissene Currywurst auf der Bank. Egal, Hunger!'],
  bush: ['Kalte Pizza unterm Busch gefunden. Lecker!'],
  bus_stop: ['Vergessene Brezel an der Haltestelle. Noch knusprig.'],
  park: ['Halbes Eis im Gras. Noch nicht geschmolzen!'],
};

/** Wird angehängt, wenn das Leben schon voll war (Spec §5.4) */
export const FOOD_FULL_SUFFIX = ' Aber du bist schon satt.';

/** Hinweistext zu einem Fund; ein unbekannter Index fällt auf den ersten Text zurück. */
export function foodText(f: Pick<FoodFind, 'spot' | 'text' | 'full'>): string {
  const texts = FOOD_TEXTS[f.spot] ?? [];
  const base = texts[f.text] ?? texts[0] ?? '';
  return f.full ? base + FOOD_FULL_SUFFIX : base;
}

/**
 * Essensfund beim Abschluss einer Suche (Spec §5): genau ein Wurf gegen die Chance der Spot-Art,
 * bei einem Fund mit mehreren Texten ein zweiter für den Text. Heilt sofort bis zum Maximum; war das Leben
 * schon voll (aufgerundet wie im HUD), ist das Essen trotzdem weg. Gibt true zurück bei einem Fund.
 */
export function rollFood(state: GameState, p: Player, spot: SpotType): boolean {
  if (nextRandom(state) >= CONFIG.health.food.chance[spot]) return false;
  const count = FOOD_TEXTS[spot].length;
  const text = count > 1 ? randInt(state, 0, count - 1) : 0;
  const full = Math.ceil(p.health) >= CONFIG.health.max;
  p.health = Math.min(CONFIG.health.max, p.health + CONFIG.health.food.heal);
  p.lastFood = { n: (p.lastFood?.n ?? 0) + 1, spot, text, full };
  return true;
}
```

In `packages/core/src/index.ts` hinter `export * from './search';` die Zeile `export * from './food';` einfügen.

In `packages/core/src/search.ts` oben `import { rollFood } from './food';` ergänzen und den Abschluss in `updateSearch` (Zeilen 57 bis 61) ersetzen:

```ts
  if (p.searchProgressMs >= searchMsOf(p)) {
    transferBottles(spot.contents, p.bottles, capacityOf(p));
    if (totalBottles(spot.contents) === 0) spot.refillInMs = spotRefillMs(state, spot);
    // Genau ein Wurf je abgeschlossener Suche: vielleicht liegt auch etwas zu essen dort
    rollFood(state, p, spot.type);
    cancelSearch(p);
  }
```

- [ ] **Step 5: Run food tests, PASS**

Run: `cd packages/core; npx vitest run test/food.test.ts`
Expected: PASS.

- [ ] **Step 6: Ganze Kernsuite (Zufallsfolge hat sich verschoben)**

Run: `cd packages/core; npx vitest run; npx tsc --noEmit`
Expected: PASS. Bricht ein Test, weil er nach einer abgeschlossenen Suche eine bestimmte Zufallsfolge oder ein bestimmtes Leben erwartet (etwa NPC-Spawnzeit, Zonenzeit, `health`), dann in diesem Test direkt vor dem Abschluss der Suche `s.rngState = seedWhere((r) => r >= 0.1);` setzen (kein Fund), statt die Erwartung umzuschreiben. Determinismus-Vergleiche (zwei Läufe mit gleichem Seed) bleiben unverändert.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/food.ts packages/core/src/index.ts packages/core/src/search.ts packages/core/test/helpers.ts packages/core/test/food.test.ts
git commit -m "feat(core): find food while searching (10 % in bins, 4 % elsewhere)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

Falls Step 6 weitere Testdateien angepasst hat, diese mit explizitem Pfad in dasselbe `git add` aufnehmen.

---

### Task 4: Server – Mietsachen am Rundenende, Tests auf neue Artikel

**Files:**
- Modify: `packages/server/src/room.ts:1-40` (Import), `:123` (Kommentar), `:613-619` (`endRound`)
- Test: `packages/server/test/roomSeries.test.ts`, `handler.test.ts`, `server.test.ts`, `roomFinal.test.ts`

**Interfaces:**
- Consumes: `progressAfterRound(p: Progress): Progress` (Task 1).
- Produces: `Room.endRound` speichert `progressAfterRound(player)`.

- [ ] **Step 1: Failing test**

In `packages/server/test/roomSeries.test.ts` im `describe`-Block mit `inShop()` (hinter `carries bought items into the next round`) einfügen:

```ts
  it('rents the cart for exactly one round', () => {
    const { room, members, conns, endRound } = inShop();
    expect(room.shopBuy(members[0], 'bags', 'cart', 1).ok).toBe(true);
    expect(conns[0].last('shopState').you.items.cart).toBe(1);
    for (const m of members) room.setReady(m, true);
    expect(room.state!.players.p1.items.cart).toBe(1);
    room.state!.players.p1.items.bag = 2; // bleibt
    endRound();
    expect(room.progress.get('p1')!.items).toMatchObject({ cart: 0, bag: 2 });
    expect(conns[0].last('shopState').you.items).toMatchObject({ cart: 0, bag: 2 });
    for (const m of members) room.setReady(m, true);
    expect(room.state!.players.p1.items.cart).toBe(0);
  });
```

`inShop()` gibt bisher `series()` zurück, das `endRound` enthält; falls `inShop` das Ergebnis nicht durchreicht, `return s;` ist schon da (Zeile 210), `endRound` steckt in `s`.

- [ ] **Step 2: Run, FAIL**

Run: `cd packages/server; npx vitest run test/roomSeries.test.ts -t "rents the cart"`
Expected: FAIL (`cart` bleibt 1 nach `endRound`) bzw. Typfehler im Test.

- [ ] **Step 3: Implementierung**

In `packages/server/src/room.ts` im Import aus `@pfandraiders/core` (Zeilen 1 bis 40) `progressAfterRound,` neben `progressOf,` ergänzen. Zeile 123: Kommentar `/** Fortschritt der Serie je Spieler-id (Geld, Besitz, Gesamtverdienst); leer in der Lobby */`. In `endRound` die Zeile `if (p) this.progress.set(m.id, progressOf(p));` ersetzen durch:

```ts
      // Mietsachen (Einkaufswagen) gelten nur für eine Runde
      if (p) this.progress.set(m.id, progressAfterRound(p));
```

Den Doc-Kommentar von `endRound` ergänzen: `/** Runde vorbei: Fortschritt ohne Mietsachen sichern, dann Shop-Phase oder (nach der letzten Runde) Endwertung. */`.

- [ ] **Step 4: Bestehende Servertests umstellen**

`packages/server/test/roomSeries.test.ts`:
- Zeile 53: `you: { money: 0, items: { bag: 0, cart: 0 } }`
- Im Test `keeps money, levels and inventory…` die Zeilen 63 bis 65 ersetzen durch `p.items.bag = 2;`, `p.items.flashlight = 2;`, `p.items.dog_treat = 3;` und die Erwartung Zeilen 74 bis 76 durch `items: { bag: 2, flashlight: 2, dog_treat: 3 },`; Titel `'keeps money, items and earnings into the next round and resets the rest'`.
- Zeilen 215 bis 239: jedes `'food'` durch `'dog_treat'` und jedes `inventory: { food: N }` durch `items: { dog_treat: N }` ersetzen.
- Test `carries bought items into the next round` (Zeilen 242 bis 248):

```ts
  it('carries bought items into the next round', () => {
    const { room, members } = inShop();
    room.shopBuy(members[0], 'upgrades', 'card', 1);
    room.shopBuy(members[0], 'bags', 'bag', 1);
    room.shopBuy(members[0], 'bags', 'bag', 1);
    for (const m of members) room.setReady(m, true);
    expect(room.state!.players.p1).toMatchObject({ money: 400, items: { card: 1, bag: 2 } });
  });
```

`packages/server/test/handler.test.ts`: Zeile 17 `input: { moveX: 1, moveY: 0, action: false, steal: false, attack: false }`; Zeilen 243 bis 252 `'food'` → `'dog_treat'`, Zeile 251 `expect(room.progress.get('p1')!.items.dog_treat).toBe(2);`.

`packages/server/test/server.test.ts`: in Zeilen 90, 109, 250 und 254 `, eat: false` aus dem Input streichen. Zeilen 123 bis 129:

```ts
    room.state!.players.p1.items.dog_treat = 5;
    const seenByB = await b.until('snap', (m) => m.snap.players.p1.bottles.plastic === 1);
    expect(seenByB.snap.players.p1.money).toBe(0);
    expect(seenByB.snap.players.p1.items.dog_treat).toBe(0);
    expect(seenByB.snap.rngState).toBe(0);
    const seenByA = await a.until('snap', (m) => m.snap.players.p1.money === 4242);
    expect(seenByA.snap.players.p1.items.dog_treat).toBe(5);
```

`packages/server/test/roomFinal.test.ts`: Zeile 124 `'food'` → `'dog_treat'`.

- [ ] **Step 5: Server grün**

Run: `cd packages/server; npx vitest run; npx tsc --noEmit`
Expected: PASS, keine Typfehler.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/room.ts packages/server/test/roomSeries.test.ts packages/server/test/handler.test.ts packages/server/test/server.test.ts packages/server/test/roomFinal.test.ts
git commit -m "feat(server): rented cart is gone after its round; tests use the new items

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Client – Eingabe ohne Essen-Taste

**Files:**
- Modify: `packages/client/src/input.ts`, `sources.ts`, `devices.ts`, `menuModel.ts:39`, `online.ts:58-67`
- Test: `packages/client/test/input.test.ts`, `sources.test.ts`, `menuModel.test.ts`, `shopNav.test.ts`, `online.test.ts`, `connection.test.ts`

**Interfaces:**
- Consumes: `Input` ohne `eat` (Task 1).
- Produces: `KeyState` (ohne `eat`), `KeyLabels = { action: string; steal: string; attack: string }`, `KeyboardLayout` ohne `eat`, `padToHeld` ohne `eat`.

- [ ] **Step 1: Tests anpassen (failing)**

`packages/client/test/input.test.ts`: in `NONE` die Zeile `eat: false,` löschen; den Test in Zeilen 28 bis 38 ersetzen:

```ts
  it('passes action, steal and attack through as held keys', () => {
    expect(buildInput({ ...NONE, action: true, steal: true, attack: true })).toEqual({
      moveX: 0,
      moveY: 0,
      action: true,
      steal: true,
      attack: true,
    });
    expect(buildInput(NONE)).toEqual({ moveX: 0, moveY: 0, action: false, steal: false, attack: false });
  });
```

`packages/client/test/sources.test.ts` Zeilen 26 bis 35:

```ts
  it('maps buttons: A action, B steal, X attack; Y and the shoulders do nothing', () => {
    expect(padToHeld({ ...IDLE, a: true })).toMatchObject({ action: true, attack: false });
    expect(padToHeld({ ...IDLE, x: true })).toMatchObject({ attack: true });
    expect(padToHeld({ ...IDLE, y: true })).toEqual(padToHeld(IDLE));
    expect(padToHeld({ ...IDLE, l1: true, r1: true })).toEqual(padToHeld(IDLE));
  });

  it('labels the pad buttons like padToHeld maps them', () => {
    expect(PAD_LABELS).toEqual({ action: 'A', steal: 'B', attack: 'X' });
  });
```

`packages/client/test/menuModel.test.ts` Zeilen 71 bis 75:

```ts
  it('names steal and attack and no buy or eat keys', () => {
    expect(lines[0]).toBe('Tastatur 1 (WASD, E): Aktion E, Ausrauben Q, Schlagen F');
    expect(lines[1]).toBe('Tastatur 2 (Pfeile, Enter): Aktion Enter, Ausrauben /, Schlagen .');
    expect(lines[2]).toBe('Gamepad (Stick/Steuerkreuz): Aktion A, Ausrauben B, Schlagen X');
  });
```

`packages/client/test/shopNav.test.ts`: Zeile 5 `const NONE: KeyState = { left: false, right: false, up: false, down: false, action: false, steal: false, attack: false };`; Zeilen 42 bis 45: Titel `'never uses steal or attack'`, Aufruf `nav.update(k({ steal: true, attack: true }), 16)`.

`packages/client/test/online.test.ts` Zeilen 230 bis 243:

```ts
  it('sends a changed attack or steal key at once, not only with the heartbeat', () => {
    const { socket, conn } = setup();
    socket.receive(startMessage());
    conn.update(10);
    const before = socket.sent.filter((m) => m.t === 'input').length;
    conn.setInput('p1', { ...NO_INPUT, attack: true });
    conn.update(10);
    conn.setInput('p1', { ...NO_INPUT, steal: true });
    conn.update(10);
    const inputs = socket.sent.filter((m) => m.t === 'input') as Extract<ClientMessage, { t: 'input' }>[];
    expect(inputs.length).toBe(before + 2);
    expect(inputs.at(-2)!.input.attack).toBe(true);
    expect(inputs.at(-1)!.input.steal).toBe(true);
  });
```

Und Zeilen 739 und 742: `'food'` → `'dog_treat'`.

`packages/client/test/connection.test.ts` Zeilen 29 bis 37:

```ts
  it('passes the attack key to the step', () => {
    const state = soloGame();
    const conn = new LocalConnection(state, ['p1']);
    conn.setInput('p1', { ...NO_INPUT, attack: true });
    conn.update(LOCAL_STEP_MS);
    expect(conn.getState().players.p1.attackCooldownMs).toBeGreaterThan(0);
  });
```

- [ ] **Step 2: Run, FAIL**

Run: `cd packages/client; npx vitest run test/input.test.ts test/sources.test.ts test/menuModel.test.ts`
Expected: FAIL (`eat` ist noch da).

- [ ] **Step 3: Implementierung**

`packages/client/src/input.ts`: Kommentar Zeile 3 `/** Tastenzustand eines Geräts in einem Frame. Alles gehalten; Flanken (Ausrauben, Schlagen) erkennt der Kern. */`; Zeilen 14 bis 15 (`eat`) löschen; in `buildInput` die Zeile `eat: k.eat,` löschen.

`packages/client/src/sources.ts`: in `KeyLabels` die Zeile `eat: string;` löschen; `export const PAD_LABELS: KeyLabels = { action: 'A', steal: 'B', attack: 'X' };`; Kommentar über `padToHeld`: `/** A = Aktion, B = Ausrauben, X = Schlagen. Stick und Steuerkreuz laufen. Y und Schultertasten sind frei. */`; in `padToHeld` die Zeile `eat: s.y,` löschen. `PadSnapshot.y` bleibt (Gamepad meldet den Knopf weiter; PR 2 belegt ihn).

`packages/client/src/devices.ts`: in `KeyboardLayout` `eat: string;` löschen; in beiden Layouts `eat: 'C',` bzw. `eat: 'COMMA',` löschen und die Labels auf `{ action: 'E', steal: 'Q', attack: 'F' }` bzw. `{ action: 'Enter', steal: '/', attack: '.' }` kürzen; in `KeyboardSource` `layout.eat` aus `names` und `eat: k[l.eat].isDown,` aus `read()` löschen.

`packages/client/src/menuModel.ts` Zeile 39:

```ts
  const fmt = (l: KeyLabels): string => `Aktion ${l.action}, Ausrauben ${l.steal}, Schlagen ${l.attack}`;
```

`packages/client/src/online.ts` `sameInput` (Zeilen 58 bis 67):

```ts
function sameInput(a: Input, b: Input): boolean {
  return a.moveX === b.moveX && a.moveY === b.moveY && a.action === b.action && a.steal === b.steal && a.attack === b.attack;
}
```

- [ ] **Step 4: Run, PASS**

Run: `cd packages/client; npx vitest run test/input.test.ts test/sources.test.ts test/menuModel.test.ts test/shopNav.test.ts test/online.test.ts test/connection.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/input.ts packages/client/src/sources.ts packages/client/src/devices.ts packages/client/src/menuModel.ts packages/client/src/online.ts packages/client/test/input.test.ts packages/client/test/sources.test.ts packages/client/test/menuModel.test.ts packages/client/test/shopNav.test.ts packages/client/test/online.test.ts packages/client/test/connection.test.ts
git commit -m "feat(client): remove the eat key from keyboard, gamepad and controls

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Client – Prüfungen und lokaler Shop

**Files:**
- Modify: `packages/client/src/snapshotGuard.ts:27`, `packages/client/src/shopGuard.ts:1-29`, `packages/client/src/localShop.ts:1, 19-27`
- Test: `packages/client/test/snapshotGuard.test.ts`, `shopGuard.test.ts`, `localShop.test.ts`

**Interfaces:**
- Consumes: `SHOP_ITEM_IDS`, `maxOf`, `noItems`, `progressAfterRound`, `Progress` (Task 1).
- Produces: `parseProgress(x: unknown): Progress | null` mit neuer Form; `isValidSnapshot` mit `items`; `LocalShop.fromState` ohne Mietsachen.

- [ ] **Step 1: Failing tests**

An `packages/client/test/snapshotGuard.test.ts` anhängen:

```ts
describe('isValidSnapshot and the player shape', () => {
  it('accepts a real projected snapshot with items', () => {
    const state = createGame(1, CITY_MAP, ['p1', 'p2']);
    state.players.p1.items.cart = 1;
    state.players.p1.lastFood = { n: 1, spot: 'bin', text: 0, full: false };
    const s = JSON.parse(JSON.stringify(projectSnapshot(state, 'p1')));
    expect(isValidSnapshot(s)).toBe(true);
    expect(s.players.p2.items.cart).toBe(0);
  });

  it('rejects a player without items', () => {
    const s = snap();
    delete (s.players as Record<string, Record<string, unknown>>).p2.items;
    expect(isValidSnapshot(s)).toBe(false);
  });
});
```

`packages/client/test/shopGuard.test.ts`, `describe('parseProgress')` ersetzen:

```ts
describe('parseProgress', () => {
  it('accepts a full progress and copies it', () => {
    const p = { ...freshProgress(), money: 120, earnedTotal: 50 };
    p.items = { bag: 4, backpack: 2, cart: 1, flashlight: 3, card: 1, card_plus: 1, punch: 3, dog_treat: 99 };
    const out = parseProgress(JSON.parse(JSON.stringify(p)));
    expect(out).toEqual(p);
    expect(out!.items).not.toBe(p.items);
  });

  it('ignores unknown keys in items', () => {
    const p = JSON.parse(JSON.stringify(freshProgress()));
    p.items.food = 3;
    expect(parseProgress(p)).toEqual(freshProgress());
  });

  it('rejects broken values', () => {
    const ok = freshProgress();
    const bad: unknown[] = [
      null,
      [],
      { ...ok, money: -1 },
      { ...ok, money: 1.5 },
      { ...ok, items: null },
      { ...ok, items: { ...ok.items, bag: 5 } },
      { ...ok, items: { ...ok.items, cart: 2 } },
      { ...ok, items: { ...ok.items, flashlight: 4 } },
      { ...ok, items: { ...ok.items, dog_treat: 100 } },
      { ...ok, items: { ...ok.items, card: -1 } },
      { ...ok, items: { bag: 0 } },
      { ...ok, earnedTotal: Number.NaN },
    ];
    for (const b of bad) expect(parseProgress(b)).toBeNull();
  });
});
```

`packages/client/test/localShop.test.ts`: die Tests in Zeilen 6 bis 24 ersetzen:

```ts
  it('takes the progress of each local player from the ended round', () => {
    const s = createGame(1, CITY_MAP, ['p1', 'p2']);
    s.players.p1.money = 500;
    s.players.p1.earnedTotal = 500;
    s.players.p2.items.dog_treat = 2;
    const prog = LocalShop.fromState(s, ['p1', 'p2']);
    expect(prog.p1).toMatchObject({ money: 500, earnedTotal: 500 });
    expect(prog.p2.items.dog_treat).toBe(2);
    s.players.p2.items.dog_treat = 0;
    expect(prog.p2.items.dog_treat).toBe(2);
  });

  it('drops the rented cart after the round', () => {
    const s = createGame(1, CITY_MAP, ['p1']);
    s.players.p1.items.cart = 1;
    s.players.p1.items.bag = 3;
    const prog = LocalShop.fromState(s, ['p1']);
    expect(prog.p1.items).toMatchObject({ cart: 0, bag: 3 });
  });

  it('buys per player with the core rules', () => {
    const shop = new LocalShop(['p1', 'p2'], { p1: { ...freshProgress(), money: 300 } });
    expect(shop.buy('p1', 'defense', 'dog_treat', 3)).toEqual({ ok: true, cost: 300 });
    expect(shop.progress('p1').items.dog_treat).toBe(3);
    expect(shop.buy('p2', 'defense', 'dog_treat', 1)).toEqual({ ok: false, reason: 'no_money' });
    expect(shop.buy('p1', 'bags', 'cart', 1)).toEqual({ ok: false, reason: 'no_money' });
  });
```

und in Zeile 48 `'food'` → `'dog_treat'`.

- [ ] **Step 2: Run, FAIL**

Run: `cd packages/client; npx vitest run test/snapshotGuard.test.ts test/shopGuard.test.ts test/localShop.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementierung**

`packages/client/src/snapshotGuard.ts` Zeile 27 ersetzen:

```ts
    if (!isObj(p.items)) return false;
```

`packages/client/src/shopGuard.ts` Zeilen 1 bis 29 ersetzen:

```ts
import { maxOf, noItems, SHOP_ITEM_IDS } from '@pfandraiders/core';
import type { Progress, RankEntry } from '@pfandraiders/core';

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function nonNegInt(x: unknown): x is number {
  return typeof x === 'number' && Number.isInteger(x) && x >= 0;
}

/**
 * Prüft den eigenen Shop-Stand vom Server; null = verwerfen (alter Stand bleibt).
 * items braucht jede bekannte Kennung als ganze Zahl von 0 bis maxOf; unbekannte Schlüssel werden nicht übernommen.
 */
export function parseProgress(x: unknown): Progress | null {
  if (!isObj(x)) return null;
  const { money, items, earnedTotal } = x;
  if (!nonNegInt(money) || !nonNegInt(earnedTotal) || !isObj(items)) return null;
  const out = noItems();
  for (const id of SHOP_ITEM_IDS) {
    const v = items[id];
    if (!nonNegInt(v) || v > maxOf(id)) return null;
    out[id] = v;
  }
  return { money, items: out, earnedTotal };
}
```

`packages/client/src/localShop.ts`: Zeile 1 `import { freshProgress, progressAfterRound, progressOf, shopBuy } from '@pfandraiders/core';`; `fromState` (Zeilen 19 bis 27):

```ts
  /** Fortschritt aller lokalen Spieler aus dem Zustand am Rundenende (tiefe Kopie, ohne Mietsachen). */
  static fromState(state: GameState, ids: string[]): Record<string, Progress> {
    const out: Record<string, Progress> = {};
    for (const id of ids) {
      const p = state.players[id];
      out[id] = p ? progressAfterRound(p) : freshProgress();
    }
    return out;
  }
```

- [ ] **Step 4: Run, PASS**

Run: `cd packages/client; npx vitest run test/snapshotGuard.test.ts test/shopGuard.test.ts test/localShop.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/snapshotGuard.ts packages/client/src/shopGuard.ts packages/client/src/localShop.ts packages/client/test/snapshotGuard.test.ts packages/client/test/shopGuard.test.ts packages/client/test/localShop.test.ts
git commit -m "feat(client): guards accept the new player and progress shape; local cart rental

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Client – Shop-Zeilen

**Files:**
- Modify: `packages/client/src/shopModel.ts:1-60` (Imports, `ShopRowView`, `effectText`), `:96-100` (`maxQty`), `:192-218` (`itemRow`)
- Modify: `packages/client/src/scenes/ShopScene.ts:28-31`, `:305-309`
- Test: `packages/client/test/shopModel.test.ts`

**Interfaces:**
- Consumes: `checkShopBuy`, `maxOf`, `ownedOf`, `CONFIG.shop.items`, `CONFIG.carry`, `CONFIG.shop.cardPlusBonusPct` (Task 1).
- Produces: `ShopRowView.state: 'normal' | 'grey'`; Zeilentexte wie unten.

- [ ] **Step 1: Failing tests**

In `packages/client/test/shopModel.test.ts`:
- Zeile 17: `expect(m.categories().map((c) => c.name)).toEqual(['Taschen', 'Upgrades', 'Waffen', 'Verteidigung']);`
- Zeile 25: `expect(m.category).toBe('weapons');`
- Test `moves up and down…` (Zeilen 33 bis 42): Kommentar `// Upgrades: Taschenlampe, Kundenkarte, Kundenkarte+, Bereit`, die Erwartung `expect(m.rowCount()).toBe(4);` bleibt.
- Test `changes the quantity with left and right on a consumable row…` (Zeilen 51 bis 66, bis zur schließenden Klammer des Tests) ersetzen durch die zwei Tests:

```ts
  it('changes the quantity with left and right on a stack row, otherwise the category', () => {
    const m = new ShopModel();
    const p = rich();
    m.selectCategory(3); // Verteidigung: Leckerli
    m.move('right', p);
    m.move('right', p);
    expect(m.qty).toBe(3);
    m.move('left', p);
    expect(m.qty).toBe(2);
    expect(m.activate(p)).toEqual({ kind: 'buy', category: 'defense', item: 'dog_treat', qty: 2 });
  });

  it('keeps the quantity at 1 on bag rows, so left and right switch the category', () => {
    const m = new ShopModel();
    const p = rich();
    m.selectRow(1); // Rucksack
    m.changeQty(3, p);
    expect(m.qty).toBe(1);
    expect(m.maxQty(p)).toBe(1);
    m.move('right', p);
    expect(m.category).toBe('upgrades');
  });
```

- Test `has an extra row to end the series only when allowed` (Zeilen 44 bis 48): Taschen hat jetzt drei Einträge, also `['item', 'item', 'item', 'ready', 'end']` bzw. `['item', 'item', 'item', 'ready']`.
- Test `never goes below 1 or above the free stock (max 99)` (Zeilen 68 bis 81): `p.inventory.food = 97;` → `p.items.dog_treat = 97;` und die Zeile `m.selectRow(1);` löschen (Leckerli ist jetzt Zeile 0 der Verteidigung).
- Test `buys the selected entry with the chosen quantity…` (ab Zeile 94): die Zeile `m.selectRow(1);` löschen und `item: 'food'` → `item: 'dog_treat'`.
- Test `reports why an entry cannot be bought…` (ab Zeile 104): die drei Zeilen mit `selectCategory(2)`, `selectRow(2)` und `'unavailable'` ersetzen durch:

```ts
    m.selectCategory(1);
    m.selectRow(2); // Kundenkarte+ ohne Kundenkarte
    expect(m.activate(rich())).toEqual({ kind: 'refused', reason: 'requires' });
```

- Test `toggles ready on the Bereit row and ends the series on its row` (ab Zeile 112): `m.selectRow(1)` → `m.selectRow(3)`, `m.selectRow(2)` → `m.selectRow(4)`.
- Test `offers a buy button action only on an entry row` (ab Zeile 123): `m.selectRow(1)` → `m.selectRow(3)`.
- Den Block `describe('ShopModel rows', …)` (ab Zeile 141 bis vor `labels Bereit by state`) ersetzen durch:

```ts
describe('ShopModel rows', () => {
  it('shows the three bag types with capacity and limit', () => {
    const m = new ShopModel();
    const p = rich();
    p.items.bag = 1;
    const rows = m.rows(p);
    expect(rows[0]).toMatchObject({ name: 'Tasche', detail: '+2 Plätze  (hast 1/4)', price: '1,50 €', state: 'normal', selected: true });
    expect(rows[1]).toMatchObject({ name: 'Rucksack', detail: '+5 Plätze  (hast 0/2)', price: '4,00 €', state: 'normal' });
    expect(rows[2]).toMatchObject({ name: 'Einkaufswagen', detail: 'mieten: +10 Plätze, 30 % langsamer, 1 Runde', price: '1,00 €' });
  });

  it('greys a full bag stack and a rented cart', () => {
    const m = new ShopModel();
    const p = rich();
    p.items.bag = 4;
    p.items.cart = 1;
    const rows = m.rows(p);
    expect(rows[0]).toMatchObject({ detail: '+2 Plätze  (hast 4/4)', price: '', state: 'grey' });
    expect(rows[2]).toMatchObject({ detail: 'gemietet für die nächste Runde', price: '', state: 'grey' });
  });

  it('greys a row without money', () => {
    const m = new ShopModel();
    expect(m.rows(rich(100))[0]).toMatchObject({ price: '1,50 €', state: 'grey' });
  });

  it('describes the flashlight levels and the customer cards', () => {
    const m = new ShopModel();
    const p = rich();
    m.selectCategory(1);
    let rows = m.rows(p);
    expect(rows[0]).toMatchObject({ name: 'Taschenlampe', detail: 'Stufe 0 → 1: −15 % Suchzeit', price: '2,00 €' });
    expect(rows[1]).toMatchObject({ name: 'Kundenkarte', detail: 'Abgabe alle 0,10 s statt 0,15 s', price: '3,00 €', state: 'normal' });
    expect(rows[2]).toMatchObject({ name: 'Kundenkarte+', detail: 'braucht Kundenkarte', price: '6,00 €', state: 'grey' });
    p.items.flashlight = 3;
    p.items.card = 1;
    rows = m.rows(p);
    expect(rows[0]).toMatchObject({ detail: 'Stufe 3 (max)', price: '', state: 'grey' });
    expect(rows[1]).toMatchObject({ detail: 'vorhanden', price: '', state: 'grey' });
    expect(rows[2]).toMatchObject({ detail: '+10 % Pfand je Flasche', state: 'normal' });
  });

  it('keeps the punch levels under Waffen', () => {
    const m = new ShopModel();
    m.selectCategory(2);
    expect(m.rows(rich())[0]).toMatchObject({ name: 'Stärkerer Schlag', detail: 'Stufe 0 → 1: +5 Schaden', price: '2,50 €' });
  });

  it('shows quantity and total only on the selected treat row', () => {
    const m = new ShopModel();
    const p = rich();
    p.items.dog_treat = 4;
    m.selectCategory(3);
    m.changeQty(2, p);
    expect(m.rows(p)[0]).toMatchObject({ name: 'Leckerli', detail: '◄ 3 ►  (hast 4)', price: '3,00 €' });
    m.selectRow(1);
    expect(m.rows(p)[0]).toMatchObject({ detail: '(hast 4)', price: '1,00 €' });
  });
```

(Der Test `labels Bereit by state` und das schließende `});` des Blocks bleiben.)

- [ ] **Step 2: Run, FAIL**

Run: `cd packages/client; npx vitest run test/shopModel.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementierung `shopModel.ts`**

Zeile 1: `import { checkShopBuy, CONFIG, maxOf, ownedOf, SHOP_CATEGORIES, SHOP_CATEGORY_NAMES, shopItemsOf } from '@pfandraiders/core';` bleibt. In `ShopRowView` die Zeile mit `state` ersetzen:

```ts
  /** grey = nicht kaufbar (Geld, Grenze, Voraussetzung, Besitz) */
  state: 'normal' | 'grey';
```

`effectText` (Zeilen 37 bis 53) ersetzen:

```ts
/** Wirkung einer Stufe als kurzer Text. */
function effectText(item: ShopItemId, level: number): string {
  const v = CONFIG.shop.items[item].values[level];
  switch (item) {
    case 'flashlight':
      return `−${Math.round((1 - v) * 100)} % Suchzeit`;
    case 'punch':
      return `+${v} Schaden`;
    default:
      return '';
  }
}

/** Sekunden mit zwei Nachkommastellen und Komma ("0,15"). */
function secs(ms: number): string {
  return (ms / 1000).toFixed(2).replace('.', ',');
}

/** Kurzbeschreibung eines Artikels ohne Stufen (vor Menge und Besitz). */
function infoText(item: ShopItemId): string {
  switch (item) {
    case 'bag':
      return `+${CONFIG.carry.perUnit.bag} Plätze`;
    case 'backpack':
      return `+${CONFIG.carry.perUnit.backpack} Plätze`;
    case 'cart':
      return `mieten: +${CONFIG.carry.perUnit.cart} Plätze, ${Math.round((1 - CONFIG.carry.cartSpeedMult) * 100)} % langsamer, 1 Runde`;
    case 'card':
      return `Abgabe alle ${secs(CONFIG.depositEveryMsCard)} s statt ${secs(CONFIG.depositEveryMs)} s`;
    case 'card_plus':
      return `+${CONFIG.shop.cardPlusBonusPct} % Pfand je Flasche`;
    default:
      return '';
  }
}
```

`maxQty` (Zeilen 97 bis 101):

```ts
  /** Größte wählbare Menge auf der aktuellen Zeile: freier Rest bis zur Grenze bei Stückware, sonst 1. */
  maxQty(p: Progress): number {
    const item = this.currentItem();
    if (!item || CONFIG.shop.items[item].kind !== 'stack') return 1;
    return Math.max(1, maxOf(item) - ownedOf(p, item));
  }
```

`itemRow` (Zeilen 193 bis 218) ersetzen:

```ts
  private itemRow(p: Progress, item: ShopItemId, selected: boolean): ShopRowView {
    const def = CONFIG.shop.items[item];
    const owned = ownedOf(p, item);
    const max = maxOf(item);
    const row: ShopRowView = { kind: 'item', item, name: def.name, detail: '', price: '', state: 'normal', selected };
    const info = infoText(item);
    if (def.kind === 'level') {
      if (owned >= max) return { ...row, detail: `Stufe ${max} (max)`, state: 'grey' };
      row.detail = `Stufe ${owned} → ${owned + 1}: ${effectText(item, owned + 1)}`;
    } else if (def.kind === 'once') {
      if (owned >= max) return { ...row, detail: def.perRound ? 'gemietet für die nächste Runde' : 'vorhanden', state: 'grey' };
      const missing = def.requires !== undefined && ownedOf(p, def.requires) === 0;
      row.detail = missing ? `braucht ${CONFIG.shop.items[def.requires!].name}` : info;
    } else if (def.kind === 'count') {
      // Tasche, Rucksack: je Kauf eins, ohne Mengenwahl
      row.detail = `${info}  (hast ${owned}/${max})`;
      if (owned >= max) return { ...row, state: 'grey' };
    } else {
      const qty = selected ? `◄ ${this.qty} ►  ` : '';
      row.detail = `${info ? `${info}  ` : ''}${qty}(hast ${owned})`;
    }
    const qty = selected && def.kind === 'stack' ? Math.min(this.qty, this.maxQty(p)) : 1;
    const check = checkShopBuy(p, def.category, item, qty);
    const cost = def.kind === 'level' ? def.prices[owned] : def.prices[0] * qty;
    row.price = formatMoney(cost);
    if (!check.ok) row.state = 'grey';
    return row;
  }
```

- [ ] **Step 4: `ShopScene.ts`**

Zeile 28: `const COLOR = { text: '#ffffff', grey: '#777777', selected: '#ffee58', message: '#ff8a80', hint: '#aaaaaa' };`. Zeilen 30 bis 31: `/** Höchstens so viele Zeilen hat eine Kategorie (bis 3 Einträge, Bereit, Serie beenden) */` und `const MAX_ROWS = 6;` bleibt. `rowColor` (Zeilen 305 bis 309):

```ts
function rowColor(r: ShopRowView): string {
  if (r.selected) return COLOR.selected;
  return r.state === 'grey' ? COLOR.grey : COLOR.text;
}
```

- [ ] **Step 5: Run, PASS**

Run: `cd packages/client; npx vitest run test/shopModel.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/shopModel.ts packages/client/src/scenes/ShopScene.ts packages/client/test/shopModel.test.ts
git commit -m "feat(client): shop rows for stacked bags, cart rental, flashlight and customer cards

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Client – Sounds und Essensfund-Hinweis

**Files:**
- Modify: `packages/client/src/soundEvents.ts:95-109` (Regeln `buy`, `hit`), `:185-201` (`snapshotForSound`), neue Funktion `detectFoodFinds`
- Modify: `packages/client/src/scenes/GameScene.ts:24` (Import), `:463-465` (Hinweise)
- Test: `packages/client/test/soundEvents.test.ts`

**Interfaces:**
- Consumes: `foodText` (Task 3), `Player.lastFood`, `Player.items`.
- Produces: `FoodNotice`, `detectFoodFinds(prev, next, ownIds): FoodNotice[]`.

- [ ] **Step 1: Failing tests**

In `packages/client/test/soundEvents.test.ts`:
- Import erweitern: `import { detectFoodFinds, detectSeizures, detectSounds, PLING_MAX_STEP, PLING_RESET_MS, plingStep, snapshotForSound } from '../src/soundEvents';`
- Test `plays buy for a container upgrade and for spending` (Zeilen 79 bis 85):

```ts
  it('plays buy for spending', () => {
    const p = next(fresh(), (s) => { s.players.a.money = 1000; });
    expect(detectSounds(p, next(p, (s) => { s.players.a.money -= 300; }), 'all')).toEqual(['buy']);
  });
```

- Test `copies the inventory deeply…` (Zeilen 116 bis 122):

```ts
  it('copies items and the food find so the local game sees changes', () => {
    const s = fresh();
    s.players.a.items.dog_treat = 2;
    s.players.a.lastFood = { n: 1, spot: 'bin', text: 0, full: false };
    const copy = snapshotForSound(s);
    s.players.a.items.dog_treat = 1;
    s.players.a.lastFood.n = 2;
    expect(copy.players.a.items.dog_treat).toBe(2);
    expect(copy.players.a.lastFood!.n).toBe(1);
  });
```

- Zeile 291: `s.players.a.items.bag = 3;`
- Test `plays stealSuccess for a robbery with bolt cutters…` (Zeilen 349 bis 364): Titel `'plays stealSuccess for a robbery that takes everything'` und die beiden Zeilen mit `inventory.bolt_cutters` löschen.
- Am Dateiende anhängen:

```ts
describe('detectFoodFinds', () => {
  const find = (n: number, full = false) => ({ n, spot: 'bin' as const, text: 1, full });

  it('shows the text once when the own counter goes up', () => {
    const p = fresh();
    const n = next(p, (s) => { s.players.a.lastFood = find(1); });
    expect(detectFoodFinds(p, n, ['a'])).toEqual([{ id: 'a', text: 'Halber Döner aus der Tonne. Schmeckt erstaunlich okay.' }]);
    expect(detectFoodFinds(n, snapshotForSound(n), ['a'])).toEqual([]);
  });

  it('shows the latest find when two happen between two states, with the full suffix', () => {
    const p = next(fresh(), (s) => { s.players.a.lastFood = find(1); });
    const n = next(p, (s) => { s.players.a.lastFood = find(3, true); });
    expect(detectFoodFinds(p, n, 'all')).toEqual([
      { id: 'a', text: 'Halber Döner aus der Tonne. Schmeckt erstaunlich okay. Aber du bist schon satt.' },
    ]);
  });

  it('never shows a foreign find and nothing without a previous state', () => {
    const p = fresh();
    const n = next(p, (s) => { s.players.b.lastFood = find(1); });
    expect(detectFoodFinds(p, n, ['a'])).toEqual([]);
    expect(detectFoodFinds(null, n, 'all')).toEqual([]);
  });

  it('works through the online projection only for the finder', () => {
    const s = createGame(1, CITY_MAP, ['a', 'b'], { countdownMs: 0 });
    const before = stateFromSnapshot(CITY_MAP, projectSnapshot(s, 'a'));
    s.players.a.lastFood = find(1);
    s.players.b.lastFood = find(1);
    const after = stateFromSnapshot(CITY_MAP, projectSnapshot(s, 'a'));
    expect(detectFoodFinds(before, after, ['a']).map((f) => f.id)).toEqual(['a']);
  });
});
```

- [ ] **Step 2: Run, FAIL**

Run: `cd packages/client; npx vitest run test/soundEvents.test.ts`
Expected: FAIL (`detectFoodFinds` fehlt, `containerLevel` im Code).

- [ ] **Step 3: Implementierung**

`packages/client/src/soundEvents.ts`:
- Zeile 1: `import { CONFIG, foodText, isBeingChecked, totalBottles } from '@pfandraiders/core';`
- Zeilen 95 bis 99 ersetzen:

```ts
    // Geld sinkt bei Bewusstsein nur durch Käufe
    const spent = p.money < q.money && q.unconsciousMs === 0 && p.unconsciousMs === 0;
    if (spent) out.add('buy');
```

- Zeile 107: `if (punched && drop >= CONFIG.fight.damage - 1) out.add('hit');`
- Hinter `detectSeizures` einfügen:

```ts
export interface FoodNotice {
  /** Finder */
  id: string;
  text: string;
}

/**
 * Essensfunde zwischen zwei Zuständen, nur für eigene Spieler: Der Zähler lastFood.n stieg. Fallen mehrere Funde
 * dazwischen, zählt der letzte. Rein und nur aus Zustandsunterschieden (lokal und online gleich; fremde Spieler
 * haben online lastFood = null).
 */
export function detectFoodFinds(prev: GameState | null, next: GameState, ownIds: string[] | 'all'): FoodNotice[] {
  if (prev === null) return [];
  const out: FoodNotice[] = [];
  for (const p of Object.values(next.players)) {
    if (ownIds !== 'all' && !ownIds.includes(p.id)) continue;
    const q = prev.players[p.id];
    if (!q || p.lastFood === null || p.lastFood.n <= (q.lastFood?.n ?? 0)) continue;
    out.push({ id: p.id, text: foodText(p.lastFood) });
  }
  return out;
}
```

- In `snapshotForSound` die Zeile mit `players[id] = …` ersetzen:

```ts
    players[id] = {
      ...p,
      bottles: { ...p.bottles },
      items: { ...p.items },
      lastFood: p.lastFood === null ? null : { ...p.lastFood },
      spawn: { ...p.spawn },
    };
```

`packages/client/src/scenes/GameScene.ts`: Zeile 24 `import { detectFoodFinds, detectSeizures, detectSounds, snapshotForSound } from '../soundEvents';`; hinter Zeile 464 (Beschlagnahme-Hinweise) einfügen:

```ts
    for (const f of detectFoodFinds(this.prevSoundState, state, this.ownSoundIds)) this.notices.show(f.id, f.text);
```

- [ ] **Step 4: Run, PASS**

Run: `cd packages/client; npx vitest run test/soundEvents.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/soundEvents.ts packages/client/src/scenes/GameScene.ts packages/client/test/soundEvents.test.ts
git commit -m "feat(client): food find notice for the finder; sound rules without container level

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Client – HUD-Texte und Flaschensymbole

**Files:**
- Create: `packages/client/src/bottleIcons.ts`, `packages/client/test/bottleIcons.test.ts`
- Modify: `packages/client/src/text.ts:1-66`, `packages/client/src/hud.ts`
- Test: `packages/client/test/text.test.ts`

**Interfaces:**
- Consumes: `capacityOf`, `bottlesValueFor`, `VALUE_ORDER` (Task 1/2), `Bottles`, `BottleKind`.
- Produces: `bottleIcons`, `bottleIconsKey`, `BOTTLE_ICON`, `BOTTLE_ICON_COLORS`, `BottleIcon`; `statusLines` mit genau drei Zeilen (Zeit/Geld, Leben, Besitz); `hud.ts` mit `ICONS.y = 68`, `BAR_Y = 94`, `ALERT_Y = 110`.

- [ ] **Step 1: Failing tests für das Layout**

`packages/client/test/bottleIcons.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { BOTTLE_ICON, BOTTLE_ICON_COLORS, bottleIcons, bottleIconsKey } from '../src/bottleIcons';

describe('bottleIcons', () => {
  it('lays out one icon per slot, occupied first in deposit order, then free', () => {
    const icons = bottleIcons({ plastic: 1, glass: 1, crate: 1 }, 5);
    expect(icons.map((i) => i.kind)).toEqual(['crate', 'glass', 'plastic', null, null]);
    const step = BOTTLE_ICON.w + BOTTLE_ICON.gap;
    expect(icons.map((i) => i.x)).toEqual([0, step, 2 * step, 3 * step, 4 * step]);
    expect(icons.every((i) => i.y === 0)).toBe(true);
  });

  it('wraps after 16 slots, so 31 slots need two rows', () => {
    const icons = bottleIcons({ plastic: 20, glass: 0, crate: 0 }, 31);
    expect(icons).toHaveLength(31);
    expect(icons[15]).toMatchObject({ x: 15 * (BOTTLE_ICON.w + BOTTLE_ICON.gap), y: 0, kind: 'plastic' });
    expect(icons[16]).toMatchObject({ x: 0, y: BOTTLE_ICON.h + BOTTLE_ICON.gap, kind: 'plastic' });
    expect(icons[30]).toMatchObject({ y: BOTTLE_ICON.h + BOTTLE_ICON.gap, kind: null });
    expect(Math.max(...icons.map((i) => i.x)) + BOTTLE_ICON.w).toBeLessThanOrEqual(160);
  });

  it('shows the three hand slots grey when empty and never more bottles than slots', () => {
    expect(bottleIcons({ plastic: 0, glass: 0, crate: 0 }, 3).map((i) => i.kind)).toEqual([null, null, null]);
    expect(bottleIcons({ plastic: 5, glass: 0, crate: 0 }, 3).map((i) => i.kind)).toEqual(['plastic', 'plastic', 'plastic']);
    expect(bottleIcons({ plastic: 0, glass: 0, crate: 0 }, 0)).toEqual([]);
  });

  it('takes the row width as a parameter', () => {
    expect(bottleIcons({ plastic: 0, glass: 0, crate: 0 }, 5, 2)[2]).toMatchObject({ x: 0, y: BOTTLE_ICON.h + BOTTLE_ICON.gap });
  });

  it('has a key that changes with contents and capacity', () => {
    const a = bottleIconsKey({ plastic: 1, glass: 0, crate: 0 }, 3);
    expect(bottleIconsKey({ plastic: 1, glass: 0, crate: 0 }, 3)).toBe(a);
    expect(bottleIconsKey({ plastic: 0, glass: 1, crate: 0 }, 3)).not.toBe(a);
    expect(bottleIconsKey({ plastic: 1, glass: 0, crate: 0 }, 13)).not.toBe(a);
  });

  it('colours plastic blue, glass green, crates brown and free slots grey', () => {
    expect(BOTTLE_ICON_COLORS).toEqual({ plastic: 0x42a5f5, glass: 0x66bb6a, crate: 0x8d6e63, free: 0x616161 });
  });
});
```

- [ ] **Step 2: Failing tests für die Texte**

In `packages/client/test/text.test.ts`:
- Zeilen 15 und 16: `const KEYS: KeyLabels = { action: 'E', steal: 'Q', attack: 'F' };` und `const KEYS2: KeyLabels = { action: 'Enter', steal: '/', attack: '.' };`
- Test `shows time, money, container and bottles` (Zeilen 30 bis 43):

```ts
  it('shows time and money, health and an item line; the bottles are icons now', () => {
    const s = twoGame();
    s.players.p1.money = 150;
    s.players.p1.bottles = { plastic: 2, glass: 1, crate: 0 };
    const lines = statusLines(s, s.players.p1);
    expect(lines).toEqual(['Zeit 5:00   Geld 1,50 €', 'Leben 100/100', '']);
  });
```

- Zeile 55: `s.players.p1.items.cart = 1;` (statt `inventory.bolt_cutters`).
- Tests `shows the inventory after the health` und `shows only the health without inventory` (Zeilen 349 bis 358):

```ts
  it('shows the items on their own line below the health', () => {
    const s = duo();
    s.players.p1.items = { ...s.players.p1.items, dog_treat: 2, cart: 1, card: 1 };
    expect(statusLines(s, s.players.p1).slice(1)).toEqual(['Leben 100/100', 'Leckerli 2  Wagen  Karte']);
    s.players.p1.items.card_plus = 1;
    expect(statusLines(s, s.players.p1)[2]).toBe('Leckerli 2  Wagen  Karte+');
  });

  it('keeps the item line empty without items', () => {
    const s = duo();
    expect(statusLines(s, s.players.p1).slice(1)).toEqual(['Leben 100/100', '']);
  });

  it('shows the deposit value with the Kundenkarte+ bonus', () => {
    const s = createGame(1, parseMap(['#####', '#@D.#', '#####']), ['p1']);
    s.players.p1.bottles = { plastic: 1, glass: 0, crate: 0 };
    expect(hintLines(s, s.players.p1, KEYS)[0]).toBe('[E halten] Pfand abgeben (0,08 €)');
    s.players.p1.items.card = 1;
    s.players.p1.items.card_plus = 1;
    expect(hintLines(s, s.players.p1, KEYS)[0]).toBe('[E halten] Pfand abgeben (0,09 €)');
  });
```

- Den Test `offers eating when food is there…` (Zeilen 378 bis 385) löschen.

- [ ] **Step 3: Run, FAIL**

Run: `cd packages/client; npx vitest run test/bottleIcons.test.ts test/text.test.ts`
Expected: FAIL.

- [ ] **Step 4: `bottleIcons.ts`**

`packages/client/src/bottleIcons.ts`:

```ts
import { VALUE_ORDER } from '@pfandraiders/core';
import type { BottleKind, Bottles } from '@pfandraiders/core';

/** Ein Platz im HUD: 8 x 10 px, 2 px Abstand, 16 je Zeile (31 Plätze = 2 Zeilen, 158 px breit). */
export const BOTTLE_ICON = { w: 8, h: 10, gap: 2, perRow: 16 };

/** Plastik blau, Glas grün, Kasten braun, freier Platz grau */
export const BOTTLE_ICON_COLORS: Record<BottleKind | 'free', number> = {
  plastic: 0x42a5f5,
  glass: 0x66bb6a,
  crate: 0x8d6e63,
  free: 0x616161,
};

export interface BottleIcon {
  /** linke obere Ecke relativ zum ersten Platz */
  x: number;
  y: number;
  /** null = freier Platz */
  kind: BottleKind | null;
}

/**
 * Plätze des eigenen Containers als Symbole: belegte zuerst in Abgabe-Reihenfolge (Kasten, Glas, Plastik),
 * dann freie, zeilenweise zu `perRow`. Mehr Flaschen als Plätze werden nur bis zur Kapazität gezeigt. Rein, ohne Phaser.
 */
export function bottleIcons(bottles: Bottles, capacity: number, perRow = BOTTLE_ICON.perRow): BottleIcon[] {
  const kinds: (BottleKind | null)[] = [];
  for (const kind of VALUE_ORDER) for (let i = 0; i < bottles[kind]; i++) kinds.push(kind);
  const slots = Math.max(0, Math.floor(capacity));
  const row = Math.max(1, Math.floor(perRow));
  const out: BottleIcon[] = [];
  for (let i = 0; i < slots; i++) {
    out.push({
      x: (i % row) * (BOTTLE_ICON.w + BOTTLE_ICON.gap),
      y: Math.floor(i / row) * (BOTTLE_ICON.h + BOTTLE_ICON.gap),
      kind: kinds[i] ?? null,
    });
  }
  return out;
}

/** Schlüssel für das Neuzeichnen: ändert sich nur, wenn sich Inhalt oder Kapazität ändern. */
export function bottleIconsKey(bottles: Bottles, capacity: number): string {
  return `${capacity}:${bottles.crate},${bottles.glass},${bottles.plastic}`;
}
```

- [ ] **Step 5: `text.ts`**

Import (Zeilen 1 bis 14) ersetzen:

```ts
import {
  bottlesValueFor,
  capacityOf,
  CONFIG,
  findAttackTarget,
  findLootTarget,
  findSearchableSpot,
  isBeingChecked,
  isNear,
  ranking,
  totalBottles,
} from '@pfandraiders/core';
import type { GameState, Player } from '@pfandraiders/core';
```

`inventoryParts` und `statusLines` (Zeilen 23 bis 40) ersetzen:

```ts
/** Besitz als kurze Teile, nur was vorhanden ist (Spec §6.2). */
function itemParts(p: Player): string[] {
  const parts: string[] = [];
  if (p.items.dog_treat > 0) parts.push(`Leckerli ${p.items.dog_treat}`);
  if (p.items.cart > 0) parts.push('Wagen');
  if (p.items.card_plus > 0) parts.push('Karte+');
  else if (p.items.card > 0) parts.push('Karte');
  return parts;
}

/**
 * Immer drei Zeilen: Zeit und Geld, Leben, Besitz (leer ohne Besitz). Das Leben steht allein, damit die Zeile nicht
 * unter den Lebensbalken oben rechts läuft. Die Flaschen zeigt das HUD als Symbole (bottleIcons).
 */
export function statusLines(state: GameState, p: Player): string[] {
  return [
    `Zeit ${formatTime(state.timeLeftMs)}   Geld ${formatMoney(p.money)}`,
    `Leben ${Math.ceil(p.health)}/${CONFIG.health.max}`,
    itemParts(p).join('  '),
  ];
}
```

In `hintLines`: `formatMoney(bottlesValue(p.bottles))` durch `formatMoney(bottlesValueFor(p, p.bottles))` ersetzen und die Zeilen 61 bis 64 (Essen) löschen.

- [ ] **Step 6: `hud.ts`**

- Import ergänzen: `import { capacityOf, CONFIG, searchMsOf } from '@pfandraiders/core';` und `import { BOTTLE_ICON, BOTTLE_ICON_COLORS, bottleIcons, bottleIconsKey } from './bottleIcons';`
- Zeilen 14 bis 16 (Kommentar, `BAR_Y`, `ALERT_Y`) ersetzen:

```ts
// Status (3 Zeilen) belegt y 8..65, Flaschensymbole y 68..90, Suchbalken ab 94, Warnung ab 110 (bis 3 Zeilen);
// Hinweise wachsen von unten (bis 4 Zeilen). Passt in die kleinste Ansicht 478 x 268.
const ICONS = { x: 8, y: 68 };
const BAR_Y = 94;
const ALERT_Y = 110;
```
- In `PlayerHud` Felder ergänzen:

```ts
  /** Flaschensymbole des eigenen Containers */
  private readonly icons: Phaser.GameObjects.Graphics;
  private iconsKey = '';
```

- Im Konstruktor vor `this.objects = [`: `this.icons = scene.add.graphics().setPosition(ICONS.x, ICONS.y);` und `this.icons` in die Liste `this.objects` aufnehmen (hinter `this.hp.label`).
- Neue Methode hinter `updateHealth`:

```ts
  /** Zeichnet die Plätze neu, wenn sich Inhalt oder Kapazität geändert haben. */
  private updateIcons(p: Player): void {
    const capacity = capacityOf(p);
    const key = bottleIconsKey(p.bottles, capacity);
    if (key === this.iconsKey) return;
    this.iconsKey = key;
    const g = this.icons.clear();
    const { w, h } = BOTTLE_ICON;
    for (const icon of bottleIcons(p.bottles, capacity)) {
      const color = BOTTLE_ICON_COLORS[icon.kind ?? 'free'];
      if (icon.kind === 'crate') {
        // Kasten: breites Rechteck mit dunklem Rand
        g.fillStyle(color, 1).fillRect(icon.x, icon.y + 2, w, h - 2);
        g.lineStyle(1, 0x000000, 0.6).strokeRect(icon.x + 0.5, icon.y + 2.5, w - 1, h - 3);
      } else {
        // Flasche: Hals und Bauch; freie Plätze halb durchsichtig
        const alpha = icon.kind === null ? 0.6 : 1;
        g.fillStyle(color, alpha).fillRect(icon.x + 3, icon.y, 2, 3);
        g.fillStyle(color, alpha).fillRect(icon.x + 1, icon.y + 3, w - 2, h - 3);
      }
    }
  }
```

- In `update()` hinter `this.updateHealth(p);` die Zeile `this.updateIcons(p);` einfügen.

- [ ] **Step 7: Client komplett grün**

Run: `cd packages/client; npx vitest run; npx tsc --noEmit`
Expected: alle Tests PASS, keine Typfehler. Meldet `tsc` noch `labels.eat`, `inventory`, `containerLevel` oder `'soon'` in einer Datei, die oben nicht genannt ist: nach den Regeln aus Task 5 bis 8 entfernen.

- [ ] **Step 8: Commit**

```bash
git add packages/client/src/bottleIcons.ts packages/client/src/text.ts packages/client/src/hud.ts packages/client/test/bottleIcons.test.ts packages/client/test/text.test.ts
git commit -m "feat(client): bottle icons in the HUD, compact item indicators, no eat hint

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: README, Gesamtprüfung, Builds

**Files:**
- Modify: `README.md:24-28` (Tastentabelle), `:32` (Countdown-Satz „oder essen“), `:34` (Abgabe), `:40` (Serie), `:44-59` (Shop), `:61` (Kampf), `:65` (Leben)

**Interfaces:**
- Consumes: alles aus Task 1 bis 9.
- Produces: README im Stand von PR 1.

- [ ] **Step 1: README anpassen**

- Tastentabelle (Zeilen 24 bis 28):

```md
| Gerät | Laufen | Aktion | Ausrauben | Schlagen |
|---|---|---|---|---|
| Tastatur 1 | WASD | E | Q | F |
| Tastatur 2 | Pfeile | Enter | / | . |
| Gamepad | Stick oder Steuerkreuz | A | B | X |
```

- Zeile 32: „Niemand kann laufen, suchen, abgeben, schlagen oder essen“ → „Niemand kann laufen, suchen, abgeben oder schlagen“.
- Zeile 34: „Ein voller Einkaufswagen (30 Flaschen) braucht so gut 4 s.“ → „Ein voller Container (31 Flaschen) braucht so 4,5 s, mit Kundenkarte (alle 0,1 s) 3 s.“ Und vor „Leere Spots füllen sich…“ einfügen: „Beim Suchen findet man manchmal etwas zu essen (Mülleimer 10 %, sonst 4 %): Es heilt sofort 30 Leben, ein kurzer Hinweis nennt den Fund (z. B. „Kalte Pizza unterm Busch gefunden. Lecker!“; bei vollem Leben mit „Aber du bist schon satt.“).“
- Zeile 40: „Geld, Taschenstufe, Upgrades und Vorräte bleiben über die Runden“ → „Geld und Gekauftes bleiben über die Runden (außer dem Einkaufswagen, der nur für eine Runde gemietet ist)“.
- Zeile 44: „(auf Leckerli und Essen: die Menge)“ → „(auf Leckerli: die Menge)“.
- Tabelle und Satz darunter (Zeilen 46 bis 59) ersetzen:

```md
| Kategorie | Eintrag | Preis | Wirkung |
|---|---|---|---|
| Taschen | Tasche | 1,50 € je Stück, bis 4 | +2 Plätze |
| Taschen | Rucksack | 4,00 € je Stück, bis 2 | +5 Plätze |
| Taschen | Einkaufswagen | 1,00 € Miete | +10 Plätze, 30 % langsamer, nur für die nächste Runde |
| Upgrades | Taschenlampe | 2, 5, 10 € | Suchzeit −15, −30, −45 % |
| Upgrades | Kundenkarte | 3 € | Pfandautomat: alle 0,1 s statt 0,15 s eine Flasche |
| Upgrades | Kundenkarte+ | 6 € (braucht Kundenkarte) | +10 % Pfand je Flasche (8 → 9, 15 → 17, 25 → 28 ct) |
| Waffen | Stärkerer Schlag | 2,50, 6, 12 € | +5, +10, +15 Schaden |
| Verteidigung | Leckerli | 1 € je Stück | lenkt einen Hund ab, automatisch |

Mit leeren Händen trägt man 3 Flaschen, voll ausgestattet 31 (ohne Wagen 21). Tasche und Rucksack kauft man je Kauf einzeln bis zur Grenze, Leckerli in Mengen bis 99; reicht das Geld nicht für die ganze Menge, wird nichts gekauft. Die Preise sind Startwerte.
```

- Zeile 61 (Kampf): „mit 20 Schaden (Schlag-Upgrade mehr, Rüstung des Opfers weniger, mindestens 5)“ → „mit 20 Schaden (Schlag-Upgrade mehr)“; „(20 s, mit Upgrade kürzer)“ → „(20 s)“; die Sätze über den Bolzenschneider („Mit dem Bolzenschneider nimmt …“ und „, der Bolzenschneider bleibt erhalten“) streichen.
- Zeile 65: „Essen aus dem Vorrat (Essen-Taste) heilt 30.“ → „Essen, das man beim Suchen findet, heilt 30.“ Und hinter dem Satz über den Lebensbalken ergänzen: „Darunter zeigt das eigene HUD den Container als Reihe von Flaschensymbolen: Plastik blau, Glas grün, Kasten braun, freie Plätze grau (16 je Zeile). Unter der Zeile mit dem Leben stehen kurz Leckerli, Wagen und Kundenkarte.“

- [ ] **Step 2: Alles prüfen**

Run (Wurzelverzeichnis): `npm test; npm run typecheck; npm run build; npm run build:server`
Expected: alle drei Pakete PASS, Typecheck ohne Fehler, beide Builds erfolgreich.

- [ ] **Step 3: Rest-Suche nach Altlasten**

Run: `git grep -n -E "containerLevel|containerOf|CONFIG\.containers|upgradePrices|bolt_cutters|knockoutMsOf|eatFood|\.inventory\b|labels\.eat|'soon'|minDamage" -- packages README.md`
Expected: keine Treffer (außer in `docs/`, die nicht durchsucht werden).

- [ ] **Step 4: Kurz spielen**

`npm run dev` und `npm run dev:server` starten; lokal 2 Spieler: suchen (Essensfund-Hinweis erscheint gelegentlich), abgeben, Shop: Tasche ×2, Einkaufswagen mieten, Taschenlampe, Kundenkarte; nächste Runde: 17 Plätze als Symbole, langsamer; Runde danach: Wagen weg, 7 Plätze. Online mit zwei Browsern: Snapshots kommen an (Figuren laufen), Shop-Stand erscheint nach Kauf.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: README for stacked bags, cart rental, customer cards and food finds

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec-Abdeckung (Kapitel der Spec → Task):**
- §1.1 Kategorien, `weapons`/„Waffen“ → Task 1 (Katalog, Test), Task 7 (Anzeige).
- §1.2 Katalog PR 1 (Tasche, Rucksack, Wagen, Taschenlampe, Kundenkarte, Kundenkarte+, Leckerli) → Task 1; Boxhandschuh, Pfefferspray, Ausweis → PR 2.
- §1.3 `punch` bleibt in PR 1 → Task 1 (Katalog), Task 7 (Zeile).
- §1.4 Entfernungen → Task 1 (Kern: Knockout, Tempo, Rüstung, Bolzenschneider, Steinschleuder, Pistole, Essen), Task 5 (Essen-Taste), Task 8 (Bolzenschneider in Sound-Tests), Task 9 (HUD), Task 10 (README, Grep).
- §1.5 einzeln/mengenweise kaufbar → Task 1 (`stack` mit `max`), Task 7 (Menge, Grenze).
- §1.6 Serverprüfung ohne Teilkauf, Voraussetzung → Task 1 (`checkShopBuy`), Task 4 (Raum).
- §2.1 bis §2.4 Kapazität, Tempo, Miete, Ersatz von `containerLevel` → Task 1, Task 4, Task 6.
- §3.1 bis §3.3 Taschenlampe, Kundenkarte, Kundenkarte+ (Rundung, Verdienst) → Task 1, Task 2, Task 9 (Hinweiswert).
- §4 → PR 2 (nur §4.4 Leckerli unverändert: Task 1 `npc.ts`).
- §5.1 bis §5.6 Essensfunde, Texte, satt, Signal, Entfernen der Taste → Task 3, Task 5, Task 8.
- §6.1 bis §6.4 HUD → Task 9.
- §7.1 bis §7.3 Fortschritt, Privatsphäre, Protokoll → Task 1 (Snapshot), Task 4, Task 6, Task 10 (Builds).

**Platzhalter-Scan:** keine „TBD“/„später“. Jeder Code-Schritt enthält den Code; Umstellungen bestehender Tests nennen Datei, Zeilen und den Ersatz.

**Typkonsistenz:** `items: Items` in Task 1 eingeführt und in Task 2 bis 9 so benutzt; `progressAfterRound` in Task 1 (Kern), Task 4 (Server), Task 6 (lokal); `punchDamage(attacker)` ohne Opfer in Task 1 und PR 2; `depositEveryMsOf`/`bottleValueFor`/`bottlesValueFor` in Task 2 und Task 9; `foodText`/`FoodFind` in Task 3 und Task 8; `KeyLabels` ohne `eat` in Task 5 und Task 9 (`text.test.ts`).

**Review Focus:** Alle fünf Punkte haben Tests in der genannten Task (6, 4 + 6, 6, 8, 2).
