import { describe, expect, it } from 'vitest';
import { parseTiledMap } from '../src/tiled';

function pt(id: number, type: string, x: number, y: number, props: Record<string, string> = {}) {
  return {
    id, name: '', type, x, y, point: true, width: 0, height: 0,
    properties: Object.entries(props).map(([name, value]) => ({ name, type: 'string', value })),
  };
}
function base() {
  return {
    type: 'map', orientation: 'orthogonal', width: 4, height: 3, tilewidth: 16, tileheight: 16,
    layers: [
      { type: 'tilelayer', name: 'walls', width: 4, height: 3, data: [1, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 1] as unknown[] },
      { type: 'objectgroup', name: 'objects', objects: [pt(1, 'spawn', 24, 24), pt(2, 'spot', 40, 24, { spotType: 'bench' })] as unknown[] },
      { type: 'objectgroup', name: 'zones', objects: [] as unknown[] },
    ],
  };
}
function zone(props: Record<string, string>, over: Record<string, unknown> = {}) {
  return {
    id: 9, name: 'Stadion', type: 'zone', x: 16, y: 16, width: 32, height: 16,
    properties: Object.entries(props).map(([name, value]) => ({ name, type: 'string', value })),
    ...over,
  };
}

describe('parseTiledMap', () => {
  it('reads walls, spawn and spot', () => {
    const m = parseTiledMap(base());
    expect(m.cols).toBe(4);
    expect(m.rows).toBe(3);
    expect(m.solid).toEqual([true, true, true, true, true, false, false, true, true, true, true, true]);
    expect(m.spawns).toEqual([{ x: 24, y: 24 }]);
    expect(m.spots).toEqual([{ id: 0, type: 'bench', x: 40, y: 24 }]);
    expect(m.dropoffs).toEqual([]);
    expect(m.shops).toEqual([]);
    expect(m.npcSpawns).toEqual([]);
    expect(m.zones).toEqual([]);
  });

  it('sorts dropoff, shop and npc_spawn into their lists', () => {
    const b = base();
    b.layers[1].objects = [
      pt(1, 'dropoff', 20, 20), pt(2, 'shop', 30, 20), pt(3, 'npc_spawn', 40, 20),
      pt(4, 'spawn', 20, 30), pt(5, 'spawn', 30, 30),
    ];
    const m = parseTiledMap(b);
    expect(m.dropoffs).toEqual([{ x: 20, y: 20 }]);
    expect(m.shops).toEqual([{ x: 30, y: 20 }]);
    expect(m.npcSpawns).toEqual([{ x: 40, y: 20 }]);
    expect(m.spawns).toEqual([{ x: 20, y: 30 }, { x: 30, y: 30 }]);
  });

  it('numbers spots 0, 1, 2 in object order', () => {
    const b = base();
    b.layers[1].objects = [
      pt(1, 'spot', 20, 20, { spotType: 'bin' }),
      pt(2, 'spot', 30, 20, { spotType: 'park' }),
      pt(3, 'spot', 40, 20, { spotType: 'bush' }),
    ];
    expect(parseTiledMap(b).spots.map((s) => [s.id, s.type])).toEqual([[0, 'bin'], [1, 'park'], [2, 'bush']]);
  });

  it('reads a zone rectangle', () => {
    const b = base();
    b.layers[2].objects = [zone({ zoneId: 'stadium' })];
    expect(parseTiledMap(b).zones).toEqual([{ id: 'stadium', name: 'Stadion', area: { x0: 16, y0: 16, x1: 48, y1: 32 } }]);
  });

  it('throws on non-objects', () => {
    expect(() => parseTiledMap(null)).toThrow(/object/);
    expect(() => parseTiledMap('x')).toThrow(/object/);
    expect(() => parseTiledMap(42)).toThrow(/object/);
  });

  it('throws on wrong tile size', () => {
    const b = base();
    b.tilewidth = 32;
    expect(() => parseTiledMap(b)).toThrow(/tile size/);
  });

  it('throws when width does not match data length', () => {
    const b = base();
    b.width = 5;
    expect(() => parseTiledMap(b)).toThrow(/length/);
  });

  it('throws on non-numeric tile data', () => {
    const b = base();
    b.layers[0]!.data![2] = 'x';
    expect(() => parseTiledMap(b)).toThrow(/finite/);
  });

  it('throws on missing layers', () => {
    const a = base();
    a.layers = a.layers.filter((l) => l.name !== 'walls');
    expect(() => parseTiledMap(a)).toThrow(/walls/);
    const b = base();
    b.layers = b.layers.filter((l) => l.name !== 'objects');
    expect(() => parseTiledMap(b)).toThrow(/objects/);
  });

  it('throws on unknown object type', () => {
    const b = base();
    b.layers[1].objects = [pt(1, 'tree', 20, 20)];
    expect(() => parseTiledMap(b)).toThrow(/unknown object type/);
  });

  it('throws on bad spots', () => {
    const a = base();
    a.layers[1].objects = [pt(1, 'spot', 20, 20)];
    expect(() => parseTiledMap(a)).toThrow(/spotType/);
    const b = base();
    b.layers[1].objects = [pt(1, 'spot', 20, 20, { spotType: 'cactus' })];
    expect(() => parseTiledMap(b)).toThrow(/spotType/);
  });

  it('throws on points outside the map', () => {
    for (const [x, y] of [[64, 20], [20, -1], [20, 48], [-1, 20]]) {
      const b = base();
      b.layers[1].objects = [pt(1, 'spawn', x, y)];
      expect(() => parseTiledMap(b)).toThrow(/outside/);
    }
  });

  it('throws on non-finite points', () => {
    for (const v of [NaN, Infinity]) {
      const a = base();
      a.layers[1].objects = [pt(1, 'spawn', v, 20)];
      expect(() => parseTiledMap(a)).toThrow(/finite/);
      const b = base();
      b.layers[1].objects = [pt(1, 'spawn', 20, v)];
      expect(() => parseTiledMap(b)).toThrow(/finite/);
    }
  });

  it('throws on bad zones', () => {
    const a = base();
    a.layers[2].objects = [zone({})];
    expect(() => parseTiledMap(a)).toThrow(/zoneId/);
    const b = base();
    b.layers[2].objects = [zone({ zoneId: 'z' }, { width: 0 })];
    expect(() => parseTiledMap(b)).toThrow(/empty/);
    const c = base();
    c.layers[2].objects = [zone({ zoneId: 'z' }, { width: 64 })];
    expect(() => parseTiledMap(c)).toThrow(/leaves/);
    const d = base();
    d.layers[2].objects = [zone({ zoneId: 'z' }), zone({ zoneId: 'z' }, { id: 10 })];
    expect(() => parseTiledMap(d)).toThrow(/duplicate/);
  });

  it('is not confused by a __proto__ property name', () => {
    const b = base();
    const o = pt(3, 'spot', 20, 20, { spotType: 'bin' });
    o.properties.push({ name: '__proto__', type: 'string', value: 'x' });
    b.layers[1].objects = [o];
    expect(parseTiledMap(b).spots).toEqual([{ id: 0, type: 'bin', x: 20, y: 20 }]);
  });
});
