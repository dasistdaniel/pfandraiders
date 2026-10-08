import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_MUSIC_VOLUME,
  DEFAULT_VOLUME,
  loadMusicVolume,
  loadVolume,
  saveMusicVolume,
  saveVolume,
  stepVolume,
  autoSwitchTarget,
  DEFAULT_ONLINE_DEVICE,
  deviceLabel,
  loadAutoSwitch,
  loadOnlineDevice,
  ONLINE_DEVICES,
  parseDevice,
  saveAutoSwitch,
  saveOnlineDevice,
  serializeDevice,
  stepDevice,
  loadLocalRoundMs,
  saveLocalRoundMs,
  type KeyValueStore,
} from '../src/settings';

function memStore(initial?: string): KeyValueStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  if (initial !== undefined) map.set('pfandraiders.volume', initial);
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => { map.set(k, v); },
  };
}

describe('loadVolume', () => {
  it('returns the default for an empty store', () => {
    expect(loadVolume(memStore())).toBe(DEFAULT_VOLUME);
    expect(DEFAULT_VOLUME).toBe(70);
  });
  it('reads a stored value', () => {
    expect(loadVolume(memStore('40'))).toBe(40);
    expect(loadVolume(memStore('0'))).toBe(0);
    expect(loadVolume(memStore('100'))).toBe(100);
  });
  it.each(['abc', '', 'NaN', '-5', '150'])('falls back to the default for %j', (raw) => {
    expect(loadVolume(memStore(raw))).toBe(DEFAULT_VOLUME);
  });
  it('rounds decimals', () => {
    expect(loadVolume(memStore('12.6'))).toBe(13);
  });
  it('survives a throwing store', () => {
    const store: KeyValueStore = { getItem: () => { throw new Error('locked'); }, setItem: vi.fn() };
    expect(loadVolume(store)).toBe(DEFAULT_VOLUME);
  });
  it('returns the default without a store and without localStorage', () => {
    expect(typeof localStorage).toBe('undefined');
    expect(loadVolume()).toBe(DEFAULT_VOLUME);
  });
});

describe('saveVolume', () => {
  it('writes rounded and clamped values', () => {
    const s = memStore();
    saveVolume(42.4, s);
    expect(s.map.get('pfandraiders.volume')).toBe('42');
    saveVolume(250, s);
    expect(s.map.get('pfandraiders.volume')).toBe('100');
    saveVolume(-3, s);
    expect(s.map.get('pfandraiders.volume')).toBe('0');
  });
  it('swallows storage errors', () => {
    const store: KeyValueStore = { getItem: () => null, setItem: () => { throw new Error('full'); } };
    expect(() => saveVolume(50, store)).not.toThrow();
  });
  it('does not throw without localStorage', () => {
    expect(() => saveVolume(50)).not.toThrow();
  });
});

describe('stepVolume', () => {
  it.each([
    [75, 1, 80],
    [75, -1, 70],
    [100, 1, 100],
    [0, -1, 0],
    [70, 1, 80],
    [70, -1, 60],
    [5, -1, 0],
    [95, 1, 100],
  ] as const)('stepVolume(%d, %d) = %d', (v, dir, expected) => {
    expect(stepVolume(v, dir)).toBe(expected);
  });
  it('returns the default for NaN', () => {
    expect(stepVolume(NaN, 1)).toBe(DEFAULT_VOLUME);
  });
});

function musicStore(initial?: string): KeyValueStore & { map: Map<string, string> } {
  const s = memStore();
  if (initial !== undefined) s.map.set('pfandraiders.musicVolume', initial);
  return s;
}

describe('loadMusicVolume', () => {
  it('defaults to 40 and is independent of the effects volume', () => {
    expect(DEFAULT_MUSIC_VOLUME).toBe(40);
    expect(loadMusicVolume(musicStore())).toBe(40);
    expect(loadMusicVolume(memStore('90'))).toBe(40);
  });
  it('reads a stored value', () => {
    expect(loadMusicVolume(musicStore('0'))).toBe(0);
    expect(loadMusicVolume(musicStore('100'))).toBe(100);
    expect(loadMusicVolume(musicStore('12.6'))).toBe(13);
  });
  it.each(['abc', '', 'NaN', '-5', '150'])('falls back to the default for %j', (raw) => {
    expect(loadMusicVolume(musicStore(raw))).toBe(DEFAULT_MUSIC_VOLUME);
  });
  it('survives a throwing store and a missing localStorage', () => {
    const store: KeyValueStore = { getItem: () => { throw new Error('locked'); }, setItem: vi.fn() };
    expect(loadMusicVolume(store)).toBe(DEFAULT_MUSIC_VOLUME);
    expect(loadMusicVolume()).toBe(DEFAULT_MUSIC_VOLUME);
  });
});

describe('saveMusicVolume', () => {
  it('writes rounded and clamped values under its own key', () => {
    const s = memStore();
    saveMusicVolume(42.4, s);
    expect(s.map.get('pfandraiders.musicVolume')).toBe('42');
    expect(s.map.has('pfandraiders.volume')).toBe(false);
    saveMusicVolume(250, s);
    expect(s.map.get('pfandraiders.musicVolume')).toBe('100');
    saveMusicVolume(-3, s);
    expect(s.map.get('pfandraiders.musicVolume')).toBe('0');
    saveMusicVolume(NaN, s);
    expect(s.map.get('pfandraiders.musicVolume')).toBe('0');
  });
  it('swallows storage errors', () => {
    const store: KeyValueStore = { getItem: () => null, setItem: () => { throw new Error('full'); } };
    expect(() => saveMusicVolume(50, store)).not.toThrow();
    expect(() => saveMusicVolume(50)).not.toThrow();
  });
});

describe('online control device', () => {
  const store = (raw?: string): KeyValueStore & { map: Map<string, string> } => {
    const s = memStore();
    if (raw !== undefined) s.map.set('pfandraiders.onlineDevice', raw);
    return s;
  };

  it('offers Tastatur 1 and 2 and Gamepad 1 to 4, Tastatur 1 is the default', () => {
    expect(ONLINE_DEVICES.map(deviceLabel)).toEqual([
      'Tastatur 1', 'Tastatur 2', 'Gamepad 1', 'Gamepad 2', 'Gamepad 3', 'Gamepad 4',
    ]);
    expect(DEFAULT_ONLINE_DEVICE).toEqual({ kind: 'keyboard', layout: 0 });
  });

  it('serializes and parses every device', () => {
    for (const d of ONLINE_DEVICES) expect(parseDevice(serializeDevice(d))).toEqual(d);
    expect(serializeDevice({ kind: 'pad', index: 2 })).toBe('pad:2');
    expect(serializeDevice({ kind: 'keyboard', layout: 1 })).toBe('kb:1');
  });

  it.each([null, undefined, '', 'kb:2', 'pad:4', 'pad:-1', 'pad:1.5', 'mouse:0', 'kb:', 'pad:01x', '{}'])(
    'parses %j to the default',
    (raw) => {
      expect(parseDevice(raw)).toEqual(DEFAULT_ONLINE_DEVICE);
    },
  );

  it('loads and saves through the store, survives errors', () => {
    const s = store();
    expect(loadOnlineDevice(s)).toEqual(DEFAULT_ONLINE_DEVICE);
    saveOnlineDevice({ kind: 'pad', index: 3 }, s);
    expect(s.map.get('pfandraiders.onlineDevice')).toBe('pad:3');
    expect(loadOnlineDevice(s)).toEqual({ kind: 'pad', index: 3 });
    expect(loadOnlineDevice(store('garbage'))).toEqual(DEFAULT_ONLINE_DEVICE);
    const broken: KeyValueStore = { getItem: () => { throw new Error('locked'); }, setItem: () => { throw new Error('full'); } };
    expect(loadOnlineDevice(broken)).toEqual(DEFAULT_ONLINE_DEVICE);
    expect(() => saveOnlineDevice({ kind: 'pad', index: 0 }, broken)).not.toThrow();
    expect(loadOnlineDevice()).toEqual(DEFAULT_ONLINE_DEVICE);
  });

  it('cycles through the devices in both directions', () => {
    expect(stepDevice({ kind: 'keyboard', layout: 0 }, 1)).toEqual({ kind: 'keyboard', layout: 1 });
    expect(stepDevice({ kind: 'keyboard', layout: 1 }, 1)).toEqual({ kind: 'pad', index: 0 });
    expect(stepDevice({ kind: 'pad', index: 3 }, 1)).toEqual({ kind: 'keyboard', layout: 0 });
    expect(stepDevice({ kind: 'keyboard', layout: 0 }, -1)).toEqual({ kind: 'pad', index: 3 });
  });
});

describe('auto switch', () => {
  it('is on by default and stored as 1/0', () => {
    const s = memStore();
    expect(loadAutoSwitch(s)).toBe(true);
    saveAutoSwitch(false, s);
    expect(s.map.get('pfandraiders.autoSwitch')).toBe('0');
    expect(loadAutoSwitch(s)).toBe(false);
    saveAutoSwitch(true, s);
    expect(loadAutoSwitch(s)).toBe(true);
    s.map.set('pfandraiders.autoSwitch', 'kaputt');
    expect(loadAutoSwitch(s)).toBe(true);
    const broken: KeyValueStore = { getItem: () => { throw new Error('locked'); }, setItem: () => { throw new Error('full'); } };
    expect(loadAutoSwitch(broken)).toBe(true);
    expect(() => saveAutoSwitch(false, broken)).not.toThrow();
  });

  it('switches from a keyboard to the gamepad whose button was pressed', () => {
    expect(autoSwitchTarget({ kind: 'keyboard', layout: 0 }, true, 2)).toEqual({ kind: 'pad', index: 2 });
    expect(autoSwitchTarget({ kind: 'keyboard', layout: 1 }, true, 0)).toEqual({ kind: 'pad', index: 0 });
  });

  it('does nothing when disabled, when a gamepad is already chosen or for unknown pads', () => {
    expect(autoSwitchTarget({ kind: 'keyboard', layout: 0 }, false, 0)).toBeNull();
    expect(autoSwitchTarget({ kind: 'pad', index: 1 }, true, 0)).toBeNull();
    expect(autoSwitchTarget({ kind: 'keyboard', layout: 0 }, true, 4)).toBeNull();
    expect(autoSwitchTarget({ kind: 'keyboard', layout: 0 }, true, -1)).toBeNull();
    expect(autoSwitchTarget({ kind: 'keyboard', layout: 0 }, true, Number.NaN)).toBeNull();
  });
});

describe('local round time', () => {
  function memory(): KeyValueStore & { data: Map<string, string> } {
    const data = new Map<string, string>();
    return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
  }

  it('defaults to five minutes and remembers an allowed choice', () => {
    const store = memory();
    expect(loadLocalRoundMs(store)).toBe(300_000);
    saveLocalRoundMs(420_000, store);
    expect(loadLocalRoundMs(store)).toBe(420_000);
  });

  it('ignores stored values that are not allowed and never throws', () => {
    const store = memory();
    store.data.set('pfandraiders.roundMs', '123');
    expect(loadLocalRoundMs(store)).toBe(300_000);
    saveLocalRoundMs(999, store);
    expect(store.data.get('pfandraiders.roundMs')).toBe('123');
    const broken: KeyValueStore = {
      getItem: () => {
        throw new Error('gesperrt');
      },
      setItem: () => {
        throw new Error('gesperrt');
      },
    };
    expect(loadLocalRoundMs(broken)).toBe(300_000);
    expect(() => saveLocalRoundMs(300_000, broken)).not.toThrow();
  });
});
