import { describe, expect, it } from 'vitest';
import { PauseMenu, pauseHint, pauseLabel, pauseTitle } from '../src/pauseMenu';

const ids = (m: PauseMenu): string[] => m.items.map((i) => i.id);

describe('PauseMenu', () => {
  it('starts closed; Esc (toggle) opens the main page with "Fortsetzen" selected', () => {
    const m = new PauseMenu();
    expect(m.isOpen).toBe(false);
    expect(m.activate()).toBeNull();
    m.toggle();
    expect(m.view).toBe('main');
    expect(ids(m)).toEqual(['resume', 'toggleSound', 'askLeave']);
    expect(m.selected).toBe(0);
  });

  it('closes again with Esc (toggle) and with B (back)', () => {
    const m = new PauseMenu();
    m.toggle();
    m.toggle();
    expect(m.view).toBe('closed');
    m.open();
    m.back();
    expect(m.view).toBe('closed');
  });

  it('resume closes the menu', () => {
    const m = new PauseMenu();
    m.open();
    expect(m.activate()).toBe('resume');
    expect(m.isOpen).toBe(false);
  });

  it('toggleSound keeps the menu open on the same entry', () => {
    const m = new PauseMenu();
    m.open();
    m.move(1);
    expect(m.activate()).toBe('toggleSound');
    expect(m.view).toBe('main');
    expect(m.selected).toBe(1);
  });

  it('asks once before leaving: askLeave shows the confirm page with "Nein" preselected', () => {
    const m = new PauseMenu();
    m.open();
    m.select(2);
    expect(m.activate()).toBe('askLeave');
    expect(m.view).toBe('confirm');
    expect(ids(m)).toEqual(['leave', 'stay']);
    expect(m.selected).toBe(1);
    m.move(-1);
    expect(m.activate()).toBe('leave');
    expect(m.isOpen).toBe(false);
  });

  it('"Nein, zurück" and Esc/B in the confirm page go back to the main page on "Spiel verlassen"', () => {
    const m = new PauseMenu();
    m.open();
    m.select(2);
    m.activate();
    expect(m.activate()).toBe('stay');
    expect(m.view).toBe('main');
    expect(m.selected).toBe(2);
    m.activate();
    m.toggle(); // Esc
    expect(m.view).toBe('main');
    expect(m.selected).toBe(2);
    m.activate();
    m.back(); // B
    expect(m.view).toBe('main');
  });

  it('wraps the selection and ignores moves while closed', () => {
    const m = new PauseMenu();
    m.move(1);
    m.select(2);
    m.open();
    expect(m.selected).toBe(0);
    m.move(-1);
    expect(m.selected).toBe(2);
  });

  it('reopening after leaving the confirm page starts on the main page', () => {
    const m = new PauseMenu();
    m.open();
    m.select(2);
    m.activate();
    m.close();
    m.toggle();
    expect(m.view).toBe('main');
    expect(m.selected).toBe(0);
  });
});

describe('pause menu texts', () => {
  it('labels the sound entry with its state', () => {
    expect(pauseLabel({ id: 'toggleSound', label: 'Ton' }, false)).toBe('Ton: an');
    expect(pauseLabel({ id: 'toggleSound', label: 'Ton' }, true)).toBe('Ton: aus');
    expect(pauseLabel({ id: 'resume', label: 'Fortsetzen' }, true)).toBe('Fortsetzen');
  });

  it('tells online players that the game keeps running', () => {
    expect(pauseHint('main', true)).toBe('Das Spiel läuft weiter.');
    expect(pauseHint('main', false)).toBe('Spiel pausiert.');
    expect(pauseTitle('confirm', true)).toBe('Wirklich verlassen?');
    expect(pauseTitle('main', false)).toBe('Pause');
  });
});
