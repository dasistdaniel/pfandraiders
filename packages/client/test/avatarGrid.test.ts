import type { RosterEntry } from '@pfandraiders/core';
import { describe, expect, it } from 'vitest';
import { AVATAR_COLUMNS, avatarCells, stepAvatar, takenByOthers } from '../src/avatarGrid';

const r = (id: string, name: string, avatar: number): RosterEntry => ({ id, name, color: 0xffffff, connected: true, ready: false, avatar });

describe('avatarCells', () => {
  it('lists all 24 figures in order and marks own and taken ones', () => {
    const cells = avatarCells([r('p1', 'Anna', 1), r('p2', 'Bob', 14)], 'p2');
    expect(cells).toHaveLength(24);
    expect(cells[0]).toEqual({ index: 0, character: 'm01', taken: false, own: false, takenBy: null });
    expect(cells[1]).toEqual({ index: 1, character: 'm02', taken: true, own: false, takenBy: 'Anna' });
    expect(cells[14]).toEqual({ index: 14, character: 'f03', taken: false, own: true, takenBy: null });
  });

  it('knows the figures taken by the others', () => {
    expect([...takenByOthers([r('p1', 'Anna', 1), r('p2', 'Bob', 14)], 'p2')]).toEqual([1]);
  });
});

describe('stepAvatar', () => {
  it('moves left/right by one and up/down by a row, with wrap-around', () => {
    expect(AVATAR_COLUMNS).toBe(8);
    const none = new Set<number>();
    expect(stepAvatar(0, 'ArrowRight', none)).toBe(1);
    expect(stepAvatar(0, 'ArrowLeft', none)).toBe(23);
    expect(stepAvatar(2, 'ArrowDown', none)).toBe(10);
    expect(stepAvatar(18, 'ArrowDown', none)).toBe(2);
    expect(stepAvatar(2, 'ArrowUp', none)).toBe(18);
  });

  it('skips taken figures', () => {
    expect(stepAvatar(0, 'ArrowRight', new Set([1, 2]))).toBe(3);
    expect(stepAvatar(2, 'ArrowDown', new Set([10]))).toBe(18);
  });

  it('stays when everything else is taken or the key is not an arrow', () => {
    const allButZero = new Set(Array.from({ length: 23 }, (_, i) => i + 1));
    expect(stepAvatar(0, 'ArrowRight', allButZero)).toBe(0);
    expect(stepAvatar(5, 'Enter', new Set())).toBe(5);
  });
});
