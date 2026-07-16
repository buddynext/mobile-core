/**
 * resolveScheme — the seed-not-override rule.
 *
 * The tests that matter are the ones proving the server default STAYS BELOW the line: a
 * member who has chosen is never moved by the owner's default, no matter what it is or
 * how it changes. Everything else is bookkeeping around that.
 */

import { hasChosenScheme, resolveScheme, type ServerSchemeDefault } from './scheme';

const ALL_SERVER_DEFAULTS: ServerSchemeDefault[] = ['auto', 'light', 'dark'];

describe('an explicit member choice wins over every server default', () => {
  it('keeps a member on light regardless of what the owner defaults to', () => {
    for (const serverDefault of ALL_SERVER_DEFAULTS) {
      expect(resolveScheme('light', serverDefault, 'dark')).toBe('light');
    }
  });

  it('keeps a member on dark regardless of what the owner defaults to', () => {
    for (const serverDefault of ALL_SERVER_DEFAULTS) {
      expect(resolveScheme('dark', serverDefault, 'light')).toBe('dark');
    }
  });

  it('does not let the server default flip a member who already chose', () => {
    // The exact regression: owner changes the site default to dark; a member who picked
    // light must NOT move. This is what "seeds, never overrides" protects.
    const before = resolveScheme('light', 'auto', 'light');
    const afterOwnerChangesDefaultToDark = resolveScheme('light', 'dark', 'light');
    expect(afterOwnerChangesDefaultToDark).toBe(before);
    expect(afterOwnerChangesDefaultToDark).toBe('light');
  });
});

describe("member pref 'system' is a CHOICE, not the absence of one", () => {
  it('follows the device, ignoring the server default', () => {
    // 'system' means the member actively chose "follow my device". The owner's default
    // does not apply — that is the difference between 'system' and null.
    expect(resolveScheme('system', 'dark', 'light')).toBe('light');
    expect(resolveScheme('system', 'light', 'dark')).toBe('dark');
  });

  it('is treated as a choice by hasChosenScheme', () => {
    expect(hasChosenScheme('system')).toBe(true);
  });
});

describe('null (never chosen) is the ONLY state the server seed fills', () => {
  it('takes the owner light default when the member has not chosen', () => {
    expect(resolveScheme(null, 'light', 'dark')).toBe('light');
  });

  it('takes the owner dark default when the member has not chosen', () => {
    expect(resolveScheme(null, 'dark', 'light')).toBe('dark');
  });

  it("follows the device when the owner default is 'auto'", () => {
    expect(resolveScheme(null, 'auto', 'light')).toBe('light');
    expect(resolveScheme(null, 'auto', 'dark')).toBe('dark');
  });

  it('reports the member has NOT chosen', () => {
    // The seed sits on the control as a coloured default, not as the member's selection.
    expect(hasChosenScheme(null)).toBe(false);
  });
});

describe('the seed applies once, then the member owns it', () => {
  it('a member who accepts the dark seed and later picks light is not re-seeded', () => {
    // Boot 1: never chosen, owner seeds dark -> renders dark.
    expect(resolveScheme(null, 'dark', 'light')).toBe('dark');
    // Member then explicitly picks light. pref is now 'light'.
    // Boot 2: same owner default 'dark' -> must still be light. The seed is spent.
    expect(resolveScheme('light', 'dark', 'light')).toBe('light');
  });
});
