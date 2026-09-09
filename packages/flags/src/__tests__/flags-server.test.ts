// =====================================================================
// 🧪 @qoe/flags/server — cache, surcharge Supabase, dégradation & payload
// =====================================================================
// Complète flags.test.ts sur les chemins serveur : cache TTL, application
// des valeurs de la table feature_flags (clés connues ignorées si
// inconnues), catch de connexion, payload « objet » GrowthBook-style et
// helpers SSR (getAllFlags / getGrowthBookPayload).
// =====================================================================

import { describe, expect, it, afterEach, beforeEach, vi } from 'vitest';
import { defaultFor } from '../flags';
import {
  loadFlags,
  getAllFlags,
  getGrowthBookPayload,
  evaluateFeature,
  __resetFlagsCache,
} from '../server';

// La DB Supabase est simulée : le vrai createClient dépend d'env absents en
// CI (dégradation gracieuse testée dans flags.test.ts).
vi.mock('@qoe/supabase/server', () => ({
  createClient: vi.fn(),
}));

import { createClient } from '@qoe/supabase/server';

const mockedCreateClient = vi.mocked(createClient);

function mockSupabaseSelect(data: unknown, error: unknown = null) {
  mockedCreateClient.mockResolvedValue({
    from: () => ({
      select: () => Promise.resolve({ data, error }),
    }),
  } as never);
}

describe('@qoe/flags/server — chargement avec surcharge Supabase', () => {
  beforeEach(() => {
    __resetFlagsCache();
    mockedCreateClient.mockReset();
  });
  afterEach(() => {
    __resetFlagsCache();
    vi.restoreAllMocks();
  });

  it('applique les valeurs de la table et ignore les clés inconnues', async () => {
    mockSupabaseSelect([
      { key: 'feed-recommendations', is_enabled: false },
      { key: 'clé-inconnue-dans-registre', is_enabled: true },
      { key: 'workers-newsletter-dispatch', is_enabled: false },
    ]);

    const flags = await loadFlags();
    expect(flags['feed-recommendations']).toBe(false); // surchargé par la table
    expect(flags['workers-newsletter-dispatch']).toBe(false);
    // Les autres flags restent sur les défauts du registre.
    expect(flags['web-newsletter-banner']).toBe(defaultFor('web-newsletter-banner'));
  });

  it('sert le cache TTL sans re-requêter Supabase', async () => {
    mockSupabaseSelect([{ key: 'feed-recommendations', is_enabled: false }]);

    const first = await loadFlags();
    const second = await loadFlags();
    expect(second).toBe(first); // même objet en cache
    expect(mockedCreateClient).toHaveBeenCalledTimes(1); // 1 seule requête
  });

  it('retombe sur les défauts si Supabase renvoie une erreur', async () => {
    mockSupabaseSelect(null, { message: 'boom' });
    const flags = await loadFlags();
    expect(flags['feed-recommendations']).toBe(defaultFor('feed-recommendations'));
  });

  it('retombe sur les défauts si la connexion lève (catch)', async () => {
    mockedCreateClient.mockRejectedValue(new Error('db down'));
    const flags = await loadFlags();
    expect(flags['feed-recommendations']).toBe(defaultFor('feed-recommendations'));
  });

  it('getAllFlags et getGrowthBookPayload exposent le même état', async () => {
    mockSupabaseSelect([{ key: 'feed-recommendations', is_enabled: true }]);
    const all = await getAllFlags();
    const legacy = await getGrowthBookPayload();
    expect(all['feed-recommendations']).toBe(true);
    expect(legacy['feed-recommendations']).toBe(true);
  });
});

describe('@qoe/flags/server — evaluateFeature payload objet (GrowthBook-style)', () => {
  it('traite un payload objet { defaultValue } comme un GrowthBook feature', () => {
    const payload = { 'landing-pricing-section': { defaultValue: true } };
    expect(evaluateFeature(payload, 'landing-pricing-section')).toBe(true);
  });

  it('retombe sur le défaut pour une valeur non booléenne', () => {
    const payload = { 'landing-pricing-section': 'string-value' };
    expect(evaluateFeature(payload, 'landing-pricing-section')).toBe(true);
  });

  it('continue à activer les flags pour un admin', () => {
    expect(evaluateFeature(null, 'feed-recommendations', { role: 'admin' })).toBe(true);
  });
});
