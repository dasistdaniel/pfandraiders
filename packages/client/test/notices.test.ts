import { describe, expect, it } from 'vitest';
import { Notices } from '../src/notices';

describe('Notices', () => {
  it('shows a notice for its duration, then drops it', () => {
    const n = new Notices();
    n.show('a', 'Hallo', 3000);
    expect(n.lines('a')).toEqual(['Hallo']);
    expect(n.lines('b')).toEqual([]);
    n.tick(2999);
    expect(n.lines('a')).toEqual(['Hallo']);
    n.tick(1);
    expect(n.lines('a')).toEqual([]);
  });

  it('replaces an older notice of the same player and restarts the time', () => {
    const n = new Notices();
    n.show('a', 'eins', 3000);
    n.tick(2000);
    n.show('a', 'zwei', 3000);
    n.tick(2000);
    expect(n.lines('a')).toEqual(['zwei']);
  });

  it('ignores invalid time steps', () => {
    const n = new Notices();
    n.show('a', 'x', 1000);
    n.tick(Number.NaN);
    n.tick(-50);
    expect(n.lines('a')).toEqual(['x']);
  });
});
