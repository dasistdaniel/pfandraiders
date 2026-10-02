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
    expect(buildInput({ ...NONE, action: true })).toMatchObject({ action: true, buy: null });
  });

  it('passes the steal key through as held', () => {
    expect(buildInput({ ...NONE, steal: true })).toMatchObject({ steal: true, action: false });
    expect(buildInput(NONE)).toMatchObject({ steal: false });
  });

  it('maps the buy keys', () => {
    expect(buildInput({ ...NONE, buyUpgrade: true })).toMatchObject({ buy: 'upgrade' });
    expect(buildInput({ ...NONE, buyItem: true })).toMatchObject({ buy: 'bolt_cutters' });
  });

  it('prefers the upgrade when both buy keys come in the same frame', () => {
    expect(buildInput({ ...NONE, buyUpgrade: true, buyItem: true })).toMatchObject({ buy: 'upgrade' });
  });

  it('maps the treat and food keys', () => {
    expect(buildInput({ ...NONE, buyTreat: true })).toMatchObject({ buy: 'dog_treat' });
    expect(buildInput({ ...NONE, buyFood: true })).toMatchObject({ buy: 'food' });
  });

  it('prefers upgrade, then bolt cutters, then treat, then food when several come in one frame', () => {
    const all = { ...NONE, buyUpgrade: true, buyItem: true, buyTreat: true, buyFood: true };
    expect(buildInput(all)).toMatchObject({ buy: 'upgrade' });
    expect(buildInput({ ...all, buyUpgrade: false })).toMatchObject({ buy: 'bolt_cutters' });
    expect(buildInput({ ...all, buyUpgrade: false, buyItem: false })).toMatchObject({ buy: 'dog_treat' });
  });

  it('lets the treat win over food when both come in one frame', () => {
    expect(buildInput({ ...NONE, buyTreat: true, buyFood: true })).toMatchObject({ buy: 'dog_treat' });
    expect(buildInput({ ...NONE, buyFood: true })).toMatchObject({ buy: 'food' });
  });
});
