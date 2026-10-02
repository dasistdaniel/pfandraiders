import { describe, expect, it } from 'vitest';
import { sanitizeInput } from '../src/sanitize';
import { NO_INPUT } from '../src/types';

describe('sanitizeInput', () => {
  it('keeps a valid input', () => {
    const i = { moveX: -1, moveY: 1, action: true, steal: true, buy: 'food' };
    expect(sanitizeInput(i)).toEqual(i);
  });

  it('accepts every buy command and null', () => {
    for (const buy of ['upgrade', 'food', 'bolt_cutters', 'dog_treat']) {
      expect(sanitizeInput({ ...NO_INPUT, buy }).buy).toBe(buy);
    }
    expect(sanitizeInput({ ...NO_INPUT, buy: null }).buy).toBeNull();
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
      buy: 'nonsense',
    });
    expect(out).toEqual(NO_INPUT);
    expect(sanitizeInput({ moveX: NaN, moveY: Infinity })).toEqual(NO_INPUT);
    expect(sanitizeInput({ buy: '__proto__' }).buy).toBeNull();
    expect(sanitizeInput({ buy: 'constructor' }).buy).toBeNull();
  });

  it('returns a fresh object and ignores extra fields', () => {
    const raw = { moveX: 1, extra: 'x' };
    const out = sanitizeInput(raw);
    expect(out).not.toBe(raw);
    expect('extra' in out).toBe(false);
  });
});
