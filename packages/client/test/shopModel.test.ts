import { freshProgress } from '@pfandraiders/core';
import type { Progress } from '@pfandraiders/core';
import { describe, expect, it } from 'vitest';
import { ShopModel, shopPointerEnabled } from '../src/shopModel';

function rich(money = 100_000): Progress {
  return { ...freshProgress(), money };
}

describe('ShopModel navigation', () => {
  it('starts in Taschen on the first entry with quantity 1 and not ready', () => {
    const m = new ShopModel();
    expect(m.category).toBe('bags');
    expect(m.row).toBe(0);
    expect(m.qty).toBe(1);
    expect(m.ready).toBe(false);
    expect(m.categories().map((c) => c.name)).toEqual(['Taschen', 'Upgrades', 'Angriff', 'Verteidigung']);
  });

  it('switches the category with left and right and wraps around', () => {
    const m = new ShopModel();
    const p = rich();
    m.move('right', p);
    m.move('right', p);
    expect(m.category).toBe('attack');
    m.move('left', p);
    m.move('left', p);
    expect(m.category).toBe('bags');
    m.move('left', p); // Umlauf nach links
    expect(m.category).toBe('defense');
    expect(m.row).toBe(0);
  });

  it('moves up and down over the entries and Bereit, with wrap-around', () => {
    const m = new ShopModel();
    const p = rich();
    m.move('right', p); // Upgrades: knockout, speed, search, Bereit
    expect(m.rowCount()).toBe(4);
    m.move('up', p);
    expect(m.rows(p)[m.row].kind).toBe('ready');
    m.move('down', p);
    expect(m.row).toBe(0);
  });

  it('has an extra row to end the series only when allowed', () => {
    const host = new ShopModel({ canEndSeries: true });
    expect(host.rows(rich()).map((r) => r.kind)).toEqual(['item', 'ready', 'end']);
    expect(new ShopModel().rows(rich()).map((r) => r.kind)).toEqual(['item', 'ready']);
  });

  it('changes the quantity with left and right on a consumable row, otherwise the category', () => {
    const m = new ShopModel();
    const p = rich();
    m.selectCategory(3); // Verteidigung: Leckerli, Essen, Rüstung
    m.selectRow(1); // Essen
    m.move('right', p);
    m.move('right', p);
    expect(m.qty).toBe(3);
    m.move('left', p);
    expect(m.qty).toBe(2);
    expect(m.category).toBe('defense');
    m.move('down', p); // Rüstung
    expect(m.qty).toBe(1);
    m.move('right', p);
    expect(m.category).toBe('bags');
  });

  it('never goes below 1 or above the free stock (max 99)', () => {
    const m = new ShopModel();
    const p = rich();
    p.inventory.food = 97;
    m.selectCategory(3);
    m.selectRow(1);
    m.move('left', p);
    expect(m.qty).toBe(1);
    for (let i = 0; i < 10; i++) m.move('right', p);
    expect(m.qty).toBe(2);
    expect(m.maxQty(p)).toBe(2);
    m.changeQty(50, p);
    expect(m.qty).toBe(2);
  });

  it('ignores mouse selections out of range', () => {
    const m = new ShopModel();
    m.selectCategory(9);
    m.selectRow(-1);
    m.selectRow(99);
    expect(m.category).toBe('bags');
    expect(m.row).toBe(0);
  });
});

describe('ShopModel actions', () => {
  it('buys the selected entry with the chosen quantity and resets the quantity', () => {
    const m = new ShopModel();
    const p = rich();
    m.selectCategory(3);
    m.selectRow(1);
    m.changeQty(4, p);
    expect(m.activate(p)).toEqual({ kind: 'buy', category: 'defense', item: 'food', qty: 5 });
    expect(m.qty).toBe(1);
  });

  it('reports why an entry cannot be bought instead of buying', () => {
    const m = new ShopModel();
    expect(m.activate(rich(10))).toEqual({ kind: 'refused', reason: 'no_money' });
    m.selectCategory(2);
    m.selectRow(2); // Steinschleuder
    expect(m.activate(rich())).toEqual({ kind: 'refused', reason: 'unavailable' });
  });

  it('toggles ready on the Bereit row and ends the series on its row', () => {
    const m = new ShopModel({ canEndSeries: true });
    const p = rich();
    m.selectRow(1);
    expect(m.activate(p)).toEqual({ kind: 'ready', ready: true });
    expect(m.ready).toBe(true);
    expect(m.activate(p)).toEqual({ kind: 'ready', ready: false });
    m.selectRow(2);
    expect(m.activate(p)).toEqual({ kind: 'endSeries' });
  });

  it('offers a buy button action only on an entry row', () => {
    const m = new ShopModel();
    const p = rich();
    expect(m.buyAction(p)).toEqual({ kind: 'buy', category: 'bags', item: 'bag', qty: 1 });
    m.selectRow(1);
    expect(m.buyAction(p)).toBeNull();
    expect(m.toggleReady()).toEqual({ kind: 'ready', ready: true });
  });

  it('takes the ready state from outside (server)', () => {
    const m = new ShopModel();
    m.setReady(true);
    expect(m.ready).toBe(true);
  });
});

describe('ShopModel rows', () => {
  it('describes the next bag, greys it without money and says when it is fully upgraded', () => {
    const m = new ShopModel();
    const p = rich(100);
    expect(m.rows(p)[0]).toMatchObject({ name: 'Tasche', detail: '8 Plätze', price: '1,50 €', state: 'grey', selected: true });
    p.money = 1000;
    expect(m.rows(p)[0].state).toBe('normal');
    p.containerLevel = 3;
    expect(m.rows(p)[0]).toMatchObject({ name: 'Einkaufswagen', detail: 'voll ausgebaut', price: '', state: 'grey' });
  });

  it('describes leveled upgrades with their next effect', () => {
    const m = new ShopModel();
    const p = rich();
    m.selectCategory(1);
    const rows = m.rows(p);
    expect(rows[0]).toMatchObject({ name: 'Knockout kürzer', detail: 'Stufe 0 → 1: 15 s', price: '2,00 €' });
    p.upgrades.knockout = 3;
    expect(m.rows(p)[0]).toMatchObject({ detail: 'Stufe 3 (max)', price: '', state: 'grey' });
  });

  it('shows ranged weapons grey with "bald"', () => {
    const m = new ShopModel();
    m.selectCategory(2);
    const rows = m.rows(rich());
    expect(rows[2]).toMatchObject({ name: 'Steinschleuder', detail: 'bald', price: '', state: 'soon' });
    expect(rows[3]).toMatchObject({ name: 'Pistole', state: 'soon' });
  });

  it('shows quantity and total only on the selected consumable row', () => {
    const m = new ShopModel();
    const p = rich();
    p.inventory.dog_treat = 4;
    m.selectCategory(3);
    m.selectRow(0);
    m.changeQty(2, p);
    const rows = m.rows(p);
    expect(rows[0]).toMatchObject({ name: 'Leckerli', detail: '◄ 3 ►  (hast 4)', price: '3,00 €' });
    expect(rows[1]).toMatchObject({ name: 'Essen', detail: '(hast 0)', price: '1,00 €' });
  });

  it('labels Bereit by state', () => {
    const m = new ShopModel();
    m.setReady(true);
    expect(m.rows(rich()).at(-1)).toMatchObject({ kind: 'ready', name: 'Bereit ✓ (nochmal: zurücknehmen)' });
  });
});

describe('shopPointerEnabled', () => {
  it('is on only online', () => {
    expect(shopPointerEnabled(true)).toBe(true);
    expect(shopPointerEnabled(false)).toBe(false);
  });
});
