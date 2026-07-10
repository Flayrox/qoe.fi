// =====================================================================
// 🖥️ server.ts — Zero-dependency Server Translation Helpers
// =====================================================================

import { ALL_LANGUAGES, DEFAULT_LANGUAGE, type Language } from "./locales";
import frTranslations from "../../../messages/fr.json";
import enTranslations from "../../../messages/en.json";

const translations: Record<string, any> = {
  fr: frTranslations,
  en: enTranslations,
};

export function translateKey(lang: string, key: string, defaultValue?: string, params?: Record<string, any>): string {
  const messages = translations[lang] || translations[DEFAULT_LANGUAGE];
  const parts = key.split(".");
  let val: any = messages;
  for (const part of parts) {
    if (val === undefined || val === null) break;
    val = val[part];
  }
  if (typeof val !== "string") {
    val = defaultValue || key;
  }
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      val = val.replace(new RegExp(`{${k}}`, "g"), String(v));
    });
  }
  return val;
}

/**
 * 🌐 Détecte la langue depuis les headers Next.js.
 */
export async function getLanguage(): Promise<Language> {
  const { headers } = await import("next/headers");
  const headerList = await headers();
  const cookieLang = headerList.get("x-locale");
  if (cookieLang && (ALL_LANGUAGES as string[]).includes(cookieLang)) {
    return cookieLang as Language;
  }
  return DEFAULT_LANGUAGE;
}

/**
 * 📝 Helper de traduction côté serveur.
 */
export async function getTranslate() {
  const activeLang = await getLanguage();
  return (key: string, defaultValue?: any, params?: any) => {
    const defVal = typeof defaultValue === "string" ? defaultValue : undefined;
    const p = typeof defaultValue === "object" ? defaultValue : params;
    return translateKey(activeLang, key, defVal, p);
  };
}

/**
 * Compatibility helper to prevent layout compilation errors
 */
export async function getTolgee(lang?: Language) {
  const activeLang = lang || await getLanguage();
  return {
    loadRequired: async () => translations[activeLang] || translations[DEFAULT_LANGUAGE],
  };
}
