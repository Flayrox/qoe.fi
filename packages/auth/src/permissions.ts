// =====================================================================
// 🛡️ Permissions — Système déclaratif
// =====================================================================
// 📖 Chaque action a une permission. Un user avec un rôle ≥ requis peut faire l'action.
//
// 🎯 Avantages :
//    - Lecture claire : "qui peut faire quoi ?"
//    - Pas de if/else éparpillés dans le code
//    - Facile à tester (map de permissions)
// =====================================================================

import { ROLES, type Role } from "@qoe/config";
import { isCreator, isSuperadmin } from "./roles";

/**
 * 🎬 Actions possibles dans l'app.
 */
export type Action =
  // Articles
  | "article:read"
  | "article:create"
  | "article:edit:own"
  | "article:edit:any"
  | "article:delete:own"
  | "article:delete:any"
  | "article:publish:own"
  | "article:publish:any"
  // Posts (micro)
  | "post:read"
  | "post:create"
  | "post:delete:own"
  | "post:delete:any"
  // Subscribers / Audience
  | "audience:read:own"
  | "audience:read:any"
  | "audience:block"
  // Billing
  | "billing:read:own"
  | "billing:manage:own"
  | "billing:refund:any"
  // Admin plateforme
  | "admin:dashboard:view"
  | "admin:users:view"
  | "admin:users:moderate"
  | "admin:config:edit"
  | "admin:widgets:edit"
  | "admin:frontend:edit"
  // Tenant
  | "tenant:configure:own"
  | "tenant:configure:any";

/**
 * 📋 Matrice des permissions par rôle.
 */
const PERMISSIONS: Record<Action, Role> = {
  // Articles
  "article:read": ROLES.USER,
  "article:create": ROLES.CREATOR,
  "article:edit:own": ROLES.CREATOR,
  "article:edit:any": ROLES.SUPERADMIN,
  "article:delete:own": ROLES.CREATOR,
  "article:delete:any": ROLES.SUPERADMIN,
  "article:publish:own": ROLES.CREATOR,
  "article:publish:any": ROLES.SUPERADMIN,
  // Posts
  "post:read": ROLES.USER,
  "post:create": ROLES.USER,
  "post:delete:own": ROLES.USER,
  "post:delete:any": ROLES.SUPERADMIN,
  // Audience
  "audience:read:own": ROLES.CREATOR,
  "audience:read:any": ROLES.SUPERADMIN,
  "audience:block": ROLES.CREATOR,
  // Billing
  "billing:read:own": ROLES.USER,
  "billing:manage:own": ROLES.CREATOR,
  "billing:refund:any": ROLES.SUPERADMIN,
  // Admin
  "admin:dashboard:view": ROLES.SUPERADMIN,
  "admin:users:view": ROLES.SUPERADMIN,
  "admin:users:moderate": ROLES.SUPERADMIN,
  "admin:config:edit": ROLES.SUPERADMIN,
  "admin:widgets:edit": ROLES.SUPERADMIN,
  "admin:frontend:edit": ROLES.SUPERADMIN,
  // Tenant
  "tenant:configure:own": ROLES.CREATOR,
  "tenant:configure:any": ROLES.SUPERADMIN,
};

/**
 * ✅ Vérifie si un user a la permission d'effectuer une action.
 *
 * @example
 *   can(user, 'article:create')          // false pour user, true pour creator
 *   can(user, 'admin:users:moderate')    // true seulement pour superadmin
 */
export function can(userRole: Role | null, action: Action): boolean {
  if (!userRole) return false;
  const required = PERMISSIONS[action];
  if (!required) return false;

  if (userRole === ROLES.SUPERADMIN) return true; // superadmin = tout
  if (userRole === ROLES.CREATOR && required === ROLES.CREATOR) return true;
  if (userRole === ROLES.USER && required === ROLES.USER) return true;
  return false;
}

/**
 * 🛡️ Throw une erreur si le user n'a pas la permission.
 * Utilisable dans les Server Actions.
 *
 * @example
 *   const user = await getCurrentUser();
 *   require(user, 'article:create');
 */
export function require(userRole: Role | null, action: Action): void {
  if (!can(userRole, action)) {
    throw new PermissionError(`Forbidden: requires permission "${action}"`);
  }
}

/**
 * ❌ Erreur de permission typée.
 */
export class PermissionError extends Error {
  constructor(message: string = "Permission denied") {
    super(message);
    this.name = "PermissionError";
  }
}

/**
 * 📝 Vérifie si un utilisateur a le droit d'éditer un article donné.
 */
export function canEditArticle(
  user: { id: string; role: Role } | null,
  article: { authorId: string }
): boolean {
  if (!user) return false;
  if (user.role === ROLES.SUPERADMIN) return true;
  if (can(user.role, "article:edit:own") && user.id === article.authorId) return true;
  return can(user.role, "article:edit:any");
}

/**
 * 🏛️ Vérifie si un utilisateur a le droit de gérer la configuration d'un tenant.
 */
export function canManageTenant(
  user: { id: string; role: Role } | null,
  tenant: { ownerId: string }
): boolean {
  if (!user) return false;
  if (user.role === ROLES.SUPERADMIN) return true;
  if (can(user.role, "tenant:configure:own") && user.id === tenant.ownerId) return true;
  return can(user.role, "tenant:configure:any");
}

// Re-exports pratiques
export { isCreator, isSuperadmin };
