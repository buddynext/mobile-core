/**
 * configStore + moduleContext — the fold that makes the nav gate work.
 *
 * The CRITICAL design point from NAV-STEP-1-PLAN.md: `evaluateModuleGate` reads
 * `features[flag]` and `partnerVersions[id]`, but the site reports module state under
 * `integrations` — a different shape. `moduleContext()` is the fold between them. If the
 * fold is wrong, no integration module ever mounts (or worse, a disabled one does), so
 * the suite drives the folded context through the REAL gate, not just shape assertions.
 */

import { evaluateModuleGate, type ModuleGateInput } from '../gate/moduleGate';
import { configStore, moduleContext, siteGmtOffsetMinutes } from './configStore';

beforeEach(() => {
  configStore.getState().reset();
});

const MESSAGES: ModuleGateInput = { id: 'media', tier: 'integration', flag: 'media' };
const HOME: ModuleGateInput = { id: 'feed', tier: 'mandatory', flag: null };

describe('setConfig / reset', () => {
  it('starts empty and setConfig(null) stays empty', () => {
    expect(configStore.getState().features).toEqual({});
    expect(configStore.getState().integrations).toEqual({});
    expect(configStore.getState().realtime).toBeNull();
    configStore.getState().setConfig(null);
    expect(configStore.getState().features).toEqual({});
  });

  it('captures the full slice and reset clears it', () => {
    configStore.getState().setConfig({
      time: { site_timezone: 'Asia/Kolkata', gmt_offset: 5.5, server_utc: '2026-07-23T00:00:00Z' },
      features: { reactions: true },
      integrations: { media: { enabled: true, version: '1.1.0' } },
      realtime: { available: false, host: '', app_key: '', cluster: '', auth_url: '' },
    });
    expect(siteGmtOffsetMinutes()).toBe(330);
    expect(configStore.getState().integrations.media?.enabled).toBe(true);
    expect(configStore.getState().realtime?.available).toBe(false);
    configStore.getState().reset();
    expect(siteGmtOffsetMinutes()).toBe(0);
    expect(configStore.getState().integrations).toEqual({});
  });

  it('a partial capture (old contract: time only) leaves the rest empty, not undefined', () => {
    configStore.getState().setConfig({
      time: { site_timezone: '', gmt_offset: 0, server_utc: '2026-07-23T00:00:00Z' },
    });
    expect(configStore.getState().features).toEqual({});
    expect(configStore.getState().integrations).toEqual({});
  });
});

describe('moduleContext — the integrations fold', () => {
  it('folds each integration key into features (enabled) and partnerVersions (version)', () => {
    configStore.getState().setConfig({
      features: { reactions: true },
      integrations: {
        media: { enabled: true, version: '1.1.0' },
        jetonomy: { enabled: false, version: '2.0.0' },
      },
    });
    const context = moduleContext();
    expect(context.features).toEqual({ reactions: true, media: true, jetonomy: false });
    expect(context.partnerVersions).toEqual({ media: '1.1.0', jetonomy: '2.0.0' });
  });

  it('drops null and empty-string versions from partnerVersions', () => {
    configStore.getState().setConfig({
      integrations: {
        media: { enabled: true, version: null },
        gamification: { enabled: true, version: '' },
        listora: { enabled: true, version: '1.0.0' },
      },
    });
    expect(moduleContext().partnerVersions).toEqual({ listora: '1.0.0' });
  });

  it('with no integrations block (old plugin) the context is features-only', () => {
    configStore.getState().setConfig({ features: { reactions: false } });
    expect(moduleContext()).toEqual({ features: { reactions: false }, partnerVersions: {} });
  });
});

describe('through the real gate (the Phase-1 acceptance pair)', () => {
  it('an ENABLED integration mounts', () => {
    configStore.getState().setConfig({
      integrations: { media: { enabled: true, version: '1.1.0' } },
    });
    expect(evaluateModuleGate(MESSAGES, moduleContext())).toEqual({ mounted: true });
  });

  it('a DISABLED integration is silently off — no tab, no explanation', () => {
    configStore.getState().setConfig({
      integrations: { media: { enabled: false, version: '1.1.0' } },
    });
    expect(evaluateModuleGate(MESSAGES, moduleContext())).toEqual({
      mounted: false,
      silent: true,
      reason: 'flag-off',
    });
  });

  it('an ABSENT integrations block silences integration modules (graceful degradation)', () => {
    configStore.getState().setConfig({ features: {} });
    expect(evaluateModuleGate(MESSAGES, moduleContext())).toEqual({
      mounted: false,
      silent: true,
      reason: 'flag-off',
    });
  });

  it('mandatory modules mount regardless of config state', () => {
    expect(evaluateModuleGate(HOME, moduleContext())).toEqual({ mounted: true });
    configStore.getState().setConfig({ integrations: { media: { enabled: false, version: null } } });
    expect(evaluateModuleGate(HOME, moduleContext())).toEqual({ mounted: true });
  });

  it('v1 descriptors carry no minPluginVersion, so a null version still mounts when enabled', () => {
    // The deliberate v1 decision: enabled-gating only. An active partner that failed to
    // report a version must NOT trip the "partner-too-old" surface until a floor exists.
    configStore.getState().setConfig({
      integrations: { media: { enabled: true, version: null } },
    });
    expect(evaluateModuleGate(MESSAGES, moduleContext())).toEqual({ mounted: true });
  });
});
