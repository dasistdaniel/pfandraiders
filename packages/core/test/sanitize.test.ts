import { describe, expect, it } from 'vitest';
import { sanitizeInput } from '../src/sanitize';
import { NO_INPUT } from '../src/types';

describe('sanitizeInput', () => {
  it('keeps a valid input', () => {
    const i = { moveX: -1, moveY: 1, action: true, steal: true, attack: true, spray: true };
    expect(sanitizeInput(i)).toEqual(i);
  });

  it('has no buy field any more and drops one that is sent', () => {
    const out = sanitizeInput({ ...NO_INPUT, buy: 'upgrade' });
    expect('buy' in out).toBe(false);
    expect(out).toEqual(NO_INPUT);
  });

  it('turns anything that is not an object into no input', () => {
    for (const bad of [null, undefined, 5, 'x', true, []]) {
      expect(sanitizeInput(bad)).toEqual(NO_INPUT);
    }
  });

  it('clamps out-of-range and wrong-typed fields to safe values', () => {
    const out = sanitizeInput({
      moveX: 1000,
      moveY: '1',
      action: 'yes',
      steal: 1,
      attack: 'true',
      spray: 'yes',
    });
    expect(out).toEqual(NO_INPUT);
    expect(sanitizeInput({ moveX: NaN, moveY: Infinity })).toEqual(NO_INPUT);
  });

  it('returns a fresh object and ignores extra fields', () => {
    const raw = { moveX: 1, extra: 'x' };
    const out = sanitizeInput(raw);
    expect(out).not.toBe(raw);
    expect('extra' in out).toBe(false);
  });

  it('has attack and spray off and no eat key in NO_INPUT, and drops a sent eat key', () => {
    expect(NO_INPUT).toEqual({ moveX: 0, moveY: 0, action: false, steal: false, attack: false, spray: false });
    expect('eat' in sanitizeInput({ ...NO_INPUT, eat: true })).toBe(false);
  });
});
