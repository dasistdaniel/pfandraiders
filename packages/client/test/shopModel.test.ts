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
    expect(m.categories().map((c) => c.name)).toEqual(['Taschen', 'Upgrades', 'Waffen', 'Verteidigung']);
  });

  it('switches the category with left and right and wraps around', () => {
    const m = new ShopModel();
    const p = rich();
    m.move('right', p);
    m.move('right', p);
    expect(m.category).toBe('weapons');
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
    m.move('right', p); // Upgrades: Taschenlampe, Kundenkarte, Kundenkarte+, Bereit
    expect(m.rowCount()).toBe(4);
    m.move('up', p);
    expect(m.rows(p)[m.row].kind).toBe('ready');
    m.move('down', p);
    expect(m.row).toBe(0);
  });

  it('has an extra row to end the series only when allowed', () => {
    const host = new ShopModel({ canEndSeries: true });
    expect(host.rows(rich()).map((r) => r.kind)).toEqual(['item', 'item', 'item', 'ready', 'end']);
    expect(new ShopModel().rows(rich()).map((r) => r.kind)).toEqual(['item', 'item', 'item', 'ready']);
  });

  it('changes the quantity with left and right on a stack row, otherwise the category', () => {
    const m = new ShopModel();
    const p = rich();
    m.selectCategory(3);
    m.selectRow(2); // Leckerli (Verteidigung: Pfefferspray, Ausweisdokumente, Leckerli)
    m.move('right', p);
    m.move('right', p);
    expect(m.qty).toBe(3);
    m.move('left', p);
    expect(m.qty).toBe(2);
    expect(m.activate(p)).toEqual({ kind: 'buy', category: 'defense', item: 'dog_treat', qty: 2 });
  });

  it('keeps the quantity at 1 on bag rows, so left and right switch the category', () => {
    const m = new ShopModel();
    const p = rich();
    m.selectRow(1); // Rucksack
    m.changeQty(3, p);
    expect(m.qty).toBe(1);
    expect(m.maxQty(p)).toBe(1);
    m.move('right', p);
    expect(m.category).toBe('upgrades');
  });

  it('never goes below 1 or above the free stock (max 99)', () => {
    const m = new ShopModel();
    const p = rich();
    p.items.dog_treat = 97;
    m.selectCategory(3);
    m.selectRow(2); // Leckerli
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
    m.selectRow(2); // Leckerli
    m.changeQty(4, p);
    expect(m.activate(p)).toEqual({ kind: 'buy', category: 'defense', item: 'dog_treat', qty: 5 });
    expect(m.qty).toBe(1);
  });

  it('reports why an entry cannot be bought instead of buying', () => {
    const m = new ShopModel();
    expect(m.activate(rich(10))).toEqual({ kind: 'refused', reason: 'no_money' });
    m.selectCategory(1);
    m.selectRow(2); // Kundenkarte+ ohne Kundenkarte
    expect(m.activate(rich())).toEqual({ kind: 'refused', reason: 'requires' });
  });

  it('toggles ready on the Bereit row and ends the series on its row', () => {
    const m = new ShopModel({ canEndSeries: true });
    const p = rich();
    m.selectRow(3);
    expect(m.activate(p)).toEqual({ kind: 'ready', ready: true });
    expect(m.ready).toBe(true);
    expect(m.activate(p)).toEqual({ kind: 'ready', ready: false });
    m.selectRow(4);
    expect(m.activate(p)).toEqual({ kind: 'endSeries' });
  });

  it('offers a buy button action only on an entry row', () => {
    const m = new ShopModel();
    const p = rich();
    expect(m.buyAction(p)).toEqual({ kind: 'buy', category: 'bags', item: 'bag', qty: 1 });
    m.selectRow(3);
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
  it('shows the three bag types with capacity and limit', () => {
    const m = new ShopModel();
    const p = rich();
    p.items.bag = 1;
    const rows = m.rows(p);
    expect(rows[0]).toMatchObject({ name: 'Tasche', detail: '+2 Plätze  (hast 1/4)', price: '1,50 €', state: 'normal', selected: true });
    expect(rows[1]).toMatchObject({ name: 'Rucksack', detail: '+5 Plätze  (hast 0/2)', price: '4,00 €', state: 'normal' });
    expect(rows[2]).toMatchObject({ name: 'Einkaufswagen', detail: 'mieten: +10 Plätze, −30 % Tempo', price: '1,00 €' });
  });

  it('greys a full bag stack and a rented cart', () => {
    const m = new ShopModel();
    const p = rich();
    p.items.bag = 4;
    p.items.cart = 1;
    const rows = m.rows(p);
    expect(rows[0]).toMatchObject({ detail: '+2 Plätze  (hast 4/4)', price: '', state: 'grey' });
    expect(rows[2]).toMatchObject({ detail: 'gemietet für die nächste Runde', price: '', state: 'grey' });
  });

  it('greys a row without money', () => {
    const m = new ShopModel();
    expect(m.rows(rich(100))[0]).toMatchObject({ price: '1,50 €', state: 'grey' });
  });

  it('describes the flashlight levels and the customer cards', () => {
    const m = new ShopModel();
    const p = rich();
    m.selectCategory(1);
    let rows = m.rows(p);
    expect(rows[0]).toMatchObject({ name: 'Taschenlampe', detail: 'Stufe 0 → 1: −15 % Suchzeit', price: '2,00 €' });
    expect(rows[1]).toMatchObject({ name: 'Kundenkarte', detail: 'Abgabe alle 0,10 s statt 0,15 s', price: '3,00 €', state: 'normal' });
    expect(rows[2]).toMatchObject({ name: 'Kundenkarte+', detail: 'braucht Kundenkarte', price: '6,00 €', state: 'grey' });
    p.items.flashlight = 3;
    p.items.card = 1;
    rows = m.rows(p);
    expect(rows[0]).toMatchObject({ detail: 'Stufe 3 (max)', price: '', state: 'grey' });
    expect(rows[1]).toMatchObject({ detail: 'vorhanden', price: '', state: 'grey' });
    expect(rows[2]).toMatchObject({ detail: '+10 % Pfand je Flasche', state: 'normal' });
  });

  it('sells the glove under Waffen', () => {
    const m = new ShopModel();
    const p = rich();
    m.selectCategory(2);
    expect(m.rows(p)[0]).toMatchObject({ name: 'Boxhandschuh', detail: '+10 Schaden je Schlag', price: '4,00 €', state: 'normal' });
    p.items.glove = 1;
    expect(m.rows(p)[0]).toMatchObject({ detail: 'vorhanden', price: '', state: 'grey' });
  });

  it('sells pepper spray by the bottle and shows the charges', () => {
    const m = new ShopModel();
    const p = rich();
    p.items.pepper = 15;
    m.selectCategory(3);
    m.changeQty(1, p);
    expect(m.rows(p)[0]).toMatchObject({ name: 'Pfefferspray', detail: '10 Ladungen je Flasche  ◄ 2 ►  (hast 15 Ladungen)', price: '6,00 €' });
    expect(m.maxQty(p)).toBe(8);
    expect(m.activate(p)).toEqual({ kind: 'buy', category: 'defense', item: 'pepper', qty: 2 });
    p.items.pepper = 95;
    expect(m.maxQty(p)).toBe(1);
    expect(m.rows(p)[0]).toMatchObject({ state: 'grey' });
  });

  it('offers the id papers for the next round only', () => {
    const m = new ShopModel();
    const p = rich();
    m.selectCategory(3);
    expect(m.rows(p)[1]).toMatchObject({ name: 'Ausweisdokumente', detail: 'keine Polizeikontrolle, nur für die nächste Runde', price: '3,00 €' });
    p.items.id_papers = 1;
    expect(m.rows(p)[1]).toMatchObject({ detail: 'gilt für die nächste Runde', price: '', state: 'grey' });
  });

  it('shows quantity and total only on the selected treat row', () => {
    const m = new ShopModel();
    const p = rich();
    p.items.dog_treat = 4;
    m.selectCategory(3);
    m.selectRow(2);
    m.changeQty(2, p);
    expect(m.rows(p)[2]).toMatchObject({ name: 'Leckerli', detail: '◄ 3 ►  (hast 4)', price: '3,00 €' });
    m.selectRow(0);
    expect(m.rows(p)[2]).toMatchObject({ detail: '(hast 4)', price: '1,00 €' });
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
