import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { customIndexSource, customMapIds, importName } from '../scripts/customIndex';

const CUSTOM_DIR = fileURLToPath(new URL('../src/maps/custom/', import.meta.url));
const HEADER = '// Erzeugt von `npm run maps` (packages/core/scripts/generateCustomMaps.ts). Nicht von Hand ändern.';

describe('customMapIds', () => {
  it('takes ids from *.tiled.json files, sorted, and skips index.ts', () => {
    expect(customMapIds(['zeta.tiled.json', 'index.ts', 'alpha-2.tiled.json'])).toEqual({ ids: ['alpha-2', 'zeta'], problems: [] });
  });

  it('reports files that do not belong into the folder', () => {
    const r = customMapIds(['notizen.txt', 'Gross.tiled.json', 'city.tiled.json', 'karte.json', 'ok.tiled.json']);
    expect(r.ids).toEqual(['ok']);
    expect(r.problems).toEqual([
      'Datei Gross.tiled.json: Kennung "Gross" ist ungültig: erlaubt sind a-z, 0-9 und "-", 1 bis 24 Zeichen (Dateiname ohne .tiled.json).',
      'Datei city.tiled.json: Kennung "city" gehört einer eingebauten Karte; bitte die Datei umbenennen.',
      'Datei karte.json gehört nicht in den Kartenordner (nur <kennung>.tiled.json).',
      'Datei notizen.txt gehört nicht in den Kartenordner (nur <kennung>.tiled.json).',
    ]);
  });
});

describe('customIndexSource', () => {
  it('writes an empty, typed list without imports', () => {
    expect(customIndexSource([])).toBe(
      [HEADER, "import type { CustomMapSource } from '../mapDef';", '', 'export const CUSTOM_MAP_SOURCES: readonly CustomMapSource[] = [];', ''].join('\n'),
    );
  });

  it('imports every map, sorted, with valid identifiers', () => {
    expect(customIndexSource(['zeta', '2-park', 'alpha'])).toBe(
      [
        HEADER,
        "import type { CustomMapSource } from '../mapDef';",
        "import map_2_park from './2-park.tiled.json';",
        "import map_alpha from './alpha.tiled.json';",
        "import map_zeta from './zeta.tiled.json';",
        '',
        'export const CUSTOM_MAP_SOURCES: readonly CustomMapSource[] = [',
        "  { id: '2-park', file: '2-park.tiled.json', json: map_2_park },",
        "  { id: 'alpha', file: 'alpha.tiled.json', json: map_alpha },",
        "  { id: 'zeta', file: 'zeta.tiled.json', json: map_zeta },",
        '];',
        '',
      ].join('\n'),
    );
  });

  it('importName replaces dashes', () => {
    expect(importName('2-park-a')).toBe('map_2_park_a');
  });
});

describe('committed custom/index.ts', () => {
  it('matches the generator output for the folder (run npm run maps after adding a map)', () => {
    const { ids, problems } = customMapIds(readdirSync(CUSTOM_DIR));
    expect(problems).toEqual([]);
    // Git checkt unter Windows mit CRLF aus (core.autocrlf): vergleichen ohne Zeilenende-Unterschied
    const committed = readFileSync(join(CUSTOM_DIR, 'index.ts'), 'utf8').replace(/\r\n/g, '\n');
    expect(committed).toBe(customIndexSource(ids));
  });
});
