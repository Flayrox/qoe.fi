'use server';

// =====================================================================
// 🔐 actions/auth — Server Actions d'authentification (web uniquement)
// =====================================================================
// ⚠️ Fichier serveur : importe @qoe/supabase/server (cookies SSR) et
//    @qoe/db/client (Prisma). Il N'EST PAS exposé via @qoe/api-client/mobile
//    — sur mobile, l'auth passe par le client Supabase natif (AsyncStorage,
//    cf. apps/mobile/src/lib/supabase.ts) et le JWT est envoyé en header
//    `Authorization: Bearer` par le QoeApiClient.
//
// - getCurrentUserAction : résout l'utilisateur connecté (session Supabase)
//   puis charge son profil enrichi depuis la DB (rôle, onboarding,
//   publication associée). Retourne `null` si non connecté.
// - logoutAction : invalide la session Supabase côté serveur (cookie).
// =====================================================================

import { createClient } from '@qoe/supabase/server';
import { prisma } from '@qoe/db/client';

export async function getCurrentUserAction() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      logoUrl: true,
      hasCompletedOnboarding: true,
      publication: {
        select: {
          subdomain: true,
          customDomain: true,
          slug: true,
        },
      },
    },
  });

  return dbUser;
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return { success: true };
}
