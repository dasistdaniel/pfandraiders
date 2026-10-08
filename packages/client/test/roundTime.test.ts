import { DEFAULT_ROUND_MS } from '@pfandraiders/core';
import { describe, expect, it } from 'vitest';
import { roundMsLabel, stepRoundMs } from '../src/roundTime';

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
