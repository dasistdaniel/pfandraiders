import type { RoomInfo } from '@pfandraiders/core';
import { describe, expect, it } from 'vitest';
import {
  EMPTY_ROOM_LIST_TEXT,
  firstSelectable,
  isJoinable,
  listAction,
  moveSelection,
  parseRoomList,
  refreshAllowed,
  ROOM_LIST_HEADER,
  roomRows,
} from '../src/roomList';

const info = (over: Partial<RoomInfo> = {}): RoomInfo => ({
  code: 'ABCD',
  name: 'Bude',
  host: 'Anna',
  players: 2,
  max: 8,
  phase: 'lobby',
  locked: false,
  mapName: 'Stadt',
  ...over,
});

describe('parseRoomList', () => {
  it('accepts a valid list', () => {
    expect(parseRoomList([info(), info({ code: 'EFGH', phase: 'playing', locked: true })])).toEqual([
      info(),
      info({ code: 'EFGH', phase: 'playing', locked: true }),
    ]);
  });

  it('rejects non-arrays and skips broken entries', () => {
    expect(parseRoomList(null)).toBeNull();
    expect(parseRoomList({ rooms: [] })).toBeNull();
    const broken = [
      info({ code: 'ab' }),
      info({ code: 'IIII' }),
      info({ name: 'x'.repeat(25) }),
      info({ host: 5 as unknown as string }),
      info({ players: -1 }),
      info({ players: 9, max: 8 }),
      info({ max: 0 }),
      info({ phase: 'final' as unknown as RoomInfo['phase'] }),
      info({ locked: 'ja' as unknown as boolean }),
      'Raum',
      null,
    ];
    expect(parseRoomList([...broken, info({ code: 'WXYZ' })])).toEqual([info({ code: 'WXYZ' })]);
  });

  it('keeps at most 50 entries', () => {
    expect(parseRoomList(Array.from({ length: 60 }, () => info()))).toHaveLength(50);
  });

  it('keeps entries without or with a broken map name and leaves the name empty', () => {
    const old: Record<string, unknown> = { ...info() };
    delete old.mapName;
    const parsed = parseRoomList([old, info({ code: 'EFGH', mapName: 'x'.repeat(25) }), { ...info({ code: 'JKLM' }), mapName: 7 }]);
    expect(parsed?.map((r) => r.mapName)).toEqual(['', '', '']);
    expect(parseRoomList([info({ mapName: ' Übung ' })])?.[0].mapName).toBe('Übung');
  });
});

describe('rows', () => {
  it('has the header and empty text of the spec', () => {
    expect(ROOM_LIST_HEADER).toEqual(['Raumname', 'Host', 'Spieler', 'Status']);
    expect(EMPTY_ROOM_LIST_TEXT).toBe('Keine öffentlichen Räume');
  });

  it('marks only lobbies with free seats as joinable', () => {
    expect(isJoinable(info())).toBe(true);
    expect(isJoinable(info({ players: 8 }))).toBe(false);
    expect(isJoinable(info({ phase: 'playing' }))).toBe(false);
    expect(isJoinable(info({ phase: 'shop' }))).toBe(false);
  });

  it('builds rows with player count and status text', () => {
    expect(roomRows([info({ locked: true }), info({ code: 'EFGH', players: 8 }), info({ code: 'JKLM', phase: 'shop' })])).toEqual([
      { code: 'ABCD', name: 'Bude', host: 'Anna', players: '2/8', status: 'Lobby', joinable: true, locked: true },
      { code: 'EFGH', name: 'Bude', host: 'Anna', players: '8/8', status: 'Voll', joinable: false, locked: false },
      { code: 'JKLM', name: 'Bude', host: 'Anna', players: '2/8', status: 'Läuft', joinable: false, locked: false },
    ]);
  });
});

describe('selection', () => {
  const rows = roomRows([info({ phase: 'playing' }), info({ code: 'EFGH' }), info({ code: 'JKLM', players: 8 }), info({ code: 'NPQR' })]);

  it('starts at the first joinable row, -1 without any', () => {
    expect(firstSelectable(rows)).toBe(1);
    expect(firstSelectable(roomRows([info({ phase: 'shop' })]))).toBe(-1);
    expect(firstSelectable([])).toBe(-1);
  });

  it('moves to the next joinable row and stays at the ends', () => {
    expect(moveSelection(rows, 1, 1)).toBe(3);
    expect(moveSelection(rows, 3, 1)).toBe(3);
    expect(moveSelection(rows, 3, -1)).toBe(1);
    expect(moveSelection(rows, 1, -1)).toBe(1);
    expect(moveSelection(rows, -1, 1)).toBe(1);
    expect(moveSelection([], -1, 1)).toBe(-1);
  });
});

describe('listAction', () => {
  it('joins open rooms directly, asks for the password of locked ones and ignores grey rows', () => {
    const [open, locked, full] = roomRows([info(), info({ code: 'EFGH', name: 'Geheim', locked: true }), info({ code: 'JKLM', players: 8 })]);
    expect(listAction(open)).toEqual({ kind: 'join', code: 'ABCD' });
    expect(listAction(locked)).toEqual({ kind: 'password', code: 'EFGH', name: 'Geheim' });
    expect(listAction(full)).toBeNull();
    expect(listAction(undefined)).toBeNull();
  });
});

describe('refreshAllowed', () => {
  it('allows one refresh per second', () => {
    expect(refreshAllowed(-Infinity, 0)).toBe(true);
    expect(refreshAllowed(1000, 1999)).toBe(false);
    expect(refreshAllowed(1000, 2000)).toBe(true);
  });
});
