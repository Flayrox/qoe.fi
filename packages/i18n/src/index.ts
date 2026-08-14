// =====================================================================
// 📦 @qoe/i18n — Unified Exports
// =====================================================================

export * from './locales';
export { I18nClientProvider, useTranslate, useI18n } from './provider';
export { getStaticTranslations, getTranslate, getLanguage, initI18n } from './server';
export type { I18nParams, I18nValue } from './core';
