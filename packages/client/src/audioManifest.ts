import { AUDIO_EXTENSIONS, MUSIC_FILE_IDS, SOUND_FILE_IDS } from './audioIds';

/**
 * Manifest der eigenen Audiodateien: ID → Pfad relativ zur Seite (z. B. "sounds/pickup.ogg").
 * Erzeugt vom Vite-Plugin (vite.config.ts) aus den Ordnern public/sounds und public/music, damit der Client
 * zur Laufzeit nichts ausprobieren muss (keine 404-Anfragen). Rein und ohne Node-Abhängigkeiten.
 */
export interface AudioManifest {
  sounds: Record<string, string>;
  music: Record<string, string>;
}

export interface ManifestResult {
  manifest: AudioManifest;
  /** Hinweise für die Konsole (unbekannte Namen, doppelte Dateien) */
  warnings: string[];
}

export const MANIFEST_FILE = 'audio-manifest.json';
export const SOUNDS_DIR = 'sounds';
export const MUSIC_DIR = 'music';

/** Dateien, die in den Ordnern liegen dürfen, ohne dass gewarnt wird (.gitkeep, Lizenztexte, Notizen). */
function ignored(name: string): boolean {
  return name.startsWith('.') || /\.(txt|md)$/i.test(name);
}

function split(name: string): { base: string; ext: string } {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return { base: name, ext: '' };
  return { base: name.slice(0, dot), ext: name.slice(dot + 1).toLowerCase() };
}

/**
 * Wählt je bekannter ID eine Datei aus einem Ordner. Priorität .ogg vor .mp3 vor .wav (Endung ohne Rücksicht auf
 * Groß-/Kleinschreibung, die ID selbst muss exakt stimmen). Alles andere ergibt eine Warnung.
 */
export function pickFiles(
  fileNames: readonly string[],
  knownIds: readonly string[],
  dir: string,
): { files: Record<string, string>; warnings: string[] } {
  const known = new Set(knownIds);
  const lower = new Map(knownIds.map((id) => [id.toLowerCase(), id]));
  const candidates = new Map<string, { name: string; rank: number }[]>();
  const warnings: string[] = [];
  for (const name of [...fileNames].sort()) {
    if (ignored(name)) continue;
    const { base, ext } = split(name);
    const rank = (AUDIO_EXTENSIONS as readonly string[]).indexOf(ext);
    if (rank < 0) {
      warnings.push(`${dir}/${name}: Format nicht unterstützt (erlaubt: ${AUDIO_EXTENSIONS.map((e) => '.' + e).join(', ')})`);
      continue;
    }
    if (!known.has(base)) {
      const hint = lower.get(base.toLowerCase());
      warnings.push(
        hint
          ? `${dir}/${name}: unbekannte ID "${base}", gemeint ist wohl "${hint}" (Groß-/Kleinschreibung)`
          : `${dir}/${name}: unbekannte ID "${base}", wird ignoriert (Liste: docs/SOUNDLISTE.md)`,
      );
      continue;
    }
    const list = candidates.get(base) ?? [];
    list.push({ name, rank });
    candidates.set(base, list);
  }
  const files: Record<string, string> = {};
  for (const id of knownIds) {
    const list = candidates.get(id);
    if (!list) continue;
    list.sort((a, b) => a.rank - b.rank);
    files[id] = `${dir}/${list[0].name}`;
    for (const other of list.slice(1)) warnings.push(`${dir}/${other.name}: ignoriert, ${list[0].name} hat Vorrang`);
  }
  return { files, warnings };
}

/** Manifest aus den Dateinamen beider Ordner. */
export function buildManifest(soundFiles: readonly string[], musicFiles: readonly string[]): ManifestResult {
  const sounds = pickFiles(soundFiles, SOUND_FILE_IDS, SOUNDS_DIR);
  const music = pickFiles(musicFiles, MUSIC_FILE_IDS, MUSIC_DIR);
  return { manifest: { sounds: sounds.files, music: music.files }, warnings: [...sounds.warnings, ...music.warnings] };
}

const PATH_RE = /^(sounds|music)\/[A-Za-z0-9_]+\.(ogg|mp3|wav)$/i;

function section(raw: unknown, ids: readonly string[], dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof raw !== 'object' || raw === null) return out;
  for (const id of ids) {
    const v = (raw as Record<string, unknown>)[id];
    if (typeof v === 'string' && PATH_RE.test(v) && v.startsWith(dir + '/')) out[id] = v;
  }
  return out;
}

/** Prüft ein geladenes Manifest; Unbekanntes und Kaputtes fällt still weg. Wirft nie. */
export function parseManifest(raw: unknown): AudioManifest {
  if (typeof raw !== 'object' || raw === null) return { sounds: {}, music: {} };
  const r = raw as Record<string, unknown>;
  return { sounds: section(r.sounds, SOUND_FILE_IDS, SOUNDS_DIR), music: section(r.music, MUSIC_FILE_IDS, MUSIC_DIR) };
}
