// =====================================================================
// 🌍 catalogs.ts — Chargement des catalogues (RN-safe)
// =====================================================================
// ⚠️ Contrairement à provider.tsx (web, 'use client', window/document),
//    ce module n'a AUCUNE dépendance serveur/navigateur : il est donc
//    importable depuis React Native / Expo (apps/mobile).
// Fusionne les catalogues compilés (IDs hashés des macros) avec les
// catalogues legacy (clés explicites) pour que `t('cle', 'défaut')`
// fonctionne partout.
// =====================================================================

import frCompiled from '../../../messages/fr.js';
import enCompiled from '../../../messages/en.js';
import frLegacy from '../../../messages/fr.json';
import enLegacy from '../../../messages/en.json';
import { flattenMessages } from './core';

export const CATALOGS: Record<string, Record<string, string>> = {
  fr: { ...flattenMessages(frLegacy as Record<string, unknown>), ...frCompiled.messages },
  en: { ...flattenMessages(enLegacy as Record<string, unknown>), ...enCompiled.messages },
};

export const CATALOG_LOCALES = Object.keys(CATALOGS);
