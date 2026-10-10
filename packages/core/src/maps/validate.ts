import { CONFIG, TILE } from '../config';
import { boxBlocked, reachableTiles, tileIndexAt } from '../map';
import { parseTiledMap, parseTiledVisuals, SHEET_CELLS } from '../tiled';
import type { MapVisuals } from '../tiled';
import type { MapData, Point } from '../types';
import { cleanMapName, isTilesetId, MAX_MAP_NAME_LENGTH } from './mapIds';
import type { TilesetId } from './mapIds';

/** Mindest- und Höchstzahlen der Objekte einer Karte. */
export interface MapRules {
  minSpawns: number;
  maxSpawns: number;
  minDropoffs: number;
  minSpots: number;
  minNpcSpawns: number;
}

/** Regeln für eigene Karten (Spec §2). maxSpawns = MAX_ROOM_PLAYERS; Import aus protocol.ts ginge im Kreis, ein Test sichert es. */
export const CUSTOM_MAP_RULES: MapRules = { minSpawns: 8, maxSpawns: 8, minDropoffs: 1, minSpots: 20, minNpcSpawns: 2 };
/** Regeln für die eingebauten Karten: retro (4 Startpunkte, 17 Spots) ist älter als die Regeln und bleibt unverändert. */
export const BUILTIN_MAP_RULES: MapRules = { minSpawns: 4, maxSpawns: 8, minDropoffs: 1, minSpots: 16, minNpcSpawns: 2 };

export const MAP_MIN_COLS = 32;
export const MAP_MIN_ROWS = 20;
export const MAP_MAX_COLS = 128;
export const MAP_MAX_ROWS = 80;
/** Erlaubte Ebenen; Pflicht sind walls, objects und zones. */
export const MAP_LAYER_NAMES = ['walls', 'soft', 'ground', 'below', 'above', 'objects', 'zones'] as const;
const VISUAL_LAYERS: readonly string[] = ['ground', 'below', 'above'];
/** Ab hier sind in einer gid Tiled-Bits für Spiegeln/Drehen gesetzt (0x10000000 bis 0x80000000). JSON speichert sie vorzeichenlos. */
const FLIP_BITS_FROM = 0x10000000;

export interface ValidateOptions {
  /** Standard CUSTOM_MAP_RULES */
  rules?: MapRules;
  /** Fester Kachelsatz (eingebaute Karten ohne Eigenschaften); sonst Eigenschaft `tileset`, sonst city */
  tileset?: TilesetId;
}

export interface ValidatedMap {
  /** Deutsche Problemsätze; leer = gültig */
  problems: string[];
  /** Eigenschaft `name` (bereinigt) oder null */
  name: string | null;
  tileset: TilesetId;
  /** Gelesene Karte; null, wenn die Grundform kaputt ist */
  map: MapData | null;
  visuals: MapVisuals | null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const at = (p: Point): string => `(${p.x}, ${p.y})`;
const cell = (i: number, cols: number): string => `Spalte ${i % cols}, Zeile ${Math.floor(i / cols)}`;

function readProperties(raw: unknown, problems: string[]): Map<string, unknown> {
  const out = new Map<string, unknown>();
  if (raw === undefined) return out;
  if (!Array.isArray(raw)) {
    problems.push('Die Karteneigenschaften ("properties") müssen eine Liste sein.');
    return out;
  }
  for (const p of raw) if (isRecord(p) && typeof p.name === 'string') out.set(p.name, p.value);
  return out;
}

function checkTilesets(raw: unknown, problems: string[]): void {
  if (raw === undefined) return;
  if (!Array.isArray(raw)) {
    problems.push('"tilesets" muss eine Liste sein.');
    return;
  }
  if (raw.length > 1) problems.push(`Die Karte nutzt ${raw.length} Kachelsätze; erlaubt ist nur kenney-city.`);
  if (raw.length >= 1 && (!isRecord(raw[0]) || raw[0].firstgid !== 1)) {
    problems.push('Der Kachelsatz kenney-city muss firstgid 1 haben.');
  }
}

/** Meldet die erste ungültige Kachel einer Grafikebene (eine Meldung je Ebene reicht). */
function checkGids(name: string, data: unknown[], cols: number, problems: string[]): void {
  for (let i = 0; i < data.length; i++) {
    const g = data[i];
    if (!isInt(g) || g < 0) {
      problems.push(`Ebene "${name}", ${cell(i, cols)}: ungültige Kachel ${JSON.stringify(g)}.`);
      return;
    }
    if (g >= FLIP_BITS_FROM) {
      problems.push(
        `Ebene "${name}", ${cell(i, cols)}: Kachel ist gespiegelt oder gedreht. Das geht nicht; bitte die Kachel ungedreht setzen (in Tiled ohne X, Y oder Z).`,
      );
      return;
    }
    if (g > SHEET_CELLS) {
      problems.push(
        `Ebene "${name}", ${cell(i, cols)}: Kachel ${g} liegt außerhalb des Kenney-Bogens (1 bis ${SHEET_CELLS}); nur kenney-city mit firstgid 1 ist erlaubt.`,
      );
      return;
    }
  }
}

function checkLayers(json: Record<string, unknown>, tileset: TilesetId, sizeOk: boolean, problems: string[]): void {
  const layers = json.layers;
  if (!Array.isArray(layers)) {
    problems.push('Die Karte hat keine Ebenen ("layers").');
    return;
  }
  const cols = json.width as number;
  const count = sizeOk ? cols * (json.height as number) : -1;
  const seen = new Set<string>();
  for (const l of layers) {
    if (!isRecord(l) || typeof l.name !== 'string') {
      problems.push('Eine Ebene hat keinen Namen.');
      continue;
    }
    const name = l.name;
    if (!(MAP_LAYER_NAMES as readonly string[]).includes(name)) {
      problems.push(`Unbekannte Ebene "${name}" (erlaubt: ${MAP_LAYER_NAMES.join(', ')}; keine Gruppen).`);
      continue;
    }
    if (seen.has(name)) {
      problems.push(`Ebene "${name}" gibt es doppelt.`);
      continue;
    }
    seen.add(name);
    const objectLayer = name === 'objects' || name === 'zones';
    if (l.type !== (objectLayer ? 'objectgroup' : 'tilelayer')) {
      problems.push(`Ebene "${name}" muss eine ${objectLayer ? 'Objektebene' : 'Kachelebene'} sein.`);
      continue;
    }
    if (objectLayer) {
      if (!Array.isArray(l.objects)) problems.push(`Ebene "${name}" hat keine Objektliste.`);
      continue;
    }
    if (Array.isArray(l.chunks)) {
      problems.push(`Ebene "${name}" ist in Stücke geteilt (unendliche Karte); "Unendlich" ausschalten.`);
      continue;
    }
    if (!Array.isArray(l.data)) {
      problems.push(
        `Ebene "${name}": Kachelebenen-Format muss CSV sein (Karteneigenschaften > Kachelebenen-Format), nicht ${String(l.encoding ?? 'unbekannt')}.`,
      );
      continue;
    }
    if (count >= 0 && l.data.length !== count) {
      problems.push(`Ebene "${name}" hat ${l.data.length} Kacheln, erwartet ${count} (Breite x Höhe).`);
      continue;
    }
    if (sizeOk && VISUAL_LAYERS.includes(name)) checkGids(name, l.data, cols, problems);
  }
  for (const need of ['walls', 'objects', 'zones']) {
    if (!seen.has(need)) problems.push(`Pflichtebene "${need}" fehlt.`);
  }
  if (tileset === 'city' && !seen.has('ground')) {
    problems.push('Kachelsatz "city" braucht die Grafikebene "ground" (oder Eigenschaft tileset = "retro").');
  }
}

/** Objekte müssen Punkt-Objekte sein (keine Rechtecke, keine Kachelobjekte mit gid). */
function checkObjectShapes(json: Record<string, unknown>, problems: string[]): void {
  const layers = Array.isArray(json.layers) ? json.layers : [];
  const objects = layers.find((l) => isRecord(l) && l.name === 'objects');
  if (!isRecord(objects) || !Array.isArray(objects.objects)) return;
  for (const o of objects.objects) {
    if (!isRecord(o)) continue;
    const kind = typeof o.type === 'string' && o.type !== '' ? o.type : o.class;
    const label = `Objekt ${String(o.id)} (${typeof kind === 'string' && kind !== '' ? kind : 'ohne Typ'})`;
    if (o.gid !== undefined) problems.push(`${label} ist ein Kachelobjekt; bitte ein Punkt-Objekt nehmen.`);
    else if (o.point !== true) problems.push(`${label} ist kein Punkt-Objekt; bitte das Werkzeug "Punkt einfügen" nehmen.`);
  }
}

function checkCounts(map: MapData, rules: MapRules, problems: string[]): void {
  const n = map.spawns.length;
  if (n < rules.minSpawns || n > rules.maxSpawns) {
    problems.push(
      rules.minSpawns === rules.maxSpawns
        ? `Startpunkte (spawn): ${n}, nötig sind genau ${rules.minSpawns}.`
        : `Startpunkte (spawn): ${n}, erlaubt sind ${rules.minSpawns} bis ${rules.maxSpawns}.`,
    );
  }
  if (map.dropoffs.length < rules.minDropoffs) {
    problems.push(`Pfandautomaten (dropoff): ${map.dropoffs.length}, nötig ist mindestens ${rules.minDropoffs}.`);
  }
  if (map.spots.length < rules.minSpots) {
    problems.push(`Spots (spot): ${map.spots.length}, nötig sind mindestens ${rules.minSpots}.`);
  }
  if (map.npcSpawns.length < rules.minNpcSpawns) {
    problems.push(`NPC-Eingänge (npc_spawn): ${map.npcSpawns.length}, nötig sind mindestens ${rules.minNpcSpawns}.`);
  }
}

interface Target {
  label: string;
  p: Point;
}

/** Alle Punkte, die erreichbar sein müssen, in fester Reihenfolge (für stabile Meldungen). */
function targetsOf(map: MapData): Target[] {
  return [
    ...map.spawns.map((p) => ({ label: 'Startpunkt', p })),
    ...map.npcSpawns.map((p) => ({ label: 'NPC-Eingang', p })),
    ...map.dropoffs.map((p) => ({ label: 'Pfandautomat', p })),
    ...map.spots.map((p) => ({ label: `Spot ${p.type}`, p })),
  ];
}

function checkPlacement(map: MapData, problems: string[]): void {
  for (const t of targetsOf(map)) {
    const i = tileIndexAt(map, t.p.x, t.p.y);
    if (map.solid[i]) problems.push(`${t.label} bei ${at(t.p)} steht auf einer Wand.`);
    else if (map.soft?.[i]) problems.push(`${t.label} bei ${at(t.p)} steht auf einem weichen Hindernis (Ebene soft).`);
    else if ((t.label === 'Startpunkt' || t.label === 'NPC-Eingang') && boxBlocked(map, t.p.x, t.p.y, CONFIG.playerHalf)) {
      problems.push(`${t.label} bei ${at(t.p)} liegt zu nah an einer Wand; am besten in die Kachelmitte setzen.`);
    }
  }
}

function checkReachable(map: MapData, problems: string[]): void {
  const targets = targetsOf(map);
  const missing = new Set<Target>();
  for (const s of map.spawns) {
    const reach = reachableTiles(map, s.x, s.y);
    for (const t of targets) if (!reach.has(tileIndexAt(map, t.p.x, t.p.y))) missing.add(t);
  }
  if (missing.size === 0) return;
  const list = [...missing].slice(0, 5).map((t) => `${t.label} ${at(t.p)}`).join(', ');
  const more = missing.size > 5 ? ` und ${missing.size - 5} weitere` : '';
  problems.push(`Nicht von jedem Startpunkt aus erreichbar: ${list}${more}.`);
}

/** Wie visualsMatchMap im Client: jede Wand braucht Grafik in ground oder below. */
function checkCityVisuals(map: MapData, visuals: MapVisuals | null, problems: string[]): void {
  if (!visuals) return; // fehlende Ebene "ground" meldet checkLayers
  for (let i = 0; i < map.solid.length; i++) {
    if (map.solid[i] && !visuals.ground[i] && !visuals.below[i]) {
      problems.push(
        `Wand ohne Grafik bei ${cell(i, map.cols)}: jede Wandkachel braucht eine Kachel in "ground" oder "below" (sonst zeichnet das Spiel die Karte einfarbig).`,
      );
      return;
    }
  }
}

/**
 * Prüft eine Tiled-Karte (JSON) gegen die Regeln der Spec §2 und liest sie. Sammelt alle Probleme als
 * deutsche Sätze. Ist die Grundform kaputt (Größe, Ebenen, Kachelsatz, Objektform), endet die Prüfung danach.
 */
export function validateTiledMap(json: unknown, opts: ValidateOptions = {}): ValidatedMap {
  const rules = opts.rules ?? CUSTOM_MAP_RULES;
  const problems: string[] = [];
  let name: string | null = null;
  let tileset: TilesetId = opts.tileset ?? 'city';
  const result = (map: MapData | null, visuals: MapVisuals | null): ValidatedMap => ({ problems, name, tileset, map, visuals });
  if (!isRecord(json)) {
    problems.push('Die Datei ist keine Tiled-Karte im JSON-Format.');
    return result(null, null);
  }

  const props = readProperties(json.properties, problems);
  if (props.has('name')) {
    name = cleanMapName(props.get('name'));
    if (name === null) problems.push(`Eigenschaft "name" muss Text mit 1 bis ${MAX_MAP_NAME_LENGTH} Zeichen sein.`);
  }
  if (props.has('tileset')) {
    const t = props.get('tileset');
    if (!isTilesetId(t)) problems.push(`Eigenschaft "tileset" muss "city" oder "retro" sein, nicht ${JSON.stringify(t)}.`);
    else if (!opts.tileset) tileset = t;
  }

  if (json.infinite === true) problems.push('Unendliche Karten gehen nicht; in den Karteneigenschaften "Unendlich" ausschalten.');
  if (json.orientation !== 'orthogonal') problems.push('Die Ausrichtung muss "Orthogonal" sein.');
  if (json.tilewidth !== TILE || json.tileheight !== TILE) problems.push(`Kachelgröße muss ${TILE} x ${TILE} Pixel sein.`);
  const { width, height } = json;
  const sizeOk =
    isInt(width) && isInt(height) && width >= MAP_MIN_COLS && height >= MAP_MIN_ROWS && width <= MAP_MAX_COLS && height <= MAP_MAX_ROWS;
  if (!sizeOk) {
    problems.push(
      `Größe ${String(width)} x ${String(height)} Kacheln; erlaubt sind ${MAP_MIN_COLS} x ${MAP_MIN_ROWS} bis ${MAP_MAX_COLS} x ${MAP_MAX_ROWS}.`,
    );
  }
  checkTilesets(json.tilesets, problems);
  checkLayers(json, tileset, sizeOk, problems);
  checkObjectShapes(json, problems);
  if (problems.length > 0) return result(null, null);

  let map: MapData;
  let visuals: MapVisuals | null;
  try {
    map = parseTiledMap(json);
    visuals = parseTiledVisuals(json);
  } catch (e) {
    problems.push(`Tiled-Datei nicht lesbar: ${e instanceof Error ? e.message : String(e)}.`);
    return result(null, null);
  }
  checkCounts(map, rules, problems);
  checkPlacement(map, problems);
  checkReachable(map, problems);
  if (tileset === 'city') checkCityVisuals(map, visuals, problems);
  return result(map, visuals);
}
