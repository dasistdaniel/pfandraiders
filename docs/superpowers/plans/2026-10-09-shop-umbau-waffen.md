# Shop-Umbau PR 2 „Waffen und Verteidigung“ – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unter „Waffen“ ersetzt der Boxhandschuh (30 statt 20 Schaden) den „Stärkeren Schlag“. Unter „Verteidigung“ kommen das Pfefferspray (Ladungen, eigene Taste, Stoß 40 px, 2 Leben, sichtbare Wolke und Ton) und die Ausweisdokumente (eine Runde lang keine Polizeikontrolle) hinzu.

**Architecture:** Der Kern (`packages/core`) bekommt den Katalog von PR 2 (`glove`, `pepper` mit `unit: 10`, `id_papers` als Miete). Die Eingabe bekommt `spray`, der Spieler das private Feld `sprayHeld` und das öffentliche Feld `sprayCooldownMs`. Die neue Datei `spray.ts` wählt das Ziel und wendet Stoß und Schaden an; der Stoß selbst (`shove` in `movement.ts`) läuft pixelweise mit derselben Kollision wie `walk`. Die Polizei überspringt Spieler mit Ausweis. Am Rundenende löscht das schon in PR 1 gebaute `progressAfterRound` den Ausweis. Der Client legt das Spray auf die in PR 1 frei gewordenen Tasten (`C`, `,`, Gamepad `Y`) und zeigt Ladungen und Ausweis im HUD. Die Wolke zeichnet er aus `sprayCooldownMs` (wie den Schlag aus `attackCooldownMs`), der Ton kommt aus dem Zustandsvergleich.

**Tech Stack:** TypeScript 5.7, npm workspaces (`@pfandraiders/core`, `@pfandraiders/server`, `@pfandraiders/client`), Vitest 3, Phaser 3 im Client.

**Spec:** `docs/superpowers/specs/2026-10-09-shop-umbau-design.md` (§1, §4, §6.2, §7). Setzt PR 1 voraus: `docs/superpowers/plans/2026-10-09-shop-umbau-wirtschaft.md` (dessen Namenstabelle gilt weiter, hier stehen nur die Änderungen).

**Ausgangsstand:** Branch mit PR 1 vollständig umgesetzt (alle Tests grün). Zeilennummern beziehen sich auf den Stand **nach** PR 1; wo sie wegen PR 1 unsicher sind, ist die Stelle über ihren Inhalt beschrieben.

## Global Constraints

- Alle Texte für Spieler sind deutsch, mit echten Umlauten.
- Code-Kommentare sind deutsch wie im bestehenden Code; Bezeichner bleiben englisch.
- Jeder Commit endet nach einer Leerzeile mit `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- `todo.md` und `idee.md` werden nie gestaged oder committet. Immer `git add <pfad>` mit expliziten Pfaden, nie `git add -A` oder `git add .`.
- Das Verzeichnis `.claude/` wird nie gelöscht.
- Kein Python, keine Python-Skripte.
- Der Kern bleibt deterministisch: kein `Math.random`, kein `Date.now`. Das Spray würfelt nicht; Richtung und Stoß sind reine Arithmetik.
- Snapshots bleiben eine Allow-List je Betrachter. In PR 2: `sprayCooldownMs` ist **öffentlich** (andere sehen die Wolke, wie `attackCooldownMs` beim Schlag), `sprayHeld` ist **privat** (fremd immer `false`); `items.pepper` und `items.id_papers` sind wie alle `items` privat. Die Schlüsselliste in `packages/core/test/snapshot.test.ts` wird angepasst.
- Protokolländerungen (`Input.spray`, neue `ShopItemId`) verlangen, dass Client und Server gemeinsam neu gebaut und ausgeliefert werden.
- Preise in `CONFIG.shop` sind erfundene Startwerte (Kommentar im Code bleibt).
- Rote Fenster: Der Kern ist nach **jeder** Task grün (`npx vitest run` und `npx tsc --noEmit` in `packages/core`). Server-Tests und Server-Typecheck dürfen in Task 1 bis 3 rot sein und sind ab Task 4 grün. Client-Typecheck darf in Task 1 bis 6 rot sein, die in einer Client-Task genannten Testdateien müssen in dieser Task grün sein. Ab Task 7 ist der ganze Client grün. Am Ende von Task 8 sind `npm test`, `npm run typecheck`, `npm run build` und `npm run build:server` im Wurzelverzeichnis grün.
- Testbefehle: im Paketordner `npx vitest run <datei>`.

## Namenstabelle (Änderungen gegenüber PR 1)

| Ort | Name | Typ / Form nach PR 2 |
| --- | --- | --- |
| `core/src/types.ts` | `ShopItemId` | `'bag' \| 'backpack' \| 'cart' \| 'flashlight' \| 'card' \| 'card_plus' \| 'glove' \| 'pepper' \| 'id_papers' \| 'dog_treat'` (ohne `punch`) |
| `core/src/types.ts` | `Input` | `{ moveX; moveY; action; steal; attack; spray: boolean }` |
| `core/src/types.ts` | `Player` neu | `sprayHeld: boolean` (privat), `sprayCooldownMs: number` (öffentlich) |
| `core/src/config.ts` | `ShopItemDef` neu | `unit?: number` (stack: Bestand je gekauftem Stück, fehlt = 1) |
| `core/src/config.ts` | `CONFIG.shop.items` neu | `glove` (Waffen, once, 400), `pepper` (Verteidigung, stack, 300, `max: 99`, `unit: 10`), `id_papers` (Verteidigung, once, 300, `perRound: true`); `punch` entfällt |
| `core/src/config.ts` | `CONFIG.fight.gloveBonus` | `10` |
| `core/src/config.ts` | `CONFIG.spray` | `{ radius: 30, knockbackPx: 40, damage: 2, cooldownMs: 1000 }` |
| `core/src/shop.ts` | `LevelItemId` | `'flashlight'` |
| `core/src/shop.ts` | `unitOf(item: ShopItemId): number` | `def.unit ?? 1` |
| `core/src/shop.ts` | `noItems()` | `{ bag, backpack, cart, flashlight, card, card_plus, glove, pepper, id_papers, dog_treat }` alle 0 |
| `core/src/fight.ts` | `punchDamage(attacker: Pick<Player, 'items'>): number` | `damage + (glove > 0 ? gloveBonus : 0)` |
| `core/src/movement.ts` | `shove(map: MapData, p: Point, ux: number, uy: number, px: number): void` | pixelweiser Stoß, Achsen getrennt |
| `core/src/spray.ts` (neu) | `findSprayTarget(state: GameState, sprayer: Player): Player \| null` | nächster wacher anderer Spieler ≤ 30 px |
| `core/src/spray.ts` | `trySpray(state: GameState, sprayer: Player): boolean` | |
| `client/src/input.ts` | `KeyState` | + `spray: boolean` |
| `client/src/sources.ts` | `KeyLabels` | `{ action; steal; attack; spray }`; `PAD_LABELS.spray = 'Y'` |
| `client/src/devices.ts` | `KeyboardLayout` | + `spray: string` (`'C'` bzw. `'COMMA'`) |
| `client/src/sprayView.ts` (neu) | `SPRAY_SHOW_MS = 300`, `SPRAY_COLOR = 0xff7043`, `isSpraying(p)`, `sprayCloudRadius(p)` | |
| `client/src/soundEvents.ts` | `SoundId` | + `'spray'` |

## Entscheidungen zu Lücken der Spec (Rulings)

1. **Ladungen als Besitz**: `items.pepper` zählt Ladungen, nicht Flaschen. `ShopItemDef.unit = 10`: Eine gekaufte „Flasche“ addiert 10. `maxOf('pepper') = 99` Ladungen; `checkShopBuy` lehnt ab, wenn `owned + qty × unit > max` (`maxed`). Bei 95 Ladungen ist also keine Flasche mehr kaufbar. Der Shop bietet höchstens `floor((99 − owned) / 10)` Flaschen an. `parseProgress` braucht keine Änderung: Es prüft `items.pepper` gegen `maxOf` = 99.
2. **Kein Ziel, keine Ladung**: Ein Druck ohne wachen Spieler in 30 px verbraucht weder Ladung noch Abklingzeit und zeigt keine Wolke. So verschwendet ein versehentlicher Druck nichts. Der Hinweis „[C] Pfefferspray“ erscheint nur mit Ziel in Reichweite.
3. **Ziel**: der nächste wache andere Spieler höchstens `CONFIG.spray.radius` (30 px) entfernt; Gleichstand: Reihenfolge der Spieler (wie `findAttackTarget`). Schutz zählt bei der Wahl nicht.
4. **Schutz**: Hat das Ziel Schutz (`shieldMs > 0`), werden Ladung und Abklingzeit verbraucht und die Wolke erscheint, aber es gibt weder Stoß noch Schaden (wie beim Schlag).
5. **Stoßrichtung**: vom Sprühenden zum Opfer, als Einheitsvektor. Stehen beide genau auf demselben Punkt, nach rechts (+x). Der Stoß läuft `knockbackPx` (40) Einzelschritte zu je 1 px Länge; je Schritt erst x, dann y, jede Achse nur, wenn `boxBlocked` mit `CONFIG.playerHalf` frei ist. Eine blockierte Achse bleibt für den Rest des Stoßes stehen, die andere läuft weiter (rutscht an der Wand entlang). Weiche Kacheln zählen wie beim Laufen (gleiche Funktion `boxBlocked`).
6. **Reihenfolge**: erst Stoß, dann Schaden (2 Leben über `damage`). Ein Opfer mit höchstens 2 Leben fällt also an der gestoßenen Stelle um. `damage` bricht die Suche des Opfers ab; Sprühen bricht die eigene Suche ab (wie Schlagen). Sprühen geht auch im Laufen und während der eigenen Abklingzeit des Schlags.
7. **Tasten**: Spray auf den in PR 1 frei gewordenen Tasten: Tastatur 1 `C`, Tastatur 2 `,` (Phaser `COMMA`), Gamepad `Y`. Flanke wie bei Schlagen und Ausrauben (`sprayHeld`).
8. **Wolke**: öffentlich über `sprayCooldownMs`. Sichtbar, solange `sprayCooldownMs > cooldownMs − 300` (die ersten 300 ms nach dem Sprühen), als halbdurchsichtiger orangefarbener Kreis um den Sprühenden, der von 40 % auf 100 % des Sprühradius wächst. Gezeichnet mit `scene.add.circle` (keine neuen Dateien).
9. **Ton `spray`**: ein Rauschstoß (Rezept mit `noise: true`). Hörbar für den Sprühenden (eigene `sprayCooldownMs` sprang hoch) und für ein eigenes Opfer (ein anderer Spieler höchstens `radius + 6` px neben der vorigen eigenen Position hat gesprüht).
10. **Vorhersage beim Opfer**: Der Stoß (40 px) liegt unter `SNAP_DIST` (48 px). Die eigene Figur des Opfers springt deshalb nicht, sondern gleitet über einige Snapshots dorthin (Korrektur 35 % je Snapshot). Das wirkt wie ein Rutschen und ist gewollt; Task 7 pinnt mit einem Test, dass sie im Stand nach zehn Snapshots (500 ms) weniger als 1 px daneben liegt und dabei nicht springt.
11. **Ausweisdokumente**: `perRound: true` wie der Wagen, also löscht sie das vorhandene `progressAfterRound` am Rundenende (online und lokal). Polizisten wollen einen Spieler mit `items.id_papers > 0` nicht (`wants` in `npc.ts`): Sie jagen, kontrollieren und beschlagnahmen nicht. Hunde sind nicht betroffen. Der Shop zeigt „nur für die nächste Runde“, nach dem Kauf „gilt für die nächste Runde“ (beim Wagen bleibt „mieten“/„gemietet“).
12. **Boxhandschuh** ersetzt die Schlag-Stufen vollständig: `punch` verschwindet aus `ShopItemId`, `Items` und `LevelItemId`; `upgradeValue` gibt es nur noch für die Taschenlampe.
13. **Reihenfolge in „Verteidigung“**: Pfefferspray, Ausweisdokumente, Leckerli (Spec §1.2). Pfefferspray ist damit Zeile 0 und eine Mengenzeile (wie bisher Leckerli an dieser Stelle).
14. **HUD**: Zeile mit dem Leben in dieser Reihenfolge: `Leckerli n`, `Spray n`, `Wagen`, `Karte`/`Karte+`, `Ausweis`.
15. **Determinismus-Test** mit Ereignissen bekommt das Spray in die Eingaben (alle drei Spieler mit 99 Ladungen), damit Stoß und Abklingzeit im Vergleich zweier Läufe stecken.

## Review Focus

1. **Stoß an der Wand** – ein Opfer direkt vor einer Wand darf nie in der Wand landen (sonst käme `walk` nicht mehr heraus), und schräg darf es an der Wand entlangrutschen. Test: Task 2 (`spray.test.ts`, "stops the knockback at a wall" und "slides along a wall on a diagonal knockback").
2. **Sprühende und Opfer auf demselben Punkt** – Richtung wäre 0/0 (NaN). Erwartung: Stoß 40 px nach rechts, keine NaN. Test: Task 2 ("pushes to the right when both stand on the same point").
3. **Opfer mit Schutz** – Erwartung: Ladung und Abklingzeit weg, kein Stoß, kein Schaden. Test: Task 2 ("uses a charge but neither pushes nor hurts a shielded victim").
4. **Ausweis gilt länger als eine Runde oder die Polizei kontrolliert trotzdem** – Erwartung: Polizei ignoriert den Halter, kontrolliert aber andere; nach der Runde ist er weg. Test: Task 3 (`npc.test.ts`, "ignores a player with id papers but checks another") und Task 4 (`roomSeries.test.ts`, "keeps the id papers for exactly one round").
5. **Eigene Figur des Opfers nach dem Stoß** (online) – Erwartung: kein Sprung, nach 500 ms im Stand weniger als 1 px daneben. Test: Task 7 (`prediction.test.ts`, "follows a 40 px knockback while standing").

## Dateien

| Datei | Aufgabe |
| --- | --- |
| `packages/core/src/types.ts`, `config.ts`, `shop.ts`, `fight.ts`, `sanitize.ts`, `snapshot.ts`, `game.ts`, `step.ts` | Katalog PR 2, Spray-Felder |
| `packages/core/src/movement.ts` | `shove` |
| `packages/core/src/spray.ts` (neu), `index.ts` | Pfefferspray |
| `packages/core/src/npc.ts` | Polizei ignoriert Ausweis |
| `packages/core/test/shop.test.ts`, `fight.test.ts`, `snapshot.test.ts`, `sanitize.test.ts`, `protocol.test.ts`, `determinism.test.ts`, `determinism-events.test.ts`, `spray.test.ts` (neu), `npc.test.ts` | |
| `packages/server/test/roomSeries.test.ts`, `handler.test.ts` | Ausweis, Spray-Kauf |
| `packages/client/src/input.ts`, `sources.ts`, `devices.ts`, `menuModel.ts`, `online.ts` | Spray-Taste |
| `packages/client/src/shopModel.ts` | neue Zeilen |
| `packages/client/src/text.ts`, `sprayView.ts` (neu), `scenes/GameScene.ts`, `soundEvents.ts`, `sound.ts` | HUD, Wolke, Ton |
| `packages/client/test/*` | siehe Tasks 5 bis 7 |
| `README.md` | Steuerung, Shop, Kampf, Polizei |

---

### Task 1: Kern – Katalog PR 2 und Spray-Felder

**Files:**
- Modify: `packages/core/src/types.ts` (`ShopItemId`, `Input`, `NO_INPUT`, `Player`)
- Modify: `packages/core/src/config.ts` (`ShopItemDef`, `fight`, neuer Block `spray`, `shop.items`)
- Modify: `packages/core/src/shop.ts` (`LevelItemId`, `noItems`, `unitOf`, `checkShopBuy`, `shopBuy`)
- Modify: `packages/core/src/fight.ts` (`punchDamage`)
- Modify: `packages/core/src/sanitize.ts`, `snapshot.ts`, `game.ts`
- Test: `packages/core/test/shop.test.ts`, `fight.test.ts`, `snapshot.test.ts`, `sanitize.test.ts`, `protocol.test.ts`, `determinism.test.ts`, `determinism-events.test.ts`

**Interfaces:**
- Consumes: PR 1 (`items`, `progressAfterRound`, `ShopKind` mit `count`).
- Produces: Namenstabelle (Typen, `CONFIG.spray`, `CONFIG.fight.gloveBonus`, `unitOf`, `punchDamage`); `Player.sprayHeld`, `Player.sprayCooldownMs` (in dieser Task ohne Wirkung, immer 0/false).

- [ ] **Step 1: Failing tests**

In `packages/core/test/shop.test.ts`:
- Test `has the four categories…`:

```ts
    expect(shopItemsOf('weapons')).toEqual(['glove']);
    expect(shopItemsOf('defense')).toEqual(['pepper', 'id_papers', 'dog_treat']);
    expect(SHOP_ITEM_IDS).toEqual(['bag', 'backpack', 'cart', 'flashlight', 'card', 'card_plus', 'glove', 'pepper', 'id_papers', 'dog_treat']);
```

  (statt der Zeilen für `weapons`, `defense` und `SHOP_ITEM_IDS`).
- Im Test `pins the start prices and limits` ergänzen:

```ts
    expect(items.glove).toMatchObject({ category: 'weapons', name: 'Boxhandschuh', kind: 'once', prices: [400] });
    expect(items.pepper).toMatchObject({ category: 'defense', name: 'Pfefferspray', kind: 'stack', prices: [300], max: 99, unit: 10 });
    expect(items.id_papers).toMatchObject({ category: 'defense', name: 'Ausweisdokumente', kind: 'once', prices: [300], perRound: true });
    expect(CONFIG.fight.gloveBonus).toBe(10);
    expect(CONFIG.spray).toEqual({ radius: 30, knockbackPx: 40, damage: 2, cooldownMs: 1000 });
```

- Im Test `recognises categories and items and nothing else` `'punch'` in die Liste `gone` aufnehmen.
- Test `keeps the punch levels under Waffen` ersetzen:

```ts
  it('sells the glove once', () => {
    const p = rich();
    expect(shopBuy(p, 'weapons', 'glove', 1)).toEqual({ ok: true, cost: 400 });
    expect(shopBuy(p, 'weapons', 'glove', 1)).toEqual({ ok: false, reason: 'maxed' });
  });

  it('sells pepper spray by the bottle, ten charges each, up to 99 charges', () => {
    const p = rich();
    expect(unitOf('pepper')).toBe(10);
    expect(unitOf('dog_treat')).toBe(1);
    expect(shopBuy(p, 'defense', 'pepper', 2)).toEqual({ ok: true, cost: 600 });
    expect(p.items.pepper).toBe(20);
    expect(shopBuy(p, 'defense', 'pepper', 8)).toEqual({ ok: false, reason: 'maxed' });
    expect(shopBuy(p, 'defense', 'pepper', 7)).toEqual({ ok: true, cost: 2100 });
    expect(p.items.pepper).toBe(90);
    expect(shopBuy(p, 'defense', 'pepper', 1)).toEqual({ ok: false, reason: 'maxed' });
    p.items.pepper = 89;
    expect(shopBuy(p, 'defense', 'pepper', 1)).toEqual({ ok: true, cost: 300 });
    expect(p.items.pepper).toBe(99);
  });

  it('sells id papers once for one round', () => {
    const p = rich();
    expect(shopBuy(p, 'defense', 'id_papers', 1)).toEqual({ ok: true, cost: 300 });
    expect(shopBuy(p, 'defense', 'id_papers', 1)).toEqual({ ok: false, reason: 'maxed' });
    p.items.cart = 1;
    expect(progressAfterRound(p).items).toMatchObject({ id_papers: 0, cart: 0 });
  });
```

  und `unitOf` in den Import aus `../src/shop` aufnehmen.
- Test `starts empty`: `expect(noItems()).toEqual({ bag: 0, backpack: 0, cart: 0, flashlight: 0, card: 0, card_plus: 0, glove: 0, pepper: 0, id_papers: 0, dog_treat: 0 });`
- Test `drops the rented cart after a round…`: im Literal `punch: 1` durch `glove: 1, pepper: 30, id_papers: 1` ersetzen und die Erwartung `expect(after.items).toEqual({ ...p.items, cart: 0, id_papers: 0 });`; Titel `'drops the rented cart and the id papers after a round and keeps everything else'`.

In `packages/core/test/fight.test.ts` den Test `adds the punch upgrade` ersetzen:

```ts
  it('hits 30 instead of 20 with the glove', () => {
    const s = setup();
    expect(punchDamage(s.players.p1)).toBe(20);
    s.players.p1.items.glove = 1;
    expect(punchDamage(s.players.p1)).toBe(30);
    runSteps(s, PUNCH, 1);
    expect(s.players.p2.health).toBeCloseTo(CONFIG.health.max - 30, 1);
  });
```

In `packages/core/test/snapshot.test.ts`:
- In `game()` `s.players.p2.items.punch = 2;` durch `s.players.p2.items.pepper = 20;` ersetzen und ergänzen: `s.players.p2.sprayCooldownMs = 700;` und `s.players.p2.sprayHeld = true;`.
- Neuer Test im ersten `describe`:

```ts
  it('shows the spray cooldown of a foreign player (the cloud) but not his spray key or charges', () => {
    const other = projectSnapshot(game(), 'p1').players.p2;
    expect(other.sprayCooldownMs).toBe(700);
    expect(other.sprayHeld).toBe(false);
    expect(other.items.pepper).toBe(0);
  });
```

- `PLAYER_KEYS`:

```ts
  const PLAYER_KEYS = [
    'actionHeld', 'attackCooldownMs', 'attackHeld', 'bottles', 'depositMs', 'earnedRound', 'earnedTotal',
    'health', 'id', 'items', 'lastFood', 'mode', 'money', 'robbed', 'searchProgressMs', 'searchSpotId',
    'shieldMs', 'spawn', 'sprayCooldownMs', 'sprayHeld', 'stealHeld', 'unconsciousMs', 'x', 'y',
  ];
```

In `packages/core/test/sanitize.test.ts`: Zeile mit `const i = …` → `const i = { moveX: -1, moveY: 1, action: true, steal: true, attack: true, spray: true };`; im Test `clamps out-of-range…` `spray: 'yes',` ins Objekt aufnehmen; Test `has attack off and no eat key…`:

```ts
  it('has attack and spray off and no eat key in NO_INPUT, and drops a sent eat key', () => {
    expect(NO_INPUT).toEqual({ moveX: 0, moveY: 0, action: false, steal: false, attack: false, spray: false });
    expect('eat' in sanitizeInput({ ...NO_INPUT, eat: true })).toBe(false);
  });
```

In `packages/core/test/protocol.test.ts` (Test `accepts input and sanitizes its payload`): `input: { moveX: 0, moveY: 0, action: true, steal: false, attack: false, spray: false },`.

In `packages/core/test/determinism.test.ts` in der Eingabe-Funktion hinter `attack: false,` die Zeile `spray: false,` einfügen. In `packages/core/test/determinism-events.test.ts` in `scripted` hinter `attack: tick % 97 < 3,` die Zeile `spray: tick % 151 < 2,` einfügen und in `play()` direkt nach `createGame(...)`: `for (const p of Object.values(s.players)) p.items.pepper = 99;`.

- [ ] **Step 2: Run, FAIL**

Run: `cd packages/core; npx vitest run test/shop.test.ts test/fight.test.ts test/snapshot.test.ts test/sanitize.test.ts`
Expected: FAIL.

- [ ] **Step 3: Typen**

`packages/core/src/types.ts`:

```ts
export type ShopItemId =
  | 'bag'
  | 'backpack'
  | 'cart'
  | 'flashlight'
  | 'card'
  | 'card_plus'
  | 'glove'
  | 'pepper'
  | 'id_papers'
  | 'dog_treat';
```

In `Input` hinter `attack` ergänzen:

```ts
  /** Pfefferspray-Taste gehalten (wirkt beim Drücken) */
  spray: boolean;
```

`export const NO_INPUT: Input = { moveX: 0, moveY: 0, action: false, steal: false, attack: false, spray: false };`

In `Player` hinter `attackHeld` und hinter `attackCooldownMs` ergänzen:

```ts
  /** Pfefferspray-Taste im vorigen Tick gedrückt, für die Flanke */
  sprayHeld: boolean;
```

```ts
  /** Restzeit, bis der Spieler wieder sprühen kann, 0 = bereit (öffentlich: andere sehen die Wolke) */
  sprayCooldownMs: number;
```

Den Kommentar an `items` ändern in `/** Besitz aus dem Shop (Taschen, Upgrades, Boxhandschuh, Spray-Ladungen, Ausweis, Leckerli) */`.

- [ ] **Step 4: `config.ts`**

In `ShopItemDef` hinter `max?` ergänzen:

```ts
  /** stack: so viel Bestand bringt ein gekauftes Stück (Pfefferspray: 10 Ladungen je Flasche), fehlt = 1 */
  unit?: number;
```

`fight` ersetzen:

```ts
  fight: {
    /** größter Abstand zum Opfer in Pixeln */
    radius: 20,
    /** so lange nach einem Schlag (auch ohne Treffer) kein neuer */
    cooldownMs: 600,
    /** Grundschaden */
    damage: 20,
    /** zusätzlicher Schaden mit Boxhandschuh */
    gloveBonus: 10,
  },
  /** Pfefferspray (Spec §4.2): nächster wacher Spieler in radius, Stoß knockbackPx weg, damage Leben, cooldownMs Pause */
  spray: {
    radius: 30,
    knockbackPx: 40,
    damage: 2,
    cooldownMs: 1000,
  },
```

In `shop.items` die Zeilen ab `/** values: zusätzlicher Schaden je Schlag */` bis vor `dog_treat` ersetzen:

```ts
      glove: { category: 'weapons', name: 'Boxhandschuh', kind: 'once', prices: [400], values: [] },
      /** Bestand = Ladungen; eine gekaufte Flasche bringt unit Ladungen */
      pepper: { category: 'defense', name: 'Pfefferspray', kind: 'stack', prices: [300], values: [], max: 99, unit: 10 },
      id_papers: { category: 'defense', name: 'Ausweisdokumente', kind: 'once', prices: [300], values: [], perRound: true },
```

- [ ] **Step 5: `shop.ts`**

- `export type LevelItemId = 'flashlight';`
- `noItems`:

```ts
export function noItems(): Items {
  return { bag: 0, backpack: 0, cart: 0, flashlight: 0, card: 0, card_plus: 0, glove: 0, pepper: 0, id_papers: 0, dog_treat: 0 };
}
```

- Hinter `maxOf` einfügen:

```ts
/** Bestand je gekauftem Stück (Pfefferspray: 10 Ladungen), sonst 1. */
export function unitOf(item: ShopItemId): number {
  return CONFIG.shop.items[item].unit ?? 1;
}
```

- In `checkShopBuy` die Zeile `if (owned + qty > maxOf(item)) return { ok: false, reason: 'maxed' };` ersetzen durch `if (owned + qty * unitOf(item) > maxOf(item)) return { ok: false, reason: 'maxed' };`.
- In `shopBuy` die Zeile `p.items[item as ShopItemId] += qty as number;` ersetzen durch:

```ts
  const id = item as ShopItemId;
  p.items[id] += (qty as number) * unitOf(id);
```

- [ ] **Step 6: `fight.ts`, `sanitize.ts`, `snapshot.ts`, `game.ts`**

`fight.ts`: Import `upgradeValue` entfernen und `punchDamage` ersetzen:

```ts
/** Schaden eines Schlags: Grundschaden, mit Boxhandschuh mehr (Spec §4.1). */
export function punchDamage(attacker: Pick<Player, 'items'>): number {
  return CONFIG.fight.damage + (attacker.items.glove > 0 ? CONFIG.fight.gloveBonus : 0);
}
```

`sanitize.ts`: im Rückgabeobjekt `spray: r.spray === true,` ergänzen.

`snapshot.ts`: im Literal `foreign` hinter `attackHeld: false,` `sprayHeld: false,` und hinter `attackCooldownMs: p.attackCooldownMs,` `sprayCooldownMs: p.sprayCooldownMs,` ergänzen.

`game.ts` (`newPlayer`): hinter `attackHeld: false,` `sprayHeld: false,` und hinter `attackCooldownMs: 0,` `sprayCooldownMs: 0,` ergänzen.

- [ ] **Step 7: Kern grün**

Run: `cd packages/core; npx vitest run; npx tsc --noEmit`
Expected: PASS, keine Typfehler. Meldet `tsc` ein Eingabe-Literal ohne `spray` in einer Testdatei, dort `spray: false` ergänzen.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/config.ts packages/core/src/shop.ts packages/core/src/fight.ts packages/core/src/sanitize.ts packages/core/src/snapshot.ts packages/core/src/game.ts packages/core/test/shop.test.ts packages/core/test/fight.test.ts packages/core/test/snapshot.test.ts packages/core/test/sanitize.test.ts packages/core/test/protocol.test.ts packages/core/test/determinism.test.ts packages/core/test/determinism-events.test.ts
git commit -m "feat(core): glove, pepper spray charges and id papers in the catalog; spray input

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Kern – Pfefferspray

**Files:**
- Modify: `packages/core/src/movement.ts` (neue Funktion `shove`), `packages/core/src/step.ts` (`updatePlayer`), `packages/core/src/index.ts`
- Create: `packages/core/src/spray.ts`, `packages/core/test/spray.test.ts`

**Interfaces:**
- Consumes: `CONFIG.spray`, `Player.sprayCooldownMs`/`sprayHeld`, `items.pepper` (Task 1), `damage` (`health.ts`), `boxBlocked`.
- Produces: `shove(map, p, ux, uy, px)`, `findSprayTarget(state, sprayer)`, `trySpray(state, sprayer)`.

- [ ] **Step 1: Failing tests**

`packages/core/test/spray.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { damage } from '../src/health';
import { boxBlocked } from '../src/map';
import { shove } from '../src/movement';
import { findSprayTarget, trySpray } from '../src/spray';
import type { GameState } from '../src/types';
import { input, newGame, runFor, runSteps, setSpot, teleport } from './helpers';

/** p1 (24,24), p2 (40,24): 16 px auseinander. Zeile 2 frei, Zeile 3 Wand (y ab 48), rechte Wand ab x = 176. */
const DUO = ['############', '#@@........#', '#..........#', '############'];

const SPRAY = { p1: input({ spray: true }) };
const RELEASE = { p1: input({}) };

function duo(): GameState {
  const s = newGame(DUO, ['p1', 'p2']);
  s.nextNpcMs = 1e9;
  s.players.p1.items.pepper = 10;
  return s;
}

describe('findSprayTarget', () => {
  it('takes the nearest awake other player within 30 px', () => {
    const s = newGame(['############', '#@@.@......#', '############'], ['p1', 'p2', 'p3']);
    expect(findSprayTarget(s, s.players.p1)?.id).toBe('p2');
    damage(s.players.p2, 1000);
    expect(findSprayTarget(s, s.players.p1)).toBeNull(); // p3 (x = 72) ist 48 px weg
    teleport(s, 'p3', { x: 54, y: 24 });
    expect(findSprayTarget(s, s.players.p1)?.id).toBe('p3');
  });
});

describe('spraying', () => {
  it('uses one charge, starts the cooldown, pushes the victim 40 px away and takes 2 health', () => {
    const s = duo();
    runSteps(s, SPRAY, 1);
    const [p1, p2] = [s.players.p1, s.players.p2];
    expect(p1.items.pepper).toBe(9);
    expect(p1.sprayCooldownMs).toBe(CONFIG.spray.cooldownMs);
    expect(p2.x).toBe(40 + CONFIG.spray.knockbackPx);
    expect(p2.y).toBe(24);
    expect(p2.health).toBeCloseTo(CONFIG.health.max - CONFIG.spray.damage, 1);
  });

  it('sprays only on the press, not while held, and not during the cooldown', () => {
    const s = duo();
    runSteps(s, SPRAY, 10);
    expect(s.players.p1.items.pepper).toBe(9);
    teleport(s, 'p2', { x: 40, y: 24 });
    runSteps(s, RELEASE, 1);
    runSteps(s, SPRAY, 1); // nach 220 ms: Abklingzeit läuft noch
    expect(s.players.p1.items.pepper).toBe(9);
    runFor(s, RELEASE, CONFIG.spray.cooldownMs);
    runSteps(s, SPRAY, 1);
    expect(s.players.p1.items.pepper).toBe(8);
  });

  it('does nothing without charges or without a target, and keeps the charge', () => {
    const s = duo();
    s.players.p1.items.pepper = 0;
    runSteps(s, SPRAY, 1);
    expect(s.players.p1.sprayCooldownMs).toBe(0);
    expect(s.players.p2.x).toBe(40);
    const t = duo();
    teleport(t, 'p2', { x: 120, y: 24 });
    runSteps(t, SPRAY, 1);
    expect(t.players.p1.items.pepper).toBe(10);
    expect(t.players.p1.sprayCooldownMs).toBe(0);
  });

  it('uses a charge but neither pushes nor hurts a shielded victim', () => {
    const s = duo();
    s.players.p2.shieldMs = 2000;
    runSteps(s, SPRAY, 1);
    expect(s.players.p1.items.pepper).toBe(9);
    expect(s.players.p1.sprayCooldownMs).toBe(CONFIG.spray.cooldownMs);
    expect(s.players.p2.x).toBe(40);
    expect(s.players.p2.health).toBeGreaterThan(CONFIG.health.max - 1);
  });

  it('stops the knockback at a wall', () => {
    const s = duo();
    teleport(s, 'p1', { x: 140, y: 24 });
    teleport(s, 'p2', { x: 160, y: 24 });
    runSteps(s, SPRAY, 1);
    expect(s.players.p2.x).toBe(170); // Box-Rand 175, die Wand beginnt bei 176
    expect(boxBlocked(s.map, s.players.p2.x, s.players.p2.y, CONFIG.playerHalf)).toBe(false);
  });

  it('slides along a wall on a diagonal knockback', () => {
    const s = duo();
    teleport(s, 'p2', { x: 40, y: 40 }); // 22,6 px schräg unter p1
    runSteps(s, SPRAY, 1);
    const p2 = s.players.p2;
    expect(p2.y).toBeGreaterThan(42);
    expect(p2.y).toBeLessThan(43); // Wand ab y = 48
    expect(p2.x).toBeCloseTo(40 + CONFIG.spray.knockbackPx * Math.SQRT1_2, 6);
    expect(boxBlocked(s.map, p2.x, p2.y, CONFIG.playerHalf)).toBe(false);
  });

  it('pushes to the right when both stand on the same point', () => {
    const s = duo();
    teleport(s, 'p2', { x: 24, y: 24 });
    runSteps(s, SPRAY, 1);
    expect(s.players.p2.x).toBe(24 + CONFIG.spray.knockbackPx);
    expect(s.players.p2.y).toBe(24);
    expect(Number.isNaN(s.players.p2.x)).toBe(false);
  });

  it('knocks a victim with 2 health out where he was pushed', () => {
    const s = duo();
    s.players.p2.health = 1.5;
    runSteps(s, SPRAY, 1);
    expect(s.players.p2.mode).toBe('unconscious');
    expect(s.players.p2.x).toBe(80);
  });

  it('cancels the own search and the search of the victim', () => {
    const s = newGame(['############', '#@b@.......#', '#..........#', '############'], ['p1', 'p2']);
    s.nextNpcMs = 1e9;
    s.players.p1.items.pepper = 10;
    teleport(s, 'p2', { x: 52, y: 24 }); // 12 px vom Spot (x = 40), 28 px von p1: in Sprühweite
    setSpot(s, 0, { plastic: 2 });
    runSteps(s, { p1: input({ action: true }), p2: input({ action: true }) }, 5);
    expect(s.players.p1.mode).toBe('searching');
    expect(s.players.p2.mode).toBe('searching');
    runSteps(s, { p1: input({ action: true, spray: true }), p2: input({ action: true }) }, 1);
    expect(s.players.p1.searchSpotId).toBeNull();
    expect(s.players.p2.searchSpotId).toBeNull();
  });

  it('ignores the spray key while unconscious', () => {
    const s = duo();
    damage(s.players.p1, 1000);
    runSteps(s, SPRAY, 1);
    expect(s.players.p1.items.pepper).toBe(10);
    expect(trySpray(s, s.players.p2)).toBe(false); // p2 hat keine Ladung
  });
});

describe('shove', () => {
  it('moves pixel by pixel and stops each axis at its wall', () => {
    const s = duo();
    // Oben: Box-Rand y − 5; die Wand (Zeile 0) reicht bis y = 16, also ist y = 21 die kleinste freie Mitte
    const p = { x: 40, y: 24 };
    shove(s.map, p, 0, -1, 40);
    expect(p).toEqual({ x: 40, y: 21 });
    const q = { x: 40, y: 24 };
    shove(s.map, q, 1, 0, 0);
    expect(q).toEqual({ x: 40, y: 24 });
  });
});
```

- [ ] **Step 2: Run, FAIL**

Run: `cd packages/core; npx vitest run test/spray.test.ts`
Expected: FAIL (`../src/spray` fehlt).

- [ ] **Step 3: `shove` in `movement.ts`**

Ans Ende von `packages/core/src/movement.ts`:

```ts
/**
 * Stoß (Pfefferspray, Spec §4.2): bis zu `px` Einzelschritte zu je 1 px in Richtung (ux, uy) (Einheitsvektor),
 * je Schritt erst x, dann y, mit derselben Kollision wie walk. Eine blockierte Achse bleibt für den Rest stehen,
 * die andere läuft weiter (rutscht an der Wand entlang).
 */
export function shove(map: MapData, p: Point, ux: number, uy: number, px: number): void {
  let blockedX = ux === 0;
  let blockedY = uy === 0;
  for (let i = 0; i < px && !(blockedX && blockedY); i++) {
    if (!blockedX) {
      if (free(map, p.x + ux, p.y)) p.x += ux;
      else blockedX = true;
    }
    if (!blockedY) {
      if (free(map, p.x, p.y + uy)) p.y += uy;
      else blockedY = true;
    }
  }
}
```

Import in Zeile 4 erweitern: `import type { Input, MapData, Player, Point } from './types';`.

- [ ] **Step 4: `spray.ts`**

`packages/core/src/spray.ts`:

```ts
import { CONFIG } from './config';
import { distance } from './economy';
import { damage } from './health';
import { shove } from './movement';
import type { GameState, Player } from './types';

/** Nächster wacher anderer Spieler höchstens CONFIG.spray.radius entfernt. Schutz zählt nicht. Gleichstand: Reihenfolge der Spieler. */
export function findSprayTarget(state: GameState, sprayer: Player): Player | null {
  let best: Player | null = null;
  let bestDist = Infinity;
  for (const id of Object.keys(state.players)) {
    const victim = state.players[id];
    if (victim.id === sprayer.id || victim.unconsciousMs > 0) continue;
    const d = distance(sprayer, victim);
    if (d <= CONFIG.spray.radius && d < bestDist) {
      best = victim;
      bestDist = d;
    }
  }
  return best;
}

/**
 * Sprühen im Schritt, in dem die Spray-Taste neu gedrückt wurde (Spec §4.2). Nur mit Ladung, ohne Abklingzeit
 * und mit Ziel; sonst passiert nichts (keine Ladung, keine Abklingzeit). Dann: eine Ladung weg, Abklingzeit,
 * und das Opfer wird (ohne Schutz) knockbackPx weggestoßen und verliert CONFIG.spray.damage Leben.
 * Stehen beide auf demselben Punkt, geht der Stoß nach rechts. Gibt true zurück, wenn gesprüht wurde.
 */
export function trySpray(state: GameState, sprayer: Player): boolean {
  if (sprayer.sprayCooldownMs > 0 || sprayer.items.pepper <= 0) return false;
  const target = findSprayTarget(state, sprayer);
  if (target === null) return false;
  sprayer.items.pepper--;
  sprayer.sprayCooldownMs = CONFIG.spray.cooldownMs;
  if (target.shieldMs > 0) return true;
  const d = distance(sprayer, target);
  const ux = d > 0 ? (target.x - sprayer.x) / d : 1;
  const uy = d > 0 ? (target.y - sprayer.y) / d : 0;
  shove(state.map, target, ux, uy, CONFIG.spray.knockbackPx);
  damage(target, CONFIG.spray.damage);
  return true;
}
```

In `packages/core/src/index.ts` hinter `export * from './fight';` die Zeile `export * from './spray';` einfügen.

- [ ] **Step 5: `step.ts`**

Import ergänzen: `import { trySpray } from './spray';`. In `updatePlayer` hinter den Zeilen für `attackPressed`/`attackHeld`:

```ts
  const sprayPressed = input.spray && !p.sprayHeld;
  p.sprayHeld = input.spray;
```

hinter `p.attackCooldownMs = Math.max(0, p.attackCooldownMs - dt);`:

```ts
  p.sprayCooldownMs = Math.max(0, p.sprayCooldownMs - dt);
```

und hinter `if (attackPressed && tryAttack(state, p)) cancelSearch(p);`:

```ts
  // Sprühen geht auch im Laufen; die eigene Suche bricht ab
  if (sprayPressed && trySpray(state, p)) cancelSearch(p);
```

- [ ] **Step 6: Run, PASS**

Run: `cd packages/core; npx vitest run; npx tsc --noEmit`
Expected: PASS (auch `determinism-events.test.ts` mit Spray in den Eingaben), keine Typfehler.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/movement.ts packages/core/src/spray.ts packages/core/src/step.ts packages/core/src/index.ts packages/core/test/spray.test.ts
git commit -m "feat(core): pepper spray pushes the nearest player 40 px away and takes 2 health

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Kern – Polizei ignoriert Ausweisdokumente

**Files:**
- Modify: `packages/core/src/npc.ts` (`wants`)
- Test: `packages/core/test/npc.test.ts` (Block `describe('police')`)

**Interfaces:**
- Consumes: `items.id_papers` (Task 1).
- Produces: Polizei-Verhalten aus Spec §4.3.

- [ ] **Step 1: Failing tests**

Im Block `describe('police', …)` von `packages/core/test/npc.test.ts` hinter `confiscates half the bottles…` einfügen:

```ts
  it('ignores a player with id papers: no chase, no check, no confiscation', () => {
    const s = carrying();
    s.players.p1.items.id_papers = 1;
    const cop = addNpc(s, 'police', 40, 24);
    runFor(s, {}, CONFIG.npc.police.checkMs + 500);
    expect(isBeingChecked(s, 'p1')).toBe(false);
    expect(totalBottles(s.players.p1.bottles)).toBe(4);
    expect(cop.targetId).toBeNull();
  });

  it('ignores a player with id papers but checks another', () => {
    const s = quiet(newGame(['############', '#@..@......#', '############'], ['p1', 'p2']));
    for (const id of ['p1', 'p2']) {
      s.players[id].items.bag = 3;
      s.players[id].bottles = { plastic: 4, glass: 0, crate: 0 };
    }
    s.players.p1.items.id_papers = 1;
    const cop = addNpc(s, 'police', 40, 24); // p1 16 px, p2 32 px entfernt
    runSteps(s, {}, 5, 20);
    expect(cop.targetId).toBe('p2');
  });
```

- [ ] **Step 2: Run, FAIL**

Run: `cd packages/core; npx vitest run test/npc.test.ts -t "id papers"`
Expected: FAIL.

- [ ] **Step 3: Implementierung**

In `packages/core/src/npc.ts` den Doc-Kommentar von `wants` in der letzten Zeile ergänzen: `Polizei: trägt Flaschen und hat keine Ausweisdokumente (beliebig viele Polizisten dürfen denselben Spieler kontrollieren).` und die Zeile

```ts
  if (npc.kind === 'police') return totalBottles(p.bottles) > 0;
```

ersetzen durch:

```ts
  if (npc.kind === 'police') return p.items.id_papers === 0 && totalBottles(p.bottles) > 0;
```

- [ ] **Step 4: Run, PASS**

Run: `cd packages/core; npx vitest run; npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/npc.ts packages/core/test/npc.test.ts
git commit -m "feat(core): police leave players with id papers alone

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Server – Ausweis für eine Runde, Spray kaufen

**Files:**
- Test: `packages/server/test/roomSeries.test.ts`, `packages/server/test/handler.test.ts`
- (Kein Produktcode: `Room.endRound` benutzt seit PR 1 `progressAfterRound`, das `perRound` generisch behandelt.)

**Interfaces:**
- Consumes: `progressAfterRound`, `unitOf`, Katalog PR 2.
- Produces: Tests für Spec §4.3 und §1.6 auf dem Server.

- [ ] **Step 1: Tests**

In `packages/server/test/roomSeries.test.ts` im Block mit `inShop()` hinter `rents the cart for exactly one round` einfügen:

```ts
  it('keeps the id papers for exactly one round', () => {
    const { room, members, endRound } = inShop();
    expect(room.shopBuy(members[0], 'defense', 'id_papers', 1).ok).toBe(true);
    for (const m of members) room.setReady(m, true);
    expect(room.state!.players.p1.items.id_papers).toBe(1);
    endRound();
    expect(room.progress.get('p1')!.items.id_papers).toBe(0);
  });

  it('sells pepper spray as ten charges per bottle and keeps unused charges', () => {
    const { room, members, conns, endRound } = inShop();
    expect(room.shopBuy(members[0], 'defense', 'pepper', 2).ok).toBe(true);
    expect(conns[0].last('shopState').you).toMatchObject({ money: 400, items: { pepper: 20 } });
    expect(room.shopBuy(members[0], 'defense', 'pepper', 9)).toMatchObject({ ok: false, code: 'cannot_buy', message: 'Mehr geht nicht.' });
    for (const m of members) room.setReady(m, true);
    room.state!.players.p1.items.pepper = 13;
    endRound();
    expect(room.progress.get('p1')!.items.pepper).toBe(13);
  });
```

Im Test `carries bought items into the next round` bleibt alles (kein `punch`).

In `packages/server/test/handler.test.ts` hinter dem Kauf `send(sa, a, { t: 'shopBuy', category: 'defense', item: 'dog_treat', qty: 2 });` und seiner Erwartung einfügen:

```ts
    send(sa, a, { t: 'shopBuy', category: 'weapons', item: 'glove', qty: 1 });
    expect(a.sent.at(-1)).toMatchObject({ t: 'error', code: 'cannot_buy', message: 'Nicht genug Geld.' });
    send(sa, a, { t: 'shopBuy', category: 'weapons', item: 'punch', qty: 1 });
    expect(a.sent.at(-1)).toMatchObject({ t: 'error', code: 'bad_message' });
```

(Der Spieler hat dort 500 − 200 = 300 ct; der Boxhandschuh kostet 400.)

- [ ] **Step 2: Server grün**

Run: `cd packages/server; npx vitest run; npx tsc --noEmit`
Expected: PASS, keine Typfehler. Schlägt eine Erwartung zum Geld fehl, weil der Testraum anders startet: die Zahl im Test aus dem tatsächlichen Startgeld (`inShop()`: 1000 ct) herleiten, nicht den Code ändern.

- [ ] **Step 3: Commit**

```bash
git add packages/server/test/roomSeries.test.ts packages/server/test/handler.test.ts
git commit -m "test(server): id papers last one round, pepper spray sells ten charges per bottle

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Client – Spray-Taste

**Files:**
- Modify: `packages/client/src/input.ts`, `sources.ts`, `devices.ts`, `menuModel.ts`, `online.ts`
- Test: `packages/client/test/input.test.ts`, `sources.test.ts`, `menuModel.test.ts`, `shopNav.test.ts`, `online.test.ts`

**Interfaces:**
- Consumes: `Input.spray` (Task 1).
- Produces: `KeyState.spray`, `KeyLabels.spray`, `PAD_LABELS = { action: 'A', steal: 'B', attack: 'X', spray: 'Y' }`, Layouts mit `spray: 'C'`/`'COMMA'`.

- [ ] **Step 1: Failing tests**

`packages/client/test/input.test.ts`: in `NONE` `spray: false,` ergänzen; den Test `passes action, steal and attack through…`:

```ts
  it('passes action, steal, attack and spray through as held keys', () => {
    expect(buildInput({ ...NONE, action: true, steal: true, attack: true, spray: true })).toEqual({
      moveX: 0,
      moveY: 0,
      action: true,
      steal: true,
      attack: true,
      spray: true,
    });
    expect(buildInput(NONE)).toEqual({ moveX: 0, moveY: 0, action: false, steal: false, attack: false, spray: false });
  });
```

`packages/client/test/sources.test.ts`:

```ts
  it('maps buttons: A action, B steal, X attack, Y spray; the shoulders do nothing', () => {
    expect(padToHeld({ ...IDLE, a: true })).toMatchObject({ action: true, attack: false, spray: false });
    expect(padToHeld({ ...IDLE, x: true })).toMatchObject({ attack: true, spray: false });
    expect(padToHeld({ ...IDLE, y: true })).toMatchObject({ spray: true, attack: false });
    expect(padToHeld({ ...IDLE, l1: true, r1: true })).toEqual(padToHeld(IDLE));
  });

  it('labels the pad buttons like padToHeld maps them', () => {
    expect(PAD_LABELS).toEqual({ action: 'A', steal: 'B', attack: 'X', spray: 'Y' });
  });
```

`packages/client/test/menuModel.test.ts`:

```ts
  it('names steal, attack and spray and no buy or eat keys', () => {
    expect(lines[0]).toBe('Tastatur 1 (WASD, E): Aktion E, Ausrauben Q, Schlagen F, Pfefferspray C');
    expect(lines[1]).toBe('Tastatur 2 (Pfeile, Enter): Aktion Enter, Ausrauben /, Schlagen ., Pfefferspray ,');
    expect(lines[2]).toBe('Gamepad (Stick/Steuerkreuz): Aktion A, Ausrauben B, Schlagen X, Pfefferspray Y');
  });
```

`packages/client/test/shopNav.test.ts`: `NONE` um `spray: false` ergänzen; Test `never uses steal or attack` → `'never uses steal, attack or spray'` mit `k({ steal: true, attack: true, spray: true })`.

`packages/client/test/online.test.ts`, Test `sends a changed attack or steal key at once…`: Titel `'sends a changed attack, steal or spray key at once, not only with the heartbeat'`, vor `const inputs = …` ergänzen:

```ts
    conn.setInput('p1', { ...NO_INPUT, spray: true });
    conn.update(10);
```

und die Erwartungen auf `before + 3`, `inputs.at(-3)!.input.attack`, `inputs.at(-2)!.input.steal` und zusätzlich `expect(inputs.at(-1)!.input.spray).toBe(true);` umstellen.

- [ ] **Step 2: Run, FAIL**

Run: `cd packages/client; npx vitest run test/input.test.ts test/sources.test.ts test/menuModel.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementierung**

`input.ts`: in `KeyState` hinter `attack`:

```ts
  /** Pfefferspray-Taste gehalten */
  spray: boolean;
```

und in `buildInput` `spray: k.spray,`. Kommentar oben: `Flanken (Ausrauben, Schlagen, Sprühen) erkennt der Kern`.

`sources.ts`: in `KeyLabels` `spray: string;`; `export const PAD_LABELS: KeyLabels = { action: 'A', steal: 'B', attack: 'X', spray: 'Y' };`; Kommentar `/** A = Aktion, B = Ausrauben, X = Schlagen, Y = Pfefferspray. Stick und Steuerkreuz laufen. Schultertasten sind frei. */`; in `padToHeld` `spray: s.y,`.

`devices.ts`: in `KeyboardLayout` `spray: string;`; Layout 1 `spray: 'C',` und Labels `{ action: 'E', steal: 'Q', attack: 'F', spray: 'C' }`; Layout 2 `spray: 'COMMA',` und Labels `{ action: 'Enter', steal: '/', attack: '.', spray: ',' }`; in `KeyboardSource` `layout.spray` an `names` anhängen und in `read()` `spray: k[l.spray].isDown,`.

`menuModel.ts`:

```ts
  const fmt = (l: KeyLabels): string => `Aktion ${l.action}, Ausrauben ${l.steal}, Schlagen ${l.attack}, Pfefferspray ${l.spray}`;
```

`online.ts` `sameInput`: `&& a.spray === b.spray` anhängen.

- [ ] **Step 4: Run, PASS**

Run: `cd packages/client; npx vitest run test/input.test.ts test/sources.test.ts test/menuModel.test.ts test/shopNav.test.ts test/online.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/input.ts packages/client/src/sources.ts packages/client/src/devices.ts packages/client/src/menuModel.ts packages/client/src/online.ts packages/client/test/input.test.ts packages/client/test/sources.test.ts packages/client/test/menuModel.test.ts packages/client/test/shopNav.test.ts packages/client/test/online.test.ts
git commit -m "feat(client): pepper spray key on C, comma and gamepad Y

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Client – Shop-Zeilen für Boxhandschuh, Pfefferspray, Ausweis

**Files:**
- Modify: `packages/client/src/shopModel.ts` (`effectText`, `infoText`, `maxQty`, `itemRow`)
- Test: `packages/client/test/shopModel.test.ts`, `packages/client/test/shopGuard.test.ts`

**Interfaces:**
- Consumes: `unitOf`, `maxOf`, `ownedOf`, `CONFIG.spray`, `CONFIG.fight.gloveBonus` (Task 1).
- Produces: Zeilentexte wie unten.

- [ ] **Step 1: Failing tests**

In `packages/client/test/shopModel.test.ts`:
- Tests, die Verteidigung Zeile 0 als Leckerli benutzen (`changes the quantity with left and right only on the treat row` bzw. `…on a stack row…`, `never goes below 1 or above the free stock`, `buys the selected entry…`): vor der ersten Aktion `m.selectRow(2); // Leckerli` einfügen (Verteidigung: Pfefferspray, Ausweisdokumente, Leckerli). Im Test zur Mengenänderung führt `m.move('down', p)` danach auf „Bereit“ (Zeile 3), das bleibt so.
- Test `keeps the punch levels under Waffen` ersetzen und neue Tests im Block `ShopModel rows`:

```ts
  it('sells the glove under Waffen', () => {
    const m = new ShopModel();
    const p = rich();
    m.selectCategory(2);
    expect(m.rows(p)[0]).toMatchObject({ name: 'Boxhandschuh', detail: '+10 Schaden je Schlag', price: '4,00 €', state: 'normal' });
    p.items.glove = 1;
    expect(m.rows(p)[0]).toMatchObject({ detail: 'vorhanden', price: '', state: 'grey' });
  });

  it('sells pepper spray by the bottle and shows the charges', () => {
    const m = new ShopModel();
    const p = rich();
    p.items.pepper = 15;
    m.selectCategory(3);
    m.changeQty(1, p);
    expect(m.rows(p)[0]).toMatchObject({ name: 'Pfefferspray', detail: '10 Ladungen je Flasche  ◄ 2 ►  (hast 15 Ladungen)', price: '6,00 €' });
    expect(m.maxQty(p)).toBe(8);
    expect(m.activate(p)).toEqual({ kind: 'buy', category: 'defense', item: 'pepper', qty: 2 });
    p.items.pepper = 95;
    expect(m.maxQty(p)).toBe(1);
    expect(m.rows(p)[0]).toMatchObject({ state: 'grey' });
  });

  it('offers the id papers for the next round only', () => {
    const m = new ShopModel();
    const p = rich();
    m.selectCategory(3);
    expect(m.rows(p)[1]).toMatchObject({ name: 'Ausweisdokumente', detail: 'keine Polizeikontrolle, nur für die nächste Runde', price: '3,00 €' });
    p.items.id_papers = 1;
    expect(m.rows(p)[1]).toMatchObject({ detail: 'gilt für die nächste Runde', price: '', state: 'grey' });
  });
```

- Test `shows quantity and total only on the selected treat row`: vor `m.changeQty(2, p);` die Zeile `m.selectRow(2);` einfügen, die Erwartungen auf `m.rows(p)[2]` umstellen und statt `m.selectRow(1)` `m.selectRow(0)` benutzen (dann ist Leckerli nicht gewählt: `rows[2]` hat `detail: '(hast 4)'`).

In `packages/client/test/shopGuard.test.ts` im Test `accepts a full progress and copies it` das Literal ersetzen:

```ts
    p.items = { bag: 4, backpack: 2, cart: 1, flashlight: 3, card: 1, card_plus: 1, glove: 1, pepper: 99, id_papers: 1, dog_treat: 99 };
```

und in `rejects broken values` ergänzen: `{ ...ok, items: { ...ok.items, pepper: 100 } },`.

- [ ] **Step 2: Run, FAIL**

Run: `cd packages/client; npx vitest run test/shopModel.test.ts test/shopGuard.test.ts`
Expected: FAIL (`shopGuard` kann schon grün sein, `shopModel` nicht).

- [ ] **Step 3: Implementierung**

`shopModel.ts`:
- Import um `unitOf` erweitern.
- `effectText`: den `case 'punch'` löschen.
- In `infoText` vor `default` ergänzen:

```ts
    case 'glove':
      return `+${CONFIG.fight.gloveBonus} Schaden je Schlag`;
    case 'pepper':
      return `${unitOf('pepper')} Ladungen je Flasche`;
    case 'id_papers':
      return 'keine Polizeikontrolle, nur für die nächste Runde';
```

- `maxQty`:

```ts
  /** Größte wählbare Menge: so viele Stück, wie bis zur Grenze passen (Pfefferspray: Flaschen zu je 10 Ladungen), sonst 1. */
  maxQty(p: Progress): number {
    const item = this.currentItem();
    if (!item || CONFIG.shop.items[item].kind !== 'stack') return 1;
    return Math.max(1, Math.floor((maxOf(item) - ownedOf(p, item)) / unitOf(item)));
  }
```

- In `itemRow`, Zweig `once`: `def.perRound ? 'gemietet für die nächste Runde' : 'vorhanden'` ersetzen durch `item === 'cart' ? 'gemietet für die nächste Runde' : def.perRound ? 'gilt für die nächste Runde' : 'vorhanden'`.
- Im Zweig `stack`:

```ts
      const qty = selected ? `◄ ${this.qty} ►  ` : '';
      const has = item === 'pepper' ? `(hast ${owned} Ladungen)` : `(hast ${owned})`;
      row.detail = `${info ? `${info}  ` : ''}${qty}${has}`;
```

- [ ] **Step 4: Run, PASS**

Run: `cd packages/client; npx vitest run test/shopModel.test.ts test/shopGuard.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/shopModel.ts packages/client/test/shopModel.test.ts packages/client/test/shopGuard.test.ts
git commit -m "feat(client): shop rows for glove, pepper spray charges and id papers

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Client – HUD, Spray-Wolke, Ton, Vorhersage

**Files:**
- Create: `packages/client/src/sprayView.ts`, `packages/client/test/sprayView.test.ts`
- Modify: `packages/client/src/text.ts` (`itemParts`, `hintLines`), `packages/client/src/soundEvents.ts`, `packages/client/src/sound.ts` (Rezept), `packages/client/src/scenes/GameScene.ts` (Wolken)
- Test: `packages/client/test/text.test.ts`, `soundEvents.test.ts`, `sound.test.ts`, `prediction.test.ts`

**Interfaces:**
- Consumes: `findSprayTarget`, `CONFIG.spray`, `Player.sprayCooldownMs`, `items.pepper`, `items.id_papers`.
- Produces: `SPRAY_SHOW_MS`, `SPRAY_COLOR`, `isSpraying(p: Pick<Player, 'sprayCooldownMs'>): boolean`, `sprayCloudRadius(p: Pick<Player, 'sprayCooldownMs'>): number`; `SoundId` mit `'spray'`.

- [ ] **Step 1: Failing tests**

`packages/client/test/sprayView.test.ts`:

```ts
import { CONFIG } from '@pfandraiders/core';
import { describe, expect, it } from 'vitest';
import { isSpraying, SPRAY_SHOW_MS, sprayCloudRadius } from '../src/sprayView';

describe('sprayView', () => {
  it('shows the cloud for the first 300 ms after spraying', () => {
    const cd = CONFIG.spray.cooldownMs;
    expect(SPRAY_SHOW_MS).toBe(300);
    expect(isSpraying({ sprayCooldownMs: cd })).toBe(true);
    expect(isSpraying({ sprayCooldownMs: cd - 299 })).toBe(true);
    expect(isSpraying({ sprayCooldownMs: cd - 300 })).toBe(false);
    expect(isSpraying({ sprayCooldownMs: 0 })).toBe(false);
  });

  it('grows the cloud from 40 % to the full spray radius', () => {
    const cd = CONFIG.spray.cooldownMs;
    expect(sprayCloudRadius({ sprayCooldownMs: cd })).toBeCloseTo(CONFIG.spray.radius * 0.4, 6);
    expect(sprayCloudRadius({ sprayCooldownMs: cd - SPRAY_SHOW_MS })).toBeCloseTo(CONFIG.spray.radius, 6);
    expect(sprayCloudRadius({ sprayCooldownMs: 0 })).toBeCloseTo(CONFIG.spray.radius, 6);
  });
});
```

In `packages/client/test/text.test.ts`:
- `KEYS` und `KEYS2` um `spray: 'C'` bzw. `spray: ','` ergänzen.
- Test `shows the items after the health` ersetzen:

```ts
  it('shows the items after the health', () => {
    const s = duo();
    s.players.p1.items = { ...s.players.p1.items, dog_treat: 2, pepper: 17, cart: 1, card: 1, id_papers: 1 };
    expect(statusLines(s, s.players.p1)[1]).toBe('Leben 100/100   Leckerli 2   Spray 17   Wagen   Karte   Ausweis');
    s.players.p1.items.card_plus = 1;
    expect(statusLines(s, s.players.p1)[1]).toBe('Leben 100/100   Leckerli 2   Spray 17   Wagen   Karte+   Ausweis');
  });

  it('offers the spray with charges and a target in reach, not during its cooldown', () => {
    const s = duo();
    expect(hintLines(s, s.players.p1, KEYS).some((l) => l.includes('Pfefferspray'))).toBe(false);
    s.players.p1.items.pepper = 3;
    expect(hintLines(s, s.players.p1, KEYS)).toContain('[C] Pfefferspray (noch 3)');
    s.players.p1.sprayCooldownMs = 500;
    expect(hintLines(s, s.players.p1, KEYS).some((l) => l.includes('Pfefferspray'))).toBe(false);
  });
```

In `packages/client/test/soundEvents.test.ts` am Ende des Blocks `describe('detectSounds', …)` einfügen:

```ts
  it('plays spray for the sprayer and for a victim next to him', () => {
    const p = next(fresh(), (s) => {
      s.players.b.x = s.players.a.x + 16;
      s.players.b.y = s.players.a.y;
    });
    const n = next(p, (s) => {
      s.players.a.sprayCooldownMs = CONFIG.spray.cooldownMs;
      s.players.b.x += CONFIG.spray.knockbackPx;
      s.players.b.health -= CONFIG.spray.damage;
    });
    expect(detectSounds(p, n, ['a'])).toEqual(['spray']);
    expect(detectSounds(p, n, ['b'])).toEqual(['spray']);
    const far = next(fresh(), (s) => {
      s.players.b.x = s.players.a.x + 200;
    });
    expect(detectSounds(far, next(far, (s) => { s.players.a.sprayCooldownMs = CONFIG.spray.cooldownMs; }), ['b'])).toEqual([]);
  });
```

In `packages/client/test/sound.test.ts` im Test mit der Liste aller Sounds `'spray'` an die Liste anhängen und `expect(ctx.createBufferSource).toHaveBeenCalledTimes(3); // bite, punch und spray` setzen.

In `packages/client/test/prediction.test.ts` im Block `describe('Predictor unit behaviour', …)` einfügen:

```ts
  it('follows a 40 px knockback while standing: no jump, less than 1 px off after ten snapshots', () => {
    const pr = new Predictor();
    pr.reset({ x: 100, y: 100 });
    for (let t = 0; t <= 200; t += 20) pr.step(20, NO_INPUT, undefined, MAP, t);
    pr.noteSent(1, 100);
    const server = { x: 100 + CONFIG.spray.knockbackPx, y: 100 };
    pr.onSnapshot(server, 1, false, 200);
    for (let i = 1; i < 10; i++) {
      const t = 200 + i * 50;
      pr.step(50, NO_INPUT, undefined, MAP, t);
      pr.onSnapshot(server, 1, false, t);
    }
    expect(pr.snaps).toBe(0);
    expect(Math.abs(pr.position!.x - server.x)).toBeLessThan(1);
    expect(pr.position!.y).toBe(100);
  });
```

(`CONFIG` ist in `prediction.test.ts` schon importiert.)

- [ ] **Step 2: Run, FAIL**

Run: `cd packages/client; npx vitest run test/sprayView.test.ts test/text.test.ts test/soundEvents.test.ts test/sound.test.ts test/prediction.test.ts`
Expected: FAIL (`sprayView` fehlt, Texte, Ton). Der Vorhersage-Test kann schon grün sein; er pinnt Ruling 10.

- [ ] **Step 3: `sprayView.ts`**

`packages/client/src/sprayView.ts`:

```ts
import { CONFIG } from '@pfandraiders/core';
import type { Player } from '@pfandraiders/core';

/** So lange nach dem Sprühen ist die Wolke zu sehen (auch für Fremde: sprayCooldownMs ist öffentlich). */
export const SPRAY_SHOW_MS = 300;
/** Farbe der Wolke (orange) */
export const SPRAY_COLOR = 0xff7043;

export function isSpraying(p: Pick<Player, 'sprayCooldownMs'>): boolean {
  return p.sprayCooldownMs > CONFIG.spray.cooldownMs - SPRAY_SHOW_MS;
}

/** Radius der Wolke: wächst in SPRAY_SHOW_MS von 40 % auf den vollen Sprühradius. */
export function sprayCloudRadius(p: Pick<Player, 'sprayCooldownMs'>): number {
  const t = Math.min(1, Math.max(0, (CONFIG.spray.cooldownMs - p.sprayCooldownMs) / SPRAY_SHOW_MS));
  return CONFIG.spray.radius * (0.4 + 0.6 * t);
}
```

- [ ] **Step 4: `text.ts`**

Import um `findSprayTarget` erweitern. `itemParts`:

```ts
function itemParts(p: Player): string[] {
  const parts: string[] = [];
  if (p.items.dog_treat > 0) parts.push(`Leckerli ${p.items.dog_treat}`);
  if (p.items.pepper > 0) parts.push(`Spray ${p.items.pepper}`);
  if (p.items.cart > 0) parts.push('Wagen');
  if (p.items.card_plus > 0) parts.push('Karte+');
  else if (p.items.card > 0) parts.push('Karte');
  if (p.items.id_papers > 0) parts.push('Ausweis');
  return parts;
}
```

In `hintLines` hinter der Zeile mit `Schlagen`:

```ts
  if (p.items.pepper > 0 && p.sprayCooldownMs === 0 && findSprayTarget(state, p)) {
    lines.push(`[${labels.spray}] Pfefferspray (noch ${p.items.pepper})`);
  }
```

- [ ] **Step 5: Ton**

`soundEvents.ts`:
- `SoundId` um `| 'spray'` erweitern.
- Neben `PUNCH_NEAR`: `const SPRAY_NEAR = CONFIG.spray.radius + 6;`
- In der Schleife über die eigenen Spieler hinter `if (p.attackCooldownMs > q.attackCooldownMs) out.add('punch');`:

```ts
    if (p.sprayCooldownMs > q.sprayCooldownMs || sprayedNear(prev, next, q)) out.add('spray');
```

- Hinter `punchedNear`:

```ts
/** Hat ein anderer Spieler nahe der vorigen Position von `p` in diesem Schritt gesprüht (Abklingzeit sprang hoch)? */
function sprayedNear(prev: GameState, next: GameState, p: Player): boolean {
  return Object.values(next.players).some((o) => {
    const before = prev.players[o.id];
    return (
      o.id !== p.id &&
      before !== undefined &&
      o.sprayCooldownMs > before.sprayCooldownMs &&
      Math.hypot(before.x - p.x, before.y - p.y) <= SPRAY_NEAR
    );
  });
}
```

`sound.ts` in `RECIPES` hinter `hit`:

```ts
  /** Pfefferspray: längerer zischender Rauschstoß */
  spray: { wave: 'sawtooth', gain: 0.5, notes: [{ f: 0, d: 0.25 }], noise: true },
```

- [ ] **Step 6: Wolke in `GameScene.ts`**

- Import: `import { isSpraying, SPRAY_COLOR, sprayCloudRadius } from '../sprayView';` und `CONFIG` aus `@pfandraiders/core` (falls nicht schon importiert).
- Feld neben `rings`: `private sprays = new Map<string, Phaser.GameObjects.Arc>();`
- In `create` neben `this.rings = new Map();`: `this.sprays = new Map();`
- In der Schleife über die Spieler (hinter `this.rings.set(…)`), damit die Wolke vor `worldObjects` entsteht und von den UI-Kameras ignoriert wird:

```ts
      this.sprays.set(p.id, this.add.circle(p.x, p.y, CONFIG.spray.radius, SPRAY_COLOR, 0.35).setDepth(4.8).setVisible(false));
```

- In der Render-Schleife hinter `this.rings.get(p.id)?.setPosition(…)`:

```ts
      this.sprays.get(p.id)?.setPosition(p.x, p.y).setRadius(sprayCloudRadius(p)).setVisible(isSpraying(p));
```

- [ ] **Step 7: Client grün**

Run: `cd packages/client; npx vitest run; npx tsc --noEmit`
Expected: PASS, keine Typfehler.

- [ ] **Step 8: Commit**

```bash
git add packages/client/src/sprayView.ts packages/client/src/text.ts packages/client/src/soundEvents.ts packages/client/src/sound.ts packages/client/src/scenes/GameScene.ts packages/client/test/sprayView.test.ts packages/client/test/text.test.ts packages/client/test/soundEvents.test.ts packages/client/test/sound.test.ts packages/client/test/prediction.test.ts
git commit -m "feat(client): spray cloud, spray sound, charges and id papers in the HUD

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: README, Gesamtprüfung, Builds

**Files:**
- Modify: `README.md` (Tastentabelle, Shop-Tabelle, Kampf, Leben und Events)

**Interfaces:**
- Consumes: alles aus Task 1 bis 7.
- Produces: README im Stand von PR 2.

- [ ] **Step 1: README**

- Tastentabelle:

```md
| Gerät | Laufen | Aktion | Ausrauben | Schlagen | Pfefferspray |
|---|---|---|---|---|---|
| Tastatur 1 | WASD | E | Q | F | C |
| Tastatur 2 | Pfeile | Enter | / | . | , |
| Gamepad | Stick oder Steuerkreuz | A | B | X | Y |
```

- Satz über die Shop-Bedienung: „(auf Leckerli: die Menge)“ → „(auf Pfefferspray und Leckerli: die Menge)“.
- In der Shop-Tabelle die Zeile `| Waffen | Stärkerer Schlag | … |` ersetzen und vor `Leckerli` zwei Zeilen einfügen:

```md
| Waffen | Boxhandschuh | 4 € | Schlag 30 statt 20 Schaden |
| Verteidigung | Pfefferspray | 3 € je Flasche (10 Ladungen), bis 99 Ladungen | eigene Taste, siehe Kampf |
| Verteidigung | Ausweisdokumente | 3 € | Polizei kontrolliert dich nicht, nur für die nächste Runde |
```

- Satz unter der Tabelle: „Tasche und Rucksack kauft man je Kauf einzeln bis zur Grenze, Pfefferspray und Leckerli in Mengen; …“.
- Kampf: „mit 20 Schaden (Schlag-Upgrade mehr)“ → „mit 20 Schaden (mit Boxhandschuh 30)“. Dahinter einfügen: „Pfefferspray (eigene Taste, mit Ladungen aus dem Shop): trifft den nächsten wachen Mitspieler in 30 px, stößt ihn 40 px weg (Wände halten ihn auf) und nimmt ihm 2 Leben; danach 1 s Pause. Eine Ladung wird nur verbraucht, wenn jemand in Reichweite ist. Wer Schutz hat, wird weder gestoßen noch verletzt (die Ladung ist trotzdem weg). Alle sehen eine kurze orange Wolke, Sprühender und Getroffener hören ein Zischen.“
- Leben und Events: hinter „Polizisten konfiszieren nach 2 s Kontrolle die Hälfte der Flaschen …“ einfügen: „Wer Ausweisdokumente hat, wird in dieser Runde von Polizisten in Ruhe gelassen.“ und im HUD-Satz „In der Zeile mit dem Leben stehen kurz Leckerli, Wagen und Kundenkarte.“ → „In der Zeile mit dem Leben stehen kurz Leckerli, Spray-Ladungen, Wagen, Kundenkarte und Ausweis.“

- [ ] **Step 2: Alles prüfen**

Run (Wurzelverzeichnis): `npm test; npm run typecheck; npm run build; npm run build:server`
Expected: alles PASS, beide Builds erfolgreich.

- [ ] **Step 3: Rest-Suche**

Run: `git grep -n -E "'punch'|items\.punch|Stärkerer Schlag|LevelItemId = 'flashlight' \| 'punch'" -- packages README.md`
Expected: keine Treffer außer dem Sound-Namen `punch` (`SoundId`, `RECIPES.punch`, `soundEvents.test.ts`), der den Schlag-Ton meint und bleibt.

- [ ] **Step 4: Kurz spielen**

Lokal 2 Spieler: Runde, Shop: Pfefferspray ×1, Ausweis, Boxhandschuh; nächste Runde: mit `C` neben dem anderen sprühen (Wolke, Zischen, Stoß, „Spray 9“), Schlag tut 30; Polizei läuft am Ausweisträger vorbei; Runde danach: „Ausweis“ fehlt im HUD. Online mit zwei Browsern: der Getroffene gleitet sichtbar weg, die Wolke ist bei beiden zu sehen.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: README for glove, pepper spray and id papers

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec-Abdeckung:**
- §1.2 Katalog (Boxhandschuh, Pfefferspray 10 Ladungen bis 99, Ausweis eine Runde) → Task 1, Task 6.
- §1.3 Boxhandschuh ersetzt `punch` → Task 1 (Ruling 12), Task 8 (Grep).
- §1.6 Serverprüfung (Grenze in Ladungen, kein Teilkauf) → Task 1 (`unitOf` in `checkShopBuy`), Task 4.
- §4.1 Boxhandschuh 30 Schaden → Task 1 (`fight.test.ts`).
- §4.2 Pfefferspray: Taste, Ziel 30 px, Stoß 40 px mit Kollision, 2 Leben, 1 s, 1 Ladung, Wolke und Ton, Schutz, gleicher Punkt, kein Ziel → Task 2 (Kern), Task 5 (Taste), Task 7 (Wolke, Ton, Hinweis).
- §4.3 Ausweis: eine Runde, Polizei jagt/kontrolliert/beschlagnahmt nicht → Task 3, Task 4.
- §4.4 Leckerli unverändert → keine Änderung (Reihenfolge in Verteidigung: Task 1).
- §6.2 HUD `Spray n`, `Ausweis` → Task 7.
- §7.1 Mietsachen inkl. Ausweis → Task 1 (Test `progressAfterRound`), Task 4.
- §7.2 Privatsphäre (`sprayHeld` privat, `sprayCooldownMs` öffentlich, `items` privat) → Task 1 (`snapshot.test.ts`).
- §7.3 Protokoll `Input.spray` → Task 1, Task 5; gemeinsamer Build → Task 8.

**Platzhalter-Scan:** keine „TBD“; jeder Code-Schritt enthält den Code, Umstellungen bestehender Tests nennen Test und Ersatz.

**Typkonsistenz:** `trySpray(state, sprayer)`/`findSprayTarget(state, sprayer)` in Task 2 und Task 7 (`text.ts`); `shove(map, p, ux, uy, px)` in Task 2; `unitOf` in Task 1 und Task 6; `KeyLabels.spray` in Task 5 und Task 7 (`text.test.ts`); `isSpraying`/`sprayCloudRadius` in Task 7.

**Review Focus:** alle fünf Punkte haben Tests in der genannten Task (2, 2, 2, 3 + 4, 7).
