import { CONFIG, NO_INPUT } from '@pfandraiders/core';
import type { Input, ServerMessage } from '@pfandraiders/core';
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

const MOVE_RIGHT: Input = { ...NO_INPUT, moveX: 1 };
/** Takte, bis der Standard-Countdown abgelaufen ist */
const COUNTDOWN_TICKS = Math.ceil(CONFIG.countdownMs / SERVER_CONFIG.stepMs);

/** Zwei Spieler, echter Countdown (Standard), kurze Runde. */
function twoPlayers(roundMs = 100) {
  let time = 0;
  const room = new Room('ABCD', { now: () => time, random: () => 0.5, roundMs, graceMs: 60_000 });
  const a = new FakeConn();
  const b = new FakeConn();
  const ra = room.join('Anna', a);
  const rb = room.join('Bob', b);
  if (!ra.ok || !rb.ok) throw new Error('join failed');
  const advance = (ms: number) => {
    time += ms;
  };
  return { room, a, b, ma: ra.value, mb: rb.value, advance };
}

describe('countdown before each round on the server', () => {
  it('sends the full countdown with start and counts it down in the snapshots', () => {
    const { room, a } = twoPlayers();
    room.start('p1');
    expect(a.last('start').snap.countdownMs).toBe(CONFIG.countdownMs);
    room.tick();
    room.tick();
    expect(a.last('snap').snap.countdownMs).toBe(CONFIG.countdownMs - 2 * SERVER_CONFIG.stepMs);
    expect(a.last('snap').snap.tick).toBe(2);
  });

  it('neither moves players nor ends even a very short round during the countdown', () => {
    const { room, a, ma } = twoPlayers(100);
    room.start('p1');
    const x = room.state!.players.p1.x;
    room.setInput(ma, 1, MOVE_RIGHT);
    for (let i = 0; i < COUNTDOWN_TICKS - 1; i++) room.tick();
    expect(room.phase).toBe('playing');
    expect(room.state!.phase).toBe('running');
    expect(room.state!.timeLeftMs).toBe(100);
    expect(room.state!.players.p1.x).toBe(x);
    expect(a.of('ranking')).toHaveLength(0);
    // letzter Countdown-Takt, dann läuft die Runde mit der gehaltenen Eingabe
    room.tick();
    expect(room.state!.countdownMs).toBe(0);
    expect(room.state!.players.p1.x).toBe(x);
    room.tick();
    expect(room.state!.players.p1.x).toBeGreaterThan(x);
    room.tick();
    expect(room.phase).toBe('shop');
  });

  it('starts every next round after the shop phase with the countdown again', () => {
    const { room, a, ma, mb } = twoPlayers(100);
    room.start('p1');
    for (let i = 0; i < COUNTDOWN_TICKS + 2; i++) room.tick();
    expect(room.phase).toBe('shop');
    room.setReady(ma, true);
    room.setReady(mb, true);
    expect(room.phase).toBe('playing');
    expect(room.state!.countdownMs).toBe(CONFIG.countdownMs);
    expect(a.last('start').snap.countdownMs).toBe(CONFIG.countdownMs);
  });

  it('gives a player who returns during the countdown the remaining countdown', () => {
    const { room, a, ma, advance } = twoPlayers();
    room.start('p1');
    room.leave(a);
    advance(1000);
    for (let i = 0; i < 20; i++) room.tick();
    const back = new FakeConn();
    const r = room.join('Anna', back, ma.token);
    expect(r.ok).toBe(true);
    expect(back.last('start').snap.countdownMs).toBe(CONFIG.countdownMs - 20 * SERVER_CONFIG.stepMs);
  });

  it('refuses new players during the countdown like during the round', () => {
    const { room } = twoPlayers();
    room.start('p1');
    room.tick();
    const r = room.join('Cara', new FakeConn());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('already_started');
  });
});
