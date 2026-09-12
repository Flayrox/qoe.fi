import { describe, expect, it } from 'vitest';
import {
  acceptedOptionalCount,
  categoriesToChoice,
  choiceToCategories,
  COOKIE_CATEGORIES,
  COOKIE_CONSENT_COOKIE,
  COOKIE_CONSENT_KEY,
  COOKIE_CONSENT_MAX_AGE,
  COOKIE_CONSENT_VERSION,
  defaultChoice,
  normalizeConsent,
  parseConsentCookie,
  TRACKER_REGISTRY,
  trackersByCategory,
} from '../cookie-consent';

describe('🍪 cookie-consent — normalizeConsent', () => {
  it('refuse les valeurs absentes ou non-objet', () => {
    expect(normalizeConsent(null)).toBeNull();
    expect(normalizeConsent('oui')).toBeNull();
    expect(normalizeConsent({})).toBeNull();
  });

  it('refuse une date invalide', () => {
    expect(normalizeConsent({ version: COOKIE_CONSENT_VERSION, decidedAt: 'jamais' })).toBeNull();
  });

  it('refuse un choix périmé (> 6 mois)', () => {
    const old = new Date(Date.now() - (COOKIE_CONSENT_MAX_AGE + 60) * 1000).toISOString();
    expect(normalizeConsent({ version: COOKIE_CONSENT_VERSION, decidedAt: old })).toBeNull();
  });

  it('refuse un choix pris sous une version antérieure de la politique', () => {
    expect(
      normalizeConsent({
        version: '0.9',
        decidedAt: new Date().toISOString(),
      })
    ).toBeNull();
  });

  it('coerce les drapeaux non booléens en false', () => {
    const choice = normalizeConsent({
      version: COOKIE_CONSENT_VERSION,
      decidedAt: new Date().toISOString(),
      analytics: 'yes',
      functional: 1,
      marketing: null,
    });
    expect(choice).toEqual({
      version: COOKIE_CONSENT_VERSION,
      analytics: false,
      functional: false,
      marketing: false,
      decidedAt: expect.any(String),
    });
  });
});

describe('🍪 cookie-consent — cookie serveur', () => {
  it('décode un cookie de consentement valide', () => {
    const raw = encodeURIComponent(
      JSON.stringify({
        version: COOKIE_CONSENT_VERSION,
        analytics: true,
        functional: false,
        marketing: false,
        decidedAt: new Date().toISOString(),
      })
    );
    expect(parseConsentCookie(raw)?.analytics).toBe(true);
  });

  it('ne plante pas sur un cookie corrompu ou absent', () => {
    expect(parseConsentCookie('%%%pas-du-json%%%')).toBeNull();
    expect(parseConsentCookie(undefined)).toBeNull();
    expect(parseConsentCookie('')).toBeNull();
  });

  it('expose les clés attendues par la politique de cookies', () => {
    expect(COOKIE_CONSENT_KEY).toBe('qoe.cookie-consent');
    expect(COOKIE_CONSENT_COOKIE).toBe('qoe_cookie_consent');
  });
});

describe('🍪 cookie-consent — catégories', () => {
  it('verrouille les traceurs strictement nécessaires et eux seuls', () => {
    const locked = COOKIE_CATEGORIES.filter((category) => category.locked).map((c) => c.key);
    expect(locked).toEqual(['necessary']);
  });

  it('part d’un refus par défaut, jamais d’une acceptation implicite', () => {
    const choice = defaultChoice();
    expect(choice.analytics).toBe(false);
    expect(choice.functional).toBe(false);
    expect(choice.marketing).toBe(false);
    expect(acceptedOptionalCount(choice)).toBe(0);
  });

  it('convertit un choix en dictionnaire de catégories, nécessaire toujours actif', () => {
    const categories = choiceToCategories({
      ...defaultChoice(),
      analytics: true,
      marketing: true,
    });
    expect(categories).toEqual({
      necessary: true,
      analytics: true,
      functional: false,
      marketing: true,
    });
  });

  it('se réimporte sans perte (journal → choix)', () => {
    const restored = categoriesToChoice({ analytics: true, functional: true, marketing: false });
    expect(restored.analytics).toBe(true);
    expect(restored.functional).toBe(true);
    expect(restored.marketing).toBe(false);
    expect(restored.version).toBe(COOKIE_CONSENT_VERSION);
  });
});

describe('🍪 cookie-consent — registre des traceurs', () => {
  it('range chaque traceur dans une catégorie déclarée', () => {
    const known = new Set(COOKIE_CATEGORIES.map((category) => category.key));
    for (const tracker of TRACKER_REGISTRY) {
      expect(known.has(tracker.category)).toBe(true);
    }
  });

  it('documente chaque traceur : qui, pourquoi, combien de temps', () => {
    // Un traceur sans finalité ni durée dans le registre ne peut pas être
    // présenté honnêtement dans le centre de préférences.
    for (const tracker of TRACKER_REGISTRY) {
      expect(tracker.name.length).toBeGreaterThan(0);
      expect(tracker.provider.length).toBeGreaterThan(0);
      expect(tracker.purpose.fr.length).toBeGreaterThan(10);
      expect(tracker.purpose.en.length).toBeGreaterThan(10);
      expect(tracker.retention.fr.length).toBeGreaterThan(0);
      expect(tracker.retention.en.length).toBeGreaterThan(0);
    }
  });

  it('n’a aucun doublon de nom : deux lignes pour un traceur, c’est une preuve fausse', () => {
    const names = TRACKER_REGISTRY.map((tracker) => tracker.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('déclare au moins un traceur non essentiel (sinon la bannière serait un mensonge)', () => {
    const optional = TRACKER_REGISTRY.filter((tracker) => tracker.category !== 'necessary');
    expect(optional.length).toBeGreaterThan(0);
    for (const tracker of optional) {
      expect(
        tracker.category === 'analytics' ||
          tracker.category === 'functional' ||
          tracker.category === 'marketing'
      ).toBe(true);
    }
  });

  it('filtre par catégorie sans perdre de traceur', () => {
    const total = COOKIE_CATEGORIES.reduce(
      (sum, category) => sum + trackersByCategory(category.key).length,
      0
    );
    expect(total).toBe(TRACKER_REGISTRY.length);
  });
});
