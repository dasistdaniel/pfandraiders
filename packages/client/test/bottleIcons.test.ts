import { describe, expect, it } from 'vitest';
import { BOTTLE_ICON, BOTTLE_ICON_COLORS, bottleIcons, bottleIconsKey } from '../src/bottleIcons';

describe('bottleIcons', () => {
  it('lays out one icon per slot, occupied first in deposit order, then free', () => {
    const icons = bottleIcons({ plastic: 1, glass: 1, crate: 1 }, 5);
    expect(icons.map((i) => i.kind)).toEqual(['crate', 'glass', 'plastic', null, null]);
    const step = BOTTLE_ICON.w + BOTTLE_ICON.gap;
    expect(icons.map((i) => i.x)).toEqual([0, step, 2 * step, 3 * step, 4 * step]);
    expect(icons.every((i) => i.y === 0)).toBe(true);
  });

  it('wraps after 16 slots, so 31 slots need two rows', () => {
    const icons = bottleIcons({ plastic: 20, glass: 0, crate: 0 }, 31);
    expect(icons).toHaveLength(31);
    expect(icons[15]).toMatchObject({ x: 15 * (BOTTLE_ICON.w + BOTTLE_ICON.gap), y: 0, kind: 'plastic' });
    expect(icons[16]).toMatchObject({ x: 0, y: BOTTLE_ICON.h + BOTTLE_ICON.gap, kind: 'plastic' });
    expect(icons[30]).toMatchObject({ y: BOTTLE_ICON.h + BOTTLE_ICON.gap, kind: null });
    expect(Math.max(...icons.map((i) => i.x)) + BOTTLE_ICON.w).toBeLessThanOrEqual(160);
  });

  it('shows the three hand slots grey when empty and never more bottles than slots', () => {
    expect(bottleIcons({ plastic: 0, glass: 0, crate: 0 }, 3).map((i) => i.kind)).toEqual([null, null, null]);
    expect(bottleIcons({ plastic: 5, glass: 0, crate: 0 }, 3).map((i) => i.kind)).toEqual(['plastic', 'plastic', 'plastic']);
    expect(bottleIcons({ plastic: 0, glass: 0, crate: 0 }, 0)).toEqual([]);
  });

  it('takes the row width as a parameter', () => {
    expect(bottleIcons({ plastic: 0, glass: 0, crate: 0 }, 5, 2)[2]).toMatchObject({ x: 0, y: BOTTLE_ICON.h + BOTTLE_ICON.gap });
  });

  it('has a key that changes with contents and capacity', () => {
    const a = bottleIconsKey({ plastic: 1, glass: 0, crate: 0 }, 3);
    expect(bottleIconsKey({ plastic: 1, glass: 0, crate: 0 }, 3)).toBe(a);
    expect(bottleIconsKey({ plastic: 0, glass: 1, crate: 0 }, 3)).not.toBe(a);
    expect(bottleIconsKey({ plastic: 1, glass: 0, crate: 0 }, 13)).not.toBe(a);
  });

  it('colours plastic blue, glass green, crates brown and free slots grey', () => {
    expect(BOTTLE_ICON_COLORS).toEqual({ plastic: 0x42a5f5, glass: 0x66bb6a, crate: 0x8d6e63, free: 0x616161 });
  });
});
