import { describe, expect, it } from 'vitest';
import { totalBottles } from '../src/bottles';
import { canBeLooted, findLootTarget } from '../src/theft';
import { projectSnapshot, stateFromSnapshot } from '../src/snapshot';
import { noItems } from '../src/shop';
import { input, newGame, runSteps, THIEF_ROWS } from './helpers';

function game() {
  const s = newGame(THIEF_ROWS, ['p1', 'p2']);
  s.players.p1.money = 1234;
  s.players.p1.bottles = { plastic: 2, glass: 1, crate: 1 };
  s.players.p1.items.bag = 3;
  s.players.p2.money = 777;
  s.players.p2.bottles = { plastic: 0, glass: 3, crate: 0 };
  s.players.p2.items.dog_treat = 3;
  s.players.p2.items.pepper = 20;
  s.players.p2.sprayCooldownMs = 700;
  s.players.p2.sprayHeld = true;
  s.players.p2.lastFood = { n: 1, spot: 'bin', text: 1, full: false };
  s.players.p2.earnedRound = 55;
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

  it('shows whether a foreign player was robbed but never his food find', () => {
    const s = game();
    s.players.p2.robbed = true;
    const other = projectSnapshot(s, 'p1').players.p2;
    expect(other.robbed).toBe(true);
    expect(other.lastFood).toBeNull();
    expect(projectSnapshot(s, 'p2').players.p2.lastFood).toEqual({ n: 1, spot: 'bin', text: 1, full: false });
  });

  it('shows the spray cooldown of a foreign player (the cloud) but not his spray key or charges', () => {
    const other = projectSnapshot(game(), 'p1').players.p2;
    expect(other.sprayCooldownMs).toBe(700);
    expect(other.sprayHeld).toBe(false);
    expect(other.items.pepper).toBe(0);
  });

  it('shows the attack cooldown of a foreign player but not his attack key', () => {
    const s = game();
    s.players.p2.attackCooldownMs = 300;
    s.players.p2.attackHeld = true;
    const other = projectSnapshot(s, 'p1').players.p2;
    expect(other.attackCooldownMs).toBe(300);
    expect(other.attackHeld).toBe(false);
  });

  it('hides money, container contents and items of other players', () => {
    const s = game();
    const other = projectSnapshot(s, 'p1').players.p2;
    expect(other.money).toBe(0);
    expect(other.items).toEqual(noItems());
    expect(other.earnedRound).toBe(0);
    expect(other.bottles).toEqual({ plastic: 1, glass: 0, crate: 0 }); // nur "hat Flaschen"
    expect(other.health).toBe(s.players.p2.health);
    expect(other.x).toBe(s.players.p2.x);
  });

  it('shows no bottles for other players with an empty container', () => {
    const s = game();
    s.players.p2.bottles = { plastic: 0, glass: 0, crate: 0 };
    expect(totalBottles(projectSnapshot(s, 'p1').players.p2.bottles)).toBe(0);
  });

  it('shows the countdown before the round to everyone', () => {
    const s = game();
    s.countdownMs = 3200;
    expect(projectSnapshot(s, 'p1').countdownMs).toBe(3200);
    expect(projectSnapshot(s, 'p2').countdownMs).toBe(3200);
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

  it('hides the deposit timer of other players but keeps the own one', () => {
    const s = game();
    s.players.p1.depositMs = 90;
    s.players.p2.depositMs = 120;
    const snap = projectSnapshot(s, 'p1');
    expect(snap.players.p1.depositMs).toBe(90);
    expect(snap.players.p2.depositMs).toBe(0);
  });

  it('keeps the public shield of other players', () => {
    const s = game();
    s.players.p2.shieldMs = 2500;
    expect(projectSnapshot(s, 'p1').players.p2.shieldMs).toBe(2500);
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
    expect(snap.players.p2.items.dog_treat).toBe(0); // Besitz bleibt auch dann verborgen
    expect(snap.players.p2.earnedRound).toBe(55);
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

  it('keeps the robbing hint working for the viewer through the projection', () => {
    const s = game();
    s.players.p1.bottles = { plastic: 0, glass: 0, crate: 0 };
    s.players.p1.items.bag = 3;
    s.players.p2.unconsciousMs = 5000;
    s.players.p2.health = 0;
    const view = stateFromSnapshot(s.map, projectSnapshot(s, 'p1'));
    expect(canBeLooted(view.players.p1, view.players.p2)).toBe(true);
    expect(findLootTarget(view, view.players.p1)?.id).toBe('p2');
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
    'actionHeld', 'attackCooldownMs', 'attackHeld', 'bottles', 'depositMs', 'earnedRound', 'earnedTotal',
    'health', 'id', 'items', 'lastFood', 'mode', 'money', 'robbed', 'searchProgressMs', 'searchSpotId',
    'shieldMs', 'spawn', 'sprayCooldownMs', 'sprayHeld', 'stealHeld', 'unconsciousMs', 'x', 'y',
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
      ['countdownMs', 'nextNpcId', 'nextNpcMs', 'npcs', 'phase', 'players', 'rngState', 'spots', 'tick', 'timeLeftMs', 'zones'],
    );
  });

  it('pins the keys of spots and npcs', () => {
    const s = game();
    s.npcs.push({ id: 1, kind: 'dog', x: 1, y: 1, lifeMs: 1000, mood: 'active', moodMs: 0, targetId: null, restId: null, restMs: 0, pauseMs: 0, wanderX: 0, wanderY: 0, wanderRef: 0, cooldownMs: 0, distractedMs: 0, checkMs: 0, pathX: 0, pathY: 0, pathMs: 0 });
    const snap = projectSnapshot(s, 'p1');
    expect(Object.keys(snap.spots[0]).sort()).toEqual(['contents', 'id', 'refillInMs', 'type', 'x', 'y']);
    expect(Object.keys(snap.npcs[0]).sort()).toEqual(
      [
        'checkMs', 'cooldownMs', 'distractedMs', 'id', 'kind', 'lifeMs', 'mood', 'moodMs', 'pathMs', 'pathX', 'pathY', 'pauseMs', 'restId', 'restMs',
        'targetId', 'wanderRef', 'wanderX', 'wanderY', 'x', 'y',
      ],
    );
  });
});

describe('snapshot zone key set', () => {
  it('pins the keys of zones', () => {
    const s = game();
    if (s.zones.length === 0) {
      s.zones.push({ def: { id: 'z', name: 'Z', area: { x: 0, y: 0, w: 1, h: 1 } } as never, phase: 'idle', timerMs: 0 });
    }
    const snap = projectSnapshot(s, 'p1');
    expect(Object.keys(snap.zones[0]).sort()).toEqual(['def', 'phase', 'timerMs']);
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
