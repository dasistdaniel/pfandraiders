import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { templateFiles } from './templateMap';

/** Schreibt Kartenvorlage und Beispielkarte aus TEMPLATE_PLAN. Aufruf im Wurzelordner: `npm run maps:vorlage`, danach `npm run maps`. */
const root = fileURLToPath(new URL('../../../', import.meta.url));
for (const f of templateFiles()) {
  const out = join(root, f.path);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, f.content);
  console.log(`geschrieben: ${f.path}`);
}
