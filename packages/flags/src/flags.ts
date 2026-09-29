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
  // 🔐 Autorisation — bascule le garde d'autorisation (internal/authz) du mode
  // observation (défaut) au mode refus. À activer une fois la MFA forte
  // disponible et les propriétaires de médias existants accompagnés : en
  // observation, les refus sont seulement journalisés.
  'authz-enforce': false,
  // 🛑 Workers — ARRÊT D'URGENCE global des envois d'e-mails. Sémantique
  // INVERSÉE : true = TOUT STOPPER (newsletters, confirmations, bienvenues,
  // reconfirmations, envois encadrés), false (défaut) = envois autorisés.
  // Les codes d'authentification ne passent par aucun worker et ne sont
  // jamais concernés.
  'workers-email-kill': false,
  // 🛑 Inscriptions — ARRÊT D'URGENCE des nouvelles inscriptions (3 voies).
  // Sémantique inversée : true = 503 explicite avant toute écriture, les
  // confirmations en cours aboutissent. Miroir de AbuseSignupKill (Go).
  'abuse.signup-kill': false,
} as const satisfies Record<string, boolean>;

export type FlagKey = keyof typeof FLAGS;

/**
 * Retourne la valeur par défaut d'un flag (le fallback si éteint/indispo).
 */
export function defaultFor<K extends FlagKey>(key: K): (typeof FLAGS)[K] {
  return FLAGS[key];
}
