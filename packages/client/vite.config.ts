import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import { audioManifestPlugin } from './vite-audio';

/** Buildnummer: Lauf in GitHub Actions (GITHUB_RUN_NUMBER), lokal "dev". Kurz-Hash aus GITHUB_SHA oder git. */
function buildInfo(): { number: string; sha: string } {
  const run = process.env.GITHUB_RUN_NUMBER;
  let sha = (process.env.GITHUB_SHA ?? '').slice(0, 7);
  if (!sha) {
    try {
      sha = execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch {
      sha = '';
    }
  }
  return { number: run && /^\d+$/.test(run) ? run : 'dev', sha };
}

const build = buildInfo();

export default defineConfig({
  // relative Pfade, damit der Build später unter einem GitHub-Pages-Unterpfad läuft
  base: './',
  // eigene Audiodateien: audio-manifest.json aus public/sounds und public/music
  plugins: [audioManifestPlugin()],
  define: {
    __BUILD_NUMBER__: JSON.stringify(build.number),
    __BUILD_SHA__: JSON.stringify(build.sha),
  },
});
