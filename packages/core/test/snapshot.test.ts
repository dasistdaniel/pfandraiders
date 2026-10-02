import { describe, expect, it } from 'vitest';
import { totalBottles } from '../src/bottles';
import { canBeRobbed, findStealTarget, isBeingRobbed } from '../src/theft';
import { projectSnapshot, stateFromSnapshot } from '../src/snapshot';
import { input, newGame, runSteps, THIEF_ROWS } from './helpers';

function game() {
  const s = newGame(THIEF_ROWS, ['p1', 'p2']);
  s.players.p1.money = 1234;
  s.players.p1.bottles = { plastic: 2, glass: 1, crate: 1 };
  s.players.p1.item = 'bolt_cutters';
  s.players.p1.containerLevel = 1;
  s.players.p2.money = 777;
  s.players.p2.bottles = { plastic: 0, glass: 3, crate: 0 };
  s.players.p2.item = 'dog_treat';
  s.rngState = 987654321;
  s.nextNpcId = 7;
  return s;
}

describe('projectSnapshot', () => {
  it('keeps everything of the viewer', () => {
    const s = game();
    const snap = projectSnapshot(s, 'p1');
    expect(snap.players.p1).toEqual(s.players.p1);
  });

  it('hides money, container contents and item of other players', () => {
    const s = game();
    const other = projectSnapshot(s, 'p1').players.p2;
    expect(other.money).toBe(0);
    expect(other.item).toBeNull();
    expect(other.bottles).toEqual({ plastic: 1, glass: 0, crate: 0 }); // nur "hat Flaschen"
    expect(other.containerLevel).toBe(s.players.p2.containerLevel);
    expect(other.health).toBe(s.players.p2.health);
    expect(other.x).toBe(s.players.p2.x);
  });

  it('shows no bottles for other players with an empty container', () => {
    const s = game();
    s.players.p2.bottles = { plastic: 0, glass: 0, crate: 0 };
    expect(totalBottles(projectSnapshot(s, 'p1').players.p2.bottles)).toBe(0);
  });

  it('never leaks the server random state or timers', () => {
    const snap = projectSnapshot(game(), 'p1');
    expect(snap.rngState).toBe(0);
    expect(snap.nextNpcMs).toBe(0);
    expect(snap.nextNpcId).toBe(0);
    expect(JSON.stringify(snap)).not.toContain('987654321');
  });

  it('does not leak search progress or key state of other players', () => {
    const s = game();
    s.players.p2.searchSpotId = 0;
    s.players.p2.searchProgressMs = 1500;
    s.players.p2.actionHeld = true;
    s.players.p2.stealHeld = true;
    const other = projectSnapshot(s, 'p1').players.p2;
    expect(other.searchSpotId).toBeNull();
    expect(other.searchProgressMs).toBe(0);
    expect(other.actionHeld).toBe(false);
    expect(other.stealHeld).toBe(false);
  });

  it('keeps the public theft warning of other players', () => {
    const s = game();
    s.players.p2.stealTargetId = 'p1';
    s.players.p2.stealProgressMs = 400;
    const snap = projectSnapshot(s, 'p1');
    expect(snap.players.p2.stealTargetId).toBe('p1');
    expect(isBeingRobbed(stateFromSnapshot(s.map, snap), 'p1')).toBe(true);
  });

  it('shows spots only as full or empty', () => {
    const s = game();
    s.spots[0].contents = { plastic: 2, glass: 1, crate: 0 };
    s.spots[0].refillInMs = 12345;
    const spot = projectSnapshot(s, 'p1').spots[0];
    expect(spot.contents).toEqual({ plastic: 1, glass: 0, crate: 0 });
    expect(spot.refillInMs).toBe(0);
    s.spots[0].contents = { plastic: 0, glass: 0, crate: 0 };
    expect(totalBottles(projectSnapshot(s, 'p1').spots[0].contents)).toBe(0);
  });

  it('reveals every player money once the round has ended', () => {
    const s = game();
    s.phase = 'ended';
    const snap = projectSnapshot(s, 'p1');
    expect(snap.players.p2.money).toBe(777);
    expect(snap.players.p1.money).toBe(1234);
    expect(snap.players.p2.bottles.plastic).toBe(1); // Container-Inhalt bleibt auch dann verborgen
    expect(snap.players.p2.item).toBeNull();
  });

  it('does not contain the map and does not alias the server state', () => {
    const s = game();
    const snap = projectSnapshot(s, 'p1');
    expect('map' in snap).toBe(false);
    snap.players.p1.money = 1;
    snap.spots[0].contents.plastic = 99;
    expect(s.players.p1.money).toBe(1234);
    expect(s.spots[0].contents.plastic).not.toBe(99);
  });

  it('survives a JSON round trip unchanged', () => {
    const snap = projectSnapshot(game(), 'p2');
    expect(JSON.parse(JSON.stringify(snap))).toEqual(snap);
  });

  it('keeps the steal hint working for the viewer through the projection', () => {
    const s = game();
    s.players.p1.bottles = { plastic: 0, glass: 0, crate: 0 };
    s.players.p1.containerLevel = 1;
    const view = stateFromSnapshot(s.map, projectSnapshot(s, 'p1'));
    expect(canBeRobbed(view.players.p1, view.players.p2)).toBe(true);
    expect(findStealTarget(view, view.players.p1)?.id).toBe('p2');
  });

  it('still projects correctly after the game has run', () => {
    const s = game();
    s.players.p1.money = 500;
    runSteps(s, { p1: input({ moveX: 1 }) }, 10, 20);
    const snap = projectSnapshot(s, 'p2');
    expect(snap.tick).toBe(10);
    expect(snap.players.p1.x).toBe(s.players.p1.x);
    expect(snap.players.p1.money).toBe(0);
    expect(projectSnapshot(s, 'p1').players.p1.money).toBe(500);
  });
});

// Diese Schlüssellisten pinnen, was ein Snapshot preisgibt. Wer ein Feld zu
// Player, Spot, Npc oder GameState hinzufügt, muss diese Tests bewusst anpassen
// (und in snapshot.ts entscheiden, ob das Feld öffentlich ist).
describe('snapshot key sets', () => {
  const PLAYER_KEYS = [
    'actionHeld', 'bottles', 'containerLevel', 'health', 'id', 'item', 'mode', 'money', 'searchProgressMs',
    'searchSpotId', 'shieldMs', 'spawn', 'stealHeld', 'stealProgressMs', 'stealTargetId', 'unconsciousMs', 'x', 'y',
  ];

  it('pins the keys of own and foreign players', () => {
    const s = game();
    const snap = projectSnapshot(s, 'p1');
    expect(Object.keys(snap.players.p1).sort()).toEqual(PLAYER_KEYS);
    expect(Object.keys(snap.players.p2).sort()).toEqual(PLAYER_KEYS);
  });

  it('pins the keys of the snapshot', () => {
    const snap = projectSnapshot(game(), 'p1');
    expect(Object.keys(snap).sort()).toEqual(
      ['nextNpcId', 'nextNpcMs', 'npcs', 'phase', 'players', 'rngState', 'spots', 'tick', 'timeLeftMs', 'zones'],
    );
  });

  it('pins the keys of spots and npcs', () => {
    const s = game();
    s.npcs.push({ id: 1, kind: 'dog', x: 1, y: 1, lifeMs: 1000, targetId: null, cooldownMs: 0, distractedMs: 0, checkMs: 0 });
    const snap = projectSnapshot(s, 'p1');
    expect(Object.keys(snap.spots[0]).sort()).toEqual(['contents', 'id', 'refillInMs', 'type', 'x', 'y']);
    expect(Object.keys(snap.npcs[0]).sort()).toEqual(
      ['checkMs', 'cooldownMs', 'distractedMs', 'id', 'kind', 'lifeMs', 'targetId', 'x', 'y'],
    );
  });
});

describe('stateFromSnapshot', () => {
  it('puts the map back to build a full GameState', () => {
    const s = game();
    const snap = projectSnapshot(s, 'p1');
    const state = stateFromSnapshot(s.map, snap);
    expect(state.map).toBe(s.map);
    expect(state.tick).toBe(s.tick);
    expect(state.players.p1.money).toBe(1234);
  });
});
