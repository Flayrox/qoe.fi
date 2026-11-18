// =====================================================================
// 🧪 @qoe/flags — durcissement (bypass, registre fermé, cache gelé)
// =====================================================================
// Chaque test couvre un défaut constaté pendant l'audit L03 :
//   - le bypass admin activait les coupe-feux (e-mails/inscriptions stoppés)
//   - les clés héritées du prototype entraient dans la carte des flags
//   - `Boolean('false')` activait un flag pourtant coupé
//   - le cache partagé était mutable par n'importe quel appelant
// =====================================================================

import { describe, expect, it, afterEach, beforeEach, vi } from 'vitest';
import {
  FLAGS,
  PROTECTIVE_FLAGS,
  defaultFor,
  hasFlag,
  isProtectiveFlag,
  type FlagKey,
} from '../flags';
import {
  __resetFlagsCache,
  createFlagsContext,
  evaluateFeature,
  getAllFlags,
  isFlagOn,
  loadFlags,
} from '../server';

vi.mock('@qoe/supabase/server', () => ({ createClient: vi.fn() }));

import { createClient } from '@qoe/supabase/server';

const mockedCreateClient = vi.mocked(createClient);

function mockRows(data: unknown, error: unknown = null) {
  mockedCreateClient.mockResolvedValue({
    from: () => ({
      select: () => Promise.resolve({ data, error }),
    }),
  } as never);
}

describe('L03 — registre fermé', () => {
  it('refuse les clés héritées du prototype', () => {
    expect(hasFlag('constructor')).toBe(false);
    expect(hasFlag('toString')).toBe(false);
    expect(hasFlag('__proto__')).toBe(false);
    expect(hasFlag('feed-recommendations')).toBe(true);
  });

  it('renvoie false (fail-closed) pour une clé inconnue', () => {
    expect(defaultFor('inexistant' as FlagKey)).toBe(false);
  });

  it('gèle le registre : une écriture ne change pas le défaut partagé', () => {
    expect(Object.isFrozen(FLAGS)).toBe(true);
    expect(() => {
      (FLAGS as Record<string, boolean>)['feed-recommendations'] = false;
    }).toThrow(TypeError);
    expect(FLAGS['feed-recommendations']).toBe(true);
  });

  it('déclare tous les coupe-feux comme protégés', () => {
    expect([...PROTECTIVE_FLAGS]).toContain('workers-email-kill');
    expect([...PROTECTIVE_FLAGS]).toContain('abuse.signup-kill');
    expect([...PROTECTIVE_FLAGS]).toContain('support.public-kill');
    expect(isProtectiveFlag('feed-recommendations')).toBe(false);
  });
});

describe('L03 — évaluation stricte', () => {
  it("n'interprète pas une chaîne comme un booléen", () => {
    expect(evaluateFeature({ 'landing-pricing-section': 'true' }, 'landing-pricing-section')).toBe(
      false
    );
    expect(evaluateFeature({ 'landing-pricing-section': 1 }, 'landing-pricing-section')).toBe(
      false
    );
  });

  it('accepte la forme GrowthBook { defaultValue } seulement si booléenne', () => {
    expect(
      evaluateFeature(
        { 'landing-pricing-section': { defaultValue: true } },
        'landing-pricing-section'
      )
    ).toBe(true);
    expect(
      evaluateFeature(
        { 'landing-pricing-section': { defaultValue: 'true' } },
        'landing-pricing-section'
      )
    ).toBe(false);
  });

  it('ignore une clé héritée présente dans le payload', () => {
    expect(evaluateFeature({ constructor: true }, 'constructor' as FlagKey)).toBe(false);
  });
});

describe('L03 — bypass admin', () => {
  beforeEach(() => {
    __resetFlagsCache();
    mockedCreateClient.mockReset();
  });
  afterEach(() => {
    __resetFlagsCache();
  });

  it('active toujours une fonctionnalité en déploiement', () => {
    expect(evaluateFeature(null, 'landing-pricing-section', { role: 'admin' })).toBe(true);
    expect(evaluateFeature(null, 'studio-stage-editor', { role: 'admin' })).toBe(true);
  });

  it('ne coupe JAMAIS les e-mails pour un admin', () => {
    expect(evaluateFeature(null, 'workers-email-kill', { role: 'admin' })).toBe(false);
    expect(evaluateFeature(null, 'abuse.signup-kill', { role: 'admin' })).toBe(false);
    expect(evaluateFeature(null, 'support.public-kill', { role: 'admin' })).toBe(false);
  });

  it('lit réellement le coupe-feu en base au lieu de court-circuiter', async () => {
    mockRows([{ key: 'workers-email-kill', is_enabled: true }]);
    expect(await isFlagOn('workers-email-kill', { role: 'admin' })).toBe(true);
  });

  it("n'active pas un envoi coupé pour un admin", async () => {
    mockRows([{ key: 'workers-newsletter-dispatch', is_enabled: false }]);
    expect(await isFlagOn('workers-newsletter-dispatch', { role: 'admin' })).toBe(false);
  });
});

describe('L03 — chargement DB', () => {
  beforeEach(() => {
    __resetFlagsCache();
    mockedCreateClient.mockReset();
  });
  afterEach(() => {
    __resetFlagsCache();
    vi.restoreAllMocks();
  });

  it('ignore les clés inconnues et héritées renvoyées par la table', async () => {
    mockRows([
      { key: 'toString', is_enabled: true },
      { key: 'constructor', is_enabled: true },
      { key: '__proto__', is_enabled: true },
      { key: 'flag-fantome', is_enabled: true },
      { key: 'feed-recommendations', is_enabled: false },
    ]);

    const flags = await loadFlags();
    expect(flags['feed-recommendations']).toBe(false);
    expect(Object.keys(flags).sort()).toEqual(Object.keys(FLAGS).sort());
    expect(Object.prototype.hasOwnProperty.call(flags, 'toString')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(flags, 'flag-fantome')).toBe(false);
  });

  it('refuse une valeur non booléenne venue de la table', async () => {
    mockRows([
      { key: 'landing-pricing-section', is_enabled: 'true' },
      { key: 'web-newsletter-banner', is_enabled: 1 },
    ]);

    const flags = await loadFlags();
    expect(flags['landing-pricing-section']).toBe(false);
    expect(flags['web-newsletter-banner']).toBe(false);
  });

  it('gèle la carte servie : le cache ne peut pas être corrompu', async () => {
    mockRows([{ key: 'feed-recommendations', is_enabled: true }]);
    const flags = await loadFlags();
    expect(Object.isFrozen(flags)).toBe(true);
    expect(() => {
      (flags as Record<string, boolean>)['feed-recommendations'] = false;
    }).toThrow(TypeError);
    expect((await loadFlags())['feed-recommendations']).toBe(true);
    expect(mockedCreateClient).toHaveBeenCalledTimes(1);
  });

  it('expose des copies indépendantes via createFlagsContext.getAll', async () => {
    mockRows([{ key: 'feed-recommendations', is_enabled: false }]);
    const ctx = await createFlagsContext();
    const all = ctx.getAll();
    all['feed-recommendations'] = true;
    expect(ctx.getAll()['feed-recommendations']).toBe(false);
    expect(ctx.isOn('feed-recommendations')).toBe(false);
  });

  it('getAllFlags partage le même cache gelé', async () => {
    mockRows([{ key: 'feed-recommendations', is_enabled: false }]);
    const all = await getAllFlags();
    expect(Object.isFrozen(all)).toBe(true);
    expect(all['feed-recommendations']).toBe(false);
  });
});
