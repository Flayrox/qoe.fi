// =====================================================================
// 🚩 @qoe/flags — Registre typé des feature flags
// =====================================================================
// 📖 Source unique des feature flags du monorepo. Chaque clé déclare sa
//    VALEUR PAR DÉFAUT : c'est le fallback utilisé quand le flag est
//    éteint, non configuré dans la table `feature_flags`, ou quand la DB
//    est injoignable (dégradation gracieuse — jamais de crash).
//
// 🎯 Pour ajouter un flag :
//    1. Ajoute une entrée ici (clé kebab-case + défaut)
//    2. Crée le flag côté admin (même clé, même défaut) et son miroir Go
//       dans `apps/api/internal/flags/flags.go`
//    3. Utilise-le côté client :  useFlag('ma-feature')
//       ou côté serveur :         isFlagOn('ma-feature', attrs)
// =====================================================================

const FLAG_DEFINITIONS = {
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
  // 🛑 Support public — ARRÊT D'URGENCE du formulaire vitrine.
  // Sémantique inversée : true = 503 explicite avant toute écriture,
  // dossiers existants et console intouchés. Miroir de SupportPublicKill (Go).
  'support.public-kill': false,
  // 💳 Monétisation — activation du checkout direct par carte bancaire.
  // false (défaut en intérim Stripe) = mode waitlist / contact support.
  'subscription-checkout-enabled': false,
  // 📢 Lecteur — affichage du bandeau dynamique de découverte Qoefi Plus.
  'reader-plus-banner': true,
  // 🤖 Lecteur — assistant IA de lecture (synthèse d'articles et explications).
  'reader-ai-summary': true,
  // 🎧 Lecteur — lecture audio haute fidélité par synthèse vocale (TTS).
  'reader-tts-playback': true,
  // 📦 Lecteur — téléchargement des packs hors-ligne d'articles et de livres.
  'reader-offline-pack': true,
  // 📚 Lecteur — import de livres EPUB personnels dans la bibliothèque.
  'reader-ebooks-upload': true,
  // 🎭 Studio — Atelier visuel de design souverain (Stage).
  // false (défaut) = masqué en production, actif en local dev (NODE_ENV === 'development').
  'studio-stage-editor': false,
} as const satisfies Record<string, boolean>;

export type FlagKey = keyof typeof FLAG_DEFINITIONS;

/**
 * Registre gelé : une écriture accidentelle ne peut pas modifier les défauts
 * pour tout le processus (l'objet est partagé par tous les rendus/workers).
 */
export const FLAGS: Readonly<Record<FlagKey, boolean>> = Object.freeze({
  ...FLAG_DEFINITIONS,
});

/**
 * 🛑 Flags de protection : jamais court-circuités par le bypass admin.
 *
 * Le bypass (`attributes.role === 'admin'` → `true`) n'a de sens que pour une
 * fonctionnalité en déploiement. Appliqué à un coupe-feu, il produisait
 * l'inverse de l'effet voulu : un admin évaluant `workers-email-kill` obtenait
 * `true` = tous les e-mails arrêtés, et `workers-newsletter-dispatch`
 * contournait un envoi volontairement coupé.
 */
export const PROTECTIVE_FLAGS = [
  'workers-email-kill',
  'abuse.signup-kill',
  'support.public-kill',
  'workers-newsletter-dispatch',
  'authz-enforce',
] as const satisfies readonly FlagKey[];

const PROTECTIVE_FLAG_SET: ReadonlySet<string> = new Set(PROTECTIVE_FLAGS);

/**
 * Vrai si la clé appartient au registre fermé. Utilise `hasOwnProperty` :
 * `'constructor' in FLAGS` (ou `'toString'`) vaut `true` et laissait une clé
 * héritée du prototype entrer dans la carte des flags.
 */
export function hasFlag(key: unknown): key is FlagKey {
  return typeof key === 'string' && Object.prototype.hasOwnProperty.call(FLAGS, key);
}

/**
 * Vrai si le flag ne doit jamais être activé par le bypass admin.
 */
export function isProtectiveFlag(key: string): boolean {
  return PROTECTIVE_FLAG_SET.has(key);
}

/**
 * Retourne la valeur par défaut d'un flag (le fallback si éteint/indispo).
 *
 * Clé inconnue → `false` (fail-closed). L'ancien contrat renvoyait
 * `undefined`, qui se propageait ensuite comme un faux « je ne sais pas ».
 */
export function defaultFor(key: FlagKey): boolean {
  return hasFlag(key) ? FLAGS[key] : false;
}
