// =====================================================================
// 🌐 provider.tsx — Client Context and Hooks (Lingui-powered)
// =====================================================================

'use client';

import React, { createContext, useContext } from 'react';
import { I18nProvider } from '@lingui/react';
import { type Language } from './locales';
import frCatalog from '../../../messages/fr.js';
import enCatalog from '../../../messages/en.js';
import frLegacy from '../../../messages/fr.json';
import enLegacy from '../../../messages/en.json';
import { getI18n, translate, flattenMessages, type I18nParams } from './core';

// Compiled catalogs (macro-based, hashed IDs) merged with the legacy
// key-based JSON so both migrated (macros) and not-yet-migrated call sites
// resolve during the transition.
const catalogs: Record<string, Record<string, string>> = {
  fr: { ...flattenMessages(frLegacy as Record<string, unknown>), ...frCatalog.messages },
  en: { ...flattenMessages(enLegacy as Record<string, unknown>), ...enCatalog.messages },
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
 * Loads the compiled Lingui catalogs (fr.js / en.js) merged with the legacy
 * key-based JSON, and exposes a legacy `t(key, default, params)` fallback
 * for not-yet-migrated call sites.
 */
export function TolgeeNextProvider({
  language,
  children,
}: {
  language: Language;
  staticData?: unknown;
  children: React.ReactNode;
}) {
  // Load compiled catalogs into the shared Lingui instance.
  const i18n = getI18n();
  React.useMemo(() => {
    i18n.load({ fr: catalogs.fr, en: catalogs.en });
    i18n.activate(language);
  }, [i18n, language]);

  const t = (key: string, defaultValue?: string | I18nParams, params?: I18nParams): string =>
    translate(i18n, key, defaultValue, params);

  return (
    <I18nContext.Provider value={{ language, t }}>
      <I18nProvider i18n={i18n}>{children}</I18nProvider>
    </I18nContext.Provider>
  );
}
