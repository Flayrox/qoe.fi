// =====================================================================
// 🧊 core.ts — Lingui-powered i18n core (ICU, plurals, interpolation)
// =====================================================================
// `t(clé, texteParDéfaut, params)` est conservé pour compatibilité :
// - la clé = l'ID Lingui
// - le texte par défaut (FR) = message source
// - les params = valeurs ICU ({name}, {count}, pluriels, ...)
// Si la clé existe dans le catalogue chargé, Lingui la traduit.
// Sinon, le message par défaut est compilé par Lingui (ICU complet).

import { i18n as linguiI18n, type I18n, type MessageDescriptor } from '@lingui/core';
import frMessages from '../../../messages/fr.js';

export type I18nValue = string | number;
export type I18nParams = Record<string, I18nValue>;
export type MessageMap = Record<string, string>;

export const DEFAULT_I18N_LOCALE = 'fr';

// ⚠️ CRITICAL: the compiled Lingui macros (t`...`) call the singleton `i18n`
// exported by @lingui/core. We must load/activate THAT instance immediately at
// module load so server-side macros always resolve during prerender/SSR,
// before any layout calls initI18n().
if (linguiI18n.locale === undefined || linguiI18n.locale === '') {
  linguiI18n.load({ fr: frMessages.messages });
  linguiI18n.activate(DEFAULT_I18N_LOCALE);
}

let _i18n: I18n | null = null;

// Returns the shared @lingui/core singleton.
export function getI18n(): I18n {
  if (!_i18n) {
    _i18n = linguiI18n;
    if (_i18n.locale !== DEFAULT_I18N_LOCALE) {
      _i18n.load({ fr: frMessages.messages });
      _i18n.activate(DEFAULT_I18N_LOCALE);
    }
  }
  return _i18n;
}

/**
 * Instance i18n partagée (initialisée par le provider ou les helpers serveur).
 */
export function setActiveLanguage(lang: string, messages: MessageMap) {
  const i18n = getI18n();
  i18n.load({ [lang]: messages });
  i18n.activate(lang);
}

/**
 * Aplatit un arbre de messages imbriqués ({common: {save: "..."}}) en un
 * flat map Lingui ({"common.save": "..."}).
 */
export function flattenMessages(messages: Record<string, unknown>, prefix = ''): MessageMap {
  const flat: MessageMap = {};
  for (const [key, value] of Object.entries(messages)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(flat, flattenMessages(value as Record<string, unknown>, path));
    } else if (typeof value === 'string') {
      flat[path] = value;
    }
  }
  return flat;
}

/**
 * Traduction par clé avec fallback sur le message par défaut (FR).
 * - `t('common.save')` → rend le catalogue si dispo, sinon "common.save"
 * - `t('common.save', 'Enregistrer')` → rend le catalogue, sinon "Enregistrer"
 * - `t('common.save', 'Bonjour {name}', { name })` → interpolation ICU
 */
export function translate(
  i18n: I18n,
  key: string,
  defaultValue?: string | I18nParams,
  params?: I18nParams
): string {
  const defVal = typeof defaultValue === 'string' ? defaultValue : undefined;
  const values = typeof defaultValue === 'object' && defaultValue !== null ? defaultValue : params;

  const id = key || defVal || '';
  const message = defVal || id;

  const descriptor: MessageDescriptor = { id, message };
  if (values) {
    descriptor.values = values as Record<string, unknown>;
  }

  try {
    return i18n._(descriptor);
  } catch {
    return defVal || key;
  }
}

/**
 * Helper `t` lié à une instance i18n.
 */
export function createTranslator(i18n: I18n) {
  return (key: string, defaultValue?: string | I18nParams, params?: I18nParams): string =>
    translate(i18n, key, defaultValue, params);
}
