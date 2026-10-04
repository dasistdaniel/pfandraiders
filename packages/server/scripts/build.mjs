// Bündelt den Server zu dist/server.cjs und setzt Buildnummer und Kurz-Hash ein.
// Hash: GIT_SHA (erste 7 Zeichen), sonst `git rev-parse --short=7 HEAD`, sonst leer.
// Nummer: BUILD_NUMBER, wenn nur Ziffern, sonst "dev".
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('..', import.meta.url));

function gitSha() {
  const env = (process.env.GIT_SHA ?? '').trim();
  if (env) return env.slice(0, 7);
  try {
    return execSync('git rev-parse --short=7 HEAD', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return ''; // kein git (zum Beispiel im Docker-Build ohne .git)
  }
}

function buildNumber() {
  const env = (process.env.BUILD_NUMBER ?? '').trim();
  return /^\d+$/.test(env) ? env : 'dev';
}

const sha = gitSha();
const number = buildNumber();

await build({
  absWorkingDir: root,
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  external: ['bufferutil', 'utf-8-validate'],
  outfile: 'dist/server.cjs',
  define: {
    __BUILD_NUMBER__: JSON.stringify(number),
    __BUILD_SHA__: JSON.stringify(sha),
  },
  logLevel: 'info',
});

console.log(`server build ${number} · ${sha || '(kein Hash)'}`);
