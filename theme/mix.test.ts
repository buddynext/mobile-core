/**
 * `mix` — tints and blends.
 *
 * Tested by PROPERTY rather than by pinned hex values. A table of expected outputs
 * would encode OKLab's exact constants into the suite, so any future change to the
 * colour model reads as dozens of failures with no indication of which behaviour
 * actually broke. The properties below are what callers rely on and what must hold in
 * any colour space we might move to.
 */

import { contrastRatio, mix, relativeLuminance, toHex, type RGB } from './primitives';

const BLACK: RGB = { r: 0, g: 0, b: 0 };
const WHITE: RGB = { r: 255, g: 255, b: 255 };
const ACCENT: RGB = { r: 124, g: 58, b: 237 }; // #7C3AED

describe('endpoints are exact', () => {
  it('returns a untouched at weight 1', () => {
    expect(toHex(mix(ACCENT, WHITE, 1))).toBe('#7C3AED');
  });

  it('returns b untouched at weight 0', () => {
    expect(toHex(mix(ACCENT, WHITE, 0))).toBe('#FFFFFF');
  });

  it('round-trips a colour mixed with itself at any weight', () => {
    for (const w of [0, 0.12, 0.5, 0.88, 1]) {
      expect(toHex(mix(ACCENT, ACCENT, w))).toBe('#7C3AED');
    }
  });
});

describe('the blend is symmetric', () => {
  it('mix(a, b, w) equals mix(b, a, 1 - w)', () => {
    // If this fails, argument order silently changes the result and every call site
    // becomes a coin flip.
    for (const w of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      expect(toHex(mix(ACCENT, WHITE, w))).toBe(toHex(mix(WHITE, ACCENT, 1 - w)));
    }
  });
});

describe('the blend is monotonic', () => {
  it('moves steadily from b toward a as weight rises', () => {
    // A tint ramp that reverses direction anywhere is a ramp that reads as a bug on
    // screen — a "hover" state lighter than "pressed".
    const luminances = [0, 0.2, 0.4, 0.6, 0.8, 1].map((w) =>
      relativeLuminance(mix(BLACK, WHITE, w))
    );

    for (let i = 1; i < luminances.length; i++) {
      expect(luminances[i]!).toBeLessThan(luminances[i - 1]!);
    }
  });
});

describe('weight is clamped, never extrapolated', () => {
  it('treats out-of-range weights as the nearest endpoint', () => {
    // A caller passing 12 instead of 0.12 is a plausible unit slip. Extrapolating would
    // produce a colour outside both inputs; clamping produces a wrong-but-sane tint.
    expect(toHex(mix(ACCENT, WHITE, 12))).toBe(toHex(mix(ACCENT, WHITE, 1)));
    expect(toHex(mix(ACCENT, WHITE, -3))).toBe(toHex(mix(ACCENT, WHITE, 0)));
  });

  it('never emits a channel outside 0-255', () => {
    for (const w of [-1, 0, 0.5, 1, 2]) {
      const { r, g, b } = mix(ACCENT, BLACK, w);
      for (const channel of [r, g, b]) {
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(255);
        expect(Number.isInteger(channel)).toBe(true);
      }
    }
  });
});

describe('the blend never goes muddy', () => {
  it('keeps a mix of two hues no darker than the darker input', () => {
    // THE reason for mixing in OKLab, and the one worth a test.
    //
    // Gamma-encoded sRGB — what CSS `color-mix(in srgb, ...)` does — averages red
    // (luminance 0.213) and blue (0.072) into #800080 at luminance 0.061: DARKER than
    // both inputs. Blending two colours must not invent a third that is dimmer than
    // either; that is the muddy midpoint every naive gradient shows.
    //
    // OKLab lands at #8C53A2, luminance 0.144 — between the two, where it belongs.
    const red: RGB = { r: 255, g: 0, b: 0 };
    const blue: RGB = { r: 0, g: 0, b: 255 };
    const naiveSrgb: RGB = { r: 128, g: 0, b: 128 };

    const floor = Math.min(relativeLuminance(red), relativeLuminance(blue));

    expect(relativeLuminance(mix(red, blue, 0.5))).toBeGreaterThan(floor);
    // Pin the failure this prevents, so the test explains itself when it goes red.
    expect(relativeLuminance(naiveSrgb)).toBeLessThan(floor);
  });

  it('keeps a light tint light enough to carry dark text', () => {
    // The real use: accent at 12% over white for a selected row. If that tint is dark
    // enough to threaten the ink on top of it, the token is unusable.
    const tint = mix(ACCENT, WHITE, 0.12);

    expect(contrastRatio({ r: 17, g: 24, b: 39 }, tint)).toBeGreaterThan(4.5);
  });
});
