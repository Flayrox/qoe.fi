// =====================================================================
// 🖥️ Tolgee Server — Helpers côté serveur
// =====================================================================
// 📖 Crée une instance Tolgee pour les Server Components.
//    Charge les traductions statiques (SSR) pour éviter le flash de FR.
// =====================================================================

import { Tolgee } from "@tolgee/web";
import { ALL_LANGUAGES, DEFAULT_LANGUAGE, type Language } from "./locales";

/**
 * 🖥️ Crée une instance Tolgee pour le serveur.
 */
export async function getTolgee() {
  const tolgee = Tolgee().init({
    language: DEFAULT_LANGUAGE,
    fallbackLanguage: DEFAULT_LANGUAGE,
    staticData: {
      // TODO: charger dynamiquement depuis packages/i18n/locales/*.json
    },
  });
  return tolgee;
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
  const language = await getLanguage();
  const tolgee = await getTolgee();
  const t = tolgee.t;

  return {
    language,
    t,
  };
}
