// =====================================================================
// 🍪 cookie-consent-storage — persistance navigateur du choix traceurs
// =====================================================================
// Complément navigateur de `@qoe/utils/cookie-consent` (qui reste pur et
// donc utilisable côté serveur). Ici : localStorage pour un état instantané
// à l'hydratation, cookie pour que le serveur puisse conditionner — AVANT
// tout JavaScript — le chargement des traceurs non essentiels.
//
// On conserve aussi un `consentId` stable pour ce navigateur : c'est lui qui
// permet, côté serveur, de relier les choix successifs d'un même visiteur
// (accepter, puis refuser, puis ré-accepter) sans jamais identifier la personne.
// =====================================================================

import {
  ANALYTICS_DISABLED_KEY,
  COOKIE_CONSENT_COOKIE,
  COOKIE_CONSENT_KEY,
  COOKIE_CONSENT_MAX_AGE,
  COOKIE_PREFERENCES_EVENT,
  normalizeConsent,
  type CookieConsentChoice,
} from '@qoe/utils/cookie-consent';

export const COOKIE_CONSENT_ID_KEY = 'qoe.cookie-consent-id';

// Identifiant — volontairement aléatoire et local : ni e-mail, ni empreinte
// d'appareil. Il ne sert qu'à corréler un journal, pas à reconnaître un humain.
function randomId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // Navigateur ancien : on retombe sur une valeur aléatoire simple.
  }
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** 🔑 Identifiant de consentement de ce navigateur (créé au premier besoin). */
export function readConsentId(): string {
  if (typeof window === 'undefined') return '';
  try {
    const existing = window.localStorage.getItem(COOKIE_CONSENT_ID_KEY);
    if (existing && existing.length >= 8) return existing;
    const created = randomId();
    window.localStorage.setItem(COOKIE_CONSENT_ID_KEY, created);
    return created;
  } catch {
    return '';
  }
}

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
  // 🚫 Le script de mesure d'audience relit cette clé avant chaque envoi : une
  // opposition exprimée éteint la mesure côté navigateur, sans dépendre d'un
  // aller-retour serveur.
  try {
    if (normalized.analytics === false) {
      window.localStorage.setItem(ANALYTICS_DISABLED_KEY, 'true');
    } else {
      window.localStorage.removeItem(ANALYTICS_DISABLED_KEY);
    }
  } catch {
    // Stockage indisponible : le cookie fait foi pour le rendu serveur.
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
