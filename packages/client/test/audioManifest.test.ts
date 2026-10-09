import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EVENT_IDS, MUSIC_IDS, PLING_VARIANT_IDS, SYNTH_IDS } from '../src/audioIds';
import { buildManifest, parseManifest, pickFiles } from '../src/audioManifest';

describe('buildManifest', () => {
  it('is empty for empty folders (only .gitkeep)', () => {
    const r = buildManifest(['.gitkeep'], ['.gitkeep']);
    expect(r.manifest).toEqual({ sounds: {}, music: {} });
    expect(r.warnings).toEqual([]);
  });

  it('maps known ids to their file and keeps sounds and music apart', () => {
    const r = buildManifest(['pickup.ogg', 'revive.wav', 'pling_3.mp3'], ['music_menu.ogg']);
    expect(r.manifest.sounds).toEqual({ pickup: 'sounds/pickup.ogg', revive: 'sounds/revive.wav', pling_3: 'sounds/pling_3.mp3' });
    expect(r.manifest.music).toEqual({ music_menu: 'music/music_menu.ogg' });
    expect(r.warnings).toEqual([]);
  });

  it('prefers ogg over mp3 over wav and warns about the ignored ones', () => {
    const r = buildManifest(['hit.wav', 'hit.mp3', 'tick.wav', 'tick.ogg', 'tick.mp3'], []);
    expect(r.manifest.sounds).toEqual({ hit: 'sounds/hit.mp3', tick: 'sounds/tick.ogg' });
    expect(r.warnings).toHaveLength(3);
    expect(r.warnings.join('\n')).toContain('hit.wav');
  });

  it('accepts upper-case extensions but needs the exact id', () => {
    const r = buildManifest(['Knockout.ogg', 'knockout.OGG', 'stealsuccess.ogg'], []);
    expect(r.manifest.sounds).toEqual({ knockout: 'sounds/knockout.OGG' });
    expect(r.warnings.some((w) => w.includes('"stealSuccess"'))).toBe(true);
    expect(r.warnings.some((w) => w.includes('Knockout.ogg'))).toBe(true);
  });

  it('warns about unknown names and formats, ignores text files', () => {
    const r = buildManifest(['boom.ogg', 'knockout.flac', 'CREDITS.txt', 'notes.md'], ['music_menu.ogg', 'pickup.ogg']);
    expect(r.manifest).toEqual({ sounds: {}, music: { music_menu: 'music/music_menu.ogg' } });
    expect(r.warnings).toHaveLength(3); // boom, flac, pickup im Musikordner
  });

  it('pickFiles only knows the ids it is given', () => {
    expect(pickFiles(['a.ogg', 'b.ogg'], ['a'], 'x').files).toEqual({ a: 'x/a.ogg' });
  });
});

describe('parseManifest', () => {
  it('keeps valid entries and drops everything else without throwing', () => {
    expect(parseManifest(null)).toEqual({ sounds: {}, music: {} });
    expect(parseManifest('nope')).toEqual({ sounds: {}, music: {} });
    expect(
      parseManifest({
        sounds: { pickup: 'sounds/pickup.ogg', bogus: 'sounds/bogus.ogg', hit: '../hit.ogg', tick: 5, buy: 'music/buy.ogg' },
        music: { music_game: 'music/music_game.mp3', music_menu: 'http://evil/x.ogg' },
      }),
    ).toEqual({ sounds: { pickup: 'sounds/pickup.ogg' }, music: { music_game: 'music/music_game.mp3' } });
  });
});

describe('audio ids', () => {
  it('match the backticked ids in docs/SOUNDLISTE.md', () => {
    const doc = readFileSync(new URL('../../../docs/SOUNDLISTE.md', import.meta.url), 'utf8');
    // Nur Tabellenzeilen: erste Spalte ist `id`
    const ids = [...doc.matchAll(/^\| `([A-Za-z_0-9]+)` \|/gm)].map((m) => m[1]);
    const expected = [...SYNTH_IDS, ...MUSIC_IDS, ...EVENT_IDS];
    expect(new Set(ids)).toEqual(new Set(expected));
    expect(ids).toHaveLength(expected.length);
  });

  it('has eight pling variants and no duplicate ids', () => {
    expect(PLING_VARIANT_IDS).toEqual(['pling_1', 'pling_2', 'pling_3', 'pling_4', 'pling_5', 'pling_6', 'pling_7', 'pling_8']);
    const all = [...SYNTH_IDS, ...EVENT_IDS, ...MUSIC_IDS, ...PLING_VARIANT_IDS];
    expect(new Set(all).size).toBe(all.length);
  });
});
