import { describe, expect, it } from 'vitest';
import {
  audioMenuLabel,
  audioNoticeText,
  loadAudioToggles,
  nextAudioToggles,
  parseToggle,
  saveAudioToggles,
  type AudioToggles,
  type KeyValueStore,
} from '../src/settings';

function memory(entries: Record<string, string> = {}): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>(Object.entries(entries));
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

const broken: KeyValueStore = {
  getItem: () => {
    throw new Error('gesperrt');
  },
  setItem: () => {
    throw new Error('gesperrt');
  },
};

const BOTH_ON: AudioToggles = { music: true, effects: true };

describe('parseToggle', () => {
  it('reads "1" and "0", everything else is the fallback', () => {
    expect(parseToggle('1', false)).toBe(true);
    expect(parseToggle('0', true)).toBe(false);
    expect(parseToggle(null, true)).toBe(true);
    expect(parseToggle(undefined, false)).toBe(false);
    expect(parseToggle('ja', true)).toBe(true);
    expect(parseToggle('', false)).toBe(false);
  });
});

describe('loadAudioToggles / saveAudioToggles', () => {
  it('defaults to both on', () => {
    expect(loadAudioToggles(memory())).toEqual(BOTH_ON);
    expect(loadAudioToggles(undefined)).toEqual(BOTH_ON);
  });

  it('remembers both switches separately', () => {
    const store = memory();
    saveAudioToggles({ music: false, effects: true }, store);
    expect(loadAudioToggles(store)).toEqual({ music: false, effects: true });
    saveAudioToggles({ music: true, effects: false }, store);
    expect(loadAudioToggles(store)).toEqual({ music: true, effects: false });
    expect(store.data.get('pfandraiders.musicOn')).toBe('1');
    expect(store.data.get('pfandraiders.effectsOn')).toBe('0');
  });

  it('an old global mute ("Ton aus") turns both off until something new is saved', () => {
    expect(loadAudioToggles(memory({ 'pfandraiders.muted': '1' }))).toEqual({ music: false, effects: false });
    expect(loadAudioToggles(memory({ 'pfandraiders.muted': '0' }))).toEqual(BOTH_ON);
    const store = memory({ 'pfandraiders.muted': '1', 'pfandraiders.musicOn': '1' });
    expect(loadAudioToggles(store)).toEqual({ music: true, effects: false });
  });

  it('never throws on a blocked store', () => {
    expect(loadAudioToggles(broken)).toEqual(BOTH_ON);
    expect(() => saveAudioToggles(BOTH_ON, broken)).not.toThrow();
  });
});

describe('nextAudioToggles (Taste M)', () => {
  it('cycles: both on -> music off -> effects off -> both off -> both on', () => {
    const a = nextAudioToggles(BOTH_ON);
    expect(a).toEqual({ music: false, effects: true });
    const b = nextAudioToggles(a);
    expect(b).toEqual({ music: true, effects: false });
    const c = nextAudioToggles(b);
    expect(c).toEqual({ music: false, effects: false });
    expect(nextAudioToggles(c)).toEqual(BOTH_ON);
  });

  it('does not change its input', () => {
    const t = { ...BOTH_ON };
    nextAudioToggles(t);
    expect(t).toEqual(BOTH_ON);
  });
});

describe('audioMenuLabel / audioNoticeText', () => {
  it('shows the state of both switches in the pause menu', () => {
    expect(audioMenuLabel(BOTH_ON)).toBe('Ton: an');
    expect(audioMenuLabel({ music: false, effects: false })).toBe('Ton: aus');
    expect(audioMenuLabel({ music: false, effects: true })).toBe('Ton: Musik aus');
    expect(audioMenuLabel({ music: true, effects: false })).toBe('Ton: Effekte aus');
  });

  it('names both switches in the notice after pressing M', () => {
    expect(audioNoticeText(BOTH_ON)).toBe('Musik an, Effekte an');
    expect(audioNoticeText({ music: false, effects: true })).toBe('Musik aus, Effekte an');
    expect(audioNoticeText({ music: true, effects: false })).toBe('Musik an, Effekte aus');
    expect(audioNoticeText({ music: false, effects: false })).toBe('Musik aus, Effekte aus');
  });
});
