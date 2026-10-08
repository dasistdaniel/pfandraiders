import { describe, expect, it, vi } from 'vitest';
// devices.ts importiert Phaser, das beim Laden ein window braucht; genutzt wird davon hier nichts.
vi.mock('phaser', () => ({ default: {} }));

import { KEYBOARD_LAYOUTS } from '../src/devices';
import { controlLines, MenuModel, arrowAt } from '../src/menuModel';
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

  it('names steal, attack and eat and no buy keys', () => {
    expect(lines[0]).toBe('Tastatur 1 (WASD, E): Aktion E, Ausrauben Q, Schlagen F, Essen C');
    expect(lines[1]).toBe('Tastatur 2 (Pfeile, Enter): Aktion Enter, Ausrauben /, Schlagen ., Essen ,');
    expect(lines[2]).toBe('Gamepad (Stick/Steuerkreuz): Aktion A, Ausrauben B, Schlagen X, Essen Y');
  });
});

describe('arrowAt', () => {
  const label = 'Lautstärke: ◄ 70 % ►';
  const width = label.length * 10; // 10 px pro Zeichen
  const x = (index: number) => index * 10 + 5; // Mitte des Zeichens
  it('hits the left arrow and its neighbours', () => {
    const i = label.indexOf('◄');
    expect(arrowAt(label, x(i), width)).toBe(-1);
    expect(arrowAt(label, x(i - 1), width)).toBe(-1);
    expect(arrowAt(label, x(i + 1), width)).toBe(-1);
  });
  it('hits the right arrow and its neighbours', () => {
    const i = label.indexOf('►');
    expect(arrowAt(label, x(i), width)).toBe(1);
    expect(arrowAt(label, x(i - 1), width)).toBe(1);
    expect(arrowAt(label, x(i + 1), width)).toBe(1);
  });
  it('ignores clicks on the name and on the value', () => {
    expect(arrowAt(label, x(2), width)).toBe(0);
    expect(arrowAt(label, x(label.indexOf('70')), width)).toBe(0);
    expect(arrowAt(label, x(label.length + 5), width)).toBe(0);
  });
  it('is safe for garbage input', () => {
    expect(arrowAt('', 5, 100)).toBe(0);
    expect(arrowAt(label, NaN, width)).toBe(0);
    expect(arrowAt(label, 5, 0)).toBe(0);
    expect(arrowAt(label, -50, width)).toBe(0);
    expect(arrowAt('Ton: an', 30, 70)).toBe(0);
  });
});
