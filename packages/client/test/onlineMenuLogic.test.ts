import { describe, expect, it } from 'vitest';
import { nextTab, parseTab, sanitizeRoomCode } from '../src/onlineMenuLogic';

describe('sanitizeRoomCode', () => {
  it('macht Großbuchstaben', () => {
    expect(sanitizeRoomCode('abcd')).toBe('ABCD');
  });
  it('entfernt ungültige Zeichen, auch I O 0 1', () => {
    expect(sanitizeRoomCode('I-O 0_1a')).toBe('A');
    expect(sanitizeRoomCode('a!b?c#d')).toBe('ABCD');
  });
  it('kürzt auf 4 Zeichen', () => {
    expect(sanitizeRoomCode('ABCDEFG')).toBe('ABCD');
    expect(sanitizeRoomCode('a1b2c3d4')).toBe('AB2C');
  });
  it('lässt gültige Ziffern 2-9 durch und behandelt leere Eingabe', () => {
    expect(sanitizeRoomCode('2389')).toBe('2389');
    expect(sanitizeRoomCode('')).toBe('');
  });
});

describe('nextTab', () => {
  it('wechselt mit den Pfeiltasten und bricht um', () => {
    expect(nextTab('host', 'ArrowRight')).toBe('join');
    expect(nextTab('join', 'ArrowRight')).toBe('host');
    expect(nextTab('join', 'ArrowLeft')).toBe('host');
    expect(nextTab('host', 'ArrowLeft')).toBe('join');
  });
  it('ignoriert andere Tasten', () => {
    expect(nextTab('host', 'Enter')).toBe('host');
    expect(nextTab('join', 'ArrowDown')).toBe('join');
  });
});

describe('parseTab', () => {
  it('erkennt join, alles andere ist host', () => {
    expect(parseTab('join')).toBe('join');
    expect(parseTab('host')).toBe('host');
    expect(parseTab('JOIN')).toBe('host');
    expect(parseTab(null)).toBe('host');
    expect(parseTab(42)).toBe('host');
    expect(parseTab('{"a":1}')).toBe('host');
  });
});
