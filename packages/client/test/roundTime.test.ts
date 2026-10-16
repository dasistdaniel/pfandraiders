import { DEFAULT_ROUND_MS } from '@pfandraiders/core';
import { describe, expect, it } from 'vitest';
import { fixedRoundText, localRoundLine, roundMsLabel, roundsLabel, stepRoundMs } from '../src/roundTime';

describe('roundMsLabel', () => {
  it('shows whole minutes and other values in seconds', () => {
    expect(roundMsLabel(180_000)).toBe('3 min');
    expect(roundMsLabel(600_000)).toBe('10 min');
    expect(roundMsLabel(20_000)).toBe('20 s');
  });
});

describe('stepRoundMs', () => {
  it('walks through 3, 5, 7, 10 minutes without wrapping', () => {
    expect(stepRoundMs(300_000, 1)).toBe(420_000);
    expect(stepRoundMs(420_000, 1)).toBe(600_000);
    expect(stepRoundMs(600_000, 1)).toBe(600_000);
    expect(stepRoundMs(300_000, -1)).toBe(180_000);
    expect(stepRoundMs(180_000, -1)).toBe(180_000);
  });

  it('starts from the default for an unknown value', () => {
    expect(stepRoundMs(12_345, 1)).toBe(420_000);
    expect(stepRoundMs(Number.NaN, -1)).toBe(180_000);
    expect(DEFAULT_ROUND_MS).toBe(300_000);
  });
});

describe('roundsLabel', () => {
  it('names the round count in German', () => {
    expect(roundsLabel(0)).toBe('offen');
    expect(roundsLabel(1)).toBe('1 Runde');
    expect(roundsLabel(3)).toBe('3 Runden');
    expect(roundsLabel(5)).toBe('5 Runden');
  });
});

describe('localRoundLine', () => {
  it('names the round time and its own keys (left/right belongs to the figure choice)', () => {
    expect(localRoundLine(300_000)).toBe('Rundenzeit: − 5 min +  (Tasten - / +, Gamepad LB / RB)');
  });
});

describe('fixedRoundText', () => {
  it('is null for the choices of the select', () => {
    for (const ms of [180_000, 300_000, 420_000, 600_000]) expect(fixedRoundText(ms)).toBeNull();
  });

  it('shows a server-set round time (ROUND_MS outside the choices) as a read-only line', () => {
    expect(fixedRoundText(120_000)).toBe('Rundenzeit: 2 min (vom Server festgelegt)');
    expect(fixedRoundText(90_000)).toBe('Rundenzeit: 90 s (vom Server festgelegt)');
    expect(fixedRoundText(20_000)).toBe('Rundenzeit: 20 s (vom Server festgelegt)');
  });
});
