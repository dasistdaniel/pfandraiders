import { CHAT_HISTORY_SIZE, MAX_CHAT_LENGTH, cleanChat } from '@pfandraiders/core';
import type { ServerMessage } from '@pfandraiders/core';
import { describe, expect, it } from 'vitest';
import { SERVER_CONFIG } from '../src/config';
import { Room } from '../src/room';
import type { Conn } from '../src/room';

class FakeConn implements Conn {
  messages: ServerMessage[] = [];
  send(msg: ServerMessage): void {
    this.messages.push(msg);
  }
  of<T extends ServerMessage['t']>(t: T): Extract<ServerMessage, { t: T }>[] {
    return this.messages.filter((m): m is Extract<ServerMessage, { t: T }> => m.t === t);
  }
  last<T extends ServerMessage['t']>(t: T): Extract<ServerMessage, { t: T }> {
    const all = this.of(t);
    return all[all.length - 1];
  }
}

function setup() {
  let time = 100_000;
  const room = new Room('ABCD', { now: () => time, random: () => 0.5 });
  const a = new FakeConn();
  const b = new FakeConn();
  const ra = room.join('Anna', a);
  const rb = room.join('Bob', b);
  if (!ra.ok || !rb.ok) throw new Error('join failed');
  const advance = (ms: number) => {
    time += ms;
  };
  return { room, a, b, ma: ra.value, mb: rb.value, advance, now: () => time };
}

const GAP = SERVER_CONFIG.chatMinGapMs;

describe('Room.chat', () => {
  it('broadcasts an accepted message with id, name, colour and server time to everybody incl. the sender', () => {
    const { room, a, b, ma, now } = setup();
    expect(room.chat(a, 'Hallo')).toEqual({ ok: true, value: undefined });
    const expected = { t: 'chat', id: ma.id, name: 'Anna', color: ma.color, text: 'Hallo', at: now() };
    expect(a.last('chat')).toEqual(expected);
    expect(b.last('chat')).toEqual(expected);
  });

  it('does not send to members who left', () => {
    const { room, a, b } = setup();
    room.leave(b);
    room.chat(a, 'hi');
    expect(b.of('chat')).toHaveLength(0);
  });

  it('rejects connections that are not members', () => {
    const { room, a, b } = setup();
    const stranger = new FakeConn();
    expect(room.chat(stranger, 'hi')).toMatchObject({ ok: false, code: 'not_in_room' });
    room.leave(b);
    expect(room.chat(b, 'hi')).toMatchObject({ ok: false, code: 'not_in_room' });
    expect(a.of('chat')).toHaveLength(0);
  });

  it('rejects chat while running and after the round with chat_closed', () => {
    const { room, a, b, ma } = setup();
    expect(room.start(ma.id).ok).toBe(true);
    expect(room.chat(a, 'hi')).toMatchObject({ ok: false, code: 'chat_closed' });
    room.phase = 'shop';
    expect(room.chat(b, 'hi')).toMatchObject({ ok: false, code: 'chat_closed' });
    expect(a.of('chat')).toHaveLength(0);
    expect(b.of('chat')).toHaveLength(0);
  });

  it('allows one message per gap, exactly at the boundary', () => {
    const { room, a, advance } = setup();
    expect(room.chat(a, '1').ok).toBe(true);
    advance(GAP - 1);
    expect(room.chat(a, '2')).toMatchObject({ ok: false, code: 'chat_too_fast' });
    advance(1);
    expect(room.chat(a, '3').ok).toBe(true);
    expect(a.of('chat').map((m) => m.text)).toEqual(['1', '3']);
  });

  it('allows at most chatMaxPerWindow messages per window', () => {
    const { room, a, advance } = setup();
    const max = SERVER_CONFIG.chatMaxPerWindow;
    for (let i = 0; i < max; i++) {
      expect(room.chat(a, `m${i}`).ok).toBe(true);
      advance(GAP);
    }
    // jetzt sind max * GAP ms seit der ersten Nachricht vergangen
    const left = SERVER_CONFIG.chatWindowMs - max * GAP;
    advance(left - 1);
    expect(room.chat(a, 'zu viel')).toMatchObject({ ok: false, code: 'chat_too_fast' });
    advance(1);
    expect(room.chat(a, 'wieder ok').ok).toBe(true);
  });

  it('limits each member separately', () => {
    const { room, a, b } = setup();
    expect(room.chat(a, 'a').ok).toBe(true);
    expect(room.chat(b, 'b').ok).toBe(true);
    expect(room.chat(a, 'a2')).toMatchObject({ ok: false, code: 'chat_too_fast' });
  });

  it('keeps the last CHAT_HISTORY_SIZE messages in order for a late joiner', () => {
    const { room, a, advance } = setup();
    for (let i = 0; i < CHAT_HISTORY_SIZE + 5; i++) {
      expect(room.chat(a, `m${i}`).ok).toBe(true);
      advance(SERVER_CONFIG.chatWindowMs);
    }
    const c = new FakeConn();
    expect(room.join('Cara', c).ok).toBe(true);
    const hist = c.last('chathistory');
    expect(hist.messages).toHaveLength(CHAT_HISTORY_SIZE);
    expect(hist.messages[0].text).toBe('m5');
    expect(hist.messages[CHAT_HISTORY_SIZE - 1].text).toBe(`m${CHAT_HISTORY_SIZE + 4}`);
    // chathistory kommt direkt nach joined
    const kinds = c.messages.map((m) => m.t);
    expect(kinds.indexOf('chathistory')).toBe(kinds.indexOf('joined') + 1);
  });

  it('sends an empty history to a new member of a fresh room', () => {
    const { a } = setup();
    expect(a.last('chathistory').messages).toEqual([]);
  });

  it('sends the history on a token return as well', () => {
    const { room, a, ma } = setup();
    room.chat(a, 'vorher');
    const a2 = new FakeConn();
    expect(room.join('Anna', a2, ma.token).ok).toBe(true);
    expect(a2.last('chathistory').messages.map((m) => m.text)).toEqual(['vorher']);
    // die alte Verbindung gehört nicht mehr zum Mitglied
    expect(room.chat(a, 'alt')).toMatchObject({ ok: false, code: 'not_in_room' });
  });

  it('forgets history and limits once the room is empty, and a new room starts empty', () => {
    const { room, a, b, advance } = setup();
    room.chat(a, 'geheim');
    room.leave(a);
    room.leaveForGood(b);
    advance(1);
    const c = new FakeConn();
    expect(room.join('Cara', c).ok).toBe(true);
    expect(c.last('chathistory').messages).toEqual([]);
    expect(room.chat(c, 'neu').ok).toBe(true);

    const other = new Room('WXYZ', {});
    const d = new FakeConn();
    other.join('Dora', d);
    expect(d.last('chathistory').messages).toEqual([]);
  });

  it('accepts a full-length emoji message unchanged', () => {
    const { room, a } = setup();
    const text = cleanChat('😀'.repeat(MAX_CHAT_LENGTH))!;
    expect(room.chat(a, text).ok).toBe(true);
    expect(a.last('chat').text).toBe(text);
  });
});
