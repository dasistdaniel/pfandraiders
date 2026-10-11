import { describe, expect, it } from 'vitest';
import type { KeyState } from '../src/input';
import { freshProgress } from '@pfandraiders/core';
import { ShopModel } from '../src/shopModel';
import { NAV_REPEAT_DELAY_MS, NAV_REPEAT_EVERY_MS, ShopNav, shopHint } from '../src/shopNav';

const NONE: KeyState = { left: false, right: false, up: false, down: false, action: false, steal: false, attack: false, spray: false, tabPrev: false, tabNext: false };
const k = (over: Partial<KeyState>): KeyState => ({ ...NONE, ...over });

describe('ShopNav', () => {
  it('ignores keys that are already held on the first frame', () => {
    const nav = new ShopNav();
    expect(nav.update(k({ action: true, down: true }), 16)).toEqual([]);
    expect(nav.update(k({ action: true, down: true }), 16)).toEqual([]);
    expect(nav.update(k({}), 16)).toEqual([]);
    expect(nav.update(k({ action: true }), 16)).toEqual(['confirm']);
  });

  it('gives one command per new press', () => {
    const nav = new ShopNav();
    nav.update(NONE, 16);
    expect(nav.update(k({ up: true }), 16)).toEqual(['up']);
    expect(nav.update(k({ up: true }), 16)).toEqual([]);
    expect(nav.update(k({ right: true }), 16)).toEqual(['right']);
    expect(nav.update(k({ action: true }), 16)).toEqual(['confirm']);
    expect(nav.update(k({ action: true }), 16)).toEqual([]);
  });

  it('repeats a held direction after the delay at a fixed rate', () => {
    const nav = new ShopNav();
    nav.update(NONE, 16);
    expect(nav.update(k({ right: true }), 16)).toEqual(['right']);
    expect(nav.update(k({ right: true }), NAV_REPEAT_DELAY_MS - 1)).toEqual([]);
    expect(nav.update(k({ right: true }), 1)).toEqual(['right']);
    expect(nav.update(k({ right: true }), NAV_REPEAT_EVERY_MS * 3)).toEqual(['right', 'right', 'right']);
  });

  it('prefers up, down, left, right in this order when several are held', () => {
    const nav = new ShopNav();
    nav.update(NONE, 16);
    expect(nav.update(k({ left: true, down: true }), 16)).toEqual(['down']);
  });

  it('never uses steal, attack or spray', () => {
    const nav = new ShopNav();
    nav.update(NONE, 16);
    expect(nav.update(k({ steal: true, attack: true, spray: true }), 16)).toEqual([]);
  });

  it('switches the category once per new press of a category key, without repeat', () => {
    const nav = new ShopNav();
    nav.update(NONE, 16);
    expect(nav.update(k({ tabNext: true }), 16)).toEqual(['nextCategory']);
    expect(nav.update(k({ tabNext: true }), NAV_REPEAT_DELAY_MS + 10 * NAV_REPEAT_EVERY_MS)).toEqual([]);
    expect(nav.update(k({}), 16)).toEqual([]);
    expect(nav.update(k({ tabPrev: true }), 16)).toEqual(['prevCategory']);
    expect(nav.update(k({ tabPrev: true }), 16)).toEqual([]);
    expect(nav.update(k({ tabNext: true }), 16)).toEqual(['nextCategory']);
  });

  it('ignores category keys that are already held on the first frame', () => {
    const nav = new ShopNav();
    expect(nav.update(k({ tabPrev: true, tabNext: true }), 16)).toEqual([]);
    expect(nav.update(k({ tabPrev: true, tabNext: true }), 16)).toEqual([]);
    expect(nav.update(k({}), 16)).toEqual([]);
    expect(nav.update(k({ tabNext: true }), 16)).toEqual(['nextCategory']);
  });

  it('switches the category while a direction is held', () => {
    const nav = new ShopNav();
    nav.update(NONE, 16);
    expect(nav.update(k({ right: true }), 16)).toEqual(['right']);
    expect(nav.update(k({ right: true, tabNext: true }), 16)).toEqual(['nextCategory']);
  });
});

describe('shop on a quantity row', () => {
  it('switches the category with the category keys and leaves the quantity alone', () => {
    const p = { ...freshProgress(), money: 100_000 };
    const m = new ShopModel();
    const nav = new ShopNav();
    m.selectCategory(3);
    m.selectRow(2); // Leckerli: links/rechts ändern hier die Menge
    const step = (keys: Partial<KeyState>) => {
      for (const cmd of nav.update(k(keys), 16)) {
        if (cmd === 'prevCategory') m.stepCategory(-1);
        else if (cmd === 'nextCategory') m.stepCategory(1);
        else if (cmd !== 'confirm') m.move(cmd, p);
      }
    };
    step({});
    step({ right: true });
    step({});
    expect(m.qty).toBe(2);
    expect(m.category).toBe('defense');
    step({ tabNext: true }); // Umlauf: nach Verteidigung kommt Taschen
    expect(m.category).toBe('bags');
    expect(m.row).toBe(0);
    expect(m.qty).toBe(1);
    step({});
    step({ tabPrev: true });
    expect(m.category).toBe('defense');
    expect(m.qty).toBe(1);
  });
});

describe('shopHint', () => {
  it('names the action and the category keys of the device', () => {
    expect(shopHint('E', { prev: 'Q', next: 'F' })).toBe(
      'Hoch/runter: wählen   Links/rechts: Kategorie oder Menge   Q F: Kategorie   E: kaufen / bereit   Esc: verlassen',
    );
    expect(shopHint('Enter', { prev: '/', next: '.' })).toContain('/ .: Kategorie');
    expect(shopHint('A', { prev: 'LB', next: 'RB' })).toContain('LB RB: Kategorie');
  });
});
