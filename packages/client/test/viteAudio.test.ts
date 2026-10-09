import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { scanAudio } from '../vite-audio';

const dirs: string[] = [];
function tempPublic(): string {
  const d = mkdtempSync(join(tmpdir(), 'pfand-audio-'));
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('scanAudio', () => {
  it('works without the folders', () => {
    expect(scanAudio(tempPublic())).toEqual({ manifest: { sounds: {}, music: {} }, warnings: [] });
  });

  it('reads both folders and ignores sub folders', () => {
    const pub = tempPublic();
    mkdirSync(join(pub, 'sounds', 'alt'), { recursive: true });
    mkdirSync(join(pub, 'music'));
    for (const f of ['.gitkeep', 'pickup.wav', 'pickup.ogg', 'quatsch.mp3']) writeFileSync(join(pub, 'sounds', f), '');
    writeFileSync(join(pub, 'music', 'music_game.mp3'), '');
    const r = scanAudio(pub);
    expect(r.manifest).toEqual({ sounds: { pickup: 'sounds/pickup.ogg' }, music: { music_game: 'music/music_game.mp3' } });
    expect(r.warnings).toHaveLength(2);
  });
});
