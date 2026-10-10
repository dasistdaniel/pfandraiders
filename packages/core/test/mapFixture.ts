/** Kleinste gültige eigene Karte für Tests: 32 x 20, Rand aus Wänden, Kachelsatz retro (ohne Grafikebenen). */
export const FIX_COLS = 32;
export const FIX_ROWS = 20;

type Obj = Record<string, unknown>;

/** Punkt-Objekt in der Mitte der Kachel (Spalte c, Zeile r). */
export function point(id: number, type: string, c: number, r: number, spotType?: string): Obj {
  const o: Obj = { id, name: '', type, x: c * 16 + 8, y: r * 16 + 8, width: 0, height: 0, rotation: 0, visible: true, point: true };
  if (spotType) o.properties = [{ name: 'spotType', type: 'string', value: spotType }];
  return o;
}

const SPOT_TYPES = ['bus_stop', 'bench', 'bush', 'bin', 'park'];

/**
 * Neue, veränderbare Karte; jeder Aufruf liefert eine eigene Kopie. Objekte: 8 Startpunkte (Zeile 2),
 * Pfandautomat (16, 10), 20 Spots (Zeilen 5 und 7), 2 NPC-Eingänge (Zeile 18), Zone "stadium".
 */
export function fixtureMap(): {
  type: string;
  orientation: string;
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  infinite: boolean;
  properties: Obj[];
  tilesets?: Obj[];
  layers: Obj[];
} {
  const walls: number[] = [];
  for (let r = 0; r < FIX_ROWS; r++) {
    for (let c = 0; c < FIX_COLS; c++) walls.push(r === 0 || c === 0 || r === FIX_ROWS - 1 || c === FIX_COLS - 1 ? 1 : 0);
  }
  let id = 1;
  const objects: Obj[] = [];
  for (let i = 0; i < 8; i++) objects.push(point(id++, 'spawn', 2 + i * 2, 2));
  objects.push(point(id++, 'dropoff', 16, 10));
  for (let i = 0; i < 20; i++) objects.push(point(id++, 'spot', 2 + (i % 10) * 2, i < 10 ? 5 : 7, SPOT_TYPES[i % SPOT_TYPES.length]));
  objects.push(point(id++, 'npc_spawn', 1, 18));
  objects.push(point(id++, 'npc_spawn', 30, 18));
  const zone = {
    id: id++,
    name: 'Stadion',
    type: 'zone',
    x: 64,
    y: 192,
    width: 192,
    height: 64,
    properties: [{ name: 'zoneId', type: 'string', value: 'stadium' }],
  };
  return {
    type: 'map',
    orientation: 'orthogonal',
    width: FIX_COLS,
    height: FIX_ROWS,
    tilewidth: 16,
    tileheight: 16,
    infinite: false,
    properties: [
      { name: 'name', type: 'string', value: 'Testkarte' },
      { name: 'tileset', type: 'string', value: 'retro' },
    ],
    layers: [
      { id: 1, type: 'tilelayer', name: 'walls', width: FIX_COLS, height: FIX_ROWS, x: 0, y: 0, opacity: 1, visible: true, data: walls },
      { id: 2, type: 'objectgroup', name: 'objects', objects },
      { id: 3, type: 'objectgroup', name: 'zones', objects: [zone] },
    ],
  };
}

/** Dieselbe Karte mit Kachelsatz city: Grafikebene ground überall belegt (Kachel 1), externer Kachelsatz. */
export function fixtureCityMap(): ReturnType<typeof fixtureMap> {
  const m = fixtureMap();
  m.properties = [
    { name: 'name', type: 'string', value: 'Teststadt' },
    { name: 'tileset', type: 'string', value: 'city' },
  ];
  m.tilesets = [{ firstgid: 1, source: 'kenney-city.tsx' }];
  m.layers.splice(1, 0, {
    id: 4,
    type: 'tilelayer',
    name: 'ground',
    width: FIX_COLS,
    height: FIX_ROWS,
    x: 0,
    y: 0,
    opacity: 1,
    visible: true,
    data: new Array<number>(FIX_COLS * FIX_ROWS).fill(1),
  });
  return m;
}
