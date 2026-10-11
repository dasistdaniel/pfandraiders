import { describe, expect, it } from 'vitest';
import { formatNetStats, isNetDebug, NetStats, RTT_GAIN, SNAP_WINDOW_MS, WINDOW_MS } from '../src/netStats';

/** Uhr zum Vorstellen in Tests */
function fakeClock(start = 1000) {
  let t = start;
  return {
    now: () => t,
    advance(ms: number) {
      t += ms;
    },
  };
}

describe('isNetDebug', () => {
  it('is on with ?debug=net, also in a comma list, off otherwise', () => {
    expect(isNetDebug('?debug=net')).toBe(true);
    expect(isNetDebug('?server=ws://x&debug=net')).toBe(true);
    expect(isNetDebug('?debug=foo,net')).toBe(true);
    expect(isNetDebug('?debug=network')).toBe(false);
    expect(isNetDebug('')).toBe(false);
    expect(isNetDebug('?debug=')).toBe(false);
  });
});

describe('NetStats round trip', () => {
  it('measures from sending seq N to the first snapshot with ack >= N', () => {
    const c = fakeClock();
    const s = new NetStats(c.now);
    s.noteSent(1);
    c.advance(80);
    s.noteSnapshot(0); // altes ack: noch keine Antwort
    expect(s.view().rttLastMs).toBeNull();
    c.advance(20);
    s.noteSnapshot(1);
    expect(s.view().rttLastMs).toBe(100);
    expect(s.view().rttMs).toBe(100); // erster Wert setzt den Mittelwert
    c.advance(50);
    s.noteSnapshot(1); // gleiches ack zählt nicht noch einmal
    expect(s.view().rttLastMs).toBe(100);
  });

  it('smooths with the gain and uses the newest acknowledged input', () => {
    const c = fakeClock();
    const s = new NetStats(c.now);
    s.noteSent(1);
    c.advance(100);
    s.noteSnapshot(1);
    s.noteSent(2);
    c.advance(40);
    s.noteSent(3);
    c.advance(60);
    s.noteSnapshot(3); // seq 3 nach 60 ms, seq 2 ist damit auch erledigt
    expect(s.view().rttLastMs).toBe(60);
    expect(s.view().rttMs).toBeCloseTo(100 + RTT_GAIN * (60 - 100));
    c.advance(10);
    s.noteSnapshot(3);
    expect(s.view().rttLastMs).toBe(60);
  });

  it('forgets old sends beyond its limit without throwing', () => {
    const c = fakeClock();
    const s = new NetStats(c.now);
    for (let i = 1; i <= 500; i++) s.noteSent(i);
    c.advance(30);
    s.noteSnapshot(500);
    expect(s.view().rttLastMs).toBe(30);
  });
});

describe('NetStats snapshots', () => {
  it('counts snapshots per second, jitter and the largest gap of the last 5 s', () => {
    const c = fakeClock();
    const s = new NetStats(c.now);
    for (let i = 0; i < 20; i++) {
      c.advance(50);
      s.noteSnapshot(0);
    }
    // 20 Snapshots im Abstand von 50 ms: genau 20/s, kein Jitter
    let v = s.view();
    expect(v.snapsPerSec).toBe(20);
    expect(v.jitterMs).toBe(0);
    expect(v.maxGapMs).toBe(50);
    // Stau: 400 ms nichts, dann drei auf einmal
    c.advance(400);
    s.noteSnapshot(0);
    s.noteSnapshot(0);
    s.noteSnapshot(0);
    v = s.view();
    expect(v.maxGapMs).toBe(400);
    expect(v.jitterMs).toBeGreaterThan(50);
    // nach 5 s ohne Stau ist die Lücke aus dem Fenster
    for (let i = 0; i < 110; i++) {
      c.advance(50);
      s.noteSnapshot(0);
    }
    v = s.view();
    expect(v.maxGapMs).toBe(50);
    expect(v.jitterMs).toBe(0);
  });

  it('counts the open gap since the last snapshot while it lasts', () => {
    const c = fakeClock();
    const s = new NetStats(c.now);
    s.noteSnapshot(0);
    c.advance(50);
    s.noteSnapshot(0);
    c.advance(700);
    expect(s.view().maxGapMs).toBe(700);
    expect(s.view().snapsPerSec).toBe(2);
  });

  it('reports nothing before the first snapshot', () => {
    const s = new NetStats(fakeClock().now);
    const v = s.view();
    expect(v).toMatchObject({ rttMs: null, rttLastMs: null, jitterMs: null, maxGapMs: null, snapsPerSec: 0 });
  });
});

describe('NetStats frames and prediction', () => {
  it('measures frames with its own clock and keeps the longest of the last 5 s', () => {
    const c = fakeClock();
    const s = new NetStats(c.now);
    s.noteFrame(); // erster Aufruf: noch kein Frame
    expect(s.view().frameMaxMs).toBe(0);
    for (const ms of [16, 300, 17]) {
      c.advance(ms);
      s.noteFrame();
    }
    // ein Hänger von 300 ms bleibt sichtbar, egal was Phaser als Delta meldet
    expect(s.view().frameMaxMs).toBe(300);
    for (let i = 0; i < 60; i++) {
      c.advance(100);
      s.noteFrame();
    }
    expect(s.view().frameMaxMs).toBe(100);
  });

  it('turns cumulative prediction counters into corrections per second and hard snaps in 30 s', () => {
    const c = fakeClock();
    const s = new NetStats(c.now);
    s.notePrediction(7, 2); // Ausgangsstand: zählt nicht
    expect(s.view()).toMatchObject({ correctionsPerSec: 0, hardSnaps: 0 });
    s.notePrediction(12, 3);
    c.advance(1000);
    s.notePrediction(17, 3);
    // 10 Korrekturen in den letzten 5 s = 2 pro Sekunde
    expect(s.view().correctionsPerSec).toBe(2);
    expect(s.view().hardSnaps).toBe(1);
    c.advance(WINDOW_MS);
    expect(s.view().correctionsPerSec).toBe(0);
    expect(s.view().hardSnaps).toBe(1);
    c.advance(SNAP_WINDOW_MS);
    expect(s.view().hardSnaps).toBe(0);
  });

  it('takes falling counters (new predictor) as a new baseline', () => {
    const c = fakeClock();
    const s = new NetStats(c.now);
    s.notePrediction(50, 5);
    s.notePrediction(0, 0);
    s.notePrediction(5, 1);
    expect(s.view().correctionsPerSec).toBe(1);
    expect(s.view().hardSnaps).toBe(1);
  });
});

describe('formatNetStats', () => {
  it('shows all values in short monospace lines', () => {
    const lines = formatNetStats(
      { rttMs: 123.4, rttLastMs: 140, jitterMs: 12.6, snapsPerSec: 19, maxGapMs: 412, frameMaxMs: 33.3, correctionsPerSec: 2.4, hardSnaps: 1 },
      { buffered: 32, ahead: 3, delayMs: 137.6, offsetPx: 1.26, errorPx: 7.81 },
    );
    expect(lines).toEqual([
      'NETZ (F3)',
      'RTT     123 ms (140)',
      'Jitter   13 ms',
      'Snaps    19 /s',
      'Lücke   412 ms max 5s',
      'Puffer   32 (vor 3)',
      'Verzög  138 ms',
      'Frame    33 ms max 5s',
      'Korr    2.4 /s',
      'Sprung    1 in 30s',
      'Fehler  7.8 px',
      'Glätt   1.3 px',
    ]);
    expect(Math.max(...lines.map((l) => l.length))).toBeLessThanOrEqual(22);
  });

  it('shows dashes for unknown values', () => {
    const lines = formatNetStats(
      { rttMs: null, rttLastMs: null, jitterMs: null, snapsPerSec: 0, maxGapMs: null, frameMaxMs: 0, correctionsPerSec: 0, hardSnaps: 0 },
      { buffered: 0, ahead: 0, delayMs: 100, offsetPx: 0, errorPx: 0 },
    );
    expect(lines[1]).toBe('RTT       - ms');
    expect(lines[2]).toBe('Jitter    - ms');
    expect(lines[4]).toBe('Lücke     - ms max 5s');
  });
});
