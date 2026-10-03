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

  const w = cols * TILE;
  const h = rows * TILE;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h;

  const spots: SpotDef[] = [];
  const dropoffs: Point[] = [];
  const shops: Point[] = [];
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
    switch (o.type) {
      case 'spawn': spawns.push(at); break;
      case 'dropoff': dropoffs.push(at); break;
      case 'shop': shops.push(at); break;
      case 'npc_spawn': npcSpawns.push(at); break;
      case 'spot': {
        const t = prop(o, 'spotType');
        if (typeof t !== 'string' || !SPOT_TYPES.includes(t as SpotType)) fail(`unknown spotType ${String(t)}`);
        spots.push({ id: spots.length, type: t as SpotType, ...at });
        break;
      }
      default: fail(`unknown object type ${String(o.type)}`);
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

  return { cols, rows, solid, spots, dropoffs, shops, spawns, npcSpawns, zones };
}
