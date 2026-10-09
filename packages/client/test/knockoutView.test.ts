import { describe, expect, it } from 'vitest';
import { KNOCKOUT_TITLE, knockoutFontSizes, knockoutText } from '../src/knockoutView';

const down = (unconsciousMs: number, robbed = false) => ({ unconsciousMs, robbed });

describe('knockoutText', () => {
  it('shows nothing for a conscious player', () => {
    expect(knockoutText(down(0), 'running')).toBeNull();
    expect(knockoutText(down(-5), 'running')).toBeNull();
  });

  it('shows AUSGEKNOCKT and the remaining seconds rounded up', () => {
    expect(knockoutText(down(10000), 'running')).toEqual({ title: KNOCKOUT_TITLE, seconds: '10', robbed: '' });
    expect(knockoutText(down(4200), 'running')?.seconds).toBe('5');
    expect(knockoutText(down(4000), 'running')?.seconds).toBe('4');
    expect(knockoutText(down(1), 'running')?.seconds).toBe('1');
    expect(KNOCKOUT_TITLE).toBe('AUSGEKNOCKT');
  });

  it('adds "Ausgeraubt!" once the player was robbed', () => {
    expect(knockoutText(down(3000, true), 'running')?.robbed).toBe('Ausgeraubt!');
    expect(knockoutText(down(3000, false), 'running')?.robbed).toBe('');
  });

  it('hides behind the results after the round and ignores broken values', () => {
    expect(knockoutText(down(5000), 'ended')).toBeNull();
    expect(knockoutText(down(Number.NaN), 'running')).toBeNull();
    expect(knockoutText(down(Number.POSITIVE_INFINITY), 'running')).toBeNull();
  });
});

describe('knockoutFontSizes', () => {
  it('fits the title into narrow splitscreen views', () => {
    for (const view of [{ w: 960, h: 540 }, { w: 480, h: 540 }, { w: 480, h: 270 }]) {
      const s = knockoutFontSizes(view);
      // Monospace: ein Zeichen ist etwa 0,6 Schriftgrößen breit
      expect(KNOCKOUT_TITLE.length * 0.6 * s.title).toBeLessThanOrEqual(view.w * 0.9);
      expect(s.seconds).toBeGreaterThanOrEqual(s.title);
      expect(s.robbed).toBeLessThan(s.title);
      expect(s.robbed).toBeGreaterThanOrEqual(16);
    }
  });

  it('uses large retro sizes on a full screen', () => {
    const s = knockoutFontSizes({ w: 960, h: 540 });
    expect(s.title).toBeGreaterThanOrEqual(64);
    expect(s.seconds).toBe(96);
  });
});
