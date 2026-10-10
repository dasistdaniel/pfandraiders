import { describe, expect, it } from 'vitest';
import { createGame } from '../src/game';
import { RETRO_MAP } from '../src/maps/retro';
import { applyCreditSteps, canWalk, MOVE_CREDIT, MoveCredit } from '../src/moveCredit';
import { walk } from '../src/movement';
import type { CreditStep } from '../src/moveCredit';
import { NO_INPUT } from '../src/types';
import type { Input } from '../src/types';

const STEP = 50;
const RIGHT: Input = { ...NO_INPUT, moveX: 1 };
const LEFT: Input = { ...NO_INPUT, moveX: -1 };
const DOWN: Input = { ...NO_INPUT, moveY: 1 };
const STOP: Input = { ...NO_INPUT };

const total = (steps: CreditStep[]) => steps.reduce((a, s) => a + s.ms, 0);

/**
 * Kleiner Server-Nachbau: Takte alle 50 ms (Echtzeit = Simulationszeit), Nachrichten werden vor dem Takt
 * verarbeitet, in dem sie angekommen sind. Gibt die Gutschriften je Takt zurück.
 */
function serverRun(msgs: { at: number; seq: number; input: Input; held?: number }[], untilMs: number, firstTick = 50) {
  const mc = new MoveCredit(STEP);
  let current: Input = { ...NO_INPUT };
  const credited: { t: number; steps: CreditStep[] }[] = [];
  const queue = [...msgs];
  let walkedMs = 0;
  for (let t = firstTick; t <= untilMs; t += STEP) {
    while (queue.length > 0 && queue[0].at <= t) {
      const m = queue.shift()!;
      mc.onInput(m.at, m.seq, m.held, current, m.input);
      current = m.input;
    }
    const moving = current.moveX !== 0 || current.moveY !== 0;
    const steps = mc.tick(t, true, moving);
    credited.push({ t, steps });
    walkedMs += total(steps) + (moving ? STEP : 0);
  }
  return { mc, credited, all: credited.flatMap((c) => c.steps), walkedMs };
}

/** Client-Seite: Eingabe je Zeitraum, gesendet bei Änderung sofort, sonst alle 100 ms, mit held. */
function clientMsgs(script: [number, Input][], latency: (sentAt: number, i: number) => number, untilMs: number) {
  const out: { at: number; seq: number; input: Input; held: number; sentAt: number }[] = [];
  let lastSentAt = 0;
  let last: Input | null = null;
  let seq = 0;
  let lastArrival = 0;
  for (let t = 0; t <= untilMs; t += 10) {
    let acc = 0;
    let inp: Input = STOP;
    for (const [ms, i] of script) {
      acc += ms;
      if (t < acc) {
        inp = i;
        break;
      }
    }
    const changed = last === null || last.moveX !== inp.moveX || last.moveY !== inp.moveY;
    if (changed || t - lastSentAt >= 100) {
      seq++;
      lastArrival = Math.max(lastArrival, t + latency(t, seq));
      out.push({ at: lastArrival, seq, input: inp, held: last === null ? 0 : t - lastSentAt, sentAt: t });
      lastSentAt = t;
      last = inp;
    }
  }
  return out;
}

describe('MoveCredit', () => {
  it('credits a "go" that was held 300 ms and arrived together with its "stop"', () => {
    // Stand bis 1000 ms, dann 300 ms rechts, dann Stand. Alles zwischen 1000 und 1500 ms hängt im Stau.
    const msgs = clientMsgs(
      [
        [1000, STOP],
        [300, RIGHT],
      ],
      (t) => (t >= 1000 && t < 1500 ? 1500 - t + 30 : 30),
      2500,
    );
    const r = serverRun(msgs, 2500);
    expect(r.all.every((s) => s.moveX === 1 && s.moveY === 0)).toBe(true);
    expect(total(r.all)).toBeCloseTo(300, 6);
    // höchstens 100 ms je Takt, in Teilschritten zu höchstens 50 ms
    for (const c of r.credited) expect(total(c.steps)).toBeLessThanOrEqual(MOVE_CREDIT.perTickMs);
    for (const s of r.all) expect(s.ms).toBeLessThanOrEqual(MOVE_CREDIT.substepMs);
  });

  it('credits nothing while the line is fine, also with jitter', () => {
    const script: [number, Input][] = [
      [700, RIGHT],
      [300, STOP],
      [500, DOWN],
      [80, LEFT],
      [80, RIGHT],
      [80, DOWN],
      [1000, LEFT],
    ];
    for (const seed of [1, 2, 3]) {
      let a = seed;
      const rand = () => ((a = (a * 16807) % 2147483647) / 2147483647);
      for (const jitter of [0, 30]) {
        const msgs = clientMsgs(script, () => 60 + rand() * jitter, 3500);
        const r = serverRun(msgs, 3500, 13);
        // ohne Stau gleicht sich das Takt-Raster aus; höchstens Reste unter einem Takt je Lauf
        expect(total(r.all)).toBeLessThanOrEqual(jitter === 0 ? 0 : STEP);
      }
    }
  });

  it('does not invent movement when a walk continues through a stall (same direction)', () => {
    const msgs = clientMsgs([[3000, RIGHT]], (t) => (t >= 1000 && t < 1500 ? 1500 - t + 30 : 30), 3000);
    const r = serverRun(msgs, 3000);
    expect(total(r.all)).toBe(0);
  });

  it('never credits without held (old client)', () => {
    const msgs = clientMsgs(
      [
        [1000, STOP],
        [300, RIGHT],
      ],
      (t) => (t >= 1000 && t < 1500 ? 1500 - t + 30 : 30),
      2500,
    ).map(({ at, seq, input }) => ({ at, seq, input }));
    const r = serverRun(msgs, 2500);
    expect(r.all).toEqual([]);
  });

  it('holds the ack back until the credit for that input is done', () => {
    const mc = new MoveCredit(STEP);
    mc.tick(0, true, false);
    for (let t = 50; t <= 1000; t += 50) mc.tick(t, true, false); // Budget füllt sich im Stand
    mc.onInput(1010, 5, 100, STOP, RIGHT);
    mc.onInput(1010, 6, 100, RIGHT, RIGHT);
    mc.onInput(1010, 7, 100, RIGHT, RIGHT);
    mc.onInput(1010, 8, 100, RIGHT, STOP);
    expect(mc.ackLimit(8)).toBe(5);
    const s1 = mc.tick(1050, true, false);
    expect(total(s1)).toBe(100);
    expect(mc.ackLimit(8)).toBe(6);
    mc.tick(1100, true, false);
    mc.tick(1150, true, false);
    expect(mc.ackLimit(8)).toBe(8);
  });

  it('drops credit while the player cannot move (countdown, unconscious) and forgets the run', () => {
    const mc = new MoveCredit(STEP);
    for (let t = 0; t <= 1000; t += 50) mc.tick(t, true, false);
    mc.onInput(1010, 1, 100, STOP, RIGHT);
    mc.onInput(1010, 2, 300, RIGHT, STOP);
    expect(mc.tick(1050, false, false)).toEqual([]);
    expect(mc.tick(1100, true, false)).toEqual([]);
    expect(mc.ackLimit(2)).toBe(2);
    // gehaltene Taste während des Countdowns: nach "LOS!" kein Schub
    const cd = new MoveCredit(STEP);
    for (let t = 0; t <= 1000; t += 50) {
      cd.onInput(t, t / 50 + 1, 50, RIGHT, RIGHT);
      cd.tick(t, false, true);
    }
    cd.onInput(1010, 100, 500, RIGHT, RIGHT);
    expect(cd.tick(1050, true, true)).toEqual([]);
  });

  it('lets credit expire after maxAgeMs', () => {
    const mc = new MoveCredit(STEP);
    // Budget leer: kein Stand vorher, die Gutschrift muss warten und verfällt
    mc.tick(0, true, true);
    mc.onInput(10, 1, 0, STOP, RIGHT);
    mc.onInput(10, 2, 400, RIGHT, STOP);
    // was das Budget nicht hergibt, verfällt sofort und hält das ack nicht auf
    expect(mc.ackLimit(2)).toBe(2);
    let got = 0;
    for (let t = 50; t <= 50 + MOVE_CREDIT.maxAgeMs + 100; t += 50) got += total(mc.tick(t, true, true));
    expect(got).toBe(0);
    expect(mc.ackLimit(2)).toBe(2);
  });

  it('caps a forged held: walking time never exceeds real time plus the budget', () => {
    const mc = new MoveCredit(STEP);
    let current: Input = RIGHT;
    let seq = 0;
    let walked = 0;
    const realMs = 10_000;
    for (let t = 0; t <= realMs; t += STEP) {
      // zehn Nachrichten je Takt, abwechselnd zwei Richtungen, immer mit der größten Haltedauer; die letzte steht
      // (so kostet der normale Schritt nichts und das Budget füllt sich, soweit es kann)
      for (let k = 0; k < 10; k++) {
        const next: Input = k === 9 ? STOP : k % 2 === 0 ? { ...NO_INPUT, moveX: 1, moveY: 1 } : RIGHT;
        mc.onInput(t + k, ++seq, 500, current, next);
        current = next;
      }
      walked += total(mc.tick(t + STEP - 1, true, false));
    }
    expect(walked).toBeGreaterThan(realMs / 2); // die Fälschung bekommt etwas, aber nie mehr als Echtzeit + Budget
    expect(walked).toBeLessThanOrEqual(realMs + STEP + MOVE_CREDIT.budgetMs);
  });

  it('ignores nonsense from the caller', () => {
    const mc = new MoveCredit(STEP);
    mc.onInput(NaN, 1, 100, STOP, RIGHT);
    mc.onInput(10, 2, -5, RIGHT, STOP);
    mc.onInput(10, 3, 1e9, RIGHT, STOP);
    mc.onInput(10, 4, 1.5, RIGHT, STOP);
    expect(mc.tick(NaN, true, false)).toEqual([]);
    expect(mc.tick(50, true, false)).toEqual([]);
  });
});

describe('applyCreditSteps and canWalk', () => {
  it('walks like the normal step (same walk, same collision) and cancels a search', () => {
    const a = createGame(1, RETRO_MAP, ['p1'], { countdownMs: 0 });
    const b = createGame(1, RETRO_MAP, ['p1'], { countdownMs: 0 });
    a.players.p1.searchSpotId = 0;
    applyCreditSteps(a, 'p1', [
      { moveX: 1, moveY: 0, ms: 50 },
      { moveX: 1, moveY: 0, ms: 30 },
    ]);
    walk(b.map, b.players.p1, RIGHT, 50);
    walk(b.map, b.players.p1, RIGHT, 30);
    expect(a.players.p1.x).toBe(b.players.p1.x);
    expect(a.players.p1.y).toBe(b.players.p1.y);
    expect(a.players.p1.searchSpotId).toBeNull();
    applyCreditSteps(a, 'nobody', [{ moveX: 1, moveY: 0, ms: 50 }]);
  });

  it('only lets a figure walk while the round runs, after the countdown and while conscious', () => {
    const g = createGame(1, RETRO_MAP, ['p1'], { countdownMs: 0 });
    expect(canWalk(g, 'p1')).toBe(true);
    expect(canWalk(g, 'p2')).toBe(false);
    g.players.p1.unconsciousMs = 100;
    expect(canWalk(g, 'p1')).toBe(false);
    g.players.p1.unconsciousMs = 0;
    g.countdownMs = 1000;
    expect(canWalk(g, 'p1')).toBe(false);
    g.countdownMs = 0;
    g.phase = 'ended';
    expect(canWalk(g, 'p1')).toBe(false);
  });
});
