import { describe, expect, it } from 'vitest';
import { MIN_WINDOW_MS, OFFSET_SLEW, RATE_MIN_SPAN_MS, RESYNC_MS, ServerTimeline } from '../src/timeline';

/** Ruhige Leitung: Tick k kommt bei start + k * ms an (mit optionaler Verspätung je Tick). */
function feed(tl: ServerTimeline, ticks: number, ms = 50, late: (k: number) => number = () => 0, start = 1000): number {
  let now = start;
  for (let k = 0; k < ticks; k++) {
    now = start + k * ms;
    tl.advance(now);
    tl.noteSnapshot(k, now + late(k));
  }
  return now;
}

describe('ServerTimeline', () => {
  it('maps the first snapshot to its arrival and counts 50 ms per tick', () => {
    const tl = new ServerTimeline();
    expect(tl.ready).toBe(false);
    tl.noteSnapshot(40, 1000);
    expect(tl.ready).toBe(true);
    expect(tl.timeOf(40)).toBe(1000);
    expect(tl.timeOf(42)).toBe(1100);
    expect(tl.tickAt(1025)).toBeCloseTo(40.5, 9);
  });

  it('on a calm network places every snapshot exactly at its arrival (lateness 0)', () => {
    const tl = new ServerTimeline();
    const late: number[] = [];
    for (let k = 0; k < 200; k++) {
      tl.advance(1000 + k * 50);
      late.push(tl.noteSnapshot(k, 1000 + k * 50));
    }
    expect(Math.max(...late.map(Math.abs))).toBeLessThan(1e-6);
    expect(tl.msPerTick).toBeCloseTo(50, 6);
    expect(tl.timeOf(199)).toBeCloseTo(1000 + 199 * 50, 6);
  });

  it('does not compress the timeline when a burst arrives after a stall', () => {
    const tl = new ServerTimeline();
    // 2 s ruhig, dann 400 ms nichts, dann kommen die gehaltenen Ticks auf einmal
    feed(tl, 40);
    const burstAt = 1000 + 47 * 50;
    const late: number[] = [];
    for (let k = 40; k <= 47; k++) {
      tl.advance(burstAt);
      late.push(tl.noteSnapshot(k, burstAt));
    }
    // Die Ticks bleiben je 50 ms auseinander, an ihrer alten Stelle
    expect(tl.timeOf(41) - tl.timeOf(40)).toBeCloseTo(50, 6);
    expect(tl.timeOf(47)).toBeCloseTo(1000 + 47 * 50, 6);
    // Die Verspätung zeigt den Stau: der älteste gehaltene Tick 350 ms, der neueste 0
    expect(late[0]).toBeCloseTo(350, 6);
    expect(late[late.length - 1]).toBeCloseTo(0, 6);
  });

  it('follows the minimum, not the mean: late snapshots do not move it', () => {
    const tl = new ServerTimeline();
    // jeder zweite Snapshot 40 ms zu spät (wie gestaute Pakete)
    feed(tl, 100, 50, (k) => (k % 2 ? 40 : 0));
    expect(tl.timeOf(99)).toBeCloseTo(1000 + 99 * 50, 0);
  });

  it('estimates a slower server tick (Windows timer: about 61 ms per tick) and stays on it', () => {
    const tl = new ServerTimeline();
    const late: number[] = [];
    let now = 0;
    for (let k = 0; k < 300; k++) {
      now = 1000 + k * 61;
      tl.advance(now);
      late.push(tl.noteSnapshot(k, now));
    }
    expect(tl.msPerTick).toBeCloseTo(61, 0);
    // nach der Einschwingzeit landen die Snapshots wieder pünktlich
    expect(Math.max(...late.slice(150).map(Math.abs))).toBeLessThan(5);
    expect(tl.timeOf(299)).toBeCloseTo(now, -1);
  });

  it('is settled after RATE_MIN_SPAN_MS and then places snapshots on time at once', () => {
    const tl = new ServerTimeline();
    const late: number[] = [];
    let settledAt = -1;
    for (let k = 0; k < 60; k++) {
      const now = 1000 + k * 61;
      tl.advance(now);
      late.push(tl.noteSnapshot(k, now));
      if (tl.settled && settledAt < 0) settledAt = k;
    }
    expect(settledAt).toBeGreaterThan(0);
    expect(settledAt * 61).toBeGreaterThanOrEqual(RATE_MIN_SPAN_MS);
    expect(settledAt * 61).toBeLessThan(RATE_MIN_SPAN_MS + 200);
    // gleich nach dem Einschwingen pünktlich, nicht erst nach Sekunden
    expect(Math.max(...late.slice(settledAt + 1).map(Math.abs))).toBeLessThan(3);
    tl.reset();
    expect(tl.settled).toBe(false);
  });

  it('estimates the tick despite jitter', () => {
    const tl = new ServerTimeline();
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    let prev = 0;
    for (let k = 0; k < 400; k++) {
      const t = Math.max(prev, 1000 + k * 55 + rnd() * 60);
      prev = t;
      tl.advance(t);
      tl.noteSnapshot(k, t);
    }
    expect(Math.abs(tl.msPerTick - 55)).toBeLessThan(1.5);
  });

  it('eases a higher minimum in slowly (at most OFFSET_SLEW per ms)', () => {
    const tl = new ServerTimeline();
    let now = feed(tl, 60);
    // die Leitung wird dauerhaft 100 ms langsamer
    for (let k = 60; k < 200; k++) {
      now = 1000 + k * 50 + 100;
      const prevMap = tl.timeOf(k - 1);
      tl.advance(now);
      // Zwischen zwei Frames verschiebt sich die Zuordnung höchstens um OFFSET_SLEW * 50 ms
      expect(Math.abs(tl.timeOf(k - 1) - prevMap)).toBeLessThanOrEqual(OFFSET_SLEW * 50 + 1e-6);
      tl.noteSnapshot(k, now);
    }
    // am Ende liegt der neueste Snapshot wieder auf seiner Ankunft
    expect(Math.abs(tl.timeOf(199) - now)).toBeLessThan(2);
    expect(MIN_WINDOW_MS).toBeLessThan(140 * 50);
  });

  it('jumps (resyncs) when the mapping is off by more than RESYNC_MS', () => {
    const tl = new ServerTimeline();
    feed(tl, 40);
    // Uhr springt: ab jetzt kommt alles 1 s früher an (z. B. Client-Uhr hing)
    const t = 1000 + 40 * 50 - 1000;
    tl.advance(t);
    tl.noteSnapshot(40, t);
    tl.advance(t + 1);
    expect(tl.timeOf(40)).toBeCloseTo(t, 6);
    expect(RESYNC_MS).toBeLessThan(1000);
  });

  it('ignores invalid input and resets', () => {
    const tl = new ServerTimeline();
    expect(tl.noteSnapshot(Number.NaN, 5)).toBe(0);
    expect(tl.noteSnapshot(3, Number.POSITIVE_INFINITY)).toBe(0);
    expect(tl.ready).toBe(false);
    tl.noteSnapshot(3, 100);
    tl.reset();
    expect(tl.ready).toBe(false);
    expect(tl.msPerTick).toBe(50);
  });
});
