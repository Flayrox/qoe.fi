// =====================================================================
// 👤 useMe — Identité de l'utilisateur courant (id + username).
// =====================================================================
// Récupère GET /v1/users/me et le met en cache (staleTime long). Sert à
// déterminer « ce post est-il le mien ? » pour les menus/suppressions.
// =====================================================================

import { useQuery } from '@tanstack/react-query';

import { apiClient } from '@/lib/api';

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        const res = await apiClient.getMyProfile();
        if (!res.ok) {
          console.warn('[useMe] getMyProfile failed:', res.error);
          return null;
        }
        return res.data;
      } catch (err) {
        console.error('[useMe] error:', err);
        return null;
      }
    },
    staleTime: 60_000,
  });
}
