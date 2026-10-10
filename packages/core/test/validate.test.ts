import { describe, expect, it } from 'vitest';
import { MAX_ROOM_PLAYERS } from '../src/protocol';
import { SHEET_CELLS } from '../src/tiled';
import { BUILTIN_MAP_RULES, CUSTOM_MAP_RULES, MAP_LAYER_NAMES, validateTiledMap } from '../src/maps/validate';
import type { ValidateOptions } from '../src/maps/validate';
import { FIX_COLS, fixtureCityMap, fixtureMap, point } from './mapFixture';

type Fixture = ReturnType<typeof fixtureMap>;
type Obj = Record<string, unknown>;

function layer(m: Fixture, name: string): Obj {
  const l = m.layers.find((x) => x.name === name);
  if (!l) throw new Error(`Ebene ${name} fehlt in der Testkarte`);
  return l;
}
const objects = (m: Fixture): Obj[] => layer(m, 'objects').objects as Obj[];
const tiles = (m: Fixture, name: string): number[] => layer(m, name).data as number[];
const idx = (c: number, r: number): number => r * FIX_COLS + c;
const problems = (m: unknown, opts: ValidateOptions = {}): string[] => validateTiledMap(m, opts).problems;
/** Lässt von einem Objekttyp nur die ersten `keep` übrig. */
const withoutType = (m: Fixture, type: string, keep: number): Fixture => {
  let seen = 0;
  layer(m, 'objects').objects = objects(m).filter((o) => o.type !== type || seen++ < keep);
  return m;
};

describe('validateTiledMap: valid maps', () => {
  it('accepts the retro fixture and reads name, tileset and map', () => {
    const v = validateTiledMap(fixtureMap());
    expect(v.problems).toEqual([]);
    expect(v.name).toBe('Testkarte');
    expect(v.tileset).toBe('retro');
    expect(v.map?.spawns).toHaveLength(8);
    expect(v.map?.spots).toHaveLength(20);
    expect(v.visuals).toBeNull();
  });

  it('accepts the city fixture with a ground layer and an external tileset', () => {
    const v = validateTiledMap(fixtureCityMap());
    expect(v.problems).toEqual([]);
    expect(v.tileset).toBe('city');
    expect(v.visuals?.ground).toHaveLength(FIX_COLS * 20);
  });

  it('accepts an embedded tileset with firstgid 1', () => {
    const m = fixtureCityMap();
    m.tilesets = [{ firstgid: 1, name: 'kenney-city', image: 'modern-city.png', columns: 37, tilecount: 1036 }];
    expect(problems(m)).toEqual([]);
  });

  it('has no name without the name property', () => {
    const m = fixtureMap();
    m.properties = m.properties.filter((p) => p.name !== 'name');
    const v = validateTiledMap(m);
    expect(v.problems).toEqual([]);
    expect(v.name).toBeNull();
  });

  it('lets a retro map carry visual layers of the right size', () => {
    const m = fixtureMap();
    m.layers.push({ id: 9, type: 'tilelayer', name: 'below', width: FIX_COLS, height: 20, data: new Array<number>(FIX_COLS * 20).fill(0) });
    expect(problems(m)).toEqual([]);
  });
});

describe('validateTiledMap: rule sets', () => {
  it('uses the counts of the spec for custom maps and the retro exception for built-in maps', () => {
    expect(CUSTOM_MAP_RULES).toEqual({ minSpawns: 8, maxSpawns: 8, minDropoffs: 1, minSpots: 20, minNpcSpawns: 2 });
    expect(BUILTIN_MAP_RULES).toEqual({ minSpawns: 4, maxSpawns: 8, minDropoffs: 1, minSpots: 16, minNpcSpawns: 2 });
    expect(CUSTOM_MAP_RULES.maxSpawns).toBe(MAX_ROOM_PLAYERS);
    expect(BUILTIN_MAP_RULES.maxSpawns).toBe(MAX_ROOM_PLAYERS);
  });

  it('knows exactly these layer names', () => {
    expect(MAP_LAYER_NAMES).toEqual(['walls', 'soft', 'ground', 'below', 'above', 'objects', 'zones']);
  });
});

describe('validateTiledMap: map shape', () => {
  it('rejects non-objects', () => {
    for (const bad of [null, 7, 'map', []]) {
      const v = validateTiledMap(bad);
      expect(v.problems).toEqual(['Die Datei ist keine Tiled-Karte im JSON-Format.']);
      expect(v.map).toBeNull();
    }
  });

  it('rejects maps smaller than 32 x 20 or larger than 128 x 80', () => {
    const narrow = fixtureMap();
    narrow.width = 31;
    expect(problems(narrow)).toEqual(['Größe 31 x 20 Kacheln; erlaubt sind 32 x 20 bis 128 x 80.']);
    const low = fixtureMap();
    low.height = 19;
    expect(problems(low)).toEqual(['Größe 32 x 19 Kacheln; erlaubt sind 32 x 20 bis 128 x 80.']);
    const wide = fixtureMap();
    wide.width = 129;
    expect(problems(wide)).toEqual(['Größe 129 x 20 Kacheln; erlaubt sind 32 x 20 bis 128 x 80.']);
  });

  it('rejects other tile sizes, infinite maps and other orientations', () => {
    const m = fixtureMap();
    m.tilewidth = 32;
    m.infinite = true;
    m.orientation = 'isometric';
    expect(problems(m)).toEqual([
      'Unendliche Karten gehen nicht; in den Karteneigenschaften "Unendlich" ausschalten.',
      'Die Ausrichtung muss "Orthogonal" sein.',
      'Kachelgröße muss 16 x 16 Pixel sein.',
    ]);
  });
});

describe('validateTiledMap: layers', () => {
  it('requires walls, objects and zones', () => {
    const m = fixtureMap();
    m.layers = [];
    expect(problems(m)).toEqual(['Pflichtebene "walls" fehlt.', 'Pflichtebene "objects" fehlt.', 'Pflichtebene "zones" fehlt.']);
  });

  it('rejects unknown, duplicate and wrongly typed layers', () => {
    const renamed = fixtureMap();
    layer(renamed, 'walls').name = 'Walls';
    expect(problems(renamed)).toEqual([
      'Unbekannte Ebene "Walls" (erlaubt: walls, soft, ground, below, above, objects, zones; keine Gruppen).',
      'Pflichtebene "walls" fehlt.',
    ]);
    const twice = fixtureMap();
    twice.layers.push({ ...layer(twice, 'walls') });
    expect(problems(twice)).toEqual(['Ebene "walls" gibt es doppelt.']);
    const typed = fixtureMap();
    layer(typed, 'zones').type = 'tilelayer';
    expect(problems(typed)).toContain('Ebene "zones" muss eine Objektebene sein.');
    const walls = fixtureMap();
    layer(walls, 'walls').type = 'objectgroup';
    expect(problems(walls)).toContain('Ebene "walls" muss eine Kachelebene sein.');
  });

  it('asks for the CSV layer format instead of base64', () => {
    const m = fixtureMap();
    const walls = layer(m, 'walls');
    walls.data = 'AAAAAA==';
    walls.encoding = 'base64';
    expect(problems(m)).toEqual([
      'Ebene "walls": Kachelebenen-Format muss CSV sein (Karteneigenschaften > Kachelebenen-Format), nicht base64.',
    ]);
  });

  it('rejects chunked layers of infinite maps and wrong data lengths', () => {
    const chunked = fixtureMap();
    const walls = layer(chunked, 'walls');
    delete walls.data;
    walls.chunks = [];
    expect(problems(chunked)).toEqual(['Ebene "walls" ist in Stücke geteilt (unendliche Karte); "Unendlich" ausschalten.']);
    const short = fixtureMap();
    tiles(short, 'walls').pop();
    expect(problems(short)).toEqual(['Ebene "walls" hat 639 Kacheln, erwartet 640 (Breite x Höhe).']);
  });

  it('allows only one tileset with firstgid 1', () => {
    const two = fixtureCityMap();
    two.tilesets = [{ firstgid: 1, source: 'kenney-city.tsx' }, { firstgid: 1037, source: 'andere.tsx' }];
    expect(problems(two)).toEqual(['Die Karte nutzt 2 Kachelsätze; erlaubt ist nur kenney-city.']);
    const shifted = fixtureCityMap();
    shifted.tilesets = [{ firstgid: 2, source: 'kenney-city.tsx' }];
    expect(problems(shifted)).toEqual(['Der Kachelsatz kenney-city muss firstgid 1 haben.']);
    const broken = fixtureCityMap();
    (broken as Record<string, unknown>).tilesets = 'kenney';
    expect(problems(broken)).toEqual(['"tilesets" muss eine Liste sein.']);
  });
});

describe('validateTiledMap: tiles', () => {
  it('rejects flipped or rotated tiles with a hint', () => {
    for (const gid of [0x80000000 + 5, 0x40000000 + 5, 0x20000000 + 5, 0x10000000 + 5]) {
      const m = fixtureCityMap();
      tiles(m, 'ground')[idx(5, 3)] = gid;
      expect(problems(m), String(gid)).toEqual([
        'Ebene "ground", Spalte 5, Zeile 3: Kachel ist gespiegelt oder gedreht. Das geht nicht; bitte die Kachel ungedreht setzen (in Tiled ohne X, Y oder Z).',
      ]);
    }
  });

  it('rejects tiles outside the Kenney sheet and non-integers', () => {
    const big = fixtureCityMap();
    tiles(big, 'ground')[idx(2, 1)] = SHEET_CELLS + 1;
    expect(problems(big)).toEqual([
      'Ebene "ground", Spalte 2, Zeile 1: Kachel 1037 liegt außerhalb des Kenney-Bogens (1 bis 1036); nur kenney-city mit firstgid 1 ist erlaubt.',
    ]);
    const odd = fixtureCityMap();
    tiles(odd, 'ground')[idx(2, 1)] = 1.5;
    expect(problems(odd)).toEqual(['Ebene "ground", Spalte 2, Zeile 1: ungültige Kachel 1.5.']);
  });

  it('counts any non-zero wall tile as a wall, flipped or not', () => {
    const m = fixtureMap();
    tiles(m, 'walls')[idx(5, 10)] = 0x80000001;
    const v = validateTiledMap(m);
    expect(v.problems).toEqual([]);
    expect(v.map?.solid[idx(5, 10)]).toBe(true);
  });

  it('needs a ground layer for the city tileset', () => {
    const m = fixtureMap();
    m.properties = [{ name: 'tileset', type: 'string', value: 'city' }];
    expect(problems(m)).toEqual(['Kachelsatz "city" braucht die Grafikebene "ground" (oder Eigenschaft tileset = "retro").']);
  });

  it('needs a graphic on every wall of a city map', () => {
    const m = fixtureCityMap();
    tiles(m, 'ground')[idx(0, 0)] = 0;
    expect(problems(m)).toEqual([
      'Wand ohne Grafik bei Spalte 0, Zeile 0: jede Wandkachel braucht eine Kachel in "ground" oder "below" (sonst zeichnet das Spiel die Karte einfarbig).',
    ]);
    m.layers.push({ id: 9, type: 'tilelayer', name: 'below', width: FIX_COLS, height: 20, data: new Array<number>(FIX_COLS * 20).fill(0) });
    tiles(m, 'below')[idx(0, 0)] = 7;
    expect(problems(m)).toEqual([]);
  });
});

describe('validateTiledMap: properties', () => {
  it('checks the name and tileset properties', () => {
    const m = fixtureMap();
    m.properties = [
      { name: 'name', type: 'string', value: '   ' },
      { name: 'tileset', type: 'string', value: 'kenney' },
    ];
    expect(problems(m)).toEqual([
      'Eigenschaft "name" muss Text mit 1 bis 24 Zeichen sein.',
      'Eigenschaft "tileset" muss "city" oder "retro" sein, nicht "kenney".',
      // Ungültiger Kachelsatz: es gilt der Standard city, und dem fehlt ground
      'Kachelsatz "city" braucht die Grafikebene "ground" (oder Eigenschaft tileset = "retro").',
    ]);
    const long = fixtureMap();
    long.properties = [
      { name: 'name', type: 'string', value: 'x'.repeat(25) },
      { name: 'tileset', type: 'string', value: 'retro' },
    ];
    expect(problems(long)).toEqual(['Eigenschaft "name" muss Text mit 1 bis 24 Zeichen sein.']);
    const list = fixtureMap();
    (list as Record<string, unknown>).properties = { name: 'x' };
    expect(problems(list)).toContain('Die Karteneigenschaften ("properties") müssen eine Liste sein.');
  });

  it('lets the caller fix the tileset (built-in maps without properties)', () => {
    const v = validateTiledMap(fixtureMap(), { tileset: 'city' });
    expect(v.tileset).toBe('city');
    expect(v.problems).toEqual(['Kachelsatz "city" braucht die Grafikebene "ground" (oder Eigenschaft tileset = "retro").']);
  });
});

describe('validateTiledMap: objects', () => {
  it('wants point objects, not rectangles or tile objects', () => {
    const rect = fixtureMap();
    objects(rect)[0].point = false;
    expect(problems(rect)).toEqual(['Objekt 1 (spawn) ist kein Punkt-Objekt; bitte das Werkzeug "Punkt einfügen" nehmen.']);
    const tile = fixtureMap();
    objects(tile)[0].gid = 5;
    expect(problems(tile)).toEqual(['Objekt 1 (spawn) ist ein Kachelobjekt; bitte ein Punkt-Objekt nehmen.']);
  });

  it('rejects unknown object types and spots without spotType', () => {
    const tree = fixtureMap();
    objects(tree).push(point(99, 'tree', 10, 10));
    expect(problems(tree)).toEqual(['Tiled-Datei nicht lesbar: invalid tiled map: unknown object type tree.']);
    const spot = fixtureMap();
    delete objects(spot)[9].properties;
    expect(problems(spot)).toEqual(['Tiled-Datei nicht lesbar: invalid tiled map: unknown spotType undefined.']);
  });

  it('reports zones that leave the map', () => {
    const m = fixtureMap();
    (layer(m, 'zones').objects as Obj[])[0].width = 1000;
    expect(problems(m)).toEqual(['Tiled-Datei nicht lesbar: invalid tiled map: zone stadium leaves the map.']);
  });

  it('needs exactly 8 spawns, a dropoff, 20 spots and 2 NPC entrances', () => {
    expect(problems(withoutType(fixtureMap(), 'spawn', 7))).toEqual(['Startpunkte (spawn): 7, nötig sind genau 8.']);
    const nine = fixtureMap();
    objects(nine).push(point(99, 'spawn', 20, 2));
    expect(problems(nine)).toEqual(['Startpunkte (spawn): 9, nötig sind genau 8.']);
    expect(problems(withoutType(fixtureMap(), 'dropoff', 0))).toEqual(['Pfandautomaten (dropoff): 0, nötig ist mindestens 1.']);
    expect(problems(withoutType(fixtureMap(), 'spot', 19))).toEqual(['Spots (spot): 19, nötig sind mindestens 20.']);
    expect(problems(withoutType(fixtureMap(), 'npc_spawn', 1))).toEqual(['NPC-Eingänge (npc_spawn): 1, nötig sind mindestens 2.']);
  });

  it('allows 4 to 8 spawns and 16 spots with the built-in rules', () => {
    const m = withoutType(withoutType(fixtureMap(), 'spawn', 4), 'spot', 16);
    expect(problems(m, { rules: BUILTIN_MAP_RULES })).toEqual([]);
    expect(problems(withoutType(fixtureMap(), 'spawn', 3), { rules: BUILTIN_MAP_RULES })).toEqual([
      'Startpunkte (spawn): 3, erlaubt sind 4 bis 8.',
    ]);
  });

  it('rejects objects on walls and on soft tiles', () => {
    const wall = fixtureMap();
    objects(wall)[8] = point(9, 'dropoff', 0, 10);
    expect(problems(wall)).toEqual([
      'Pfandautomat bei (8, 168) steht auf einer Wand.',
      'Nicht von jedem Startpunkt aus erreichbar: Pfandautomat (8, 168).',
    ]);
    const soft = fixtureMap();
    const data = new Array<number>(FIX_COLS * 20).fill(0);
    data[idx(2, 5)] = 1;
    soft.layers.push({ id: 9, type: 'tilelayer', name: 'soft', width: FIX_COLS, height: 20, data });
    expect(problems(soft)).toEqual([
      'Spot bus_stop bei (40, 88) steht auf einem weichen Hindernis (Ebene soft).',
      'Nicht von jedem Startpunkt aus erreichbar: Spot bus_stop (40, 88).',
    ]);
  });

  it('wants room for the player at spawns and NPC entrances', () => {
    const m = fixtureMap();
    objects(m)[0].x = 18;
    objects(m)[0].y = 24;
    expect(problems(m)).toEqual(['Startpunkt bei (18, 24) liegt zu nah an einer Wand; am besten in die Kachelmitte setzen.']);
    const npc = fixtureMap();
    const entrance = objects(npc).find((o) => o.type === 'npc_spawn')!;
    entrance.x = 17;
    expect(problems(npc)).toEqual(['NPC-Eingang bei (17, 296) liegt zu nah an einer Wand; am besten in die Kachelmitte setzen.']);
  });

  it('reports objects that cannot be reached from every spawn', () => {
    const boxed = fixtureMap();
    for (const [c, r] of [[2, 4], [1, 5], [3, 5], [2, 6]]) tiles(boxed, 'walls')[idx(c, r)] = 1;
    expect(problems(boxed)).toEqual(['Nicht von jedem Startpunkt aus erreichbar: Spot bus_stop (40, 88).']);
    const split = fixtureMap();
    for (let c = 1; c < FIX_COLS - 1; c++) tiles(split, 'walls')[idx(c, 4)] = 1;
    expect(problems(split)).toEqual([
      'Nicht von jedem Startpunkt aus erreichbar: NPC-Eingang (24, 296), NPC-Eingang (488, 296), Pfandautomat (264, 168), Spot bus_stop (40, 88), Spot bench (72, 88) und 18 weitere.',
    ]);
  });

  it('collects every problem instead of stopping at the first', () => {
    const m = withoutType(withoutType(fixtureMap(), 'spawn', 7), 'dropoff', 0);
    objects(m)[0].x = 18;
    objects(m)[0].y = 24;
    expect(problems(m)).toEqual([
      'Startpunkte (spawn): 7, nötig sind genau 8.',
      'Pfandautomaten (dropoff): 0, nötig ist mindestens 1.',
      'Startpunkt bei (18, 24) liegt zu nah an einer Wand; am besten in die Kachelmitte setzen.',
    ]);
  });
});
