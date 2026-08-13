// =====================================================================
// 🌐 provider.tsx — Client Context and Hooks (Lingui-powered)
// =====================================================================

'use client';

import React, { createContext, useContext } from 'react';
import { I18nProvider } from '@lingui/react';
import { type Language } from './locales';
import frTranslations from '../../../messages/fr.json';
import enTranslations from '../../../messages/en.json';
import { getI18n, translate, flattenMessages, type I18nParams, type MessageMap } from './core';

const translations: Record<string, unknown> = {
  fr: frTranslations,
  en: enTranslations,
};

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
 * The API surface is kept identical to the legacy Tolgee-compatible provider.
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
  const messages: MessageMap = flattenMessages(
    (staticData as Record<string, unknown>) ||
      (translations[language] as Record<string, unknown>) ||
      (translations.fr as Record<string, unknown>)
  );

  // Create the Lingui instance and load the active locale.
  const i18n = getI18n();
  React.useMemo(() => {
    i18n.load({ [language]: messages });
    i18n.activate(language);
  }, [i18n, language, staticData]);

  const t = (key: string, defaultValue?: string | I18nParams, params?: I18nParams): string =>
    translate(i18n, key, defaultValue, params);

  return (
    <I18nContext.Provider value={{ language, t }}>
      <I18nProvider i18n={i18n}>{children}</I18nProvider>
    </I18nContext.Provider>
  );
}
