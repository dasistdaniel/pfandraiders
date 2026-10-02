import { describe, expect, it } from 'vitest';
import { formatMoney, formatTime } from '../src/format';

describe('formatMoney', () => {
  it('formats cents with comma and euro sign', () => {
    expect(formatMoney(0)).toBe('0,00 €');
    expect(formatMoney(8)).toBe('0,08 €');
    expect(formatMoney(150)).toBe('1,50 €');
    expect(formatMoney(12345)).toBe('123,45 €');
  });
});

describe('formatTime', () => {
  it('formats milliseconds as m:ss rounding up', () => {
    expect(formatTime(600000)).toBe('10:00');
    expect(formatTime(59001)).toBe('1:00');
    expect(formatTime(5000)).toBe('0:05');
    expect(formatTime(0)).toBe('0:00');
  });
});
