/**
 * The module registry — NAV-STEP-1-PLAN.md §C2, the machinery half.
 *
 * One descriptor per module is the single source both nav surfaces read: the SPINE (the
 * fixed five-tab bar) and DISCOVER (the tile hub every optional module plugs into). A
 * module is in the registry whether or not this site enables it — enablement is the
 * gate's call at read time, never encoded in the table. The silence rule follows from
 * that: a descriptor whose gate says `mounted: false` simply does not appear — no tab,
 * no tile, no dead affordance. ("partner-too-old" is also unmounted here; its
 * explanation belongs to Settings -> Integrations, not to nav chrome.)
 *
 * The host app owns the concrete table (routes, icons, labels are app decisions); this
 * module owns the descriptor shape and the two pure readers, so "what does this config's
 * nav look like?" stays a unit test. Icons are STRINGS resolved by the renderer's icon
 * registry — a descriptor never imports a component, which is what keeps the table and
 * these readers node-testable.
 */

import { evaluateModuleGate, type ModuleGateContext, type ModuleGateInput } from '../gate/moduleGate';
import type { ServerNavItem } from './resolve';

/** A module's claim to a fixed tab on the spine. */
export interface SpineSpec {
  /** The expo-router route name inside `(tabs)/` — also the resolver join key. */
  route: string;
  /** Icon registry string, resolved by the renderer (unknown falls back safely). */
  icon: string;
  label: string;
  /** Spine sequence. The client owns spine order — this is not server data. */
  order: number;
}

/** A module's claim to a tile on the Discover hub. */
export interface TileSpec {
  /** The stack route the tile pushes to (a screen under `app/`, not a tab). */
  route: string;
  icon: string;
  label: string;
}

/**
 * One module, gate input + nav claims. `id`/`flag` for an integration module ARE the
 * live `/app/config` integration key (that is what `moduleContext()` folds on); a
 * mandatory module's flag is null. A module claims spine OR tile, not both.
 */
export interface ModuleDescriptor extends ModuleGateInput {
  spine?: SpineSpec;
  tile?: TileSpec;
}

/** A spine item in the shape the tab-bar resolver eats, plus its icon string. */
export type SpineNavItem = ServerNavItem & { icon: string };

/** A Discover tile that passed its gate, tagged with the module that owns it. */
export type DiscoverTile = TileSpec & { id: string };

/**
 * The spine, for THIS config: every spine-claiming module whose gate mounts, mapped to
 * the `ServerNavItem` shape `resolveContributions` reads (§C3). The resolver still owns
 * budget/anchors/sorting — this reader only decides membership.
 */
export function spineNavItems(
  modules: readonly ModuleDescriptor[],
  context: ModuleGateContext
): SpineNavItem[] {
  return modules
    .filter((module) => module.spine && evaluateModuleGate(module, context).mounted)
    .map((module) => ({
      key: module.spine!.route,
      label: module.spine!.label,
      icon: module.spine!.icon,
      order: module.spine!.order,
      group: 'primary',
    }));
}

/**
 * The Discover tiles, for THIS config: every tile-claiming module whose gate mounts, in
 * table order. The silence rule is this filter — an off module contributes nothing.
 */
export function discoverTiles(
  modules: readonly ModuleDescriptor[],
  context: ModuleGateContext
): DiscoverTile[] {
  return modules
    .filter((module) => module.tile && evaluateModuleGate(module, context).mounted)
    .map((module) => ({ id: module.id, ...module.tile! }));
}

/** One row of the Settings → Integrations surface. */
export interface IntegrationStatus {
  id: string;
  label: string;
  /** 'on' = mounted (informational row); 'errored' = enabled but NOT mounted, with why. */
  status: 'on' | 'errored';
  /** Installed partner version, when the site reported one. */
  version?: string;
  /** The gate's explanation for an errored module ("partner-too-old" detail). */
  detail?: string;
}

/**
 * Settings → Integrations (UX.md "the honesty surface"): integration-tier modules that
 * are ON (name + version, informational) or ERRORED (enabled but unmounted — the one
 * non-silent gate verdict, with its explanation). An owner-off module is NEVER listed:
 * flagged-off is silent everywhere, including here. Mandatory modules aren't
 * integrations and don't appear.
 */
export function integrationStatuses(
  modules: readonly ModuleDescriptor[],
  context: ModuleGateContext
): IntegrationStatus[] {
  const rows: IntegrationStatus[] = [];
  for (const module of modules) {
    if (module.tier !== 'integration') {
      continue;
    }
    const label = module.spine?.label ?? module.tile?.label ?? module.id;
    const verdict = evaluateModuleGate(module, context);
    if (verdict.mounted) {
      rows.push({ id: module.id, label, status: 'on', version: context.partnerVersions?.[module.id] });
    } else if (!verdict.silent) {
      rows.push({ id: module.id, label, status: 'errored', detail: verdict.detail });
    }
  }
  return rows;
}
