import {
  useInfiniteFeed,
  type ApiResponse,
  type FeedFetcherFn,
  type FeedSlice,
} from '@qoe/api-client/mobile';
import { useInfiniteQuery } from '@tanstack/react-query';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ArticleCard } from '@/components/article/article-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
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
// (articles récents → FeedArticle), puis **intercale** les deux par date.
// Infini (FlashList) + pull-to-refresh + pill temps réel « X nouvelles pensées »
// + Header rétractable fluide au scroll (Collapsing Header).
// =====================================================================

type FeedRow = { kind: 'thought'; slice: FeedSlice } | { kind: 'article'; article: FeedArticle };

type FeedTab = 'for_you' | 'following';

const HEADER_HEIGHT = 48;

export function FeedScreen() {
  const theme = useTheme();
  const [tab, setTab] = useState<FeedTab>('for_you');

  // Adapte le client universel au contrat du hook, selon l'onglet :
  const fetcher: FeedFetcherFn<FeedSlice> = useCallback(
    async ({ cursor, limit }) => {
      const res =
        tab === 'following'
          ? await apiClient.getFeed({ cursor: cursor ?? undefined, limit })
          : await apiClient.getTrendingFeed({ cursor: cursor ?? undefined, limit });
      if (!res.ok) {
        throw new Error(res.error);
      }
      const response: ApiResponse<FeedSlice[]> = {
        data: res.data.items,
        meta: { cursor: res.data.nextCursor, hasMore: res.data.hasMore },
      };
      return response;
    },
    [tab]
  );

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
  } = useInfiniteFeed<FeedSlice>({
    type: tab === 'following' ? 'following' : 'for-you',
    limit: 20,
    fetcher,
  });

  // ── Articles récents (infini, onglet « Pour vous » uniquement) ─
  const articles = useInfiniteQuery({
    queryKey: ['feed', 'articles'],
    queryFn: async ({ pageParam }: { pageParam: number }) => {
      const res = await apiClient.getFeedArticles({ cursor: pageParam?.toString(), limit: 20 });
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    initialPageParam: 0 as number,
    getNextPageParam: (lastPage, allPages) => (lastPage.hasMore ? allPages.length * 20 : undefined),
    enabled: tab === 'for_you',
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

  const onRefresh = useCallback(async () => {
    await Promise.all([refetch(), tab === 'for_you' ? articles.refetch() : Promise.resolve()]);
  }, [refetch, articles, tab]);

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
        {/* ─── Liste FlashList fluide ─── */}
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
          ItemSeparatorComponent={() => <View style={{ height: Spacing.two }} />}
          getItemType={(item) => item.kind}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          refreshing={isRefetching}
          onRefresh={onRefresh}
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
    paddingTop: Spacing.two,
    paddingBottom: 110,
    flexGrow: 1,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: HEADER_HEIGHT,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
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
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
  },
  tab: {
    alignItems: 'center',
    paddingBottom: Spacing.one,
  },
  tabLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    width: 24,
    height: 3,
    borderRadius: 2,
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
    top: HEADER_HEIGHT + Spacing.two,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 15,
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
