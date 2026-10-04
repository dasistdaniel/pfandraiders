import { describe, expect, it } from 'vitest';
import { buildLabel, currentBuild } from '../src/buildInfo';

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
