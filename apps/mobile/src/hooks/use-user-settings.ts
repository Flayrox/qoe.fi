// =====================================================================
// ⚙️ useUserSettings — préférences serveur /v1/settings/preferences
// =====================================================================
// Source unique pour les réglages d'expérience/lecture côté client :
//   - useReduceMotion()   → gate les animations décoratives
//   - useHighContrast()   → booste le contraste des couleurs
//   - useAutoplayMedia()  → lecture automatique des médias
// Les valeurs par défaut correspondent aux défauts du backend Go
// (autoplayMedia: true, reduceMotion: false, highContrast: false).
// La requête est partagée (cache React Query, staleTime 60s) avec
// l'écran Apparence — un patch côté réglages invalide ce cache.
// =====================================================================

import { useQuery } from '@tanstack/react-query';

import { apiClient } from '@/lib/api';

export const USER_SETTINGS_QUERY_KEY = ['settings', 'user-settings'] as const;

export function useUserSettings() {
  return useQuery({
    queryKey: USER_SETTINGS_QUERY_KEY,
    queryFn: async () => {
      const res = await apiClient.getUserSettings();
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    staleTime: 60_000,
  });
}

/** Préférence « Réduire les animations » (défaut : false). */
export function useReduceMotion(): boolean {
  const { data } = useUserSettings();
  return data?.reduceMotion ?? false;
}

/** Préférence « Contraste renforcé » (défaut : false). */
export function useHighContrast(): boolean {
  const { data } = useUserSettings();
  return data?.highContrast ?? false;
}

/** Préférence « Lecture automatique des médias » (défaut : true). */
export function useAutoplayMedia(): boolean {
  const { data } = useUserSettings();
  return data?.autoplayMedia ?? true;
}
