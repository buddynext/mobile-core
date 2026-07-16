/**
 * isResumeTransition — which AppState edge re-runs the gate.
 *
 * The point of the tests is the NON-resumes: the transient transitions that must NOT
 * trigger a re-check, or the app fires a network round-trip every time a notification
 * banner slides in.
 */

import { isResumeTransition, type AppStateValue } from './resume';

describe('a real resume', () => {
  it('is background -> active', () => {
    expect(isResumeTransition('background', 'active')).toBe(true);
  });
});

describe('transient transitions are NOT resumes', () => {
  it.each<[AppStateValue, AppStateValue]>([
    ['inactive', 'active'], // control-centre pull, app switcher, call banner dismissed
    ['active', 'inactive'], // going the other way
    ['active', 'background'], // leaving, not returning
    ['active', 'active'], // no change
    ['background', 'inactive'], // waking through inactive first — the edge fires on ->active
    ['unknown', 'active'], // startup noise
    ['background', 'background'], // still backgrounded
  ])('%s -> %s does not re-run the gate', (prev, next) => {
    expect(isResumeTransition(prev, next)).toBe(false);
  });
});

describe('a full background round-trip fires exactly once', () => {
  it('fires on the ->active edge and not on the intermediate ->inactive', () => {
    // iOS wakes background -> inactive -> active. The re-check must happen once, on the
    // final edge, not on the intermediate one.
    expect(isResumeTransition('background', 'inactive')).toBe(false);
    expect(isResumeTransition('inactive', 'active')).toBe(false);
    // The runtime hook tracks the LAST backgrounded state, so it compares the pre-inactive
    // 'background' against 'active' — which is the true edge.
    expect(isResumeTransition('background', 'active')).toBe(true);
  });
});
