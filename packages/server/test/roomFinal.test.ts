import { DEFAULT_ROUNDS } from '@pfandraiders/core';
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

/** Drei verbundene Spieler; eine Runde ist nach zwei Ticks vorbei (roundMs 100). */
function series() {
  let time = 0;
  const room = new Room('ABCD', { now: () => time, random: () => 0.5, roundMs: 100, countdownMs: 0 });
  const conns = [new FakeConn(), new FakeConn(), new FakeConn()];
  const members = ['Anna', 'Bob', 'Cara'].map((name, i) => {
    const r = room.join(name, conns[i]);
    if (!r.ok) throw new Error('join failed');
    return r.value;
  });
  const endRound = () => {
    for (let i = 0; i < 100 && room.phase === 'playing'; i++) room.tick();
  };
  const nextRound = () => {
    for (const m of room.members) if (m.conn) room.setReady(m, true);
  };
  return { room, conns, members, endRound, nextRound, advance: (ms: number) => (time += ms) };
}

describe('round count', () => {
  it('is 3 by default and travels with lobby and start', () => {
    const { room, conns } = series();
    expect(DEFAULT_ROUNDS).toBe(3);
    expect(conns[0].last('lobby').rounds).toBe(3);
    room.start('p1');
    expect(conns[1].last('start')).toMatchObject({ rounds: 3, round: 1 });
  });

  it('lets only the host set it, only in the lobby, only to 1, 3, 5 or 0', () => {
    const { room, conns, endRound } = series();
    expect(room.setRounds('p2', 5)).toMatchObject({ ok: false, code: 'not_host' });
    expect(room.setRounds('p1', 2)).toMatchObject({ ok: false, code: 'bad_message' });
    expect(room.setRounds('p1', 5).ok).toBe(true);
    expect(conns[2].last('lobby').rounds).toBe(5);
    expect(room.rounds()).toBe(5);
    room.start('p1');
    expect(room.setRounds('p1', 1)).toMatchObject({ ok: false, code: 'wrong_phase' });
    endRound();
    expect(room.setRounds('p1', 1)).toMatchObject({ ok: false, code: 'wrong_phase' });
  });

  it('counts the rounds in start', () => {
    const { room, conns, endRound, nextRound } = series();
    room.start('p1');
    endRound();
    nextRound();
    expect(conns[0].last('start').round).toBe(2);
    expect(room.round).toBe(2);
  });
});

describe('final phase', () => {
  it('ends with the final ranking after the last round instead of the shop', () => {
    const { room, conns, endRound } = series();
    room.setRounds('p1', 1);
    room.start('p1');
    room.state!.players.p2.earnedTotal = 500;
    room.state!.players.p3.earnedTotal = 300;
    endRound();
    expect(room.phase).toBe('final');
    const phaseAt = conns[0].messages.findIndex((m) => m.t === 'phase' && m.phase === 'final');
    const rankAt = conns[0].messages.findIndex((m, i) => i > phaseAt && m.t === 'ranking');
    expect(phaseAt).toBeGreaterThan(-1);
    expect(rankAt).toBeGreaterThan(phaseAt);
    expect(conns[0].last('ranking').entries.map((e) => [e.id, e.total])).toEqual([
      ['p2', 500],
      ['p3', 300],
      ['p1', 0],
    ]);
    expect(conns[0].of('shopState')).toHaveLength(0);
    expect(conns[1].last('lobby').phase).toBe('final');
  });

  it('plays exactly three rounds by default', () => {
    const { room, endRound, nextRound } = series();
    room.start('p1');
    endRound();
    expect(room.phase).toBe('shop');
    nextRound();
    endRound();
    expect(room.phase).toBe('shop');
    nextRound();
    endRound();
    expect(room.phase).toBe('final');
  });

  it('never ends by itself with rounds 0', () => {
    const { room, endRound, nextRound } = series();
    room.setRounds('p1', 0);
    room.start('p1');
    for (let i = 0; i < 6; i++) {
      endRound();
      expect(room.phase).toBe('shop');
      nextRound();
    }
  });

  it('has no shop in the final phase', () => {
    const { room, members, endRound } = series();
    room.setRounds('p1', 1);
    room.start('p1');
    endRound();
    expect(room.shopBuy(members[0], 'defense', 'dog_treat', 1)).toMatchObject({ ok: false, code: 'wrong_phase' });
    expect(room.setReady(members[0], true)).toMatchObject({ ok: false, code: 'wrong_phase' });
    expect(room.endSeries('p1')).toMatchObject({ ok: false, code: 'wrong_phase' });
    expect(room.start('p1')).toMatchObject({ ok: false, code: 'already_started' });
    expect(room.chat(members[0].conn!, 'Hallo')).toMatchObject({ ok: false, code: 'chat_closed' });
  });

  it('ranks everybody by total after endSeries, also a shop joiner', () => {
    const { room, conns, endRound } = series();
    room.start('p1');
    room.state!.players.p1.earnedTotal = 200;
    room.state!.players.p3.earnedTotal = 200;
    endRound();
    const d = new FakeConn();
    expect(room.join('Dora', d).ok).toBe(true);
    expect(room.endSeries('p2')).toMatchObject({ ok: false, code: 'not_host' });
    expect(room.endSeries('p1').ok).toBe(true);
    expect(room.phase).toBe('final');
    expect(conns[1].last('phase').phase).toBe('final');
    expect(d.last('ranking').entries.map((e) => e.id)).toEqual(['p1', 'p3', 'p2', 'p4']);
  });

  it('sends a returning player the final phase and ranking', () => {
    const { room, members, endRound } = series();
    room.setRounds('p1', 1);
    room.start('p1');
    endRound();
    room.leave(members[1].conn!);
    const back = new FakeConn();
    expect(room.join('Bob', back, members[1].token).ok).toBe(true);
    expect(back.last('phase').phase).toBe('final');
    expect(back.of('ranking')).toHaveLength(1);
  });

  it('lets a new player join during the final phase without putting him in the ranking', () => {
    const { room, endRound } = series();
    room.setRounds('p1', 1);
    room.start('p1');
    endRound();
    const d = new FakeConn();
    expect(room.join('Dora', d).ok).toBe(true);
    expect(d.last('phase').phase).toBe('final');
    expect(d.last('ranking').entries.map((e) => e.id)).not.toContain('p4');
  });

  it('drops players whose grace ran out during the final phase and tells the others', () => {
    const { room, conns, members, endRound, advance } = series();
    room.setRounds('p1', 1);
    room.start('p1');
    endRound();
    room.leave(members[2].conn!);
    advance(SERVER_CONFIG.graceMs + 1);
    room.tick();
    expect(room.members.map((m) => m.id)).toEqual(['p1', 'p2']);
    expect(conns[0].last('lobby').players.map((p) => p.id)).toEqual(['p1', 'p2']);
  });
});

describe('toLobby', () => {
  function inFinal() {
    const s = series();
    s.room.chat(s.conns[0], 'Hallo');
    s.room.setRounds('p1', 1);
    s.room.setRoundMs('p1', 420_000);
    s.room.start('p1');
    s.room.state!.players.p1.money = 900;
    s.endRound();
    return s;
  }

  it('lets only the host go back, and only from the final phase', () => {
    const { room, endRound } = series();
    expect(room.toLobby('p1')).toMatchObject({ ok: false, code: 'wrong_phase' });
    room.start('p1');
    endRound();
    expect(room.toLobby('p1')).toMatchObject({ ok: false, code: 'wrong_phase' });
    room.endSeries('p1');
    expect(room.toLobby('p2')).toMatchObject({ ok: false, code: 'not_host' });
    expect(room.toLobby('p1').ok).toBe(true);
  });

  it('resets progress and round number but keeps code, host, settings, avatars and chat', () => {
    const { room, conns } = inFinal();
    const avatars = room.members.map((m) => m.avatar);
    expect(room.toLobby('p1').ok).toBe(true);
    expect(room.phase).toBe('lobby');
    expect(room.state).toBeNull();
    expect(room.progress.size).toBe(0);
    expect(room.round).toBe(0);
    expect(room.code).toBe('ABCD');
    expect(room.hostId()).toBe('p1');
    expect(room.rounds()).toBe(1);
    expect(room.roundMs()).toBe(100); // ROUND_MS aus den Optionen hat Vorrang
    expect(room.members.map((m) => m.avatar)).toEqual(avatars);
    expect(conns[2].last('phase').phase).toBe('lobby');
    expect(conns[2].last('lobby').phase).toBe('lobby');
    const d = new FakeConn();
    expect(room.join('Dora', d).ok).toBe(true);
    expect(d.last('chathistory').messages.map((m) => m.text)).toEqual(['Hallo']);
    expect(room.chat(conns[1], 'Wieder da').ok).toBe(true);
  });

  it('starts a fresh series afterwards', () => {
    const { room, conns } = inFinal();
    room.toLobby('p1');
    expect(room.start('p1').ok).toBe(true);
    expect(room.state!.players.p1.money).toBe(0);
    expect(conns[0].last('start').round).toBe(1);
  });

  it('keeps disconnected players in the grace period and drops expired ones', () => {
    const { room, members, advance } = inFinal();
    room.leave(members[1].conn!);
    advance(SERVER_CONFIG.graceMs + 1);
    room.leave(members[2].conn!);
    room.toLobby('p1');
    expect(room.members.map((m) => [m.id, m.conn !== null])).toEqual([
      ['p1', true],
      ['p3', false],
    ]);
    expect(room.join('Cara', new FakeConn(), members[2].token).ok).toBe(true);
  });

  it('gives the button to the next host when the host leaves in the final phase', () => {
    const { room, members } = inFinal();
    room.leaveForGood(members[0].conn!);
    expect(room.hostId()).toBe('p2');
    expect(room.toLobby('p2').ok).toBe(true);
  });
});
