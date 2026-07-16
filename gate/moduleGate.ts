/**
 * The module gate — SOFT. When it fails, one module does not mount; the app is fine.
 *
 * ARCHITECTURE.md: "A soft-disabled module is silent: no tab, no panel, no route, no
 * dead affordance." That silence is the whole contract. The one exception is a partner
 * plugin that IS enabled but too OLD — that gets a reason surfaced in Settings ->
 * Integrations, because the owner installed it expecting it to work and deserves to know
 * why it does not. "Flagged off" is silent; "installed but stale" is explained.
 *
 * Tiers, and why the flag check differs per tier (mirrors the module manifest, TG0
 * WbcomModule.tier):
 *
 *   mandatory   — always mounts. flag is null. Core, mediaverse, jetonomy.
 *   default_on  — mounts unless the site flagged it off.
 *   opt_in      — mounts only when the site flagged it on.
 *   integration — mounts only when the partner plugin is enabled AND new enough.
 *
 * The flag SOURCE is the app-config `features` map, which the app gate already proved
 * parseable. This gate never fetches and never probes — it reads flags. Inferring a
 * feature from a 403/404 is banned (ARCHITECTURE.md 403-vs-404): a probe cannot tell
 * "flag off" from "route moved".
 */

import { meetsMinimum } from './semver';

export type ModuleTier = 'mandatory' | 'default_on' | 'opt_in' | 'integration';

export type ModuleGateStatus =
  /** Mount it. */
  | { mounted: true }
  /** Do not mount, and say nothing anywhere. */
  | { mounted: false; silent: true; reason: 'flag-off' }
  /** Do not mount, but explain it in Settings -> Integrations. */
  | { mounted: false; silent: false; reason: 'partner-too-old'; detail: string };

/** The slice of a module descriptor this gate needs. */
export interface ModuleGateInput {
  id: string;
  tier: ModuleTier;
  /** The app-config `features` key. null for a mandatory module. */
  flag: string | null;
  /**
   * Soft floor for an integration's partner plugin version. Absent = no floor. Never an
   * app-block — a stale partner disables its own module, nothing more.
   */
  minPluginVersion?: string;
}

export interface ModuleGateContext {
  /** app-config `features`: { key: boolean }. Already parsed by the app gate. */
  features: Record<string, boolean>;
  /**
   * Installed partner-plugin versions by module id, when the site reported them. Absent
   * for a module whose partner isn't installed — but an integration only reaches the
   * version check once its flag is on, and the flag is on only when the plugin is active,
   * so a missing version there means "active but did not report", handled explicitly.
   */
  partnerVersions?: Record<string, string>;
}

const SILENT_OFF = { mounted: false, silent: true, reason: 'flag-off' } as const;

export function evaluateModuleGate(
  module: ModuleGateInput,
  context: ModuleGateContext
): ModuleGateStatus {
  // Mandatory always mounts. A mandatory module with a stray flag must not be
  // switchable — the flag is ignored by design, not honoured.
  if (module.tier === 'mandatory') {
    return { mounted: true };
  }

  const flagOn = module.flag !== null && context.features[module.flag] === true;
  const flagPresent = module.flag !== null && module.flag in context.features;

  switch (module.tier) {
    case 'default_on': {
      // On unless EXPLICITLY flagged false. A missing flag means the site never touched
      // it, and the default is on — so absence mounts, only a literal false silences.
      if (module.flag !== null && context.features[module.flag] === false) {
        return SILENT_OFF;
      }
      return { mounted: true };
    }

    case 'opt_in': {
      if (!flagOn) {
        return SILENT_OFF;
      }
      return { mounted: true };
    }

    case 'integration': {
      // Flag first: an integration whose partner is disabled is silently absent, exactly
      // like any opt-in. Only once the partner is ENABLED does its version matter.
      if (!flagOn) {
        return SILENT_OFF;
      }

      const floor = module.minPluginVersion;
      if (!floor) {
        return { mounted: true };
      }

      const installed = context.partnerVersions?.[module.id];
      if (installed === undefined) {
        // Flag is on (partner active) but no version was reported. Treat as too-old and
        // SAY so, rather than mounting a module against an unknown partner — a silent
        // mount here is the failure mode that ships a screen calling a route the old
        // plugin never registered.
        return {
          mounted: false,
          silent: false,
          reason: 'partner-too-old',
          detail: `${module.id} is active but did not report its version; the app needs ${floor} or newer.`,
        };
      }

      if (!meetsMinimum(installed, floor)) {
        return {
          mounted: false,
          silent: false,
          reason: 'partner-too-old',
          detail: `${module.id} ${installed} is installed; the app needs ${floor} or newer. Update the plugin on the site.`,
        };
      }

      return { mounted: true };
    }

    default: {
      // Exhaustive: every tier is handled above. An unknown tier is a data error, and the
      // safe reading of "I don't recognise this" is to not mount it, silently.
      void flagPresent;
      return SILENT_OFF;
    }
  }
}
