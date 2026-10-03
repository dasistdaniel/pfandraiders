import { describe, expect, it } from 'vitest';
import { RETRO_MAP } from '../src/maps/retro';
import type { ServerMessage, Snapshot } from '../src/protocol';
import {
  MAX_NAME_LENGTH,
  parseClientMessage,
  ROOM_CODE_CHARS,
  ROOM_CODE_LENGTH,
} from '../src/protocol';

describe('parseClientMessage', () => {
  it('accepts create with a trimmed name', () => {
    expect(parseClientMessage({ t: 'create', name: '  Anna  ' })).toEqual({ t: 'create', name: 'Anna' });
  });

  it('rejects names that are empty, too long or not strings', () => {
    expect(parseClientMessage({ t: 'create', name: '   ' })).toBeNull();
    expect(parseClientMessage({ t: 'create', name: 'x'.repeat(MAX_NAME_LENGTH + 1) })).toBeNull();
    expect(parseClientMessage({ t: 'create', name: 5 })).toBeNull();
    expect(parseClientMessage({ t: 'create' })).toBeNull();
  });

  it('removes control characters from names', () => {
    expect(parseClientMessage({ t: 'create', name: 'A\u0000n\nna' })).toEqual({ t: 'create', name: 'Anna' });
  });

  it('accepts join with an uppercase room code and optional token', () => {
    const code = ROOM_CODE_CHARS.slice(0, ROOM_CODE_LENGTH);
    expect(parseClientMessage({ t: 'join', room: code.toLowerCase(), name: 'Bo' })).toEqual({
      t: 'join',
      room: code,
      name: 'Bo',
    });
    expect(parseClientMessage({ t: 'join', room: code, name: 'Bo', token: 'abc' })).toEqual({
      t: 'join',
      room: code,
      name: 'Bo',
      token: 'abc',
    });
  });

  it('rejects bad room codes and bad tokens', () => {
    expect(parseClientMessage({ t: 'join', room: 'AB', name: 'Bo' })).toBeNull();
    expect(parseClientMessage({ t: 'join', room: 'ABCDE', name: 'Bo' })).toBeNull();
    expect(parseClientMessage({ t: 'join', room: 'AB!D', name: 'Bo' })).toBeNull();
    expect(parseClientMessage({ t: 'join', room: 'ABCD', name: 'Bo', token: 5 })).toBeNull();
    expect(parseClientMessage({ t: 'join', room: 'ABCD', name: 'Bo', token: 'x'.repeat(200) })).toBeNull();
  });

  it('accepts start', () => {
    expect(parseClientMessage({ t: 'start' })).toEqual({ t: 'start' });
  });

  it('accepts input and sanitizes its payload', () => {
    expect(parseClientMessage({ t: 'input', seq: 7, input: { moveX: 5, action: true } })).toEqual({
      t: 'input',
      seq: 7,
      input: { moveX: 0, moveY: 0, action: true, steal: false, buy: null },
    });
  });

  it('rejects input with a bad sequence number', () => {
    expect(parseClientMessage({ t: 'input', seq: 'a', input: {} })).toBeNull();
    expect(parseClientMessage({ t: 'input', seq: -1, input: {} })).toBeNull();
    expect(parseClientMessage({ t: 'input', seq: 1.5, input: {} })).toBeNull();
    expect(parseClientMessage({ t: 'input', seq: Number.MAX_SAFE_INTEGER + 10, input: {} })).toBeNull();
  });

  it('rejects unknown types, non-objects and prototype tricks', () => {
    for (const bad of [null, undefined, 5, 'x', [], { t: 'nope' }, { t: 5 }, {}, { t: '__proto__' }]) {
      expect(parseClientMessage(bad)).toBeNull();
    }
  });
});

describe('ServerMessage start', () => {
  it('carries the map id', () => {
    const msg: ServerMessage = { t: 'start', mapId: 'retro', map: RETRO_MAP, you: 'p1', players: [], snap: {} as Snapshot };
    expect(msg.t === 'start' && msg.mapId).toBe('retro');
  });
});
