# Eigene Karten: Tiled-Vorlage, Beispielkarte und Anleitung – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wer eine eigene Karte bauen will, öffnet `maps-src/pfandraiders.tiled-project` in Tiled, kopiert die Vorlage, exportiert JSON nach `packages/core/src/maps/custom/`, ruft `npm run maps` auf und spielt sie; eine kleine Beispielkarte "Übung" liegt schon im Kartenordner und läuft in jedem Testlauf mit.

**Architecture:** Die Vorlage entsteht deterministisch aus einem ASCII-Plan (Legende wie `cityPlan.ts`) über das bestehende `planToTiled`; ein reines Modul `packages/core/scripts/templateMap.ts` ergänzt Tiled-Felder (Ebenen-IDs, Deckkraft, Eigenschaften `name`/`tileset`, externer Kachelsatz) und schreibt zusätzlich TMX. Das Skript `npm run maps:vorlage` schreibt `maps-src/vorlage.tiled.json`, `maps-src/vorlage.tmx` und `packages/core/src/maps/custom/uebung.tiled.json`; ein Test vergleicht die committeten Dateien mit dem Generator. Kachelsatz (`kenney-city.tsx`) und Tiled-Projekt sind statische Dateien in `maps-src/` und verweisen auf den Kenney-Bogen des Clients, ohne ihn zu kopieren.

**Tech Stack:** TypeScript 5.7, `tsx`, Vitest 3, Tiled 1.10+ (Dateiformat 1.10, JSON und TMX).

**Spec:** `docs/superpowers/specs/2026-10-10-eigene-karten-design.md` (§4, Rulings R4, R14). Setzt Plan 1 (`docs/superpowers/plans/2026-10-10-eigene-karten-registrierung.md`) voraus.

**Ausgangsstand:** Branch `feature/eigene-karten` nach allen Commits aus Plan 1.

## Global Constraints

- Alle Texte für Spieler und Kartenautoren sind deutsch, mit echten Umlauten.
- Code-Kommentare sind deutsch wie im bestehenden Code; Bezeichner und Testnamen bleiben englisch.
- Jeder Commit endet mit der Zeile `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (nach einer Leerzeile).
- `todo.md` und `idee.md` werden nie gestaged oder committet. Immer mit expliziten Pfaden `git add <pfad>` arbeiten.
- Das Verzeichnis `.claude/` wird nie gelöscht.
- Kein Python; Hilfsskripte nur in TypeScript (`tsx`).
- Der Kern bleibt deterministisch; die Vorlage wird nie von Hand bearbeitet, nur über den Plan und `npm run maps:vorlage`.
- `maps-src/` liegt im Wurzelordner und wird versioniert (`.gitignore` ignoriert nur `assets-src/*`). Der Kenney-Bogen wird nur per relativem Pfad referenziert (`../packages/client/src/assets/kenney/modern-city.png`, 37 x 28 Zellen zu 16 px, 592 x 448 Pixel, `firstgid` 1), nicht kopiert.
- Am Ende **jeder** Task sind `npm test` und `npm run typecheck` im Wurzelordner grün; am Ende zusätzlich `npm run build` und `npm run build:server`.

## Review Focus

1. **Committete Vorlage weicht vom Generator ab** (jemand bearbeitet `vorlage.tiled.json` in Tiled und committet): Test `template.test.ts › committed files match the generator` (Task 1).
2. **Kachelsatz zeigt ins Leere** (falscher relativer Pfad oder falsche Bildgröße, Tiled zeigt rote Kreuze): Test `template.test.ts › kenney-city.tsx points at the real Kenney sheet` (Task 1).
3. **Vorlage selbst verletzt die strengen Regeln** (dann scheitert jede Kopie sofort): Test `template.test.ts › passes the strict rules for custom maps` (Task 1).
4. **Beispielkarte ist registriert und spielbar** (über den Test aller Karten aus Plan 1 plus eigenen Test): Test `uebung.test.ts › uebung is registered after the built-in maps with name and tileset` und `all-maps.test.ts › uebung survives a short game with a full room` (Task 2).
5. **Beispielkarte online wählbar**: Test `roomMap.test.ts › starts the example map uebung when the host picks it` (Task 2).

## Namenstabelle

| Ort | Name | Typ / Form |
| --- | --- | --- |
| `core/scripts/templateMap.ts` | `TEMPLATE_PLAN: string[]`, `TEMPLATE_ZONES: ZoneDef[]` | 40 x 24 |
| `core/scripts/templateMap.ts` | `TILED_VERSION = '1.11.2'`, `TILED_FORMAT = '1.10'` | |
| `core/scripts/templateMap.ts` | `TemplateJson`, `JsonTileLayer`, `JsonObjectLayer`, `JsonObject`, `JsonProperty`, `TemplateOptions = { name: string; tilesetSource: string }` | |
| `core/scripts/templateMap.ts` | `templateTiledMap(opts: TemplateOptions): TemplateJson`, `toTmx(m: TemplateJson): string`, `templateFiles(): { path: string; content: string }[]` | Pfade relativ zum Wurzelordner |
| Wurzel-`package.json` | `maps:vorlage` | `tsx packages/core/scripts/generateTemplate.ts` |
| Plan 1 | `validateTiledMap`, `CUSTOM_MAP_RULES`, `MAP_DEFS`, `MAP_LIST`, `isMapId`, `SHEET_COLS`, `SHEET_ROWS` | unverändert |

## Entscheidungen zu Lücken der Spec (Rulings)

1. **Vorlage aus Plan, nicht von Hand:** `TEMPLATE_PLAN` (40 x 24) läuft durch `planToTiled` wie die Stadt; dadurch sind Grafikebenen, Wände und Objekte konsistent und testbar. Vorab geprüft (Scratch): `planToTiled` wirft nicht, `validateTiledMap` mit `CUSTOM_MAP_RULES` meldet nichts (8 Startpunkte, 2 Pfandautomaten, 22 Spots, 4 NPC-Eingänge, beide Zonen).
2. **Ebenenreihenfolge** der Vorlage für die Arbeit in Tiled: `ground`, `below`, `above`, dann `walls` und `soft` halb durchsichtig (Deckkraft 0,5), dann `objects`, `zones`. Der Kern liest Ebenen nach Namen, die Reihenfolge ist egal.
3. **Wände:** Die Vorlage malt Wände mit gid 1 (beliebige Kachel; jede Zahl ≠ 0 ist Wand). Annahme der Spec: Wände werden von Hand gemalt; Ableitung aus Kacheleigenschaften ist spätere Arbeit.
4. **Kachelsatz extern** (`<tileset firstgid="1" source="kenney-city.tsx"/>`); in der Beispielkarte zeigt `source` relativ von `packages/core/src/maps/custom/` auf `../../../../../maps-src/kenney-city.tsx`, damit sie sich in Tiled öffnen lässt. Der Kern ignoriert `source`; eingebettete Kachelsätze sind ebenso erlaubt (Plan 1, R9).
5. **Tiled-Projekt** definiert nur den Aufzählungstyp `SpotType` (Werte `bus_stop`, `bench`, `bush`, `bin`, `park`), keine Klassen: Tiled exportiert unveränderte Standardwerte von Klassen-Mitgliedern nicht, ein Spot ohne gesetztes `spotType` würde beim Export die Eigenschaft verlieren. Empfohlener Arbeitsablauf: vorhandene Objekte kopieren (Strg+C/Strg+V).
6. **Objekttyp im TMX** als Attribut `type` (Tiled 1.10+ liest und schreibt ihn so; 1.9 schrieb `class`, das der Kern ebenfalls annimmt).
7. **Beispielkarte** ist die Vorlage mit Name "Übung"; Kennung `uebung`. Sie steht in `MAP_LIST` nach `city` und `retro`.
8. **Doku:** README bekommt die Kurzfassung "Eigene Karten" (Schritte und Regeln), Details stehen in `docs/KARTEN.md`.

---

### Task 1: Vorlage, Kachelsatz und Tiled-Projekt

**Files:**
- Create: `packages/core/scripts/templateMap.ts`
- Create: `packages/core/scripts/generateTemplate.ts`
- Modify: `package.json` (Wurzel, `scripts`)
- Create: `maps-src/kenney-city.tsx`
- Create: `maps-src/pfandraiders.tiled-project`
- Create (generiert): `maps-src/vorlage.tiled.json`, `maps-src/vorlage.tmx`
- Create: `packages/core/test/template.test.ts`

**Interfaces:**
- Consumes: `planToTiled(rows, zones): TiledMap` (`packages/core/scripts/planToTiled.ts`), `TiledObject` (`src/tiled.ts`), `TILE`, `ZoneDef`; `validateTiledMap`, `CUSTOM_MAP_RULES` (Plan 1); `SHEET_COLS`, `SHEET_ROWS` (`src/tiled.ts`).
- Produces: alles aus der Namenstabelle für `templateMap.ts`; `npm run maps:vorlage`.

- [ ] **Step 1: Tests schreiben**

`packages/core/test/template.test.ts`:

```ts
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CUSTOM_MAP_RULES, validateTiledMap } from '../src/maps';
import { SHEET_COLS, SHEET_ROWS } from '../src/tiled';
import { TEMPLATE_PLAN, templateFiles, templateTiledMap, toTmx } from '../scripts/templateMap';
import type { JsonObjectLayer } from '../scripts/templateMap';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8').replace(/\r\n/g, '\n');
const vorlage = () => templateTiledMap({ name: 'Vorlage', tilesetSource: 'kenney-city.tsx' });
const objectLayer = (name: string): JsonObjectLayer => {
  const l = vorlage().layers.find((x) => x.name === name);
  if (!l || l.type !== 'objectgroup') throw new Error(name);
  return l;
};

describe('map template', () => {
  it('committed files match the generator (run npm run maps:vorlage after changing the plan)', () => {
    for (const f of templateFiles()) {
      if (f.path.endsWith('.json')) expect(JSON.parse(read(f.path)), f.path).toEqual(JSON.parse(f.content));
      else expect(read(f.path), f.path).toBe(f.content);
    }
  });

  it('passes the strict rules for custom maps', () => {
    const v = validateTiledMap(vorlage(), { rules: CUSTOM_MAP_RULES });
    expect(v.problems).toEqual([]);
    expect(v).toMatchObject({ name: 'Vorlage', tileset: 'city' });
  });

  it('shows every layer, object type, spot type and both zones', () => {
    expect(TEMPLATE_PLAN).toHaveLength(24);
    for (const row of TEMPLATE_PLAN) expect(row).toHaveLength(40);
    expect(vorlage().layers.map((l) => l.name)).toEqual(['ground', 'below', 'above', 'walls', 'soft', 'objects', 'zones']);
    const objects = objectLayer('objects').objects;
    expect(new Set(objects.map((o) => o.type))).toEqual(new Set(['spawn', 'dropoff', 'npc_spawn', 'spot']));
    const spotTypes = objects.filter((o) => o.type === 'spot').map((o) => o.properties?.[0].value);
    expect(new Set(spotTypes)).toEqual(new Set(['bus_stop', 'bench', 'bush', 'bin', 'park']));
    expect(objects.every((o) => o.point === true)).toBe(true);
    const zones = objectLayer('zones').objects;
    expect(zones.map((z) => [z.name, z.properties?.[0].value])).toEqual([
      ['Stadion', 'stadium'],
      ['Konzert', 'concert'],
    ]);
    expect(vorlage().properties).toEqual([
      { name: 'name', type: 'string', value: 'Vorlage' },
      { name: 'tileset', type: 'string', value: 'city' },
    ]);
  });

  it('kenney-city.tsx points at the real Kenney sheet', () => {
    const tsx = read('maps-src/kenney-city.tsx');
    const image = /<image source="([^"]+)" width="(\d+)" height="(\d+)"\/>/.exec(tsx);
    expect(image).not.toBeNull();
    const [, path, w, h] = image!;
    expect(path).toBe('../packages/client/src/assets/kenney/modern-city.png');
    const file = join(ROOT, 'maps-src', path);
    expect(existsSync(file)).toBe(true);
    expect([Number(w), Number(h)]).toEqual([SHEET_COLS * 16, SHEET_ROWS * 16]);
    const png = readFileSync(file);
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([592, 448]);
    expect(tsx).toContain('tilewidth="16" tileheight="16"');
    expect(tsx).toContain(`tilecount="${SHEET_COLS * SHEET_ROWS}" columns="${SHEET_COLS}"`);
  });

  it('the Tiled project knows the spot types', () => {
    const project = JSON.parse(read('maps-src/pfandraiders.tiled-project'));
    expect(project.propertyTypes).toEqual([
      expect.objectContaining({ name: 'SpotType', type: 'enum', storageType: 'string', values: ['bus_stop', 'bench', 'bush', 'bin', 'park'] }),
    ]);
  });

  it('toTmx writes CSV layers, point objects, zones and the external tileset', () => {
    const tmx = toTmx(templateTiledMap({ name: 'A & B', tilesetSource: 'kenney-city.tsx' }));
    expect(tmx.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<map version="1.10" tiledversion="1.11.2"')).toBe(true);
    expect(tmx).toContain('<property name="name" value="A &amp; B"/>');
    expect(tmx).toContain('<tileset firstgid="1" source="kenney-city.tsx"/>');
    expect(tmx).toContain('<layer id="4" name="walls" width="40" height="24" opacity="0.5">');
    expect(tmx).toContain('<data encoding="csv">');
    expect(tmx).toMatch(/<object id="\d+" type="spawn" x="\d+" y="\d+">\n   <point\/>\n  <\/object>/);
    expect(tmx).toMatch(/<object id="\d+" name="Stadion" type="zone" x="16" y="112" width="272" height="48">/);
    expect(tmx.endsWith('</map>\n')).toBe(true);
  });
});
```

- [ ] **Step 2: Tests laufen lassen, sie schlagen fehl**

Run: `cd packages/core; npx vitest run test/template.test.ts`
Expected: FAIL mit `Cannot find module '../scripts/templateMap'`.

- [ ] **Step 3: Generator `templateMap.ts`**

`packages/core/scripts/templateMap.ts`:

```ts
import { TILE } from '../src/config';
import type { TiledObject } from '../src/tiled';
import type { ZoneDef } from '../src/types';
import { planToTiled } from './planToTiled';

/**
 * Plan der Kartenvorlage (40 x 24), Legende wie in `src/maps/cityPlan.ts`. Daraus entstehen
 * `maps-src/vorlage.tiled.json`, `maps-src/vorlage.tmx` und die Beispielkarte `custom/uebung.tiled.json`
 * (`npm run maps:vorlage`). Nie die erzeugten Dateien von Hand ändern, sondern diesen Plan.
 */
export const TEMPLATE_PLAN: string[] = [
  'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW', //  0
  'W..................N=..................W', //  1
  'W.RRRRRR..YYYYYYY..==..XXXXXXX..EEEEEE.W', //  2
  'W.RRRRRR..YYYYYYY..==..XXXXXXX..EEEEEE.W', //  3
  'W.RRRRRR..YYYYYYY..==..XXXXXXX..EEEEEE.W', //  4
  'W.RRRRRR..YYYYYYY..==..XXXXXXX..EEEEEE.W', //  5
  'W..................==..XXXXXXX.........W', //  6
  'W..b.......m.......==....g.........b...W', //  7
  'W..t...........n...==D........m........W', //  8
  'W...........l......==.n...........l..n.W', //  9
  'W...@.....@....@...++...@..............W', // 10
  'WN====cc===============================W', // 11
  'W=============================cc======NW', // 12
  'W.......@.....@....++.....@.......@....W', // 13
  'W.b................==......l.........m.W', // 14
  'W,t,,,,,,t,,,,,,,,.==..,,t,,,,,,,,,,,,,W', // 15
  'W,,p,,,m,,,,,,,,,,D==..,n,,,,,,,,,,m,,,W', // 16
  'W,,,oo,,,,,,,,,,,,.==..,,,,,g,,,,,,,,,,W', // 17
  'W,,,oo,,,,,,g,,,,,.==..,,,,,,,,,,,,,n,,W', // 18
  'W,,,,,,,n,,,,,,,,,.==..,,,,,,,,p,,,,,,,W', // 19
  'W,,,,,,,,,,,,,,p,,.==..,,,b,,,,,,g,,,,,W', // 20
  'W,,,,,,,,,,,,,t,,,.==..,,,,,,,,,,,,,,t,W', // 21
  'W..................=N..................W', // 22
  'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW', // 23
];

/** Zonen der Vorlage in Pixeln: Stadion links (Spalten 1-17, Zeilen 7-9), Konzert rechts unten (Spalten 23-38, Zeilen 15-21). */
export const TEMPLATE_ZONES: ZoneDef[] = [
  { id: 'stadium', name: 'Stadion', area: { x0: 1 * TILE, y0: 7 * TILE, x1: 18 * TILE, y1: 10 * TILE } },
  { id: 'concert', name: 'Konzert', area: { x0: 23 * TILE, y0: 15 * TILE, x1: 39 * TILE, y1: 22 * TILE } },
];

/** Tiled-Version und Dateiformat, die die Vorlage nachbildet. */
export const TILED_VERSION = '1.11.2';
export const TILED_FORMAT = '1.10';

export interface JsonProperty {
  name: string;
  type: string;
  value: string;
}
export interface JsonObject {
  id: number;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  visible: boolean;
  point?: boolean;
  properties?: JsonProperty[];
}
export interface JsonTileLayer {
  data: number[];
  height: number;
  id: number;
  name: string;
  opacity: number;
  type: 'tilelayer';
  visible: boolean;
  width: number;
  x: number;
  y: number;
}
export interface JsonObjectLayer {
  draworder: 'topdown';
  id: number;
  name: string;
  objects: JsonObject[];
  opacity: number;
  type: 'objectgroup';
  visible: boolean;
  x: number;
  y: number;
}
/** Tiled-JSON so, wie Tiled es exportiert (Teilmenge, Schlüssel wie im Original). */
export interface TemplateJson {
  compressionlevel: number;
  height: number;
  infinite: boolean;
  layers: (JsonTileLayer | JsonObjectLayer)[];
  nextlayerid: number;
  nextobjectid: number;
  orientation: 'orthogonal';
  properties: JsonProperty[];
  renderorder: 'right-down';
  tiledversion: string;
  tileheight: number;
  tilesets: { firstgid: number; source: string }[];
  tilewidth: number;
  type: 'map';
  version: string;
  width: number;
}

export interface TemplateOptions {
  /** Anzeigename der Karte (Eigenschaft `name`) */
  name: string;
  /** Pfad zur Kachelsatz-Datei kenney-city.tsx, relativ zur geschriebenen Datei */
  tilesetSource: string;
}

function toJsonObject(o: TiledObject): JsonObject {
  const out: JsonObject = {
    id: o.id,
    name: o.name,
    type: o.type,
    x: o.x,
    y: o.y,
    width: o.width ?? 0,
    height: o.height ?? 0,
    rotation: 0,
    visible: true,
  };
  if (o.point) out.point = true;
  if (o.properties) out.properties = o.properties.map((p) => ({ name: p.name, type: p.type ?? 'string', value: String(p.value) }));
  return out;
}

/** Vorlage als Tiled-JSON: Grafikebenen unten, Regelebenen halb durchsichtig darüber, dann Objekte und Zonen. */
export function templateTiledMap(opts: TemplateOptions): TemplateJson {
  const base = planToTiled(TEMPLATE_PLAN, TEMPLATE_ZONES);
  const tileData = (name: string): number[] => {
    const l = base.layers.find((x) => x.name === name);
    if (!l || l.type !== 'tilelayer') throw new Error(`Vorlage: Kachelebene ${name} fehlt`);
    return l.data;
  };
  const objectList = (name: string): TiledObject[] => {
    const l = base.layers.find((x) => x.name === name);
    if (!l || l.type !== 'objectgroup') throw new Error(`Vorlage: Objektebene ${name} fehlt`);
    return l.objects;
  };
  let layerId = 1;
  const tileLayer = (name: string, opacity: number): JsonTileLayer => ({
    data: tileData(name),
    height: base.height,
    id: layerId++,
    name,
    opacity,
    type: 'tilelayer',
    visible: true,
    width: base.width,
    x: 0,
    y: 0,
  });
  const objectLayer = (name: string): JsonObjectLayer => ({
    draworder: 'topdown',
    id: layerId++,
    name,
    objects: objectList(name).map(toJsonObject),
    opacity: 1,
    type: 'objectgroup',
    visible: true,
    x: 0,
    y: 0,
  });
  const layers = [
    tileLayer('ground', 1),
    tileLayer('below', 1),
    tileLayer('above', 1),
    tileLayer('walls', 0.5),
    tileLayer('soft', 0.5),
    objectLayer('objects'),
    objectLayer('zones'),
  ];
  let maxObjectId = 0;
  for (const l of layers) if (l.type === 'objectgroup') for (const o of l.objects) maxObjectId = Math.max(maxObjectId, o.id);
  return {
    compressionlevel: -1,
    height: base.height,
    infinite: false,
    layers,
    nextlayerid: layerId,
    nextobjectid: maxObjectId + 1,
    orientation: 'orthogonal',
    properties: [
      { name: 'name', type: 'string', value: opts.name },
      { name: 'tileset', type: 'string', value: 'city' },
    ],
    renderorder: 'right-down',
    tiledversion: TILED_VERSION,
    tileheight: TILE,
    tilesets: [{ firstgid: 1, source: opts.tilesetSource }],
    tilewidth: TILE,
    type: 'map',
    version: TILED_FORMAT,
    width: base.width,
  };
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function tmxProperties(props: readonly JsonProperty[], indent: string): string[] {
  if (props.length === 0) return [];
  return [
    `${indent}<properties>`,
    ...props.map((p) => `${indent} <property name="${esc(p.name)}" value="${esc(p.value)}"/>`),
    `${indent}</properties>`,
  ];
}

/** Dieselbe Karte im TMX-Format von Tiled (Kachelebenen als CSV, Kachelsatz extern). */
export function toTmx(m: TemplateJson): string {
  const out: string[] = ['<?xml version="1.0" encoding="UTF-8"?>'];
  out.push(
    `<map version="${m.version}" tiledversion="${m.tiledversion}" orientation="orthogonal" renderorder="right-down" width="${m.width}" height="${m.height}" tilewidth="${m.tilewidth}" tileheight="${m.tileheight}" infinite="0" nextlayerid="${m.nextlayerid}" nextobjectid="${m.nextobjectid}">`,
  );
  out.push(...tmxProperties(m.properties, ' '));
  for (const t of m.tilesets) out.push(` <tileset firstgid="${t.firstgid}" source="${esc(t.source)}"/>`);
  for (const l of m.layers) {
    if (l.type === 'tilelayer') {
      const opacity = l.opacity !== 1 ? ` opacity="${l.opacity}"` : '';
      out.push(` <layer id="${l.id}" name="${esc(l.name)}" width="${l.width}" height="${l.height}"${opacity}>`);
      out.push('  <data encoding="csv">');
      const rows: string[] = [];
      for (let r = 0; r < l.height; r++) rows.push(l.data.slice(r * l.width, (r + 1) * l.width).join(','));
      out.push(rows.join(',\n'));
      out.push('</data>');
      out.push(' </layer>');
      continue;
    }
    out.push(` <objectgroup id="${l.id}" name="${esc(l.name)}">`);
    for (const o of l.objects) {
      const name = o.name ? ` name="${esc(o.name)}"` : '';
      const size = o.point ? '' : ` width="${o.width}" height="${o.height}"`;
      const head = `  <object id="${o.id}"${name} type="${esc(o.type)}" x="${o.x}" y="${o.y}"${size}`;
      const inner = [...tmxProperties(o.properties ?? [], '   '), ...(o.point ? ['   <point/>'] : [])];
      if (inner.length === 0) out.push(`${head}/>`);
      else out.push(`${head}>`, ...inner, '  </object>');
    }
    out.push(' </objectgroup>');
  }
  out.push('</map>');
  return out.join('\n') + '\n';
}

const json = (m: TemplateJson): string => JSON.stringify(m, null, 1) + '\n';

/** Alle erzeugten Dateien mit Pfad relativ zum Wurzelordner (Reihenfolge = Schreibreihenfolge). */
export function templateFiles(): { path: string; content: string }[] {
  const vorlage = templateTiledMap({ name: 'Vorlage', tilesetSource: 'kenney-city.tsx' });
  return [
    { path: 'maps-src/vorlage.tiled.json', content: json(vorlage) },
    { path: 'maps-src/vorlage.tmx', content: toTmx(vorlage) },
  ];
}
```

- [ ] **Step 4: Skript und Wurzel-Eintrag**

`packages/core/scripts/generateTemplate.ts`:

```ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { templateFiles } from './templateMap';

/** Schreibt Kartenvorlage und Beispielkarte aus TEMPLATE_PLAN. Aufruf im Wurzelordner: `npm run maps:vorlage`, danach `npm run maps`. */
const root = fileURLToPath(new URL('../../../', import.meta.url));
for (const f of templateFiles()) {
  const out = join(root, f.path);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, f.content);
  console.log(`geschrieben: ${f.path}`);
}
```

In `package.json` (Wurzel) nach dem Eintrag `"maps": …` ein Komma setzen und anfügen:

```json
    "maps:vorlage": "tsx packages/core/scripts/generateTemplate.ts"
```

- [ ] **Step 5: Statische Dateien in `maps-src/`**

`maps-src/kenney-city.tsx`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<tileset version="1.10" tiledversion="1.11.2" name="kenney-city" tilewidth="16" tileheight="16" tilecount="1036" columns="37">
 <image source="../packages/client/src/assets/kenney/modern-city.png" width="592" height="448"/>
</tileset>
```

`maps-src/pfandraiders.tiled-project`:

```json
{
    "automappingRulesFile": "",
    "commands": [
    ],
    "compatibilityVersion": 1100,
    "extensionsPath": "extensions",
    "folders": [
        ".",
        "../packages/core/src/maps/custom"
    ],
    "properties": [
    ],
    "propertyTypes": [
        {
            "id": 1,
            "name": "SpotType",
            "storageType": "string",
            "type": "enum",
            "values": [
                "bus_stop",
                "bench",
                "bush",
                "bin",
                "park"
            ],
            "valuesAsFlags": false
        }
    ]
}
```

- [ ] **Step 6: Vorlage erzeugen**

Run (Wurzel): `npm run maps:vorlage`
Expected: `geschrieben: maps-src/vorlage.tiled.json` und `geschrieben: maps-src/vorlage.tmx`.
Run: `git check-ignore -v maps-src/vorlage.tmx` → keine Ausgabe, Exit 1 (Datei wird versioniert).

- [ ] **Step 7: Tests laufen lassen**

Run: `cd packages/core; npx vitest run test/template.test.ts` → PASS.
Run (Wurzel): `npm test`, `npm run typecheck` → grün.

- [ ] **Step 8: In Tiled öffnen (optional, von Hand)**

Tiled 1.10 oder neuer: Datei > Projekt öffnen > `maps-src/pfandraiders.tiled-project`, dann `vorlage.tmx` öffnen. Erwartet: Stadtbild mit Kenney-Kacheln (keine roten Kreuze), halbtransparente Wand- und Soft-Ebene, Punkt-Objekte und zwei Zonenrechtecke, Karteneigenschaften `name` und `tileset`.

- [ ] **Step 9: Commit**

```bash
git add packages/core/scripts/templateMap.ts packages/core/scripts/generateTemplate.ts package.json maps-src/kenney-city.tsx maps-src/pfandraiders.tiled-project maps-src/vorlage.tiled.json maps-src/vorlage.tmx packages/core/test/template.test.ts
git commit -m "feat(core): Tiled-Vorlage und Kachelsatz für eigene Karten

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Beispielkarte "Übung" im Kartenordner

**Files:**
- Modify: `packages/core/scripts/templateMap.ts` (`templateFiles`)
- Create (generiert): `packages/core/src/maps/custom/uebung.tiled.json`
- Modify (generiert): `packages/core/src/maps/custom/index.ts`
- Create: `packages/core/test/uebung.test.ts`
- Modify: `packages/server/test/roomMap.test.ts` (neuer Test)

**Interfaces:**
- Consumes: `templateTiledMap`, `templateFiles` (Task 1); `npm run maps`, `MAP_DEFS`, `MAP_LIST`, `isMapId` (Plan 1); `Room.setMap`, `twoInLobby` aus `roomMap.test.ts` (Plan 1, Task 6).
- Produces: Karte `uebung` (Name "Übung", Kachelsatz `city`, 40 x 24).

- [ ] **Step 1: Tests schreiben**

`packages/core/test/uebung.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isMapId, MAP_DEFS, MAP_LIST } from '../src/maps';

describe('example custom map', () => {
  it('uebung is registered after the built-in maps with name and tileset', () => {
    expect(isMapId('uebung')).toBe(true);
    expect(MAP_LIST.map((m) => m.id).slice(0, 3)).toEqual(['city', 'retro', 'uebung']);
    expect(MAP_DEFS.uebung).toMatchObject({ id: 'uebung', name: 'Übung', tileset: 'city', builtin: false });
    expect([MAP_DEFS.uebung.map.cols, MAP_DEFS.uebung.map.rows]).toEqual([40, 24]);
    expect(MAP_DEFS.uebung.map.spawns).toHaveLength(8);
    expect(MAP_DEFS.uebung.visuals?.ground).toHaveLength(40 * 24);
  });
});
```

In `packages/server/test/roomMap.test.ts` im `describe('map choice in the room')` anfügen:

```ts
  it('starts the example map uebung when the host picks it', () => {
    const { room, conns } = twoInLobby();
    expect(room.setMap('p1', 'uebung').ok).toBe(true);
    expect(conns[1].last('lobby')).toMatchObject({ mapId: 'uebung', mapName: 'Übung' });
    room.start('p1');
    expect(conns[1].last('start')).toMatchObject({ mapId: 'uebung' });
    expect(conns[1].last('start').map.cols).toBe(40);
  });
```

- [ ] **Step 2: Tests laufen lassen, sie schlagen fehl**

Run: `cd packages/core; npx vitest run test/uebung.test.ts` → FAIL (`isMapId('uebung')` ist false).
Run: `cd packages/server; npx vitest run test/roomMap.test.ts` → FAIL (`bad_message`).

- [ ] **Step 3: Beispielkarte in den Generator aufnehmen**

In `packages/core/scripts/templateMap.ts` `templateFiles` ersetzen durch:

```ts
/** Alle erzeugten Dateien mit Pfad relativ zum Wurzelordner (Reihenfolge = Schreibreihenfolge). */
export function templateFiles(): { path: string; content: string }[] {
  const vorlage = templateTiledMap({ name: 'Vorlage', tilesetSource: 'kenney-city.tsx' });
  // Beispielkarte: dieselbe Vorlage; der Kachelsatz-Pfad zeigt von custom/ zurück nach maps-src/
  const uebung = templateTiledMap({ name: 'Übung', tilesetSource: '../../../../../maps-src/kenney-city.tsx' });
  return [
    { path: 'maps-src/vorlage.tiled.json', content: json(vorlage) },
    { path: 'maps-src/vorlage.tmx', content: toTmx(vorlage) },
    { path: 'packages/core/src/maps/custom/uebung.tiled.json', content: json(uebung) },
  ];
}
```

- [ ] **Step 4: Dateien erzeugen und eintragen**

Run (Wurzel): `npm run maps:vorlage`
Expected: drei Zeilen `geschrieben: …`, darunter `packages/core/src/maps/custom/uebung.tiled.json`; `vorlage.*` bleiben unverändert (`git status` zeigt sie nicht).
Run (Wurzel): `npm run maps`
Expected: `ok  uebung.tiled.json: "Übung", 40 x 24 Kacheln, Kachelsatz city` und `geschrieben: …custom\index.ts (1 eigene Karten)`. `custom/index.ts` lautet danach:

```ts
// Erzeugt von `npm run maps` (packages/core/scripts/generateCustomMaps.ts). Nicht von Hand ändern.
import type { CustomMapSource } from '../mapDef';
import map_uebung from './uebung.tiled.json';

export const CUSTOM_MAP_SOURCES: readonly CustomMapSource[] = [
  { id: 'uebung', file: 'uebung.tiled.json', json: map_uebung },
];
```

- [ ] **Step 5: Tests laufen lassen**

Run: `cd packages/core; npx vitest run test/uebung.test.ts test/all-maps.test.ts test/template.test.ts test/custom-index.test.ts test/maps.test.ts` → PASS (der Test über alle Karten enthält jetzt `uebung passes its rules…` und `uebung survives a short game with a full room`).
Run: `cd packages/server; npx vitest run test/roomMap.test.ts` → PASS.
Run: `cd packages/client; npx vitest run test/mapRender.test.ts` → PASS (Grafikebenen von `uebung` passen zur Karte).
Run (Wurzel): `npm test`, `npm run typecheck` → grün.

- [ ] **Step 6: Im Spiel ansehen (optional, von Hand)**

`npm run dev`, dann `http://localhost:5173/?solo=1&map=uebung`: Kenney-Grafik der Vorlage, Spieler startet auf dem Gehweg; in der lokalen Lobby erscheint "Übung" nach "Retro" beim Blättern mit ↓.

- [ ] **Step 7: Commit**

```bash
git add packages/core/scripts/templateMap.ts packages/core/src/maps/custom/uebung.tiled.json packages/core/src/maps/custom/index.ts packages/core/test/uebung.test.ts packages/server/test/roomMap.test.ts
git commit -m "feat(core): Beispielkarte Übung im Kartenordner

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Anleitung in README und `docs/KARTEN.md`

**Files:**
- Create: `docs/KARTEN.md`
- Modify: `README.md` (neuer Abschnitt "Eigene Karten" direkt nach dem Abschnitt "Karten", vor "## Grafik")

**Interfaces:**
- Consumes: Regeln aus Plan 1 (`validate.ts`), Skripte `npm run maps`, `npm run maps:vorlage`, Dateien aus Task 1-2.
- Produces: Doku.

- [ ] **Step 1: `docs/KARTEN.md` schreiben**

```markdown
# Eigene Karten bauen

PfandRaiders lädt jede Tiled-Karte aus `packages/core/src/maps/custom/`. Diese Anleitung führt vom leeren Tiled bis zum Spiel; die kurze Fassung steht im README unter "Eigene Karten".

## 1. Tiled einrichten

- [Tiled](https://www.mapeditor.org) ab Version 1.10 installieren.
- Datei > Projekt öffnen > `maps-src/pfandraiders.tiled-project`. Das Projekt zeigt die Ordner `maps-src/` und den Kartenordner und kennt den Eigenschaftstyp `SpotType`.
- Der Kachelsatz `maps-src/kenney-city.tsx` nutzt direkt den Kenney-Bogen des Spiels (`packages/client/src/assets/kenney/modern-city.png`, 37 x 28 Kacheln zu 16 px). Nicht kopieren, nicht verschieben: Der Pfad ist relativ.

## 2. Neue Karte aus der Vorlage

1. `maps-src/vorlage.tmx` kopieren, z. B. nach `maps-src/hafen.tmx` (die Vorlage selbst nie ändern, sie wird erzeugt).
2. In Tiled öffnen. Karte > Karteneigenschaften:
   - Kachelgröße 16 x 16, Ausrichtung Orthogonal, **Unendlich aus**.
   - Größe 32 x 20 bis 128 x 80 Kacheln (Karte > Kartengröße ändern).
   - **Kachelebenen-Format: CSV** (nicht Base64 oder komprimiert).
   - Eigene Eigenschaften: `name` (Anzeigename, 1 bis 24 Zeichen, z. B. "Hafen") und `tileset` (`city` für die Kenney-Grafik, `retro` für die selbst gezeichneten Kacheln ohne Grafikebenen).

## 3. Ebenen

| Ebene | Art | Pflicht | Bedeutung |
| --- | --- | --- | --- |
| `ground` | Kachelebene | bei `tileset = city` | Boden (Straße, Gehweg, Gras, Fassaden) |
| `below` | Kachelebene | nein | Details unter den Figuren (Dächer, Fenster, Stämme, Autos) |
| `above` | Kachelebene | nein | über den Figuren (Baumkronen, Laternenköpfe) |
| `walls` | Kachelebene | ja | **jede Kachel hier ist eine Wand** (welche, ist egal; die Vorlage nimmt Kachel 1) |
| `soft` | Kachelebene | nein | weiche Hindernisse (Baum, Laterne): blockieren nur einen kleinen Kern |
| `objects` | Objektebene | ja | Startpunkte, Pfandautomaten, NPC-Eingänge, Spots |
| `zones` | Objektebene | ja (darf leer sein) | Rechtecke für Stadion- und Konzert-Events |

Andere Ebenennamen, Gruppen oder doppelte Ebenen lehnt die Prüfung ab (Groß-/Kleinschreibung zählt).

Wände malt man von Hand in `walls`, passend zum Bild in `ground`/`below`. Bei `tileset = city` braucht jede Wandkachel ein Bild in `ground` oder `below`, sonst zeichnet das Spiel die ganze Karte einfarbig. Kacheln **nicht drehen oder spiegeln** (Tasten X, Y, Z in Tiled); das Spiel zeichnet keine Drehungen. Nur Kacheln aus `kenney-city` verwenden.

## 4. Objekte

Nur **Punkt-Objekte** (Werkzeug "Punkt einfügen"), am besten in die Kachelmitte. Am einfachsten: vorhandene Objekte der Vorlage kopieren (Strg+C, Strg+V) und verschieben. Der Objekttyp steht im Feld "Klasse".

| Klasse | Anzahl | Hinweis |
| --- | --- | --- |
| `spawn` | genau 8 | Startpunkte der Spieler; mit Platz zur Wand |
| `dropoff` | mindestens 1 | Pfandautomat |
| `npc_spawn` | mindestens 2 | Eingänge für Hunde und Polizisten, gern am Kartenrand |
| `spot` | mindestens 20 | Eigenschaft `spotType`: `bus_stop`, `bench`, `bush`, `bin` oder `park` |

Zonen (Ebene `zones`) sind Rechtecke mit Namen (z. B. "Stadion") und der Eigenschaft `zoneId` (eindeutig, z. B. `stadium`, `concert`). Sie müssen ganz in der Karte liegen.

Weitere Regeln: Kein Objekt auf einer Wand oder einem weichen Hindernis. Von jedem Startpunkt aus muss jeder Startpunkt, Pfandautomat, Spot und NPC-Eingang zu Fuß erreichbar sein (waagerecht und senkrecht; Wände und weiche Hindernisse sperren).

## 5. Exportieren und einbinden

1. Datei > Exportieren als … > **JSON-Kartendatei**, Ziel `packages/core/src/maps/custom/<kennung>.tiled.json`. Die Kennung ist der Dateiname: nur `a-z`, `0-9` und `-`, höchstens 24 Zeichen, nicht `city` oder `retro`. "Kachelsätze einbetten" darf an oder aus sein.
2. Im Wurzelordner `npm run maps`. Das Skript prüft alle Karten im Ordner und trägt sie in `custom/index.ts` ein. Bei Fehlern listet es jede Datei mit allen Problemen und ändert nichts.
3. `npm test` (prüft alle Karten noch einmal und spielt auf jeder kurz eine Runde).
4. Ausprobieren: `npm run dev`, dann `http://localhost:5173/?solo=1&map=<kennung>`, oder in der lokalen Lobby mit hoch/runter wählen. Online wählt der Host die Karte in der Lobby; Server und Client müssen dieselbe Kartenliste haben (gleicher Build).
5. Die `.tiled.json`-Datei und die geänderte `custom/index.ts` committen (die `.tmx` aus `maps-src/` gern auch).

## 6. Häufige Fehlermeldungen

| Meldung (Auszug) | Abhilfe |
| --- | --- |
| `Kachelebenen-Format muss CSV sein` | Karteneigenschaften > Kachelebenen-Format auf CSV, neu exportieren |
| `Unendliche Karten gehen nicht` / `in Stücke geteilt` | Karteneigenschaften > Unendlich aus |
| `Kachel ist gespiegelt oder gedreht` | Kachel an der genannten Stelle ungedreht neu setzen |
| `liegt außerhalb des Kenney-Bogens` / `firstgid 1` | nur den Kachelsatz kenney-city verwenden |
| `Unbekannte Ebene` / `Pflichtebene … fehlt` | Ebenen exakt wie in Abschnitt 3 benennen |
| `ist kein Punkt-Objekt` / `Kachelobjekt` | Objekt mit "Punkt einfügen" neu anlegen |
| `liegt zu nah an einer Wand` | Punkt in die Kachelmitte ziehen |
| `Nicht von jedem Startpunkt aus erreichbar` | Durchgang in `walls`/`soft` freimachen |
| `Wand ohne Grafik` | an der Stelle ein Bild in `ground` oder `below` setzen |
| `Kennung … gehört einer eingebauten Karte` | Datei umbenennen |

## 7. Grenzen

- Wände kommen nur aus der Ebene `walls`; sie aus Kacheleigenschaften des Kachelsatzes abzuleiten ist spätere Arbeit.
- Ein Kachelsatz (`kenney-city`), keine gedrehten Kacheln, keine Karten zur Laufzeit hochladen.
- Die Vorlage und die Beispielkarte `uebung` erzeugt `npm run maps:vorlage` aus `packages/core/scripts/templateMap.ts`; Änderungen dort, nicht in den erzeugten Dateien.
```

- [ ] **Step 2: README-Abschnitt "Eigene Karten"**

In `README.md` direkt vor der Zeile `## Grafik` einfügen:

```markdown
## Eigene Karten

Eigene Karten baut man mit [Tiled](https://www.mapeditor.org) (ab 1.10). Ausführlich: [docs/KARTEN.md](docs/KARTEN.md).

1. `maps-src/pfandraiders.tiled-project` in Tiled öffnen, `maps-src/vorlage.tmx` kopieren und bearbeiten (Eigenschaften `name` und `tileset`, Ebenen `ground`, `below`, `above`, `walls`, `soft`, `objects`, `zones`).
2. Als JSON exportieren nach `packages/core/src/maps/custom/<kennung>.tiled.json` (Kennung: `a-z`, `0-9`, `-`, höchstens 24 Zeichen). Exporteinstellungen: Kachelebenen-Format CSV, Karte nicht unendlich; Kachelsätze einbetten egal.
3. `npm run maps` prüft alle eigenen Karten und trägt sie ein, danach `npm test`.
4. Spielen: `?map=<kennung>` in der URL, in der lokalen Lobby (hoch/runter) oder online als Host in der Lobby.

Regeln (die Prüfung meldet jeden Verstoß auf Deutsch mit Stelle): Kacheln 16 px, 32 x 20 bis 128 x 80 Kacheln, genau 8 Startpunkte, mindestens 1 Pfandautomat, 20 Spots und 2 NPC-Eingänge, nur Punkt-Objekte, nichts auf Wänden, alles von jedem Startpunkt erreichbar, keine gedrehten oder gespiegelten Kacheln, nur der Kachelsatz `kenney-city`. Wände werden von Hand in der Ebene `walls` gemalt. Beispiel: `packages/core/src/maps/custom/uebung.tiled.json` ("Übung").
```

- [ ] **Step 3: Gesamtprüfung**

Run (Wurzel), nacheinander:
- `npm run maps:vorlage` → drei Dateien geschrieben, `git status` zeigt keine Änderung an ihnen
- `npm run maps` → `unverändert: … (1 eigene Karten)`
- `npm test` → grün
- `npm run typecheck` → grün
- `npm run build` → Vite-Build ohne Fehler
- `npm run build:server` → `dist/server.cjs` ohne Fehler; `MAP_ID=uebung node packages/server/dist/server.cjs` startet ohne Warnung (danach mit Strg+C beenden)

- [ ] **Step 4: Commit**

```bash
git add docs/KARTEN.md README.md
git commit -m "docs: Anleitung für eigene Karten

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Selbstprüfung

1. **Spec-Abdeckung:** §4.1 (maps-src, Projekt, Kachelsatz, Vorlage TMX + JSON) → Task 1; §4.2 (alle Ebenen, Objekte jedes Typs und jeder Spot-Art, Zonen, Eigenschaften, deterministisch mit Test) → Task 1; §4.3 (Beispielkarte) → Task 2; §4.4 (README + `docs/KARTEN.md`) → Task 3; §4.5 (Annahme Wände) → Ruling 3 und `docs/KARTEN.md` §7; R14 (Exporteinstellungen) → Task 3.
2. **Platzhalter:** keine; jeder Codeschritt enthält den vollständigen Inhalt.
3. **Typen:** `templateTiledMap({ name, tilesetSource })`, `toTmx`, `templateFiles(): { path; content }[]`, `JsonObjectLayer` sind in Tests und Generator gleich; Namen aus Plan 1 (`validateTiledMap`, `CUSTOM_MAP_RULES`, `MAP_DEFS`, `MAP_LIST`, `isMapId`, `setMap`, `twoInLobby`) unverändert.
4. **Review Focus:** jede Zeile hat einen benannten Test.
5. **Vorab geprüft (Scratch, nicht committet):** `TEMPLATE_PLAN` durch `planToTiled` und `validateTiledMap` (strenge Regeln) ohne Probleme, auch mit Name "Übung"; `toTmx` erfüllt alle Muster aus `template.test.ts`; die Zonenobjekte haben die erwarteten Pixelmaße (Stadion 16/112/272/48).
