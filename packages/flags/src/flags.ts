// =====================================================================
// 🚩 @qoe/flags — Registre typé des feature flags
// =====================================================================
// 📖 Source unique des feature flags du monorepo. Chaque clé déclare sa
//    VALEUR PAR DÉFAUT : c'est le fallback utilisé quand le flag est
//    éteint, non configuré dans GrowthBook, ou quand GrowthBook est
//    injoignable (dégradation gracieuse — jamais de crash).
//
// 🎯 Pour ajouter un flag :
//    1. Ajoute une entrée ici (clé kebab-case + défaut)
//    2. Crée le flag dans l'UI GrowthBook (Features → New Feature)
//       avec la même clé et la même valeur par défaut
//    3. Utilise-le côté client :  useFlag('ma-feature')
//       ou côté serveur :         isFlagOn('ma-feature', attrs)
// =====================================================================

export const FLAGS = {
  // 📰 Feed — carousel "Recommandations" de la home (démo feature flag)
  'feed-recommendations': true,
  // 🌐 Web — bandeau newsletter en bas du site public
  'web-newsletter-banner': false,
  // 🎨 Dashboard — suggestions de titres par IA dans l'éditeur
  'dashboard-ai-title-suggestions': false,
  // 🏝️ Landing — nouvelle section pricing
  'landing-pricing-section': false,
  // 🛡️ Admin — journal d'audit des actions admin
  'admin-audit-log': false,
  // ⚙️ Workers — coupe-feu sur l'envoi des newsletters (kill switch)
  'workers-newsletter-dispatch': true,
} as const satisfies Record<string, boolean>;

export type FlagKey = keyof typeof FLAGS;

/**
 * Retourne la valeur par défaut d'un flag (le fallback si éteint/indispo).
 */
export function defaultFor<K extends FlagKey>(key: K): (typeof FLAGS)[K] {
  return FLAGS[key];
}
