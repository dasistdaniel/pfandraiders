import { describe, expect, it, vi } from 'vitest';
// devices.ts importiert Phaser, das beim Laden ein window braucht; genutzt wird davon hier nichts.
vi.mock('phaser', () => ({ default: {} }));

import { KEYBOARD_LAYOUTS } from '../src/devices';
import { controlLines, MenuModel } from '../src/menuModel';
import { PAD_LABELS } from '../src/sources';

const items = [
  { id: 'a', label: 'A' },
  { id: 'b', label: 'B' },
  { id: 'c', label: 'C' },
];

describe('MenuModel', () => {
  it('wirft bei leerer Liste', () => {
    expect(() => new MenuModel([])).toThrow();
  });

  it('startet bei 0', () => {
    const m = new MenuModel(items);
    expect(m.selected).toBe(0);
    expect(m.activate()).toBe('a');
  });

  it('move(1) läuft bis zum Ende und zyklisch zurück', () => {
    const m = new MenuModel(items);
    m.move(1);
    expect(m.selected).toBe(1);
    m.move(1);
    expect(m.selected).toBe(2);
    m.move(1);
    expect(m.selected).toBe(0);
  });

  it('move(-1) von 0 geht zum letzten', () => {
    const m = new MenuModel(items);
    m.move(-1);
    expect(m.selected).toBe(2);
    expect(m.activate()).toBe('c');
  });

  it('select setzt gültige Indizes', () => {
    const m = new MenuModel(items);
    m.select(2);
    expect(m.selected).toBe(2);
    m.select(0);
    expect(m.selected).toBe(0);
  });

  it.each([-1, 3, Number.NaN, 1.5, Infinity])('select(%s) bleibt wirkungslos', (bad) => {
    const m = new MenuModel(items);
    m.select(1);
    m.select(bad);
    expect(m.selected).toBe(1);
  });
});

describe('controlLines', () => {
  const lines = controlLines(KEYBOARD_LAYOUTS, PAD_LABELS);

  it('hat je Tastatur-Layout eine Zeile mit dem Namen und die Gamepad-Zeile', () => {
    expect(lines).toHaveLength(KEYBOARD_LAYOUTS.length + 1);
    KEYBOARD_LAYOUTS.forEach((l, i) => {
      expect(lines[i]).toContain(l.name);
      expect(lines[i]).toContain(l.labels.action);
    });
    expect(lines[lines.length - 1]).toContain('Gamepad');
  });
});
