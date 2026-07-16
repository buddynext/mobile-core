/**
 * meetsMinimum — the version floor, and its one non-negotiable: junk fails OPEN.
 *
 * The fail-open cases are not edge cases to tolerate; they are the reason this function
 * is shaped the way it is. Half this suite is "given garbage, the gate still opens",
 * because the alternative shipped in the wild would be a community locked out by a typo.
 */

import { meetsMinimum } from './semver';

describe('ordinary comparison', () => {
  it.each([
    ['1.0.0', '1.0.0', true],
    ['1.2.0', '1.0.0', true],
    ['1.0.0', '1.2.0', false],
    ['2.0.0', '1.9.9', true],
    ['1.9.9', '2.0.0', false],
    ['1.2.3', '1.2.4', false],
    ['1.2.4', '1.2.3', true],
    ['0.9.0', '1.0.0', false],
    ['10.0.0', '9.0.0', true],
  ])('%s meets floor %s -> %s', (version, floor, expected) => {
    expect(meetsMinimum(version, floor)).toBe(expected);
  });

  it('does not compare version parts as strings ("10" > "9")', () => {
    // The classic bug: lexicographic compare makes "10" < "9". If this passes, the
    // comparison is numeric.
    expect(meetsMinimum('1.10.0', '1.9.0')).toBe(true);
    expect(meetsMinimum('1.9.0', '1.10.0')).toBe(false);
  });
});

describe('prereleases sort before their release', () => {
  it('treats 1.2.0-beta.1 as below 1.2.0', () => {
    expect(meetsMinimum('1.2.0-beta.1', '1.2.0')).toBe(false);
  });

  it('accepts a release at its own floor even when the app is a prerelease of the next', () => {
    expect(meetsMinimum('1.3.0-beta.1', '1.2.0')).toBe(true);
  });

  it('lets a prerelease satisfy a prerelease floor of the same core version', () => {
    // We do not order prereleases against each other; both rank -1, so equal cores tie
    // and >= holds. Good enough: the gate asks "at least", not "which beta".
    expect(meetsMinimum('1.2.0-beta.1', '1.2.0-beta.5')).toBe(true);
  });
});

describe('fails OPEN on an unusable floor', () => {
  // A site owner types this into a settings field. Every one of these must open the gate
  // rather than wall the site off.
  it.each(['', '   ', 'latest', 'v1.0.0', '1.0', '1', '1.0.0.0', 'null', 'x.y.z', '1.0.0-'])(
    'opens when the floor is %j',
    (floor) => {
      expect(meetsMinimum('1.0.0', floor)).toBe(true);
    }
  );

  it('opens even when the app version is BELOW a floor that itself is malformed', () => {
    // The dangerous direction: a real-looking app version against junk. Still open.
    expect(meetsMinimum('0.0.1', 'not-a-version')).toBe(true);
  });
});

describe('fails OPEN when the app cannot name its own version', () => {
  it.each(['', 'dev', 'v1.0.0', '1.0'])('opens when the app version is %j', (version) => {
    // The app failing to state its version is a build problem. Bricking the member over
    // it would turn our bug into their outage.
    expect(meetsMinimum(version, '1.0.0')).toBe(true);
  });
});

describe('whitespace is tolerated, not significant', () => {
  it('trims both sides', () => {
    expect(meetsMinimum('  1.2.0 ', ' 1.2.0 ')).toBe(true);
  });
});
