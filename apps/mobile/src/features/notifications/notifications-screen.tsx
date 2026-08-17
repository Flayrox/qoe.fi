// =====================================================================
// 🔔 NotificationsScreen — Centre de notifications (port de
//    .reference/bluesky/src/view/screens/Notifications.tsx)
// =====================================================================
// Liste paginée des notifications groupées + en-tête « Tout marquer lu ».
// =====================================================================

import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { FlashList } from '@shopify/flash-list';
import { useCallback, useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorMessage } from '@/components/ui/error-message';
import { NotificationItem } from '@/features/notifications/notification-item';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { apiClient } from '@/lib/api';
import { t } from '@/lib/i18n';
import { notificationKeys } from '@qoe/api-client/mobile';

export function NotificationsScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();

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
    queryKey: notificationKeys.list(),
    queryFn: async ({ pageParam }: { pageParam: number }) => {
      const res = await apiClient.getNotifications({ cursor: pageParam ?? 0, limit: 30 });
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    initialPageParam: 0 as number,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.nextCursor ? allPages.length * 30 : undefined,
  });

  const items = useMemo(() => data?.pages.flatMap((p) => p.notifications) ?? [], [data]);

  const markAllRead = async () => {
    const ids = items.filter((n) => !n.isRead).map((n) => n.id);
    if (ids.length === 0) return;
    await apiClient.markNotificationsRead(ids);
    await queryClient.invalidateQueries({ queryKey: notificationKeys.all });
  };

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
          message={t('notif.error', 'Impossible de charger les notifications')}
          onPressTryAgain={() => void refetch()}
        />
      </SafeAreaView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <View style={styles.header}>
          <ThemedText style={styles.title}>{t('notif.title', 'Notifications')}</ThemedText>
          <Pressable onPress={() => void markAllRead()} hitSlop={8}>
            <ThemedText type="small" style={{ color: theme.primary }}>
              {t('notif.mark_all', 'Tout marquer lu')}
            </ThemedText>
          </Pressable>
        </View>
        <FlashList
          data={items}
          keyExtractor={(n) => n.id}
          renderItem={({ item }) => <NotificationItem notification={item} />}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          refreshing={isRefetching}
          onRefresh={() => void refetch()}
          ListEmptyComponent={
            <EmptyState
              icon={{ ios: 'bell', android: 'notifications_none', web: 'notifications_none' }}
              message={t('notif.empty', 'Aucune notification pour le moment.')}
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

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
  },
  footer: {
    paddingVertical: Spacing.three,
  },
  sep: {
    height: StyleSheet.hairlineWidth,
  },
});
