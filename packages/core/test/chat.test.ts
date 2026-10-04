import { describe, expect, it } from 'vitest';
import { cleanChat, MAX_CHAT_LENGTH, MAX_CHAT_RAW_LENGTH, parseClientMessage } from '../src/protocol';

describe('cleanChat', () => {
  it('keeps ordinary text', () => {
    expect(cleanChat('Hallo zusammen!')).toBe('Hallo zusammen!');
  });

  it('rejects non-strings', () => {
    for (const bad of [undefined, null, 5, true, {}, [], ['a'], { toString: () => 'x' }]) {
      expect(cleanChat(bad)).toBeNull();
    }
  });

  it('trims and collapses whitespace including newlines and tabs', () => {
    expect(cleanChat('  a \n\n b\t\tc  ')).toBe('a b c');
    expect(cleanChat('a\nb')).toBe('a b');
  });

  it('rejects empty or whitespace-only text', () => {
    expect(cleanChat('')).toBeNull();
    expect(cleanChat('   \n\t ')).toBeNull();
    expect(cleanChat('\u0000\u0007​')).toBeNull();
  });

  it('removes control and format characters (zero-width, RTL overrides, BOM)', () => {
    expect(cleanChat('a\u0000b\u007fc\u009fd')).toBe('abcd');
    expect(cleanChat('ev​il‍')).toBe('evil');
    expect(cleanChat('‮gnp.exe‬')).toBe('gnp.exe');
    expect(cleanChat('﻿hi⁦x⁩')).toBe('hix');
    expect(cleanChat('a ​ b')).toBe('a b');
  });

  it('keeps umlauts and simple emoji', () => {
    expect(cleanChat('Grüße 😀🍺')).toBe('Grüße 😀🍺');
  });

  it('treats __proto__ as plain text', () => {
    expect(cleanChat('__proto__')).toBe('__proto__');
  });

  it('truncates to MAX_CHAT_LENGTH code points', () => {
    expect(cleanChat('x'.repeat(MAX_CHAT_LENGTH + 50))).toBe('x'.repeat(MAX_CHAT_LENGTH));
    const emoji = '😀'.repeat(MAX_CHAT_LENGTH + 5);
    const out = cleanChat(emoji);
    expect(out).not.toBeNull();
    expect([...out!].length).toBe(MAX_CHAT_LENGTH);
    expect(out).toBe('😀'.repeat(MAX_CHAT_LENGTH));
  });

  it('trims again after truncation', () => {
    expect(cleanChat('x'.repeat(MAX_CHAT_LENGTH - 1) + ' yyy')).toBe('x'.repeat(MAX_CHAT_LENGTH - 1));
  });

  it('rejects raw input longer than MAX_CHAT_RAW_LENGTH', () => {
    expect(cleanChat('x'.repeat(MAX_CHAT_RAW_LENGTH))).toBe('x'.repeat(MAX_CHAT_LENGTH));
    expect(cleanChat('x'.repeat(MAX_CHAT_RAW_LENGTH + 1))).toBeNull();
    expect(cleanChat('y'.repeat(1_000_000))).toBeNull();
  });
});

describe('parseClientMessage chat', () => {
  it('accepts chat with cleaned text and drops extra fields', () => {
    expect(parseClientMessage({ t: 'chat', text: '  hi  there ' })).toEqual({ t: 'chat', text: 'hi there' });
    expect(parseClientMessage({ t: 'chat', text: 'hi', name: 'Mallory', color: 1 })).toEqual({ t: 'chat', text: 'hi' });
  });

  it('rejects missing, non-string, empty or oversized text', () => {
    expect(parseClientMessage({ t: 'chat' })).toBeNull();
    expect(parseClientMessage({ t: 'chat', text: 5 })).toBeNull();
    expect(parseClientMessage({ t: 'chat', text: ['a'] })).toBeNull();
    expect(parseClientMessage({ t: 'chat', text: '   ' })).toBeNull();
    expect(parseClientMessage({ t: 'chat', text: 'x'.repeat(MAX_CHAT_RAW_LENGTH + 1) })).toBeNull();
  });
});
