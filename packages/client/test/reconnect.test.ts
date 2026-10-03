import { describe, expect, it } from 'vitest';
import { ATTEMPT_WINDOW_MS, FATAL_CODES, JOINED_GRACE_MS, JoinedWatch, ReconnectPlan, RETRY_EVERY_MS } from '../src/reconnect';

describe('ReconnectPlan', () => {
  it('starts trying and attempts immediately', () => {
    const p = new ReconnectPlan();
    expect(p.phase).toBe('trying');
    expect(p.elapsedMs).toBe(0);
    expect(p.update(16)).toBe('attempt');
  });

  it('retries every 2 s: attempts at 0, 2000, 4000 ms over 10 calls of 500 ms', () => {
    const p = new ReconnectPlan();
    const attemptsAt: number[] = [];
    for (let i = 0; i < 10; i++) {
      const before = p.elapsedMs;
      if (p.update(500) === 'attempt') attemptsAt.push(before);
    }
    expect(attemptsAt).toEqual([0, 2000, 4000]);
    expect(RETRY_EVERY_MS).toBe(2000);
  });

  it('gives at most one attempt per call, even for a huge dt', () => {
    const p = new ReconnectPlan();
    expect(p.update(10_000)).toBe('attempt');
    expect(p.elapsedMs).toBe(10_000);
    expect(p.update(10)).toBe('attempt');
    expect(p.update(10)).toBeNull();
  });

  it('switches to asking after 30 s and stops attempting', () => {
    const p = new ReconnectPlan();
    let attempts = 0;
    for (let i = 0; i < 60; i++) if (p.update(500) === 'attempt') attempts++;
    expect(p.phase).toBe('asking');
    expect(p.elapsedMs).toBe(ATTEMPT_WINDOW_MS);
    expect(attempts).toBe(15);
    expect(p.update(500)).toBeNull();
    expect(p.update(5000)).toBeNull();
    expect(p.elapsedMs).toBe(ATTEMPT_WINDOW_MS);
  });

  it('continueTrying restarts at 0 with an immediate attempt', () => {
    const p = new ReconnectPlan();
    for (let i = 0; i < 60; i++) p.update(500);
    p.continueTrying();
    expect(p.phase).toBe('trying');
    expect(p.elapsedMs).toBe(0);
    expect(p.update(100)).toBe('attempt');
  });

  it('continueTrying does nothing outside asking', () => {
    const p = new ReconnectPlan();
    p.update(500);
    p.continueTrying();
    expect(p.elapsedMs).toBe(500);
    p.giveUp();
    p.continueTrying();
    expect(p.phase).toBe('gave_up');
  });

  it('giveUp sets gave_up and stops attempts', () => {
    const p = new ReconnectPlan();
    p.giveUp();
    expect(p.phase).toBe('gave_up');
    expect(p.update(500)).toBeNull();
  });

  it('fatal is true for every fatal code and gives up', () => {
    for (const code of FATAL_CODES) {
      const p = new ReconnectPlan();
      expect(p.fatal(code)).toBe(true);
      expect(p.phase).toBe('gave_up');
    }
  });

  it('fatal is false for rate_limited and changes nothing', () => {
    const p = new ReconnectPlan();
    expect(p.fatal('rate_limited')).toBe(false);
    expect(p.phase).toBe('trying');
  });

  it('remainingMs falls while trying and is 0 otherwise', () => {
    const p = new ReconnectPlan();
    expect(p.remainingMs()).toBe(ATTEMPT_WINDOW_MS);
    p.update(1000);
    expect(p.remainingMs()).toBe(ATTEMPT_WINDOW_MS - 1000);
    p.giveUp();
    expect(p.remainingMs()).toBe(0);
  });

  it('counts NaN, negative and infinite dt as 0', () => {
    const p = new ReconnectPlan();
    p.update(Number.NaN);
    p.update(-100);
    p.update(Number.POSITIVE_INFINITY);
    expect(p.elapsedMs).toBe(0);
    expect(p.phase).toBe('trying');
  });
});

describe('JoinedWatch', () => {
  it('expires after the grace time and ignores bad dt', () => {
    const w = new JoinedWatch();
    expect(w.update(Number.NaN)).toBe(false);
    expect(w.update(-5)).toBe(false);
    expect(w.update(JOINED_GRACE_MS - 1)).toBe(false);
    expect(w.update(1)).toBe(true);
  });
});
