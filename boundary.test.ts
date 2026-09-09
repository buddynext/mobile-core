/**
 * The package boundary is real, and reachable.
 *
 * This suite exists because of a defect found auditing TG0: `package.json` declared
 * `"main": "index.ts"` and that file did not exist. Everything passed anyway — every
 * test imported by relative path (`./theme`, `./registry/resolve`), so nothing ever
 * opened the door the whole architecture depends on. `@buddynext/mobile-core` was
 * unimportable and the suite was green.
 *
 * ARCHITECTURE.md's one hard rule is "modules import only `@buddynext/mobile-core`". A rule
 * whose target does not resolve is not a rule. So these tests import the way a MODULE
 * must import — by package name, never by path — which is the only way the entry point
 * stays honest.
 */

import { buildTheme, resolveContributions, DEFAULT_ACCENT } from '@buddynext/mobile-core';
import type { Scheme, ServerNavItem, Theme } from '@buddynext/mobile-core';

describe('the door opens', () => {
  it('resolves the package by name, not by path', () => {
    // If `index.ts` goes missing or `main` drifts, this fails at import — before any
    // assertion — which is exactly the signal that was absent before.
    expect(typeof buildTheme).toBe('function');
    expect(typeof resolveContributions).toBe('function');
  });

  it('exports a working theme through the package entry point', () => {
    const theme: Theme = buildTheme(DEFAULT_ACCENT, 'light');

    expect(theme.colors.accent).toBe(DEFAULT_ACCENT);
    expect(theme.diagnostics.usedFallback).toBe(false);
  });

  it('exports a working resolver through the package entry point', () => {
    const items: ServerNavItem[] = [{ key: 'home', label: 'Home', order: 1 }];

    const { visible } = resolveContributions({
      serverItems: items,
      registry: new Map([['home', { id: 'home' }]]),
      budget: 5,
    });

    expect(visible.map((v) => v.key)).toEqual(['home']);
  });

  it('exports the types a module needs to type its own contributions', () => {
    // Compile-time assertion: if these type names stop being exported, this file stops
    // compiling and the suite fails. `Scheme` is the narrow one worth pinning — a
    // module that renders per-scheme needs it and must not redeclare it.
    const scheme: Scheme = 'dark';
    expect(buildTheme(DEFAULT_ACCENT, scheme).scheme).toBe('dark');
  });
});

describe('the door is the only door', () => {
  it('does not leak the colour maths modules must not reach for', () => {
    // A module deriving its own accent is the F2/F3/F4 bug class the theme exists to
    // prevent. `adjustLightness`/`oklchToRgb`/`minContrast` are real and tested — they
    // are simply not a module's to call. Deep-importing them is what the TG0.19 lint
    // rule forbids; keeping them out of the barrel is what makes that rule enforceable
    // rather than aspirational.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const surface = require('@buddynext/mobile-core');

    for (const forbidden of ['adjustLightness', 'oklchToRgb', 'minContrast', 'rgbToOklch']) {
      expect(surface).not.toHaveProperty(forbidden);
    }
  });
});
