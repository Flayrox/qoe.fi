'use server';

// =====================================================================
// 🔐 actions/auth — Server Actions d'authentification (web uniquement)
// =====================================================================
// ⚠️ Fichier serveur : importe @qoe/supabase/server (cookies SSR). Il N'EST
//    PAS exposé via @qoe/api-client/mobile — sur mobile, l'auth passe par le
//    client Supabase natif (AsyncStorage, cf. apps/mobile/src/lib/supabase.ts)
//    et le JWT est envoyé en header `Authorization: Bearer` par le QoeApiClient.
//
// - getCurrentUserAction : résout l'utilisateur connecté (session Supabase)
//   puis charge son profil enrichi depuis la DB (rôle, onboarding,
//   publication associée). Retourne `null` si non connecté.
// - logoutAction : invalide la session Supabase côté serveur (cookie).
// =====================================================================

import { createClient } from '@qoe/supabase/server';
import { goFetch } from '../utils/go-client';

// Contrat GET /v1/me (module users Go) — profil lecteur complet.
export interface MeProfileDTO {
  id: string;
  email: string;
  name: string | null;
  username: string | null;
  logoUrl: string | null;
  role: string;
  hasCompletedOnboarding: boolean;
  followsCount: number;
  mutedWordsCount: number;
  createdAt: string;
}

export async function getCurrentUserAction() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // Go-only (backend-of-record) : GET /v1/me — profil lecteur complet.
  const profile = await goFetch<MeProfileDTO>('/v1/me');
  return {
    id: profile.id,
    email: profile.email,
    name: profile.name,
    role: profile.role,
    logoUrl: profile.logoUrl,
    hasCompletedOnboarding: profile.hasCompletedOnboarding,
    publication: null,
  };
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return { success: true };
}
