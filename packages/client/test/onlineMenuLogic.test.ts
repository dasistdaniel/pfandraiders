import { describe, expect, it } from 'vitest';
import { createRequest, nextTab, PadTabEdges, pageTabStep, parseTab, sanitizeRoomCode, shouldReportClose, stepTab, TAB_LABELS, TABS } from '../src/onlineMenuLogic';

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

describe('pageTabStep und stepTab', () => {
  it('Bild hoch ist der vorige, Bild runter der nächste Tab, andere Tasten nichts', () => {
    expect(pageTabStep('PageUp')).toBe(-1);
    expect(pageTabStep('PageDown')).toBe(1);
    expect(pageTabStep('ArrowRight')).toBe(0);
    expect(pageTabStep('a')).toBe(0);
  });
  it('wechselt mit Umbruch wie die Pfeiltasten', () => {
    expect(stepTab('host', 1)).toBe('join');
    expect(stepTab('list', 1)).toBe('host');
    expect(stepTab('host', -1)).toBe('list');
    expect(stepTab('join', -1)).toBe('host');
    expect(stepTab('join', 0)).toBe('join');
  });
});

describe('PadTabEdges', () => {
  const pad = (lb: boolean, rb: boolean) => ({ buttons: [0, 1, 2, 3, lb, rb].map((p) => ({ pressed: p === true })) });

  it('LB gibt -1, RB +1, je nur beim neuen Druck', () => {
    const e = new PadTabEdges();
    expect(e.update([pad(false, false)])).toBe(0);
    expect(e.update([pad(false, true)])).toBe(1);
    expect(e.update([pad(false, true)])).toBe(0);
    expect(e.update([pad(false, false)])).toBe(0);
    expect(e.update([pad(true, false)])).toBe(-1);
    expect(e.update([pad(true, false)])).toBe(0);
  });

  it('ignoriert beim Öffnen schon gehaltene Tasten bis zum Loslassen', () => {
    const e = new PadTabEdges();
    expect(e.update([pad(true, true)])).toBe(0);
    expect(e.update([pad(true, true)])).toBe(0);
    expect(e.update([pad(false, true)])).toBe(0);
    expect(e.update([pad(true, true)])).toBe(-1);
  });

  it('wertet jedes Pad für sich, LB und RB zugleich heben sich auf', () => {
    const e = new PadTabEdges();
    e.update([pad(false, false), pad(false, false)]);
    expect(e.update([pad(false, false), pad(false, true)])).toBe(1);
    expect(e.update([pad(true, false), pad(false, true)])).toBe(-1);
    expect(e.update([pad(false, false), pad(false, false)])).toBe(0);
    expect(e.update([pad(true, true), pad(false, false)])).toBe(0);
  });

  it('verkraftet fehlende Pads und kurze Tastenlisten', () => {
    const e = new PadTabEdges();
    expect(e.update([null, undefined, { buttons: [] }])).toBe(0);
    expect(e.update([null, { buttons: [] }])).toBe(0);
    expect(e.update([null, pad(false, false)])).toBe(0);
    expect(e.update([null, pad(false, true)])).toBe(1);
    expect(e.update([])).toBe(0);
    // Pad wieder da: zählt wie neu angesteckt, gehaltene Taste erst nach dem Loslassen
    expect(e.update([null, pad(false, true)])).toBe(0);
  });
});
