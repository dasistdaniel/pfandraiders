import { describe, expect, it } from 'vitest';
import { currentBuild, resolveBuild, startupLine } from '../src/buildInfo';

describe('resolveBuild', () => {
  it('prefers the bundle defines', () => {
    expect(resolveBuild({ number: '42', sha: 'abcdef1' }, { BUILD_NUMBER: '7', GIT_SHA: '1234567' })).toEqual({
      number: '42',
      sha: 'abcdef1',
    });
  });
  it('falls back to the environment when the defines are missing (tsx dev)', () => {
    expect(resolveBuild({}, { BUILD_NUMBER: '7', GIT_SHA: '1234567890abcdef' })).toEqual({
      number: '7',
      sha: '1234567',
    });
  });
  it('uses dev and an empty sha without defines and environment', () => {
    expect(resolveBuild({}, {})).toEqual({ number: 'dev', sha: '' });
  });
  it('treats empty or non-numeric numbers as dev', () => {
    expect(resolveBuild({ number: '' }, {}).number).toBe('dev');
    expect(resolveBuild({}, { BUILD_NUMBER: '' }).number).toBe('dev');
    expect(resolveBuild({}, { BUILD_NUMBER: 'abc' }).number).toBe('dev');
    expect(resolveBuild({ number: 'dev' }, { BUILD_NUMBER: '9' }).number).toBe('dev');
  });
  it('treats an empty defined sha as unknown and trims environment values', () => {
    expect(resolveBuild({ sha: '' }, { GIT_SHA: ' abcdef1 ' }).sha).toBe('');
    expect(resolveBuild({}, { GIT_SHA: ' abcdef1 ', BUILD_NUMBER: ' 3 ' })).toEqual({ number: '3', sha: 'abcdef1' });
  });
});

describe('currentBuild', () => {
  it('yields strings', () => {
    const b = currentBuild();
    expect(typeof b.number).toBe('string');
    expect(b.number.length).toBeGreaterThan(0);
    expect(typeof b.sha).toBe('string');
  });
});

describe('startupLine', () => {
  it('names port and build', () => {
    expect(startupLine(8080, { number: 'dev', sha: 'abc1234' })).toBe(
      'PfandRaiders server listening on :8080 (build dev · abc1234)',
    );
    expect(startupLine(8080, { number: '12', sha: 'abc1234' })).toBe(
      'PfandRaiders server listening on :8080 (build #12 · abc1234)',
    );
  });
  it('omits an unknown sha', () => {
    expect(startupLine(9000, { number: 'dev', sha: '' })).toBe('PfandRaiders server listening on :9000 (build dev)');
  });
});
