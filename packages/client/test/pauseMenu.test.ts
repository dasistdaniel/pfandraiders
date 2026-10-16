import { describe, expect, it } from 'vitest';
import { PAUSE_MAX_ITEMS, PauseMenu, pauseHint, pauseLabel, pauseTitle } from '../src/pauseMenu';

const ids = (m: PauseMenu): string[] => m.items.map((i) => i.id);

describe('PauseMenu', () => {
  it('starts closed; Esc (toggle) opens the main page with "Fortsetzen" selected', () => {
    const m = new PauseMenu();
    expect(m.isOpen).toBe(false);
    expect(m.activate()).toBeNull();
    m.toggle();
    expect(m.view).toBe('main');
    expect(ids(m)).toEqual(['resume', 'toggleSound', 'help', 'askLeave']);
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

  it('help keeps the menu open on the same entry (the help screen lies above it)', () => {
    const m = new PauseMenu();
    m.open();
    m.select(2);
    expect(m.activate()).toBe('help');
    expect(m.view).toBe('main');
    expect(m.selected).toBe(2);
    expect(m.items[2].label).toBe('Anleitung');
  });

  it('asks once before leaving: askLeave shows the confirm page with "Nein" preselected', () => {
    const m = new PauseMenu();
    m.open();
    m.select(3);
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
    m.select(3);
    m.activate();
    expect(m.activate()).toBe('stay');
    expect(m.view).toBe('main');
    expect(m.selected).toBe(3);
    m.activate();
    m.toggle(); // Esc
    expect(m.view).toBe('main');
    expect(m.selected).toBe(3);
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
    expect(m.selected).toBe(3);
  });

  it('reopening after leaving the confirm page starts on the main page', () => {
    const m = new PauseMenu();
    m.open();
    m.select(3);
    m.activate();
    m.close();
    m.toggle();
    expect(m.view).toBe('main');
    expect(m.selected).toBe(0);
  });
});

describe('pause menu texts', () => {
  it('labels the sound entry with its state', () => {
    const sound = { id: 'toggleSound', label: 'Ton' };
    expect(pauseLabel(sound, { music: true, effects: true })).toBe('Ton: an');
    expect(pauseLabel(sound, { music: false, effects: false })).toBe('Ton: aus');
    expect(pauseLabel(sound, { music: false, effects: true })).toBe('Ton: Musik aus');
    expect(pauseLabel(sound, { music: true, effects: false })).toBe('Ton: Effekte aus');
    expect(pauseLabel({ id: 'resume', label: 'Fortsetzen' }, { music: false, effects: false })).toBe('Fortsetzen');
  });

  it('tells online players that the game keeps running', () => {
    expect(pauseHint('main', true)).toBe('Das Spiel läuft weiter.');
    expect(pauseHint('main', false)).toBe('Spiel pausiert.');
    expect(pauseTitle('confirm', true)).toBe('Wirklich verlassen?');
    expect(pauseTitle('main', false)).toBe('Pause');
  });
});

describe('PauseMenu online: control device entry', () => {
  it('offers "Steuerung" only online, between "Ton" and "Anleitung"', () => {
    const online = new PauseMenu(true);
    online.open();
    expect(ids(online)).toEqual(['resume', 'toggleSound', 'device', 'help', 'askLeave']);
    const local = new PauseMenu(false);
    local.open();
    expect(ids(local)).toEqual(['resume', 'toggleSound', 'help', 'askLeave']);
  });

  it('confirm on the entry steps to the next device and keeps the menu open on it', () => {
    const m = new PauseMenu(true);
    m.open();
    m.select(2);
    expect(m.activate()).toBe('deviceNext');
    expect(m.view).toBe('main');
    expect(m.selected).toBe(2);
  });

  it('left/right change the device only on the entry', () => {
    const m = new PauseMenu(true);
    expect(m.adjust(1)).toBeNull();
    m.open();
    expect(m.adjust(1)).toBeNull();
    m.select(2);
    expect(m.adjust(1)).toBe('deviceNext');
    expect(m.adjust(-1)).toBe('devicePrev');
    expect(m.selected).toBe(2);
  });

  it('asks before leaving and returns to "Spiel verlassen" (last entry) also online', () => {
    const m = new PauseMenu(true);
    m.open();
    m.select(4);
    expect(m.activate()).toBe('askLeave');
    expect(m.adjust(1)).toBeNull();
    expect(m.activate()).toBe('stay');
    expect(m.selected).toBe(4);
    m.move(1);
    expect(m.selected).toBe(0);
  });

  it('labels the entry with the chosen device and arrows', () => {
    const item = { id: 'device', label: 'Steuerung' };
    const audio = { music: true, effects: true };
    expect(pauseLabel(item, audio, { kind: 'pad', index: 0 })).toBe('Steuerung: ◄ Gamepad 1 ►');
    expect(pauseLabel(item, audio, { kind: 'keyboard', layout: 1 })).toBe('Steuerung: ◄ Tastatur 2 ►');
    expect(pauseLabel(item, audio)).toBe('Steuerung');
  });

  it('fits into the overlay (maxItems)', () => {
    const m = new PauseMenu(true);
    m.open();
    expect(m.items.length).toBeLessThanOrEqual(PAUSE_MAX_ITEMS);
  });
});
