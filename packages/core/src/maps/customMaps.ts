import { BUILTIN_MAP_IDS, isMapIdSyntax, MAX_MAP_ID_LENGTH } from './mapIds';
import type { CustomMapSource, MapDef } from './mapDef';
import { CUSTOM_MAP_RULES, validateTiledMap } from './validate';

/** Fehlertext für eine ungültige eigene Karte: Dateiname, dann jedes Problem auf einer eigenen Zeile. */
export function mapProblemsText(file: string, problems: readonly string[]): string {
  return [`Eigene Karte ${file} ist ungültig:`, ...problems.map((p) => `  - ${p}`)].join('\n');
}

/** Problem mit der Kennung einer eigenen Karte oder null. `taken` = schon vergebene Kennungen (inklusive eingebauter). */
export function customMapIdProblem(id: string, taken: ReadonlySet<string>): string | null {
  if (!isMapIdSyntax(id)) {
    return `Kennung "${id}" ist ungültig: erlaubt sind a-z, 0-9 und "-", 1 bis ${MAX_MAP_ID_LENGTH} Zeichen (Dateiname ohne .tiled.json).`;
  }
  if ((BUILTIN_MAP_IDS as readonly string[]).includes(id)) {
    return `Kennung "${id}" gehört einer eingebauten Karte; bitte die Datei umbenennen.`;
  }
  if (taken.has(id)) return `Kennung "${id}" gibt es doppelt.`;
  return null;
}

/** Prüft eine eigene Karte und macht daraus einen Eintrag der Kartenliste. Wirft mit Dateiname und allen Problemen. */
export function customMapDef(src: CustomMapSource, taken: ReadonlySet<string>): MapDef {
  const problems: string[] = [];
  const idProblem = customMapIdProblem(src.id, taken);
  if (idProblem) problems.push(idProblem);
  const v = validateTiledMap(src.json, { rules: CUSTOM_MAP_RULES });
  problems.push(...v.problems);
  if (problems.length > 0 || !v.map) throw new Error(mapProblemsText(src.file, problems));
  return {
    id: src.id,
    name: v.name ?? src.id,
    tileset: v.tileset,
    map: v.map,
    // retro zeichnet aus den Kacheltypen; Grafikebenen einer retro-Karte bleiben ungenutzt
    visuals: v.tileset === 'city' ? v.visuals : null,
    builtin: false,
  };
}

/** Alle eigenen Karten in der gegebenen Reihenfolge; `reserved` = Kennungen der eingebauten Karten. */
export function customMapDefs(sources: readonly CustomMapSource[], reserved: readonly string[] = BUILTIN_MAP_IDS): MapDef[] {
  const taken = new Set<string>(reserved);
  return sources.map((src) => {
    const def = customMapDef(src, taken);
    taken.add(def.id);
    return def;
  });
}
