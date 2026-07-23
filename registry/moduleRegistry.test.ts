/**
 * spineNavItems / discoverTiles — membership through the real gate, silence included.
 *
 * These readers are where the silence rule becomes concrete: an unmounted module must
 * contribute NOTHING to either surface, and — the subtle case — a "partner-too-old"
 * verdict is just as absent from nav as a flag-off one (its explanation lives in
 * Settings, never in chrome).
 */

import type { ModuleGateContext } from '../gate/moduleGate';
import { discoverTiles, integrationStatuses, spineNavItems, type ModuleDescriptor } from './moduleRegistry';

const FIXTURE: readonly ModuleDescriptor[] = [
  { id: 'feed', tier: 'mandatory', flag: null, spine: { route: 'feed', icon: 'home', label: 'Home', order: 10 } },
  { id: 'media', tier: 'integration', flag: 'media', spine: { route: 'messages', icon: 'message-circle', label: 'Messages', order: 40 } },
  { id: 'people', tier: 'mandatory', flag: null, tile: { route: 'people', icon: 'users', label: 'People' } },
  { id: 'gamification', tier: 'integration', flag: 'gamification', tile: { route: 'leaderboard', icon: 'award', label: 'Leaderboard' } },
  {
    id: 'floored',
    tier: 'integration',
    flag: 'floored',
    minPluginVersion: '2.0.0',
    tile: { route: 'floored', icon: 'tag', label: 'Floored' },
  },
];

const EMPTY: ModuleGateContext = { features: {}, partnerVersions: {} };

describe('spineNavItems', () => {
  it('with an empty context only mandatory spine modules appear', () => {
    expect(spineNavItems(FIXTURE, EMPTY)).toEqual([
      { key: 'feed', label: 'Home', icon: 'home', order: 10, group: 'primary' },
    ]);
  });

  it('an enabled integration joins the spine in the ServerNavItem shape', () => {
    const items = spineNavItems(FIXTURE, { features: { media: true }, partnerVersions: {} });
    expect(items).toContainEqual({
      key: 'messages',
      label: 'Messages',
      icon: 'message-circle',
      order: 40,
      group: 'primary',
    });
  });

  it('tile-only modules never leak onto the spine', () => {
    const everythingOn: ModuleGateContext = {
      features: { media: true, gamification: true, floored: true },
      partnerVersions: { floored: '9.0.0' },
    };
    expect(spineNavItems(FIXTURE, everythingOn).map((item) => item.key)).toEqual(['feed', 'messages']);
  });
});

describe('discoverTiles', () => {
  it('mandatory tiles always show; disabled integrations are silent', () => {
    expect(discoverTiles(FIXTURE, EMPTY)).toEqual([
      { id: 'people', route: 'people', icon: 'users', label: 'People' },
    ]);
  });

  it('an enabled integration tile appears, tagged with its module id', () => {
    const tiles = discoverTiles(FIXTURE, { features: { gamification: true }, partnerVersions: {} });
    expect(tiles.map((tile) => tile.id)).toEqual(['people', 'gamification']);
  });

  it('partner-too-old is exactly as ABSENT as flag-off — silence, not a dead tile', () => {
    // Enabled but below its version floor: the gate says mounted:false (non-silent,
    // for Settings) — nav must treat that identically to silence.
    const stale: ModuleGateContext = { features: { floored: true }, partnerVersions: { floored: '1.0.0' } };
    expect(discoverTiles(FIXTURE, stale).map((tile) => tile.id)).toEqual(['people']);
  });
});

describe('integrationStatuses — the Settings → Integrations honesty surface', () => {
  it('ON modules list with their version; owner-off modules are NEVER listed', () => {
    const rows = integrationStatuses(FIXTURE, {
      features: { media: true },
      partnerVersions: { media: '2.1.0' },
    });
    expect(rows).toEqual([{ id: 'media', label: 'Messages', status: 'on', version: '2.1.0' }]);
    // gamification + floored are flagged off → absent, not "errored", not "off".
  });

  it('an enabled-but-stale partner is ERRORED with the gate detail — the one loud case', () => {
    const rows = integrationStatuses(FIXTURE, {
      features: { floored: true },
      partnerVersions: { floored: '1.0.0' },
    });
    const errored = rows.find((row) => row.id === 'floored');
    expect(errored?.status).toBe('errored');
    expect(errored?.detail).toContain('2.0.0');
  });

  it('mandatory modules never appear', () => {
    const rows = integrationStatuses(FIXTURE, { features: { media: true }, partnerVersions: {} });
    expect(rows.map((row) => row.id)).not.toContain('feed');
    expect(rows.map((row) => row.id)).not.toContain('people');
  });

  it('everything off → empty list (the screen shows its empty state, not fake rows)', () => {
    expect(integrationStatuses(FIXTURE, EMPTY)).toEqual([]);
  });
});
