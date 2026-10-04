import { CITY_MAP, CONFIG, createGame, NO_INPUT, parseMap, step, walk } from '@pfandraiders/core';
import type { Input, MapData, Player } from '@pfandraiders/core';
import { describe, expect, it } from 'vitest';
import {
  closestOnHistory,
  CORRECTION_GAIN,
  DEADBAND_STILL,
  MAX_SUBSTEP_MS,
  Predictor,
  sampleHistory,
  shiftHistory,
  SNAP_DIST,
} from '../src/prediction';
import type { HistoryEntry } from '../src/prediction';

// 30 x 14 Kacheln (16 px). Haus (#) in Zeilen 4..7, Spalten 10..13: y 64..128, x 160..224.
const MAP = parseMap([
  '##############################',
  '#............................#',
  '#............................#',
  '#..@.........................#',
  '#.........####...............#',
  '#.........####...............#',
  '#.........####...............#',
  '#.........####...............#',
  '#............................#',
  '#............................#',
  '#............................#',
  '#............................#',
  '#............................#',
  '##############################',
]);

const SPEED = CONFIG.playerSpeed; // Container "Hände": speedMult 1

type Axis = -1 | 0 | 1;
type Move = [Axis, Axis];
/** Eingabeskript: Liste von [Dauer ms, moveX, moveY]; danach Stillstand. */
type Script = [number, Axis, Axis][];

function scriptInput(script: Script, t: number): Move {
  let acc = 0;
  for (const [ms, x, y] of script) {
    acc += ms;
    if (t < acc) return [x, y];
  }
  return [0, 0];
}
const scriptLength = (s: Script) => s.reduce((a, [ms]) => a + ms, 0);

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface SimOptions {
  latency: number;
  jitter?: number;
  script: Script;
  /** Nach dem Skript noch so lange stehen. */
  tailMs?: number;
  frameMs?: number;
  /** Phase des Server-Takts gegenüber der Client-Uhr. */
  phase?: number;
  seed?: number;
  map?: MapData;
  /** Vor dem Server-Takt zu dieser Zeit wird die Serverfigur verändert. */
  serverEvent?: { at: number; apply: (p: Player) => void };
  /** Eingabe, die statt der Skript-Eingabe an den Predictor geht (Müll-Test). */
  garbage?: (t: number) => Input;
}

interface Frame {
  t: number;
  x: number;
  y: number;
  lx: number;
  ly: number;
  dt: number;
  corrections: number;
  snaps: number;
  /** Position der eigenen Figur im neuesten angekommenen Snapshot. */
  sx: number;
  sy: number;
  sMode: string;
}

/**
 * Simulierter Server wie in room.ts: fester 50-ms-Takt, jeder Takt nimmt die zuletzt angekommene Eingabe,
 * `ack` = höchste angekommene seq, step() zuerst, dann Snapshot. Der Client sendet wie OnlineConnection
 * (bei Änderung sofort, sonst alle 100 ms) und läuft mit festen Frames. Nachrichten kommen in Reihenfolge an
 * (WebSocket = TCP): Ankunft = max(vorige Ankunft, Senden + Latenz + Jitter).
 */
function simulate(o: SimOptions) {
  const map = o.map ?? MAP;
  const frameMs = o.frameMs ?? 1000 / 60;
  const jitter = o.jitter ?? 0;
  const rand = rng(o.seed ?? 1);
  const jit = () => rand() * jitter;
  const state = createGame(1, map, ['p1']);
  const me = state.players.p1;
  const pred = new Predictor();
  pred.reset({ x: me.x, y: me.y });
  const local: Player = { ...me };
  let latest: Player = JSON.parse(JSON.stringify(me)) as Player;

  let serverInput: Input = { ...NO_INPUT };
  let ackSeq = 0;
  const inputQ: { at: number; seq: number; input: Input }[] = [];
  const snapQ: { at: number; player: Player; ack: number }[] = [];
  let lastInAt = 0;
  let lastSnapAt = 0;
  let nextTick = o.phase ?? 13;
  let eventDone = false;

  let clock = 0;
  let seq = 0;
  let lastSent: Input | null = null;
  let sinceSent = 0;
  let pending: Input = { ...NO_INPUT };

  const frames: Frame[] = [];
  const ticks: { t: number; x: number; y: number }[] = [];
  const duration = scriptLength(o.script) + (o.tailMs ?? 1500);

  while (clock < duration) {
    const tNext = clock + frameMs;
    // Server-Takte bis zum nächsten Frame
    while (nextTick <= tNext) {
      while (inputQ.length > 0 && inputQ[0].at <= nextTick) {
        const m = inputQ.shift()!;
        ackSeq = Math.max(ackSeq, m.seq);
        serverInput = m.input;
      }
      if (o.serverEvent && !eventDone && nextTick >= o.serverEvent.at) {
        eventDone = true;
        o.serverEvent.apply(me);
      }
      step(state, { p1: serverInput }, 50);
      ticks.push({ t: nextTick, x: me.x, y: me.y });
      lastSnapAt = Math.max(lastSnapAt, nextTick + o.latency + jit());
      snapQ.push({ at: lastSnapAt, player: JSON.parse(JSON.stringify(me)) as Player, ack: ackSeq });
      nextTick += 50;
    }
    // Snapshots kommen zwischen den Frames an (Uhr steht noch auf dem letzten Frame)
    while (snapQ.length > 0 && snapQ[0].at <= tNext) {
      const s = snapQ.shift()!;
      latest = s.player;
      const moving = pending.moveX !== 0 || pending.moveY !== 0;
      pred.onSnapshot({ x: s.player.x, y: s.player.y }, s.ack, moving, clock);
    }
    // Frame: Eingabe lesen, senden, vorhersagen
    clock = tNext;
    sinceSent += frameMs;
    const [mx, my] = scriptInput(o.script, clock);
    pending = { ...NO_INPUT, moveX: mx, moveY: my };
    const changed = lastSent === null || lastSent.moveX !== mx || lastSent.moveY !== my;
    if (changed || sinceSent >= 100) {
      seq++;
      lastInAt = Math.max(lastInAt, clock + o.latency + jit());
      inputQ.push({ at: lastInAt, seq, input: pending });
      pred.noteSent(seq, clock);
      lastSent = pending;
      sinceSent = 0;
    }
    pred.step(frameMs, o.garbage ? o.garbage(clock) : pending, latest, map, clock);
    if (mx !== 0 || my !== 0) {
      for (let left = frameMs; left > 0; left -= MAX_SUBSTEP_MS) walk(map, local, pending, Math.min(left, MAX_SUBSTEP_MS));
    }
    const p = pred.position!;
    frames.push({
      t: clock,
      x: p.x,
      y: p.y,
      lx: local.x,
      ly: local.y,
      dt: frameMs,
      corrections: pred.corrections,
      snaps: pred.snaps,
      sx: latest.x,
      sy: latest.y,
      sMode: latest.mode,
    });
  }
  return { frames, ticks, pred, finalServer: { x: me.x, y: me.y }, stopAt: scriptLength(o.script) };
}

/** Vorhergesagte Position zur Zeit t (linear zwischen Frames). */
function predAt(frames: Frame[], t: number) {
  return sampleHistory(frames, t)!;
}

/** Größter Abstand zwischen Server (Takt T) und der Vorhersage zur Client-Zeit T - Latenz (mit Jitter: mittlere Latenz). */
function maxLagError(sim: ReturnType<typeof simulate>, latency: number): number {
  let worst = 0;
  for (const tk of sim.ticks) {
    const t = tk.t - latency;
    if (t < sim.frames[0].t) continue;
    const p = predAt(sim.frames, t);
    worst = Math.max(worst, Math.hypot(p.x - tk.x, p.y - tk.y));
  }
  return worst;
}

/** Zeit nach dem Stopp, ab der die Vorhersage dauerhaft <= 0.5 px an der (finalen) Serverposition liegt. */
function settleTime(sim: ReturnType<typeof simulate>): number {
  let settled = Infinity;
  for (let i = sim.frames.length - 1; i >= 0; i--) {
    const f = sim.frames[i];
    if (Math.hypot(f.x - sim.finalServer.x, f.y - sim.finalServer.y) > DEADBAND_STILL) break;
    settled = f.t;
  }
  return settled - sim.stopAt;
}

const SCRIPTS: Record<string, Script> = {
  straight: [
    [1000, 1, 0],
    [700, 0, 0],
    [600, 0, 1],
    [700, 0, 0],
    [600, 1, 1],
  ],
  wall: [[1500, -1, 0]],
  wallDiagonal: [[1200, -1, -1]],
  corner: [
    [70, 0, 1],
    [1500, 1, 0],
  ],
  tapTap: Array.from({ length: 25 }, (_, i): [number, Axis, Axis] => {
    const dirs: Move[] = [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, 1],
    ];
    const [x, y] = dirs[i % dirs.length];
    return [80, x, y];
  }),
};

const LATENCIES: [number, number][] = [
  [20, 0],
  [60, 0],
  [120, 0],
  [20, 15],
  [60, 30],
  [120, 40],
];

const measured: Record<string, { lag: number; settle: number; corrections: number; jump: number }> = {};

describe('Predictor against a simulated server', () => {
  for (const [latency, jitter] of LATENCIES) {
    for (const [name, script] of Object.entries(SCRIPTS)) {
      it(`${name} at ${latency} ms (+${jitter} jitter)`, () => {
        for (const phase of [3, 21, 38]) {
          const sim = simulate({ latency, jitter, script, phase, seed: latency + phase });
          const key = process.env.PRED_DETAIL ? `${latency}+${jitter} ${name}` : `${latency}+${jitter}`;
          const lag = maxLagError(sim, latency + jitter / 2);
          const settle = settleTime(sim);

          let jump = 0;
          // (a) glatt: pro Frame höchstens die Laufstrecke, Korrekturen höchstens 3 px, keine Sprünge
          for (let i = 1; i < sim.frames.length; i++) {
            const a = sim.frames[i - 1];
            const b = sim.frames[i];
            const step = Math.hypot(b.x - a.x, b.y - a.y);
            const walkMax = (SPEED * b.dt * 1.01) / 1000;
            jump = Math.max(jump, step - walkMax);
            expect(step).toBeLessThanOrEqual(walkMax + 3);
            expect(b.snaps).toBe(0);
          }
          // (a) ohne Korrektur ist die Vorhersage genau die lokal gerechnete Bewegung
          const firstCorr = sim.frames.findIndex((f) => f.corrections > 0);
          const clean = firstCorr < 0 ? sim.frames : sim.frames.slice(0, firstCorr);
          for (const f of clean) {
            expect(Math.abs(f.x - f.lx)).toBeLessThan(1e-9);
            expect(Math.abs(f.y - f.ly)).toBeLessThan(1e-9);
          }
          const prev = measured[key] ?? { lag: 0, settle: 0, corrections: 0, jump: 0 };
          measured[key] = {
            lag: Math.max(prev.lag, lag),
            settle: Math.max(prev.settle, settle),
            corrections: Math.max(prev.corrections, sim.pred.corrections),
            jump: Math.max(prev.jump, jump),
          };
          // (b) Abstand zur um die Latenz verzögerten Serverposition: ohne Jitter unter 10 px. Jitter verkürzt oder
          // verlängert beim Server selbst die Dauer kurzer Tastendrücke (er nimmt pro Takt die zuletzt angekommene
          // Eingabe); das kann keine Vorhersage wissen, bei schnellem Antippen summiert es sich bis zur Korrektur.
          // Gemessen (tapTap, 80-ms-Tipper): 60+30 ms ~12.6 px, 120+40 ms ~18.6 px.
          expect(lag).toBeLessThan(10 + (2 * SPEED * jitter) / 1000);
          // (c) nach dem Stopp genau auf der Serverposition, spätestens 600 ms nach dem Stopp plus eine Rundreise
          expect(settle).toBeLessThanOrEqual(600 + 2 * latency);
        }
      });
    }
  }

  it('reports the measured numbers', () => {
    if (process.env.PRED_REPORT) console.log(JSON.stringify(measured, null, 1));
    expect(Object.keys(measured).length).toBeGreaterThanOrEqual(LATENCIES.length);
  });

  it('walks without any correction on a straight line without jitter', () => {
    for (const latency of [20, 60, 120]) {
      const sim = simulate({ latency, script: [[2000, 1, 0]], tailMs: 0 });
      expect(sim.pred.corrections).toBe(0);
      const last = sim.frames[sim.frames.length - 1];
      expect(last.x).toBe(last.lx);
    }
  });

  it('settles on the server position within 600 ms after a stop at 20 and 60 ms', () => {
    for (const latency of [20, 60]) {
      for (const phase of [3, 21, 38]) {
        const sim = simulate({ latency, script: SCRIPTS.straight, phase });
        expect(settleTime(sim)).toBeLessThanOrEqual(600);
      }
    }
  });

  it('works on the city map with soft tiles', () => {
    const sim = simulate({
      latency: 60,
      jitter: 20,
      map: CITY_MAP,
      script: [
        [800, 1, 0],
        [800, 0, 1],
        [800, -1, 0],
        [800, 0, -1],
        [600, 1, 1],
      ],
    });
    expect(maxLagError(sim, 60)).toBeLessThan(10);
    expect(sim.pred.snaps).toBe(0);
    expect(settleTime(sim)).toBeLessThanOrEqual(600 + 120);
  });

  it('(d) snaps to a server teleport within one snapshot', () => {
    for (const latency of [20, 120]) {
      const sim = simulate({
        latency,
        script: [[600, 1, 0]],
        serverEvent: {
          at: 1000,
          apply: (p) => {
            p.x += 200;
            p.y += 60;
          },
        },
      });
      expect(sim.pred.snaps).toBe(1);
      // erster Frame, in dem der Snapshot mit der neuen Position angekommen ist
      const i = sim.frames.findIndex((f) => Math.hypot(f.sx - sim.finalServer.x, f.sy - sim.finalServer.y) < 1);
      expect(i).toBeGreaterThan(0);
      const f = sim.frames[i];
      expect(Math.hypot(f.x - f.sx, f.y - f.sy)).toBeLessThan(1e-9);
    }
  });

  it('(e) shows the server position while unconscious', () => {
    const sim = simulate({
      latency: 60,
      script: [[3000, 1, 0]],
      serverEvent: {
        at: 600,
        apply: (p) => {
          p.health = 0;
          p.unconsciousMs = 1000;
          p.mode = 'unconscious';
        },
      },
    });
    const knocked = sim.frames.filter((f) => f.sMode === 'unconscious');
    expect(knocked.length).toBeGreaterThan(10);
    for (const f of knocked) {
      expect(f.x).toBe(f.sx);
      expect(f.y).toBe(f.sy);
    }
    expect(Number.isFinite(sim.frames[sim.frames.length - 1].x)).toBe(true);
  });

  it('(f) garbage inputs never produce NaN', () => {
    const bad = [NaN, Infinity, -Infinity, 2, -7, 0.5, '1', null, undefined, {}] as unknown[];
    const sim = simulate({
      latency: 60,
      script: [[1000, 1, 0]],
      garbage: (t) => {
        const i = Math.floor(t / 17) % bad.length;
        return { ...NO_INPUT, moveX: bad[i], moveY: bad[(i + 3) % bad.length] } as unknown as Input;
      },
    });
    for (const f of sim.frames) {
      expect(Number.isFinite(f.x)).toBe(true);
      expect(Number.isFinite(f.y)).toBe(true);
    }
  });
});

describe('Predictor unit behaviour', () => {
  function player(): Player {
    return createGame(1, MAP, ['p1']).players.p1;
  }

  it('moves at once with the same walk as the server', () => {
    const pr = new Predictor();
    const me = player();
    pr.reset({ x: me.x, y: me.y });
    pr.step(100, { ...NO_INPUT, moveX: 1 }, me, MAP, 100);
    expect(pr.position!.x).toBeCloseTo(me.x + SPEED * 0.1, 9);
    expect(pr.position!.y).toBe(me.y);
  });

  it('sub-steps long frames instead of dropping time', () => {
    const pr = new Predictor();
    const me = player();
    pr.reset({ x: me.x, y: me.y });
    pr.step(200, { ...NO_INPUT, moveY: 1 }, me, MAP, 200);
    // 200 ms nach unten: das Haus liegt nicht im Weg (x = 56)
    expect(pr.position!.y).toBeCloseTo(me.y + SPEED * 0.2, 9);
  });

  it('starts at the server position when reset without one', () => {
    const pr = new Predictor();
    const me = player();
    pr.reset(null);
    expect(pr.position).toBeNull();
    pr.step(16, NO_INPUT, me, MAP, 16);
    expect(pr.position).toEqual({ x: me.x, y: me.y });
  });

  it('follows the server directly when disabled', () => {
    const pr = new Predictor();
    const me = player();
    pr.reset({ x: me.x, y: me.y });
    pr.enabled = false;
    pr.step(100, { ...NO_INPUT, moveX: 1 }, me, MAP, 100);
    expect(pr.position).toEqual({ x: me.x, y: me.y });
  });

  it('only applies the snap rule for unknown acks and ignores garbage', () => {
    const pr = new Predictor();
    pr.reset({ x: 100, y: 100 });
    pr.step(16, NO_INPUT, undefined, MAP, 16);
    pr.onSnapshot({ x: 110, y: 100 }, 99, false, 20);
    expect(pr.position).toEqual({ x: 100, y: 100 });
    pr.onSnapshot({ x: NaN, y: 100 }, 99, false, 20);
    pr.onSnapshot({ x: 110, y: 100 }, NaN, false, NaN);
    pr.onSnapshot({ x: 110, y: 100 }, 'x' as unknown as number, false, 30);
    expect(pr.position).toEqual({ x: 100, y: 100 });
    pr.onSnapshot({ x: 100 + SNAP_DIST + 1, y: 100 }, 99, false, 40);
    expect(pr.position).toEqual({ x: 100 + SNAP_DIST + 1, y: 100 });
  });

  it('corrects a standing figure by the gain and shifts its history', () => {
    const pr = new Predictor();
    pr.reset({ x: 100, y: 100 });
    for (let t = 0; t <= 200; t += 20) pr.step(20, NO_INPUT, undefined, MAP, t);
    pr.noteSent(1, 100);
    pr.onSnapshot({ x: 104, y: 100 }, 1, false, 200);
    expect(pr.simulatedPosition!.x).toBeCloseTo(100 + 4 * CORRECTION_GAIN, 9);
    // angezeigt wird die Korrektur erst nach und nach
    expect(pr.position!.x).toBeCloseTo(100, 9);
    pr.step(250, NO_INPUT, undefined, MAP, 450);
    pr.step(250, NO_INPUT, undefined, MAP, 700);
    expect(pr.position!.x).toBeCloseTo(100 + 4 * CORRECTION_GAIN, 2);
    expect(pr.historyEntries.every((h) => Math.abs(h.x - (100 + 4 * CORRECTION_GAIN)) < 1e-9)).toBe(true);
    // gleiche Abweichung nochmal: zählt nur noch der Rest
    pr.onSnapshot({ x: 104, y: 100 }, 1, false, 250);
    const rest = 4 * (1 - CORRECTION_GAIN);
    expect(pr.simulatedPosition!.x).toBeCloseTo(100 + 4 * CORRECTION_GAIN + rest * CORRECTION_GAIN, 9);
    // innerhalb der Totzone im Stand: nichts mehr
    const before = pr.corrections;
    pr.onSnapshot({ x: pr.simulatedPosition!.x + DEADBAND_STILL / 2, y: 100 }, 1, false, 300);
    expect(pr.corrections).toBe(before);
  });

  it('ignores older acks', () => {
    const pr = new Predictor();
    pr.reset({ x: 100, y: 100 });
    for (let t = 0; t <= 200; t += 20) pr.step(20, NO_INPUT, undefined, MAP, t);
    pr.noteSent(1, 50);
    pr.noteSent(2, 100);
    pr.onSnapshot({ x: 100, y: 100 }, 2, false, 150);
    pr.onSnapshot({ x: 103, y: 100 }, 1, false, 160);
    expect(pr.position).toEqual({ x: 100, y: 100 });
  });

  it('forgets old sends', () => {
    const pr = new Predictor();
    pr.reset({ x: 100, y: 100 });
    for (let i = 1; i <= 100; i++) pr.noteSent(i, i);
    for (let t = 0; t <= 200; t += 20) pr.step(20, NO_INPUT, undefined, MAP, t);
    pr.onSnapshot({ x: 104, y: 100 }, 1, false, 200); // seq 1 ist vergessen: keine Korrektur
    expect(pr.corrections).toBe(0);
    pr.onSnapshot({ x: 104, y: 100 }, 100, false, 200);
    expect(pr.corrections).toBe(1);
  });
});

describe('history helpers', () => {
  const h = (): HistoryEntry[] => [
    { t: 0, x: 0, y: 0 },
    { t: 10, x: 10, y: 0 },
    { t: 20, x: 10, y: 10 },
  ];

  it('samples linearly and clamps at both ends', () => {
    expect(sampleHistory(h(), 5)).toEqual({ x: 5, y: 0 });
    expect(sampleHistory(h(), 15)).toEqual({ x: 10, y: 5 });
    expect(sampleHistory(h(), -5)).toEqual({ x: 0, y: 0 });
    expect(sampleHistory(h(), 99)).toEqual({ x: 10, y: 10 });
    expect(sampleHistory([], 5)).toBeNull();
    expect(sampleHistory(h(), NaN)).toBeNull();
  });

  it('finds the closest point on the path inside the window', () => {
    expect(closestOnHistory(h(), 0, 20, { x: 7, y: -3 })).toEqual({ x: 7, y: 0 });
    expect(closestOnHistory(h(), 0, 20, { x: 13, y: 4 })).toEqual({ x: 10, y: 4 });
    // Fenster schneidet ab: nur bis t = 5
    expect(closestOnHistory(h(), 0, 5, { x: 9, y: 0 })).toEqual({ x: 5, y: 0 });
  });

  it('shifts every entry', () => {
    const list = h();
    shiftHistory(list, 2, -1);
    expect(list.map((e) => [e.x, e.y])).toEqual([
      [2, -1],
      [12, -1],
      [12, 9],
    ]);
  });
});
