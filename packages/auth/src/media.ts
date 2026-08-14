// =====================================================================
// 📰 Média RBAC — Système de rôles & permissions pour les Médias (organisations)
// =====================================================================
// 📖 Un créateur peut travailler pour plusieurs médias avec des rôles
//    et des permissions distincts par média. Le rôle définit des
//    permissions de base ; les overrides granulaires (member.permissions)
//    peuvent les affiner.
// =====================================================================

export const MEDIA_ROLES = {
  OWNER: 'owner',
  EDITOR: 'editor',
  WRITER: 'writer',
  VIEWER: 'viewer',
} as const;

export type MediaRole = (typeof MEDIA_ROLES)[keyof typeof MEDIA_ROLES];

export const MEDIA_ROLE_ORDER: Record<MediaRole, number> = {
  owner: 4,
  editor: 3,
  writer: 2,
  viewer: 1,
};

/**
 * 🎬 Permissions média granulaires.
 */
export type MediaPermission =
  | 'media:manage_members' // inviter / retirer / changer les rôles
  | 'media:manage_settings' // design, SEO, sous-domaine
  | 'media:manage_billing' // Stripe, tiers, monétisation
  | 'media:manage_categories'
  | 'media:manage_newsletter'
  | 'media:publish:any' // publier les articles de n'importe qui
  | 'media:edit:any' // éditer les articles de n'importe qui
  | 'media:delete:any'
  | 'media:review' // approuver les soumissions
  | 'media:view_analytics'
  | 'media:create_articles'
  | 'media:edit_own'; // éditer ses propres articles

export const ALL_MEDIA_PERMISSIONS: MediaPermission[] = [
  'media:manage_members',
  'media:manage_settings',
  'media:manage_billing',
  'media:manage_categories',
  'media:manage_newsletter',
  'media:publish:any',
  'media:edit:any',
  'media:delete:any',
  'media:review',
  'media:view_analytics',
  'media:create_articles',
  'media:edit_own',
];

/**
 * 📋 Permissions de base par rôle.
 */
const MEDIA_ROLE_PERMISSIONS: Record<MediaRole, MediaPermission[]> = {
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

/**
 * 🏢 Membres média minimaux requis pour les vérifications de permission.
 */
export interface MediaMemberContext {
  role: MediaRole | string;
  permissions?: string[];
  status?: string;
}

/**
 * ✅ Vérifie si un membre d'un média a une permission.
 * Combine les permissions de base du rôle + les overrides granulaires stockés.
 */
export function canMedia(
  member: MediaMemberContext | null | undefined,
  permission: MediaPermission
): boolean {
  if (!member) return false;
  if (member.status && member.status !== 'active' && member.status !== 'invited') return false;

  const role = member.role as MediaRole;
  const base = MEDIA_ROLE_PERMISSIONS[role] ?? [];
  const overrides = member.permissions ?? [];

  // Overrides explicites : "perm" accorde, "-perm" retire
  if (overrides.includes(permission)) return true;
  if (overrides.includes(`-${permission}`)) return false;

  return base.includes(permission);
}

/**
 * 🛡️ Throw si le membre n'a pas la permission (utilisable dans les Server Actions).
 */
export function requireMedia(
  member: MediaMemberContext | null | undefined,
  permission: MediaPermission
) {
  if (!canMedia(member, permission)) {
    throw new Error(`Permission insuffisante : "${permission}" requise`);
  }
}

/**
 * ✍️ Vérifie si un membre peut éditer un article donné du média.
 */
export function canEditMediaArticle(
  member: MediaMemberContext | null | undefined,
  article: { authorId: string },
  memberUserId: string
): boolean {
  if (!member) return false;
  if (canMedia(member, 'media:edit:any')) return true;
  if (canMedia(member, 'media:edit_own') && article.authorId === memberUserId) return true;
  return false;
}

/**
 * 🏆 Vérifie si le membre est owner (ou a un rôle ≥ editor).
 */
export function isMediaAdmin(member: MediaMemberContext | null | undefined): boolean {
  if (!member) return false;
  const role = member.role as MediaRole;
  return MEDIA_ROLE_ORDER[role] >= MEDIA_ROLE_ORDER.editor;
}

export { MEDIA_ROLE_PERMISSIONS };
