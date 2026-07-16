/**
 * The narrowest version comparison the gates need, and nothing more.
 *
 * Two gates compare versions: the app gate against `min_app_version`, the module gate
 * against `minPluginVersion`. Both share one hard rule — an UNPARSEABLE floor must FAIL
 * OPEN. A typo in a site's `min_app_version` must never wall every member out; a licence
 * gate that fails open leaks revenue, but a version gate that fails closed bricks a
 * community over a stray character.
 *
 * So this deliberately does NOT throw and does NOT return a comparison for junk. It
 * answers one question — "is `version` at least `floor`?" — and when it cannot tell, it
 * answers `true` (the gate opens). The caller never has to remember which direction is
 * safe, because there is only one function and it is already safe.
 *
 * Not a general semver library: no ranges, no caret/tilde, no build metadata. WordPress
 * plugin and app versions are plain `MAJOR.MINOR.PATCH`, optionally with a `-beta.N`
 * suffix, and that is all this parses.
 */

interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  /** -1 for a release; a prerelease sorts BEFORE its release, so it gets a lower rank. */
  prerelease: number;
}

const CORE = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

/**
 * Parse `MAJOR.MINOR.PATCH[-prerelease]`. Returns null for anything else — a `v` prefix,
 * a two-part version, a word, an empty string. Callers treat null as "cannot compare".
 */
function parse(value: string): ParsedVersion | null {
  const match = CORE.exec(value.trim());
  if (!match) {
    return null;
  }

  const [, major, minor, patch, pre] = match;

  return {
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    // A release outranks its own prereleases: 1.2.0 > 1.2.0-beta.1. We do not order
    // prereleases against each other — the gate only asks "release or not", and a
    // finer order would be precision the floor comparison never uses.
    prerelease: pre === undefined ? 0 : -1,
  };
}

/**
 * Is `version` at least `floor`?
 *
 * FAILS OPEN: if EITHER side cannot be parsed, returns true. An unreadable floor cannot
 * be allowed to gate anyone, and an app that cannot state its own version is a build
 * problem, not a reason to lock the member out of a site that is otherwise fine.
 */
export function meetsMinimum(version: string, floor: string): boolean {
  const parsedFloor = parse(floor);
  if (!parsedFloor) {
    // No usable floor — nothing to enforce. This is the common case: most sites never
    // set min_app_version at all, so it arrives as ''.
    return true;
  }

  const parsedVersion = parse(version);
  if (!parsedVersion) {
    // The app cannot name its own version. Failing closed here would brick every
    // member over our bug; fail open and let the build problem surface elsewhere.
    return true;
  }

  return compare(parsedVersion, parsedFloor) >= 0;
}

function compare(a: ParsedVersion, b: ParsedVersion): number {
  return (
    a.major - b.major ||
    a.minor - b.minor ||
    a.patch - b.patch ||
    a.prerelease - b.prerelease
  );
}
