import { useInfiniteFeed, type FeedFetcherFn, type ThoughtData } from '@qoe/api-client/mobile';
import { useCallback, useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-provider';
import { ApiStatus } from '@/features/home/api-status';
import { useTheme } from '@/hooks/use-theme';
import { apiClient } from '@/lib/api';
import { t } from '@/lib/i18n';

import { ThoughtCard } from './thought-card';

// Adapte le client universel (@qoe/api-client) au contrat du hook :
// ApiResult<{items, nextCursor}> → ApiResponse<ThoughtData[]>.
const fetcher: FeedFetcherFn = async ({ cursor, limit }) => {
  const res = await apiClient.getFeed({ cursor: cursor ?? undefined, limit });
  if (!res.ok) {
    throw new Error(res.error);
  }
  return {
    data: res.data.items as ThoughtData[],
    meta: { cursor: res.data.nextCursor, hasMore: Boolean(res.data.nextCursor) },
  };
};

export function FeedScreen() {
  const theme = useTheme();
  const { signOut } = useAuth();

  const {
    data,
    hasNextPage,
    isFetching,
    fetchNextPage,
    refetch,
    isPending,
    isError,
    isRefetching,
  } = useInfiniteFeed({ limit: 20, fetcher });

  const items = useMemo(() => data?.pages.flatMap((page) => page?.data ?? []) ?? [], [data]);

  const onEndReached = useCallback(() => {
    if (hasNextPage && !isFetching && !isRefetching) {
      void fetchNextPage();
    }
  }, [hasNextPage, isFetching, isRefetching, fetchNextPage]);

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
        <ThemedText type="small">{t('feed.error', 'Impossible de charger le feed')}</ThemedText>
        <Pressable onPress={() => void refetch()}>
          <ThemedText type="small" style={styles.retry}>
            {t('common.retry', 'Réessayer')}
          </ThemedText>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ThoughtCard thought={item} />}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => void refetch()}
              tintColor={theme.text}
            />
          }
          ListHeaderComponent={
            <View style={styles.header}>
              <ApiStatus />
              <Pressable
                onPress={() => void signOut()}
                style={({ pressed }) => [styles.signOut, { opacity: pressed ? 0.5 : 1 }]}
              >
                <ThemedText type="small">{t('auth.sign_out', 'Se déconnecter')}</ThemedText>
              </Pressable>
            </View>
          }
          ListEmptyComponent={
            <ThemedView style={styles.empty}>
              <ThemedText type="small">
                {t('feed.empty', 'Aucune pensée pour le moment')}
              </ThemedText>
            </ThemedView>
          }
          ListFooterComponent={
            hasNextPage ? <ActivityIndicator color={theme.text} style={styles.footer} /> : null
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={styles.content}
        />
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
    padding: Spacing.three,
    gap: Spacing.two,
    flexGrow: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingBottom: Spacing.two,
  },
  signOut: {
    paddingVertical: Spacing.one,
  },
  retry: {
    textDecorationLine: 'underline',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
    borderRadius: Spacing.three,
  },
  footer: {
    paddingVertical: Spacing.three,
  },
  separator: {
    height: Spacing.two,
  },
});
