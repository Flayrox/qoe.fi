import { cache } from 'react';
import { goFetch } from '@qoe/api-client/actions/utils/go-client';

// GET /v1/me — profil lecteur Go (identité + compteurs bibliothèque).
export interface MeProfile {
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
  createdAt: string;
  followsCount: number;
  mutedWordsCount: number;
}

export const getRequestDbUser = cache(async (id: string) => {
  // Go (backend-of-record, requis en Phase 3) : GET /v1/me (le JWT identifie
  // l'utilisateur — le paramètre id reste pour la signature cache()).
  const profile = await goFetch<MeProfile>('/v1/me');
  return {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    role: profile.role,
    logoUrl: profile.logoUrl,
    username: profile.username,
    walletBalanceCents: profile.walletBalanceCents,
    onboardingText: profile.onboardingText,
    hasCompletedOnboarding: profile.hasCompletedOnboarding,
  };
});

// ⚠️ `cache()` (React) et non `unstable_cache()` : les fonctions appellent
// goFetch → createClient (@qoe/supabase/server) → cookies(), une Dynamic API
// interdite dans le scope unstable_cache (Next 16). cache() déduplique par
// requête sans cette restriction — le revalidate basé sur le temps n'a pas
// d'équivalent ici, donc ces widgets sont re-fetchés à chaque rendu (léger).
export const getCachedSystemConfig = cache(async () => {
  return goFetch<Record<string, string>>('/v1/home/config');
});

export const getCachedTrends = cache(async () => {
  return goFetch<Array<{ id: string; hashtag: string; count: number }>>('/v1/home/trends?limit=5');
});

export const getCachedPromos = cache(async () => {
  return goFetch<
    Array<{
      id: string;
      title: string;
      description: string;
      ctaText: string | null;
      ctaUrl: string | null;
      imageUrl: string | null;
      isActive: boolean;
    }>
  >('/v1/home/promos?limit=3');
});
