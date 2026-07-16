/**
 * The app gate — FATAL. When it fails, it takes over the whole screen; there is no app
 * behind it to use.
 *
 * ARCHITECTURE.md "The gate splits in two": a single gate is wrong for a host. If the
 * Listora plugin is too old but BuddyNext core is fine, you disable the Listora module,
 * you do not brick the app. So this gate judges ONLY core reachability + contract +
 * version + the licence bit. Everything per-module is the soft gate's job.
 *
 * THE ORDER IS THE INSIGHT: reachable -> contract -> version -> licence.
 *
 *   Establish you can PARSE before acting on what you READ. If a future server renames a
 *   field and we check `app_enabled` first, a renamed-away field reads as absent and the
 *   app says "Requires Pro" — confidently wrong, when the real answer is "this app is too
 *   old to understand this site." Contract-first turns that into the honest message.
 *
 * Two asymmetric failure directions, each deliberate:
 *
 *   app_enabled FAILS CLOSED — unlocks only on === true. A missing, malformed, or
 *   never-answered field reads as "no". A licence gate that fails open leaks the product.
 *
 *   min_app_version FAILS OPEN — a typo'd floor must not wall every member out. A version
 *   gate that fails closed bricks a community over a stray character. (In meetsMinimum.)
 */

import { meetsMinimum } from './semver';

export type AppGateReason =
  | 'unreachable'
  | 'not-buddynext'
  | 'contract-too-new'
  | 'app-too-old'
  | 'app-disabled';

export type AppGateStatus =
  | { ok: true; config: AppConfig }
  | { ok: false; reason: AppGateReason; detail: string };

/**
 * The fields of `GET /buddynext/v1/app/config` this gate reads. Intentionally partial —
 * branding, features, limits and legal are the shell's concern once the gate is open,
 * not the gate's. Modelled on the real controller (AppConfigController::get_config).
 */
export interface AppConfig {
  contract_version: number;
  app_enabled: boolean;
  pro_active: boolean;
  min_app_version: string;
  [key: string]: unknown;
}

/**
 * What the fetch layer hands the gate.
 *
 * `null` means the request never produced a usable body — offline, DNS failure, a 500, a
 * captive portal returning HTML. The gate does not do the fetch (that is plain axios,
 * outside React Query, per 0.14); it judges the outcome. A discriminated input keeps the
 * "couldn't reach it" and "reached something that isn't us" cases distinct, because the
 * screens differ: one says "check your connection", the other "this doesn't look like a
 * BuddyNext site".
 */
export type AppConfigFetch =
  | { reachable: false }
  | { reachable: true; body: unknown };

export interface AppGateParams {
  /** This build's version, e.g. from expo-constants. */
  appVersion: string;
  /** The highest contract_version this build knows how to read. */
  understoodContract: number;
}

function looksLikeConfig(body: unknown): body is AppConfig {
  if (!body || typeof body !== 'object') {
    return false;
  }
  const candidate = body as Record<string, unknown>;
  // contract_version is the load-bearing field: its presence AND numeric type is what
  // says "this is our contract and I can reason about it". Everything else is read only
  // after this passes.
  return typeof candidate.contract_version === 'number';
}

export function evaluateAppGate(
  fetch: AppConfigFetch,
  { appVersion, understoodContract }: AppGateParams
): AppGateStatus {
  // 1. Reachable at all?
  if (!fetch.reachable) {
    return {
      ok: false,
      reason: 'unreachable',
      detail: 'The site could not be reached. Check the connection and try again.',
    };
  }

  // 2. Is this even a BuddyNext site? A well-formed contract_version is the proof. This
  //    must come before ANY field read, or a non-BuddyNext JSON body gets probed for
  //    app_enabled and mis-described.
  if (!looksLikeConfig(fetch.body)) {
    return {
      ok: false,
      reason: 'not-buddynext',
      detail: 'This address did not return a BuddyNext app configuration.',
    };
  }

  const config = fetch.body;

  // 3. Can THIS BUILD understand THIS contract? Parse-ability before interpretation. A
  //    newer contract may have moved the very fields below; refuse to guess.
  if (config.contract_version > understoodContract) {
    return {
      ok: false,
      reason: 'contract-too-new',
      detail: `This site speaks app contract v${config.contract_version}; this app understands v${understoodContract}. Update the app.`,
    };
  }

  // 4. Version floor. Fails OPEN inside meetsMinimum — a junk floor opens the gate.
  if (!meetsMinimum(appVersion, config.min_app_version)) {
    return {
      ok: false,
      reason: 'app-too-old',
      detail: `This site requires app version ${config.min_app_version} or newer. This app is ${appVersion}.`,
    };
  }

  // 5. The licence bit, LAST and STRICT. Only === true opens it; Pro sets it, and only on
  //    a valid licence. Anything else — false, missing (already defaulted false by Free),
  //    truthy-but-not-true — reads as "not an app site".
  if (config.app_enabled !== true) {
    return {
      ok: false,
      reason: 'app-disabled',
      detail: config.pro_active
        ? 'The app is not enabled for this site. Its BuddyNext Pro licence may be inactive.'
        : 'This site does not have the BuddyNext Pro licence the app requires.',
    };
  }

  return { ok: true, config };
}
