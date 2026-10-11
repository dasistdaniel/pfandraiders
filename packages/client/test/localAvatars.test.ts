import { AVATAR_COUNT, AVATAR_DEFAULT_ORDER } from '@pfandraiders/core';
import { describe, expect, it } from 'vitest';
import { deviceShort, figureKeysHint, joinAvatar, stepSlotAvatar, takenBySlots } from '../src/localAvatars';

const s = (avatar?: number) => ({ avatar });

describe('takenBySlots', () => {
  it('collects the figures of all slots, optionally without one slot', () => {
    expect([...takenBySlots([s(3), s(7), s(1)])].sort()).toEqual([1, 3, 7]);
    expect([...takenBySlots([s(3), s(7), s(1)], 1)].sort()).toEqual([1, 3]);
  });

  it('ignores slots without a valid figure', () => {
    expect([...takenBySlots([s(undefined), s(2), s(99)])]).toEqual([2]);
  });
});

describe('joinAvatar', () => {
  it('first player gets the stored wish when it is free', () => {
    expect(joinAvatar([], 17)).toBe(17);
  });

  it('without wish, a joining player gets the first free figure of the default order', () => {
    expect(joinAvatar([])).toBe(AVATAR_DEFAULT_ORDER[0]);
    expect(joinAvatar([s(AVATAR_DEFAULT_ORDER[0])])).toBe(AVATAR_DEFAULT_ORDER[1]);
    expect(joinAvatar([s(AVATAR_DEFAULT_ORDER[0]), s(AVATAR_DEFAULT_ORDER[1])])).toBe(AVATAR_DEFAULT_ORDER[2]);
  });

  it('a taken or invalid wish falls back to the first free figure', () => {
    expect(joinAvatar([s(5)], 5)).toBe(AVATAR_DEFAULT_ORDER[0]);
    expect(joinAvatar([], 24)).toBe(AVATAR_DEFAULT_ORDER[0]);
    expect(joinAvatar([s(AVATAR_DEFAULT_ORDER[0])], undefined)).toBe(AVATAR_DEFAULT_ORDER[1]);
  });

  it('four players joining in a row get four different figures', () => {
    const slots: { avatar?: number }[] = [];
    for (let i = 0; i < 4; i++) slots.push(s(joinAvatar(slots, i === 0 ? 1 : undefined)));
    expect(new Set(slots.map((x) => x.avatar)).size).toBe(4);
  });
});

describe('stepSlotAvatar', () => {
  it('steps right and left by one with wrap-around', () => {
    expect(stepSlotAvatar([s(0)], 0, 1)).toBe(1);
    expect(stepSlotAvatar([s(0)], 0, -1)).toBe(AVATAR_COUNT - 1);
  });

  it('skips figures of other local players but not its own', () => {
    expect(stepSlotAvatar([s(0), s(1), s(2)], 0, 1)).toBe(3);
    expect(stepSlotAvatar([s(5), s(4)], 0, -1)).toBe(3);
  });

  it('keeps the figure for a missing slot or invalid current figure', () => {
    expect(stepSlotAvatar([s(4)], 3, 1)).toBeUndefined();
    expect(stepSlotAvatar([s(undefined)], 0, 1)).toBeUndefined();
  });
});

describe('device labels', () => {
  it('short device names for the lobby panels', () => {
    expect(deviceShort({ kind: 'keyboard', layout: 0 })).toBe('Tastatur 1');
    expect(deviceShort({ kind: 'keyboard', layout: 1 })).toBe('Tastatur 2');
    expect(deviceShort({ kind: 'pad', index: 2 })).toBe('Gamepad 3');
  });

  it('names the left/right keys of the own device', () => {
    expect(figureKeysHint({ kind: 'keyboard', layout: 0 })).toBe('A / D');
    expect(figureKeysHint({ kind: 'keyboard', layout: 1 })).toBe('← / →');
    expect(figureKeysHint({ kind: 'pad', index: 0 })).toBe('Stick / Kreuz');
  });
});
