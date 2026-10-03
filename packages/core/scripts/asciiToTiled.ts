import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TILE } from '../src/config';
import type { TiledMap, TiledObject } from '../src/tiled';
import type { ZoneDef } from '../src/types';
import { CITY_ROWS, CITY_ZONES } from '../src/maps/city-ascii';

const OBJECT_TYPES: Record<string, string> = { '@': 'spawn', D: 'dropoff', S: 'shop', N: 'npc_spawn' };
const SPOT_CHARS: Record<string, string> = {
  b: 'bus_stop',
  n: 'bench',
  g: 'bush',
  m: 'bin',
  p: 'park',
};

/** Wandelt die ASCII-Karte in das Tiled-JSON-Format um (Entscheidung 6 des Plans). */
export function asciiToTiled(rows: string[], zones: ZoneDef[]): TiledMap {
  const cols = rows[0].length;
  const data: number[] = [];
  const objects: TiledObject[] = [];
  let id = 1;

  rows.forEach((row, r) => {
    if (row.length !== cols) throw new Error(`map row ${r} has length ${row.length}, expected ${cols}`);
    for (let c = 0; c < cols; c++) {
      const ch = row[c];
      data.push(ch === '#' ? 1 : 0);
      if (ch === '#' || ch === '.') continue;
      const base = {
        id: id++,
        name: '',
        x: c * TILE + TILE / 2,
        y: r * TILE + TILE / 2,
        width: 0,
        height: 0,
        rotation: 0,
        visible: true,
        point: true,
      };
      if (ch in OBJECT_TYPES) objects.push({ ...base, type: OBJECT_TYPES[ch] });
      else if (ch in SPOT_CHARS) {
        objects.push({
          ...base,
          type: 'spot',
          properties: [{ name: 'spotType', type: 'string', value: SPOT_CHARS[ch] }],
        });
      } else throw new Error(`unknown map char '${ch}' at row ${r}, col ${c}`);
    }
  });

  const zoneObjects: TiledObject[] = zones.map((z) => ({
    id: id++,
    name: z.name,
    type: 'zone',
    x: z.area.x0,
    y: z.area.y0,
    width: z.area.x1 - z.area.x0,
    height: z.area.y1 - z.area.y0,
    properties: [{ name: 'zoneId', type: 'string', value: z.id }],
  }));

  return {
    type: 'map',
    orientation: 'orthogonal',
    width: cols,
    height: rows.length,
    tilewidth: TILE,
    tileheight: TILE,
    layers: [
      { type: 'tilelayer', name: 'walls', width: cols, height: rows.length, data },
      { type: 'objectgroup', name: 'objects', objects },
      { type: 'objectgroup', name: 'zones', objects: zoneObjects },
    ],
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const out = fileURLToPath(new URL('../src/maps/city.tiled.json', import.meta.url));
  writeFileSync(out, JSON.stringify(asciiToTiled(CITY_ROWS, CITY_ZONES), null, 1) + '\n');
  console.log(`wrote ${out}`);
}
