// =====================================================================
// 👤 Current User — Helpers serveur
// =====================================================================
// 📖 Fonctions utilitaires pour récupérer l'utilisateur courant
//    depuis n'importe quel Server Component / Server Action.
// =====================================================================

import { cache } from 'react';
import { prisma } from '@qoe/db/client';
import { createClient } from '@qoe/supabase/server';
import type { User } from '@qoe/db/types';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { ROLES, type Role, getMonorepoUrl } from '@qoe/config';
import { can, type Action } from './permissions';

/**
 * 👤 Récupère l'utilisateur Supabase authentifié (depuis le cookie).
 * Retourne null si pas connecté.
 */
export const getAuthUser = cache(async (): Promise<SupabaseUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/**
 * 👤 Récupère l'utilisateur complet (Supabase + Prisma).
 * Retourne null si pas connecté ou pas en DB.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const authUser = await getAuthUser();
  if (!authUser) return null;

  const dbUser = await prisma.user.findUnique({
    where: { id: authUser.id },
  });
  return dbUser;
});

/**
 * 👤 Récupère l'utilisateur OU redirige vers la page de login CENTRALE.
 *
 * Construit dynamiquement l'URL de login en utilisant getMonorepoUrl pour
 * être compatible Dev Direct (lvh.me:3010), Dev Caddy et Production (qoe.fi).
 *
 * Le paramètre ?redirect= encode l'URL COMPLÈTE courante pour retour après connexion.
 */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();

  if (!user) {
    let loginUrl = '/login';

    try {
      const headersList = await headers();
      const host = headersList.get('host') || '';
      // Construire l'URL de la page courante via referer ou x-invoke-path
      const referer = headersList.get('referer');
      const invokedPath = headersList.get('x-invoke-path');
      const proto = process.env.NODE_ENV === 'production' ? 'https' : 'http';
      const currentUrl =
        referer || (invokedPath ? `${proto}://${host}${invokedPath}` : `${proto}://${host}/`);

      const feedBase = getMonorepoUrl('feed', host);
      loginUrl = `${feedBase}/login?redirect=${encodeURIComponent(currentUrl)}`;
    } catch {
      // Fallback si headers() n'est pas disponible (ex: génération statique)
      loginUrl = '/login';
    }

    redirect(loginUrl);
  }

  return user;
}

/**
 * 🛡️ Récupère l'utilisateur OU throw s'il n'a pas la permission.
 * Utilisable dans les Server Actions.
 */
export async function requirePermission(action: Action): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthorized');
  if (!can(user.role as Role, action)) {
    throw new Error(`Forbidden: requires "${action}"`);
  }
  return user;
}

/**
 * 🛡️ Récupère l'utilisateur OU throw s'il n'a pas le rôle requis.
 */
export async function requireRole(role: Role): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthorized');
  if (user.role !== ROLES.SUPERADMIN && user.role !== role) {
    throw new Error(`Forbidden: requires role "${role}"`);
  }
  return user;
}

/**
 * 🛡️ Récupère l'utilisateur OU throw s'il n'est pas superadmin.
 */
export async function requireSuperadmin(): Promise<User> {
  return requireRole(ROLES.SUPERADMIN);
}

/**
 * 🛡️ Récupère l'utilisateur OU throw s'il n'est pas creator+.
 */
export async function requireCreator(): Promise<User> {
  return requireRole(ROLES.CREATOR);
}
