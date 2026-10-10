import { describe, expect, it } from 'vitest';
import { DEFAULT_MAP_ID, MAP_LIST } from '@pfandraiders/core';
import { mapIdWarning, parseGraceMs, parseMapId, parseRoundMs, SERVER_CONFIG } from '../src/config';

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

describe('parseRoundMs', () => {
  it('treats missing, empty and blank values as unset without a warning', () => {
    for (const raw of [undefined, '', '   ']) expect(parseRoundMs(raw)).toEqual({ value: undefined, invalid: false });
  });
  it('accepts values from 1000 ms', () => {
    expect(parseRoundMs('1000')).toEqual({ value: 1000, invalid: false });
    expect(parseRoundMs(' 60000 ')).toEqual({ value: 60_000, invalid: false });
  });
  it('flags invalid values', () => {
    for (const raw of ['999', 'abc', '-5', 'Infinity']) expect(parseRoundMs(raw)).toEqual({ value: undefined, invalid: true });
  });
});

describe('parseMapId', () => {
  it('treats missing, empty and blank values as the default without a warning', () => {
    for (const raw of [undefined, '', '  ']) expect(parseMapId(raw)).toEqual({ value: DEFAULT_MAP_ID, invalid: false });
  });
  it('accepts known maps', () => {
    expect(parseMapId('retro')).toEqual({ value: 'retro', invalid: false });
    expect(parseMapId(' city ')).toEqual({ value: 'city', invalid: false });
  });
  it('flags unknown maps', () => {
    expect(parseMapId('moon')).toEqual({ value: DEFAULT_MAP_ID, invalid: true });
  });

  it('flags unknown maps and names the known ones in the warning', () => {
    expect(parseMapId(' moon ')).toEqual({ value: DEFAULT_MAP_ID, invalid: true });
    const known = MAP_LIST.map((m) => m.id).join(', ');
    expect(mapIdWarning(' moon ')).toBe(`MAP_ID=moon ist ungültig (bekannt: ${known}), Standardwert city wird genutzt.`);
    expect(mapIdWarning('moon')).toContain('city, retro');
  });
});
