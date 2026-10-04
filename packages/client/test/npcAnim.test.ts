import { describe, expect, it } from 'vitest';
import { CONFIG } from '@pfandraiders/core';
import type { Npc } from '@pfandraiders/core';
import {
  ATTACK_WINDOW_MS,
  DOG_ANIMS,
  DOG_COATS,
  DOG_SHEET_COLS,
  OFFICER_ANIMS,
  OFFICER_SHEET_COLS,
  advanceClock,
  dogAnim,
  dogCoat,
  frameAt,
  npcLook,
  npcSheetKey,
  policeAnim,
} from '../src/npcAnim';
import { npcFrame, initialPose } from '../src/pose';
import { NPC_SHEET_URLS, npcSheetKeyFromPath } from '../src/npcAssets';
import { dogTexture, policeTexture } from '../src/textureKeys';

const BITE = CONFIG.npc.dog.biteCooldownMs;

function npc(over: Partial<Npc> = {}): Npc {
  return {
    id: 1,
    kind: 'dog',
    x: 0,
    y: 0,
    lifeMs: 1000,
    mood: 'active',
    moodMs: 0,
    targetId: null,
    restId: null,
    restMs: 0,
    pauseMs: 0,
    wanderX: 0,
    wanderY: 0,
    wanderRef: 0,
    cooldownMs: 0,
    distractedMs: 0,
    checkMs: 0,
    ...over,
  };
}

describe('sheet layout', () => {
  it('dog frames are row * 6 + column', () => {
    expect(DOG_SHEET_COLS).toBe(6);
    expect(DOG_ANIMS.idle.frames).toEqual([0, 1, 2, 3, 4, 5]);
    expect(DOG_ANIMS.walk.frames).toEqual([6, 7, 8, 9, 10, 11]);
    expect(DOG_ANIMS.wag.frames).toEqual([12, 13, 14, 15]);
    expect(DOG_ANIMS.run.frames).toEqual([18, 19, 20, 21]);
    expect(DOG_ANIMS.attack.frames).toEqual([24, 25, 26, 27]);
  });

  it('officer frames are row * 10 + column (columns 7-9 hold labels)', () => {
    expect(OFFICER_SHEET_COLS).toBe(10);
    expect(OFFICER_ANIMS.idle.frames).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(OFFICER_ANIMS.walk.frames).toEqual([10, 11, 12, 13, 14, 15, 16]);
    expect(OFFICER_ANIMS.run.frames).toEqual([20, 21, 22, 23, 24, 25, 26]);
    expect(OFFICER_ANIMS.baton.frames).toEqual([80, 81, 82, 83, 84, 85, 86]);
  });

  it('every animation has a positive frame time and its row matches its frames', () => {
    for (const [anims, cols] of [
      [DOG_ANIMS, DOG_SHEET_COLS],
      [OFFICER_ANIMS, OFFICER_SHEET_COLS],
    ] as const) {
      for (const a of Object.values(anims)) {
        expect(a.frameMs).toBeGreaterThan(0);
        expect(a.frames.length).toBeGreaterThan(0);
        for (const f of a.frames) expect(Math.floor(f / cols)).toBe(a.row);
      }
    }
  });
});

describe('dogCoat', () => {
  it('is deterministic per id', () => {
    for (let id = 0; id < 20; id++) expect(dogCoat(id)).toBe(dogCoat(id));
  });

  it('uses all three coats over consecutive ids', () => {
    expect(new Set([1, 2, 3].map(dogCoat))).toEqual(new Set(DOG_COATS));
  });

  it('handles negative and non-finite ids', () => {
    expect(DOG_COATS).toContain(dogCoat(-5));
    expect(dogCoat(Number.NaN)).toBe(dogCoat(0));
    expect(dogCoat(Infinity)).toBe(dogCoat(0));
    expect(DOG_COATS).toContain(dogCoat(2.7));
  });
});

describe('dogAnim', () => {
  it('sits and looks around when idle', () => {
    expect(dogAnim(npc(), false)).toBe(DOG_ANIMS.idle);
  });

  it('walks when moving without a target and runs when chasing', () => {
    expect(dogAnim(npc(), true)).toBe(DOG_ANIMS.walk);
    expect(dogAnim(npc({ targetId: 'p1' }), true)).toBe(DOG_ANIMS.run);
  });

  it('a dog with a target that stands still sits', () => {
    expect(dogAnim(npc({ targetId: 'p1' }), false)).toBe(DOG_ANIMS.idle);
  });

  it('bites right after a bite (first ATTACK_WINDOW_MS of the cooldown)', () => {
    expect(ATTACK_WINDOW_MS).toBe(400);
    expect(dogAnim(npc({ cooldownMs: BITE, targetId: 'p1' }), false)).toBe(DOG_ANIMS.attack);
    expect(dogAnim(npc({ cooldownMs: BITE - 399 }), true)).toBe(DOG_ANIMS.attack);
    expect(dogAnim(npc({ cooldownMs: BITE - 400 }), false)).not.toBe(DOG_ANIMS.attack);
    expect(dogAnim(npc({ cooldownMs: 0 }), false)).not.toBe(DOG_ANIMS.attack);
  });

  it('the bite wins over the sitting and distraction that start with it', () => {
    expect(dogAnim(npc({ cooldownMs: BITE, mood: 'idle', moodMs: 8000 }), false)).toBe(DOG_ANIMS.attack);
    expect(dogAnim(npc({ cooldownMs: BITE, distractedMs: 8000 }), false)).toBe(DOG_ANIMS.attack);
  });

  it('wags its tail while sitting after a bite or distracted by a treat', () => {
    expect(dogAnim(npc({ mood: 'idle', moodMs: 5000 }), false)).toBe(DOG_ANIMS.wag);
    expect(dogAnim(npc({ distractedMs: 5000 }), false)).toBe(DOG_ANIMS.wag);
  });

  it('a sitting dog keeps sitting even if interpolation jitter reports movement', () => {
    expect(dogAnim(npc({ mood: 'idle', moodMs: 5000 }), true)).toBe(DOG_ANIMS.wag);
  });

  it('walks (not runs) while roaming, moving or not', () => {
    expect(dogAnim(npc({ mood: 'roaming' }), true)).toBe(DOG_ANIMS.walk);
    expect(dogAnim(npc({ mood: 'roaming' }), false)).toBe(DOG_ANIMS.walk);
  });

  it('sits and looks around during a roaming pause, even with interpolation jitter', () => {
    expect(dogAnim(npc({ mood: 'roaming', pauseMs: 2000 }), false)).toBe(DOG_ANIMS.idle);
    expect(dogAnim(npc({ mood: 'roaming', pauseMs: 2000 }), true)).toBe(DOG_ANIMS.idle);
  });

  it('the bite still wins over roaming', () => {
    expect(dogAnim(npc({ mood: 'roaming', cooldownMs: BITE }), true)).toBe(DOG_ANIMS.attack);
  });
});

describe('policeAnim', () => {
  const cop = (over: Partial<Npc> = {}) => npc({ kind: 'police', ...over });

  it('idles, walks and runs', () => {
    expect(policeAnim(cop(), false)).toBe(OFFICER_ANIMS.idle);
    expect(policeAnim(cop(), true)).toBe(OFFICER_ANIMS.walk);
    expect(policeAnim(cop({ targetId: 'p1' }), true)).toBe(OFFICER_ANIMS.run);
    expect(policeAnim(cop({ targetId: 'p1' }), false)).toBe(OFFICER_ANIMS.idle);
  });

  it('walks while roaming and stands during a roaming pause', () => {
    expect(policeAnim(cop({ mood: 'roaming' }), true)).toBe(OFFICER_ANIMS.walk);
    expect(policeAnim(cop({ mood: 'roaming' }), false)).toBe(OFFICER_ANIMS.walk);
    expect(policeAnim(cop({ mood: 'roaming', pauseMs: 1000 }), true)).toBe(OFFICER_ANIMS.idle);
    expect(policeAnim(cop({ mood: 'roaming', pauseMs: 1000 }), false)).toBe(OFFICER_ANIMS.idle);
  });

  it('swings the baton during a check', () => {
    expect(policeAnim(cop({ targetId: 'p1', checkMs: 1 }), false)).toBe(OFFICER_ANIMS.baton);
    expect(policeAnim(cop({ targetId: 'p1', checkMs: 500 }), true)).toBe(OFFICER_ANIMS.baton);
  });
});

describe('frameAt', () => {
  const anim = { row: 1, frames: [6, 7, 8], frameMs: 100 };

  it('cycles through the frames', () => {
    expect(frameAt(anim, 0)).toBe(6);
    expect(frameAt(anim, 99)).toBe(6);
    expect(frameAt(anim, 100)).toBe(7);
    expect(frameAt(anim, 250)).toBe(8);
    expect(frameAt(anim, 300)).toBe(6);
  });

  it('treats negative and non-finite time as 0', () => {
    expect(frameAt(anim, -50)).toBe(6);
    expect(frameAt(anim, Number.NaN)).toBe(6);
    expect(frameAt(anim, Infinity)).toBe(6);
  });
});

describe('advanceClock', () => {
  it('runs on while the row stays and restarts when it changes', () => {
    const a = advanceClock(undefined, DOG_ANIMS.run, 16);
    expect(a).toEqual({ row: DOG_ANIMS.run.row, ms: 0 });
    const b = advanceClock(a, DOG_ANIMS.run, 16);
    expect(b.ms).toBe(16);
    const c = advanceClock(b, DOG_ANIMS.attack, 16);
    expect(c).toEqual({ row: DOG_ANIMS.attack.row, ms: 0 });
    expect(frameAt(DOG_ANIMS.attack, c.ms)).toBe(DOG_ANIMS.attack.frames[0]);
  });

  it('ignores bad deltas', () => {
    const a = { row: 0, ms: 50 };
    expect(advanceClock(a, DOG_ANIMS.idle, Number.NaN).ms).toBe(50);
    expect(advanceClock(a, DOG_ANIMS.idle, -10).ms).toBe(50);
  });
});

describe('facing', () => {
  it('both sheets face right: flipX from npcFrame means facing left and is kept while standing', () => {
    let s = initialPose(10, 10);
    let r = npcFrame(s, 5, 10, 16);
    expect(r.flipX).toBe(true);
    s = r.state;
    r = npcFrame(s, 5, 12, 16); // nur vertikal: Blickrichtung bleibt
    expect(r.flipX).toBe(true);
    r = npcFrame(r.state, 5, 12, 16); // steht
    expect(r.flipX).toBe(true);
    r = npcFrame(r.state, 9, 12, 16);
    expect(r.flipX).toBe(false);
  });
});

describe('npcSheetKey and npcLook', () => {
  it('names one sheet per dog coat and one for the officer', () => {
    expect(npcSheetKey(npc({ id: 1 }))).toBe(`npc:dog-${dogCoat(1)}`);
    expect(npcSheetKey(npc({ kind: 'police' }))).toBe('npc:officer');
  });

  it('uses the sheet frame when the sheet is loaded', () => {
    const dog = npc({ targetId: 'p1' });
    const look = npcLook(dog, true, 0, 'b', () => true);
    expect(look).toMatchObject({ sheet: true, texture: npcSheetKey(dog), frame: DOG_ANIMS.run.frames[0], bob: false });
    const cop = npc({ kind: 'police' });
    expect(npcLook(cop, false, 0, 'a', () => true)).toMatchObject({
      sheet: true,
      texture: 'npc:officer',
      frame: OFFICER_ANIMS.idle.frames[0],
      bob: false,
    });
  });

  it('falls back to the drawn figure with bob when the sheet is missing', () => {
    expect(npcLook(npc(), true, 0, 'b', () => false)).toEqual({ sheet: false, texture: dogTexture('b'), bob: true });
    expect(npcLook(npc({ kind: 'police' }), false, 0, 'a', () => false)).toEqual({
      sheet: false,
      texture: policeTexture('a'),
      bob: true,
    });
  });

  it('asks only for the sheet of this npc', () => {
    const asked: string[] = [];
    npcLook(npc({ id: 2 }), false, 0, 'a', (k) => {
      asked.push(k);
      return false;
    });
    expect(asked).toEqual([npcSheetKey(npc({ id: 2 }))]);
  });
});

describe('npcAssets', () => {
  it('derives the texture key from the file name', () => {
    expect(npcSheetKeyFromPath('./assets/npc/dog-white.png')).toBe('npc:dog-white');
    expect(npcSheetKeyFromPath('./assets/npc/officer.png')).toBe('npc:officer');
    expect(npcSheetKeyFromPath('./assets/npc/other.png')).toBeNull();
  });

  it('imports all four sheets', () => {
    expect(Object.keys(NPC_SHEET_URLS).sort()).toEqual(
      ['npc:dog-black', 'npc:dog-brown', 'npc:dog-white', 'npc:officer'].sort(),
    );
    for (const url of Object.values(NPC_SHEET_URLS)) expect(url.length).toBeGreaterThan(0);
  });

  it('every sheet key the scene can ask for is imported', () => {
    for (let id = 0; id < 3; id++) expect(NPC_SHEET_URLS[npcSheetKey(npc({ id }))]).toBeTruthy();
    expect(NPC_SHEET_URLS[npcSheetKey(npc({ kind: 'police' }))]).toBeTruthy();
  });
});
