import { describe, expect, it } from 'vitest';
import { totalBottles } from '../src/bottles';
import { CONFIG } from '../src/config';
import { createGame } from '../src/game';
import { damage } from '../src/health';
import { parseMap } from '../src/map';
import { isBeingChecked } from '../src/npc';
import type { GameState, NpcKind } from '../src/types';
import { input, newGame, openRows, runFor, runSteps, SEARCH_ROWS, teleport } from './helpers';

function quiet(s: GameState): GameState {
  s.nextNpcMs = 1e9; // keine Zufalls-Spawns in diesem Test
  return s;
}

function addNpc(s: GameState, kind: NpcKind, x: number, y: number) {
  const npc = {
    id: s.nextNpcId++,
    kind,
    x,
    y,
    lifeMs: 30000,
    targetId: null as string | null,
    cooldownMs: 0,
    distractedMs: 0,
    restId: null as string | null,
    restMs: 0,
    checkMs: 0,
  };
  s.npcs.push(npc);
  return npc;
}

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

  it('bites in range and then leaves that player alone (no second bite after the old cooldown)', () => {
    const s = quiet(newGame(openRows(30, 5)));
    const dog = addNpc(s, 'dog', 30, 24);
    runSteps(s, {}, 3, 20);
    expect(s.players.p1.health).toBeCloseTo(CONFIG.health.max - CONFIG.npc.dog.biteDamage, 1);
    expect(dog.restId).toBe('p1');
    expect(dog.restMs).toBeGreaterThan(CONFIG.npc.dog.biteRestMs - 100);
    runFor(s, {}, 1700); // alte Pause vorbei, Beißpause nicht
    expect(s.players.p1.health).toBeGreaterThan(CONFIG.health.max - CONFIG.npc.dog.biteDamage - 1);
  });

  it('does not bite or approach the bitten player for the whole rest, then bites again', () => {
    const s = quiet(newGame(openRows(30, 5)));
    const dog = addNpc(s, 'dog', 30, 24);
    runSteps(s, {}, 3, 20);
    const afterBite = s.players.p1.health;
    runFor(s, {}, 9900 - 60);
    expect(s.players.p1.health).toBeGreaterThan(afterBite - 2); // höchstens Hunger, kein Biss
    expect(s.players.p1.health).toBeLessThan(afterBite + 1);
    expect(dog.targetId).toBeNull();
    runFor(s, {}, 400); // Beißpause (10 s) vorbei
    expect(s.players.p1.health).toBeLessThan(afterBite - CONFIG.npc.dog.biteDamage + 2);
    expect(dog.restId).toBe('p1'); // neuer Biss, neue Pause
  });

  it('does not move toward the rested player', () => {
    const s = quiet(newGame(openRows(30, 5)));
    const dog = addNpc(s, 'dog', 30, 24);
    runSteps(s, {}, 3, 20);
    teleport(s, 'p1', { x: 120, y: 24 }); // im Sinnesradius, aber außer Reichweite
    const x = dog.x;
    runSteps(s, {}, 25, 20);
    expect(dog.x).toBe(x);
    expect(dog.targetId).toBeNull();
    expect(dog.restId).toBe('p1');
  });

  it('keeps chasing and biting a second player during the first player rest', () => {
    const s = quiet(newGame(openRows(30, 5), ['p1', 'p2']));
    const dog = addNpc(s, 'dog', 30, 24);
    teleport(s, 'p2', { x: 130, y: 24 });
    runSteps(s, {}, 3, 20); // p1 gebissen
    expect(dog.restId).toBe('p1');
    const hp1 = s.players.p1.health;
    runFor(s, {}, 1000); // p1 bleibt in Ruhe, der Hund läuft zu p2
    expect(dog.targetId).toBe('p2');
    expect(s.players.p1.health).toBeGreaterThan(hp1 - 2);
    runFor(s, {}, 1000);
    expect(s.players.p2.health).toBeLessThan(CONFIG.health.max - CONFIG.npc.dog.biteDamage + 2);
  });

  it('does not start a rest when a treat distracts the dog', () => {
    const s = quiet(newGame(openRows(30, 5)));
    s.players.p1.item = 'dog_treat';
    const dog = addNpc(s, 'dog', 30, 24);
    runSteps(s, {}, 3, 20);
    expect(dog.restId).toBeNull();
    expect(dog.restMs).toBe(0);
    expect(dog.distractedMs).toBeGreaterThan(0);
  });

  it('keeps the rest while the player is unconscious and after the respawn', () => {
    const s = quiet(newGame(openRows(30, 5)));
    const dog = addNpc(s, 'dog', 30, 24);
    runSteps(s, {}, 3, 20);
    s.players.p1.health = 1;
    damage(s.players.p1, 5); // umfallen
    expect(s.players.p1.unconsciousMs).toBeGreaterThan(0);
    runFor(s, {}, 1000);
    expect(dog.restId).toBe('p1');
    expect(dog.restMs).toBeLessThan(CONFIG.npc.dog.biteRestMs - 900);
    expect(dog.restMs).toBeGreaterThan(0);
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

  it('despawns when its lifetime runs out', () => {
    const s = quiet(newGame(openRows(30, 5)));
    const dog = addNpc(s, 'dog', 300, 24);
    dog.lifeMs = 100;
    runSteps(s, {}, 6, 20);
    expect(s.npcs).toHaveLength(0);
  });
});

describe('police', () => {
  function carrying() {
    const s = quiet(newGame(openRows(30, 5)));
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

  it('confiscates half the bottles (rounded up) after the full check and leaves', () => {
    const s = carrying();
    addNpc(s, 'police', 40, 24); // 16 px entfernt, innerhalb des Kontrollradius
    runSteps(s, {}, 50, 20);
    expect(isBeingChecked(s, 'p1')).toBe(true);
    expect(totalBottles(s.players.p1.bottles)).toBe(4);
    runFor(s, {}, CONFIG.npc.police.checkMs);
    expect(totalBottles(s.players.p1.bottles)).toBe(2);
    expect(s.npcs).toHaveLength(0);
    expect(isBeingChecked(s, 'p1')).toBe(false);
  });

  it('resets the check when the player runs away', () => {
    const s = carrying();
    const cop = addNpc(s, 'police', 40, 24);
    runSteps(s, {}, 50, 20); // 1000 ms Kontrolle
    expect(cop.checkMs).toBeGreaterThan(0);
    runSteps(s, { p1: input({ moveX: 1 }) }, 40, 20); // flieht mit 90 px/s, Polizei schafft 55
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

  it('spawns an npc at an entrance when the timer runs out and re-arms the timer', () => {
    const s = createGame(1, parseMap(SPAWN_ROWS), ['p1']);
    s.nextNpcMs = 20;
    runSteps(s, {}, 2, 20);
    expect(s.npcs).toHaveLength(1);
    // spawnt auf dem N-Feld (40) und läuft schon im Spawn-Tick los (Hund: 1,4 px pro Tick)
    expect(s.npcs[0].x).toBeGreaterThan(40 - 3);
    expect(s.npcs[0].x).toBeLessThanOrEqual(40);
    expect(s.npcs[0].y).toBe(24);
    expect(s.nextNpcMs).toBeGreaterThanOrEqual(CONFIG.npc.spawnEveryMs[0] - 40);
    expect(s.nextNpcMs).toBeLessThanOrEqual(CONFIG.npc.spawnEveryMs[1]);
  });

  it('never exceeds the npc cap', () => {
    const s = createGame(1, parseMap(SPAWN_ROWS), ['p1']);
    for (let i = 0; i < CONFIG.npc.maxCount; i++) addNpc(s, 'dog', 100, 24).lifeMs = 1e9;
    s.nextNpcMs = 20;
    runSteps(s, {}, 2, 20);
    expect(s.npcs).toHaveLength(CONFIG.npc.maxCount);
  });

  it('spawns nothing on a map without entrances', () => {
    const s = createGame(1, parseMap(['#####', '#@..#', '#####']), ['p1']);
    s.nextNpcMs = 20;
    runSteps(s, {}, 2, 20);
    expect(s.npcs).toHaveLength(0);
  });
});
