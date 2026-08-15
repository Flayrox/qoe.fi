import { CATALOGS } from '@qoe/i18n/catalogs';
import { createTranslator, getI18n, setActiveLanguage } from '@qoe/i18n/core';
import { getLocales } from 'expo-localization';

/**
 * Active la locale de l'appareil sur l'instance Lingui partagée
 * (même singleton que les apps web) et retourne cette instance.
 */
export function initI18n() {
  const i18n = getI18n();
  const languageCode = getLocales()[0]?.languageCode;
  const locale = languageCode === 'en' ? 'en' : 'fr';
  if (!i18n.locale || i18n.locale !== locale) {
    setActiveLanguage(locale, CATALOGS[locale] ?? CATALOGS.fr);
  }
  return i18n;
}

/**
 * Traducteur lié à l'instance partagée, utilisable hors composants :
 * `t('login.title_login', 'Connexion')` — même contrat que les apps web.
 */
export const t = createTranslator(getI18n());
