import { describe, expect, it } from 'vitest';
import {
  COOKIE_CONSENT_COOKIE,
  COOKIE_CONSENT_KEY,
  COOKIE_CONSENT_MAX_AGE,
  COOKIE_CONSENT_VERSION,
  normalizeConsent,
  parseConsentCookie,
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
