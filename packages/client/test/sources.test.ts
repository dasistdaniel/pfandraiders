import { describe, expect, it } from 'vitest';
import { EdgeTracker, padToHeld, STICK_DEADZONE } from '../src/sources';
import type { HeldKeys, PadSnapshot } from '../src/sources';

const IDLE: PadSnapshot = {
  stickX: 0,
  stickY: 0,
  a: false,
  x: false,
  y: false,
  b: false,
  left: false,
  right: false,
  up: false,
  down: false,
  l1: false,
  r1: false,
};

describe('padToHeld', () => {
  it('maps B to the steal key', () => {
    expect(padToHeld({ ...IDLE, b: true })).toMatchObject({ steal: true, action: false });
    expect(padToHeld(IDLE)).toMatchObject({ steal: false });
  });

  it('maps buttons: A action, X upgrade, Y item', () => {
    expect(padToHeld({ ...IDLE, a: true })).toMatchObject({ action: true, buyUpgrade: false, buyItem: false });
    expect(padToHeld({ ...IDLE, x: true })).toMatchObject({ buyUpgrade: true });
    expect(padToHeld({ ...IDLE, y: true })).toMatchObject({ buyItem: true });
  });

  it('maps the shoulder buttons: RB treat, LB food', () => {
    expect(padToHeld({ ...IDLE, r1: true })).toMatchObject({ buyTreat: true, buyFood: false });
    expect(padToHeld({ ...IDLE, l1: true })).toMatchObject({ buyFood: true, buyTreat: false });
  });

  it('maps the d-pad', () => {
    expect(padToHeld({ ...IDLE, left: true })).toMatchObject({ left: true, right: false });
    expect(padToHeld({ ...IDLE, down: true })).toMatchObject({ down: true, up: false });
  });

  it('ignores stick values inside the dead zone', () => {
    const inside = STICK_DEADZONE - 0.01;
    const h = padToHeld({ ...IDLE, stickX: inside, stickY: -inside });
    expect(h).toMatchObject({ left: false, right: false, up: false, down: false });
  });

  it('maps the stick outside the dead zone, including both axes at once', () => {
    const out = STICK_DEADZONE + 0.1;
    expect(padToHeld({ ...IDLE, stickX: -out })).toMatchObject({ left: true, right: false });
    expect(padToHeld({ ...IDLE, stickX: out, stickY: out })).toMatchObject({ right: true, down: true });
    expect(padToHeld({ ...IDLE, stickY: -out })).toMatchObject({ up: true });
  });

  it('combines stick and d-pad', () => {
    expect(padToHeld({ ...IDLE, left: true, stickX: 1 })).toMatchObject({ left: true, right: true });
  });
});

describe('EdgeTracker', () => {
  it('passes the steal key through as held, not as an edge', () => {
    const t = new EdgeTracker();
    expect(t.apply(held({ steal: true })).steal).toBe(true);
    expect(t.apply(held({ steal: true })).steal).toBe(true);
  });

  const held = (over: Partial<HeldKeys>): HeldKeys => ({
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
    ...over,
  });

  it('reports a buy key only on the frame it goes down', () => {
    const t = new EdgeTracker();
    expect(t.apply(held({ buyUpgrade: true })).buyUpgrade).toBe(true);
    expect(t.apply(held({ buyUpgrade: true })).buyUpgrade).toBe(false);
    expect(t.apply(held({})).buyUpgrade).toBe(false);
    expect(t.apply(held({ buyUpgrade: true })).buyUpgrade).toBe(true);
  });

  it('tracks the two buy keys independently', () => {
    const t = new EdgeTracker();
    expect(t.apply(held({ buyUpgrade: true })).buyItem).toBe(false);
    expect(t.apply(held({ buyUpgrade: true, buyItem: true }))).toMatchObject({
      buyUpgrade: false,
      buyItem: true,
    });
  });

  it('reports treat and food only on the frame they go down', () => {
    const t = new EdgeTracker();
    expect(t.apply(held({ buyTreat: true })).buyTreat).toBe(true);
    expect(t.apply(held({ buyTreat: true })).buyTreat).toBe(false);
    expect(t.apply(held({ buyFood: true })).buyFood).toBe(true);
    expect(t.apply(held({ buyFood: true })).buyFood).toBe(false);
  });

  it('passes movement and action through unchanged', () => {
    const t = new EdgeTracker();
    expect(t.apply(held({ left: true, action: true }))).toMatchObject({ left: true, action: true });
  });
});
