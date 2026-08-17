// =====================================================================
// 🧭 ExploreScreen — Recherche + découverte (remplace le template Expo)
// =====================================================================
// Champ de recherche (debounce) sur /search/articles (Meilisearch) +
// suggestions/états vide. Résultats → ouverture de l'article.
// =====================================================================

import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SymbolView } from 'expo-symbols';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { EmptyState } from '@/components/ui/empty-state';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { apiClient } from '@/lib/api';
import { t } from '@/lib/i18n';

type Hit = {
  id?: string;
  title?: string;
  slug?: string;
  subdomain?: string;
  publicationName?: string;
};

export function ExploreScreen() {
  const theme = useTheme();
  const [input, setInput] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const id = setTimeout(() => setDebounced(input.trim()), 300);
    return () => clearTimeout(id);
  }, [input]);

  const { data, isPending, isError, refetch, isFetching } = useQuery({
    queryKey: ['search', 'articles', debounced],
    queryFn: async () => {
      const res = await apiClient.searchArticles(debounced);
      if (!res.ok) throw new Error(res.error);
      return res.data.hits as Hit[];
    },
    enabled: debounced.length > 0,
  });

  const hits = data ?? [];

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <View style={styles.header}>
          <ThemedText style={styles.title}>{t('explore.title', 'Explorer')}</ThemedText>
        </View>

        {/* Champ de recherche */}
        <View style={[styles.searchBox, { backgroundColor: theme.backgroundElement }]}>
          <SymbolView
            name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }}
            size={16}
            tintColor={theme.textSecondary}
            weight="regular"
          />
          <TextInput
            style={[styles.input, { color: theme.text }]}
            value={input}
            onChangeText={setInput}
            placeholder={t('explore.placeholder', 'Rechercher des articles…')}
            placeholderTextColor={theme.textSecondary}
            autoCorrect={false}
            returnKeyType="search"
          />
          {isFetching ? <ActivityIndicator size="small" color={theme.textSecondary} /> : null}
        </View>

        {/* Résultats */}
        {debounced.length === 0 ? (
          <EmptyState
            icon={{ ios: 'magnifyingglass', android: 'search', web: 'search' }}
            message={t('explore.hint', 'Recherchez des articles publiés sur Qoe.')}
          />
        ) : isPending ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.text} />
          </View>
        ) : isError ? (
          <EmptyState
            icon={{ ios: 'exclamationmark.triangle', android: 'warning', web: 'warning' }}
            message={t('explore.error', 'Recherche indisponible')}
            button={{
              label: t('common.retry', 'Réessayer'),
              text: t('common.retry', 'Réessayer'),
              onPress: () => void refetch(),
            }}
          />
        ) : hits.length === 0 ? (
          <EmptyState
            icon={{ ios: 'doc.text.magnifyingglass', android: 'search_off', web: 'search_off' }}
            message={t('explore.no_results', 'Aucun article trouvé pour cette recherche.')}
          />
        ) : (
          <View style={styles.results}>
            {hits.map((hit) => (
              <Pressable
                key={hit.id ?? hit.slug ?? hit.title}
                onPress={() =>
                  router.push({
                    pathname: '/article/[slug]',
                    params: { slug: hit.slug ?? '', publicationId: hit.subdomain ?? '' },
                  })
                }
                style={({ pressed }) => [
                  styles.result,
                  { borderBottomColor: theme.border },
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.resultBody}>
                  <ThemedText type="smallBold" numberOfLines={2}>
                    {hit.title ?? 'Article'}
                  </ThemedText>
                  {hit.publicationName || hit.subdomain ? (
                    <ThemedText
                      type="small"
                      style={{ color: theme.textSecondary }}
                      numberOfLines={1}
                    >
                      {hit.publicationName ?? hit.subdomain}
                    </ThemedText>
                  ) : null}
                </View>
                <SymbolView
                  name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
                  size={14}
                  tintColor={theme.textSecondary}
                  weight="regular"
                />
              </Pressable>
            ))}
          </View>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  header: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginHorizontal: Spacing.three,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    height: 44,
  },
  input: {
    flex: 1,
    fontSize: 15,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  results: {
    marginTop: Spacing.two,
  },
  result: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  resultBody: {
    flex: 1,
    gap: 2,
  },
  pressed: {
    opacity: 0.6,
  },
});
