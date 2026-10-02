import { describe, expect, it } from 'vitest';
import { buildInput } from '../src/input';

const NONE = { left: false, right: false, up: false, down: false, action: false, buy: false };

describe('buildInput', () => {
  it('maps directions to axes', () => {
    expect(buildInput({ ...NONE, left: true })).toMatchObject({ moveX: -1, moveY: 0 });
    expect(buildInput({ ...NONE, right: true, down: true })).toMatchObject({ moveX: 1, moveY: 1 });
    expect(buildInput({ ...NONE, up: true })).toMatchObject({ moveX: 0, moveY: -1 });
  });

  it('cancels opposite keys', () => {
    expect(buildInput({ ...NONE, left: true, right: true })).toMatchObject({ moveX: 0 });
    expect(buildInput({ ...NONE, up: true, down: true })).toMatchObject({ moveY: 0 });
  });

  it('passes action and buy through', () => {
    expect(buildInput({ ...NONE, action: true })).toMatchObject({ action: true, buy: null });
    expect(buildInput({ ...NONE, buy: true })).toMatchObject({ action: false, buy: 'upgrade' });
  });
});
