import { describe, expect, it } from 'vitest';
import { isHeldOver, padBLeaves, padToHeld, PAD_LABELS, STICK_DEADZONE } from '../src/sources';
import type { PadSnapshot } from '../src/sources';

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

  it('maps buttons: A action, B steal, X attack, Y eat, shoulders do nothing', () => {
    expect(padToHeld({ ...IDLE, a: true })).toMatchObject({ action: true, attack: false, eat: false });
    expect(padToHeld({ ...IDLE, x: true })).toMatchObject({ attack: true, eat: false });
    expect(padToHeld({ ...IDLE, y: true })).toMatchObject({ eat: true, attack: false });
    expect(padToHeld({ ...IDLE, l1: true, r1: true })).toEqual(padToHeld(IDLE));
  });

  it('labels the pad buttons like padToHeld maps them', () => {
    expect(PAD_LABELS).toEqual({ action: 'A', steal: 'B', attack: 'X', eat: 'Y' });
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

describe('padBLeaves', () => {
  const pressed = (...i: number[]): Set<number> => new Set(i);

  it('locally every gamepad B counts', () => {
    expect(padBLeaves(false, undefined, pressed(2))).toBe(true);
    expect(padBLeaves(false, { kind: 'keyboard', layout: 0 }, pressed(0))).toBe(true);
    expect(padBLeaves(false, undefined, pressed())).toBe(false);
  });

  it('online only the B of the chosen gamepad counts', () => {
    expect(padBLeaves(true, { kind: 'pad', index: 1 }, pressed(1))).toBe(true);
    expect(padBLeaves(true, { kind: 'pad', index: 1 }, pressed(0, 2))).toBe(false);
    expect(padBLeaves(true, { kind: 'keyboard', layout: 0 }, pressed(0))).toBe(false);
    expect(padBLeaves(true, undefined, pressed(0))).toBe(false);
  });
});

describe('isHeldOver', () => {
  it('counts only a repeated keydown as held over from the previous scene', () => {
    expect(isHeldOver({ repeat: true })).toBe(true);
    expect(isHeldOver({ repeat: false })).toBe(false);
    expect(isHeldOver({})).toBe(false);
    expect(isHeldOver(undefined)).toBe(false);
  });
});
