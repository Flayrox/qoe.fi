import { useInfiniteQuery } from '@tanstack/react-query';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { apiClient } from '@/lib/api';
import { t } from '@/lib/i18n';
import type { BookmarkItem, MyHighlight } from '@qoe/sdk/mobile';

// =====================================================================
// 📚 LibraryScreen — Bibliothèque (sauvegardés + surlignages)
// =====================================================================
// Deux segments :
//   - « Sauvegardés » : articles bookmarkés (GET /v1/bookmarks) — pagination
//     par offset (FlashList infinie).
//   - « Surlignages » : mes surlignages d'articles (GET /v1/me/highlights).
// Tap sur un item → ouvre l'article (route /article/[slug]).
// =====================================================================

type Segment = 'bookmarks' | 'highlights';

export function LibraryScreen() {
  const theme = useTheme();
  const [segment, setSegment] = useState<Segment>('bookmarks');

  // ── Bookmarks (offset pagination) ────────────────────────────
  const bookmarks = useInfiniteQuery({
    queryKey: ['library', 'bookmarks'],
    queryFn: async ({ pageParam }: { pageParam: number }) => {
      const res = await apiClient.getBookmarks({ offset: pageParam, limit: 20 });
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    initialPageParam: 0 as number,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === 20 ? allPages.length * 20 : undefined,
  });

  // ── Mes surlignages (offset pagination) ──────────────────────
  const highlights = useInfiniteQuery({
    queryKey: ['library', 'highlights'],
    queryFn: async ({ pageParam }: { pageParam: number }) => {
      const res = await apiClient.getMyHighlights({ offset: pageParam, limit: 20 });
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    initialPageParam: 0 as number,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === 20 ? allPages.length * 20 : undefined,
  });

  const bookmarksItems = useMemo(
    () => bookmarks.data?.pages.flatMap((p) => p ?? []) ?? [],
    [bookmarks.data]
  );
  const highlightsItems = useMemo(
    () => highlights.data?.pages.flatMap((p) => p ?? []) ?? [],
    [highlights.data]
  );
  const items = segment === 'bookmarks' ? bookmarksItems : highlightsItems;
  // Query active (pour les états isPending/isError/refetch du rendu).
  const query = segment === 'bookmarks' ? bookmarks : highlights;

  const onEndReached = useCallback(() => {
    if (segment === 'bookmarks' ? bookmarks.hasNextPage : highlights.hasNextPage) {
      const q = segment === 'bookmarks' ? bookmarks : highlights;
      if (!q.isFetching) void q.fetchNextPage();
    }
  }, [segment, bookmarks, highlights]);

  // Header : les deux segments.
  const header = (
    <View style={styles.segmentRow}>
      {(
        [
          { key: 'bookmarks', label: t('library.bookmarks', 'Sauvegardés') },
          { key: 'highlights', label: t('library.highlights', 'Surlignages') },
        ] as const
      ).map((seg) => {
        const active = segment === seg.key;
        return (
          <Pressable
            key={seg.key}
            onPress={() => setSegment(seg.key)}
            style={({ pressed }) => [
              styles.segment,
              active && { backgroundColor: theme.primary },
              pressed && styles.pressed,
            ]}
          >
            <ThemedText
              type="smallBold"
              style={{ color: active ? '#ffffff' : theme.textSecondary }}
            >
              {seg.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );

  if (query.isPending) {
    return (
      <SafeAreaView style={styles.center}>
        {header}
        <ActivityIndicator color={theme.text} />
      </SafeAreaView>
    );
  }

  if (query.isError) {
    return (
      <SafeAreaView style={styles.center}>
        {header}
        <ThemedText type="small">
          {t('library.error', 'Impossible de charger la bibliothèque')}
        </ThemedText>
        <Pressable onPress={() => void query.refetch()}>
          <ThemedText type="small" style={{ color: theme.primary }}>
            {t('common.retry', 'Réessayer')}
          </ThemedText>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <FlashList<BookmarkItem | MyHighlight>
          data={items}
          keyExtractor={(item) => ('bookmarkId' in item ? item.bookmarkId : item.id)}
          renderItem={({ item }) =>
            'bookmarkId' in item ? <BookmarkRow item={item} /> : <HighlightRow item={item} />
          }
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          refreshing={query.isRefetching}
          onRefresh={() => void query.refetch()}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <ThemedView type="backgroundElement" style={styles.empty}>
              <ThemedText type="small">
                {segment === 'bookmarks'
                  ? t('library.no_bookmarks', 'Aucun article sauvegardé')
                  : t('library.no_highlights', 'Aucun surlignage pour le moment')}
              </ThemedText>
            </ThemedView>
          }
          ListFooterComponent={
            query.hasNextPage ? (
              <ActivityIndicator color={theme.text} style={styles.footer} />
            ) : null
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={styles.content}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

function BookmarkRow({ item }: { item: BookmarkItem }) {
  const theme = useTheme();
  const open = () =>
    router.push({
      pathname: '/article/[slug]',
      params: { slug: item.articleSlug, publicationId: item.publicationId },
    });
  return (
    <Pressable onPress={open} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <ThemedView type="card" style={styles.rowCard}>
        <ThemedText type="small" style={{ color: theme.textSecondary }}>
          {item.publicationName}
        </ThemedText>
        <ThemedText numberOfLines={2} style={styles.rowTitle}>
          {item.articleTitle}
        </ThemedText>
        <ThemedText type="small" style={{ color: theme.textSecondary }}>
          {item.readingTime} min{item.isPremium ? ' · 🔒' : ''}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

function HighlightRow({ item }: { item: MyHighlight }) {
  const theme = useTheme();
  const open = () =>
    router.push({
      pathname: '/article/[slug]',
      params: { slug: item.articleSlug, publicationId: item.publicationId },
    });
  return (
    <Pressable onPress={open} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <ThemedView type="card" style={styles.rowCard}>
        <ThemedText type="small" style={{ color: theme.textSecondary }}>
          {item.publicationName} · {item.articleTitle}
        </ThemedText>
        <ThemedText numberOfLines={3} style={styles.highlightText}>
          « {item.text} »
        </ThemedText>
        {item.note ? (
          <ThemedText type="small" numberOfLines={2} style={{ color: theme.primary }}>
            💬 {item.note}
          </ThemedText>
        ) : null}
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
  content: {
    padding: Spacing.three,
    gap: Spacing.two,
    flexGrow: 1,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingBottom: Spacing.two,
  },
  segment: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  pressed: { opacity: 0.7 },
  row: { borderRadius: Spacing.three },
  rowPressed: { opacity: 0.7 },
  rowCard: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.one,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 21,
  },
  highlightText: {
    fontSize: 15,
    lineHeight: 21,
    fontStyle: 'italic',
  },
  empty: {
    padding: Spacing.four,
    borderRadius: Spacing.three,
    alignItems: 'center',
  },
  footer: { paddingVertical: Spacing.three },
  separator: { height: Spacing.two },
});
