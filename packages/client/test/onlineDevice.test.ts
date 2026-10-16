import { describe, expect, it } from 'vitest';
import type { DeviceRef } from '../src/devices';
import { activeOnlineDevice, anyKeyHeld, fallbackNotice, OnlineDeviceTracker } from '../src/onlineDevice';
import type { KeyState } from '../src/input';

const KB1: DeviceRef = { kind: 'keyboard', layout: 0 };
const KB2: DeviceRef = { kind: 'keyboard', layout: 1 };
const PAD1: DeviceRef = { kind: 'pad', index: 0 };
const PAD2: DeviceRef = { kind: 'pad', index: 1 };
const none = (): boolean => false;
const only = (...ids: number[]) => (i: number): boolean => ids.includes(i);

describe('activeOnlineDevice', () => {
  it('uses a chosen keyboard as it is', () => {
    expect(activeOnlineDevice(KB2, none, 0)).toEqual({ device: KB2, fallback: false });
  });

  it('uses a chosen gamepad while it is connected', () => {
    expect(activeOnlineDevice(PAD2, only(1), 0)).toEqual({ device: PAD2, fallback: false });
  });

  it('falls back to the last keyboard layout (Tastatur 1 by default) when the chosen gamepad is missing', () => {
    expect(activeOnlineDevice(PAD1, none, 0)).toEqual({ device: KB1, fallback: true });
    expect(activeOnlineDevice(PAD1, only(1), 1)).toEqual({ device: KB2, fallback: true });
    expect(activeOnlineDevice(PAD1, none, 5)).toEqual({ device: KB1, fallback: true });
  });
});

describe('fallbackNotice', () => {
  it('names the keyboard that takes over', () => {
    expect(fallbackNotice(KB1)).toBe('Gamepad nicht verbunden: Tastatur 1');
    expect(fallbackNotice(KB2)).toBe('Gamepad nicht verbunden: Tastatur 2');
  });
});

describe('anyKeyHeld', () => {
  const NONE: KeyState = { left: false, right: false, up: false, down: false, action: false, steal: false, attack: false, spray: false, tabPrev: false, tabNext: false };
  it('is true for any held game key', () => {
    expect(anyKeyHeld(NONE)).toBe(false);
    expect(anyKeyHeld({ ...NONE, left: true })).toBe(true);
    expect(anyKeyHeld({ ...NONE, spray: true })).toBe(true);
  });
});

describe('OnlineDeviceTracker', () => {
  it('reports the first device without a notice, a missing gamepad with the fallback notice', () => {
    expect(new OnlineDeviceTracker(KB1, 0).update(none)).toEqual({ device: KB1, notice: '' });
    const t = new OnlineDeviceTracker(PAD1, 0);
    expect(t.update(none)).toEqual({ device: KB1, notice: 'Gamepad nicht verbunden: Tastatur 1' });
    expect(t.fallback).toBe(true);
    expect(t.update(none)).toBeNull();
  });

  it('goes back to the gamepad once it reports connected (browsers show pads only after a button press)', () => {
    const t = new OnlineDeviceTracker(PAD1, 0);
    t.update(none);
    expect(t.update(only(0))).toEqual({ device: PAD1, notice: 'Steuerung: Gamepad 1' });
    expect(t.fallback).toBe(false);
    expect(t.update(only(0))).toBeNull();
    // mitten im Spiel abgezogen: wieder Rückfall mit Hinweis
    expect(t.update(none)).toEqual({ device: KB1, notice: 'Gamepad nicht verbunden: Tastatur 1' });
  });

  it('switches to a newly chosen device and keeps the chosen one apart from the active one', () => {
    const t = new OnlineDeviceTracker(KB1, 0);
    t.update(none);
    t.choose(PAD2);
    expect(t.chosen).toEqual(PAD2);
    expect(t.update(only(1))).toEqual({ device: PAD2, notice: 'Steuerung: Gamepad 2' });
    t.choose(PAD1);
    expect(t.update(only(1))).toEqual({ device: KB1, notice: 'Gamepad nicht verbunden: Tastatur 1' });
    expect(t.active).toEqual(KB1);
    expect(t.chosen).toEqual(PAD1);
  });

  it('a chosen keyboard becomes the fallback layout', () => {
    const t = new OnlineDeviceTracker(KB2, 0);
    t.update(none);
    t.choose(PAD1);
    expect(t.update(none)?.device).toEqual(KB2);
  });

  it('keeping the fallback (a real key press) makes the keyboard the chosen device without a new switch', () => {
    const t = new OnlineDeviceTracker(PAD1, 0);
    t.update(none);
    expect(t.keepFallback()).toEqual(KB1);
    expect(t.chosen).toEqual(KB1);
    expect(t.fallback).toBe(false);
    expect(t.update(only(0))).toBeNull();
    expect(new OnlineDeviceTracker(KB1, 0).keepFallback()).toBeNull();
  });
});

describe('anyKeyHeld with held-over flags', () => {
  it('ignores the heldOver object itself', () => {
    const NONE: KeyState = { left: false, right: false, up: false, down: false, action: false, steal: false, attack: false, spray: false, tabPrev: false, tabNext: false };
    expect(anyKeyHeld({ ...NONE, heldOver: {} })).toBe(false);
  });
});
