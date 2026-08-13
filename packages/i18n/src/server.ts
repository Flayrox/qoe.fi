// =====================================================================
// 🖥️ server.ts — Server Translation Helpers with DB Overrides
// =====================================================================

import { ALL_LANGUAGES, DEFAULT_LANGUAGE, type Language } from './locales';
import frTranslations from '../../../messages/fr.json';
import enTranslations from '../../../messages/en.json';
import frCatalog from '../../../messages/fr.js';
import enCatalog from '../../../messages/en.js';
import { prisma } from '@qoe/db/client';
import { unstable_cache } from 'next/cache';
import {
  getI18n,
  setActiveLanguage,
  flattenMessages,
  createTranslator,
  type I18nParams,
} from './core';

// Compiled catalogs (macro IDs) merged with the legacy key-based JSON so both
// migrated and legacy call sites resolve during the transition.
const catalogs: Record<string, Record<string, string>> = {
  fr: { ...flattenMessages(frTranslations as Record<string, unknown>), ...frCatalog.messages },
  en: { ...flattenMessages(enTranslations as Record<string, unknown>), ...enCatalog.messages },
};

// Next.js cache for translation overrides (cleared when Tag "i18n-overrides" is revalidated)
export const getCachedOverrides = unstable_cache(
  async () => {
    try {
      const config = await prisma.systemConfig.findUnique({
        where: { key: 'TRANSLATIONS_OVERRIDE' },
      });
      if (config?.value) {
        return JSON.parse(config.value);
      }
    } catch (e) {
      console.error('Failed to load i18n overrides from DB:', e);
    }
    return {};
  },
  ['i18n-overrides'],
  { tags: ['i18n-overrides'] }
);

export function translateKey(
  lang: string,
  key: string,
  defaultValue?: string,
  params?: I18nParams,
  overrides: Record<string, unknown> = {}
): string {
  // Check db overrides first
  const langOverrides: Record<string, unknown> = (overrides[lang] as Record<string, unknown>) || {};
  const overrideParts = key.split('.');
  let overrideVal: unknown = langOverrides;
  for (const part of overrideParts) {
    if (overrideVal === undefined || overrideVal === null) break;
    if (typeof overrideVal !== 'object') {
      overrideVal = undefined;
      break;
    }
    overrideVal = (overrideVal as Record<string, unknown>)[part];
  }

  const overridden = typeof overrideVal === 'string' ? overrideVal : undefined;

  // Load the catalogue (compiled macros + legacy keys + overrides)
  const i18n = getI18n();
  const staticMessages: Record<string, string> = {
    ...(catalogs[lang] || catalogs[DEFAULT_LANGUAGE]),
  };
  if (langOverrides && Object.keys(langOverrides).length > 0) {
    deepMerge(staticMessages, langOverrides);
  }
  setActiveLanguage(lang, staticMessages);

  const t = createTranslator(i18n);
  return t(key, overridden || defaultValue, params);
}

/**
 * Deep merge of override objects into the base translation map.
 */
function deepMerge(base: Record<string, unknown>, override: Record<string, unknown>) {
  for (const [k, v] of Object.entries(override)) {
    if (
      v &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      base[k] &&
      typeof base[k] === 'object' &&
      !Array.isArray(base[k])
    ) {
      deepMerge(base[k] as Record<string, unknown>, v as Record<string, unknown>);
    } else {
      base[k] = v;
    }
  }
}

/**
 * 🌐 Détecte la langue depuis les cookies/headers Next.js.
 * Priority: cookie "x-locale" > header "x-locale" > default "fr"
 */
export async function getLanguage(): Promise<Language> {
  const { cookies, headers } = await import('next/headers');

  // 1. Try reading the cookie directly (most reliable)
  try {
    const cookieStore = await cookies();
    const cookieLang = cookieStore.get('x-locale')?.value;
    if (cookieLang && (ALL_LANGUAGES as string[]).includes(cookieLang)) {
      return cookieLang as Language;
    }
  } catch {}

  // 2. Fallback: read the header (set by middleware)
  try {
    const headerList = await headers();
    const headerLang = headerList.get('x-locale');
    if (headerLang && (ALL_LANGUAGES as string[]).includes(headerLang)) {
      return headerLang as Language;
    }
  } catch {}

  return DEFAULT_LANGUAGE;
}

/**
 * 📝 Helper de traduction côté serveur.
 */
export async function getTranslate() {
  const activeLang = await getLanguage();
  const overrides = await getCachedOverrides();
  return (key: string, defaultValue?: string | I18nParams, params?: I18nParams): string => {
    const defVal = typeof defaultValue === 'string' ? defaultValue : undefined;
    const p = typeof defaultValue === 'object' && defaultValue !== null ? defaultValue : params;
    return translateKey(activeLang, key, defVal, p, overrides);
  };
}

/**
 * Compatibility helper to prevent layout compilation errors.
 */
export async function getTolgee(lang?: Language) {
  const activeLang = lang || (await getLanguage());
  const overrides = await getCachedOverrides();
  const mergedTranslations: Record<string, unknown> = {
    ...(catalogs[activeLang] || catalogs[DEFAULT_LANGUAGE]),
  };
  const langOverrides: Record<string, unknown> =
    (overrides[activeLang] as Record<string, unknown>) || {};
  if (Object.keys(langOverrides).length > 0) {
    deepMerge(mergedTranslations, langOverrides);
  }
  return {
    loadRequired: async () => mergedTranslations,
  };
}

/**
 * 🌍 Active la locale sur l'instance i18n globale (requis pour les macros
 * `t\`...\`` appelées dans les Server Components pendant le rendu SSR).
 * À appeler dans chaque Root Layout (serveur) avant de rendre les enfants.
 */
export async function initI18n(lang?: Language) {
  const activeLang = lang || (await getLanguage());
  setActiveLanguage(activeLang, catalogs[activeLang] || catalogs[DEFAULT_LANGUAGE]);
  return activeLang;
}
