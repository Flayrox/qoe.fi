// =====================================================================
// 👥 EngagementScreen — Liste des likes / reposts / citations d'un post
//    (port de .reference/bluesky/src/view/screens/PostLikedBy.tsx +
//    PostRepostedBy.tsx + PostQuotes.tsx, réunis en un écran paramétré)
// =====================================================================
// Routes : /post/{id}/likes, /post/{id}/reposts, /post/{id}/quotes.
//  - likes/reposts  : liste d'utilisateurs (avatar + nom + @handle)
//  - quotes         : liste de FeedPost complets (cartes de pensée)
// Branché sur les vrais endpoints Go (août 2026).
// =====================================================================

import { useInfiniteQuery } from '@tanstack/react-query';
import { FlashList } from '@shopify/flash-list';
import { useCallback, useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Avatar } from '@/components/thought/avatar';
import { normalizeThought } from '@/components/thought/normalize';
import { ThoughtCard } from '@/components/thought/thought-card';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorMessage } from '@/components/ui/error-message';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { apiClient } from '@/lib/api';
import { t } from '@/lib/i18n';
import { feedKeys, type EngagementUser } from '@qoe/api-client/mobile';

export type EngagementKind = 'likes' | 'reposts' | 'quotes';

const TITLES: Record<EngagementKind, { title: string; empty: string }> = {
  likes: { title: 'J’aime', empty: 'Personne n’a aimé cette pensée pour l’instant.' },
  reposts: { title: 'Reposts', empty: 'Personne n’a reposté cette pensée pour l’instant.' },
  quotes: { title: 'Citations', empty: 'Aucune citation de cette pensée pour l’instant.' },
};

export function EngagementScreen({ postId, kind }: { postId: string; kind: EngagementKind }) {
  const theme = useTheme();

  const {
    data,
    isPending,
    isError,
    isRefetching,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetching,
  } = useInfiniteQuery({
    queryKey: [...feedKeys.all, 'engagement', kind, postId],
    queryFn: async ({ pageParam }: { pageParam: number }) => {
      const params = { cursor: pageParam ?? 0, limit: 30 };
      if (kind === 'likes') {
        const res = await apiClient.getPostLikes(postId, params);
        if (!res.ok) throw new Error(res.error);
        return res.data;
      }
      if (kind === 'reposts') {
        const res = await apiClient.getPostReposts(postId, params);
        if (!res.ok) throw new Error(res.error);
        return res.data;
      }
      const res = await apiClient.getPostQuotes(postId, params);
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    initialPageParam: 0 as number,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.nextCursor ? allPages.length * 30 : undefined,
  });

  const isQuotes = kind === 'quotes';
  // Les pages sont soit EngagementPage soit QuotesPage selon le kind — on les
  // traite via un cast (le rendu distingue les deux formes par `isQuotes`).
  const items = useMemo(
    () => data?.pages.flatMap((p) => (p as { items: Array<{ id: string }> }).items) ?? [],
    [data]
  );
  const listData = items as unknown as Array<{ id: string }>;

  const onEndReached = useCallback(() => {
    if (hasNextPage && !isFetching) void fetchNextPage();
  }, [hasNextPage, isFetching, fetchNextPage]);

  if (isPending) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={theme.text} />
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.center}>
        <ErrorMessage
          message={t('engagement.error', 'Impossible de charger cette liste')}
          onPressTryAgain={() => void refetch()}
        />
      </SafeAreaView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <FlashList
          data={listData}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) =>
            isQuotes ? (
              <ThoughtCard thought={normalizeThought(item as never)} />
            ) : (
              <EngagementUserRow user={item as unknown as EngagementUser} />
            )
          }
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          refreshing={isRefetching}
          onRefresh={() => void refetch()}
          ListEmptyComponent={
            <EmptyState
              icon={{ ios: 'person.2', android: 'people', web: 'people' }}
              message={t('engagement.empty', TITLES[kind].empty)}
            />
          }
          ListFooterComponent={
            hasNextPage ? <ActivityIndicator color={theme.text} style={styles.footer} /> : null
          }
          ItemSeparatorComponent={() => (
            <View style={[styles.sep, { backgroundColor: theme.border }]} />
          )}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

function EngagementUserRow({ user }: { user: EngagementUser }) {
  const theme = useTheme();

  const openProfile = () => {
    const username = user.username || user.id;
    void import('expo-router').then(({ router }) =>
      router.push({ pathname: '/user/[username]', params: { username } })
    );
  };

  return (
    <Pressable
      onPress={openProfile}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Avatar
        user={{ name: user.name, username: user.username, logoUrl: user.logoUrl }}
        sizeNumber={40}
        showCertified={user.isCertified}
      />
      <View style={styles.rowText}>
        <ThemedText numberOfLines={1} style={{ fontWeight: '600' }}>
          {user.name || user.username || '?'}
        </ThemedText>
        {user.username ? (
          <ThemedText type="small" style={{ color: theme.textSecondary }} numberOfLines={1}>
            @{user.username}
          </ThemedText>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  footer: {
    paddingVertical: Spacing.three,
  },
  sep: {
    height: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  rowText: {
    flex: 1,
    gap: 1,
  },
  pressed: {
    opacity: 0.6,
  },
});
