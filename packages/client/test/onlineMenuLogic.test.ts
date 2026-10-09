import { describe, expect, it } from 'vitest';
import { createRequest, nextTab, parseTab, sanitizeRoomCode, shouldReportClose, TAB_LABELS, TABS } from '../src/onlineMenuLogic';

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

describe('tabs', () => {
  it('has three tabs with German labels', () => {
    expect(TABS).toEqual(['host', 'join', 'list']);
    expect(TAB_LABELS).toEqual({ host: 'Raum erstellen', join: 'Beitreten', list: 'Raumliste' });
  });
});

describe('nextTab', () => {
  it('wechselt mit den Pfeiltasten und bricht um', () => {
    expect(nextTab('host', 'ArrowRight')).toBe('join');
    expect(nextTab('join', 'ArrowRight')).toBe('list');
    expect(nextTab('list', 'ArrowRight')).toBe('host');
    expect(nextTab('host', 'ArrowLeft')).toBe('list');
    expect(nextTab('list', 'ArrowLeft')).toBe('join');
  });
  it('ignoriert andere Tasten', () => {
    expect(nextTab('host', 'Enter')).toBe('host');
    expect(nextTab('list', 'ArrowDown')).toBe('list');
  });
});

describe('parseTab', () => {
  it('erkennt join und list, alles andere ist host', () => {
    expect(parseTab('join')).toBe('join');
    expect(parseTab('list')).toBe('list');
    expect(parseTab('host')).toBe('host');
    expect(parseTab('LIST')).toBe('host');
    expect(parseTab(null)).toBe('host');
    expect(parseTab(42)).toBe('host');
  });
});

describe('createRequest', () => {
  it('sends only filled fields, cleaned', () => {
    expect(createRequest({ roomName: '  Bude ', visibility: 'private', password: ' pw ' })).toEqual({
      ok: true,
      value: { roomName: 'Bude', visibility: 'private', password: 'pw' },
    });
    expect(createRequest({ roomName: ' ', visibility: 'public', password: '' })).toEqual({ ok: true, value: { visibility: 'public' } });
  });

  it('explains too long fields in German', () => {
    expect(createRequest({ roomName: 'x'.repeat(25), visibility: 'public', password: '' })).toEqual({
      ok: false,
      error: 'Raumname: höchstens 24 Zeichen.',
    });
    expect(createRequest({ roomName: '', visibility: 'public', password: 'x'.repeat(17) })).toEqual({
      ok: false,
      error: 'Passwort: höchstens 16 Zeichen.',
    });
  });
});

describe('shouldReportClose', () => {
  it('reports a lost connection only inside a room', () => {
    expect(shouldReportClose('')).toBe(false);
    expect(shouldReportClose('ABCD')).toBe(true);
  });
});
