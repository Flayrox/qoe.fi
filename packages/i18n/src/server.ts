// =====================================================================
// 🖥️ Tolgee Server — Helpers côté serveur
// =====================================================================
// 📖 Crée une instance Tolgee pour les Server Components.
//    Charge les traductions statiques (SSR) pour éviter le flash de FR.
// =====================================================================

import { Tolgee } from "@tolgee/web";
import { ALL_LANGUAGES, DEFAULT_LANGUAGE, type Language } from "./locales";
import frTranslations from "../../../messages/fr.json";
import enTranslations from "../../../messages/en.json";

/**
 * 🖥️ Crée une instance Tolgee pour le serveur.
 */
export async function getTolgee(lang?: Language) {
  const activeLang = lang || await getLanguage();
  const tolgee = Tolgee().init({
    language: activeLang,
    fallbackLanguage: DEFAULT_LANGUAGE,
    staticData: {
      fr: frTranslations,
      en: enTranslations,
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
  const activeLang = await getLanguage();
  const tolgee = await getTolgee(activeLang);
  return tolgee.t.bind(tolgee);
}

/**
 * 📝 Variante qui retourne aussi la langue détectée.
 */
export async function getTranslateWithLanguage() {
  const language = await getLanguage();
  const tolgee = await getTolgee(language);
  return { language, t: tolgee.t.bind(tolgee) };
}
