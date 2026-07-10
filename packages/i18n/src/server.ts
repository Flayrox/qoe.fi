// =====================================================================
// 🖥️ server.ts — Server Translation Helpers with DB Overrides
// =====================================================================

import { ALL_LANGUAGES, DEFAULT_LANGUAGE, type Language } from "./locales";
import frTranslations from "../../../messages/fr.json";
import enTranslations from "../../../messages/en.json";
import { prisma } from "@qoe/db/client";
import { unstable_cache } from "next/cache";
import { compilePlural, interpolate } from "./compiler";

const translations: Record<string, any> = {
  fr: frTranslations,
  en: enTranslations,
};

// Next.js cache for translation overrides (cleared when Tag "i18n-overrides" is revalidated)
export const getCachedOverrides = unstable_cache(
  async () => {
    try {
      const config = await prisma.systemConfig.findUnique({
        where: { key: "TRANSLATIONS_OVERRIDE" }
      });
      if (config?.value) {
        return JSON.parse(config.value);
      }
    } catch (e) {
      console.error("Failed to load i18n overrides from DB:", e);
    }
    return {};
  },
  ["i18n-overrides"],
  { tags: ["i18n-overrides"] }
);

export function translateKey(
  lang: string,
  key: string,
  defaultValue?: string,
  params?: Record<string, any>,
  overrides: Record<string, any> = {}
): string {
  // Check db overrides first
  const langOverrides = overrides[lang] || {};
  const overrideParts = key.split(".");
  let overrideVal: any = langOverrides;
  for (const part of overrideParts) {
    if (overrideVal === undefined || overrideVal === null) break;
    overrideVal = overrideVal[part];
  }

  let val = typeof overrideVal === "string" ? overrideVal : undefined;

  if (val === undefined) {
    // Fallback to static messages
    const messages = translations[lang] || translations[DEFAULT_LANGUAGE];
    const parts = key.split(".");
    let staticVal: any = messages;
    for (const part of parts) {
      if (staticVal === undefined || staticVal === null) break;
      staticVal = staticVal[part];
    }
    if (typeof staticVal !== "string") {
      if (process.env.NODE_ENV === "development") {
        console.warn(`[i18n Server Warning] Missing translation key: "${key}" for language "${lang}"`);
      }
    }
    val = typeof staticVal === "string" ? staticVal : (defaultValue || key);
  }

  if (params) {
    val = compilePlural(val, lang, params);
    val = interpolate(val, params);
  }
  return val;
}

/**
 * 🌐 Détecte la langue depuis les cookies/headers Next.js.
 * Priority: cookie "x-locale" > header "x-locale" > default "fr"
 */
export async function getLanguage(): Promise<Language> {
  const { cookies, headers } = await import("next/headers");

  // 1. Try reading the cookie directly (most reliable)
  try {
    const cookieStore = await cookies();
    const cookieLang = cookieStore.get("x-locale")?.value;
    if (cookieLang && (ALL_LANGUAGES as string[]).includes(cookieLang)) {
      return cookieLang as Language;
    }
  } catch {}

  // 2. Fallback: read the header (set by middleware)
  try {
    const headerList = await headers();
    const headerLang = headerList.get("x-locale");
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
  return (key: string, defaultValue?: any, params?: any) => {
    const defVal = typeof defaultValue === "string" ? defaultValue : undefined;
    const p = typeof defaultValue === "object" ? defaultValue : params;
    return translateKey(activeLang, key, defVal, p, overrides);
  };
}

/**
 * Compatibility helper to prevent layout compilation errors
 */
export async function getTolgee(lang?: Language) {
  const activeLang = lang || await getLanguage();
  const overrides = await getCachedOverrides();
  const mergedTranslations = {
    ...(translations[activeLang] || translations[DEFAULT_LANGUAGE]),
    ...(overrides[activeLang] || {})
  };
  return {
    loadRequired: async () => mergedTranslations,
  };
}
