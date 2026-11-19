// =====================================================================
// 🖥️ server.ts — Server Translation Helpers with DB Overrides
// =====================================================================
// ⚠️ Aucun helper de ce module n'active la locale sur le singleton Lingui.
// `@lingui/core` expose UNE instance globale : l'activer depuis une requête
// (translateKey/initI18n) fuyait la locale d'une requête à l'autre pendant
// le SSR concurrent. On travaille donc sur une instance par locale, mise en
// cache, et les overrides DB sont appliqués à la résolution — ils ne
// modifient jamais le catalogue partagé.
// =====================================================================

import { setupI18n, type I18n } from '@lingui/core';
import { unstable_cache } from 'next/cache';
import { CATALOGS } from './catalogs';
import { DEFAULT_LANGUAGE, type Language } from './locales';
import {
  flattenMessages,
  setActiveLanguage,
  translate,
  type I18nParams,
  type MessageMap,
} from './core';

/** Délai maximal accordé à l'API Go pour fournir les overrides. */
export const OVERRIDES_TIMEOUT_MS = 2_500;

/** Préfixe d'ID réservé : un override ne peut pas collisionner avec le catalogue. */
const OVERRIDE_ID_PREFIX = '\u0000qoe:override:';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Catalogue statique d'une locale, avec repli sur la locale par défaut. */
function catalogFor(lang: string): MessageMap {
  return CATALOGS[lang] ?? CATALOGS[DEFAULT_LANGUAGE];
}

const localeInstances = new Map<string, I18n>();

/**
 * Instance Lingui dédiée à une locale (créée une fois, réutilisée).
 * Isolée du singleton : aucune requête ne peut changer la locale d'une autre.
 */
function getLocaleInstance(lang: string): I18n {
  const existing = localeInstances.get(lang);
  if (existing) {
    return existing;
  }
  const instance = setupI18n({ locale: lang, messages: { [lang]: catalogFor(lang) } });
  localeInstances.set(lang, instance);
  return instance;
}

/**
 * Cherche un override pour `key`, au format plat (`"common.save"`) comme au
 * format imbriqué legacy (`{ common: { save } }`). Le plus spécifique gagne.
 */
export function findOverride(source: unknown, key: string): string | undefined {
  if (!isRecord(source)) {
    return undefined;
  }
  const flat = source[key];
  if (typeof flat === 'string') {
    return flat;
  }
  let node: unknown = source;
  for (const part of key.split('.')) {
    if (!isRecord(node)) {
      return undefined;
    }
    node = node[part];
  }
  return typeof node === 'string' ? node : undefined;
}

/**
 * Compile un message arbitraire (override) avec l'ICU de Lingui. L'ID est
 * préfixé pour être absent du catalogue : c'est le message fourni qui rend.
 */
function compileMessage(i18n: I18n, key: string, message: string, params?: I18nParams): string {
  try {
    return i18n._({
      id: `${OVERRIDE_ID_PREFIX}${key}`,
      message,
      ...(params ? { values: params as Record<string, unknown> } : {}),
    });
  } catch {
    return message;
  }
}

/**
 * Valide le payload `TRANSLATIONS_OVERRIDE` (JSON stocké en SystemConfig).
 * Tout ce qui n'est pas un objet JSON exploitable donne un objet vide.
 */
export function parseOverridesPayload(raw: string | undefined): Record<string, unknown> {
  if (!raw) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

// Next.js cache for translation overrides (cleared when Tag "i18n-overrides" is revalidated)
// Chargés depuis le serveur Go (GET /v1/home/config — public, sans session) :
// la clé SystemConfig "TRANSLATIONS_OVERRIDE" y est renvoyée telle quelle.
export const getCachedOverrides = unstable_cache(
  async (): Promise<Record<string, unknown>> => {
    // Pendant `next build` (prerender), l'API Go n'est pas joignable depuis le
    // contexte de build Docker (QOE_API_URL pointe vers le service `api` qui
    // n'existe pas à ce moment) : on skip le fetch — les overrides se
    // chargent normalement au runtime. Évite le bruit ENOTFOUND qui faisait
    // échouer les gates naïves du script de déploiement.
    if (process.env.NEXT_PHASE === 'phase-production-build') {
      return {};
    }
    const apiUrl = process.env.QOE_API_URL;
    if (!apiUrl) {
      return {};
    }
    try {
      // `AbortSignal.timeout` : une API qui ne répond pas ne doit pas retenir
      // le rendu SSR indéfiniment.
      const res = await fetch(`${apiUrl}/v1/home/config`, {
        signal: AbortSignal.timeout(OVERRIDES_TIMEOUT_MS),
      });
      if (!res.ok) {
        return {};
      }
      const config: unknown = await res.json();
      if (!isRecord(config)) {
        return {};
      }
      const raw = config['TRANSLATIONS_OVERRIDE'];
      return parseOverridesPayload(typeof raw === 'string' ? raw : undefined);
    } catch (e) {
      console.error('Failed to load i18n overrides from Go API:', e);
      return {};
    }
  },
  ['i18n-overrides'],
  { tags: ['i18n-overrides'] }
);

/**
 * Traduit une clé côté serveur.
 * Priorité : override DB de la locale > catalogue > message par défaut.
 */
export function translateKey(
  lang: string,
  key: string,
  defaultValue?: string,
  params?: I18nParams,
  overrides?: Record<string, unknown> | null
): string {
  const locale = CATALOGS[lang] ? lang : DEFAULT_LANGUAGE;
  const i18n = getLocaleInstance(locale);

  const localeOverrides = isRecord(overrides) ? overrides[locale] : undefined;
  const overridden = findOverride(localeOverrides, key);
  if (overridden !== undefined) {
    return compileMessage(i18n, key, overridden, params);
  }

  return translate(i18n, key, defaultValue, params);
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
    if (cookieLang && CATALOGS[cookieLang]) {
      return cookieLang as Language;
    }
  } catch {}

  // 2. Fallback: read the header (set by middleware)
  try {
    const headerList = await headers();
    const headerLang = headerList.get('x-locale');
    if (headerLang && CATALOGS[headerLang]) {
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
export async function getStaticTranslations(lang?: Language) {
  const activeLang = lang || (await getLanguage());
  const overrides = await getCachedOverrides();
  const messages: MessageMap = { ...catalogFor(activeLang) };
  const localeOverrides = isRecord(overrides) ? overrides[activeLang] : undefined;
  if (isRecord(localeOverrides)) {
    // Aplatissement : un override imbriqué legacy doit atterrir sur la clé
    // plate du catalogue, sinon il est ignoré (et injecte un objet au milieu
    // d'un map de chaînes).
    Object.assign(messages, flattenMessages(localeOverrides));
  }
  return {
    loadTranslations: async () => messages,
  };
}

/**
 * 🌍 Active la locale sur l'instance i18n globale (requis pour les macros
 * `t\`...\`` appelées dans les Server Components pendant le rendu SSR).
 * À appeler dans chaque Root Layout (serveur) avant de rendre les enfants.
 * ⚠️ `translateKey` n'emprunte PAS ce chemin : il ne touche jamais au singleton.
 */
export async function initI18n(lang?: Language) {
  const activeLang = lang || (await getLanguage());
  setActiveLanguage(activeLang, catalogFor(activeLang));
  return activeLang;
}
