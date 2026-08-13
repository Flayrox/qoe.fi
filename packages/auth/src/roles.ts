// =====================================================================
// 👥 Roles & Hiérarchie
// =====================================================================
// 📖 Ré-export depuis @qoe/config pour centraliser l'auth.
// =====================================================================

export { ROLES, ROLE_HIERARCHY, type Role } from '@qoe/config';
import { ROLES, ROLE_HIERARCHY, type Role } from '@qoe/config';

/**
 * 🔍 Vérifie si un rôle a au moins le niveau requis.
 *
 * @example
 *   hasRoleLevel('superadmin', 'creator') // true
 *   hasRoleLevel('user', 'creator') // false
 */
export function hasRoleLevel(userRole: Role | null, required: Role): boolean {
  if (!userRole) return false;
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[required];
}

/**
 * ✅ Vérifie si un user est superadmin.
 */
export function isSuperadmin(userRole: Role | null): boolean {
  return userRole === ROLES.SUPERADMIN;
}

/**
 * ✅ Vérifie si un user est creator (ou superadmin).
 */
export function isCreator(userRole: Role | null): boolean {
  return hasRoleLevel(userRole, ROLES.CREATOR);
}
