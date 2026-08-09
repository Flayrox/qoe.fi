import { useQuery } from '@tanstack/react-query';

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

export const recommendationKeys = {
  all: ['recommendations'] as const,
  creator: (recommenderId: string) => [...recommendationKeys.all, 'creator', recommenderId] as const,
};

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
  });
}
