// =====================================================================
// 🍪 cookie-consent — preuve et lecture du choix de traceurs
// =====================================================================
// Le choix est stocké deux fois volontairement :
//   - localStorage : état instantané pour la bannière (pas de flash) ;
//   - cookie lisible côté serveur : permet de charger (ou non) les
//     traceurs non essentiels AVANT toute exécution JavaScript, ce qui
//     est la seule façon de tenir la promesse « aucun traceur non
//     essentiel avant consentement » (art. 82 LIL / art. 7 RGPD).
// Durée de conservation du choix : 6 mois, puis il est redemandé.
//
// Partagé par toutes les apps (site public qoe.fi, blogs des créateurs) :
// une seule politique, un seul format de cookie, donc une seule preuve.
// =====================================================================

export const COOKIE_POLICY_SLUG = 'politique-cookies';
export const COOKIE_CONSENT_KEY = 'qoe.cookie-consent';
export const COOKIE_CONSENT_COOKIE = 'qoe_cookie_consent';
export const COOKIE_CONSENT_MAX_AGE = 60 * 60 * 24 * 180; // 6 mois
export const COOKIE_PREFERENCES_EVENT = 'qoe:cookie-preferences';

export interface CookieConsentChoice {
  /** Version de la politique acceptée (permet de redemander si elle change). */
  version: string;
  /** Le module de mesure d'audience. */
  analytics: boolean;
  /** Préférences fonctionnelles (langue, confort de lecture…). */
  functional: boolean;
  /** Publicité : aucune par défaut, la finalité n'existe pas chez qoe.fi. */
  marketing: boolean;
  decidedAt: string;
}

export const COOKIE_CONSENT_VERSION = '1.0';

/** Choix par défaut : tout ce qui n'est pas essentiel est refusé. */
export function defaultChoice(): CookieConsentChoice {
  return {
    version: COOKIE_CONSENT_VERSION,
    analytics: false,
    functional: false,
    marketing: false,
    decidedAt: new Date().toISOString(),
  };
}

// Les fonctions qui touchent au stockage (localStorage, document.cookie) et
// aux évènements navigateur vivent dans `@qoe/ui` (`legal/cookie-consent-storage`)
// : ce module reste pur et donc utilisable côté serveur (AnalyticsGate relit
// le cookie via `parseConsentCookie`).

/**
 * Normalise un choix quelconque (localStorage, cookie) en objet sûr.
 * Retourne null si absent, malformé ou périmé (> 6 mois ou version changée).
 */
export function normalizeConsent(value: unknown): CookieConsentChoice | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const decidedAt = typeof raw.decidedAt === 'string' ? raw.decidedAt : '';
  const decided = new Date(decidedAt);
  if (Number.isNaN(decided.getTime())) return null;
  const ageMs = Date.now() - decided.getTime();
  if (ageMs < 0 || ageMs > COOKIE_CONSENT_MAX_AGE * 1000) return null;
  const version = typeof raw.version === 'string' ? raw.version : COOKIE_CONSENT_VERSION;
  if (version !== COOKIE_CONSENT_VERSION) return null;
  return {
    version,
    analytics: raw.analytics === true,
    functional: raw.functional === true,
    marketing: raw.marketing === true,
    decidedAt,
  };
}

/** Découpe un cookie brut (côté serveur) en choix exploitable. */
export function parseConsentCookie(raw: string | undefined): CookieConsentChoice | null {
  if (!raw) return null;
  try {
    return normalizeConsent(JSON.parse(decodeURIComponent(raw)) as unknown);
  } catch {
    return null;
  }
}
