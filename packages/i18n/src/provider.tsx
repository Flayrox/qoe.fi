// =====================================================================
// 🌐 provider.tsx — Zero-dependency Client Context and Hooks
// =====================================================================

'use client';

import React, { createContext, useContext } from 'react';
import { type Language } from './locales';
import frTranslations from '../../../messages/fr.json';
import enTranslations from '../../../messages/en.json';
import { compilePlural, interpolate } from './compiler';

const translations: Record<string, unknown> = {
  fr: frTranslations,
  en: enTranslations,
};

type I18nValue = string | number;
type I18nParams = Record<string, I18nValue>;

const I18nContext = createContext<{
  language: Language;
  t: (key: string, defaultValue?: string | I18nParams, params?: I18nParams) => string;
} | null>(null);

export function useTranslate() {
  const context = useContext(I18nContext);
  if (!context) {
    return {
      t: (key: string, defaultValue?: string | I18nParams) => {
        const defVal = typeof defaultValue === 'string' ? defaultValue : undefined;
        return defVal || key;
      },
    };
  }
  return { t: context.t };
}

export function useTolgee() {
  const context = useContext(I18nContext);
  const currentLang = context?.language || 'fr';
  return {
    getLanguage: () => currentLang,
    changeLanguage: async (lang: string) => {
      if (typeof window !== 'undefined') {
        const hostname = window.location.hostname;
        let domainAttr = '';
        if (hostname.endsWith('qoe.test')) {
          domainAttr = ';domain=.qoe.test';
        } else if (hostname.endsWith('lvh.me')) {
          domainAttr = ';domain=.lvh.me';
        } else if (hostname.endsWith('qoe.fi')) {
          domainAttr = ';domain=.qoe.fi';
        }
        // No domain attribute for localhost (browser default = host-only)
        document.cookie = `x-locale=${lang};path=/;max-age=31536000${domainAttr}`;
      }
    },
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
  staticData?: unknown;
  children: React.ReactNode;
}) {
  const messages: unknown = staticData || translations[language] || translations.fr;

  const t = (key: string, defaultValue?: string | I18nParams, params?: I18nParams): string => {
    const defVal = typeof defaultValue === 'string' ? defaultValue : undefined;
    const p = typeof defaultValue === 'object' && defaultValue !== null ? defaultValue : params;

    const parts = key.split('.');
    let val: unknown = messages;
    for (const part of parts) {
      if (val === undefined || val === null) break;
      if (typeof val !== 'object') {
        val = undefined;
        break;
      }
      val = (val as Record<string, unknown>)[part];
    }
    let result: string;
    if (typeof val !== 'string') {
      if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
        console.warn(
          `[i18n Client Warning] Missing translation key: "${key}" for language "${language}"`
        );
      }
      result = defVal || key;
    } else {
      result = val;
    }
    if (p) {
      result = compilePlural(result, language, p);
      result = interpolate(result, p);
    }
    return result;
  };

  return <I18nContext.Provider value={{ language, t }}>{children}</I18nContext.Provider>;
}
