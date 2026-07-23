/**
 * resolveButtonTreatment — the F2 regression, pinned.
 *
 * The load-bearing test is "a pale accent that cannot carry a fill renders OUTLINED, not a
 * filled invisible shape". That is F2. If Button ever stops reading accentMeetsAA, this
 * goes red — which a screenshot on a normal accent would not.
 */

import { buildTheme } from '../theme';
import { resolveButtonTreatment } from './buttonStyle';

// #7C3AED carries a fill fine; #FDE047 (pale yellow) does not.
const okAccent = buildTheme('#7C3AED', 'light').colors;
const paleAccent = buildTheme('#FDE047', 'light').colors;

describe('primary — the F2 fix', () => {
  it('fills with the accent when the accent can carry a fill', () => {
    expect(okAccent.accentMeetsAA).toBe(true);
    const t = resolveButtonTreatment('primary', okAccent);

    expect(t.backgroundColor).toBe(okAccent.accent);
    expect(t.color).toBe(okAccent.accentFg);
    expect(t.borderWidth).toBe(0);
  });

  it('renders OUTLINED when the accent cannot — never a filled invisible shape', () => {
    expect(paleAccent.accentMeetsAA).toBe(false);
    const t = resolveButtonTreatment('primary', paleAccent);

    expect(t.backgroundColor).toBe('transparent');
    expect(t.color).toBe(paleAccent.accentInk);
    expect(t.borderColor).toBe(paleAccent.accentBorder);
    expect(t.borderWidth).toBeGreaterThan(0);
  });

  it('never uses the raw accent as text (that is the F3 invisible-ink bug)', () => {
    // Outlined primary text must be accentInk (contrast-corrected), not accent.
    const t = resolveButtonTreatment('primary', paleAccent);
    expect(t.color).not.toBe(paleAccent.accent);
  });
});

describe('secondary', () => {
  it('is a neutral outline in both accent cases', () => {
    for (const colors of [okAccent, paleAccent]) {
      const t = resolveButtonTreatment('secondary', colors);
      expect(t.backgroundColor).toBe('transparent');
      expect(t.color).toBe(colors.ink);
      expect(t.borderColor).toBe(colors.lineStrong);
    }
  });
});

describe('ghost', () => {
  it('is text-only in accentInk, never raw accent', () => {
    const t = resolveButtonTreatment('ghost', paleAccent);
    expect(t.backgroundColor).toBe('transparent');
    expect(t.borderWidth).toBe(0);
    expect(t.color).toBe(paleAccent.accentInk);
    expect(t.color).not.toBe(paleAccent.accent);
  });
});

describe('danger', () => {
  it('is an outline in danger ink — never a fill (no AA-safe fill exists in both schemes)', () => {
    for (const colors of [okAccent, paleAccent]) {
      const t = resolveButtonTreatment('danger', colors);
      expect(t.backgroundColor).toBe('transparent');
      expect(t.color).toBe(colors.danger);
      expect(t.borderColor).toBe(colors.danger);
      expect(t.borderWidth).toBeGreaterThan(0);
    }
  });
});
