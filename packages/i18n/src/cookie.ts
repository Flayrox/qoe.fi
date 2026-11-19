// =====================================================================
// 🍪 cookie.ts — Cookie de locale (pur, testable hors navigateur)
// =====================================================================
// Le provider écrivait `x-locale=${lang}` brut : une valeur non validée
// pouvait injecter d'autres cookies (`"fr; x-locale=en"`), le cookie partait
// sans `SameSite` ni `Secure`, et `hostname.endsWith('qoe.fi')` acceptait
// `evilqoe.fi`. La construction est isolée ici pour être vérifiée.
// =====================================================================

import { ALL_LANGUAGES, type Language } from './locales';

export const LOCALE_COOKIE_NAME = 'x-locale';
export const LOCALE_COOKIE_MAX_AGE = 31536000;

/** Domaines (sans point) qui partagent le cookie entre sous-domaines. */
const SHARED_DOMAINS = ['qoe.test', 'lvh.me', 'qoe.fi'] as const;

export function isSupportedLanguage(value: string): value is Language {
  return (ALL_LANGUAGES as string[]).includes(value);
}

/**
 * Domaine partageable correspondant à un hôte, ou `null` (cookie host-only).
 * `evilqoe.fi` ne doit PAS correspondre : on compare des labels entiers.
 */
function sharedDomainFor(hostname: string): string | null {
  const match = SHARED_DOMAINS.find(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
  );
  return match ? `.${match}` : null;
}

/**
 * Construit l'attribut `Set-Cookie` de la locale.
 * Renvoie `null` si la langue n'est pas supportée (aucune écriture).
 */
export function buildLocaleCookie(
  lang: string,
  hostname: string,
  isSecure: boolean
): string | null {
  if (!isSupportedLanguage(lang)) {
    return null;
  }
  const domain = sharedDomainFor(hostname);
  const attributes = [
    `${LOCALE_COOKIE_NAME}=${encodeURIComponent(lang)}`,
    'path=/',
    `max-age=${LOCALE_COOKIE_MAX_AGE}`,
  ];
  if (domain) {
    attributes.push(`domain=${domain}`);
  }
  attributes.push('SameSite=Lax');
  if (isSecure) {
    attributes.push('Secure');
  }
  return attributes.join(';');
}
