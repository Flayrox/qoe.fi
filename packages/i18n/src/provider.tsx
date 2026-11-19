// =====================================================================
// 🌐 provider.tsx — Client Context and Hooks (Lingui-powered)
// =====================================================================

'use client';

import React, { createContext, useContext } from 'react';
import { I18nProvider } from '@lingui/react';
import { DEFAULT_LANGUAGE, type Language } from './locales';
import { CATALOGS } from './catalogs';
import { buildLocaleCookie } from './cookie';
import { getI18n, translate, fallbackTranslate, type I18nParams } from './core';

const I18nContext = createContext<{
  language: Language;
  t: (key: string, defaultValue?: string | I18nParams, params?: I18nParams) => string;
} | null>(null);

export function useTranslate() {
  const context = useContext(I18nContext);
  if (!context) {
    return { t: fallbackTranslate };
  }
  return { t: context.t };
}

export function useI18n() {
  const context = useContext(I18nContext);
  const currentLang = context?.language || DEFAULT_LANGUAGE;
  return {
    getLanguage: () => currentLang,
    changeLanguage: async (lang: string) => {
      if (typeof window === 'undefined') {
        return;
      }
      // La valeur vient d'un appelant arbitraire : validée + encodée, sinon
      // `"fr; x-locale=en"` injectait un second cookie.
      const cookie = buildLocaleCookie(
        lang,
        window.location.hostname,
        window.location.protocol === 'https:'
      );
      if (!cookie) {
        return;
      }
      document.cookie = cookie;
    },
  };
}

/**
 * 🔌 Provider wrapping the application to supply client-side translations.
 * Loads the compiled Lingui catalogs (fr.js / en.js) merged with the legacy
 * key-based JSON (`CATALOGS`), and exposes a legacy `t(key, default, params)`
 * fallback for not-yet-migrated call sites.
 */
export function I18nClientProvider({
  language,
  children,
}: {
  language: Language;
  staticData?: unknown;
  children: React.ReactNode;
}) {
  // Load compiled catalogs into the shared Lingui instance.
  const i18n = getI18n();

  // ⚠️ Activation AFTER first render (useEffect), not during render:
  // i18n.activate() synchronizes Lingui subscribers (I18nProvider), which
  // would trigger a setState during I18nClientProvider's render otherwise
  // ("Cannot update a component while rendering a different component").
  // The default locale (fr) is already loaded/activated at module load in
  // core.ts, so the first paint is correct and there is no flash.
  React.useEffect(() => {
    i18n.load({ fr: CATALOGS.fr, en: CATALOGS.en });
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
