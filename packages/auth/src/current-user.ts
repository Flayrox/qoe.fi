// =====================================================================
// 👤 Current User — Helpers serveur
// =====================================================================
// 📖 Fonctions utilitaires pour récupérer l'utilisateur courant
//    depuis n'importe quel Server Component / Server Action.
// =====================================================================

import { cache } from "react";
import { prisma } from "@qoe/db/client";
import { createClient } from "@qoe/supabase/server";
import type { User } from "@qoe/db/types";
import { redirect } from "next/navigation";
import { ROLES, type Role } from "@qoe/config";
import { can, type Action } from "./permissions";

/**
 * 👤 Récupère l'utilisateur Supabase authentifié (depuis le cookie).
 * Retourne null si pas connecté.
 */
export const getAuthUser = cache(async () => {
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
 * 👤 Récupère l'utilisateur OU redirige vers /login.
 * Utilisable dans les layouts/pages protégées.
 */
export async function requireUser(redirectTo: string = "/login"): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect(redirectTo as any);
  return user;
}

/**
 * 🛡️ Récupère l'utilisateur OU throw s'il n'a pas la permission.
 * Utilisable dans les Server Actions.
 */
export async function requirePermission(action: Action): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
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
  if (!user) throw new Error("Unauthorized");
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
