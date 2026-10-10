// Test der reinen Planung des Lag-Proxys (scripts/lagSchedule.mjs). Als .mjs, weil das Skript ohne Build mit node läuft.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LagLine, lineOptions, LOSS_STALL_MS, OrderedQueue, parseArgs, PRESETS } from '../../../scripts/lagSchedule.mjs';

/** Zufall aus einer festen Liste (wiederholt die letzte Zahl) */
function seq(...values) {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

const NONE = { delay: 0, jitter: 0, burstEvery: 0, burstMs: 0, lossStall: 0 };

describe('parseArgs', () => {
  it('reads all options of the example command line', () => {
    const o = parseArgs(['--listen', '8081', '--target', 'ws://localhost:8080', '--delay', '80', '--jitter', '60', '--burst-every', '3000', '--burst-ms', '500', '--loss-stall', '0']);
    expect(o).toEqual({ listen: 8081, target: 'ws://localhost:8080', delay: 80, jitter: 60, burstEvery: 3000, burstMs: 500, lossStall: 0, stallDir: 'both', preset: null });
  });

  it('has defaults and takes a preset, single flags override it', () => {
    expect(parseArgs([])).toMatchObject({ listen: 8081, target: 'ws://localhost:8080', ...NONE });
    expect(parseArgs(['--preset', 'steam'])).toMatchObject({ preset: 'steam', delay: 60, jitter: 80, burstEvery: 2500, burstMs: 400 });
    expect(parseArgs(['--preset', 'steam', '--delay', '10'])).toMatchObject({ delay: 10, jitter: 80 });
    expect(parseArgs(['--delay', '10', '--preset', 'steam'])).toMatchObject({ delay: 10, jitter: 80 });
  });

  it('limits stalls to one direction with --stall-dir', () => {
    const o = parseArgs(['--preset', 'steam', '--stall-dir', 'down']);
    expect(o.stallDir).toBe('down');
    expect(lineOptions(o, 'down')).toMatchObject({ burstEvery: 2500, burstMs: 400, delay: 60 });
    expect(lineOptions(o, 'up')).toMatchObject({ burstEvery: 0, burstMs: 0, lossStall: 0, delay: 60, jitter: 80 });
    expect(lineOptions(parseArgs(['--preset', 'steam']), 'up')).toMatchObject({ burstEvery: 2500 });
    expect(() => parseArgs(['--stall-dir', 'sideways'])).toThrow(/stall-dir/);
  });

  it('rejects unknown options, presets and bad numbers', () => {
    expect(() => parseArgs(['--foo', '1'])).toThrow(/foo/);
    expect(() => parseArgs(['--preset', 'mond'])).toThrow(/mond/);
    expect(() => parseArgs(['--delay', '-5'])).toThrow(/delay/);
    expect(() => parseArgs(['--loss-stall', '2'])).toThrow(/loss-stall/);
    expect(() => parseArgs(['--delay'])).toThrow(/delay/);
  });

  it('has the three presets', () => {
    expect(Object.keys(PRESETS).sort()).toEqual(['congested', 'steam', 'wifi']);
    expect(PRESETS.steam).toEqual({ delay: 60, jitter: 80, burstEvery: 2500, burstMs: 400, lossStall: 0 });
  });
});

describe('LagLine', () => {
  it('adds the fixed delay and a uniform jitter of plus/minus jitter', () => {
    const line = new LagLine({ ...NONE, delay: 80, jitter: 60 }, seq(0, 1, 0.5));
    expect(line.due(1000)).toBe(1020); // -60
    expect(line.due(2000)).toBe(2140); // +60
    expect(line.due(3000)).toBe(3080);
  });

  it('never reorders: a frame never leaves before the one before it', () => {
    const line = new LagLine({ ...NONE, delay: 50, jitter: 50 }, seq(1, 0));
    expect(line.due(0)).toBe(100);
    expect(line.due(10)).toBe(100); // eigentlich 10, wartet auf den Vorgänger
  });

  it('never sends before arrival even with jitter larger than the delay', () => {
    const line = new LagLine({ ...NONE, delay: 10, jitter: 60 }, seq(0));
    expect(line.due(500)).toBe(500);
  });

  it('holds everything due inside a stall until the stall ends', () => {
    const line = new LagLine({ ...NONE, delay: 20, burstEvery: 3000, burstMs: 500 }, seq(0.5), 0);
    expect(line.due(1000)).toBe(1020);
    // Stau von 3000 bis 3500
    expect(line.due(2990)).toBe(3500);
    expect(line.due(3100)).toBe(3500);
    expect(line.due(3470)).toBe(3500);
    expect(line.due(3490)).toBe(3510);
    expect(line.due(6000)).toBe(6500);
    expect(line.inStall(6100)).toBe(true);
    expect(line.inStall(6600)).toBe(false);
  });

  it('adds a retransmit stall with the loss-stall chance per frame', () => {
    // je Frame erst der Zufall für den Jitter (hier 0), dann der für den Verlust
    const lossy = new LagLine({ ...NONE, delay: 30, lossStall: 0.1 }, seq(0.5, 0.05, 0.5));
    expect(lossy.due(1000)).toBe(1000 + 30 + LOSS_STALL_MS);
    expect(lossy.due(1001)).toBe(1000 + 30 + LOSS_STALL_MS); // dahinter wartet alles
    const clean = new LagLine({ ...NONE, delay: 30, lossStall: 0.1 }, seq(0.5, 0.5));
    expect(clean.due(1000)).toBe(1030);
  });
});

describe('OrderedQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => vi.useRealTimers());

  const timers = () => ({ now: () => Date.now(), setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: (h) => clearTimeout(h) });

  it('delivers frames in order at their due time', () => {
    const sent = [];
    const q = new OrderedQueue(new LagLine({ ...NONE, delay: 50, jitter: 40 }, seq(1, 0, 0.5)), (d) => sent.push(d), timers());
    q.push('a'); // fällig 90
    vi.advanceTimersByTime(5);
    q.push('b'); // eigentlich 15, wartet auf a
    vi.advanceTimersByTime(5);
    q.push('c'); // 60, wartet auf a
    vi.advanceTimersByTime(79);
    expect(sent).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(sent).toEqual(['a', 'b', 'c']);
  });

  it('releases a stall at once and counts frames, bytes and delays', () => {
    const sent = [];
    const q = new OrderedQueue(new LagLine({ ...NONE, delay: 10, burstEvery: 1000, burstMs: 300 }, seq(0.5), 0), (d) => sent.push(d), timers());
    vi.advanceTimersByTime(1000);
    for (let i = 0; i < 6; i++) {
      q.push(`f${i}`);
      if (i < 5) vi.advanceTimersByTime(50);
    }
    expect(sent).toEqual([]);
    vi.advanceTimersByTime(1300 - Date.now());
    expect(sent).toEqual(['f0', 'f1', 'f2', 'f3', 'f4', 'f5']);
    const s = q.takeStats();
    expect(s.frames).toBe(6);
    expect(s.bytes).toBe(12);
    expect(s.maxDelay).toBe(300);
    expect(s.held).toBe(6);
    expect(q.takeStats().frames).toBe(0);
  });

  it('sends nothing after dispose', () => {
    const sent = [];
    const q = new OrderedQueue(new LagLine({ ...NONE, delay: 10 }, seq(0.5)), (d) => sent.push(d), timers());
    q.push('x');
    q.dispose();
    vi.advanceTimersByTime(100);
    expect(sent).toEqual([]);
  });
});
