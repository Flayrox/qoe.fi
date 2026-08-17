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
      const res = await apiClient.getMyProfile();
      if (!res.ok) return null;
      return res.data;
    },
    staleTime: 5 * 60_000,
  });
}
