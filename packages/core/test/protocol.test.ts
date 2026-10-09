import { describe, expect, it } from 'vitest';
import { RETRO_MAP } from '../src/maps/retro';
import type { ServerMessage, Snapshot } from '../src/protocol';
import {
  DEFAULT_ROUND_MS,
  isRoundMs,
  MAX_BUILD_FIELD_LENGTH,
  MAX_NAME_LENGTH,
  parseClientMessage,
  parseServerBuild,
  ROOM_CODE_CHARS,
  ROOM_CODE_LENGTH,
  ROUND_MS_CHOICES,
} from '../src/protocol';
import { CONFIG } from '../src/config';

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

  it('accepts leave and drops extra fields', () => {
    expect(parseClientMessage({ t: 'leave' })).toEqual({ t: 'leave' });
    expect(parseClientMessage({ t: 'leave', room: 'ABCD', junk: [1, 2] })).toEqual({ t: 'leave' });
  });

  it('accepts input and sanitizes its payload', () => {
    expect(parseClientMessage({ t: 'input', seq: 7, input: { moveX: 5, action: true } })).toEqual({
      t: 'input',
      seq: 7,
      input: { moveX: 0, moveY: 0, action: true, steal: false, attack: false },
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
    const msg: ServerMessage = { t: 'start', mapId: 'retro', map: RETRO_MAP, you: 'p1', players: [], snap: {} as Snapshot, roundMs: 300_000, rounds: 3, round: 1 };
    expect(msg.t === 'start' && msg.mapId).toBe('retro');
  });
});

describe('server build in joined', () => {
  it('allows joined with and without build', () => {
    const withBuild: ServerMessage = { t: 'joined', room: 'ABCD', you: 'p1', token: 't', build: { number: '3', sha: 'abcdef1' } };
    const without: ServerMessage = { t: 'joined', room: 'ABCD', you: 'p1', token: 't' };
    expect(JSON.parse(JSON.stringify(withBuild))).toEqual(withBuild);
    expect('build' in without).toBe(false);
  });
});

describe('parseServerBuild', () => {
  it('accepts short string fields', () => {
    expect(parseServerBuild({ number: '12', sha: 'abcdef1' })).toEqual({ number: '12', sha: 'abcdef1' });
    expect(parseServerBuild({ number: 'dev', sha: '' })).toEqual({ number: 'dev', sha: '' });
    expect(parseServerBuild({ number: 'x'.repeat(MAX_BUILD_FIELD_LENGTH), sha: 'y' })).not.toBeNull();
  });
  it('drops extra fields', () => {
    expect(parseServerBuild({ number: '1', sha: 'a', extra: 5 })).toEqual({ number: '1', sha: 'a' });
  });
  it('rejects missing, non-object, non-string and oversized values', () => {
    for (const raw of [undefined, null, 'abc', 5, [], {}, { number: 1, sha: 'a' }, { number: '1', sha: null }, { number: '1' }]) {
      expect(parseServerBuild(raw)).toBeNull();
    }
    expect(parseServerBuild({ number: 'x'.repeat(MAX_BUILD_FIELD_LENGTH + 1), sha: 'a' })).toBeNull();
    expect(parseServerBuild({ number: '1', sha: 'y'.repeat(MAX_BUILD_FIELD_LENGTH + 1) })).toBeNull();
  });
});

describe('series messages', () => {
  it('allows 3, 5, 7 and 10 minutes, default 5', () => {
    expect(ROUND_MS_CHOICES).toEqual([180_000, 300_000, 420_000, 600_000]);
    expect(DEFAULT_ROUND_MS).toBe(300_000);
    expect(CONFIG.roundMs).toBe(DEFAULT_ROUND_MS);
    expect(isRoundMs(420_000)).toBe(true);
    expect(isRoundMs(400_000)).toBe(false);
    expect(isRoundMs('300000')).toBe(false);
  });

  it('accepts start with and without a round time and keeps only finite numbers', () => {
    expect(parseClientMessage({ t: 'start' })).toEqual({ t: 'start' });
    expect(parseClientMessage({ t: 'start', roundMs: 420_000 })).toEqual({ t: 'start', roundMs: 420_000 });
    expect(parseClientMessage({ t: 'start', roundMs: 123 })).toEqual({ t: 'start', roundMs: 123 });
    expect(parseClientMessage({ t: 'start', roundMs: 'x' })).toEqual({ t: 'start' });
    expect(parseClientMessage({ t: 'start', roundMs: Number.POSITIVE_INFINITY })).toEqual({ t: 'start' });
  });

  it('accepts ready only with a boolean', () => {
    expect(parseClientMessage({ t: 'ready', ready: true })).toEqual({ t: 'ready', ready: true });
    expect(parseClientMessage({ t: 'ready', ready: false })).toEqual({ t: 'ready', ready: false });
    expect(parseClientMessage({ t: 'ready', ready: 1 })).toBeNull();
    expect(parseClientMessage({ t: 'ready' })).toBeNull();
  });

  it('accepts shopBuy with known category and item and a quantity from 1 to 99', () => {
    expect(parseClientMessage({ t: 'shopBuy', category: 'defense', item: 'dog_treat', qty: 99 })).toEqual({
      t: 'shopBuy',
      category: 'defense',
      item: 'dog_treat',
      qty: 99,
    });
    for (const qty of [0, 100, 1.5, -3, '2', null]) {
      expect(parseClientMessage({ t: 'shopBuy', category: 'defense', item: 'dog_treat', qty })).toBeNull();
    }
    expect(parseClientMessage({ t: 'shopBuy', category: 'defense', item: '__proto__', qty: 1 })).toBeNull();
    expect(parseClientMessage({ t: 'shopBuy', category: 'toString', item: 'dog_treat', qty: 1 })).toBeNull();
  });

  it('accepts setRoundMs only with an allowed value', () => {
    expect(parseClientMessage({ t: 'setRoundMs', roundMs: 180_000 })).toEqual({ t: 'setRoundMs', roundMs: 180_000 });
    expect(parseClientMessage({ t: 'setRoundMs', roundMs: 200_000 })).toBeNull();
  });

  it('accepts endSeries and drops extra fields', () => {
    expect(parseClientMessage({ t: 'endSeries', junk: 1 })).toEqual({ t: 'endSeries' });
  });
});
