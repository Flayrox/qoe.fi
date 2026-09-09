// =====================================================================
// 🧪 Feature flags — @qoe/flags
// =====================================================================
// 📖 Vérifie :
//    - le registre (valeurs par défaut)
//    - l'évaluation synchrone (sur payload ou defaults)
//    - le ciblage par rôle (admin)
//    - la dégradation gracieuse si Supabase est indisponible
// =====================================================================

import { describe, expect, it, afterEach, vi } from 'vitest';
import { FLAGS, defaultFor, type FlagKey } from '../flags';
import { evaluateFeature, isFlagOn, __resetFlagsCache, createFlagsContext } from '../server';

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
  const payload: Record<string, boolean> = {
    'feed-recommendations': true,
    'landing-pricing-section': true,
  };

  it('utilise la valeur du payload quand présente', () => {
    expect(evaluateFeature(payload, 'landing-pricing-section')).toBe(true);
  });

  it('retombe sur le défaut du registre quand le flag est absent', () => {
    expect(evaluateFeature(payload, 'web-newsletter-banner')).toBe(
      defaultFor('web-newsletter-banner')
    );
  });

  it('retombe sur le défaut quand le payload est null', () => {
    expect(evaluateFeature(null, 'feed-recommendations')).toBe(defaultFor('feed-recommendations'));
  });

  it('active toujours le flag pour un admin', () => {
    expect(evaluateFeature(null, 'landing-pricing-section', { role: 'admin' })).toBe(true);
  });
});

describe('isFlagOn (dégradation gracieuse)', () => {
  afterEach(() => {
    __resetFlagsCache();
    vi.restoreAllMocks();
  });

  it('retourne le défaut sans Supabase configuré', async () => {
    expect(await isFlagOn('feed-recommendations')).toBe(defaultFor('feed-recommendations'));
  });

  it('active pour admin même sans configuration', async () => {
    expect(await isFlagOn('landing-pricing-section', { role: 'admin' })).toBe(true);
  });
});

describe('createFlagsContext', () => {
  afterEach(() => {
    __resetFlagsCache();
  });

  it('crée un contexte avec isOn et getAll', async () => {
    const ctx = await createFlagsContext();
    expect(typeof ctx.isOn).toBe('function');
    expect(ctx.isOn('feed-recommendations')).toBe(defaultFor('feed-recommendations'));
    expect(ctx.getAll()).toBeDefined();
  });
});
