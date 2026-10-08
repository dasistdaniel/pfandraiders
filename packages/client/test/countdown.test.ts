import { CITY_MAP, CONFIG, createGame } from '@pfandraiders/core';
import { describe, expect, it } from 'vitest';
import { CountdownDisplay, countdownLeft, GO_SHOW_MS, GO_TEXT, musicModeFor } from '../src/countdown';

describe('countdownLeft', () => {
  it('reads the countdown and treats missing or broken values as over', () => {
    const s = createGame(1, CITY_MAP, ['a']);
    expect(countdownLeft(s)).toBe(CONFIG.countdownMs);
    s.countdownMs = 0;
    expect(countdownLeft(s)).toBe(0);
    s.countdownMs = Number.NaN;
    expect(countdownLeft(s)).toBe(0);
    s.countdownMs = -5;
    expect(countdownLeft(s)).toBe(0);
    // älterer Server ohne das Feld
    delete (s as { countdownMs?: number }).countdownMs;
    expect(countdownLeft(s)).toBe(0);
  });
});

describe('CountdownDisplay', () => {
  it('shows the whole seconds 5, 4, 3, 2, 1', () => {
    const d = new CountdownDisplay();
    expect(d.update(5000, 16)).toBe('5');
    expect(d.update(4001, 16)).toBe('5');
    expect(d.update(4000, 16)).toBe('4');
    expect(d.update(1500, 16)).toBe('2');
    expect(d.update(1, 16)).toBe('1');
  });

  it('shows LOS! for GO_SHOW_MS after the countdown reached zero, then nothing', () => {
    const d = new CountdownDisplay();
    d.update(20, 16);
    expect(d.update(0, 16)).toBe(GO_TEXT);
    expect(d.update(0, GO_SHOW_MS - 100)).toBe(GO_TEXT);
    expect(d.update(0, 99)).toBe(GO_TEXT);
    expect(d.update(0, 1)).toBe('');
    expect(d.update(0, 16)).toBe('');
  });

  it('stands still while no time passes (local pause)', () => {
    const d = new CountdownDisplay();
    d.update(10, 16);
    d.update(0, 16);
    for (let i = 0; i < 100; i++) expect(d.update(0, 0)).toBe(GO_TEXT);
  });

  it('shows no LOS! without a countdown (reconnect into a running round)', () => {
    const d = new CountdownDisplay();
    expect(d.update(0, 16)).toBe('');
    expect(d.update(undefined, 16)).toBe('');
  });

  it('hides everything after the round ended', () => {
    const d = new CountdownDisplay();
    d.update(10, 16);
    expect(d.update(0, 16, 'ended')).toBe('');
  });
});

describe('musicModeFor', () => {
  it('keeps the current music during the countdown and starts the game music with LOS!', () => {
    const s = createGame(1, CITY_MAP, ['a']);
    expect(musicModeFor(s, false)).toBeNull();
    s.countdownMs = 0;
    expect(musicModeFor(s, false)).toBe('game');
  });

  it('is calm after the round and in the local pause, also during the countdown', () => {
    const s = createGame(1, CITY_MAP, ['a']);
    expect(musicModeFor(s, true)).toBe('ended');
    s.countdownMs = 0;
    s.phase = 'ended';
    expect(musicModeFor(s, false)).toBe('ended');
  });
});
