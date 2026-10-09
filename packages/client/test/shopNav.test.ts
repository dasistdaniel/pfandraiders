import { describe, expect, it } from 'vitest';
import type { KeyState } from '../src/input';
import { NAV_REPEAT_DELAY_MS, NAV_REPEAT_EVERY_MS, ShopNav } from '../src/shopNav';

const NONE: KeyState = { left: false, right: false, up: false, down: false, action: false, steal: false, attack: false };
const k = (over: Partial<KeyState>): KeyState => ({ ...NONE, ...over });

describe('ShopNav', () => {
  it('ignores keys that are already held on the first frame', () => {
    const nav = new ShopNav();
    expect(nav.update(k({ action: true, down: true }), 16)).toEqual([]);
    expect(nav.update(k({ action: true, down: true }), 16)).toEqual([]);
    expect(nav.update(k({}), 16)).toEqual([]);
    expect(nav.update(k({ action: true }), 16)).toEqual(['confirm']);
  });

  it('gives one command per new press', () => {
    const nav = new ShopNav();
    nav.update(NONE, 16);
    expect(nav.update(k({ up: true }), 16)).toEqual(['up']);
    expect(nav.update(k({ up: true }), 16)).toEqual([]);
    expect(nav.update(k({ right: true }), 16)).toEqual(['right']);
    expect(nav.update(k({ action: true }), 16)).toEqual(['confirm']);
    expect(nav.update(k({ action: true }), 16)).toEqual([]);
  });

  it('repeats a held direction after the delay at a fixed rate', () => {
    const nav = new ShopNav();
    nav.update(NONE, 16);
    expect(nav.update(k({ right: true }), 16)).toEqual(['right']);
    expect(nav.update(k({ right: true }), NAV_REPEAT_DELAY_MS - 1)).toEqual([]);
    expect(nav.update(k({ right: true }), 1)).toEqual(['right']);
    expect(nav.update(k({ right: true }), NAV_REPEAT_EVERY_MS * 3)).toEqual(['right', 'right', 'right']);
  });

  it('prefers up, down, left, right in this order when several are held', () => {
    const nav = new ShopNav();
    nav.update(NONE, 16);
    expect(nav.update(k({ left: true, down: true }), 16)).toEqual(['down']);
  });

  it('never uses steal or attack', () => {
    const nav = new ShopNav();
    nav.update(NONE, 16);
    expect(nav.update(k({ steal: true, attack: true }), 16)).toEqual([]);
  });
});
