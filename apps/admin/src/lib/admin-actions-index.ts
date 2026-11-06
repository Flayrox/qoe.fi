// =====================================================================
// ⚡ admin-actions-index — les verbes de la console, indexés par la palette
// =====================================================================
// La palette ⌘K ne doit pas seulement transporter d'un écran à l'autre : un
// opérateur cherche « suspendre », « exporter le consentement », « basculer un
// flag ». Chaque action déclare la capacité qui la rend utile ; une action dont
// la capacité manque n'apparaît pas, comme les entrées de navigation.
// =====================================================================

import type { AdminCapability } from './admin-console';

export interface AdminActionShortcut {
  id: string;
  label: string;
  href: string;
  capability: AdminCapability;
  /** Mots que l'opérateur tape réellement (recherche cmdk). */
  keywords: string;
}

export const ADMIN_ACTIONS: readonly AdminActionShortcut[] = [
  {
    id: 'triage',
    label: 'Trier ma file',
    href: '/admin/work',
    capability: 'admin.dashboard.read',
    keywords: 'triage sla priorité assignation file',
  },
  {
    id: 'moderate-user',
    label: 'Suspendre ou certifier un compte',
    href: '/admin/users',
    capability: 'admin.users.moderate',
    keywords: 'suspendre bannir shadowban certifier compte utilisateur',
  },
  {
    id: 'resolve-report',
    label: 'Traiter un signalement',
    href: '/admin/reports',
    capability: 'admin.reports.write',
    keywords: 'signalement spam harcèlement masquer résoudre modération',
  },
  {
    id: 'decide-appeal',
    label: 'Décider un recours',
    href: '/admin/appeals',
    capability: 'admin.appeals.decide',
    keywords: 'recours appel overturn contestation',
  },
  {
    id: 'review-abuse',
    label: 'Clôturer une revue anti-abus',
    href: '/admin/abuse',
    capability: 'admin.abuse.decide',
    keywords: 'abus verdict risque revue',
  },
  {
    id: 'publish-legal',
    label: 'Publier un texte juridique',
    href: '/admin/legal',
    capability: 'admin.legal.write',
    keywords: 'cgu cgv confidentialité mentions publication version',
  },
  {
    id: 'export-consent',
    label: 'Exporter le registre de consentement',
    href: '/admin/compliance',
    capability: 'admin.compliance.export',
    keywords: 'rgpd export consentement signature preuve',
  },
  {
    id: 'toggle-flag',
    label: 'Basculer un feature flag',
    href: '/admin/config',
    capability: 'admin.flags.write',
    keywords: 'flag interrupteur fonctionnalité activer désactiver',
  },
  {
    id: 'freeze-registrations',
    label: 'Ouvrir ou fermer les inscriptions',
    href: '/admin/config',
    capability: 'admin.config.write',
    keywords: 'inscription allowlist invitation kill switch accès privé',
  },
  {
    id: 'approve-oauth',
    label: 'Approuver une application OAuth',
    href: '/admin/oauth',
    capability: 'admin.oauth.approve',
    keywords: 'oauth client application approbation',
  },
  {
    id: 'grant-access',
    label: 'Attribuer un accès staff',
    href: '/admin/access',
    capability: 'admin.access.grant',
    keywords: 'rôle capacité staff accès attribuer révoquer',
  },
  {
    id: 'retry-delivery',
    label: 'Réessayer une livraison email',
    href: '/admin/notifications',
    capability: 'admin.deliveries.retry',
    keywords: 'livraison email outbox échec reprise',
  },
  {
    id: 'review-import',
    label: 'Revoir un import d’abonnés',
    href: '/admin/imports',
    capability: 'admin.imports.review',
    keywords: 'import abonnés quarantaine confirmation csv',
  },
  {
    id: 'read-audit',
    label: 'Lire le journal d’audit',
    href: '/admin/audit',
    capability: 'admin.audit.read',
    keywords: 'audit qui a fait quoi journal décisions',
  },
];

/** Actions atteignables avec un jeu de capacités. */
export function visibleActions(capabilities: readonly string[]): AdminActionShortcut[] {
  const held = new Set(capabilities);
  return ADMIN_ACTIONS.filter((action) => held.has(action.capability));
}
