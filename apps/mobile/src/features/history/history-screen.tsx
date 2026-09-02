// =====================================================================
// 🕘 HistoryScreen — Historique de lecture (parité web /v1/me/reading-history)
// =====================================================================
// Sessions des 14 derniers jours, DÉJÀ dédupliquées par article côté Go
// (DISTINCT ON articleId, la plus récente, triée DESC, max 100) : le mobile
// n'a qu'à afficher. Tap sur une ligne → ouvre l'article correspondant.
// =====================================================================

import { useQuery } from '@tanstack/react-query';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CustomSubHeader } from '@/components/header/CustomSubHeader';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { apiClient } from '@/lib/api';
import { t } from '@/lib/i18n';
import type { ReadingHistoryItem } from '@qoe/sdk/mobile';

const HISTORY_DAYS = 14;

export function HistoryScreen() {
  const theme = useTheme();

  const query = useQuery({
    queryKey: ['history'],
    queryFn: async () => {
      const res = await apiClient.getMyReadingHistory({ days: HISTORY_DAYS });
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
  });

  const sessions = useMemo(() => query.data?.sessions ?? [], [query.data]);

  return (
    <ThemedView style={styles.container}>
      <CustomSubHeader
        title={t('history.title', 'Historique')}
        subtitle={t('history.period', '14 derniers jours')}
      />

      <SafeAreaView edges={['bottom']} style={[styles.safeArea, { paddingTop: 105 }]}>
        {query.isPending ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.text} />
          </View>
        ) : query.isError ? (
          <View style={styles.center}>
            <ThemedText type="small">
              {t('history.error', 'Impossible de charger l’historique')}
            </ThemedText>
            <Pressable onPress={() => void query.refetch()} style={{ marginTop: 8 }}>
              <ThemedText type="smallBold" style={{ color: theme.primary }}>
                {t('common.retry', 'Réessayer')}
              </ThemedText>
            </Pressable>
          </View>
        ) : (
          <FlashList<ReadingHistoryItem>
            data={sessions}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <HistoryRow item={item} />}
            refreshing={query.isRefetching}
            onRefresh={() => void query.refetch()}
            ListHeaderComponent={
              sessions.length > 0 ? (
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  {t('history.articles_count', '{count} articles', {
                    count: sessions.length,
                  })}
                </ThemedText>
              ) : null
            }
            ListEmptyComponent={
              <ThemedView type="backgroundElement" style={styles.empty}>
                <SymbolView
                  name={{ ios: 'clock', android: 'history', web: 'history' }}
                  size={36}
                  tintColor={theme.textSecondary}
                />
                <ThemedText type="small" style={styles.emptyText}>
                  {t('history.empty', 'Aucune lecture ces 14 derniers jours.')}
                </ThemedText>
                <ThemedText type="small" style={[styles.emptyText, { color: theme.textSecondary }]}>
                  {t('history.empty_hint', 'Lisez un article pour qu’il apparaisse ici.')}
                </ThemedText>
              </ThemedView>
            }
            contentContainerStyle={styles.content}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

function HistoryRow({ item }: { item: ReadingHistoryItem }) {
  const theme = useTheme();
  const article = item.article;
  const open = () =>
    router.push({
      pathname: '/article/[slug]',
      params: {
        slug: article.slug,
        publicationId: article.publication?.id ?? '',
      },
    });

  return (
    <Pressable onPress={open} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <ThemedView type="card" style={styles.rowCard}>
        <View style={styles.rowInner}>
          {article.imageUrl ? (
            <Image source={{ uri: article.imageUrl }} style={styles.thumb} />
          ) : (
            <View style={[styles.thumb, { backgroundColor: theme.backgroundSelected }]} />
          )}
          <View style={styles.rowBody}>
            <ThemedText numberOfLines={1} style={styles.rowTitle}>
              {article.title}
            </ThemedText>
            <ThemedText type="small" numberOfLines={1} style={{ color: theme.textSecondary }}>
              {article.publication?.name ? `${article.publication.name} · ` : ''}
              {t('history.minutes', '{minutes} min', {
                minutes: article.readingTime,
              })}
              {' · '}
              {new Date(item.createdAt).toLocaleDateString('fr-FR')}
            </ThemedText>
            <View style={styles.badgesRow}>
              <View style={[styles.badge, { backgroundColor: theme.primary }]}>
                <ThemedText type="small" style={styles.badgePrimaryText}>
                  {item.source}
                </ThemedText>
              </View>
              <View style={[styles.badge, { backgroundColor: theme.backgroundSelected }]}>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  {item.status}
                </ThemedText>
              </View>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                {t('history.engagement', '{depth}% • {seconds}s', {
                  depth: item.scrollDepth,
                  seconds: item.dwellSeconds,
                })}
              </ThemedText>
            </View>
          </View>
        </View>
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
  empty: {
    padding: Spacing.four,
    borderRadius: Spacing.three,
    alignItems: 'center',
    gap: Spacing.two,
  },
  emptyText: { textAlign: 'center' },
  separator: { height: Spacing.two },
  row: { borderRadius: Spacing.three },
  rowPressed: { opacity: 0.7 },
  rowCard: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  rowInner: { flexDirection: 'row', gap: Spacing.three },
  thumb: {
    width: 80,
    height: 56,
    borderRadius: 8,
  },
  rowBody: { flex: 1, minWidth: 0, gap: Spacing.one },
  rowTitle: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  badgePrimaryText: {
    color: '#ffffff',
    fontWeight: '600',
  },
});
