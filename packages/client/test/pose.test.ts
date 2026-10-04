import { describe, expect, it } from 'vitest';
import {
  ACTION_FRAME_MS,
  ACTION_STEPS,
  BOB_PX,
  WALK_FRAME_MS,
  WALK_STEPS,
  bobOffset,
  initialPose,
  npcFrame,
  stepPose,
  walkStepIndex,
} from '../src/pose';
import { charFrameIndex } from '../src/playerChars';

describe('stepPose', () => {
  it('starts facing down and idles as down_a', () => {
    const s = initialPose(10, 10);
    expect(s.facing).toBe('down');
    const r = stepPose(s, 10, 10, 'walking', 16);
    expect(r.pose).toEqual({ frame: 'down_a', flipX: false });
  });

  it('walks right: side_a, then side_b after 150 ms, side_a after 300 ms', () => {
    let s = initialPose(0, 0);
    let x = 0;
    const step = (dt: number) => {
      x += 1;
      const r = stepPose(s, x, 0, 'walking', dt);
      s = r.state;
      return r.pose;
    };
    expect(step(10)).toEqual({ frame: 'side_a', flipX: false });
    expect(step(140).frame).toBe('side_b'); // walkMs 150
    expect(step(150).frame).toBe('side_a'); // walkMs 300
  });

  it('flips when walking left', () => {
    const r = stepPose(initialPose(5, 5), 4, 5, 'walking', 16);
    expect(r.pose).toEqual({ frame: 'side_a', flipX: true });
  });

  it('walks up and down', () => {
    expect(stepPose(initialPose(5, 5), 5, 4, 'walking', 16).pose.frame).toBe('up_a');
    expect(stepPose(initialPose(5, 5), 5, 6, 'walking', 16).pose.frame).toBe('down_a');
  });

  it('dominant axis wins and flipX resets for vertical movement', () => {
    const left = stepPose(initialPose(5, 5), 4, 5, 'walking', 16).state;
    const r = stepPose(left, 4, 6, 'walking', 16);
    expect(r.state.facing).toBe('down');
    expect(r.pose.flipX).toBe(false);
  });

  it('movement at or below MOVE_EPSILON counts as standing', () => {
    const r = stepPose(initialPose(0, 0), 0.05, 0, 'walking', 16);
    expect(r.state.walkMs).toBe(0);
    expect(r.pose.frame).toBe('down_a');
  });

  it('standing resets walkMs and keeps facing', () => {
    let s = initialPose(0, 0);
    s = stepPose(s, 0, -1, 'walking', 200).state;
    expect(s.walkMs).toBe(200);
    const r = stepPose(s, 0, -1, 'walking', 16);
    expect(r.state.walkMs).toBe(0);
    expect(r.state.facing).toBe('up');
    expect(r.pose.frame).toBe('up_a');
  });

  it('unconscious shows lying, keeps facing, zero walkMs', () => {
    let s = stepPose(initialPose(0, 0), 0, -1, 'walking', 100).state;
    const r = stepPose(s, 0, -2, 'unconscious', 100);
    expect(r.pose.frame).toBe('lying');
    expect(r.state.facing).toBe('up');
    expect(r.state.walkMs).toBe(0);
  });

  it('searching standing alternates down_a/down_b every 250 ms', () => {
    let s = initialPose(3, 3);
    let r = stepPose(s, 3, 3, 'searching', 100);
    expect(r.pose.frame).toBe('down_a');
    r = stepPose(r.state, 3, 3, 'searching', 150);
    expect(r.pose.frame).toBe('down_b'); // 250
    r = stepPose(r.state, 3, 3, 'stealing', 250);
    expect(r.pose.frame).toBe('down_a'); // 500
  });

  it('searching faces down even if previously facing another way', () => {
    const s = stepPose(initialPose(0, 0), 0, -1, 'walking', 16).state;
    expect(stepPose(s, 0, -1, 'searching', 16).pose.frame).toBe('down_a');
  });

  it('searching while moving uses walk rule', () => {
    const r = stepPose(initialPose(0, 0), 1, 0, 'searching', 150);
    expect(r.pose).toEqual({ frame: 'side_b', flipX: false });
  });

  it('non-finite or negative dt counts as 0', () => {
    expect(() => stepPose(initialPose(0, 0), 1, 0, 'walking', NaN)).not.toThrow();
    expect(stepPose(initialPose(0, 0), 1, 0, 'walking', NaN).state.walkMs).toBe(0);
    expect(stepPose(initialPose(0, 0), 1, 0, 'walking', Infinity).state.walkMs).toBe(0);
    expect(stepPose(initialPose(0, 0), 1, 0, 'walking', -50).state.walkMs).toBe(0);
  });

  it('records the new position', () => {
    const r = stepPose(initialPose(0, 0), 7, 8, 'walking', 16);
    expect(r.state.x).toBe(7);
    expect(r.state.y).toBe(8);
  });
});

describe('npcFrame', () => {
  it('alternates a/b every 150 ms while walking', () => {
    let s = initialPose(0, 0);
    let r = npcFrame(s, 1, 0, 100);
    expect(r.frame).toBe('a');
    r = npcFrame(r.state, 2, 0, 50);
    expect(r.frame).toBe('b');
    r = npcFrame(r.state, 3, 0, 150);
    expect(r.frame).toBe('a');
  });

  it('flips left on dx<0, right on dx>0, keeps value otherwise', () => {
    let r = npcFrame(initialPose(5, 5), 4, 5, 16);
    expect(r.flipX).toBe(true);
    r = npcFrame(r.state, 4, 6, 16); // vertical
    expect(r.flipX).toBe(true);
    r = npcFrame(r.state, 5, 6, 16);
    expect(r.flipX).toBe(false);
  });

  it('stays stable at a when standing', () => {
    let r = npcFrame(initialPose(1, 1), 1, 1, 1000);
    expect(r.frame).toBe('a');
    expect(r.state.walkMs).toBe(0);
    r = npcFrame(r.state, 1, 1, 1000);
    expect(r.frame).toBe('a');
  });

  it('tolerates NaN dt', () => {
    expect(npcFrame(initialPose(0, 0), 1, 0, NaN).state.walkMs).toBe(0);
  });
});

describe('bobOffset', () => {
  it('is 0 when not moving, whatever walkMs says', () => {
    expect(bobOffset(0, false)).toBe(0);
    expect(bobOffset(WALK_FRAME_MS, false)).toBe(0);
  });

  it('is 0 on frame a and -BOB_PX on frame b', () => {
    expect(BOB_PX).toBe(1);
    expect(bobOffset(0, true)).toBe(0);
    expect(bobOffset(WALK_FRAME_MS - 1, true)).toBe(0);
    expect(bobOffset(WALK_FRAME_MS + 1, true)).toBe(-1);
  });

  it('switches exactly at WALK_FRAME_MS and repeats each cycle', () => {
    expect(bobOffset(WALK_FRAME_MS, true)).toBe(-1);
    expect(bobOffset(2 * WALK_FRAME_MS, true)).toBe(0);
    expect(bobOffset(3 * WALK_FRAME_MS, true)).toBe(-1);
    expect(bobOffset(10 * WALK_FRAME_MS, true)).toBe(0);
  });

  it('treats NaN, Infinity and negative walkMs as 0', () => {
    expect(bobOffset(NaN, true)).toBe(0);
    expect(bobOffset(Infinity, true)).toBe(0);
    expect(bobOffset(-WALK_FRAME_MS, true)).toBe(0);
  });
});

describe('walkStepIndex', () => {
  it('cycles 0..3, one step per WALK_FRAME_MS', () => {
    expect(WALK_STEPS).toBe(4);
    expect(walkStepIndex(0)).toBe(0);
    expect(walkStepIndex(WALK_FRAME_MS - 1)).toBe(0);
    expect(walkStepIndex(WALK_FRAME_MS)).toBe(1);
    expect(walkStepIndex(2 * WALK_FRAME_MS)).toBe(2);
    expect(walkStepIndex(3 * WALK_FRAME_MS)).toBe(3);
    expect(walkStepIndex(4 * WALK_FRAME_MS - 1)).toBe(3);
    expect(walkStepIndex(4 * WALK_FRAME_MS)).toBe(0);
    expect(walkStepIndex(9 * WALK_FRAME_MS)).toBe(1);
  });

  it('treats NaN, Infinity and negative as 0', () => {
    expect(walkStepIndex(NaN)).toBe(0);
    expect(walkStepIndex(Infinity)).toBe(0);
    expect(walkStepIndex(-1)).toBe(0);
  });

  it('bob is up exactly on the step frames 1 and 3', () => {
    for (let s = 0; s < 4; s++) expect(bobOffset(s * WALK_FRAME_MS, true)).toBe(s % 2 === 1 ? -BOB_PX : 0);
  });
});

describe('stepPose character fields', () => {
  it('starts as down, step 0', () => {
    const r = stepPose(initialPose(0, 0), 0, 0, 'walking', 16);
    expect(r.dir).toBe('down');
    expect(r.step).toBe(0);
  });

  it('step advances only while moving and resets when standing', () => {
    let s = initialPose(0, 0);
    let x = 0;
    const walk = (dt: number) => {
      x += 1;
      const r = stepPose(s, x, 0, 'walking', dt);
      s = r.state;
      return r;
    };
    expect(walk(10).step).toBe(0);
    expect(walk(140).step).toBe(1); // 150
    expect(walk(150).step).toBe(2); // 300
    expect(walk(150).step).toBe(3); // 450
    expect(walk(150).step).toBe(0); // 600
    const r = walk(150);
    expect(r.step).toBe(1);
    expect(r.dir).toBe('right');
    const stand = stepPose(s, x, 0, 'walking', 150);
    expect(stand.step).toBe(0);
    expect(stand.dir).toBe('right');
    expect(stepPose(stand.state, x, 0, 'walking', 1000).step).toBe(0);
  });

  it('maps directions: left uses the native left column, up and down', () => {
    expect(stepPose(initialPose(5, 5), 4, 5, 'walking', 16).dir).toBe('left');
    expect(stepPose(initialPose(5, 5), 6, 5, 'walking', 16).dir).toBe('right');
    expect(stepPose(initialPose(5, 5), 5, 4, 'walking', 16).dir).toBe('up');
    expect(stepPose(initialPose(5, 5), 5, 6, 'walking', 16).dir).toBe('down');
  });

  it('searching and stealing face down and alternate two different steps every ACTION_FRAME_MS', () => {
    const [a, b] = ACTION_STEPS;
    expect(charFrameIndex('down', a)).not.toBe(charFrameIndex('down', b));
    const facingUp = stepPose(initialPose(3, 3), 3, 2, 'walking', 16).state;
    let r = stepPose(facingUp, 3, 2, 'searching', 100);
    expect(r.dir).toBe('down');
    expect(r.step).toBe(a);
    r = stepPose(r.state, 3, 2, 'searching', ACTION_FRAME_MS - 100);
    expect(r.step).toBe(b);
    r = stepPose(r.state, 3, 2, 'stealing', ACTION_FRAME_MS);
    expect(r.step).toBe(a);
  });

  it('unconscious shows the standing front frame', () => {
    const s = stepPose(initialPose(0, 0), 1, 0, 'walking', 200).state;
    const r = stepPose(s, 2, 0, 'unconscious', 200);
    expect(r.dir).toBe('down');
    expect(r.step).toBe(0);
  });
});

describe('moving flag', () => {
  it('stepPose: true on movement beyond epsilon, false standing and below epsilon', () => {
    expect(stepPose(initialPose(0, 0), 1, 0, 'walking', 16).moving).toBe(true);
    expect(stepPose(initialPose(0, 0), 0, 0, 'walking', 16).moving).toBe(false);
    expect(stepPose(initialPose(0, 0), 0.01, 0, 'walking', 16).moving).toBe(false);
  });

  it('stepPose: false while searching, stealing or unconscious, even when position changes', () => {
    expect(stepPose(initialPose(0, 0), 0, 0, 'searching', 16).moving).toBe(false);
    expect(stepPose(initialPose(0, 0), 0, 0, 'stealing', 16).moving).toBe(false);
    expect(stepPose(initialPose(0, 0), 5, 0, 'unconscious', 16).moving).toBe(false);
  });

  it('npcFrame: true when moved, false when standing', () => {
    expect(npcFrame(initialPose(0, 0), 1, 0, 16).moving).toBe(true);
    expect(npcFrame(initialPose(0, 0), 0, 0, 16).moving).toBe(false);
  });
});
