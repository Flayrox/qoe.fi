import {
  useInfiniteFeed,
  type ApiResponse,
  type FeedFetcherFn,
  type FeedSlice,
} from '@qoe/api-client/mobile';
import { useInfiniteQuery } from '@tanstack/react-query';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ArticleCard } from '@/components/article/article-card';
import { useDrawer } from '@/components/drawer/drawer-context';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FAB } from '@/components/ui/fab';
import { PostFeedLoadingPlaceholder } from '@/components/ui/skeleton';
import { ThoughtFeedSlice } from '@/components/thought/thought-feed-slice';
import { FeedEmptyState, FeedEndOfFeed, FeedErrorState } from '@/features/feed/feed-states';
import { Spacing } from '@/constants/theme';
import { useRealtimeFeedPill } from '@/hooks/use-realtime-feed-pill';
import { useTheme } from '@/hooks/use-theme';
import { apiClient } from '@/lib/api';
import { t } from '@/lib/i18n';
import type { FeedArticle } from '@qoe/api-client/mobile';

// =====================================================================
// 🍞 FeedScreen — Le feed principal (onglet « Feed »)
// =====================================================================
// Consomme `/v1/feed` (pensées → FeedSlice) ET `/v1/feed/articles`
// (articles récents → FeedArticle), puis **intercale** les deux par date
// (même logique que l'écran principal web : ArticleCard + ThoughtFeedSlice).
// Infini (FlashList) + pull-to-refresh + pill temps réel « X nouvelles
// pensées » (polling Go, insertion en tête de liste).
// =====================================================================

// Adapte le client universel au contrat du hook :
// FeedResult → ApiResponse<FeedSlice[]>.
const fetcher: FeedFetcherFn<FeedSlice> = async ({ cursor, limit }) => {
  const res = await apiClient.getFeed({ cursor: cursor ?? undefined, limit });
  if (!res.ok) {
    throw new Error(res.error);
  }
  const response: ApiResponse<FeedSlice[]> = {
    data: res.data.items,
    meta: { cursor: res.data.nextCursor, hasMore: res.data.hasMore },
  };
  return response;
};

type FeedRow = { kind: 'thought'; slice: FeedSlice } | { kind: 'article'; article: FeedArticle };

export function FeedScreen() {
  const theme = useTheme();
  const { openDrawer } = useDrawer();

  // ── Pensées (infini) ─────────────────────────────────────────
  const {
    data,
    hasNextPage,
    isFetching,
    fetchNextPage,
    refetch,
    isPending,
    isError,
    isRefetching,
  } = useInfiniteFeed<FeedSlice>({ limit: 20, fetcher });

  // ── Articles récents (infini) ────────────────────────────────
  const articles = useInfiniteQuery({
    queryKey: ['feed', 'articles'],
    queryFn: async ({ pageParam }: { pageParam: number }) => {
      const res = await apiClient.getFeedArticles({ cursor: pageParam?.toString(), limit: 20 });
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    initialPageParam: 0 as number,
    getNextPageParam: (lastPage, allPages) => (lastPage.hasMore ? allPages.length * 20 : undefined),
  });

  const thoughts = useMemo(() => data?.pages.flatMap((page) => page?.data ?? []) ?? [], [data]);
  const articleItems = useMemo(
    () => articles.data?.pages.flatMap((page) => page?.items ?? []) ?? [],
    [articles.data]
  );

  // ── Intercalage pensées + articles par date (comme le web) ──
  const rows = useMemo<FeedRow[]>(() => {
    const thoughtRows: Array<{ ts: number; row: FeedRow }> = thoughts.map((slice) => ({
      ts: new Date(slice.targetPost?.createdAt || 0).getTime(),
      row: { kind: 'thought', slice },
    }));
    const articleRows: Array<{ ts: number; row: FeedRow }> = articleItems.map((article) => ({
      ts: new Date(article.createdAt).getTime(),
      row: { kind: 'article', article },
    }));
    return [...thoughtRows, ...articleRows].sort((a, b) => b.ts - a.ts).map((entry) => entry.row);
  }, [thoughts, articleItems]);

  // ── Pill temps réel ──────────────────────────────────────────
  const visibleIds = useMemo(
    () => rows.filter((r) => r.kind === 'thought').map((r) => r.slice.targetPost?.id || r.slice.id),
    [rows]
  );
  const { unreadCount, unread, flush } = useRealtimeFeedPill({ visibleIds });

  const onEndReached = useCallback(() => {
    if (hasNextPage && !isFetching && !isRefetching) {
      void fetchNextPage();
    }
  }, [hasNextPage, isFetching, isRefetching, fetchNextPage]);

  const onRefresh = useCallback(() => {
    void refetch();
    void articles.refetch();
  }, [refetch, articles]);

  // Insère les nouvelles pensées en tête de liste.
  const flushNew = useCallback(() => {
    flush();
  }, [flush]);

  const displayedRows = useMemo<FeedRow[]>(() => {
    if (unread.length === 0) return rows;
    const unreadRows: FeedRow[] = unread.map((slice) => ({ kind: 'thought', slice }));
    return [...unreadRows, ...rows];
  }, [rows, unread]);

  if (isPending) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView edges={['top']} style={styles.safeArea}>
          <PostFeedLoadingPlaceholder />
        </SafeAreaView>
      </ThemedView>
    );
  }

  // Ne remplace le feed par une erreur plein écran que si on n'a AUCUNE
  // donnée (sinon on garde le contenu en cache même si un refetch échoue).
  if (isError && !data) {
    return (
      <SafeAreaView style={styles.center}>
        <FeedErrorState
          message={t('feed.error', 'Impossible de charger le feed')}
          onRetry={() => void onRefresh()}
        />
      </SafeAreaView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <FlashList
          data={displayedRows}
          keyExtractor={(row) => (row.kind === 'thought' ? row.slice.id : row.article.id)}
          renderItem={({ item }) =>
            item.kind === 'thought' ? (
              <ThoughtFeedSlice slice={item.slice} />
            ) : (
              <ArticleCard article={item.article} />
            )
          }
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          refreshing={isRefetching}
          onRefresh={onRefresh}
          ListHeaderComponent={
            <View style={styles.header}>
              <Pressable
                onPress={openDrawer}
                style={({ pressed }) => [
                  styles.menuButton,
                  // Appui → fond brand (vermillon) pour le bouton menu.
                  pressed && {
                    backgroundColor: theme.primary,
                    borderRadius: Spacing.two,
                  },
                ]}
                accessibilityLabel={t('sidebar.open', 'Ouvrir le menu')}
              >
                {({ pressed }) => (
                  <ThemedText
                    style={[styles.menuGlyph, { color: pressed ? '#ffffff' : theme.text }]}
                  >
                    ☰
                  </ThemedText>
                )}
              </Pressable>
              <ThemedText style={styles.headerTitle}>{t('feed.title', 'Pour vous')}</ThemedText>
              <View style={styles.headerSpacer} />

              {/* Notifications */}
              <Pressable
                onPress={() => router.push('/notifications')}
                style={({ pressed }) => [
                  styles.composeButton,
                  pressed && { backgroundColor: theme.primary, borderRadius: 999 },
                ]}
                accessibilityLabel={t('notif.title', 'Notifications')}
              >
                {({ pressed }) => (
                  <ThemedText
                    type="smallBold"
                    style={{ color: pressed ? '#ffffff' : theme.textSecondary }}
                  >
                    🔔
                  </ThemedText>
                )}
              </Pressable>
            </View>
          }
          ListEmptyComponent={<FeedEmptyState onExplore={() => router.push('/(tabs)/explore')} />}
          ListFooterComponent={
            hasNextPage ? (
              <ActivityIndicator color={theme.text} style={styles.footer} />
            ) : rows.length > 0 ? (
              <FeedEndOfFeed />
            ) : null
          }
          contentContainerStyle={styles.content}
        />

        {/* Pill « X nouvelles pensées » (temps réel) */}
        {unreadCount > 0 ? (
          <Pressable
            onPress={flushNew}
            style={({ pressed }) => [styles.pillWrap, pressed && styles.pillPressed]}
            accessibilityLabel={t('feed.new_thoughts', 'Nouvelles pensées')}
          >
            <View style={[styles.pill, { backgroundColor: theme.primary }]}>
              <ThemedText type="smallBold" style={styles.pillText}>
                ↑ {unreadCount}{' '}
                {unreadCount === 1
                  ? t('feed.new_thought', 'nouvelle pensée')
                  : t('feed.new_thoughts', 'nouvelles pensées')}
              </ThemedText>
            </View>
          </Pressable>
        ) : null}

        {/* Bouton composer flottant (parité Bluesky « New Post ») */}
        <FAB onPress={() => router.push('/compose')} label={t('compose.new', 'Nouvelle pensée')} />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
  content: {
    paddingBottom: Spacing.four,
    flexGrow: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  menuButton: {
    paddingVertical: Spacing.one,
    paddingRight: Spacing.one,
  },
  menuGlyph: {
    fontSize: 22,
    lineHeight: 24,
  },
  headerSpacer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  composeButton: {
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    paddingVertical: Spacing.three,
  },
  // Pill temps réel — flottante en haut du feed.
  pillWrap: {
    position: 'absolute',
    top: Spacing.five,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  pill: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  pillPressed: {
    opacity: 0.85,
  },
  pillText: {
    color: '#ffffff',
  },
});
