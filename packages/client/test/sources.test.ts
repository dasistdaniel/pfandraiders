import { describe, expect, it } from 'vitest';
import { guardHeld, isHeldOver, keyboardTabLabels, padBLeaves, padToHeld, PAD_LABELS, PAD_TAB_LABELS, ReleaseGate, STICK_DEADZONE } from '../src/sources';
import type { InputSource, PadSnapshot } from '../src/sources';
import type { KeyState } from '../src/input';

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

  it('maps buttons: A action, B steal, X attack, Y spray; the shoulders only switch shop categories', () => {
    expect(padToHeld({ ...IDLE, a: true })).toMatchObject({ action: true, attack: false, spray: false });
    expect(padToHeld({ ...IDLE, x: true })).toMatchObject({ attack: true, spray: false });
    expect(padToHeld({ ...IDLE, y: true })).toMatchObject({ spray: true, attack: false });
    expect(padToHeld({ ...IDLE, l1: true, r1: true })).toEqual({ ...padToHeld(IDLE), tabPrev: true, tabNext: true });
    expect(padToHeld({ ...IDLE, l1: true })).toMatchObject({ tabPrev: true, tabNext: false, steal: false, attack: false });
    expect(padToHeld({ ...IDLE, r1: true })).toMatchObject({ tabPrev: false, tabNext: true });
    expect(padToHeld({ ...IDLE, b: true, x: true })).toMatchObject({ tabPrev: false, tabNext: false });
  });

  it('labels the pad buttons like padToHeld maps them', () => {
    expect(PAD_LABELS).toEqual({ action: 'A', steal: 'B', attack: 'X', spray: 'Y' });
    expect(PAD_TAB_LABELS).toEqual({ prev: 'LB', next: 'RB' });
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

describe('keyboardTabLabels', () => {
  it('uses the steal key for the previous and the attack key for the next shop category', () => {
    expect(keyboardTabLabels({ action: 'E', steal: 'Q', attack: 'F', spray: 'C' })).toEqual({ prev: 'Q', next: 'F' });
    expect(keyboardTabLabels({ action: 'Enter', steal: '/', attack: '.', spray: ',' })).toEqual({ prev: '/', next: '.' });
  });
});

describe('ReleaseGate and guardHeld', () => {
  const NONE: KeyState = { left: false, right: false, up: false, down: false, action: false, steal: false, attack: false, spray: false, tabPrev: false, tabNext: false };
  const k = (over: Partial<KeyState>): KeyState => ({ ...NONE, ...over });

  it('ignores keys held at the start until they were released once', () => {
    const gate = new ReleaseGate(k({ up: true, action: true }));
    expect(gate.filter(k({ up: true, action: true, left: true }))).toEqual(k({ left: true }));
    expect(gate.blocks('action')).toBe(true);
    expect(gate.filter(k({ action: true }))).toEqual(NONE);
    expect(gate.filter(NONE)).toEqual(NONE);
    expect(gate.blocks('action')).toBe(false);
    expect(gate.filter(k({ up: true, action: true }))).toEqual(k({ up: true, action: true }));
  });

  it('wraps a source: reads through the gate, keeps labels, swallows a held confirm', () => {
    let state = k({ action: true });
    let confirm = true;
    const inner: InputSource = {
      label: 'Tastatur 1 (WASD, E)',
      labels: { action: 'E', steal: 'Q', attack: 'F', spray: 'C' },
      tabLabels: { prev: 'Q', next: 'F' },
      read: () => state,
      confirmPressed: () => confirm,
    };
    const src = guardHeld(inner);
    expect(src.labels).toBe(inner.labels);
    expect(src.tabLabels).toBe(inner.tabLabels);
    expect(src.label).toBe(inner.label);
    expect(src.read()).toEqual(NONE);
    expect(src.confirmPressed()).toBe(false);
    state = NONE;
    confirm = false;
    expect(src.read()).toEqual(NONE);
    state = k({ action: true });
    confirm = true;
    expect(src.read()).toEqual(k({ action: true }));
    expect(src.confirmPressed()).toBe(true);
  });
});

describe('ReleaseGate with held-over flags', () => {
  it('only gates the boolean keys and passes heldOver through', () => {
    const NONE: KeyState = { left: false, right: false, up: false, down: false, action: false, steal: false, attack: false, spray: false, tabPrev: false, tabNext: false };
    const gate = new ReleaseGate({ ...NONE, heldOver: { up: true } });
    expect(gate.filter({ ...NONE, up: true, heldOver: { up: true } })).toEqual({ ...NONE, up: true, heldOver: { up: true } });
  });
});
