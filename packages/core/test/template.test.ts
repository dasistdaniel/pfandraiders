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
