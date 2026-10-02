import { describe, expect, it } from 'vitest';
import { buildInput } from '../src/input';

const NONE = {
  left: false,
  right: false,
  up: false,
  down: false,
  action: false,
  buyUpgrade: false,
  buyItem: false,
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
    expect(buildInput({ ...NONE, action: true })).toMatchObject({ action: true, buy: null });
  });

  it('maps the buy keys', () => {
    expect(buildInput({ ...NONE, buyUpgrade: true })).toMatchObject({ buy: 'upgrade' });
    expect(buildInput({ ...NONE, buyItem: true })).toMatchObject({ buy: 'bolt_cutters' });
  });

  it('prefers the upgrade when both buy keys come in the same frame', () => {
    expect(buildInput({ ...NONE, buyUpgrade: true, buyItem: true })).toMatchObject({ buy: 'upgrade' });
  });
});
