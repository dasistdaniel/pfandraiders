import { describe, expect, it } from 'vitest';
import { totalBottles } from '../src/bottles';
import { CONFIG } from '../src/config';
import { createGame } from '../src/game';
import { damage } from '../src/health';
import { parseMap } from '../src/map';
import { isBeingChecked } from '../src/npc';
import type { GameState, Npc, NpcKind, Point } from '../src/types';
import { input, newGame, openRows, runFor, runSteps, SEARCH_ROWS, teleport } from './helpers';

function quiet(s: GameState): GameState {
  s.nextNpcMs = 1e9; // keine Zufalls-Spawns in diesem Test
  return s;
}

function addNpc(s: GameState, kind: NpcKind, x: number, y: number): Npc {
  const npc: Npc = {
    id: s.nextNpcId++,
    kind,
    x,
    y,
    lifeMs: 30000,
    mood: 'active',
    moodMs: 0,
    targetId: null,
    cooldownMs: 0,
    distractedMs: 0,
    checkMs: 0,
  };
  s.npcs.push(npc);
  return npc;
}

function leaving(npc: Npc): Npc {
  npc.mood = 'leaving';
  npc.moodMs = 0;
  return npc;
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Offene Karte 30x5 mit zwei Eingängen: nah bei (168,56), fern bei (456,24). Spieler bei (24,24). */
const TWO_ENTRANCES = (() => {
  const rows = openRows(30, 5).map((r) => r.split(''));
  rows[3][10] = 'N';
  rows[1][28] = 'N';
  return rows.map((r) => r.join(''));
})();
const NEAR_ENTRANCE = { x: 10 * 16 + 8, y: 3 * 16 + 8 };

describe('dog', () => {
  it('chases the nearest conscious player at dog speed', () => {
    const s = quiet(newGame(openRows(30, 5)));
    const dog = addNpc(s, 'dog', 150, 24);
    runSteps(s, {}, 25, 20); // 500 ms
    expect(dog.x).toBeCloseTo(150 - (CONFIG.npc.dog.speed * 500) / 1000, 3);
    expect(dog.targetId).toBe('p1');
  });

  it('ignores players beyond its sense radius', () => {
    const s = quiet(newGame(openRows(30, 5)));
    const dog = addNpc(s, 'dog', 24 + CONFIG.npc.dog.senseRadius + 60, 24);
    const x = dog.x;
    runSteps(s, {}, 25, 20);
    expect(dog.x).toBe(x);
    expect(dog.targetId).toBeNull();
  });

  it('bites once, then sits for sitMs without biting, moving or despawning', () => {
    const s = quiet(newGame(openRows(30, 5)));
    const dog = addNpc(s, 'dog', 30, 24);
    runSteps(s, {}, 3, 20);
    const afterBite = s.players.p1.health;
    expect(afterBite).toBeCloseTo(CONFIG.health.max - CONFIG.npc.dog.biteDamage, 1);
    expect(dog.mood).toBe('idle');
    expect(dog.moodMs).toBeGreaterThan(CONFIG.npc.dog.sitMs - 100);
    expect(dog.targetId).toBeNull();
    const at = { x: dog.x, y: dog.y };
    runFor(s, {}, CONFIG.npc.dog.sitMs - 200); // Spieler steht direkt daneben
    expect(s.players.p1.health).toBeGreaterThan(afterBite - 2); // höchstens Hunger, kein Biss
    expect(s.npcs).toHaveLength(1);
    expect(dog.mood).toBe('idle');
    expect({ x: dog.x, y: dog.y }).toEqual(at);
    expect(dog.targetId).toBeNull();
    runFor(s, {}, 400);
    expect(dog.mood).toBe('leaving');
  });

  it('does not chase a second player while sitting', () => {
    const s = quiet(newGame(openRows(30, 5), ['p1', 'p2']));
    const dog = addNpc(s, 'dog', 30, 24);
    teleport(s, 'p2', { x: 130, y: 24 });
    runSteps(s, {}, 3, 20); // p1 gebissen
    expect(dog.mood).toBe('idle');
    const x = dog.x;
    runFor(s, {}, 2000);
    expect(dog.x).toBe(x);
    expect(dog.targetId).toBeNull();
    expect(s.players.p2.health).toBeGreaterThan(CONFIG.health.max - 2);
  });

  it('keeps sitting while the bitten player is unconscious', () => {
    const s = quiet(newGame(openRows(30, 5)));
    const dog = addNpc(s, 'dog', 30, 24);
    runSteps(s, {}, 3, 20);
    s.players.p1.health = 1;
    damage(s.players.p1, 5); // umfallen
    runFor(s, {}, 1000);
    expect(dog.mood).toBe('idle');
    expect(dog.moodMs).toBeLessThan(CONFIG.npc.dog.sitMs - 900);
  });

  it('a treat distracts the dog without making it sit', () => {
    const s = quiet(newGame(openRows(30, 5)));
    s.players.p1.item = 'dog_treat';
    const dog = addNpc(s, 'dog', 30, 24);
    runSteps(s, {}, 3, 20);
    expect(dog.mood).toBe('active');
    expect(dog.distractedMs).toBeGreaterThan(0);
  });

  it('interrupts the search of the bitten player', () => {
    const s = quiet(newGame(SEARCH_ROWS));
    s.spots[0].contents = { plastic: 1, glass: 0, crate: 0 };
    runSteps(s, { p1: input({ action: true }) }, 50, 20);
    expect(s.players.p1.searchProgressMs).toBe(1000);
    addNpc(s, 'dog', 30, 24);
    runSteps(s, { p1: input({ action: true }) }, 1, 20);
    expect(s.players.p1.searchProgressMs).toBe(0);
    expect(s.players.p1.searchSpotId).toBeNull();
  });

  it('is distracted by a treat instead of biting, and the treat is used up', () => {
    const s = quiet(newGame(openRows(30, 5)));
    s.players.p1.item = 'dog_treat';
    const dog = addNpc(s, 'dog', 30, 24);
    runSteps(s, {}, 3, 20);
    expect(s.players.p1.item).toBeNull();
    expect(s.players.p1.health).toBeGreaterThan(CONFIG.health.max - 1);
    expect(dog.distractedMs).toBeGreaterThan(CONFIG.npc.dog.distractedMs - 100);
    runFor(s, {}, 3000); // beschäftigt: kein Biss
    expect(s.players.p1.health).toBeGreaterThan(CONFIG.health.max - 1);
  });

  it('bites after the treat distraction is over and then sits', () => {
    const s = quiet(newGame(openRows(30, 5)));
    s.players.p1.item = 'dog_treat';
    const dog = addNpc(s, 'dog', 30, 24);
    runFor(s, {}, CONFIG.npc.dog.distractedMs + 200);
    expect(s.players.p1.health).toBeLessThan(CONFIG.health.max - 10);
    expect(dog.mood).toBe('idle');
  });

  it('does not use a bolt cutters item up on a bite', () => {
    const s = quiet(newGame(openRows(30, 5)));
    s.players.p1.item = 'bolt_cutters';
    addNpc(s, 'dog', 30, 24);
    runSteps(s, {}, 3, 20);
    expect(s.players.p1.item).toBe('bolt_cutters');
    expect(s.players.p1.health).toBeLessThan(CONFIG.health.max - 10);
  });

  it('ignores players with protection and bites them once the protection is over', () => {
    const s = quiet(newGame(openRows(30, 5)));
    s.players.p1.shieldMs = 100;
    const dog = addNpc(s, 'dog', 30, 24);
    runSteps(s, {}, 3, 20); // Schutz läuft noch
    expect(dog.targetId).toBeNull();
    expect(s.players.p1.health).toBeGreaterThan(CONFIG.health.max - 1);
    runFor(s, {}, 400); // Schutz vorbei
    expect(s.players.p1.health).toBeLessThan(CONFIG.health.max - 10);
  });

  it('does not target unconscious players', () => {
    const s = quiet(newGame(openRows(30, 5)));
    damage(s.players.p1, 1000);
    const dog = addNpc(s, 'dog', 30, 24);
    runSteps(s, {}, 5, 20);
    expect(dog.targetId).toBeNull();
    expect(s.players.p1.health).toBe(0);
  });

  it('sits instead of despawning when its lifetime runs out', () => {
    const s = quiet(newGame(openRows(30, 5)));
    const dog = addNpc(s, 'dog', 300, 24);
    dog.lifeMs = 100;
    runSteps(s, {}, 6, 20);
    expect(s.npcs).toHaveLength(1);
    expect(dog.mood).toBe('idle');
    expect(dog.moodMs).toBeGreaterThan(CONFIG.npc.dog.sitMs - 100);
  });
});

describe('leaving npcs', () => {
  it('a leaving dog walks at reduced speed straight to the nearest entrance and despawns there', () => {
    const s = quiet(newGame(TWO_ENTRANCES));
    const dog = leaving(addNpc(s, 'dog', 100, 24));
    let d = dist(dog, NEAR_ENTRANCE);
    runSteps(s, {}, 1, 20);
    expect(d - dist(dog, NEAR_ENTRANCE)).toBeCloseTo((CONFIG.npc.dog.speed * 0.6 * 20) / 1000, 3);
    d = dist(dog, NEAR_ENTRANCE);
    let steps = 0;
    while (s.npcs.length > 0 && steps < 500) {
      runSteps(s, {}, 1, 20);
      steps++;
      if (s.npcs.length === 0) break;
      const now = dist(dog, NEAR_ENTRANCE);
      expect(now).toBeLessThan(d);
      expect(dog.targetId).toBeNull();
      d = now;
    }
    expect(s.npcs).toHaveLength(0);
    expect(d).toBeLessThanOrEqual(CONFIG.npc.leaveArriveRadius + 1);
    expect(steps * 20).toBeLessThan(CONFIG.npc.leaveMs);
  });

  it('a leaving dog never bites or targets an adjacent player', () => {
    const s = quiet(newGame(TWO_ENTRANCES));
    const dog = leaving(addNpc(s, 'dog', 26, 24));
    runFor(s, {}, 500);
    expect(dog.targetId).toBeNull();
    expect(s.players.p1.health).toBeGreaterThan(CONFIG.health.max - 1);
  });

  it('despawns after leaveMs when the way to the entrance is blocked', () => {
    const s = quiet(newGame(['#########', '#@.#..N.#', '#########']));
    leaving(addNpc(s, 'dog', 40, 24));
    runFor(s, {}, CONFIG.npc.leaveMs - 100);
    expect(s.npcs).toHaveLength(1);
    runFor(s, {}, 200);
    expect(s.npcs).toHaveLength(0);
  });

  it('despawns after leaveMs on a map without entrances', () => {
    const s = quiet(newGame(openRows(30, 5)));
    const dog = leaving(addNpc(s, 'dog', 200, 40));
    runFor(s, {}, CONFIG.npc.leaveMs - 100);
    expect(s.npcs).toHaveLength(1);
    expect(dog.x).toBe(200);
    runFor(s, {}, 200);
    expect(s.npcs).toHaveLength(0);
  });

  it('a leaving officer ignores players with bottles and walks at police speed', () => {
    const s = quiet(newGame(TWO_ENTRANCES));
    s.players.p1.bottles = { plastic: 4, glass: 0, crate: 0 };
    const cop = leaving(addNpc(s, 'police', 100, 24));
    const d = dist(cop, NEAR_ENTRANCE);
    runSteps(s, {}, 1, 20);
    expect(d - dist(cop, NEAR_ENTRANCE)).toBeCloseTo((CONFIG.npc.police.speed * 20) / 1000, 3);
    expect(cop.targetId).toBeNull();
    expect(isBeingChecked(s, 'p1')).toBe(false);
  });
});

describe('police', () => {
  function carrying(rows = openRows(30, 5)) {
    const s = quiet(newGame(rows));
    s.players.p1.containerLevel = 1;
    s.players.p1.bottles = { plastic: 4, glass: 0, crate: 0 };
    return s;
  }

  it('walks toward a player with bottles, slower than the player', () => {
    const s = carrying();
    const cop = addNpc(s, 'police', 120, 24);
    runSteps(s, {}, 25, 20);
    expect(cop.x).toBeCloseTo(120 - (CONFIG.npc.police.speed * 500) / 1000, 3);
  });

  it('ignores a player without bottles', () => {
    const s = quiet(newGame(openRows(30, 5)));
    const cop = addNpc(s, 'police', 60, 24);
    runSteps(s, {}, 25, 20);
    expect(cop.x).toBe(60);
    expect(cop.targetId).toBeNull();
  });

  it('confiscates half the bottles (rounded up) after the full check and starts leaving', () => {
    const s = carrying();
    const cop = addNpc(s, 'police', 40, 24); // 16 px entfernt, innerhalb des Kontrollradius
    runSteps(s, {}, 50, 20);
    expect(isBeingChecked(s, 'p1')).toBe(true);
    expect(totalBottles(s.players.p1.bottles)).toBe(4);
    runFor(s, {}, CONFIG.npc.police.checkMs);
    expect(totalBottles(s.players.p1.bottles)).toBe(2);
    expect(s.npcs).toHaveLength(1);
    expect(cop.mood).toBe('leaving');
    expect(cop.targetId).toBeNull();
    expect(isBeingChecked(s, 'p1')).toBe(false);
  });

  it('does not check again while leaving and despawns at the entrance', () => {
    const s = carrying(['################', '#@............N#', '################']);
    const cop = addNpc(s, 'police', 40, 24);
    runFor(s, {}, 1000 + CONFIG.npc.police.checkMs);
    expect(cop.mood).toBe('leaving');
    expect(totalBottles(s.players.p1.bottles)).toBe(2);
    runFor(s, {}, 1000);
    expect(cop.x).toBeGreaterThan(60);
    expect(isBeingChecked(s, 'p1')).toBe(false);
    runFor(s, {}, 4000); // reicht bei Polizeitempo bis zum Eingang
    expect(s.npcs).toHaveLength(0);
    expect(totalBottles(s.players.p1.bottles)).toBe(2);
  });

  it('starts leaving instead of despawning when its lifetime runs out', () => {
    const s = quiet(newGame(openRows(30, 5)));
    const cop = addNpc(s, 'police', 300, 24);
    cop.lifeMs = 100;
    runSteps(s, {}, 6, 20);
    expect(s.npcs).toHaveLength(1);
    expect(cop.mood).toBe('leaving');
  });

  it('a check by a leaving officer does not count', () => {
    const s = carrying();
    const cop = leaving(addNpc(s, 'police', 30, 24));
    cop.targetId = 'p1';
    cop.checkMs = 500;
    expect(isBeingChecked(s, 'p1')).toBe(false);
  });

  it('resets the check when the player runs away', () => {
    const s = carrying();
    const cop = addNpc(s, 'police', 40, 24);
    runSteps(s, {}, 50, 20); // 1000 ms Kontrolle
    expect(cop.checkMs).toBeGreaterThan(0);
    runSteps(s, { p1: input({ moveX: 1 }) }, 40, 20); // flieht mit CONFIG.playerSpeed, Polizei ist langsamer
    expect(cop.checkMs).toBe(0);
    expect(isBeingChecked(s, 'p1')).toBe(false);
    expect(totalBottles(s.players.p1.bottles)).toBe(4);
    expect(s.npcs).toHaveLength(1);
  });

  it('restarts the check when the target switches', () => {
    const s = quiet(newGame(openRows(30, 5), ['p1', 'p2']));
    s.players.p1.bottles = { plastic: 4, glass: 0, crate: 0 };
    s.players.p2.bottles = { plastic: 4, glass: 0, crate: 0 };
    teleport(s, 'p1', { x: 60, y: 24 });
    teleport(s, 'p2', { x: 62, y: 24 });
    const cop = addNpc(s, 'police', 60, 24);
    cop.targetId = 'p1';
    cop.checkMs = 1500;
    s.players.p1.bottles = { plastic: 0, glass: 0, crate: 0 };
    runSteps(s, {}, 1, 20);
    expect(cop.targetId).toBe('p2');
    expect(cop.checkMs).toBeLessThanOrEqual(20);
  });
});

describe('npc spawning', () => {
  const SPAWN_ROWS = ['#######', '#@N...#', '#######'];

  it('spawns an active npc at an entrance when the timer runs out and re-arms the timer', () => {
    const s = createGame(1, parseMap(SPAWN_ROWS), ['p1']);
    s.nextNpcMs = 20;
    runSteps(s, {}, 2, 20);
    expect(s.npcs).toHaveLength(1);
    expect(s.npcs[0].mood).toBe('active');
    expect(s.npcs[0].moodMs).toBe(0);
    // spawnt auf dem N-Feld (40) und läuft schon im Spawn-Tick los (höchstens zwei Ticks à 20 ms)
    const maxStep = (Math.max(CONFIG.npc.dog.speed, CONFIG.npc.police.speed) * 40) / 1000;
    expect(s.npcs[0].x).toBeGreaterThanOrEqual(40 - maxStep - 1e-9);
    expect(s.npcs[0].x).toBeLessThanOrEqual(40);
    expect(s.npcs[0].y).toBe(24);
    expect(s.nextNpcMs).toBeGreaterThanOrEqual(CONFIG.npc.spawnEveryMs[0] - 40);
    expect(s.nextNpcMs).toBeLessThanOrEqual(CONFIG.npc.spawnEveryMs[1]);
  });

  it('never exceeds the cap of active npcs', () => {
    const s = createGame(1, parseMap(SPAWN_ROWS), ['p1']);
    for (let i = 0; i < CONFIG.npc.maxCount; i++) addNpc(s, 'dog', 100, 24).lifeMs = 1e9;
    s.nextNpcMs = 20;
    runSteps(s, {}, 2, 20);
    expect(s.npcs).toHaveLength(CONFIG.npc.maxCount);
  });

  it('sitting and leaving npcs do not count toward the active cap', () => {
    const s = createGame(1, parseMap(SPAWN_ROWS), ['p1']);
    for (let i = 0; i < CONFIG.npc.maxCount; i++) {
      const n = addNpc(s, 'dog', 72, 24);
      n.mood = 'idle';
      n.moodMs = 1e9;
    }
    s.nextNpcMs = 20;
    runSteps(s, {}, 2, 20);
    expect(s.npcs).toHaveLength(CONFIG.npc.maxCount + 1);
    expect(s.npcs.filter((n) => n.mood === 'active')).toHaveLength(1);
  });

  it('never exceeds the hard cap of all npcs', () => {
    const s = createGame(1, parseMap(SPAWN_ROWS), ['p1']);
    for (let i = 0; i < CONFIG.npc.maxTotal; i++) {
      const n = addNpc(s, 'dog', 72, 24);
      n.mood = 'idle';
      n.moodMs = 1e9;
    }
    s.nextNpcMs = 20;
    runSteps(s, {}, 2, 20);
    expect(s.npcs).toHaveLength(CONFIG.npc.maxTotal);
  });

  it('spawns nothing on a map without entrances', () => {
    const s = createGame(1, parseMap(['#####', '#@..#', '#####']), ['p1']);
    s.nextNpcMs = 20;
    runSteps(s, {}, 2, 20);
    expect(s.npcs).toHaveLength(0);
  });
});
