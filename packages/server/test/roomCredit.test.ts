import { CONFIG, NO_INPUT, parseMap } from '@pfandraiders/core';
import type { Input, ServerMessage } from '@pfandraiders/core';
import { describe, expect, it } from 'vitest';
import { Room } from '../src/room';
import type { Conn } from '../src/room';

// Nachrechnen verschluckter Bewegung (docs/NETZ.md, Befund 2): Room mit gefälschter Uhr, 50-ms-Takt.

class FakeConn implements Conn {
  messages: ServerMessage[] = [];
  send(msg: ServerMessage): void {
    this.messages.push(msg);
  }
  snaps(): Extract<ServerMessage, { t: 'snap' }>[] {
    return this.messages.filter((m): m is Extract<ServerMessage, { t: 'snap' }> => m.t === 'snap');
  }
}

// Große freie Fläche (160 x 100 Kacheln), damit in 10 s keine Wand die Strecke verkürzt
const W = 160;
const H = 100;
const OPEN = parseMap(
  Array.from({ length: H }, (_, y) => {
    if (y === 0 || y === H - 1) return '#'.repeat(W);
    const row: string[] = Array.from({ length: W }, (_, x) => (x === 0 || x === W - 1 ? '#' : '.'));
    if (y === 3 || y === 6) row[3] = '@';
    return row.join('');
  }),
);

const RIGHT: Input = { ...NO_INPUT, moveX: 1 };
const SPEED = CONFIG.playerSpeed;

function setup() {
  let time = 0;
  const room = new Room('ABCD', { now: () => time, random: () => 0.5, countdownMs: 0, map: OPEN, stepMs: 50 });
  const a = new FakeConn();
  const b = new FakeConn();
  const ra = room.join('Anna', a);
  const rb = room.join('Bob', b);
  if (!ra.ok || !rb.ok) throw new Error('join failed');
  room.start(ra.value.id);
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) {
      time += 50;
      room.tick();
    }
  };
  const me = () => room.state!.players[ra.value.id];
  return { room, a, ma: ra.value, tick, me, advance: (ms: number) => (time += ms) };
}

describe('Room: held inputs', () => {
  it('walks a "go" that arrived together with its "stop" after a stall (300 ms held)', () => {
    const { room, ma, tick, me } = setup();
    tick(20); // Stand, das Budget füllt sich
    const x0 = me().x;
    // Stau: los (seq 1), zwei Wiederholungen, stopp, alle im selben Takt angekommen
    room.setInput(ma, 1, RIGHT, 100);
    room.setInput(ma, 2, RIGHT, 100);
    room.setInput(ma, 3, RIGHT, 100);
    room.setInput(ma, 4, NO_INPUT, 100);
    tick(6);
    expect(me().x - x0).toBeCloseTo((SPEED * 300) / 1000, 6);
  });

  it('changes nothing for an old client without held (the "go" is lost as before)', () => {
    const { room, ma, tick, me } = setup();
    tick(20);
    const x0 = me().x;
    room.setInput(ma, 1, RIGHT);
    room.setInput(ma, 2, RIGHT);
    room.setInput(ma, 3, RIGHT);
    room.setInput(ma, 4, NO_INPUT);
    tick(6);
    expect(me().x).toBe(x0);
  });

  it('changes nothing with held 0', () => {
    const { room, ma, tick, me } = setup();
    tick(20);
    const x0 = me().x;
    room.setInput(ma, 1, RIGHT, 0);
    room.setInput(ma, 2, RIGHT, 0);
    room.setInput(ma, 3, NO_INPUT, 0);
    tick(6);
    expect(me().x).toBe(x0);
  });

  it('acks the inputs only as far as their movement has been made up', () => {
    const { room, a, ma, tick } = setup();
    tick(20);
    room.setInput(ma, 1, RIGHT, 100);
    room.setInput(ma, 2, RIGHT, 100);
    room.setInput(ma, 3, RIGHT, 100);
    room.setInput(ma, 4, NO_INPUT, 100);
    const acks: number[] = [];
    for (let i = 0; i < 4; i++) {
      tick();
      acks.push(a.snaps().at(-1)!.ack);
    }
    // 100 ms je Takt: erst Gutschrift von seq 2 (ack 1), dann seq 3 (ack 2), dann seq 4 (ack 4)
    expect(acks[0]).toBeLessThan(4);
    expect(acks[acks.length - 1]).toBe(4);
    for (let i = 1; i < acks.length; i++) expect(acks[i]).toBeGreaterThanOrEqual(acks[i - 1]);
  });

  for (const last of ['stand', 'walk'] as const) {
    it(`forged held values never make a figure faster than its speed over a long window (last input: ${last})`, () => {
    const { room, ma, tick, me } = setup();
      let seq = 0;
      let path = 0;
      const seconds = 10;
      for (let t = 0; t < (seconds * 1000) / 50; t++) {
        // viele Nachrichten je Takt mit der größten Haltedauer, abwechselnd zwei Laufrichtungen; die letzte steht
        // (dann kostet der normale Schritt nichts) oder läuft
        for (let k = 0; k < 6; k++) {
          const end: Input = last === 'stand' ? NO_INPUT : RIGHT;
          const inp: Input = k === 5 ? end : k % 2 === 0 ? RIGHT : { ...NO_INPUT, moveX: 1, moveY: 1 };
          room.setInput(ma, ++seq, inp, 500);
        }
        const before = { x: me().x, y: me().y };
        tick();
        path += Math.hypot(me().x - before.x, me().y - before.y);
      }
      expect(path).toBeGreaterThan(0);
      // Weg höchstens Geschwindigkeit x (Echtzeit + Budget von 500 ms)
      expect(path).toBeLessThanOrEqual(SPEED * (seconds + 0.5) + 1e-6);
    });
  }

  it('forgets pending credit when the player leaves', () => {
    const { room, ma, tick, me } = setup();
    tick(20);
    const x0 = me().x;
    room.setInput(ma, 1, RIGHT, 100);
    room.setInput(ma, 2, NO_INPUT, 300);
    room.leave(ma.conn!);
    tick(6);
    expect(me().x).toBe(x0);
  });

  it('ignores held on an invalid seq (the input itself still applies)', () => {
    const { room, ma, tick, me } = setup();
    tick(20);
    const x0 = me().x;
    room.setInput(ma, Number.NaN, RIGHT, 100);
    room.setInput(ma, -1, NO_INPUT, 300);
    tick(6);
    expect(me().x).toBe(x0);
  });
});
