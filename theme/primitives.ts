/**
 * Colour maths. No product opinions live here — only measurement and conversion.
 *
 * Two spaces, each for what it is good at:
 *   - sRGB + WCAG relative luminance, for MEASURING contrast. This is what the
 *     accessibility requirement is written in, so it is what we test against.
 *   - OKLCH, for MOVING a colour. Shifting lightness in sRGB drags hue with it
 *     (a darkened yellow turns green); OKLCH is perceptually uniform, so we can
 *     rotate lightness and keep the owner's hue intact. That distinction is the
 *     whole reason we can correct a token without repainting a brand.
 */

export interface RGB {
  /** 0-255 */
  r: number;
  /** 0-255 */
  g: number;
  /** 0-255 */
  b: number;
}

export interface OKLCH {
  /** Perceptual lightness, 0-1. */
  l: number;
  /** Chroma, 0 to ~0.4 in practice. */
  c: number;
  /** Hue angle in degrees, 0-360. */
  h: number;
}

interface LinearRGB {
  r: number;
  g: number;
  b: number;
}

const HEX_LONG = /^#([0-9a-f]{6})$/i;
const HEX_SHORT = /^#([0-9a-f]{3})$/i;

/**
 * Parse a CSS hex colour. Returns null for anything else — including the shapes a
 * site owner can plausibly paste (`rgb(...)`, a bare name, an 8-digit hex with
 * alpha). Callers decide what to do with null; this function does not guess.
 */
export function parseHex(input: string): RGB | null {
  const value = input.trim();

  const short = HEX_SHORT.exec(value);
  if (short) {
    const [r, g, b] = short[1]!.split('');
    return {
      r: parseInt(r! + r!, 16),
      g: parseInt(g! + g!, 16),
      b: parseInt(b! + b!, 16),
    };
  }

  const long = HEX_LONG.exec(value);
  if (long) {
    const n = parseInt(long[1]!, 16);
    return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
  }

  return null;
}

const clamp255 = (n: number): number => Math.min(255, Math.max(0, Math.round(n)));

export function toHex({ r, g, b }: RGB): string {
  const hex = (n: number) => clamp255(n).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`.toUpperCase();
}

const srgbToLinearChannel = (channel: number): number => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

const linearToSrgbChannel = (c: number): number => {
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return v * 255;
};

/**
 * WCAG 2.x relative luminance.
 */
export function relativeLuminance(rgb: RGB): number {
  const r = srgbToLinearChannel(rgb.r);
  const g = srgbToLinearChannel(rgb.g);
  const b = srgbToLinearChannel(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * WCAG contrast ratio, 1:1 to 21:1. Order-independent.
 */
export function contrastRatio(a: RGB, b: RGB): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/*
 * OKLab / OKLCH — Björn Ottosson's transform.
 * https://bottosson.github.io/posts/oklab/
 */

function linearRgbToOklab(lin: LinearRGB): { L: number; a: number; b: number } {
  const l = 0.4122214708 * lin.r + 0.5363325363 * lin.g + 0.0514459929 * lin.b;
  const m = 0.2119034982 * lin.r + 0.6806995451 * lin.g + 0.1073969566 * lin.b;
  const s = 0.0883024619 * lin.r + 0.2817188376 * lin.g + 0.6299787005 * lin.b;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  return {
    L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  };
}

function oklabToLinearRgb(L: number, a: number, b: number): LinearRGB {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  };
}

export function rgbToOklch(rgb: RGB): OKLCH {
  const { L, a, b } = linearRgbToOklab({
    r: srgbToLinearChannel(rgb.r),
    g: srgbToLinearChannel(rgb.g),
    b: srgbToLinearChannel(rgb.b),
  });

  const c = Math.sqrt(a * a + b * b);
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) {
    h += 360;
  }

  return { l: L, c, h };
}

const GAMUT_EPSILON = 1e-4;

function oklchToLinear({ l, c, h }: OKLCH): LinearRGB {
  const rad = (h * Math.PI) / 180;
  return oklabToLinearRgb(l, c * Math.cos(rad), c * Math.sin(rad));
}

const inGamut = (lin: LinearRGB): boolean =>
  lin.r >= -GAMUT_EPSILON &&
  lin.r <= 1 + GAMUT_EPSILON &&
  lin.g >= -GAMUT_EPSILON &&
  lin.g <= 1 + GAMUT_EPSILON &&
  lin.b >= -GAMUT_EPSILON &&
  lin.b <= 1 + GAMUT_EPSILON;

/**
 * OKLCH to sRGB, gamut-mapped by reducing chroma.
 *
 * Most OKLCH→sRGB code clips each channel independently. That is wrong for our
 * purpose: clipping a channel shifts the hue, which is the one property we promised
 * the site owner we would not touch. Reducing chroma toward the neutral axis instead
 * desaturates — the colour gets duller, never a different colour. 16 bisection steps
 * lands well inside a 1/255 quantisation step.
 */
export function oklchToRgb(oklch: OKLCH): RGB {
  const l = Math.min(1, Math.max(0, oklch.l));
  const direct = oklchToLinear({ ...oklch, l });

  if (inGamut(direct)) {
    return {
      r: clamp255(linearToSrgbChannel(direct.r)),
      g: clamp255(linearToSrgbChannel(direct.g)),
      b: clamp255(linearToSrgbChannel(direct.b)),
    };
  }

  let lo = 0;
  let hi = oklch.c;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklchToLinear({ l, c: mid, h: oklch.h }))) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const mapped = oklchToLinear({ l, c: lo, h: oklch.h });
  return {
    r: clamp255(linearToSrgbChannel(mapped.r)),
    g: clamp255(linearToSrgbChannel(mapped.g)),
    b: clamp255(linearToSrgbChannel(mapped.b)),
  };
}

const PURE_WHITE: RGB = { r: 255, g: 255, b: 255 };
const PURE_BLACK: RGB = { r: 0, g: 0, b: 0 };

/**
 * The readable foreground for a background: pure black or pure white, whichever
 * measures better.
 *
 * MEASURE both, never threshold luminance. "Luminance > 0.5 ⇒ use black" is the
 * shortcut every one of the four shipped apps took, and it is wrong near the
 * crossover — it picks the loser by up to a full ratio point.
 *
 * The candidates are PURE black and PURE white, deliberately, not the theme's ink
 * tokens. The worst possible background sits at luminance 0.179, where black and
 * white tie at 4.58:1 — just over AA. So pure black/white ALWAYS clears 4.5:1 for
 * any background whatsoever. Substituting a softer ink (#111827, luminance 0.0095)
 * drops that guarantee to 3.85:1 and there is then no readable foreground at all.
 * The nicer-looking ink is precisely what makes it fail.
 */
export function readableForeground(bg: RGB): RGB {
  return contrastRatio(PURE_BLACK, bg) >= contrastRatio(PURE_WHITE, bg)
    ? PURE_BLACK
    : PURE_WHITE;
}

/**
 * The nearest lightness at which `color` clears `target` against EVERY background in
 * `bgs`, hue and chroma preserved.
 *
 * Plural on purpose. A token tuned against `bg` alone still fails on the surface it
 * actually renders on: in dark, `surface` is LIGHTER than `bg`, so accent ink that
 * clears the page fails on a card; in light, `surfaceSunken` is darker than `bg`, so
 * it fails the other way. One background is never the whole answer — solve for the
 * hardest one and the rest come free.
 *
 * Scans rather than solves: contrast-vs-lightness is not monotonic once gamut mapping
 * starts pulling chroma, so a bisection can converge on the wrong side. 251 steps is
 * finer than the eye resolves and cheap enough to run hundreds of times in a suite.
 *
 * Returns null when no lightness works — impossible for the backgrounds we ship (both
 * admit a solution at one extreme), but callers must handle it rather than trust that.
 */
export function adjustLightness(color: RGB, bgs: RGB[], target: number): RGB | null {
  const { c, h, l: from } = rgbToOklch(color);

  const STEPS = 250;
  let best: RGB | null = null;
  let bestDelta = Infinity;

  for (let i = 0; i <= STEPS; i++) {
    const l = i / STEPS;
    const candidate = oklchToRgb({ l, c, h });

    if (minContrast(candidate, bgs) >= target) {
      const delta = Math.abs(l - from);
      if (delta < bestDelta) {
        bestDelta = delta;
        best = candidate;
      }
    }
  }

  return best;
}

/**
 * The worst contrast `fg` achieves against any of `bgs` — the only number that
 * decides whether a token is readable everywhere it renders.
 */
export function minContrast(fg: RGB, bgs: RGB[]): number {
  return bgs.reduce((worst, bg) => Math.min(worst, contrastRatio(fg, bg)), Infinity);
}
