import { customMapIdProblem } from '../src/maps/customMaps';

/** Endung eigener Karten im Ordner `src/maps/custom/`. */
export const CUSTOM_MAP_SUFFIX = '.tiled.json';
/** Die erzeugte Importliste im selben Ordner. */
export const CUSTOM_INDEX_FILE = 'index.ts';
const HEADER = '// Erzeugt von `npm run maps` (packages/core/scripts/generateCustomMaps.ts). Nicht von Hand ändern.';

/** Kennungen aus den Dateinamen des Kartenordners (sortiert) und Probleme mit Dateien, die nicht passen. */
export function customMapIds(files: readonly string[]): { ids: string[]; problems: string[] } {
  const ids: string[] = [];
  const problems: string[] = [];
  for (const file of [...files].sort()) {
    if (file === CUSTOM_INDEX_FILE) continue;
    if (!file.endsWith(CUSTOM_MAP_SUFFIX)) {
      problems.push(`Datei ${file} gehört nicht in den Kartenordner (nur <kennung>${CUSTOM_MAP_SUFFIX}).`);
      continue;
    }
    const id = file.slice(0, -CUSTOM_MAP_SUFFIX.length);
    const problem = customMapIdProblem(id, new Set(ids));
    if (problem) {
      problems.push(`Datei ${file}: ${problem}`);
      continue;
    }
    ids.push(id);
  }
  return { ids, problems };
}

/** Bezeichner für den Import einer Karte (Kennungen enthalten nur a-z, 0-9 und '-'). */
export function importName(id: string): string {
  return `map_${id.replace(/-/g, '_')}`;
}

/** Inhalt von `custom/index.ts`: deterministisch, nach Kennung sortiert, LF-Zeilenenden. */
export function customIndexSource(ids: readonly string[]): string {
  const sorted = [...ids].sort();
  const lines = [HEADER, "import type { CustomMapSource } from '../mapDef';"];
  for (const id of sorted) lines.push(`import ${importName(id)} from './${id}${CUSTOM_MAP_SUFFIX}';`);
  lines.push('');
  if (sorted.length === 0) {
    lines.push('export const CUSTOM_MAP_SOURCES: readonly CustomMapSource[] = [];');
  } else {
    lines.push('export const CUSTOM_MAP_SOURCES: readonly CustomMapSource[] = [');
    for (const id of sorted) lines.push(`  { id: '${id}', file: '${id}${CUSTOM_MAP_SUFFIX}', json: ${importName(id)} },`);
    lines.push('];');
  }
  return lines.join('\n') + '\n';
}
