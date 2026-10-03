import { describe, expect, it } from 'vitest';
import { parseGraceMs, SERVER_CONFIG } from '../src/config';

describe('parseGraceMs', () => {
  const fb = SERVER_CONFIG.graceMs;
  it('defaults to two minutes', () => expect(fb).toBe(120_000));
  it('falls back for missing or empty input', () => {
    expect(parseGraceMs(undefined, fb)).toBe(fb);
    expect(parseGraceMs('', fb)).toBe(fb);
    expect(parseGraceMs('   ', fb)).toBe(fb);
  });
  it('falls back for non-numbers and negatives', () => {
    for (const raw of ['abc', 'NaN', '-1', 'Infinity', '5000.5']) expect(parseGraceMs(raw, fb)).toBe(fb);
  });
  it('falls back below the 5000 minimum, including 1e3', () => {
    expect(parseGraceMs('4999', fb)).toBe(fb);
    expect(parseGraceMs('1e3', fb)).toBe(fb);
  });
  it('falls back above one hour', () => {
    expect(parseGraceMs('3600001', fb)).toBe(fb);
    expect(parseGraceMs('3600000', fb)).toBe(3_600_000);
  });
  it('accepts valid values and trims whitespace', () => {
    expect(parseGraceMs('5000', fb)).toBe(5000);
    expect(parseGraceMs('180000', fb)).toBe(180_000);
    expect(parseGraceMs('  7000 ', fb)).toBe(7000);
  });
});
