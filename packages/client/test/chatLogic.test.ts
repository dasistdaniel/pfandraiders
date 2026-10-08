import { describe, expect, it } from 'vitest';
import { chatColorHex, MAX_CHAT_TEXT_CLIENT, parseChatMessage, rosterDiff } from '../src/chatLogic';

const entry = (id: string, name: string, connected = true) => ({ id, name, color: 0xef5350, connected, ready: false });

describe('rosterDiff', () => {
  it('reports nothing for the first roster', () => {
    expect(rosterDiff(null, [entry('p1', 'Anna'), entry('p2', 'Bob')])).toEqual([]);
  });

  it('reports joins and leaves by id', () => {
    const prev = [entry('p1', 'Anna'), entry('p2', 'Bob')];
    const next = [entry('p1', 'Anna'), entry('p3', 'Cara')];
    expect(rosterDiff(prev, next)).toEqual(['Cara ist beigetreten', 'Bob hat den Raum verlassen']);
  });

  it('reports nothing when only flags or order change', () => {
    const prev = [entry('p1', 'Anna'), entry('p2', 'Bob')];
    expect(rosterDiff(prev, [entry('p2', 'Bob', false), entry('p1', 'Anna')])).toEqual([]);
    expect(rosterDiff([], [])).toEqual([]);
  });

  it('treats a returning name with a new id as leave plus join', () => {
    expect(rosterDiff([entry('p1', 'Anna')], [entry('p4', 'Anna')])).toEqual([
      'Anna ist beigetreten',
      'Anna hat den Raum verlassen',
    ]);
  });
});

describe('chatColorHex', () => {
  it('formats valid colours with six digits', () => {
    expect(chatColorHex(0xef5350)).toBe('#ef5350');
    expect(chatColorHex(0x0000ff)).toBe('#0000ff');
    expect(chatColorHex(0)).toBe('#000000');
    expect(chatColorHex(0xffffff)).toBe('#ffffff');
  });

  it('falls back to white for garbage', () => {
    for (const bad of [-1, 0x1000000, 1.5, NaN, Infinity, '#ff0000', 'red;background:url(x)', null, undefined, {}]) {
      expect(chatColorHex(bad)).toBe('#ffffff');
    }
  });
});

describe('parseChatMessage', () => {
  const ok = { id: 'p1', name: 'Anna', color: 0xef5350, text: 'Hallo', at: 123 };

  it('accepts a well-formed message and drops extra fields', () => {
    expect(parseChatMessage({ ...ok, t: 'chat', html: '<b>x</b>' })).toEqual(ok);
  });

  it('accepts emoji text by code points', () => {
    const text = '😀'.repeat(MAX_CHAT_TEXT_CLIENT);
    expect(parseChatMessage({ ...ok, text })?.text).toBe(text);
    expect(parseChatMessage({ ...ok, text: text + '😀' })).toBeNull();
  });

  it('rejects malformed messages', () => {
    for (const bad of [
      null,
      'x',
      [],
      { ...ok, id: 5 },
      { ...ok, id: '' },
      { ...ok, name: 'x'.repeat(17) },
      { ...ok, name: '' },
      { ...ok, color: '#fff' },
      { ...ok, color: NaN },
      { ...ok, text: '' },
      { ...ok, text: 5 },
      { ...ok, text: 'x'.repeat(MAX_CHAT_TEXT_CLIENT + 1) },
      { ...ok, at: '1' },
      { ...ok, at: undefined },
    ]) {
      expect(parseChatMessage(bad)).toBeNull();
    }
  });
});
