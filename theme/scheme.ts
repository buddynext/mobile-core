/**
 * Which colour scheme to render — the resolution rule, kept pure and away from React.
 *
 * The whole subtlety is one sentence from UX.md / TASKS 0.8: the server SEEDS the
 * scheme, it never OVERRIDES it. A site owner can say "this community defaults to dark"
 * and that decides the scheme for a member who has never touched the setting — but the
 * instant the member chooses for themselves, the owner's default is inert. A later
 * change to the site default must not reach into the app and flip a member who chose
 * light back to dark.
 *
 * That is why the member's preference has FOUR states, not two. `null` is not "light";
 * it is "has never chosen", which is the only state the server default is allowed to
 * fill. Collapsing null into a concrete default at read time is exactly how the shipped
 * apps lost the distinction and let a server value clobber a user choice.
 */

/**
 * The member's stored preference.
 *
 *   null     — never chosen. The ONLY state the server seed may fill.
 *   'system' — explicitly "follow the device". NOT the same as null: the member made
 *              this choice, so the server default no longer applies to them.
 *   'light' / 'dark' — an explicit pick.
 */
export type ColorSchemePref = null | 'system' | 'light' | 'dark';

/** app-config `branding.color_scheme_default`. `auto` means "follow the device". */
export type ServerSchemeDefault = 'auto' | 'light' | 'dark';

/** What actually gets rendered. There is no third scheme. */
export type ResolvedScheme = 'light' | 'dark';

/**
 * Resolve the scheme to render.
 *
 * Precedence, highest first:
 *   1. an explicit member pref ('light' | 'dark')          — the member decided
 *   2. member pref 'system'                                — the member decided: device
 *   3. member pref null + server default 'light'|'dark'    — the owner's seed
 *   4. member pref null + server default 'auto'            — device
 *
 * The dividing line is between 1-2 (member has chosen) and 3-4 (member has not). The
 * server default lives entirely below that line.
 */
export function resolveScheme(
  pref: ColorSchemePref,
  serverDefault: ServerSchemeDefault,
  systemScheme: ResolvedScheme
): ResolvedScheme {
  // 1 & 2 — the member has chosen. The server default is irrelevant now.
  if (pref === 'light' || pref === 'dark') {
    return pref;
  }
  if (pref === 'system') {
    return systemScheme;
  }

  // 3 & 4 — pref is null, never chosen. NOW the seed applies.
  if (serverDefault === 'light' || serverDefault === 'dark') {
    return serverDefault;
  }
  return systemScheme;
}

/**
 * Has the member made an explicit choice?
 *
 * The UI needs this to render the scheme control correctly: with `null`, the toggle sits
 * on "System" as a DEFAULT the owner may have coloured, not as the member's selection.
 * Distinct from `pref === 'system'`, which is the member actively selecting system.
 */
export function hasChosenScheme(pref: ColorSchemePref): boolean {
  return pref !== null;
}
