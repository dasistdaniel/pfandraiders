import { describe, expect, it } from 'vitest';
import { SHEET_CELLS, parseTiledMap, parseTiledVisuals } from '../src/tiled';
import { MAP_DEFS, MAP_VISUALS } from '../src/maps';

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
    expect('shops' in m).toBe(false);
    expect(m.npcSpawns).toEqual([]);
    expect(m.zones).toEqual([]);
  });

  it('sorts dropoff and npc_spawn into their lists', () => {
    const b = base();
    b.layers[1].objects = [
      pt(1, 'dropoff', 20, 20), pt(3, 'npc_spawn', 40, 20),
      pt(4, 'spawn', 20, 30), pt(5, 'spawn', 30, 30),
    ];
    const m = parseTiledMap(b);
    expect(m.dropoffs).toEqual([{ x: 20, y: 20 }]);
    expect(m.npcSpawns).toEqual([{ x: 40, y: 20 }]);
    expect(m.spawns).toEqual([{ x: 20, y: 30 }, { x: 30, y: 30 }]);
  });

  it('rejects the former shop object', () => {
    const b = base();
    b.layers[1].objects = [pt(1, 'spawn', 24, 24), pt(2, 'shop', 30, 20)];
    expect(() => parseTiledMap(b)).toThrow(/unknown object type shop/);
  });

  it('reads the object type from "class" when "type" is missing or empty (Tiled 1.9)', () => {
    const b = base();
    b.layers[1].objects = [
      { ...pt(1, 'spawn', 24, 24), type: '', class: 'spawn' },
      { id: 2, name: '', class: 'spot', x: 40, y: 24, point: true, properties: [{ name: 'spotType', type: 'string', value: 'bin' }] },
    ];
    const m = parseTiledMap(b);
    expect(m.spawns).toEqual([{ x: 24, y: 24 }]);
    expect(m.spots).toEqual([{ id: 0, type: 'bin', x: 40, y: 24 }]);
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

describe('parseTiledVisuals', () => {
  const N = 12;
  const tl = (name: string, data: unknown[]) => ({ type: 'tilelayer', name, width: 4, height: 3, data });
  const withLayers = (...extra: unknown[]) => {
    const b = base();
    b.layers.push(...(extra as never[]));
    return b;
  };
  const seq = (k: number) => Array.from({ length: N }, (_, i) => (i + k) % (SHEET_CELLS + 1));

  it('returns null without visual layers', () => {
    expect(parseTiledVisuals(base())).toBeNull();
  });
  it('reads all three layers', () => {
    const v = parseTiledVisuals(withLayers(tl('ground', seq(1)), tl('below', seq(2)), tl('above', seq(3))));
    expect(v).toEqual({ cols: 4, rows: 3, ground: seq(1), below: seq(2), above: seq(3) });
  });
  it('zero-fills missing layers', () => {
    const v = parseTiledVisuals(withLayers(tl('ground', seq(1))));
    expect(v?.below).toEqual(new Array(N).fill(0));
    expect(v?.above).toEqual(new Array(N).fill(0));
    expect(v?.ground).toEqual(seq(1));
  });
  it('accepts 0 and SHEET_CELLS', () => {
    const d = new Array(N).fill(0);
    d[3] = SHEET_CELLS;
    expect(parseTiledVisuals(withLayers(tl('ground', d)))?.ground[3]).toBe(SHEET_CELLS);
  });
  it('throws on wrong length', () => {
    expect(() => parseTiledVisuals(withLayers(tl('ground', [1, 2])))).toThrow(/invalid tiled map/);
  });
  it('throws when data is not an array', () => {
    expect(() => parseTiledVisuals(withLayers({ type: 'tilelayer', name: 'below', data: 'x' }))).toThrow(/invalid tiled map/);
  });
  for (const bad of [-1, SHEET_CELLS + 1, 1.5, NaN, Infinity, 'a', null]) {
    it(`throws on cell ${String(bad)}`, () => {
      const d = new Array<unknown>(N).fill(0);
      d[5] = bad;
      expect(() => parseTiledVisuals(withLayers(tl('above', d)))).toThrow(/invalid tiled map/);
    });
  }
  it('throws when a layer of that name has the wrong type', () => {
    expect(() => parseTiledVisuals(withLayers({ type: 'objectgroup', name: 'ground', objects: [] }))).toThrow(/invalid tiled map/);
  });
  it('is not disturbed by a layer named __proto__', () => {
    expect(parseTiledVisuals(withLayers(tl('__proto__', seq(1))))).toBeNull();
    const v = parseTiledVisuals(withLayers(tl('__proto__', seq(1)), tl('ground', seq(2))));
    expect(v?.ground).toEqual(seq(2));
  });
  it('rejects non-objects and bad sizes', () => {
    expect(() => parseTiledVisuals(null)).toThrow(/invalid tiled map/);
    expect(() => parseTiledVisuals({ width: 0, height: 1, layers: [] })).toThrow(/invalid tiled map/);
    expect(() => parseTiledVisuals({ width: 1, height: 1, layers: 'x' })).toThrow(/invalid tiled map/);
  });
  it('parseTiledMap ignores visual layers', () => {
    expect(parseTiledMap(withLayers(tl('ground', seq(1)))).cols).toBe(4);
  });
  it('retro map has no visuals', () => {
    expect(MAP_DEFS.retro.visuals).toBeNull();
    expect(MAP_VISUALS.retro).toBeNull();
  });
});

describe('parseTiledMap: soft layer', () => {
  const softLayer = (data: unknown[]) => ({ type: 'tilelayer', name: 'soft', width: 4, height: 3, data });
  const withSoft = (data: unknown[]) => {
    const a = base();
    a.layers.push(softLayer(data));
    return a;
  };
  const NONE = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

  it('reads the optional soft layer', () => {
    const m = parseTiledMap(withSoft([0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0]));
    expect(m.soft).toEqual([false, false, false, false, false, true, false, false, false, false, false, false]);
    expect(m.solid[5]).toBe(false);
  });

  it('has no soft field without the layer', () => {
    const m = parseTiledMap(base());
    expect('soft' in m).toBe(false);
    expect(m.soft).toBeUndefined();
  });

  it('rejects a wrong data length and non-numbers', () => {
    expect(() => parseTiledMap(withSoft([0, 1]))).toThrow(/invalid tiled map: .*soft/);
    expect(() => parseTiledMap(withSoft([...NONE.slice(1), 'x']))).toThrow(/invalid tiled map/);
    expect(() => parseTiledMap(withSoft([...NONE.slice(1), null]))).toThrow(/invalid tiled map/);
  });

  it('rejects a tile that is both wall and soft', () => {
    expect(() => parseTiledMap(withSoft([1, ...NONE.slice(1)]))).toThrow(/invalid tiled map: .*wall and soft/);
  });

  it('rejects a soft layer that is not a tilelayer', () => {
    const a = base();
    a.layers.push({ type: 'objectgroup', name: 'soft', objects: [] } as never);
    expect(() => parseTiledMap(a)).toThrow(/invalid tiled map/);
  });
});
