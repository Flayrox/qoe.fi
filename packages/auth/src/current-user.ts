// =====================================================================
// 👤 Current User — Helpers serveur
// =====================================================================
// 📖 Fonctions utilitaires pour récupérer l'utilisateur courant
//    depuis n'importe quel Server Component / Server Action.
// Go en primaire : GET /v1/me (backend-of-record, requis en Phase 3).
// =====================================================================

import { cache } from 'react';
import { createClient } from '@qoe/supabase/server';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { ROLES, type Role, getMonorepoUrl } from '@qoe/config';
import { can, type Action } from './permissions';
import { goFetch } from './go-client';

/**
 * 👤 Utilisateur DB (parité ReaderProfile Go — GET /v1/me).
 */
export interface DbUser {
  id: string;
  email: string;
  name: string | null;
  username: string | null;
  logoUrl: string | null;
  onboardingText: string | null;
  pronouns: string | null;
  role: string;
  walletBalanceCents: number;
  hasCompletedOnboarding: boolean;
  isCertified: boolean;
  advancedSettingsMode: boolean;
  createdAt: string;
  followsCount: number;
  mutedWordsCount: number;
  isMediaMember: boolean;
}

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
 * 👤 Récupère l'utilisateur complet (Supabase + DB via GET /v1/me).
 * Retourne null si pas connecté ou pas en DB.
 */
export const getCurrentUser = cache(async (): Promise<DbUser | null> => {
  const authUser = await getAuthUser();
  if (!authUser) return null;

  try {
    return await goFetch<DbUser>('/v1/me');
  } catch {
    // Utilisateur Supabase sans ligne DB (ex. tout juste inscrit) → null.
    return null;
  }
});

/**
 * 👤 Récupère l'utilisateur OU redirige vers la page de login CENTRALE.
 *
 * Construit dynamiquement l'URL de login en utilisant getMonorepoUrl pour
 * être compatible Dev Direct (lvh.me:3010), Dev Caddy et Production (qoe.fi).
 *
 * Le paramètre ?redirect= encode l'URL COMPLÈTE courante pour retour après connexion.
 */
export async function requireUser(): Promise<DbUser> {
  const user = await getCurrentUser();

  if (!user) {
    let loginUrl = '/login';

    try {
      const headersList = await headers();
      const proto =
        headersList.get('x-forwarded-proto') ||
        (process.env.NODE_ENV === 'production' ? 'https' : 'http');
      // Derrière le reverse-proxy, `host` peut être l'adresse de bind du
      // container (0.0.0.0:3000 — prouvé en prod sur les redirects de login).
      // On préfère x-forwarded-host (propagé par Caddy), sinon host, et on
      // neutralise les adresses internes. Même piège que les callbacks auth.
      const rawHost = headersList.get('x-forwarded-host') || headersList.get('host') || '';
      const isBindAddress = /^(0\.0\.0\.0|127\.0\.0\.1|\[?::1\]?|localhost)(:\d+)?$/i.test(rawHost);
      const host = isBindAddress ? '' : rawHost;

      // Construire l'URL de la page courante via referer ou x-invoke-path
      const referer = headersList.get('referer');
      const invokedPath = headersList.get('x-invoke-path');
      let currentUrl: string;
      if (referer && /^https?:\/\//.test(referer)) {
        currentUrl = referer;
      } else {
        // Sans hôte fiable (accès direct au container), on retombe sur une
        // URL canonique plutôt qu'une adresse de bind inatteignable.
        const base = host
          ? `${proto}://${host}`
          : process.env.NODE_ENV === 'production'
            ? getMonorepoUrl('feed')
            : 'http://localhost:3000';
        currentUrl = invokedPath ? `${base}${invokedPath}` : `${base}/`;
      }

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
export async function requirePermission(action: Action): Promise<DbUser> {
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
export async function requireRole(role: Role): Promise<DbUser> {
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
export async function requireSuperadmin(): Promise<DbUser> {
  return requireRole(ROLES.SUPERADMIN);
}

/**
 * 🛡️ Récupère l'utilisateur OU throw s'il n'est pas creator+.
 */
export async function requireCreator(): Promise<DbUser> {
  return requireRole(ROLES.CREATOR);
}
