import { describe, expect, it } from 'vitest';
import { buildLabel, currentBuild, versionMismatch } from '../src/buildInfo';

describe('buildLabel', () => {
  it('shows a CI run number with a hash', () => {
    expect(buildLabel({ number: '123', sha: 'a1b2c3d' })).toBe('Build #123 · a1b2c3d');
  });
  it('shows dev builds without a hash number sign', () => {
    expect(buildLabel({ number: 'dev', sha: 'a1b2c3d' })).toBe('Build dev · a1b2c3d');
  });
  it('omits the hash when unknown', () => {
    expect(buildLabel({ number: '7', sha: '' })).toBe('Build #7');
    expect(buildLabel({ number: 'dev', sha: '' })).toBe('Build dev');
  });
});

describe('currentBuild', () => {
  it('always yields a number string and a sha string', () => {
    const b = currentBuild();
    expect(typeof b.number).toBe('string');
    expect(b.number.length).toBeGreaterThan(0);
    expect(typeof b.sha).toBe('string');
  });
});

describe('versionMismatch', () => {
  const cases: [string, { number: string; sha: string }, { number: string; sha: string } | null, boolean][] = [
    ['same sha, different numbers', { number: '50', sha: 'abcdef1' }, { number: '120', sha: 'abcdef1' }, false],
    ['different sha', { number: '50', sha: 'abcdef1' }, { number: '50', sha: '1234567' }, true],
    ['server unknown', { number: '50', sha: 'abcdef1' }, null, false],
    ['server sha empty', { number: '50', sha: 'abcdef1' }, { number: 'dev', sha: '' }, false],
    ['client sha empty', { number: 'dev', sha: '' }, { number: '3', sha: 'abcdef1' }, false],
    ['both empty', { number: 'dev', sha: '' }, { number: 'dev', sha: '' }, false],
    ['case differs only', { number: '1', sha: 'ABCDEF1' }, { number: '1', sha: 'abcdef1' }, false],
  ];
  for (const [name, client, server, expected] of cases) {
    it(name, () => expect(versionMismatch(client, server)).toBe(expected));
  }
});
