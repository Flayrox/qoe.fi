// =====================================================================
// 🌍 Langues supportées
// =====================================================================
// 📖 Source unique de vérité pour les locales.
//    L'app actuelle a 2 dossiers (messages/ + src/locales/) → on unifie.
// =====================================================================

import { LANGUAGES, type Language } from '@qoe/config';

export { LANGUAGES, type Language };

export const ALL_LANGUAGES: Language[] = Object.values(LANGUAGES);
export const DEFAULT_LANGUAGE: Language = LANGUAGES.FR;
