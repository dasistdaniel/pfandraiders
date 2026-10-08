import { describe, expect, it } from 'vitest';
import { buildInput } from '../src/input';

const NONE = {
  left: false,
  right: false,
  up: false,
  down: false,
  action: false,
  steal: false,
  buyUpgrade: false,
  buyItem: false,
  buyTreat: false,
  buyFood: false,
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

  it('passes the action through', () => {
    expect(buildInput({ ...NONE, action: true })).toMatchObject({ action: true });
  });

  it('passes the steal key through as held', () => {
    expect(buildInput({ ...NONE, steal: true })).toMatchObject({ steal: true, action: false });
    expect(buildInput(NONE)).toMatchObject({ steal: false });
  });

  it('ignores the former buy keys and sends neither attack nor eat yet', () => {
    const all = { ...NONE, buyUpgrade: true, buyItem: true, buyTreat: true, buyFood: true };
    const out = buildInput(all);
    expect(out).toEqual({ moveX: 0, moveY: 0, action: false, steal: false, attack: false, eat: false });
    expect('buy' in out).toBe(false);
  });
});
