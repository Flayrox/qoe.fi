export const ALL_LANGUAGES = ['fr', 'en'] as const;
export const DEFAULT_LANGUAGE = 'fr';
export type AppLocale = (typeof ALL_LANGUAGES)[number];
