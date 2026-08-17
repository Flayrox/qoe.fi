// =====================================================================
// 🔍 SearchScreen — Écran de recherche universelle
// =====================================================================
// Recherche d'articles, créateurs et pensées avec filtres instantanés,
// debounce et suggestions d'exploration.
// =====================================================================

import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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

type SearchFilter = 'all' | 'articles' | 'creators' | 'thoughts';

export function SearchScreen() {
  const theme = useTheme();
  const [input, setInput] = useState('');
  const [debounced, setDebounced] = useState('');
  const [activeFilter, setActiveFilter] = useState<SearchFilter>('all');

  useEffect(() => {
    const id = setTimeout(() => setDebounced(input.trim()), 300);
    return () => clearTimeout(id);
  }, [input]);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['search', 'articles', debounced],
    queryFn: async () => {
      const res = await apiClient.searchArticles(debounced);
      if (!res.ok) throw new Error(res.error);
      return res.data.hits as Hit[];
    },
    enabled: debounced.length > 0,
  });

  const hits = data ?? [];

  const filters: { id: SearchFilter; label: string }[] = [
    { id: 'all', label: t('search.filter_all', 'Tout') },
    { id: 'articles', label: t('search.filter_articles', 'Articles') },
    { id: 'creators', label: t('search.filter_creators', 'Créateurs') },
    { id: 'thoughts', label: t('search.filter_thoughts', 'Pensées') },
  ];

  const suggestions = [
    'Intelligence Artificielle',
    'Design System',
    'Tech & Web3',
    'Productivité',
    'Journalisme indépendant',
  ];

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        {/* ─── Barre de Recherche ─── */}
        <View style={styles.searchHeader}>
          <View style={[styles.searchBar, { backgroundColor: theme.backgroundElement }]}>
            <SymbolView
              name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }}
              size={18}
              tintColor={theme.textSecondary}
            />
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder={t('search.placeholder', 'Rechercher sur Qoe…')}
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { color: theme.text }]}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
            {input.length > 0 ? (
              <Pressable onPress={() => setInput('')} hitSlop={6}>
                <SymbolView
                  name={{ ios: 'xmark.circle.fill', android: 'cancel', web: 'cancel' }}
                  size={18}
                  tintColor={theme.textSecondary}
                />
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* ─── Filtres horizontaux ─── */}
        <View style={styles.filterRow}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterScroll}
          >
            {filters.map((f) => {
              const active = activeFilter === f.id;
              return (
                <Pressable
                  key={f.id}
                  onPress={() => setActiveFilter(f.id)}
                  style={[
                    styles.filterChip,
                    {
                      backgroundColor: active ? theme.text : theme.backgroundElement,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <ThemedText
                    style={[
                      styles.filterChipText,
                      { color: active ? theme.background : theme.textSecondary },
                      active && styles.filterChipTextActive,
                    ]}
                  >
                    {f.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* ─── Résultats / Suggestions ─── */}
        {debounced.length === 0 ? (
          <ScrollView contentContainerStyle={styles.suggestionsContainer}>
            <ThemedText
              type="smallBold"
              style={[styles.sectionTitle, { color: theme.textSecondary }]}
            >
              {t('search.trending_topics', 'Tendances et thèmes populaires')}
            </ThemedText>
            <View style={styles.tagsCloud}>
              {suggestions.map((s, idx) => (
                <Pressable
                  key={idx}
                  onPress={() => setInput(s)}
                  style={({ pressed }) => [
                    styles.tagChip,
                    {
                      backgroundColor: theme.backgroundElement,
                      borderColor: theme.border,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  <ThemedText style={styles.tagChipText}># {s}</ThemedText>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        ) : isPending ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.text} />
          </View>
        ) : isError ? (
          <View style={styles.center}>
            <EmptyState
              icon={{ ios: 'exclamationmark.triangle', android: 'error_outline', web: 'error' }}
              message={t('search.error', 'Une erreur est survenue lors de la recherche.')}
              button={{
                label: t('common.retry', 'Réessayer'),
                text: t('common.retry', 'Réessayer'),
                onPress: () => void refetch(),
              }}
            />
          </View>
        ) : hits.length === 0 ? (
          <View style={styles.center}>
            <EmptyState
              icon={{ ios: 'magnifyingglass', android: 'search', web: 'search' }}
              message={t('search.no_results', 'Aucun résultat pour « %{query} »', {
                query: debounced,
              })}
            />
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.resultsList}>
            {hits.map((h, i) => (
              <Pressable
                key={h.id || i}
                onPress={() => {
                  if (h.slug) {
                    router.push({ pathname: '/article/[slug]', params: { slug: h.slug } });
                  }
                }}
                style={({ pressed }) => [
                  styles.hitCard,
                  {
                    backgroundColor: theme.backgroundElement,
                    borderColor: theme.border,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <ThemedText style={styles.hitTitle} numberOfLines={2}>
                  {h.title || 'Sans titre'}
                </ThemedText>
                {h.publicationName ? (
                  <ThemedText type="small" style={[styles.hitMeta, { color: theme.textSecondary }]}>
                    {h.publicationName}
                  </ThemedText>
                ) : null}
              </Pressable>
            ))}
          </ScrollView>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  searchHeader: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.one,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 21,
    gap: 8,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 0,
  },
  filterRow: {
    paddingVertical: Spacing.one,
  },
  filterScroll: {
    paddingHorizontal: Spacing.three,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  filterChipTextActive: {
    fontWeight: '700',
  },
  suggestionsContainer: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  sectionTitle: {
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  tagsCloud: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tagChipText: {
    fontSize: 14,
    fontWeight: '600',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  resultsList: {
    padding: Spacing.three,
    gap: 10,
  },
  hitCard: {
    padding: Spacing.three,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  hitTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  hitMeta: {
    fontSize: 13,
  },
});
