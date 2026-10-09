import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import { buildManifest, MANIFEST_FILE, MUSIC_DIR, SOUNDS_DIR } from './src/audioManifest';
import type { ManifestResult } from './src/audioManifest';

/** Dateinamen eines Ordners; fehlt er, ist die Liste leer. */
function listFiles(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isFile())
      .map((d) => d.name);
  } catch {
    return [];
  }
}

/** Liest public/sounds und public/music und baut daraus das Audio-Manifest. */
export function scanAudio(publicDir: string): ManifestResult {
  return buildManifest(listFiles(join(publicDir, SOUNDS_DIR)), listFiles(join(publicDir, MUSIC_DIR)));
}

/**
 * Vite-Plugin für eigene Audiodateien: Im Build landet `audio-manifest.json` neben index.html, im Dev-Server
 * wird es bei jeder Anfrage neu aus den Ordnern berechnet (neue Datei ablegen, Seite neu laden, fertig).
 * Unbekannte Dateinamen erzeugen eine Warnung in der Konsole des Build bzw. Dev-Servers.
 */
export function audioManifestPlugin(): Plugin {
  let publicDir = '';
  let lastWarnings = '';
  return {
    name: 'pfandraiders-audio-manifest',
    configResolved(config) {
      publicDir = config.publicDir;
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '').split('?')[0];
        if (!path.endsWith('/' + MANIFEST_FILE)) return next();
        const { manifest, warnings } = scanAudio(publicDir);
        // Warnungen nur bei Änderung ausgeben, nicht bei jedem Neuladen
        const joined = warnings.join('\n');
        if (joined && joined !== lastWarnings) for (const w of warnings) server.config.logger.warn(`[audio] ${w}`);
        lastWarnings = joined;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify(manifest));
      });
    },
    generateBundle() {
      const { manifest, warnings } = scanAudio(publicDir);
      for (const w of warnings) this.warn(`[audio] ${w}`);
      this.emitFile({ type: 'asset', fileName: MANIFEST_FILE, source: JSON.stringify(manifest, null, 2) + '\n' });
    },
  };
}
