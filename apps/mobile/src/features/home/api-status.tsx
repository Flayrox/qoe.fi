import { useQuery } from '@tanstack/react-query';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { apiClient } from '@/lib/api';

/**
 * Carte de démonstration : prouve que l'app mobile parle à l'API qoe.fi
 * via le client partagé (@qoe/api-client) + TanStack Query.
 */
export function ApiStatus() {
  const { data, isPending, isError } = useQuery({
    queryKey: ['api', 'feed'],
    queryFn: async () => {
      const res = await apiClient.getFeed({ limit: 1 });
      if (!res.ok) {
        throw new Error(res.error);
      }
      return res.data;
    },
  });

  let label: string;
  if (isPending) {
    label = 'API qoe.fi · connexion…';
  } else if (isError) {
    label = 'API qoe.fi · indisponible';
  } else {
    const count = data.items.length;
    label = `API qoe.fi · connectée${count > 0 ? ` · ${count} pensée(s)` : ''}`;
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
