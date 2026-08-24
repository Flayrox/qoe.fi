// =====================================================================
// 🤝 useRecommendations — Créateurs recommandés (style Substack)
// =====================================================================
// Récupère les créateurs recommandés pour un site locataire (tenant).
// Appelle une route Next.js locale `/api/recommendations` (pas l'API Go) —
// ⚠️ à garder en tête si le mobile veut la même donnée : il faudra un
//    endpoint Go équivalent.
// =====================================================================

import { useQuery } from '@tanstack/react-query';
import { recommendationKeys } from '../query-keys';

export interface CreatorRecommendation {
  id: string;
  recommenderId: string;
  recommendedId: string;
  description?: string | null;
  createdAt: string;
  recommended: {
    id: string;
    name?: string | null;
    username?: string | null;
    subdomain?: string | null;
    customDomain?: string | null;
    heroText?: string | null;
    logoUrl?: string | null;
    accentColor?: string | null;
  };
}

/**
 * Hook for fetching Substack-style recommended creators for a tenant site.
 */
export function useRecommendations(recommenderId: string) {
  return useQuery<CreatorRecommendation[]>({
    queryKey: recommendationKeys.creator(recommenderId),
    queryFn: async () => {
      if (!recommenderId) return [];
      const response = await fetch(`/api/recommendations?recommenderId=${recommenderId}`);
      if (!response.ok) return [];
      const data = await response.json();
      return data.data || [];
    },
    enabled: Boolean(recommenderId),
    staleTime: 10 * 60 * 1000, // 10 minutes cache
    gcTime: 15 * 60 * 1000,
  });
}
