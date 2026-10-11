import { describe, expect, it } from 'vitest';
import { BASE_DELAY_MS, DelayController, GROW_PER_MS, MAX_DELAY_MS, SHRINK_PER_MS } from '../src/renderDelay';

/** 20 Snapshots pro Sekunde mit dieser Verspätung, Frames zu 16 ms dazwischen. */
function run(c: DelayController, ms: number, late: (i: number) => number, open: (t: number) => number = () => 0): number[] {
  const out: number[] = [];
  let i = 0;
  for (let t = 0; t < ms; t += 10) {
    if (t % 50 === 0) c.observe(late(i++));
    c.step(10, open(t));
    out.push(c.delayMs);
  }
  return out;
}

describe('DelayController', () => {
  it('stays at exactly 100 ms on a calm network (Windows timer and frame raster: up to ~20 ms late)', () => {
    const c = new DelayController();
    let seed = 3;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const d = run(c, 30_000, () => rnd() * 20, () => rnd() * 40);
    expect(Math.max(...d)).toBe(BASE_DELAY_MS);
    expect(Math.min(...d)).toBe(BASE_DELAY_MS);
  });

  it('grows quickly with stalled ticks, but never faster than GROW_PER_MS', () => {
    const c = new DelayController();
    run(c, 2000, () => 0);
    // Stau von 250 ms: fünf Snapshots auf einmal (Verspätung 200 .. 0), mehrmals
    for (let r = 0; r < 3; r++) {
      for (let k = 4; k >= 0; k--) c.observe(k * 50);
      for (let t = 0; t < 1000; t += 10) {
        const before = c.delayMs;
        c.step(10);
        expect(c.delayMs - before).toBeLessThanOrEqual(GROW_PER_MS * 10 + 1e-9);
      }
    }
    expect(c.delayMs).toBeGreaterThan(130);
    expect(c.delayMs).toBeLessThanOrEqual(MAX_DELAY_MS);
  });

  it('grows already during the stall from the open gap', () => {
    const c = new DelayController();
    run(c, 2000, () => 0);
    // offene Lücke wächst 0 .. 400 ms, kein Snapshot kommt
    for (let t = 0; t <= 400; t += 10) c.step(10, t);
    expect(c.delayMs).toBeGreaterThan(150);
  });

  it('never leaves 100..250 ms', () => {
    const c = new DelayController();
    const d = run(c, 10_000, () => 5000, () => 5000);
    expect(Math.max(...d)).toBe(MAX_DELAY_MS);
    const c2 = new DelayController();
    expect(Math.min(...run(c2, 1000, () => -500))).toBe(BASE_DELAY_MS);
  });

  it('shrinks slowly (SHRINK_PER_MS, 10 ms/s) once the network is calm again', () => {
    const c = new DelayController();
    run(c, 3000, (i) => (i % 10 === 0 ? 400 : 100));
    const high = c.delayMs;
    expect(high).toBe(MAX_DELAY_MS);
    const d = run(c, 20_000, () => 0);
    for (let i = 1; i < d.length; i++) expect(d[i - 1] - d[i]).toBeLessThanOrEqual(SHRINK_PER_MS * 10 + 1e-9);
    // nach 5 s höchstens 50 ms weniger
    expect(d[499]).toBeGreaterThanOrEqual(high - 50 - 1e-6);
    expect(d[d.length - 1]).toBe(BASE_DELAY_MS);
  });

  it('settles between the limits for steady medium jitter', () => {
    const c = new DelayController();
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const d = run(c, 20_000, () => rnd() * 120);
    const last = d[d.length - 1];
    expect(last).toBeGreaterThan(BASE_DELAY_MS);
    expect(last).toBeLessThan(MAX_DELAY_MS);
  });

  it('ignores invalid values and resets', () => {
    const c = new DelayController();
    c.observe(Number.NaN);
    c.step(Number.NaN, Number.NaN);
    c.step(-50);
    expect(c.delayMs).toBe(BASE_DELAY_MS);
    expect(c.jitterMs).toBe(0);
    run(c, 1000, () => 400);
    c.reset();
    expect(c.delayMs).toBe(BASE_DELAY_MS);
    expect(c.jitterMs).toBe(0);
  });
});
