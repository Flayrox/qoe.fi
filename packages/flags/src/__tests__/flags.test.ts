// =====================================================================
// 🧪 Feature flags — @qoe/flags
// =====================================================================
// 📖 Vérifie :
//    - le registre (valeurs par défaut)
//    - l'évaluation synchrone sur payload (sans réseau)
//    - la dégradation gracieuse sans config / si GrowthBook est down
// =====================================================================

import { describe, expect, it, afterEach, vi } from 'vitest';
import { setPolyfills } from '@growthbook/growthbook';
import { FLAGS, defaultFor, type FlagKey } from '../flags';
import { evaluateFeature, isFlagOn, __resetGrowthBookCache } from '../server';

const ALL_KEYS = Object.keys(FLAGS) as FlagKey[];

describe('registre des flags', () => {
  it('chaque clé a un défaut booléen', () => {
    for (const key of ALL_KEYS) {
      expect(typeof defaultFor(key)).toBe('boolean');
    }
  });

  it("le défaut d'une clé inconnue est sécurisé", () => {
    expect(defaultFor('inexistant' as FlagKey)).toBeUndefined();
  });
});

describe('evaluateFeature (synchrone, sans réseau)', () => {
  const payload = {
    features: {
      'feed-recommendations': { defaultValue: true },
    },
  };

  it('utilise la valeur du payload quand présente', () => {
    expect(evaluateFeature(payload as never, 'feed-recommendations')).toBe(true);
  });

  it('retombe sur le défaut du registre quand le flag est absent', () => {
    expect(evaluateFeature(payload as never, 'web-newsletter-banner')).toBe(
      defaultFor('web-newsletter-banner')
    );
  });

  it('retombe sur le défaut quand le payload est null', () => {
    expect(evaluateFeature(null, 'feed-recommendations')).toBe(defaultFor('feed-recommendations'));
  });

  it('prend en compte les attributs pour le ciblage', () => {
    const targeted = {
      features: {
        'feed-recommendations': {
          defaultValue: false,
          rules: [{ condition: { id: 'u_42' }, force: true }],
        },
      },
    };
    expect(evaluateFeature(targeted as never, 'feed-recommendations', { id: 'u_42' })).toBe(true);
    expect(evaluateFeature(targeted as never, 'feed-recommendations', { id: 'u_99' })).toBe(false);
  });
});

describe('isFlagOn (dégradation gracieuse)', () => {
  const OLD_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...OLD_ENV };
    __resetGrowthBookCache();
    vi.restoreAllMocks();
  });

  it('retourne le défaut sans config GrowthBook', async () => {
    delete process.env.GROWTHBOOK_API_HOST;
    delete process.env.GROWTHBOOK_CLIENT_KEY;
    expect(await isFlagOn('feed-recommendations')).toBe(defaultFor('feed-recommendations'));
  });

  it('retourne le défaut si GrowthBook est down (fetch échoue)', async () => {
    process.env.GROWTHBOOK_API_HOST = 'http://localhost:3200';
    process.env.GROWTHBOOK_CLIENT_KEY = 'sdk-test';
    setPolyfills({
      fetch: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch,
    });
    expect(await isFlagOn('feed-recommendations')).toBe(defaultFor('feed-recommendations'));
  });

  it("charge et évalue le payload depuis l'API GrowthBook", async () => {
    process.env.GROWTHBOOK_API_HOST = 'http://localhost:3200';
    process.env.GROWTHBOOK_CLIENT_KEY = 'sdk-test';
    setPolyfills({
      fetch: (() =>
        Promise.resolve({
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: async () => ({
            features: { 'feed-recommendations': { defaultValue: true } },
          }),
        })) as unknown as typeof fetch,
    });
    expect(await isFlagOn('feed-recommendations')).toBe(true);
  });
});
