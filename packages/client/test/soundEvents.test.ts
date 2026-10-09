import { CITY_MAP, CONFIG, createGame, parseMap, projectSnapshot, stateFromSnapshot, step } from '@pfandraiders/core';
import type { GameState, Npc } from '@pfandraiders/core';
import { describe, expect, it } from 'vitest';
import { detectFoodFinds, detectSeizures, detectSounds, PLING_MAX_STEP, PLING_RESET_MS, plingStep, snapshotForSound } from '../src/soundEvents';

function fresh(): GameState {
  return createGame(1, CITY_MAP, ['a', 'b'], { countdownMs: 0 });
}

/** Kopie des Zustands, auf die der Test Änderungen anwendet. */
function next(prev: GameState, edit: (s: GameState) => void): GameState {
  const s = snapshotForSound(prev);
  edit(s);
  return s;
}

function npc(over: Partial<Npc>): Npc {
  return {
    id: 99, kind: 'dog', x: 0, y: 0, lifeMs: 1000, mood: 'active', moodMs: 0, targetId: null, restId: null, restMs: 0, pauseMs: 0, wanderX: 0, wanderY: 0, wanderRef: 0, cooldownMs: 0, distractedMs: 0, checkMs: 0, pathX: 0, pathY: 0, pathMs: 0,
    ...over,
  };
}

describe('detectSounds', () => {
  it('is silent without a previous state and when nothing changed', () => {
    const s = fresh();
    expect(detectSounds(null, s, 'all')).toEqual([]);
    expect(detectSounds(s, snapshotForSound(s), 'all')).toEqual([]);
  });

  it('ticks on the first frame of a countdown (the 5) and on every new second', () => {
    const p = next(fresh(), (s) => { s.countdownMs = 5000; });
    expect(detectSounds(null, p, 'all')).toEqual(['tick']);
    const same = next(p, (s) => { s.countdownMs = 4050; });
    expect(detectSounds(p, same, 'all')).toEqual([]);
    const four = next(same, (s) => { s.countdownMs = 4000; });
    expect(detectSounds(same, four, 'all')).toEqual(['tick']);
    const one = next(p, (s) => { s.countdownMs = 1000; });
    expect(detectSounds(next(p, (s) => { s.countdownMs = 1050; }), one, 'all')).toEqual(['tick']);
    expect(detectSounds(one, next(p, (s) => { s.countdownMs = 950; }), 'all')).toEqual([]);
  });

  it('plays countdownGo when the countdown reaches zero, but not for a running round', () => {
    const p = next(fresh(), (s) => { s.countdownMs = 40; });
    const go = next(p, (s) => { s.countdownMs = 0; });
    expect(detectSounds(p, go, 'all')).toEqual(['countdownGo']);
    expect(detectSounds(go, snapshotForSound(go), 'all')).toEqual([]);
    expect(detectSounds(null, go, 'all')).toEqual([]);
  });

  it('plays pickup when bottles increase', () => {
    const p = fresh();
    const n = next(p, (s) => { s.players.a.bottles.plastic += 2; });
    expect(detectSounds(p, n, 'all')).toEqual(['pickup']);
  });

  it('plays one pling per deposited bottle', () => {
    const p = next(fresh(), (s) => { s.players.a.bottles.glass = 3; });
    const one = next(p, (s) => { s.players.a.bottles.glass = 2; s.players.a.money += 15; });
    expect(detectSounds(p, one, 'all')).toEqual(['pling']);
    const three = next(p, (s) => { s.players.a.bottles.glass = 0; s.players.a.money += 45; });
    expect(detectSounds(p, three, 'all')).toEqual(['pling', 'pling', 'pling']);
  });

  it('caps the plings of one frame at four', () => {
    const p = next(fresh(), (s) => { s.players.a.bottles.plastic = 10; });
    const n = next(p, (s) => { s.players.a.bottles.plastic = 0; s.players.a.money += 80; });
    expect(detectSounds(p, n, 'all')).toEqual(['pling', 'pling', 'pling', 'pling']);
  });

  it('plays plings only for audible players and not for a robbery', () => {
    const p = next(fresh(), (s) => { s.players.a.bottles.plastic = 2; });
    const deposit = next(p, (s) => { s.players.a.bottles.plastic = 1; s.players.a.money += 8; });
    expect(detectSounds(p, deposit, ['b'])).toEqual([]);
    const robbed = next(p, (s) => { s.players.a.bottles.plastic = 1; });
    expect(detectSounds(p, robbed, ['a'])).not.toContain('pling');
  });

  it('plays buy for spending', () => {
    const p = next(fresh(), (s) => { s.players.a.money = 1000; });
    expect(detectSounds(p, next(p, (s) => { s.players.a.money -= 300; }), 'all')).toEqual(['buy']);
  });

  it('does not play buy when the player loses money by being knocked out', () => {
    const p = next(fresh(), (s) => { s.players.a.money = 1000; });
    const n = next(p, (s) => { s.players.a.money = 750; s.players.a.health = 0; s.players.a.unconsciousMs = 10000; });
    const r = detectSounds(p, n, 'all');
    expect(r).toContain('knockout');
    expect(r).not.toContain('buy');
  });

  it('plays no stealSuccess when an awake player loses bottles and gets a shield', () => {
    const p = next(fresh(), (s) => {
      s.players.b.bottles.plastic = 4;
    });
    const n = next(p, (s) => {
      s.players.b.bottles.plastic = 2;
      s.players.b.shieldMs = CONFIG.health.spawnShieldMs;
      s.players.a.bottles.plastic = 2;
    });
    expect(detectSounds(p, n, ['b'])).toEqual([]);
    expect(detectSounds(p, n, ['a'])).toEqual(['pickup']);
  });

  it('still plays pickup when the bottle gain is not a robbery', () => {
    const p = fresh();
    const n = next(p, (s) => {
      s.players.a.bottles.plastic = 2;
    });
    expect(detectSounds(p, n, ['a'])).toEqual(['pickup']);
  });

  it('copies items and the food find so the local game sees changes', () => {
    const s = fresh();
    s.players.a.items.dog_treat = 2;
    s.players.a.lastFood = { n: 1, spot: 'bin', text: 0, full: false };
    const copy = snapshotForSound(s);
    s.players.a.items.dog_treat = 1;
    s.players.a.lastFood.n = 2;
    expect(copy.players.a.items.dog_treat).toBe(2);
    expect(copy.players.a.lastFood!.n).toBe(1);
  });

  it('plays bite on a large health drop but not on hunger', () => {
    const p = fresh();
    expect(detectSounds(p, next(p, (s) => { s.players.a.health -= CONFIG.npc.dog.biteDamage; }), 'all')).toEqual(['bite']);
    expect(detectSounds(p, next(p, (s) => { s.players.a.health -= 0.05; }), 'all')).toEqual([]);
  });

  it('plays bite and knockout when a bite knocks the player out near a dog', () => {
    const p = next(fresh(), (s) => {
      s.players.a.health = 5;
      s.npcs = [npc({ x: s.players.a.x + 3, y: s.players.a.y })];
    });
    const n = next(p, (s) => { s.players.a.health = 0; s.players.a.unconsciousMs = 10000; });
    expect(detectSounds(p, n, 'all').sort()).toEqual(['bite', 'knockout']);
  });

  it('plays only knockout when hunger knocks the player out', () => {
    const p = next(fresh(), (s) => { s.players.a.health = 0.01; });
    const n = next(p, (s) => { s.players.a.health = 0; s.players.a.unconsciousMs = 10000; });
    expect(detectSounds(p, n, 'all')).toEqual(['knockout']);
  });

  it('plays policeCheck when a check starts', () => {
    const p = next(fresh(), (s) => { s.npcs = [npc({ kind: 'police', targetId: 'a', checkMs: 0 })]; });
    const n = next(p, (s) => { s.npcs[0].checkMs = 16; });
    expect(detectSounds(p, n, 'all')).toEqual(['policeCheck']);
    expect(detectSounds(p, n, ['b'])).toEqual([]);
    expect(detectSounds(n, snapshotForSound(n), 'all')).toEqual([]);
  });

  it('plays zoneAnnounced for everyone when a zone leaves idle', () => {
    const p = fresh();
    const n = next(p, (s) => { s.zones[0].phase = 'announced'; });
    expect(detectSounds(p, n, ['b'])).toEqual(['zoneAnnounced']);
    const active = next(n, (s) => { s.zones[0].phase = 'active'; });
    expect(detectSounds(n, active, 'all')).toEqual([]);
  });

  it('plays roundEnd once when the phase flips to ended', () => {
    const p = fresh();
    const n = next(p, (s) => { s.phase = 'ended'; s.timeLeftMs = 0; });
    expect(detectSounds(p, n, ['b'])).toEqual(['roundEnd']);
    expect(detectSounds(n, snapshotForSound(n), 'all')).toEqual([]);
  });

  it('ticks once per second in the last 10 seconds only while running', () => {
    const base = fresh();
    const at = (ms: number) => next(base, (s) => { s.timeLeftMs = ms; });
    expect(detectSounds(at(30000), at(29984), 'all')).toEqual([]);
    expect(detectSounds(at(11010), at(10990), 'all')).toEqual([]);
    expect(detectSounds(at(10010), at(9990), 'all')).toEqual(['tick']);
    expect(detectSounds(at(9500), at(9490), 'all')).toEqual([]);
    expect(detectSounds(at(5010), at(4990), 'all')).toEqual(['tick']);
    expect(detectSounds(at(1010), at(990), 'all')).toEqual(['tick']);
    // Ende: roundEnd, kein Tick
    const end = next(at(16), (s) => { s.timeLeftMs = 0; s.phase = 'ended'; });
    expect(detectSounds(at(16), end, 'all')).toEqual(['roundEnd']);
    // 16-ms-Schritte durch die letzten 10 s: genau 9 Ticks (10 s bis 1 s, der Übergang 1 -> 0 ist roundEnd)
    let count = 0;
    for (let t = 10000; t > 0; t -= 16) count += detectSounds(at(t), at(Math.max(0, t - 16)), 'all').length;
    expect(count).toBeGreaterThanOrEqual(9);
    expect(count).toBeLessThanOrEqual(10);
  });

  it('filters personal sounds to the audible players but not global ones', () => {
    const p = fresh();
    const n = next(p, (s) => {
      s.players.a.bottles.plastic += 1;
      s.zones[0].phase = 'announced';
    });
    expect(detectSounds(p, n, ['b'])).toEqual(['zoneAnnounced']);
    expect(detectSounds(p, n, ['a']).sort()).toEqual(['pickup', 'zoneAnnounced']);
  });

  it('returns each id at most once (except one pling per bottle)', () => {
    const p = fresh();
    const n = next(p, (s) => {
      s.players.a.bottles.plastic += 1;
      s.players.b.bottles.glass += 1;
    });
    expect(detectSounds(p, n, 'all')).toEqual(['pickup']);
  });
});

describe('snapshotForSound', () => {
  it('is independent from later mutations of the source', () => {
    const s = fresh();
    const copy = snapshotForSound(s);
    s.players.a.bottles.plastic = 9;
    s.timeLeftMs = 1;
    expect(copy.players.a.bottles.plastic).toBe(0);
    expect(copy.timeLeftMs).not.toBe(1);
  });
});

describe('plingStep', () => {
  it('starts at 0 without a previous pling', () => {
    expect(plingStep(null, 1000, 5)).toBe(0);
  });

  it('rises by one while plings follow each other closely', () => {
    expect(plingStep(1000, 1150, 0)).toBe(1);
    expect(plingStep(1150, 1300, 1)).toBe(2);
    expect(plingStep(1000, 1000 + PLING_RESET_MS, 3)).toBe(4);
  });

  it('resets after a pause', () => {
    expect(plingStep(1000, 1001 + PLING_RESET_MS, 4)).toBe(0);
  });

  it('caps at the highest step', () => {
    expect(PLING_MAX_STEP).toBe(7);
    expect(plingStep(1000, 1100, PLING_MAX_STEP)).toBe(PLING_MAX_STEP);
    let step = 0;
    let last: number | null = null;
    for (let t = 0; t < 30 * 150; t += 150) {
      step = plingStep(last, t, step);
      last = t;
    }
    expect(step).toBe(PLING_MAX_STEP);
  });
});

describe('detectSeizures', () => {
  /** Polizist beendet die Kontrolle: Spieler a verliert Flaschen, der Polizist lässt a nun in Ruhe. */
  function seized(): [GameState, GameState] {
    const p = next(fresh(), (s) => {
      s.players.a.bottles = { plastic: 3, glass: 2, crate: 0 };
      s.npcs = [npc({ kind: 'police', targetId: 'a', checkMs: 1980 })];
    });
    const n = next(p, (s) => {
      s.players.a.bottles = { plastic: 0, glass: 2, crate: 0 };
      Object.assign(s.npcs[0], { mood: 'roaming', targetId: null, checkMs: 0, restId: 'a', restMs: 20000 });
    });
    return [p, n];
  }

  it('reports how many bottles the police took', () => {
    const [p, n] = seized();
    expect(detectSeizures(p, n, 'all')).toEqual([{ id: 'a', count: 3 }]);
    expect(detectSeizures(p, n, ['a'])).toEqual([{ id: 'a', count: 3 }]);
    expect(detectSeizures(p, n, ['b'])).toEqual([]);
    expect(detectSeizures(null, n, 'all')).toEqual([]);
    expect(detectSeizures(n, snapshotForSound(n), 'all')).toEqual([]);
  });

  it('plays policeSeize for the affected player only', () => {
    const [p, n] = seized();
    expect(detectSounds(p, n, 'all')).toEqual(['policeSeize']);
    expect(detectSounds(p, n, ['b'])).toEqual([]);
  });

  it('ignores bottle losses without a police npc (robbery, deposit) and a dog resting on the player', () => {
    const p = next(fresh(), (s) => {
      s.players.a.bottles = { plastic: 3, glass: 0, crate: 0 };
      s.npcs = [npc({ kind: 'dog', targetId: 'a' })];
    });
    const n = next(p, (s) => {
      s.players.a.bottles.plastic = 1;
      Object.assign(s.npcs[0], { restId: 'a', restMs: 20000 });
    });
    expect(detectSeizures(p, n, 'all')).toEqual([]);
  });

  it('detects a real confiscation from the core, also through the online snapshot', () => {
    const map = parseMap(['##########', '#@.......#', '##########']);
    const s = createGame(1, map, ['a'], { countdownMs: 0 });
    s.nextNpcMs = 1e9;
    s.players.a.items.bag = 3;
    s.players.a.bottles = { plastic: 4, glass: 0, crate: 0 };
    s.npcs.push(npc({ id: 1, kind: 'police', x: 40, y: 24, lifeMs: 30000 }));
    let prevLocal = snapshotForSound(s);
    let prevOnline = stateFromSnapshot(map, projectSnapshot(s, 'a'));
    const local: unknown[] = [];
    const online: unknown[] = [];
    for (let t = 0; t < 150; t++) {
      step(s, {}, 20);
      const nowLocal = snapshotForSound(s);
      local.push(...detectSeizures(prevLocal, nowLocal, 'all'));
      prevLocal = nowLocal;
      if (t % 3 === 0) {
        // online kommt nur jeder dritte Zustand an (20 Hz)
        const nowOnline = stateFromSnapshot(map, projectSnapshot(s, 'a'));
        online.push(...detectSeizures(prevOnline, nowOnline, ['a']));
        prevOnline = nowOnline;
      }
    }
    expect(local).toEqual([{ id: 'a', count: 2 }]);
    expect(online).toEqual([{ id: 'a', count: 2 }]);
  });
});

describe('fight sounds', () => {
  it('plays punch for the own swing only', () => {
    const p = fresh();
    const n = next(p, (s) => { s.players.a.attackCooldownMs = CONFIG.fight.cooldownMs; });
    expect(detectSounds(p, n, ['a'])).toEqual(['punch']);
    expect(detectSounds(p, n, ['b'])).toEqual([]);
  });

  it('plays hit instead of bite when an opponent in reach swung', () => {
    const p = next(fresh(), (s) => {
      s.players.b.x = s.players.a.x + 10;
      s.players.b.y = s.players.a.y;
    });
    const n = next(p, (s) => {
      s.players.b.attackCooldownMs = CONFIG.fight.cooldownMs;
      s.players.a.health -= CONFIG.fight.damage;
    });
    expect(detectSounds(p, n, ['a'])).toEqual(['hit']);
  });

  it('plays stealSuccess and no pickup for the robber of a knocked-out player', () => {
    const p = next(fresh(), (s) => {
      s.players.b.bottles.plastic = 4;
      s.players.b.unconsciousMs = 10000;
      s.players.b.health = 0;
    });
    const n = next(p, (s) => {
      s.players.b.bottles.plastic = 2;
      s.players.b.robbed = true;
      s.players.a.bottles.plastic = 2;
    });
    expect(detectSounds(p, n, ['a'])).toEqual(['stealSuccess']);
  });

  it('plays stealSuccess for a robbery that takes everything', () => {
    const p = next(fresh(), (s) => {
      s.players.b.bottles.glass = 3;
      s.players.b.unconsciousMs = 10000;
      s.players.b.health = 0;
    });
    const n = next(p, (s) => {
      s.players.b.bottles.glass = 0;
      s.players.b.robbed = true;
      s.players.a.bottles.glass = 3;
    });
    expect(detectSounds(p, n, ['a'])).toEqual(['stealSuccess']);
    expect(detectSounds(p, n, ['x'])).toEqual([]);
  });

  it('plays stealSuccess when the victim still shows bottles (online view hides the exact count)', () => {
    const p = next(fresh(), (s) => {
      s.players.b.bottles.plastic = 1; // online: nur 'hat Flaschen'
      s.players.b.unconsciousMs = 10000;
      s.players.b.health = 0;
    });
    const n = next(p, (s) => {
      s.players.b.bottles.plastic = 1;
      s.players.b.robbed = true;
      s.players.a.bottles.plastic = 3;
    });
    expect(detectSounds(p, n, ['a'])).toEqual(['stealSuccess']);
  });
});

describe('detectFoodFinds', () => {
  const find = (n: number, full = false) => ({ n, spot: 'bin' as const, text: 1, full });

  it('shows the text once when the own counter goes up', () => {
    const p = fresh();
    const n = next(p, (s) => { s.players.a.lastFood = find(1); });
    expect(detectFoodFinds(p, n, ['a'])).toEqual([{ id: 'a', text: 'Halber Döner aus der Tonne. Schmeckt erstaunlich okay.' }]);
    expect(detectFoodFinds(n, snapshotForSound(n), ['a'])).toEqual([]);
  });

  it('shows the latest find when two happen between two states, with the full suffix', () => {
    const p = next(fresh(), (s) => { s.players.a.lastFood = find(1); });
    const n = next(p, (s) => { s.players.a.lastFood = find(3, true); });
    expect(detectFoodFinds(p, n, 'all')).toEqual([
      { id: 'a', text: 'Halber Döner aus der Tonne. Schmeckt erstaunlich okay. Aber du bist schon satt.' },
    ]);
  });

  it('never shows a foreign find and nothing without a previous state', () => {
    const p = fresh();
    const n = next(p, (s) => { s.players.b.lastFood = find(1); });
    expect(detectFoodFinds(p, n, ['a'])).toEqual([]);
    expect(detectFoodFinds(null, n, 'all')).toEqual([]);
  });

  it('works through the online projection only for the finder', () => {
    const s = createGame(1, CITY_MAP, ['a', 'b'], { countdownMs: 0 });
    const before = stateFromSnapshot(CITY_MAP, projectSnapshot(s, 'a'));
    s.players.a.lastFood = find(1);
    s.players.b.lastFood = find(1);
    const after = stateFromSnapshot(CITY_MAP, projectSnapshot(s, 'a'));
    expect(detectFoodFinds(before, after, ['a']).map((f) => f.id)).toEqual(['a']);
  });
});
