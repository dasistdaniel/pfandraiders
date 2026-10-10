import { describe, expect, it } from 'vitest';
import {
  cleanField,
  DEFAULT_ROUNDS,
  defaultRoomName,
  isRounds,
  isVisibility,
  MAX_LISTED_ROOMS,
  MAX_PASSWORD_LENGTH,
  MAX_ROOM_NAME_LENGTH,
  parseClientMessage,
  ROUNDS_CHOICES,
} from '../src/protocol';
import type { RoomInfo, ServerMessage } from '../src/protocol';

describe('room constants', () => {
  it('has the values of the spec', () => {
    expect(MAX_ROOM_NAME_LENGTH).toBe(24);
    expect(MAX_PASSWORD_LENGTH).toBe(16);
    expect(ROUNDS_CHOICES).toEqual([1, 3, 5, 0]);
    expect(DEFAULT_ROUNDS).toBe(3);
    expect(MAX_LISTED_ROOMS).toBe(50);
  });

  it('knows valid round counts and visibilities', () => {
    for (const r of [1, 3, 5, 0]) expect(isRounds(r)).toBe(true);
    for (const r of [2, 4, -1, 1.5, '3', null]) expect(isRounds(r)).toBe(false);
    expect(isVisibility('public')).toBe(true);
    expect(isVisibility('private')).toBe(true);
    expect(isVisibility('PUBLIC')).toBe(false);
    expect(isVisibility(undefined)).toBe(false);
  });
});

describe('defaultRoomName', () => {
  it('uses the German genitive', () => {
    expect(defaultRoomName('Anna')).toBe('Annas Raum');
    expect(defaultRoomName('Klaus')).toBe("Klaus' Raum");
    expect(defaultRoomName('Max')).toBe("Max' Raum");
    expect(defaultRoomName('Fritz')).toBe("Fritz' Raum");
    expect(defaultRoomName('Strauß')).toBe("Strauß' Raum");
    expect(defaultRoomName('JONAS')).toBe("JONAS' Raum");
  });

  it('stays within the room name limit for the longest player name', () => {
    expect(defaultRoomName('x'.repeat(16)).length).toBeLessThanOrEqual(MAX_ROOM_NAME_LENGTH);
  });
});

describe('cleanField', () => {
  it('removes control and format characters and trims', () => {
    expect(cleanField('  Bude​ 1\n ', 24)).toBe('Bude 1');
    expect(cleanField('‮abc', 24)).toBe('abc');
  });

  it('returns an empty string for blank input and null for non-strings or too long text', () => {
    expect(cleanField('   ', 24)).toBe('');
    expect(cleanField(5, 24)).toBeNull();
    expect(cleanField('x'.repeat(25), 24)).toBeNull();
    expect(cleanField('x'.repeat(24), 24)).toBe('x'.repeat(24));
  });

  it('counts UTF-16 units like player names, so an emoji counts twice', () => {
    expect(cleanField('😀'.repeat(12), 24)).toBe('😀'.repeat(12));
    expect(cleanField('😀'.repeat(13), 24)).toBeNull();
  });
});

describe('parseClientMessage: create', () => {
  it('keeps the old form without new fields', () => {
    expect(parseClientMessage({ t: 'create', name: 'Anna' })).toEqual({ t: 'create', name: 'Anna' });
  });

  it('accepts room name, visibility, password and avatar', () => {
    expect(
      parseClientMessage({ t: 'create', name: 'Anna', roomName: ' Bude ', visibility: 'private', password: ' pw ', avatar: 3 }),
    ).toEqual({ t: 'create', name: 'Anna', roomName: 'Bude', visibility: 'private', password: 'pw', avatar: 3 });
  });

  it('treats an empty room name and an empty password as missing', () => {
    expect(parseClientMessage({ t: 'create', name: 'Anna', roomName: ' ​ ', password: '  ' })).toEqual({ t: 'create', name: 'Anna' });
  });

  it('rejects a too long room name or password and wrong types', () => {
    expect(parseClientMessage({ t: 'create', name: 'Anna', roomName: 'x'.repeat(25) })).toBeNull();
    expect(parseClientMessage({ t: 'create', name: 'Anna', password: 'x'.repeat(17) })).toBeNull();
    expect(parseClientMessage({ t: 'create', name: 'Anna', roomName: 5 })).toBeNull();
    expect(parseClientMessage({ t: 'create', name: 'Anna', password: false })).toBeNull();
    expect(parseClientMessage({ t: 'create', name: 'Anna', visibility: 'secret' })).toBeNull();
  });

  it('accepts exactly 24 and 16 characters', () => {
    const msg = parseClientMessage({ t: 'create', name: 'Anna', roomName: 'r'.repeat(24), password: 'p'.repeat(16) });
    expect(msg).toEqual({ t: 'create', name: 'Anna', roomName: 'r'.repeat(24), password: 'p'.repeat(16) });
  });

  it('drops an invalid avatar wish instead of rejecting the message', () => {
    for (const avatar of [24, -1, 2.5, '3', null]) {
      expect(parseClientMessage({ t: 'create', name: 'Anna', avatar })).toEqual({ t: 'create', name: 'Anna' });
    }
  });
});

describe('parseClientMessage: join', () => {
  it('accepts password and avatar next to the token', () => {
    expect(parseClientMessage({ t: 'join', room: 'abcd', name: 'Bo', token: 't', password: ' pw ', avatar: 0 })).toEqual({
      t: 'join',
      room: 'ABCD',
      name: 'Bo',
      token: 't',
      password: 'pw',
      avatar: 0,
    });
  });

  it('treats an empty password as missing and rejects a too long one', () => {
    expect(parseClientMessage({ t: 'join', room: 'ABCD', name: 'Bo', password: '' })).toEqual({ t: 'join', room: 'ABCD', name: 'Bo' });
    expect(parseClientMessage({ t: 'join', room: 'ABCD', name: 'Bo', password: 'x'.repeat(17) })).toBeNull();
    expect(parseClientMessage({ t: 'join', room: 'ABCD', name: 'Bo', password: 7 })).toBeNull();
  });

  it('drops an invalid avatar wish', () => {
    expect(parseClientMessage({ t: 'join', room: 'ABCD', name: 'Bo', avatar: 40 })).toEqual({ t: 'join', room: 'ABCD', name: 'Bo' });
  });
});

describe('parseClientMessage: new messages', () => {
  it('accepts listRooms and toLobby and drops extra fields', () => {
    expect(parseClientMessage({ t: 'listRooms', junk: 1 })).toEqual({ t: 'listRooms' });
    expect(parseClientMessage({ t: 'toLobby', junk: 1 })).toEqual({ t: 'toLobby' });
  });

  it('accepts setAvatar only with an index from 0 to 23', () => {
    expect(parseClientMessage({ t: 'setAvatar', avatar: 23 })).toEqual({ t: 'setAvatar', avatar: 23 });
    for (const avatar of [24, -1, 1.5, '1', undefined]) expect(parseClientMessage({ t: 'setAvatar', avatar })).toBeNull();
  });

  it('accepts setRounds only with 1, 3, 5 or 0', () => {
    for (const rounds of [1, 3, 5, 0]) expect(parseClientMessage({ t: 'setRounds', rounds })).toEqual({ t: 'setRounds', rounds });
    for (const rounds of [2, 7, -1, '3', undefined]) expect(parseClientMessage({ t: 'setRounds', rounds })).toBeNull();
  });

  it('accepts setMap only with a known map id and drops extra fields', () => {
    expect(parseClientMessage({ t: 'setMap', mapId: 'retro', junk: 1 })).toEqual({ t: 'setMap', mapId: 'retro' });
    expect(parseClientMessage({ t: 'setMap', mapId: 'city' })).toEqual({ t: 'setMap', mapId: 'city' });
    for (const mapId of ['moon', '', 'CITY', ' city', '__proto__', 'constructor', 7, null, undefined, {}]) {
      expect(parseClientMessage({ t: 'setMap', mapId }), String(mapId)).toBeNull();
    }
  });

  it('carries the map in lobby messages and room list entries', () => {
    const lobby: ServerMessage = {
      t: 'lobby', room: 'ABCD', roomName: 'R', visibility: 'public', locked: false, host: 'p1', players: [],
      phase: 'lobby', roundMs: 300_000, rounds: 3, mapId: 'retro', mapName: 'Retro',
    };
    expect(lobby.t === 'lobby' && lobby.mapName).toBe('Retro');
    const info: RoomInfo = { code: 'ABCD', name: 'R', host: 'Anna', players: 1, max: 8, phase: 'lobby', locked: false, mapName: 'Stadt' };
    expect(info.mapName).toBe('Stadt');
  });
});
