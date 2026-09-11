// =====================================================================
// 🍪 cookie-consent-storage — persistance navigateur du choix traceurs
// =====================================================================
// Complément navigateur de `@qoe/utils/cookie-consent` (qui reste pur et
// donc utilisable côté serveur). Ici : localStorage pour un état instantané
// à l'hydratation, cookie pour que le serveur puisse conditionner — AVANT
// tout JavaScript — le chargement des traceurs non essentiels.
// =====================================================================

import {
  COOKIE_CONSENT_COOKIE,
  COOKIE_CONSENT_KEY,
  COOKIE_CONSENT_MAX_AGE,
  COOKIE_PREFERENCES_EVENT,
  normalizeConsent,
  type CookieConsentChoice,
} from '@qoe/utils/cookie-consent';

/** Lit le choix local (null si absent, illisible ou périmé). */
export function readLocalConsent(): CookieConsentChoice | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(COOKIE_CONSENT_KEY);
    if (!raw) return null;
    return normalizeConsent(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

/** Enregistre le choix (localStorage + cookie lisible côté serveur). */
export function writeConsent(choice: CookieConsentChoice): void {
  if (typeof document === 'undefined') return;
  const normalized = normalizeConsent(choice) ?? choice;
  try {
    window.localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(normalized));
  } catch {
    // Mode privé / stockage plein : le cookie reste la source de vérité.
  }
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie =
    `${COOKIE_CONSENT_COOKIE}=${encodeURIComponent(JSON.stringify(normalized))}` +
    `; Max-Age=${COOKIE_CONSENT_MAX_AGE}; Path=/; SameSite=Lax${secure}`;
}

/** 🔔 Rouvre la bannière depuis n'importe où (« Gérer mes cookies »). */
export function openCookiePreferences(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(COOKIE_PREFERENCES_EVENT));
}

/** 🔔 S'abonne aux demandes de réouverture. Retourne la fonction de retrait. */
export function subscribeCookiePreferences(handler: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(COOKIE_PREFERENCES_EVENT, handler);
  return () => window.removeEventListener(COOKIE_PREFERENCES_EVENT, handler);
}
