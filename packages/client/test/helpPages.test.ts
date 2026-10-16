import { describe, expect, it, vi } from 'vitest';
// devices.ts importiert Phaser, das beim Laden ein window braucht; genutzt werden hier nur die Tastenbelegungen.
vi.mock('phaser', () => ({ default: {} }));

import { CONFIG, MAX_ROOM_PLAYERS, SHOP_CATEGORY_NAMES } from '@pfandraiders/core';
import { KEYBOARD_LAYOUTS } from '../src/devices';
import { formatMoney } from '../src/format';
import {
  HELP_LAYOUT,
  helpDevices,
  helpPages,
  moveLabel,
  NBSP,
  pageHeight,
  pageLabel,
  stepPage,
  secondsText,
  wrapText,
} from '../src/helpPages';
import type { HelpOptions, HelpPage } from '../src/helpPages';
import { PAD_LABELS, PAD_TAB_LABELS } from '../src/sources';

const devices = helpDevices(KEYBOARD_LAYOUTS, PAD_LABELS, PAD_TAB_LABELS);
const opts = (config = CONFIG): HelpOptions => ({ config, devices, localMax: 4 });
const pages = helpPages(opts());
const textOf = (p: HelpPage): string => p.entries.flatMap((e) => e.lines).join('\n');
const allText = (ps: HelpPage[]): string => ps.map((p) => `${p.title}\n${textOf(p)}`).join('\n');
/** Fließtext ohne Zeilenumbrüche, damit gesuchte Wendungen nicht an einem Umbruch scheitern. */
const flat = (ps: HelpPage[]): string => allText(ps).replace(/\s+/g, ' ');
const clone = (): typeof CONFIG => structuredClone(CONFIG);
/** Erwartete Texte mit normalen Leerzeichen (flat ersetzt die geschützten ebenso). */
const sec = (ms: number): string => secondsText(ms).replace(/\s/g, ' ');

describe('wrapText', () => {
  it('wraps at word boundaries within the limit', () => {
    expect(wrapText('eins zwei drei vier', 9)).toEqual(['eins zwei', 'drei vier']);
  });

  it('splits words longer than a line', () => {
    expect(wrapText('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij']);
  });

  it('never breaks at a protected space (number and unit stay together)', () => {
    expect(wrapText(`alle 0,15${NBSP}s weiter`, 10)).toEqual([`alle`, `0,15${NBSP}s`, 'weiter']);
  });

  it('keeps an empty text as one empty line', () => {
    expect(wrapText('', 10)).toEqual(['']);
  });
});

describe('secondsText', () => {
  it('writes seconds with a German decimal comma', () => {
    expect(secondsText(1500)).toBe(`1,5${NBSP}s`);
    expect(secondsText(2000)).toBe(`2${NBSP}s`);
    expect(secondsText(600)).toBe(`0,6${NBSP}s`);
  });
});

describe('moveLabel', () => {
  it('names WASD and the arrow keys', () => {
    expect(moveLabel(KEYBOARD_LAYOUTS[0])).toBe('WASD');
    expect(moveLabel(KEYBOARD_LAYOUTS[1])).toBe('Pfeile');
  });

  it('lists other keys as they are', () => {
    expect(moveLabel({ up: 'I', left: 'J', down: 'K', right: 'L' })).toBe('I/J/K/L');
  });
});

describe('helpPages', () => {
  it('has five pages with titles', () => {
    expect(pages.map((p) => p.title)).toEqual([
      'Ziel und Ablauf',
      'Steuerung',
      'Gegner und Kampf',
      'Shop und Wertung',
      'Tipps',
    ]);
  });

  it('contains no undefined, NaN or empty placeholders', () => {
    const text = allText(pages);
    expect(text).not.toMatch(/undefined|NaN|null|\{|\}/);
    for (const p of pages) for (const e of p.entries) expect(e.lines.length).toBeGreaterThan(0);
  });

  it('fits every page into the content area (line width and height)', () => {
    for (const p of pages) {
      for (const e of p.entries) {
        const max = e.kind === 'table' ? HELP_LAYOUT.tableChars : HELP_LAYOUT.textChars;
        for (const line of e.lines) expect(line.length, `${p.title}: ${line}`).toBeLessThanOrEqual(max);
      }
      expect(pageHeight(p), p.title).toBeLessThanOrEqual(HELP_LAYOUT.contentH);
    }
  });

  it('page 1 takes search time, countdown, round times and bottle values from CONFIG', () => {
    const t = flat([pages[0]]);
    expect(t).toContain(sec(CONFIG.searchMs));
    expect(t).toContain(`${sec(CONFIG.countdownMs)}`);
    expect(t).toContain('3, 5, 7 oder 10 Minuten');
    expect(t).toContain(`${CONFIG.bottleValue.crate} ct`);
    expect(t).toContain(`${CONFIG.carry.base} Flaschen`);
  });

  it('follows changed CONFIG values', () => {
    const c = clone();
    c.searchMs = 2500;
    c.countdownMs = 3000;
    c.health.knockoutMs = 12000;
    c.fight.damage = 25;
    c.fight.gloveBonus = 15;
    c.shop.items.backpack = { ...c.shop.items.backpack, prices: [450] };
    c.zone.multiplier = 4;
    const t = flat(helpPages(opts(c)));
    expect(t).toContain('2,5 s');
    expect(t).toContain('Countdown von 3 s');
    expect(t).toContain('12 s ausgeknockt');
    expect(t).toContain('25 Schaden');
    expect(t).toContain('40 mit Boxhandschuh');
    expect(t).toContain(formatMoney(450));
    expect(t).toContain('4-faches Pfand');
    expect(t).not.toContain('dreifach');
  });

  it('the controls table has a row per keyboard layout and the gamepad, with their real keys', () => {
    const table = pages[1].entries.find((e) => e.kind === 'table');
    expect(table).toBeDefined();
    const rows = table!.lines;
    const row = (name: string): string => rows.find((r) => r.startsWith(name)) ?? '';
    const cells = (r: string): string[] => r.trim().split(/\s{2,}/);
    KEYBOARD_LAYOUTS.forEach((l, i) => {
      const r = cells(row(`Tastatur ${i + 1}`));
      expect(r).toEqual([`Tastatur ${i + 1}`, moveLabel(l), l.labels.action, l.labels.steal, l.labels.attack, l.labels.spray, `${l.labels.steal} ${l.labels.attack}`, 'Esc']);
    });
    expect(cells(row('Gamepad'))).toEqual([
      'Gamepad',
      'Stick/Steuerkreuz',
      PAD_LABELS.action,
      PAD_LABELS.steal,
      PAD_LABELS.attack,
      PAD_LABELS.spray,
      `${PAD_TAB_LABELS.prev} ${PAD_TAB_LABELS.next}`,
      'Start',
    ]);
  });

  it('page 2 mentions switching the online control device in the Esc menu', () => {
    expect(flat([pages[1]])).toContain('im Esc-Menü wechselt „Steuerung“ es jederzeit');
  });

  it('page 3 explains enemies and fighting with CONFIG numbers', () => {
    const t = flat([pages[2]]);
    expect(t).toContain(`${CONFIG.npc.dog.biteDamage} Leben`);
    expect(t).toContain(sec(CONFIG.npc.police.checkMs));
    expect(t).toContain('die Hälfte');
    expect(t).toContain(`${CONFIG.fight.damage} Schaden`);
    expect(t).toContain(`${CONFIG.fight.damage + CONFIG.fight.gloveBonus} mit Boxhandschuh`);
    expect(t).toContain(sec(CONFIG.fight.cooldownMs));
    expect(t).toContain(`${sec(CONFIG.health.knockoutMs)} ausgeknockt`);
    expect(t).toContain(`${CONFIG.health.food.heal} Leben`);
  });

  it('page 4 lists every shop category and item with its price', () => {
    const t = flat([pages[3]]);
    for (const name of Object.values(SHOP_CATEGORY_NAMES)) expect(t).toContain(name);
    for (const def of Object.values(CONFIG.shop.items)) {
      expect(t).toContain(def.name);
      expect(t).toContain(formatMoney(def.prices[0]));
    }
    expect(t).toContain('Gesamt');
  });

  it('page 5 names events, local and online player counts', () => {
    const t = flat([pages[4]]);
    expect(t).toContain('Stadion');
    expect(t).toContain('dreifach');
    expect(t).toContain('bis zu 4 Spieler');
    expect(t).toContain(`bis zu ${MAX_ROOM_PLAYERS} Spieler`);
  });

  it('icons are only known keys', () => {
    const known = ['bottles', 'spot', 'dropoff', 'player', 'dog', 'police', 'money'];
    for (const p of pages) for (const e of p.entries) if (e.icon) expect(known).toContain(e.icon);
  });
});

describe('page navigation', () => {
  it('steps within the pages without wrapping', () => {
    expect(stepPage(0, -1, 5)).toBe(0);
    expect(stepPage(0, 1, 5)).toBe(1);
    expect(stepPage(4, 1, 5)).toBe(4);
    expect(stepPage(3, -1, 5)).toBe(2);
  });

  it('labels the page as "Seite n/m"', () => {
    expect(pageLabel(0, 5)).toBe('Seite 1/5');
    expect(pageLabel(4, 5)).toBe('Seite 5/5');
  });
});
