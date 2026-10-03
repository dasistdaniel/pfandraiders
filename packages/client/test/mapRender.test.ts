import { describe, expect, it } from 'vitest';
import { cellRect, visualsComplete } from '../src/mapRender';

describe('cellRect', () => {
  it('maps gids to sheet cells', () => {
    expect(cellRect(0)).toBeNull();
    expect(cellRect(1)).toEqual({ col: 0, row: 0 });
    expect(cellRect(37)).toEqual({ col: 36, row: 0 });
    expect(cellRect(38)).toEqual({ col: 0, row: 1 });
    expect(cellRect(1036)).toEqual({ col: 36, row: 27 });
  });
  it('rejects out of range and invalid gids', () => {
    expect(cellRect(1037)).toBeNull();
    expect(cellRect(-1)).toBeNull();
    expect(cellRect(NaN)).toBeNull();
    expect(cellRect(Infinity)).toBeNull();
    expect(cellRect(1.5)).toBeNull();
  });
});

describe('visualsComplete', () => {
  const ok = { cols: 2, rows: 2, ground: [1, 2, 3, 4], below: [0, 0, 0, 0], above: [0, 0, 0, 0] };
  it('accepts three layers of the full size', () => {
    expect(visualsComplete(ok)).toBe(true);
  });
  it('rejects null and wrongly sized layers', () => {
    expect(visualsComplete(null)).toBe(false);
    expect(visualsComplete({ ...ok, above: [0, 0, 0] })).toBe(false);
    expect(visualsComplete({ ...ok, ground: [] })).toBe(false);
    expect(visualsComplete({ ...ok, cols: 0 })).toBe(false);
  });
});
