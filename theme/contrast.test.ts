/**
 * The hostile-accent corpus.
 *
 * Written BEFORE the theme it tests (UX.md §14 build order), because this is the
 * test that would have caught F2/F3/F4 in the four shipped apps:
 *
 *   F2 — a filled accent button whose label fails AA, shipped anyway.
 *   F3 — `color: colors.accent` as ink on `bg`: a pale accent renders an invisible
 *        retry button on white.
 *   F4 — one accent reused across both schemes: a near-black accent that is fine on
 *        light is unreadable on dark.
 *
 * All three are the same bug — the site owner's accent was treated as a colour we
 * could paint anywhere. It is a brand token, not a palette.
 *
 * The rule this file enforces: EVERY pair the theme declares readable must clear
 * WCAG AA in BOTH schemes, for ANY accent a site owner can type into Appearance.
 * There is no accent that produces an unreadable screen. The theme's escape hatch is
 * to correct a DERIVED token (hue preserved) or drop a treatment — never to ship the
 * failing pair.
 */

import { buildTheme, contrastPairs } from './index';
import { contrastRatio, parseHex } from './primitives';

/**
 * The named corpus — each one is a real failure mode, not a random sample.
 */
const HOSTILE = {
  '#FDE047': 'pale yellow — fails as a fill background AND as ink on white (F2 + F3)',
  '#0B1120': 'near-black — invisible as ink on dark (F4)',
  '#FFFFFF': 'white — the degenerate light case; equals bg in light scheme',
  '#000000': 'black — the degenerate dark case; equals bg in dark scheme',
  '#39FF14': 'neon green — very high luminance, low chroma headroom when darkened',
  '#808080': 'mid-grey — the worst case: fails against BOTH schemes bg simultaneously',
  '#FF0000': 'pure red — passes on white, marginal on dark, max chroma (gamut clamping)',
  '#7C3AED': 'the BuddyNext default — must survive its own corpus',
} as const;

const SCHEMES = ['light', 'dark'] as const;

/**
 * Deterministic PRNG (mulberry32).
 *
 * Math.random() here would mean a corpus that fails once in CI, on an accent nobody
 * can name, and passes on re-run. A seeded sequence is just as broad and always
 * reproducible: the seed in the failure message regenerates the exact colour.
 */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const randomAccents = (count: number, seed: number): string[] => {
  const rand = mulberry32(seed);
  return Array.from({ length: count }, () => {
    const n = Math.floor(rand() * 0x1000000);
    return `#${n.toString(16).padStart(6, '0').toUpperCase()}`;
  });
};

const RANDOM_SEED = 0x8badf00d;
const RANDOM_CORPUS = randomAccents(200, RANDOM_SEED);

/**
 * AA thresholds. 4.5:1 for text, 3:1 for UI boundaries and large text.
 */
const AA_TEXT = 4.5;
const AA_UI = 3.0;

const ratio = (fg: string, bg: string): number => {
  const a = parseHex(fg);
  const b = parseHex(bg);
  if (!a || !b) {
    throw new Error(`Theme emitted an unparseable colour: fg=${fg} bg=${bg}`);
  }
  return contrastRatio(a, b);
};

/**
 * Assert every declared pair in one built theme. Returns nothing; throws with the
 * accent, scheme, pair name and measured ratio so a failure names its own repro.
 */
function assertReadable(accent: string, scheme: 'light' | 'dark', note = ''): void {
  const theme = buildTheme(accent, scheme);

  for (const pair of contrastPairs(theme.colors)) {
    const min = pair.kind === 'text' ? AA_TEXT : AA_UI;
    const measured = ratio(pair.fg, pair.bg);

    if (measured < min) {
      throw new Error(
        `${pair.name} fails AA: ${measured.toFixed(2)}:1 < ${min}:1\n` +
          `  accent : ${accent}${note ? ` (${note})` : ''}\n` +
          `  scheme : ${scheme}\n` +
          `  fg     : ${pair.fg}\n` +
          `  bg     : ${pair.bg}\n` +
          `  This accent produces an unreadable screen on a real site.`
      );
    }
  }
}

describe('hostile accents', () => {
  for (const [accent, why] of Object.entries(HOSTILE)) {
    for (const scheme of SCHEMES) {
      it(`${accent} (${why}) is readable in ${scheme}`, () => {
        assertReadable(accent, scheme, why);
      });
    }
  }
});

describe('random accents', () => {
  for (const scheme of SCHEMES) {
    it(`200 seeded random accents are all readable in ${scheme} (seed ${RANDOM_SEED})`, () => {
      for (const accent of RANDOM_CORPUS) {
        assertReadable(accent, scheme, `seed ${RANDOM_SEED}`);
      }
    });
  }
});

/**
 * The corpus above proves nothing if the theme is allowed to answer "readable" by
 * repainting the owner's brand. These pin the honesty of the escape hatch.
 */
describe('the owner\'s accent is not repainted', () => {
  it('preserves the accent hue even when every derived token had to move', () => {
    // Mid-grey is the worst case: it has to move in BOTH schemes.
    const light = buildTheme('#808080', 'light');
    const dark = buildTheme('#808080', 'dark');

    expect(light.diagnostics.requestedAccent).toBe('#808080');
    expect(dark.diagnostics.requestedAccent).toBe('#808080');
  });

  it('records a correction rather than making it silently', () => {
    // #FDE047 on white cannot be ink at 4.5:1. accentInk MUST differ from accent,
    // and the theme must say so — a dev-visible diagnostic, not a quiet swap.
    const theme = buildTheme('#FDE047', 'light');

    expect(theme.colors.accentInk).not.toBe(theme.colors.accent);
    expect(theme.diagnostics.corrections.map((c) => c.token)).toContain('accentInk');
  });

  it('leaves a well-behaved accent completely alone', () => {
    // If a safe accent gets "corrected", the correction logic is too eager and the
    // brand is being repainted for no reason.
    const theme = buildTheme('#7C3AED', 'light');

    expect(theme.colors.accent).toBe('#7C3AED');
    expect(theme.diagnostics.corrections).toHaveLength(0);
  });

  it('flags — never hides — an accent that cannot carry a filled treatment', () => {
    // F2: pale yellow can hold black text at AA, so accentFg is fine; what fails is
    // the FILL against bg. accentMeetsAA is what makes Button render outlined.
    expect(buildTheme('#FDE047', 'light').colors.accentMeetsAA).toBe(false);
    expect(buildTheme('#7C3AED', 'light').colors.accentMeetsAA).toBe(true);
  });
});

describe('the two schemes are derived independently', () => {
  it('gives a near-black accent different ink in dark than in light (F4)', () => {
    const light = buildTheme('#0B1120', 'light');
    const dark = buildTheme('#0B1120', 'dark');

    // In light, #0B1120 is already readable ink on white — untouched.
    expect(light.colors.accentInk).toBe('#0B1120');
    // In dark it is invisible, so dark's ink must be lightened. One shared accent
    // across both schemes is exactly the F4 bug.
    expect(dark.colors.accentInk).not.toBe(light.colors.accentInk);
  });
});

describe('malformed input fails closed, never crashes', () => {
  const junk = ['', 'not-a-color', '#GGG', '#12345', 'rgb(0,0,0)', '#7C3AED11'];

  for (const bad of junk) {
    it(`falls back to the default accent for ${JSON.stringify(bad)}`, () => {
      // A site owner can put anything in that option, and the app must still boot.
      // Appearance's own rule: an unset/unusable accent means "use the default".
      const theme = buildTheme(bad, 'light');

      expect(theme.colors.accent).toBe('#7C3AED');
      expect(theme.diagnostics.usedFallback).toBe(true);
    });
  }

  it('accepts a 3-digit hex and shorthand casing', () => {
    expect(buildTheme('#7c3aed', 'light').colors.accent).toBe('#7C3AED');
    expect(buildTheme('#abc', 'light').colors.accent).toBe('#AABBCC');
  });
});
