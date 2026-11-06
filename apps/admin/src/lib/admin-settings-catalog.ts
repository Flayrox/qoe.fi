// =====================================================================
// 🎛️ admin-settings-catalog — l'index de tout ce qui se règle
// =====================================================================
// Une console d'exploitation ne se juge pas au nombre d'écrans, mais à la
// facilité de trouver LE levier qui change un comportement. Ce catalogue est
// la carte : chaque entrée dit où le levier vit, quelle capacité il exige,
// sa portée (global / tenant / utilisateur) et le niveau de preuve demandé.
//
// Il n'écrit rien : il pointe l'écran qui écrit, avec sa garde. Une entrée
// dont la capacité manque reste visible en lecture — on doit savoir qu'un
// levier existe même quand on n'a pas le droit de le toucher.
// =====================================================================

import type { AdminCapability } from './admin-console';

export const SETTINGS_CATEGORIES = [
  'acces',
  'moderation',
  'communication',
  'produit',
  'conformite',
  'plateforme',
] as const;

export type SettingsCategory = (typeof SETTINGS_CATEGORIES)[number];

export const SETTINGS_CATEGORY_LABELS: Record<SettingsCategory, string> = {
  acces: 'Accès & identité',
  moderation: 'Confiance & sécurité',
  communication: 'Communication',
  produit: 'Produit & contenu',
  conformite: 'Conformité',
  plateforme: 'Plateforme',
};

export type SettingsScope = 'global' | 'tenant' | 'utilisateur';

/** Niveau de preuve exigé par l'écran qui porte le levier. */
export type SettingsGuard = 'audit' | 'audit + N2' | 'audit + double validation';

export interface SettingsLever {
  id: string;
  label: string;
  category: SettingsCategory;
  scope: SettingsScope;
  capability: AdminCapability;
  guard: SettingsGuard;
  /** Ce que le levier change, en une phrase. */
  effect: string;
  /** Écran qui porte le réglage. */
  href: string;
}

export const SETTINGS_CATALOG: readonly SettingsLever[] = [
  // ── Accès & identité ────────────────────────────────────────────────
  {
    id: 'access.grant',
    label: 'Attribuer ou révoquer un accès staff',
    category: 'acces',
    scope: 'utilisateur',
    capability: 'admin.access.grant',
    guard: 'audit + N2',
    effect:
      'Ouvre des capacités datées à un compte ; la révocation prend effet au chargement suivant.',
    href: '/admin/access',
  },
  {
    id: 'access.matrix',
    label: 'Rôles et capacités',
    category: 'acces',
    scope: 'global',
    capability: 'admin.access.read',
    guard: 'audit',
    effect: 'Décrit ce que chaque rôle détient réellement, avec la preuve associée.',
    href: '/admin/access/roles',
  },
  {
    id: 'access.decisions',
    label: 'Décisions d’autorisation',
    category: 'acces',
    scope: 'global',
    capability: 'admin.audit.read',
    guard: 'audit',
    effect: 'Trace chaque refus et chaque accord : qui, quelle capacité, sur quelle cible.',
    href: '/admin/access/decisions',
  },
  {
    id: 'access.sessions',
    label: 'Révoquer les sessions d’un compte',
    category: 'acces',
    scope: 'utilisateur',
    capability: 'admin.users.sessions.revoke',
    guard: 'audit + N2',
    effect: 'Ferme toutes les sessions actives ; l’appareil doit se reconnecter.',
    href: '/admin/users',
  },
  {
    id: 'access.review',
    label: 'Revue d’accès périodique',
    category: 'acces',
    scope: 'global',
    capability: 'admin.access.read',
    guard: 'audit',
    effect: 'Confirme ou retire les accès existants à intervalle régulier.',
    href: '/admin/access',
  },

  // ── Confiance & sécurité ────────────────────────────────────────────
  {
    id: 'moderation.reports',
    label: 'Traitement des signalements',
    category: 'moderation',
    scope: 'global',
    capability: 'admin.reports.write',
    guard: 'audit',
    effect: 'Masque, ignore ou escalade un contenu signalé ; le motif est conservé.',
    href: '/admin/reports',
  },
  {
    id: 'moderation.abuse',
    label: 'Seuils et verdicts anti-abus',
    category: 'moderation',
    scope: 'global',
    capability: 'admin.abuse.decide',
    guard: 'audit + N2',
    effect: 'Ferme une revue de risque (spam, fraude, réseau) et applique la sanction.',
    href: '/admin/abuse',
  },
  {
    id: 'moderation.appeals',
    label: 'Recours',
    category: 'moderation',
    scope: 'utilisateur',
    capability: 'admin.appeals.decide',
    guard: 'audit + N2',
    effect: 'Confirme ou annule une sanction contestée, avec le délai de réponse.',
    href: '/admin/appeals',
  },
  {
    id: 'moderation.incidents',
    label: 'Incidents',
    category: 'moderation',
    scope: 'global',
    capability: 'admin.incidents.write',
    guard: 'audit',
    effect: 'Déclare, suit et clôture un incident ; la communication en dépend.',
    href: '/admin/incidents',
  },
  {
    id: 'moderation.account',
    label: 'Suspendre, certifier, shadowban',
    category: 'moderation',
    scope: 'utilisateur',
    capability: 'admin.users.moderate',
    guard: 'audit + N2',
    effect: 'Change l’état d’un compte ; le motif est exigé pour une suspension.',
    href: '/admin/users',
  },

  // ── Communication ───────────────────────────────────────────────────
  {
    id: 'comms.announcement',
    label: 'Bandeau d’annonce globale',
    category: 'communication',
    scope: 'global',
    capability: 'admin.campaigns.write',
    guard: 'audit + N2',
    effect: 'Affiche ou retire un message en haut de toutes les pages de lecture.',
    href: '/admin/notifications',
  },
  {
    id: 'comms.placements',
    label: 'Placements in-app',
    category: 'communication',
    scope: 'tenant',
    capability: 'admin.config.write',
    guard: 'audit',
    effect: 'Programme un slot (bannière, carte, modale) par audience et format.',
    href: '/admin/notifications',
  },
  {
    id: 'comms.campaigns',
    label: 'Campagnes et audiences',
    category: 'communication',
    scope: 'global',
    capability: 'admin.campaigns.write',
    guard: 'audit + N2',
    effect: 'Prépare un envoi (audience, consentement, plafond) et le soumet à revue.',
    href: '/admin/campaigns',
  },
  {
    id: 'comms.deliveries',
    label: 'Livraisons email',
    category: 'communication',
    scope: 'utilisateur',
    capability: 'admin.deliveries.retry',
    guard: 'audit',
    effect: 'Relance une livraison en échec ou l’abandonne explicitement.',
    href: '/admin/notifications',
  },
  {
    id: 'comms.imports',
    label: 'Imports d’abonnés',
    category: 'communication',
    scope: 'tenant',
    capability: 'admin.imports.review',
    guard: 'audit + N2',
    effect: 'Valide un lot en quarantaine, mappe les colonnes, refuse le reste.',
    href: '/admin/imports',
  },

  // ── Produit & contenu ───────────────────────────────────────────────
  {
    id: 'product.flags',
    label: 'Feature flags',
    category: 'produit',
    scope: 'global',
    capability: 'admin.flags.write',
    guard: 'audit + N2',
    effect: 'Active ou coupe une fonctionnalité sans déploiement.',
    href: '/admin/config',
  },
  {
    id: 'product.features',
    label: 'Registre des features',
    category: 'produit',
    scope: 'global',
    capability: 'admin.config.write',
    guard: 'audit',
    effect: 'Statut produit, flag lié et intérêt exprimé par les lecteurs.',
    href: '/admin/features',
  },
  {
    id: 'product.frontend',
    label: 'CMS frontend',
    category: 'produit',
    scope: 'global',
    capability: 'admin.content.write',
    guard: 'audit',
    effect: 'Contenus éditoriaux des pages publiques, publiés depuis la console.',
    href: '/admin/frontend',
  },
  {
    id: 'product.widgets',
    label: 'Widgets',
    category: 'produit',
    scope: 'tenant',
    capability: 'admin.widgets.write',
    guard: 'audit',
    effect: 'Composition des blocs d’accueil et de profil.',
    href: '/admin/widgets',
  },
  {
    id: 'product.translations',
    label: 'Traductions',
    category: 'produit',
    scope: 'global',
    capability: 'admin.content.write',
    guard: 'audit',
    effect: 'Couverture des catalogues par locale ; les clés manquantes se voient.',
    href: '/admin/translations',
  },
  {
    id: 'product.storage',
    label: 'Stockage et médias',
    category: 'produit',
    scope: 'global',
    capability: 'admin.config.write',
    guard: 'audit',
    effect: 'Usage du bucket, quotas et objets orphelins.',
    href: '/admin/storage',
  },
  {
    id: 'product.api',
    label: 'Accès API et modules',
    category: 'produit',
    scope: 'utilisateur',
    capability: 'admin.api.grants.write',
    guard: 'audit + N2',
    effect: 'Ouvre ou retire des permissions API, module par module.',
    href: '/admin/api',
  },
  {
    id: 'product.oauth',
    label: 'Applications OAuth',
    category: 'produit',
    scope: 'utilisateur',
    capability: 'admin.oauth.approve',
    guard: 'audit + N2',
    effect: 'Approuve ou suspend un client « Se connecter avec qoefi ».',
    href: '/admin/oauth',
  },

  // ── Conformité ─────────────────────────────────────────────────────
  {
    id: 'legal.publish',
    label: 'Publier un texte juridique',
    category: 'conformite',
    scope: 'global',
    capability: 'admin.legal.write',
    guard: 'audit + N2',
    effect: 'Crée une version datée ; les acceptations précédentes restent immuables.',
    href: '/admin/legal',
  },
  {
    id: 'legal.consent',
    label: 'Consentements et exports',
    category: 'conformite',
    scope: 'utilisateur',
    capability: 'admin.compliance.export',
    guard: 'audit + N2',
    effect: 'Exporte le registre append-only avec preuves et chaînage.',
    href: '/admin/compliance',
  },
  {
    id: 'legal.retention',
    label: 'Rétention des données',
    category: 'conformite',
    scope: 'global',
    capability: 'admin.compliance.read',
    guard: 'audit',
    effect: 'Durée de conservation par famille de données et purges associées.',
    href: '/admin/compliance',
  },
  {
    id: 'legal.audit',
    label: 'Journal d’audit',
    category: 'conformite',
    scope: 'global',
    capability: 'admin.audit.read',
    guard: 'audit',
    effect: 'Qui a fait quoi, sur quelle cible, avec le diff ; toujours écrit.',
    href: '/admin/audit',
  },

  // ── Plateforme ─────────────────────────────────────────────────────
  {
    id: 'platform.registrations',
    label: 'Inscriptions et allowlist',
    category: 'plateforme',
    scope: 'global',
    capability: 'admin.config.write',
    guard: 'audit + N2',
    effect: 'Ouvre, ferme ou restreint la création de comptes.',
    href: '/admin/config',
  },
  {
    id: 'platform.maintenance',
    label: 'Maintenance et kill switches',
    category: 'plateforme',
    scope: 'global',
    capability: 'admin.config.write',
    guard: 'audit + N2',
    effect: 'Coupe une surface (lecture, envoi, API) sans redéploiement.',
    href: '/admin/config',
  },
  {
    id: 'platform.health',
    label: 'Santé plateforme',
    category: 'plateforme',
    scope: 'global',
    capability: 'admin.dashboard.read',
    guard: 'audit',
    effect: 'Postgres, migration, journal, mode d’autorisation et sondes.',
    href: '/admin/health',
  },
  {
    id: 'platform.coverage',
    label: 'Couverture des routes',
    category: 'plateforme',
    scope: 'global',
    capability: 'admin.dashboard.read',
    guard: 'audit',
    effect: 'Routes API admin portées par un écran, et celles assumées sans écran.',
    href: '/admin/system',
  },
  {
    id: 'platform.subscriptions',
    label: 'Abonnements et octrois',
    category: 'plateforme',
    scope: 'utilisateur',
    capability: 'admin.subscriptions.write',
    guard: 'audit + N2',
    effect: 'Offre, période d’essai et octrois manuels d’accès.',
    href: '/admin/subscriptions',
  },
  {
    id: 'platform.support',
    label: 'Support et articles d’aide',
    category: 'communication',
    scope: 'global',
    capability: 'admin.support.write',
    guard: 'audit',
    effect: 'Répond aux tickets, publie ou retire un article d’aide.',
    href: '/admin/support',
  },
];

/** Leviers qu'une personne peut ouvrir avec ses capacités. */
export function editableLevers(capabilities: readonly string[]): SettingsLever[] {
  const held = new Set(capabilities);
  return SETTINGS_CATALOG.filter((lever) => held.has(lever.capability));
}
