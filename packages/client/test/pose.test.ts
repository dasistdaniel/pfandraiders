import { describe, expect, it } from 'vitest';
import { BOB_PX, WALK_FRAME_MS, bobOffset, initialPose, npcFrame, stepPose } from '../src/pose';

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
