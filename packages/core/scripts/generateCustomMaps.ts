import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mapProblemsText } from '../src/maps/customMaps';
import { CUSTOM_MAP_RULES, validateTiledMap } from '../src/maps/validate';
import { CUSTOM_INDEX_FILE, CUSTOM_MAP_SUFFIX, customIndexSource, customMapIds } from './customIndex';

/**
 * Prüft alle eigenen Karten in `src/maps/custom/` und schreibt `custom/index.ts` neu.
 * Aufruf im Wurzelordner: `npm run maps`. Bei einem Problem wird nichts geschrieben (Exit-Code 1).
 */
const dir = fileURLToPath(new URL('../src/maps/custom/', import.meta.url));
const { ids, problems } = customMapIds(readdirSync(dir));
const errors = [...problems];

for (const id of ids) {
  const file = `${id}${CUSTOM_MAP_SUFFIX}`;
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(join(dir, file), 'utf8').replace(/^﻿/, ''));
  } catch (e) {
    errors.push(mapProblemsText(file, [`kein gültiges JSON (${e instanceof Error ? e.message : String(e)})`]));
    continue;
  }
  const v = validateTiledMap(json, { rules: CUSTOM_MAP_RULES });
  if (v.problems.length > 0 || !v.map) {
    errors.push(mapProblemsText(file, v.problems));
    continue;
  }
  console.log(`ok  ${file}: "${v.name ?? id}", ${v.map.cols} x ${v.map.rows} Kacheln, Kachelsatz ${v.tileset}`);
}

if (errors.length > 0) {
  for (const e of errors) console.error(e);
  console.error(`${CUSTOM_INDEX_FILE} wurde nicht geändert.`);
  process.exit(1);
}

const out = join(dir, CUSTOM_INDEX_FILE);
const next = customIndexSource(ids);
let prev = '';
try {
  prev = readFileSync(out, 'utf8').replace(/\r\n/g, '\n');
} catch {
  // Datei fehlt noch: wird gleich geschrieben
}
if (prev === next) {
  console.log(`unverändert: ${out} (${ids.length} eigene Karten)`);
} else {
  writeFileSync(out, next);
  console.log(`geschrieben: ${out} (${ids.length} eigene Karten)`);
}
