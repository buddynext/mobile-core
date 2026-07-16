/**
 * The two gates.
 *
 * The app gate's tests are ordered the way the gate is: the point of most of them is not
 * "does it reject X" but "does it reject X for the RIGHT reason, before it would have
 * read a field it cannot trust". A gate that returns the right pass/fail for the wrong
 * reason ships the wrong screen.
 */

import { evaluateAppGate, type AppConfig, type AppConfigFetch } from './appGate';
import { evaluateModuleGate, type ModuleGateInput } from './moduleGate';

const APP = { appVersion: '1.0.0', understoodContract: 1 };

const config = (over: Partial<AppConfig> = {}): AppConfig => ({
  contract_version: 1,
  app_enabled: true,
  pro_active: true,
  min_app_version: '',
  ...over,
});

const reached = (body: unknown): AppConfigFetch => ({ reachable: true, body });

describe('app gate — the happy path', () => {
  it('opens on a licensed, current, in-contract site', () => {
    const status = evaluateAppGate(reached(config()), APP);

    expect(status.ok).toBe(true);
    expect(status.ok && status.config.app_enabled).toBe(true);
  });
});

describe('app gate — order is the insight', () => {
  it('reports unreachable before anything else', () => {
    const status = evaluateAppGate({ reachable: false }, APP);
    expect(status.ok).toBe(false);
    expect(!status.ok && status.reason).toBe('unreachable');
  });

  it('calls a non-BuddyNext body not-buddynext, not app-disabled', () => {
    // A captive portal or a stranger's API. The naive gate reads app_enabled (absent ->
    // falsy) and says "Requires Pro" — confidently wrong.
    for (const body of [null, 'html', 42, {}, { app_enabled: true }, { contract_version: 'x' }]) {
      const status = evaluateAppGate(reached(body), APP);
      expect(status.ok).toBe(false);
      expect(!status.ok && status.reason).toBe('not-buddynext');
    }
  });

  it('checks contract BEFORE reading app_enabled', () => {
    // The load-bearing ordering test. A newer contract might have moved app_enabled; even
    // with app_enabled:false present, the honest answer is "app too old", not "disabled".
    const status = evaluateAppGate(
      reached(config({ contract_version: 2, app_enabled: false })),
      APP
    );
    expect(status.ok).toBe(false);
    expect(!status.ok && status.reason).toBe('contract-too-new');
  });

  it('checks version BEFORE licence', () => {
    // Both fail here. The member should be told to update the app, not that they lack a
    // licence they may well have.
    const status = evaluateAppGate(
      reached(config({ min_app_version: '2.0.0', app_enabled: false })),
      APP
    );
    expect(status.ok).toBe(false);
    expect(!status.ok && status.reason).toBe('app-too-old');
  });
});

describe('app gate — app_enabled fails CLOSED', () => {
  it.each([
    ['false', false],
    ['missing', undefined],
    ['truthy-but-not-true 1', 1],
    ['truthy string', 'true'],
    ['null', null],
  ])('stays shut when app_enabled is %s', (_label, value) => {
    const status = evaluateAppGate(
      reached({ ...config(), app_enabled: value as unknown as boolean }),
      APP
    );
    expect(status.ok).toBe(false);
    expect(!status.ok && status.reason).toBe('app-disabled');
  });

  it('opens ONLY on a strict boolean true', () => {
    expect(evaluateAppGate(reached(config({ app_enabled: true })), APP).ok).toBe(true);
  });

  it('names the likely cause differently for a Pro vs a non-Pro site', () => {
    const noPro = evaluateAppGate(reached(config({ app_enabled: false, pro_active: false })), APP);
    const stalePro = evaluateAppGate(reached(config({ app_enabled: false, pro_active: true })), APP);

    expect(!noPro.ok && noPro.detail).toMatch(/licence the app requires/i);
    expect(!stalePro.ok && stalePro.detail).toMatch(/licence may be inactive/i);
  });
});

describe('app gate — min_app_version fails OPEN', () => {
  it('opens on an empty floor (the common case)', () => {
    expect(evaluateAppGate(reached(config({ min_app_version: '' })), APP).ok).toBe(true);
  });

  it('opens on a malformed floor rather than bricking the site', () => {
    expect(evaluateAppGate(reached(config({ min_app_version: 'latest' })), APP).ok).toBe(true);
  });

  it('still enforces a valid floor', () => {
    const status = evaluateAppGate(reached(config({ min_app_version: '1.5.0' })), APP);
    expect(status.ok).toBe(false);
    expect(!status.ok && status.reason).toBe('app-too-old');
  });
});

// ── Module gate ────────────────────────────────────────────────────────────────────

const mod = (over: Partial<ModuleGateInput>): ModuleGateInput => ({
  id: 'x',
  tier: 'opt_in',
  flag: 'x',
  ...over,
});

describe('module gate — mandatory always mounts', () => {
  it('mounts with no flag', () => {
    expect(evaluateModuleGate(mod({ tier: 'mandatory', flag: null }), { features: {} })).toEqual({
      mounted: true,
    });
  });

  it('ignores a stray flag — mandatory is not switchable', () => {
    const status = evaluateModuleGate(mod({ tier: 'mandatory', flag: 'x' }), {
      features: { x: false },
    });
    expect(status.mounted).toBe(true);
  });
});

describe('module gate — default_on', () => {
  it('mounts when the flag is absent (default wins)', () => {
    expect(evaluateModuleGate(mod({ tier: 'default_on' }), { features: {} }).mounted).toBe(true);
  });

  it('mounts when the flag is true', () => {
    expect(
      evaluateModuleGate(mod({ tier: 'default_on' }), { features: { x: true } }).mounted
    ).toBe(true);
  });

  it('is silently off ONLY on an explicit false', () => {
    const status = evaluateModuleGate(mod({ tier: 'default_on' }), { features: { x: false } });
    expect(status).toEqual({ mounted: false, silent: true, reason: 'flag-off' });
  });
});

describe('module gate — opt_in', () => {
  it('is silently off when the flag is absent', () => {
    const status = evaluateModuleGate(mod({ tier: 'opt_in' }), { features: {} });
    expect(status).toEqual({ mounted: false, silent: true, reason: 'flag-off' });
  });

  it('mounts only on an explicit true', () => {
    expect(evaluateModuleGate(mod({ tier: 'opt_in' }), { features: { x: true } }).mounted).toBe(
      true
    );
  });
});

describe('module gate — integration', () => {
  const integ = (over: Partial<ModuleGateInput> = {}) =>
    mod({ id: 'listora', tier: 'integration', flag: 'listora', ...over });

  it('is silently off when the partner is disabled — no reason surfaced', () => {
    const status = evaluateModuleGate(integ(), { features: { listora: false } });
    expect(status).toEqual({ mounted: false, silent: true, reason: 'flag-off' });
  });

  it('mounts when enabled and no floor is set', () => {
    expect(evaluateModuleGate(integ(), { features: { listora: true } }).mounted).toBe(true);
  });

  it('mounts when the partner meets the floor', () => {
    const status = evaluateModuleGate(integ({ minPluginVersion: '2.0.0' }), {
      features: { listora: true },
      partnerVersions: { listora: '2.1.0' },
    });
    expect(status.mounted).toBe(true);
  });

  it('does NOT mount and DOES explain when the partner is too old', () => {
    // The one non-silent failure: the owner installed it and deserves to know why it is
    // dark. Contrast the flag-off case, which is silent.
    const status = evaluateModuleGate(integ({ minPluginVersion: '2.0.0' }), {
      features: { listora: true },
      partnerVersions: { listora: '1.4.0' },
    });
    expect(status.mounted).toBe(false);
    expect(status.mounted === false && status.silent).toBe(false);
    expect(status.mounted === false && status.reason).toBe('partner-too-old');
  });

  it('explains rather than silently mounting when an enabled partner reports no version', () => {
    // The trap: flag on, version absent. Silently mounting here ships a module that calls
    // routes the old plugin never registered. Explain instead.
    const status = evaluateModuleGate(integ({ minPluginVersion: '2.0.0' }), {
      features: { listora: true },
    });
    expect(status.mounted).toBe(false);
    expect(status.mounted === false && status.reason).toBe('partner-too-old');
  });
});

describe('module gate — unknown tier is a data error, fails silent-off', () => {
  it('does not mount an unrecognised tier', () => {
    const status = evaluateModuleGate(
      { id: 'z', tier: 'weird' as ModuleGateInput['tier'], flag: 'z' },
      { features: { z: true } }
    );
    expect(status.mounted).toBe(false);
  });
});
