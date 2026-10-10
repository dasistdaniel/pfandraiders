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
  // Beispielkarte: dieselbe Vorlage; der Kachelsatz-Pfad zeigt von custom/ zurück nach maps-src/
  const uebung = templateTiledMap({ name: 'Übung', tilesetSource: '../../../../../maps-src/kenney-city.tsx' });
  return [
    { path: 'maps-src/vorlage.tiled.json', content: json(vorlage) },
    { path: 'maps-src/vorlage.tmx', content: toTmx(vorlage) },
    { path: 'packages/core/src/maps/custom/uebung.tiled.json', content: json(uebung) },
  ];
}
