// =====================================================================
// 📰 media-studio-logic — règles pures du studio Média
// =====================================================================
// Extraites de `MediaStudioClient` pour être testables sans DOM : rôles et
// permissions effectives, statut d'un lien d'invitation et traduction du
// journal d'audit en phrases lisibles. Aucun état, aucun appel réseau.
// =====================================================================

import { t } from '@lingui/core/macro';
import { ALL_MEDIA_PERMISSIONS, MEDIA_ROLES } from '@qoe/auth/media';

/** Membre suffisant pour calculer ses permissions effectives. */
export interface MediaMemberLike {
  role: string;
  permissions?: string[] | null;
}

export type PermissionTone = 'danger' | 'neutral' | 'success';

export const ROLE_LABELS: Record<string, () => string> = {
  owner: () => t`Propriétaire`,
  editor: () => t`Éditeur`,
  writer: () => t`Rédacteur`,
  viewer: () => t`Lecteur`,
};

/** Rôles qu'on peut attribuer : le propriétaire ne se donne pas. */
export const ASSIGNABLE_ROLES = Object.keys(ROLE_LABELS).filter(
  (role) => role !== MEDIA_ROLES.OWNER
);

export const PERMISSION_LABELS: Record<string, () => string> = {
  'media:manage_members': () => t`Gérer les membres`,
  'media:manage_settings': () => t`Design & SEO`,
  'media:manage_billing': () => t`Monétisation`,
  'media:manage_categories': () => t`Catégories`,
  'media:manage_newsletter': () => t`Newsletter`,
  'media:publish:any': () => t`Publier`,
  'media:edit:any': () => t`Éditer tout`,
  'media:delete:any': () => t`Supprimer`,
  'media:review': () => t`Approbation`,
  'media:view_analytics': () => t`Analytics`,
  'media:create_articles': () => t`Écrire`,
  'media:edit_own': () => t`Éditer ses écrits`,
  'api_keys:manage': () => t`Gérer les clés API`,
};

export const ROLE_DEFAULT_PERMS: Record<string, string[]> = {
  owner: [...ALL_MEDIA_PERMISSIONS],
  editor: [
    'media:manage_categories',
    'media:manage_newsletter',
    'media:publish:any',
    'media:edit:any',
    'media:delete:any',
    'media:review',
    'media:view_analytics',
    'media:create_articles',
    'media:edit_own',
  ],
  writer: ['media:create_articles', 'media:edit_own'],
  viewer: ['media:view_analytics'],
};

export const AUDIT_CATEGORIES: Array<{ id: string; label: () => string }> = [
  { id: 'all', label: () => t`Tout` },
  { id: 'articles', label: () => t`Articles` },
  { id: 'team', label: () => t`Équipe` },
  { id: 'settings', label: () => t`Réglages` },
  { id: 'invitations', label: () => t`Invitations` },
  { id: 'api', label: () => t`Clés API` },
];

export const AUDIT_FIELD_LABELS = (): Record<string, string> => ({
  title: 'titre',
  slug: 'permalien',
  content: 'contenu',
  paywall: 'paywall',
  status: 'statut',
  category: t`catégorie`,
  seo: 'SEO',
  image: 'image',
  options: 'options de lecture',
  name: 'nom',
  bio: 'bio',
  logoUrl: 'logo',
  subdomain: 'sous-domaine',
  customDomain: 'domaine',
  accentColor: 'couleur',
  heroText: 'accroche',
  headerImageUrl: t`bannière`,
  footerText: t`pied de page`,
  themeMode: t`thème`,
  layoutStyle: t`mise en page`,
  seoTitle: 'titre SEO',
  seoDescription: 'description SEO',
  allowIndexing: 'indexation',
  fontFamily: 'police',
  supportUrl: 'support',
});

export function formatMediaDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatMediaDateTime(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function auditString(md: Record<string, unknown>, key: string): string {
  const value = md[key];
  return typeof value === 'string' ? value : '';
}

/** Traduit une entrée du journal média en phrase lisible (style Discord). */
export function describeAuditEntry(entry: {
  action: string;
  metadata: Record<string, unknown> | null;
}): { summary: string; detail?: string } {
  const md = entry.metadata ?? {};
  const fields = Array.isArray(md.fields) ? md.fields.map(String) : [];
  const fieldLabels = fields.map((f) => AUDIT_FIELD_LABELS()[f] ?? f).join(', ');
  const title = auditString(md, 'title');
  switch (entry.action) {
    case 'media.created':
      return { summary: t`a créé le Média` };
    case 'media.settings_updated':
      return { summary: t`a modifié les réglages du Média`, detail: fieldLabels || undefined };
    case 'media.article_created':
      return { summary: t`a créé l'article « ${title} »` };
    case 'media.article_updated':
      return { summary: t`a modifié l'article « ${title} »`, detail: fieldLabels || undefined };
    case 'media.article_deleted':
      return { summary: t`a supprimé l'article « ${title} »` };
    case 'media.article_published':
      return { summary: t`a publié l'article « ${title} »` };
    case 'media.article_unpublished':
      return { summary: t`a dépublié l'article « ${title} »` };
    case 'media.article_scheduled': {
      const at = auditString(md, 'scheduledAt');
      return {
        summary: t`a programmé l'article « ${title} »`,
        detail: at ? formatMediaDateTime(at) : undefined,
      };
    }
    case 'media.article_schedule_cancelled':
      return { summary: t`a annulé la programmation de l'article « ${title} »` };
    case 'media.article_draft_discarded':
      return { summary: t`a abandonné le brouillon de « ${title} »` };
    case 'media.article_approved': {
      const comment = auditString(md, 'comment');
      return { summary: t`a approuvé l'article « ${title} »`, detail: comment || undefined };
    }
    case 'media.article_rejected': {
      const comment = auditString(md, 'comment');
      return { summary: t`a rejeté l'article « ${title} »`, detail: comment || undefined };
    }
    case 'media.article_transferred_out': {
      const to = auditString(md, 'toPublisherName');
      return {
        summary: t`a transféré l'article « ${title} »`,
        detail: to ? `vers ${to}` : undefined,
      };
    }
    case 'media.article_transferred_in': {
      const from = auditString(md, 'fromPublisherName');
      return {
        summary: t`a reçu l'article « ${title} »`,
        detail: from ? `depuis ${from}` : undefined,
      };
    }
    case 'member.role_changed':
      return { summary: t`a changé le rôle d'un membre`, detail: auditString(md, 'role') };
    case 'member.permissions_changed':
      return { summary: t`a modifié les permissions d'un membre` };
    case 'member.invited_pending':
      return { summary: t`a invité @${auditString(md, 'username')}` };
    case 'member.invitation_accepted':
      return { summary: t`a rejoint le Média`, detail: auditString(md, 'role') || undefined };
    case 'member.removed':
      return { summary: t`a retiré un membre du Média` };
    case 'media.invite_link_created':
      return { summary: t`a généré un lien d'invitation` };
    case 'media.invite_link_revoked':
      return { summary: t`a révoqué un lien d'invitation` };
    case 'api_key.created':
      return { summary: t`a créé une clé API` };
    case 'api_key.updated':
      return { summary: t`a modifié une clé API` };
    case 'api_key.rotated':
      return { summary: t`a régénéré une clé API` };
    case 'api_key.revoked':
      return { summary: t`a révoqué une clé API` };
    default:
      return { summary: entry.action };
  }
}

/** Statut affiché d'un lien d'invitation, du plus définitif au plus courant. */
export function inviteLinkStatus(
  link: {
    isRevoked: boolean;
    expiresAt: string | null;
    maxUses: number;
    usedCount: number;
  },
  now: number = Date.now()
): { label: string; tone: PermissionTone } {
  if (link.isRevoked) return { label: t`Révoqué`, tone: 'danger' };
  if (link.expiresAt && new Date(link.expiresAt).getTime() < now)
    return { label: t`Expiré`, tone: 'neutral' };
  if (link.maxUses > 0 && link.usedCount >= link.maxUses)
    return { label: t`Épuisé`, tone: 'neutral' };
  return { label: t`Actif`, tone: 'success' };
}

/** Permissions effectives : les overrides du membre, sinon celles du rôle. */
export function effectivePermissions(member: MediaMemberLike): string[] {
  return member.permissions && member.permissions.length > 0
    ? member.permissions
    : ROLE_DEFAULT_PERMS[member.role] || [];
}

/** Permissions après bascule d'une permission (ajout ou retrait). */
export function togglePermission(member: MediaMemberLike, permission: string): string[] {
  const perms = new Set(effectivePermissions(member));
  if (perms.has(permission)) perms.delete(permission);
  else perms.add(permission);
  return Array.from(perms);
}
