// Erzeugt die Logo-Dateien aus packages/client/src/logo.ts. Aufruf: npm run logo
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logoFiles } from '../packages/client/src/logo.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const [rel, content] of Object.entries(logoFiles())) {
  const file = join(root, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content, 'utf8');
  console.log(`${rel} (${Buffer.byteLength(content)} Bytes)`);
}
