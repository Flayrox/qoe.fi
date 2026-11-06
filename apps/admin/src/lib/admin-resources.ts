// =====================================================================
// 📦 admin-resources.ts — Registre unifié des ressources d'exploitation (C1)
// =====================================================================
// Centralise la déclaration des entités opérationnelles de l'administration :
// identifiant, chemin, capacité requise, tri par défaut et facettes.
// Ce registre garantit la cohérence entre les écrans, la palette ⌘K,
// et les futures fonctions transverses (exports signés, recherche globale).
// =====================================================================

import type { AdminCapability } from './admin-console';

export interface ResourceFacetValue {
  id: string;
  label: string;
}

export interface ResourceFacetDescriptor {
  id: string;
  label: string;
  values: readonly ResourceFacetValue[];
}

export interface AdminResourceSpec {
  id: string;
  label: string;
  singularLabel: string;
  path: string;
  viewKey: string;
  capability: AdminCapability;
  defaultSort: { column: string; direction: 'ascending' | 'descending' };
  facets: readonly ResourceFacetDescriptor[];
  description: string;
}

export const ADMIN_RESOURCES = {
  reports: {
    id: 'reports',
    label: 'Signalements',
    singularLabel: 'Signalement',
    path: '/admin/reports',
    viewKey: 'admin.reports.queue',
    capability: 'admin.reports.read',
    defaultSort: { column: 'createdAt', direction: 'descending' },
    description: 'Signalements de la communauté visant des pensées, articles ou comptes.',
    facets: [
      {
        id: 'status',
        label: 'Statut',
        values: [
          { id: 'pending', label: 'En attente' },
          { id: 'resolved', label: 'Résolus' },
          { id: 'dismissed', label: 'Ignorés' },
        ],
      },
      {
        id: 'targetType',
        label: 'Type de cible',
        values: [
          { id: 'thought', label: 'Pensées' },
          { id: 'article', label: 'Articles' },
          { id: 'user', label: 'Comptes' },
        ],
      },
      {
        id: 'reason',
        label: 'Motif',
        values: [
          { id: 'spam', label: 'Spam / pub' },
          { id: 'harassment', label: 'Harcèlement' },
          { id: 'hate_speech', label: 'Haine' },
          { id: 'misleading', label: 'Désinformation' },
          { id: 'other', label: 'Autre' },
        ],
      },
    ],
  },
  appeals: {
    id: 'appeals',
    label: 'Recours',
    singularLabel: 'Recours',
    path: '/admin/appeals',
    viewKey: 'admin.appeals.queue',
    capability: 'admin.appeals.read',
    defaultSort: { column: 'createdAt', direction: 'descending' },
    description: 'Contestations formulées par les utilisateurs suite à une mesure de sanction.',
    facets: [
      {
        id: 'status',
        label: 'Statut',
        values: [
          { id: 'open', label: 'À prendre' },
          { id: 'under_review', label: 'En cours' },
          { id: 'decided', label: 'Tranchés' },
        ],
      },
      {
        id: 'outcome',
        label: 'Verdict',
        values: [
          { id: 'overturned', label: 'Infirmés (levés)' },
          { id: 'upheld', label: 'Confirmés' },
        ],
      },
    ],
  },
  abuse: {
    id: 'abuse',
    label: 'Revue anti-abus',
    singularLabel: 'Dossier anti-abus',
    path: '/admin/abuse',
    viewKey: 'admin.abuse.queue',
    capability: 'admin.abuse.read',
    defaultSort: { column: 'createdAt', direction: 'descending' },
    description: 'Verdicts automatiques du noyau nécessitant un arbitrage humain.',
    facets: [
      {
        id: 'result',
        label: 'Verdict',
        values: [
          { id: 'needs_review', label: 'Revue priorisée' },
          { id: 'limit_distribution', label: 'Limitation' },
          { id: 'pause_sending', label: 'Pause envois' },
          { id: 'suspend', label: 'Suspension' },
        ],
      },
      {
        id: 'source',
        label: 'Source',
        values: [
          { id: 'auto', label: 'Automate' },
          { id: 'human', label: 'Humain' },
        ],
      },
    ],
  },
  support: {
    id: 'support',
    label: 'Support',
    singularLabel: 'Ticket support',
    path: '/admin/support',
    viewKey: 'admin.support.queue',
    capability: 'admin.support.read',
    defaultSort: { column: 'createdAt', direction: 'descending' },
    description: 'Dossiers d’assistance générale hors recours contentieux.',
    facets: [
      {
        id: 'status',
        label: 'Statut',
        values: [
          { id: 'open', label: 'Ouverts' },
          { id: 'under_review', label: 'En cours' },
          { id: 'closed', label: 'Clos' },
        ],
      },
      {
        id: 'assignment',
        label: 'Assignation',
        values: [
          { id: 'unassigned', label: 'Non assignés' },
          { id: 'assigned', label: 'Assignés' },
        ],
      },
    ],
  },
  approvals: {
    id: 'approvals',
    label: 'Doubles validations',
    singularLabel: 'Double validation',
    path: '/admin/approvals',
    viewKey: 'admin.approvals.queue',
    capability: 'admin.legal.read',
    defaultSort: { column: 'createdAt', direction: 'descending' },
    description: 'Actes irréversibles soumis au quorum de deux personnes autorisées.',
    facets: [
      {
        id: 'status',
        label: 'Statut',
        values: [
          { id: 'open', label: 'En attente' },
          { id: 'approved', label: 'Approuvées' },
          { id: 'rejected', label: 'Refusées' },
          { id: 'consumed', label: 'Exercées' },
        ],
      },
      {
        id: 'origin',
        label: 'Origine',
        values: [
          { id: 'mine', label: 'Mes demandes' },
          { id: 'others', label: 'Autres demandeurs' },
        ],
      },
    ],
  },
  deliveries: {
    id: 'deliveries',
    label: 'Livraisons outbox',
    singularLabel: 'Livraison',
    path: '/admin/notifications',
    viewKey: 'admin.notifications.deliveries',
    capability: 'admin.deliveries.read',
    defaultSort: { column: 'createdAt', direction: 'descending' },
    description:
      'Historique des envois transactionnels par courrier électronique et notifications.',
    facets: [
      {
        id: 'status',
        label: 'Statut',
        values: [
          { id: 'QUEUED', label: 'En attente' },
          { id: 'PROCESSING', label: 'En cours' },
          { id: 'SENT', label: 'Envoyés' },
          { id: 'FAILED', label: 'Échecs' },
          { id: 'DISABLED', label: 'Désactivés' },
        ],
      },
      {
        id: 'channel',
        label: 'Canal',
        values: [
          { id: 'email', label: 'Email' },
          { id: 'in_app', label: 'In-app' },
        ],
      },
    ],
  },
  users: {
    id: 'users',
    label: 'Utilisateurs',
    singularLabel: 'Utilisateur',
    path: '/admin/users',
    viewKey: 'admin.users',
    capability: 'admin.users.read',
    defaultSort: { column: 'created', direction: 'descending' },
    description: 'Comptes de la plateforme et opérations de modération directe.',
    facets: [
      {
        id: 'role',
        label: 'Rôle',
        values: [
          { id: 'admin', label: 'Administrateur' },
          { id: 'author', label: 'Auteur' },
          { id: 'member', label: 'Membre' },
        ],
      },
      {
        id: 'status',
        label: 'Statut',
        values: [
          { id: 'Actif', label: 'Actif' },
          { id: 'Certifié', label: 'Certifié' },
          { id: 'Shadowban', label: 'Shadowban' },
          { id: 'Banni', label: 'Banni' },
        ],
      },
    ],
  },
  triage: {
    id: 'triage',
    label: 'File staff de triage',
    singularLabel: 'Dossier de triage',
    path: '/admin/work',
    viewKey: 'admin.work.triage',
    capability: 'admin.dashboard.read',
    defaultSort: { column: 'sla', direction: 'ascending' },
    description: 'Vue consolidée et synchronisée des six files de dossiers prioritaires.',
    facets: [
      {
        id: 'queue',
        label: 'File',
        values: [
          { id: 'moderation', label: 'Signalements' },
          { id: 'appeals', label: 'Recours' },
          { id: 'abuse', label: 'Anti-abus' },
          { id: 'support', label: 'Support' },
          { id: 'imports', label: 'Imports' },
          { id: 'approvals', label: 'Validations' },
        ],
      },
      {
        id: 'priority',
        label: 'Priorité',
        values: [
          { id: 'urgent', label: 'Urgente' },
          { id: 'high', label: 'Haute' },
          { id: 'normal', label: 'Normale' },
          { id: 'low', label: 'Basse' },
        ],
      },
      {
        id: 'sla',
        label: 'SLA',
        values: [
          { id: 'breached', label: 'SLA dépassé' },
          { id: 'due_soon', label: 'Échéance proche' },
          { id: 'on_track', label: 'Dans les temps' },
          { id: 'closed', label: 'Fermé' },
        ],
      },
    ],
  },
} as const satisfies Record<string, AdminResourceSpec>;

export type AdminResourceId = keyof typeof ADMIN_RESOURCES;

export function getAdminResource(id: AdminResourceId): AdminResourceSpec {
  return ADMIN_RESOURCES[id];
}
