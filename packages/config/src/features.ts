// =====================================================================
// 🚩 FEATURE FLAGS — Active/désactive des features à distance
// =====================================================================
// 📖 Permet d'activer/désactiver des features sans redéployer.
//    Les flags peuvent être overridés par env var (FEATURE_xxx).
// =====================================================================

/**
 * 💎 Features disponibles.
 * Par défaut : activées en dev, désactivées en prod (sauf override).
 */
export const FEATURE_FLAGS = {
  /** Paiements Stripe activés */
  BILLING_ENABLED: process.env.FEATURE_BILLING !== "false",

  /** Editeur TipTap activé (sinon fallback textarea) */
  RICH_EDITOR_ENABLED: process.env.FEATURE_RICH_EDITOR !== "false",

  /** Surlignage sur articles activé */
  HIGHLIGHTS_ENABLED: process.env.FEATURE_HIGHLIGHTS !== "false",

  /** Pensées (Thoughts) activées (sinon feed = articles uniquement) */
  THOUGHTS_ENABLED: process.env.FEATURE_THOUGHTS !== "false" && process.env.FEATURE_MICROPOSTS !== "false",

  /** Recherche sémantique (pgvector) activée */
  SEMANTIC_SEARCH_ENABLED: process.env.FEATURE_SEMANTIC_SEARCH === "true",

  /** Système de lettres (DMs publics) activé */
  LETTERS_ENABLED: process.env.FEATURE_LETTERS === "true",

  /** Newsletters email activées */
  NEWSLETTERS_ENABLED: process.env.FEATURE_NEWSLETTERS !== "false",

  /** Multi-tenants custom domains activé */
  CUSTOM_DOMAINS_ENABLED: process.env.FEATURE_CUSTOM_DOMAINS !== "false",

  /** Recos IA activées */
  AI_RECOMMENDATIONS_ENABLED: process.env.FEATURE_AI_RECOS === "true",

  /** Realtime (Supabase) activé */
  REALTIME_ENABLED: process.env.FEATURE_REALTIME !== "false",
} as const;

export type FeatureFlag = keyof typeof FEATURE_FLAGS;

/**
 * 🎯 Helper : vérifie si une feature est activée.
 *
 * @example
 *   if (isFeatureEnabled('BILLING_ENABLED')) { ... }
 */
export function isFeatureEnabled(feature: FeatureFlag): boolean {
  return FEATURE_FLAGS[feature] === true;
}
