import { TILE } from './config';
import type { MapData, Point, SpotDef, SpotType, ZoneDef } from './types';

export interface TiledProperty { name: string; type?: string; value: unknown }
export interface TiledObject {
  id: number; name: string; type: string; x: number; y: number;
  width?: number; height?: number; point?: boolean; properties?: TiledProperty[];
}
export type TiledLayer =
  | { type: 'tilelayer'; name: string; width: number; height: number; data: number[] }
  | { type: 'objectgroup'; name: string; objects: TiledObject[] };
export interface TiledMap {
  type: 'map'; orientation: 'orthogonal'; width: number; height: number;
  tilewidth: number; tileheight: number; layers: TiledLayer[];
}

/** Größe des Kachelbilds, auf das sich die Zellnummern der Grafikebenen beziehen (gid = Zeile * SHEET_COLS + Spalte + 1). */
export const SHEET_COLS = 37;
export const SHEET_ROWS = 28;
export const SHEET_CELLS = SHEET_COLS * SHEET_ROWS;

/** Grafikebenen einer Karte; Einträge 0 (leer) bis SHEET_CELLS. */
export interface MapVisuals { cols: number; rows: number; ground: number[]; below: number[]; above: number[] }

const SPOT_TYPES: readonly SpotType[] = ['bus_stop', 'bench', 'bush', 'bin', 'park'];

function fail(msg: string): never {
  throw new Error(`invalid tiled map: ${msg}`);
}
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function finite(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(`${what} must be a finite number`);
  return v;
}
function prop(o: Record<string, unknown>, name: string): unknown {
  const list = o.properties;
  if (!Array.isArray(list)) return undefined;
  for (const p of list) if (isRecord(p) && p.name === name) return p.value;
  return undefined;
}
function layer(layers: unknown[], name: string, type: string): Record<string, unknown> {
  const l = layers.find((x) => isRecord(x) && x.name === name && x.type === type);
  if (!l || !isRecord(l)) fail(`missing ${type} "${name}"`);
  return l;
}

/** Liest eine Karte im Tiled-JSON-Format (Teilmenge, siehe Plan). Wirft bei jeder Abweichung. */
export function parseTiledMap(json: unknown): MapData {
  if (!isRecord(json)) fail('not an object');
  const cols = finite(json.width, 'width');
  const rows = finite(json.height, 'height');
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1) fail('bad size');
  if (json.tilewidth !== TILE || json.tileheight !== TILE) fail(`tile size must be ${TILE}`);
  if (!Array.isArray(json.layers)) fail('layers must be an array');

  const wallLayer = layer(json.layers, 'walls', 'tilelayer');
  const data = wallLayer.data;
  if (!Array.isArray(data) || data.length !== cols * rows) fail('walls data length does not match width*height');
  const solid = data.map((g) => finite(g, 'wall tile') !== 0);

  // Optionale Ebene "soft": weiche Kacheln (nur der Kern blockiert); fehlt sie, gibt es kein soft-Feld.
  let soft: boolean[] | undefined;
  const softLayer = json.layers.find((x) => isRecord(x) && x.name === 'soft');
  if (softLayer) {
    if (!isRecord(softLayer) || softLayer.type !== 'tilelayer') fail('"soft" must be a tilelayer');
    const sd = softLayer.data;
    if (!Array.isArray(sd) || sd.length !== cols * rows) fail('soft data length does not match width*height');
    soft = sd.map((g, i) => {
      const on = finite(g, 'soft tile') !== 0;
      if (on && solid[i]) fail(`tile ${i} is both wall and soft`);
      return on;
    });
  }

  const w = cols * TILE;
  const h = rows * TILE;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h;

  const spots: SpotDef[] = [];
  const dropoffs: Point[] = [];
  const spawns: Point[] = [];
  const npcSpawns: Point[] = [];
  const objects = layer(json.layers, 'objects', 'objectgroup').objects;
  if (!Array.isArray(objects)) fail('objects must be an array');
  for (const o of objects) {
    if (!isRecord(o)) fail('object is not an object');
    const x = finite(o.x, 'object x');
    const y = finite(o.y, 'object y');
    if (!inside(x, y)) fail(`object at (${x}, ${y}) is outside the map`);
    const at = { x, y };
    // Tiled 1.9 schreibt den Objekttyp als "class", ältere und neuere Versionen als "type"
    const kind = typeof o.type === 'string' && o.type !== '' ? o.type : o.class;
    switch (kind) {
      case 'spawn': spawns.push(at); break;
      case 'dropoff': dropoffs.push(at); break;
      case 'npc_spawn': npcSpawns.push(at); break;
      case 'spot': {
        const t = prop(o, 'spotType');
        if (typeof t !== 'string' || !SPOT_TYPES.includes(t as SpotType)) fail(`unknown spotType ${String(t)}`);
        spots.push({ id: spots.length, type: t as SpotType, ...at });
        break;
      }
      default: fail(`unknown object type ${String(kind)}`);
    }
  }

  const zones: ZoneDef[] = [];
  const zoneObjects = layer(json.layers, 'zones', 'objectgroup').objects;
  if (!Array.isArray(zoneObjects)) fail('zones must be an array');
  for (const z of zoneObjects) {
    if (!isRecord(z)) fail('zone is not an object');
    const id = prop(z, 'zoneId');
    if (typeof id !== 'string' || id === '') fail('zone without zoneId');
    if (zones.some((q) => q.id === id)) fail(`duplicate zoneId ${id}`);
    const x0 = finite(z.x, 'zone x');
    const y0 = finite(z.y, 'zone y');
    const x1 = x0 + finite(z.width, 'zone width');
    const y1 = y0 + finite(z.height, 'zone height');
    if (!(x1 > x0 && y1 > y0)) fail(`zone ${id} is empty`);
    if (x0 < 0 || y0 < 0 || x1 > w || y1 > h) fail(`zone ${id} leaves the map`);
    zones.push({ id, name: typeof z.name === 'string' ? z.name : id, area: { x0, y0, x1, y1 } });
  }

  const map: MapData = { cols, rows, solid, spots, dropoffs, spawns, npcSpawns, zones };
  if (soft) map.soft = soft;
  return map;
}

const VISUAL_LAYERS = ['ground', 'below', 'above'] as const;

/**
 * Liest die Grafikebenen `ground`, `below`, `above` (tilelayer). Gibt `null` zurück, wenn keine
 * der drei existiert; fehlt nur eine, ist sie mit Nullen belegt. Wirft bei kaputten Ebenen.
 */
export function parseTiledVisuals(json: unknown): MapVisuals | null {
  if (!isRecord(json)) fail('not an object');
  const cols = finite(json.width, 'width');
  const rows = finite(json.height, 'height');
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1) fail('bad size');
  if (!Array.isArray(json.layers)) fail('layers must be an array');
  const layers: unknown[] = json.layers;

  const read = (name: string): number[] | null => {
    const l = layers.find((x) => isRecord(x) && x.name === name);
    if (!l || !isRecord(l)) return null;
    if (l.type !== 'tilelayer') fail(`"${name}" must be a tilelayer`);
    const data = l.data;
    if (!Array.isArray(data) || data.length !== cols * rows) fail(`${name} data length does not match width*height`);
    return data.map((g) => {
      if (typeof g !== 'number' || !Number.isInteger(g) || g < 0 || g > SHEET_CELLS) {
        fail(`${name} tile must be an integer from 0 to ${SHEET_CELLS}`);
      }
      return g;
    });
  };

  const [ground, below, above] = VISUAL_LAYERS.map(read);
  if (!ground && !below && !above) return null;
  const empty = () => new Array<number>(cols * rows).fill(0);
  return { cols, rows, ground: ground ?? empty(), below: below ?? empty(), above: above ?? empty() };
}
