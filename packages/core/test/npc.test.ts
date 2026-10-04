import { describe, expect, it } from 'vitest';
import { totalBottles } from '../src/bottles';
import { CONFIG } from '../src/config';
import { createGame } from '../src/game';
import { damage } from '../src/health';
import { boxBlocked, parseMap } from '../src/map';
import { CITY_MAP } from '../src/maps';
import { isBeingChecked } from '../src/npc';
import { step } from '../src/step';
import type { GameState, Input, Npc, NpcKind, Point } from '../src/types';
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
    restId: null,
    restMs: 0,
    pauseMs: 0,
    wanderX: x,
    wanderY: y,
    wanderRef: 0,
    cooldownMs: 0,
    distractedMs: 0,
    checkMs: 0,
  };
  s.npcs.push(npc);
  return npc;
}

/** Streunt, steht gerade am Ziel (sucht sich im nächsten Tick eine Pause aus). */
function roaming(npc: Npc): Npc {
  npc.mood = 'roaming';
  npc.moodMs = 0;
  npc.pauseMs = 0;
  npc.wanderX = npc.x;
  npc.wanderY = npc.y;
  npc.wanderRef = 0;
  return npc;
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Große offene Karte 60x30 (960x480 px), Spieler bei (24,24): weit weg von (600,300). */
const BIG = openRows(60, 30);
const FAR = { x: 600, y: 300 };

describe('dog', () => {
  it('chases the nearest conscious player at dog speed', () => {
    const s = quiet(newGame(openRows(30, 5)));
    const dog = addNpc(s, 'dog', 150, 24);
    runSteps(s, {}, 25, 20); // 500 ms
    expect(dog.x).toBeCloseTo(150 - (CONFIG.npc.dog.speed * 500) / 1000, 3);
    expect(dog.targetId).toBe('p1');
  });

  it('starts roaming when no player is within its sense radius', () => {
    const s = quiet(newGame(BIG));
    const dog = addNpc(s, 'dog', FAR.x, FAR.y);
    runSteps(s, {}, 1, 20);
    expect(dog.mood).toBe('roaming');
    expect(dog.targetId).toBeNull();
    expect(s.players.p1.health).toBeGreaterThan(CONFIG.health.max - 1);
  });

  it('bites once, then sits for sitMs without biting or moving, then roams', () => {
    const s = quiet(newGame(openRows(30, 5)));
    const dog = addNpc(s, 'dog', 30, 24);
    runSteps(s, {}, 3, 20);
    const afterBite = s.players.p1.health;
    expect(afterBite).toBeCloseTo(CONFIG.health.max - CONFIG.npc.dog.biteDamage, 1);
    expect(dog.mood).toBe('idle');
    expect(dog.moodMs).toBeGreaterThan(CONFIG.npc.dog.sitMs - 100);
    expect(dog.targetId).toBeNull();
    expect(dog.restId).toBe('p1');
    const at = { x: dog.x, y: dog.y };
    runFor(s, {}, CONFIG.npc.dog.sitMs - 200); // Spieler steht direkt daneben
    expect(s.players.p1.health).toBeGreaterThan(afterBite - 2); // höchstens Hunger, kein Biss
    expect(s.npcs).toHaveLength(1);
    expect(dog.mood).toBe('idle');
    expect({ x: dog.x, y: dog.y }).toEqual(at);
    expect(dog.targetId).toBeNull();
    runFor(s, {}, 400);
    expect(dog.mood).toBe('roaming');
    expect(s.npcs).toHaveLength(1);
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
    expect(dog.restId).toBeNull();
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
    runFor(s, {}, 600); // Schutz vorbei: der streunende Hund jagt wieder
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

  it('gives up after its stamina: sits, leaves that player alone, never despawns', () => {
    const s = quiet(newGame(openRows(30, 5)));
    const dog = addNpc(s, 'dog', 150, 24);
    dog.lifeMs = 100;
    runSteps(s, {}, 6, 20);
    expect(s.npcs).toHaveLength(1);
    expect(dog.mood).toBe('idle');
    expect(dog.moodMs).toBeGreaterThan(CONFIG.npc.dog.sitMs - 100);
    expect(dog.restId).toBe('p1');
    expect(dog.restMs).toBeGreaterThan(CONFIG.npc.restMs - 100);
  });
});

describe('roaming npcs', () => {
  it('never despawn over 10 simulated minutes and stay inside the map, never in solid tiles', () => {
    const s = createGame(3, CITY_MAP, ['a', 'b'], { roundMs: 700000 });
    s.nextNpcMs = 100;
    const idle: Input = { moveX: 0, moveY: 0, action: false, steal: false, buy: null };
    let count = 0;
    const seen = new Set<string>();
    const bad: string[] = [];
    for (let t = 0; t < 6000; t++) {
      step(s, { a: idle, b: idle }, 100);
      expect(s.npcs.length).toBeGreaterThanOrEqual(count);
      expect(s.npcs.length).toBeLessThanOrEqual(CONFIG.npc.maxTotal);
      count = s.npcs.length;
      for (const n of s.npcs) {
        seen.add(n.mood);
        const inside = n.x > 0 && n.y > 0 && n.x < s.map.cols * 16 && n.y < s.map.rows * 16;
        if (!inside || boxBlocked(s.map, n.x, n.y, CONFIG.playerHalf)) bad.push(`${t}: npc ${n.id} at ${n.x},${n.y}`);
      }
    }
    expect(bad).toEqual([]);
    expect(count).toBe(CONFIG.npc.maxTotal);
    expect(seen.has('roaming')).toBe(true);
  });

  it('wanders: moves away from where it stands, stays within the wander radius on the first leg, then pauses', () => {
    const s = quiet(newGame(BIG));
    const dog = roaming(addNpc(s, 'dog', FAR.x, FAR.y));
    runSteps(s, {}, 1, 20); // am Ziel: Pause
    expect(dog.pauseMs).toBeGreaterThanOrEqual(CONFIG.npc.wanderPauseMs[0] - 20);
    const start = { x: dog.x, y: dog.y };
    runFor(s, {}, CONFIG.npc.wanderPauseMs[0] - 100);
    expect({ x: dog.x, y: dog.y }).toEqual(start); // steht während der Pause
    runFor(s, {}, CONFIG.npc.wanderPauseMs[1]); // Pause sicher vorbei, erstes Wegstück
    let maxD = 0;
    for (let i = 0; i < 60; i++) {
      runSteps(s, {}, 1, 20);
      maxD = Math.max(maxD, dist(dog, start));
      expect(dist({ x: dog.wanderX, y: dog.wanderY }, start)).toBeLessThanOrEqual(CONFIG.npc.wanderRadius + 1e-9);
    }
    expect(maxD).toBeGreaterThan(1);
    expect(maxD).toBeLessThanOrEqual(CONFIG.npc.wanderRadius + 1e-9);
    expect(dog.mood).toBe('roaming');
  });

  it('walks at the reduced roaming speed', () => {
    const s = quiet(newGame(BIG));
    const cop = roaming(addNpc(s, 'police', FAR.x, FAR.y));
    cop.wanderX = FAR.x + 70;
    cop.wanderRef = 70;
    runSteps(s, {}, 1, 20);
    expect(cop.x - FAR.x).toBeCloseTo((CONFIG.npc.police.speed * CONFIG.npc.police.roamSpeedMult * 20) / 1000, 6);
    const dog = roaming(addNpc(s, 'dog', FAR.x, FAR.y + 40));
    dog.wanderX = FAR.x + 70;
    dog.wanderRef = 70;
    runSteps(s, {}, 1, 20);
    expect(dog.x - FAR.x).toBeCloseTo((CONFIG.npc.dog.speed * CONFIG.npc.dog.roamSpeedMult * 20) / 1000, 6);
  });

  it('pauses and picks a new target when a wall blocks the way', () => {
    // 1 Kachel hoher Gang, Wand bei Spalte 5 (x 80-96), Ziel dahinter bei x=120. Spieler ohne Flaschen.
    const s = quiet(newGame(['##########', '#@...#...#', '##########']));
    const cop = roaming(addNpc(s, 'police', 56, 24));
    cop.wanderX = 120;
    cop.wanderRef = 64;
    runFor(s, {}, 600); // an der Wand angekommen
    expect(cop.x).toBeLessThan(80 - CONFIG.playerHalf);
    expect(cop.pauseMs).toBe(0);
    runFor(s, {}, CONFIG.npc.wanderStuckMs); // steckt fest
    expect(cop.pauseMs).toBeGreaterThan(0);
    runFor(s, {}, CONFIG.npc.wanderPauseMs[1] + 100);
    expect(cop.wanderX).not.toBe(120);
    expect(cop.x).toBeLessThan(80 - CONFIG.playerHalf);
  });

  it('a roaming dog leaves the bitten player alone for restMs, then hunts them again', () => {
    const s = quiet(newGame(openRows(30, 5)));
    const dog = addNpc(s, 'dog', 30, 24);
    runSteps(s, {}, 3, 20); // Biss
    const afterBite = s.players.p1.health;
    let ms = 0;
    while (dog.restMs > 20) {
      teleport(s, 'p1', { x: dog.x, y: dog.y }); // steht direkt am Hund
      runSteps(s, {}, 1, 20);
      ms += 20;
      expect(dog.mood).not.toBe('active');
      expect(dog.targetId).toBeNull();
    }
    expect(ms).toBeGreaterThan(CONFIG.npc.restMs - 200);
    expect(s.players.p1.health).toBeGreaterThan(afterBite - 4); // nur Hunger
    teleport(s, 'p1', { x: dog.x, y: dog.y });
    runFor(s, {}, 200);
    expect(s.players.p1.health).toBeLessThan(afterBite - CONFIG.npc.dog.biteDamage + 1);
  });

  it('a roaming dog hunts another player in its sense radius, ignoring the resting one', () => {
    const s = quiet(newGame(openRows(30, 5), ['p1', 'p2']));
    teleport(s, 'p1', { x: 200, y: 24 });
    teleport(s, 'p2', { x: 300, y: 24 });
    const dog = roaming(addNpc(s, 'dog', 210, 24));
    dog.restId = 'p1';
    dog.restMs = 10000;
    runSteps(s, {}, 1, 20);
    expect(dog.mood).toBe('active');
    expect(dog.targetId).toBe('p2');
    expect(dog.lifeMs).toBeGreaterThan(CONFIG.npc.dog.lifeMs - 100);
    runFor(s, {}, 2000);
    expect(s.players.p2.health).toBeLessThan(CONFIG.health.max - 10);
    expect(s.players.p1.health).toBeGreaterThan(CONFIG.health.max - 1);
  });

  it('a roaming dog ignores players beyond its sense radius', () => {
    const s = quiet(newGame(BIG));
    const dog = roaming(addNpc(s, 'dog', FAR.x, FAR.y));
    runFor(s, {}, 3000);
    expect(dog.mood).toBe('roaming');
    expect(dog.targetId).toBeNull();
  });

  it('a roaming officer starts hunting a player with bottles nearby', () => {
    const s = quiet(newGame(openRows(30, 5)));
    s.players.p1.bottles = { plastic: 4, glass: 0, crate: 0 };
    const cop = roaming(addNpc(s, 'police', 120, 24));
    expect(isBeingChecked(s, 'p1')).toBe(false);
    runSteps(s, {}, 1, 20);
    expect(cop.mood).toBe('active');
    expect(cop.targetId).toBe('p1');
    runFor(s, {}, 4000);
    expect(totalBottles(s.players.p1.bottles)).toBe(2);
    expect(cop.mood).toBe('roaming');
  });

  it('a roaming officer with a leftover check timer does not count as checking', () => {
    const s = quiet(newGame(openRows(30, 5)));
    s.players.p1.bottles = { plastic: 4, glass: 0, crate: 0 };
    const cop = roaming(addNpc(s, 'police', 30, 24));
    cop.targetId = 'p1';
    cop.checkMs = 500;
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

  it('ignores a player without bottles and roams instead', () => {
    const s = quiet(newGame(openRows(30, 5)));
    const cop = addNpc(s, 'police', 60, 24);
    runSteps(s, {}, 25, 20);
    expect(cop.targetId).toBeNull();
    expect(cop.mood).toBe('roaming');
  });

  it('confiscates half the bottles (rounded up) after the full check and starts roaming', () => {
    const s = carrying();
    const cop = addNpc(s, 'police', 40, 24); // 16 px entfernt, innerhalb des Kontrollradius
    runSteps(s, {}, 50, 20);
    expect(isBeingChecked(s, 'p1')).toBe(true);
    expect(totalBottles(s.players.p1.bottles)).toBe(4);
    runFor(s, {}, CONFIG.npc.police.checkMs);
    expect(totalBottles(s.players.p1.bottles)).toBe(2);
    expect(s.npcs).toHaveLength(1);
    expect(cop.mood).toBe('roaming');
    expect(cop.targetId).toBeNull();
    expect(cop.restId).toBe('p1');
    expect(isBeingChecked(s, 'p1')).toBe(false);
  });

  it('does not check the same player again for restMs, even standing next to them', () => {
    const s = carrying();
    const cop = addNpc(s, 'police', 40, 24);
    runFor(s, {}, 1000 + CONFIG.npc.police.checkMs);
    expect(cop.mood).toBe('roaming');
    expect(totalBottles(s.players.p1.bottles)).toBe(2);
    let ms = 0;
    while (cop.restMs > 20) {
      teleport(s, 'p1', { x: cop.x, y: cop.y });
      runSteps(s, {}, 1, 20);
      ms += 20;
      expect(isBeingChecked(s, 'p1')).toBe(false);
      expect(cop.mood).toBe('roaming');
    }
    expect(ms).toBeGreaterThan(CONFIG.npc.restMs - 1200);
    expect(totalBottles(s.players.p1.bottles)).toBe(2);
    expect(s.npcs).toHaveLength(1);
    teleport(s, 'p1', { x: cop.x, y: cop.y });
    runSteps(s, {}, 1, 20);
    expect(cop.mood).toBe('active');
    expect(cop.targetId).toBe('p1');
  });

  it('gives up after its stamina and roams, leaving that player alone', () => {
    const s = carrying();
    const cop = addNpc(s, 'police', 140, 24);
    cop.lifeMs = 100;
    runSteps(s, {}, 6, 20);
    expect(s.npcs).toHaveLength(1);
    expect(cop.mood).toBe('roaming');
    expect(cop.restId).toBe('p1');
    runFor(s, {}, 1000);
    expect(cop.mood).toBe('roaming');
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
    expect(s.npcs[0].restId).toBeNull();
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
    for (let i = 0; i < CONFIG.npc.maxCount; i++) addNpc(s, 'dog', 72, 24).lifeMs = 1e9;
    s.nextNpcMs = 20;
    runSteps(s, {}, 2, 20);
    expect(s.npcs).toHaveLength(CONFIG.npc.maxCount);
  });

  it('sitting and roaming npcs do not count toward the active cap', () => {
    const s = createGame(1, parseMap(SPAWN_ROWS), ['p1']);
    for (let i = 0; i < CONFIG.npc.maxCount; i++) {
      const n = addNpc(s, 'dog', 72, 24);
      if (i === 0) {
        n.mood = 'idle';
        n.moodMs = 1e9;
      } else {
        roaming(n);
        n.restId = 'p1'; // jagt p1 nicht
        n.restMs = 1e9;
      }
    }
    s.nextNpcMs = 20;
    runSteps(s, {}, 2, 20);
    expect(s.npcs).toHaveLength(CONFIG.npc.maxCount + 1);
    expect(s.npcs.filter((n) => n.mood === 'active')).toHaveLength(1);
  });

  it('never exceeds the hard cap of all npcs', () => {
    expect(CONFIG.npc.maxTotal).toBe(6);
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

  it('a roaming npc that spots a player hunts even beyond the active cap', () => {
    const s = quiet(createGame(1, parseMap(SPAWN_ROWS), ['p1']));
    for (let i = 0; i < CONFIG.npc.maxCount; i++) addNpc(s, 'dog', 72, 24).lifeMs = 1e9;
    roaming(addNpc(s, 'dog', 72, 24));
    runSteps(s, {}, 1, 20);
    expect(s.npcs.filter((n) => n.mood === 'active')).toHaveLength(CONFIG.npc.maxCount + 1);
  });

  it('spawns nothing on a map without entrances', () => {
    const s = createGame(1, parseMap(['#####', '#@..#', '#####']), ['p1']);
    s.nextNpcMs = 20;
    runSteps(s, {}, 2, 20);
    expect(s.npcs).toHaveLength(0);
  });
});

describe('npc determinism', () => {
  function run(seed: number): string {
    const s = createGame(seed, CITY_MAP, ['a', 'b'], { roundMs: 400000 });
    s.nextNpcMs = 100;
    const idle: Input = { moveX: 0, moveY: 0, action: false, steal: false, buy: null };
    for (let t = 0; t < 2000; t++) step(s, { a: idle, b: idle }, 100);
    return JSON.stringify(s.npcs);
  }

  it('same seed gives the same npcs and positions', () => {
    expect(run(9)).toBe(run(9));
  });
});
