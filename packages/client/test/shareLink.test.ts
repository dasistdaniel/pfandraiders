import { describe, expect, it, vi } from 'vitest';
import { buildJoinLink, copyText, parseJoinParam, withoutJoinParam } from '../src/shareLink';

describe('buildJoinLink', () => {
  it('uses origin and path of the client plus ?join=CODE', () => {
    expect(buildJoinLink('https://example.org/pfand/index.html', 'ABCD')).toBe('https://example.org/pfand/index.html?join=ABCD');
    expect(buildJoinLink('http://localhost:5173/', 'XY23')).toBe('http://localhost:5173/?join=XY23');
  });

  it('keeps an existing ?server= value, drops everything else (hash, old join, other params)', () => {
    const link = buildJoinLink('https://example.org/pfand/?foo=1&server=wss://srv.example.org:8443&join=ZZZZ#x', 'ABCD');
    const url = new URL(link);
    expect(url.origin + url.pathname).toBe('https://example.org/pfand/');
    expect(url.searchParams.get('join')).toBe('ABCD');
    expect(url.searchParams.get('server')).toBe('wss://srv.example.org:8443');
    expect(url.searchParams.has('foo')).toBe(false);
    expect(url.hash).toBe('');
  });

  it('cleans the code like the join field does', () => {
    expect(new URL(buildJoinLink('https://example.org/', ' ab-cd ')).searchParams.get('join')).toBe('ABCD');
  });
});

describe('parseJoinParam', () => {
  it('reads a full room code, uppercased', () => {
    expect(parseJoinParam('?join=abcd')).toBe('ABCD');
    expect(parseJoinParam('?server=ws%3A%2F%2Fx%3A1&join=XY23')).toBe('XY23');
  });

  it('rejects missing, empty or incomplete codes', () => {
    expect(parseJoinParam('')).toBeNull();
    expect(parseJoinParam('?join=')).toBeNull();
    expect(parseJoinParam('?join=AB')).toBeNull();
    expect(parseJoinParam('?join=!!!!')).toBeNull();
    expect(parseJoinParam('?server=ws://x')).toBeNull();
  });

  it('round-trips with buildJoinLink', () => {
    const link = buildJoinLink('https://example.org/p/?server=ws://h:1', 'K7MN');
    expect(parseJoinParam(new URL(link).search)).toBe('K7MN');
  });
});

describe('withoutJoinParam', () => {
  it('removes only the join parameter', () => {
    expect(withoutJoinParam('https://example.org/p/?join=ABCD')).toBe('https://example.org/p/');
    const rest = new URL(withoutJoinParam('https://example.org/p/?server=ws://h:1&join=ABCD#top'));
    expect(rest.searchParams.get('server')).toBe('ws://h:1');
    expect(rest.searchParams.has('join')).toBe(false);
    expect(rest.hash).toBe('#top');
  });
});

describe('copyText', () => {
  it('uses the async clipboard when available', async () => {
    const writeText = vi.fn(async () => undefined);
    const fallback = vi.fn(() => true);
    await expect(copyText('hallo', { clipboard: { writeText }, fallback })).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('hallo');
    expect(fallback).not.toHaveBeenCalled();
  });

  it('falls back when the clipboard is missing or refuses (e.g. http in the LAN)', async () => {
    const fallback = vi.fn(() => true);
    await expect(copyText('a', { clipboard: undefined, fallback })).resolves.toBe(true);
    const writeText = vi.fn(async () => {
      throw new Error('nicht erlaubt');
    });
    await expect(copyText('b', { clipboard: { writeText }, fallback })).resolves.toBe(true);
    expect(fallback).toHaveBeenCalledWith('b');
  });

  it('reports failure when nothing works and never throws', async () => {
    const fallback = vi.fn(() => {
      throw new Error('kaputt');
    });
    await expect(copyText('c', { clipboard: undefined, fallback })).resolves.toBe(false);
    await expect(copyText('d', { clipboard: undefined, fallback: () => false })).resolves.toBe(false);
  });
});
