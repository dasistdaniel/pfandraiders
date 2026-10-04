import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CREDITS, KNOWN_LICENSES, creditDetail, creditLine } from '../src/credits';

const asset = (p: string): string => readFileSync(fileURLToPath(new URL(`../src/assets/${p}`, import.meta.url)), 'utf8');
const byTitle = (t: string) => CREDITS.find((c) => c.title === t)!;

describe('CREDITS', () => {
  it('lists the used assets, the framework and the project', () => {
    expect(CREDITS.map((c) => c.title)).toEqual([
      'Roguelike Modern City',
      'Tiny Characters Set',
      'RPG character sprites',
      'Dog Spritesheets',
      'Officer Character',
      'Phaser 3',
      'PfandRaiders',
    ]);
  });

  it('every url is https', () => {
    for (const c of CREDITS) expect(c.url).toMatch(/^https:\/\/\S+$/);
  });

  it('titles are unique', () => {
    expect(new Set(CREDITS.map((c) => c.title)).size).toBe(CREDITS.length);
  });

  it('every entry has a non-empty author and a known licence', () => {
    for (const c of CREDITS) {
      expect(c.author.trim()).not.toBe('');
      expect(c.license.trim()).not.toBe('');
      expect(KNOWN_LICENSES as readonly string[]).toContain(c.license);
    }
  });

  it('matches the credits file of the character sheets', () => {
    const text = asset('characters/CREDITS.txt');
    for (const t of ['Tiny Characters Set', 'RPG character sprites']) {
      const c = byTitle(t);
      expect(text).toContain(c.url);
      expect(text).toContain(c.author);
      expect(text).toContain(c.license);
    }
  });

  it('matches the credits file of the npc sheets', () => {
    const text = asset('npc/CREDITS.txt');
    for (const t of ['Dog Spritesheets', 'Officer Character']) {
      const c = byTitle(t);
      expect(text).toContain(c.title);
      expect(text).toContain(c.url);
      expect(text).toContain(c.author);
      expect(text).toContain(c.license);
    }
  });

  it('matches the Kenney licence file', () => {
    const text = asset('kenney/License.txt');
    const c = byTitle('Roguelike Modern City');
    expect(text).toContain(c.title);
    expect(text).toContain(c.author);
    expect(text).toContain(c.license);
  });

  it('the README credits list names every entry with its link', () => {
    const readme = readFileSync(fileURLToPath(new URL('../../../README.md', import.meta.url)), 'utf8');
    for (const c of CREDITS) expect(readme).toContain(`[${c.title}](${c.url})`);
  });

  it('formats the row and detail lines', () => {
    const c = byTitle('Phaser 3');
    expect(creditLine(c)).toBe('Phaser 3 – Photon Storm (MIT)');
    expect(creditDetail(c)).toBe('https://phaser.io  ·  Spiel-Framework');
    expect(creditDetail({ title: 'x', author: 'y', license: 'CC0', url: 'https://a.b' })).toBe('https://a.b');
  });
});
