import { useQuery } from '@tanstack/react-query';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { getApiBaseUrl } from '@/lib/api';

/**
 * Carte de démonstration : prouve que l'app mobile atteint l'API Go
 * (apps/api-go). On sonde `/healthz` (public) plutôt que le feed, qui
 * exige un JWT — la carte reflète la connectivité, pas l'auth.
 */
export function ApiStatus() {
  const { isPending, isError } = useQuery({
    queryKey: ['api', 'health'],
    queryFn: async () => {
      const res = await fetch(`${getApiBaseUrl()}/healthz`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      return res.json() as Promise<{ status: string }>;
    },
  });

  let label: string;
  if (isPending) {
    label = 'API qoe.fi · connexion…';
  } else if (isError) {
    label = 'API qoe.fi · indisponible';
  } else {
    label = 'API qoe.fi · connectée';
  }

  return (
    <ThemedView type="backgroundElement" style={styles.container}>
      <ThemedText type="small">{label}</ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
  },
});
