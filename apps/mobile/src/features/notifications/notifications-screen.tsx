// =====================================================================
// 🔔 NotificationsScreen — Centre d'Activité (Notifications 50% + Messages 50%)
// =====================================================================

import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { FlashList } from '@shopify/flash-list';
import { SymbolView } from 'expo-symbols';
import { useCallback, useMemo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorMessage } from '@/components/ui/error-message';
import { NotificationItem } from '@/features/notifications/notification-item';
import { ConversationList } from '@/features/messages/conversation-list';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { apiClient } from '@/lib/api';
import { t } from '@/lib/i18n';
import { notificationKeys } from '@qoe/sdk/mobile';
import { CustomSubHeader } from '@/components/header/CustomSubHeader';
import { LiquidElasticButton } from '@/components/liquid-tab-bar/LiquidElasticButton';

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

  return (
    <ThemedView style={styles.container}>
      {/* ─── Header Custom Flottant Liquid Glass ─── */}
      <CustomSubHeader
        title={t('notif.title', 'Notifications')}
        rightComponent={
          items.some((n) => !n.isRead) ? (
            <LiquidElasticButton
              size={42}
              borderRadius={21}
              onPress={() => void markAllRead()}
              accessibilityLabel={t('notif.mark_all', 'Tout marquer lu')}
              icon={
                <SymbolView
                  name={{ ios: 'checkmark.circle', android: 'done_all', web: 'done_all' }}
                  size={20}
                  tintColor={theme.primary}
                  weight="semibold"
                />
              }
            />
          ) : undefined
        }
      />

      <SafeAreaView edges={['bottom']} style={[styles.safe, { paddingTop: 105 }]}>
        {/* ========================================================= */}
        {/* SECTION 1 (50% HAUT) : NOTIFICATIONS                     */}
        {/* ========================================================= */}
        <View style={styles.halfSection}>
          {isPending ? (
            <View style={styles.center}>
              <ActivityIndicator color={theme.text} />
            </View>
          ) : isError ? (
            <View style={styles.center}>
              <ErrorMessage
                message={t('notif.error', 'Impossible de charger les notifications')}
                onPressTryAgain={() => void refetch()}
              />
            </View>
          ) : (
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
          )}
        </View>

        {/* SÉPARATEUR DE SECTION */}
        <View style={[styles.sectionDivider, { backgroundColor: theme.border }]} />

        {/* ========================================================= */}
        {/* SECTION 2 (50% BAS) : MESSAGES DIRECTS (DMs)              */}
        {/* ========================================================= */}
        <View style={styles.halfSection}>
          <View style={styles.header}>
            <ThemedText style={styles.title}>{t('messages.title', 'Messages')}</ThemedText>
          </View>
          <ConversationList />
        </View>
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
  halfSection: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  sectionDivider: {
    height: 1,
    width: '100%',
    opacity: 0.6,
  },
  footer: {
    paddingVertical: Spacing.two,
  },
  sep: {
    height: StyleSheet.hairlineWidth,
  },
  messagesContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    paddingBottom: 40,
    gap: Spacing.one,
  },
  messageIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  messagesHeading: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  messagesDescription: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 290,
  },
  badge: {
    marginTop: Spacing.two,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
});
