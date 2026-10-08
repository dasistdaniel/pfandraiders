import { describe, expect, it } from 'vitest';
import { buildInput } from '../src/input';
import type { KeyState } from '../src/input';

const NONE: KeyState = {
  left: false,
  right: false,
  up: false,
  down: false,
  action: false,
  steal: false,
  attack: false,
  eat: false,
};

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

  it('passes action, steal, attack and eat through as held keys', () => {
    expect(buildInput({ ...NONE, action: true, steal: true, attack: true, eat: true })).toEqual({
      moveX: 0,
      moveY: 0,
      action: true,
      steal: true,
      attack: true,
      eat: true,
    });
    expect(buildInput(NONE)).toEqual({ moveX: 0, moveY: 0, action: false, steal: false, attack: false, eat: false });
  });
});
