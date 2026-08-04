// =====================================================================
// 🌐 provider.tsx — Zero-dependency Client Context and Hooks
// =====================================================================

"use client";

import React, { createContext, useContext } from "react";
import { type Language } from "./locales";
import frTranslations from "../../../messages/fr.json";
import enTranslations from "../../../messages/en.json";
import { compilePlural, interpolate } from "./compiler";

const translations: Record<string, any> = {
  fr: frTranslations,
  en: enTranslations,
};

const I18nContext = createContext<{
  language: Language;
  t: (key: string, defaultValue?: any, params?: any) => string;
} | null>(null);

export function useTranslate() {
  const context = useContext(I18nContext);
  if (!context) {
    return {
      t: (key: string, defaultValue?: any, params?: any) => {
        const defVal = typeof defaultValue === "string" ? defaultValue : undefined;
        return defVal || key;
      }
    };
  }
  return { t: context.t };
}

export function useTolgee() {
  const context = useContext(I18nContext);
  const currentLang = context?.language || "fr";
  return {
    getLanguage: () => currentLang,
    changeLanguage: async (lang: string) => {
      if (typeof window !== "undefined") {
        const hostname = window.location.hostname;
        let domainAttr = "";
        if (hostname.endsWith("qoe.test")) {
          domainAttr = ";domain=.qoe.test";
        } else if (hostname.endsWith("lvh.me")) {
          domainAttr = ";domain=.lvh.me";
        } else if (hostname.endsWith("qoe.fi")) {
          domainAttr = ";domain=.qoe.fi";
        }
        // No domain attribute for localhost (browser default = host-only)
        document.cookie = `x-locale=${lang};path=/;max-age=31536000${domainAttr}`;
      }
    }
  };
}

/**
 * 🔌 Provider wrapping the application to supply client-side translations.
 */
export function TolgeeNextProvider({
  language,
  staticData,
  children,
}: {
  language: Language;
  staticData?: any;
  children: React.ReactNode;
}) {
  const messages = staticData || translations[language] || translations.fr;

  const t = (key: string, defaultValue?: any, params?: any): string => {
    const defVal = typeof defaultValue === "string" ? defaultValue : undefined;
    const p = typeof defaultValue === "object" ? defaultValue : params;

    const parts = key.split(".");
    let val: any = messages;
    for (const part of parts) {
      if (val === undefined || val === null) break;
      val = val[part];
    }
    if (typeof val !== "string") {
      if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
        console.warn(`[i18n Client Warning] Missing translation key: "${key}" for language "${language}"`);
      }
      val = defVal || key;
    }
    if (p) {
      val = compilePlural(val, language, p);
      val = interpolate(val, p);
    }
    return val;
  };

  return (
    <I18nContext.Provider value={{ language, t }}>
      {children}
    </I18nContext.Provider>
  );
}
