// =====================================================================
// 🛡️ locale-header — locale propagée depuis un cookie vers un en-tête
// =====================================================================
// Le middleware recopie `x-locale` dans l'en-tête de la requête et de la
// réponse. Sans liste blanche, n'importe quelle valeur de cookie atterrit dans
// un en-tête : on n'accepte donc que les langues réellement supportées.
// =====================================================================

import { ALL_LANGUAGES, DEFAULT_LANGUAGE } from '@qoe/i18n/locales';

/** Langues acceptées pour la propagation. */
export const SUPPORTED_LOCALES: readonly string[] = ALL_LANGUAGES;

/**
 * Renvoie la locale à propager, ou la langue par défaut.
 * Toute valeur inconnue, vide ou mal formée est ignorée.
 */
export function safeLocale(value: string | null | undefined): string {
  if (typeof value !== 'string') return DEFAULT_LANGUAGE;
  const candidate = value.trim();
  if (!SUPPORTED_LOCALES.includes(candidate)) return DEFAULT_LANGUAGE;
  return candidate;
}
