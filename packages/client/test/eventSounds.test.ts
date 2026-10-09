import { capacityOf, CITY_MAP, CONFIG, createGame } from '@pfandraiders/core';
import type { GameState, Npc, RosterEntry } from '@pfandraiders/core';
import { describe, expect, it } from 'vitest';
import type { SoundId } from '../src/audioIds';
import {
  chatSound,
  detectEventSounds,
  errorSound,
  mergeSounds,
  preferAlternatives,
  rosterSounds,
  searchLoopKeys,
} from '../src/eventSounds';

function fresh(): GameState {
  const s = createGame(1, CITY_MAP, ['a', 'b'], { countdownMs: 0 });
  // Spieler weit weg von Spots, Automaten und voneinander, damit nur der Test etwas auslöst
  s.players.a.x = 5;
  s.players.a.y = 5;
  s.players.b.x = 400;
  s.players.b.y = 5;
  s.npcs = [];
  return s;
}

/** Tiefe Kopie (Karte geteilt), auf die der Test Änderungen anwendet. */
function next(prev: GameState, edit: (s: GameState) => void): GameState {
  const { map, ...rest } = prev;
  const s = { ...structuredClone(rest), map } as GameState;
  edit(s);
  return s;
}

function npc(over: Partial<Npc>): Npc {
  return {
    id: 99, kind: 'dog', x: 300, y: 300, lifeMs: 1000, mood: 'roaming', moodMs: 0, targetId: null, restId: null, restMs: 0, pauseMs: 0, wanderX: 0, wanderY: 0, wanderRef: 0, cooldownMs: 0, distractedMs: 0, checkMs: 0, pathX: 0, pathY: 0, pathMs: 0,
    ...over,
  };
}

const detect = (p: GameState, n: GameState, own: string[] | 'all' = 'all'): SoundId[] => detectEventSounds(p, n, own);

describe('detectEventSounds', () => {
  it('is silent without previous state and when nothing changed', () => {
    const s = fresh();
    expect(detect(s, s)).toEqual([]);
    expect(detectEventSounds(null, s, 'all')).toEqual([]);
    expect(detect(s, next(s, () => undefined))).toEqual([]);
  });

  it('revive when the knockout ends, robbed when the own knocked-out player gets robbed', () => {
    const ko = next(fresh(), (s) => { s.players.a.unconsciousMs = 500; s.players.a.health = 0; });
    expect(detect(ko, next(ko, (s) => { s.players.a.unconsciousMs = 0; s.players.a.health = 60; }))).toEqual(['revive']);
    expect(detect(ko, next(ko, (s) => { s.players.a.robbed = true; }))).toEqual(['robbed']);
    // nur der eigene Spieler hört es
    expect(detect(ko, next(ko, (s) => { s.players.a.robbed = true; }), ['b'])).toEqual([]);
  });

  it('spray_hit when a nearby sprayer fires and health drops by the spray damage', () => {
    const p = next(fresh(), (s) => { s.players.b.x = 20; s.players.b.y = 5; });
    const hit = next(p, (s) => {
      s.players.b.sprayCooldownMs = CONFIG.spray.cooldownMs;
      s.players.a.health -= CONFIG.spray.damage;
      s.players.a.x -= 30;
    });
    expect(detect(p, hit, ['a'])).toEqual(['spray_hit']);
    // mit Schutz: kein Schaden, kein spray_hit
    const shielded = next(p, (s) => { s.players.b.sprayCooldownMs = CONFIG.spray.cooldownMs; });
    expect(detect(p, shielded, ['a'])).toEqual([]);
  });

  it('spray_empty on a new spray press without charges', () => {
    const p = next(fresh(), (s) => { s.players.a.items.pepper = 0; });
    expect(detect(p, next(p, (s) => { s.players.a.sprayHeld = true; }))).toEqual(['spray_empty']);
    const withCharge = next(p, (s) => { s.players.a.items.pepper = 3; });
    expect(detect(withCharge, next(withCharge, (s) => { s.players.a.sprayHeld = true; }))).toEqual([]);
    const held = next(p, (s) => { s.players.a.sprayHeld = true; });
    expect(detect(held, next(held, () => undefined))).toEqual([]);
  });

  it('punch_miss when the own punch hits nobody, not when it lands or meets a shield', () => {
    const p = next(fresh(), (s) => { s.players.b.x = 15; s.players.b.y = 5; });
    const swing = (s: GameState) => { s.players.a.attackCooldownMs = CONFIG.fight.cooldownMs; };
    expect(detect(p, next(p, swing), ['a'])).toEqual(['punch_miss']);
    expect(detect(p, next(p, (s) => { swing(s); s.players.b.health -= CONFIG.fight.damage; }), ['a'])).toEqual([]);
    expect(detect(p, next(p, (s) => { swing(s); s.players.b.shieldMs = 1000; }), ['a'])).toEqual([]);
  });

  it('low_health once when health crosses below 25 %', () => {
    const p = next(fresh(), (s) => { s.players.a.health = 26; });
    const below = next(p, (s) => { s.players.a.health = 24.9; });
    expect(detect(p, below)).toEqual(['low_health']);
    expect(detect(below, next(below, (s) => { s.players.a.health = 20; }))).toEqual([]);
    // Knockout (0 Leben) hat seinen eigenen Ton
    expect(detect(p, next(p, (s) => { s.players.a.health = 0; s.players.a.unconsciousMs = 10000; }))).toEqual([]);
  });

  it('eat and eat_full from the lastFood counter', () => {
    const p = fresh();
    expect(detect(p, next(p, (s) => { s.players.a.lastFood = { n: 1, spot: 'bin', text: 0, full: false }; }))).toEqual(['eat']);
    const ate = next(p, (s) => { s.players.a.lastFood = { n: 1, spot: 'bin', text: 0, full: false }; });
    expect(detect(ate, next(ate, (s) => { s.players.a.lastFood = { n: 2, spot: 'bin', text: 1, full: true }; }))).toEqual(['eat_full']);
  });

  it('search_empty on pressing action next to an empty spot', () => {
    const p = next(fresh(), (s) => {
      const spot = s.spots[0];
      spot.contents = { plastic: 0, glass: 0, crate: 0 };
      s.players.a.x = spot.x;
      s.players.a.y = spot.y;
      // andere Spots weit weg leeren nicht nötig; nur dieser ist in Reichweite
    });
    const press = next(p, (s) => { s.players.a.actionHeld = true; });
    expect(detect(p, press)).toEqual(['search_empty']);
    // gefüllter Spot: die Suche beginnt, kein Ton
    const filled = next(p, (s) => { s.spots[0].contents.plastic = 2; });
    expect(detect(filled, next(filled, (s) => { s.players.a.actionHeld = true; s.players.a.mode = 'searching'; s.players.a.searchSpotId = s.spots[0].id; }))).toEqual([]);
  });

  it('bag_full when the container fills up and when pressing action at a spot while full', () => {
    const p = fresh();
    const cap = capacityOf(p.players.a);
    const almost = next(p, (s) => { s.players.a.bottles.plastic = cap - 1; });
    expect(detect(almost, next(almost, (s) => { s.players.a.bottles.plastic = cap; }))).toEqual(['bag_full']);
    const atSpot = next(p, (s) => {
      s.players.a.bottles.plastic = cap;
      s.spots[0].contents.plastic = 3;
      s.players.a.x = s.spots[0].x;
      s.players.a.y = s.spots[0].y;
    });
    expect(detect(atSpot, next(atSpot, (s) => { s.players.a.actionHeld = true; }))).toEqual(['bag_full']);
  });

  it('deposit_start and deposit_done at the machine', () => {
    const p = next(fresh(), (s) => { s.players.a.bottles.glass = 3; });
    const start = next(p, (s) => { s.players.a.bottles.glass = 2; s.players.a.money += 15; s.players.a.depositMs = 300; });
    expect(detect(p, start)).toEqual(['deposit_start']);
    const middle = next(start, (s) => { s.players.a.bottles.glass = 1; s.players.a.money += 15; s.players.a.depositMs = 200; });
    expect(detect(start, middle)).toEqual([]);
    const done = next(middle, (s) => { s.players.a.bottles.glass = 0; s.players.a.money += 15; s.players.a.depositMs = 0; });
    expect(detect(middle, done)).toEqual(['deposit_done']);
    // eine einzige Flasche: Start und Ende im selben Schritt
    const single = next(fresh(), (s) => { s.players.a.bottles.glass = 1; });
    expect(detect(single, next(single, (s) => { s.players.a.bottles.glass = 0; s.players.a.money += 15; }))).toEqual(['deposit_start', 'deposit_done']);
  });

  it('dog_bark and siren_start when a chase on you starts, not while it goes on', () => {
    const p = next(fresh(), (s) => { s.npcs = [npc({ id: 1 }), npc({ id: 2, kind: 'police' })]; });
    const chase = next(p, (s) => {
      Object.assign(s.npcs[0], { mood: 'active', targetId: 'a' });
      Object.assign(s.npcs[1], { mood: 'active', targetId: 'a' });
    });
    expect(detect(p, chase, ['a'])).toEqual(['dog_bark', 'siren_start']);
    expect(detect(chase, next(chase, () => undefined), ['a'])).toEqual([]);
    expect(detect(p, chase, ['b'])).toEqual([]);
  });

  it('dog_treat when a dog chasing you gets distracted', () => {
    const p = next(fresh(), (s) => { s.npcs = [npc({ id: 1, mood: 'active', targetId: 'a' })]; });
    const treat = next(p, (s) => { s.npcs[0].distractedMs = 3000; s.players.a.items.dog_treat = 0; });
    expect(detect(p, treat, ['a'])).toEqual(['dog_treat']);
    expect(detect(treat, next(treat, (s) => { s.npcs[0].distractedMs = 2000; }), ['a'])).toEqual([]);
    expect(detect(p, treat, ['b'])).toEqual([]);
  });

  it('id_shown when a police officer comes into range but leaves you alone because of the papers', () => {
    const far = next(fresh(), (s) => {
      s.players.a.items.id_papers = 1;
      s.players.a.bottles.plastic = 2;
      s.npcs = [npc({ id: 5, kind: 'police', x: 5 + CONFIG.npc.police.senseRadius + 20, y: 5 })];
    });
    const near = next(far, (s) => { s.npcs[0].x = 5 + CONFIG.npc.police.senseRadius - 10; });
    expect(detect(far, near, ['a'])).toEqual(['id_shown']);
    expect(detect(near, next(near, (s) => { s.npcs[0].x -= 5; }), ['a'])).toEqual([]);
    const noPapers = next(far, (s) => { s.players.a.items.id_papers = 0; });
    expect(detect(noPapers, next(noPapers, (s) => { s.npcs[0].x = 100; }), ['a'])).toEqual([]);
  });

  it('zoneStart and zoneEnd for everybody', () => {
    const p = next(fresh(), (s) => { s.zones[0].phase = 'announced'; });
    const active = next(p, (s) => { s.zones[0].phase = 'active'; });
    expect(detect(p, active, [])).toEqual(['zoneStart']);
    expect(detect(active, next(active, (s) => { s.zones[0].phase = 'idle'; }), [])).toEqual(['zoneEnd']);
  });
});

describe('searchLoopKeys', () => {
  it('lists own searching players while the round runs', () => {
    const s = next(fresh(), (x) => { x.players.a.mode = 'searching'; x.players.b.mode = 'searching'; });
    expect(searchLoopKeys(s, 'all', false)).toEqual(['search:a', 'search:b']);
    expect(searchLoopKeys(s, ['b'], false)).toEqual(['search:b']);
    expect(searchLoopKeys(s, 'all', true)).toEqual([]);
    expect(searchLoopKeys(next(s, (x) => { x.phase = 'ended'; }), 'all', false)).toEqual([]);
    expect(searchLoopKeys(next(s, (x) => { x.countdownMs = 3000; }), 'all', false)).toEqual([]);
    expect(searchLoopKeys(fresh(), 'all', false)).toEqual([]);
  });
});

describe('mergeSounds and preferAlternatives', () => {
  it('dedupes everything but plings', () => {
    expect(mergeSounds(['punch', 'pling', 'pling'], ['punch_miss', 'punch', 'pling'])).toEqual(['punch', 'pling', 'pling', 'punch_miss', 'pling']);
  });

  it('replaces the general sound only when the special one has a file', () => {
    const ids: SoundId[] = ['punch', 'punch_miss', 'buy', 'cart_rent'];
    expect(preferAlternatives(ids, () => false)).toEqual(ids);
    expect(preferAlternatives(ids, (id) => id === 'punch_miss')).toEqual(['punch_miss', 'buy', 'cart_rent']);
    expect(preferAlternatives(ids, (id) => id === 'cart_rent')).toEqual(['punch', 'punch_miss', 'cart_rent']);
    expect(preferAlternatives(['buy'], () => true)).toEqual(['buy']);
  });
});

describe('online sounds', () => {
  const entry = (id: string, connected = true): RosterEntry => ({ id, name: id, color: 0, connected, ready: false, avatar: 0 });

  it('join and leave from roster changes, silent for the first list and for yourself', () => {
    expect(rosterSounds(null, [entry('me'), entry('x')], 'me')).toEqual([]);
    expect(rosterSounds([entry('me')], [entry('me'), entry('x')], 'me')).toEqual(['join']);
    expect(rosterSounds([entry('me'), entry('x')], [entry('me')], 'me')).toEqual(['leave']);
    expect(rosterSounds([entry('me'), entry('x')], [entry('me'), entry('x', false)], 'me')).toEqual(['leave']);
    expect(rosterSounds([entry('me'), entry('x', false)], [entry('me'), entry('x')], 'me')).toEqual(['join']);
    expect(rosterSounds([entry('me', false)], [entry('me')], 'me')).toEqual([]);
    expect(rosterSounds([entry('me'), entry('x')], [entry('me'), entry('y')], 'me')).toEqual(['join', 'leave']);
  });

  it('chat only for other players, errors map to buy_denied or error', () => {
    expect(chatSound({ id: 'x' }, 'me')).toBe('chat');
    expect(chatSound({ id: 'me' }, 'me')).toBeNull();
    expect(errorSound('cannot_buy')).toBe('buy_denied');
    expect(errorSound('wrong_password')).toBe('error');
    expect(errorSound('room_full')).toBe('error');
  });
});
