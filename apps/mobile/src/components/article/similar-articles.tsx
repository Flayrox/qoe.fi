import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { apiClient } from '@/lib/api';
import { t } from '@/lib/i18n';
import { feedKeys } from '@qoe/api-client/mobile';
import type { SimilarArticle } from '@qoe/api-client/mobile';

// =====================================================================
// 🧠 SimilarArticles — « À lire aussi » (recommandations sémantiques)
// =====================================================================
// GET /v1/articles/{id}/similar (pgvector). Ne rend rien tant que le
// worker d'embedding n'a pas indexé (liste vide) ou si l'API est KO.
// =====================================================================

export function SimilarArticles({ articleId }: { articleId: string }) {
  const theme = useTheme();

  const { data, isPending } = useQuery({
    queryKey: [...feedKeys.all, 'similar', articleId],
    queryFn: async () => {
      const res = await apiClient.getSimilarArticles(articleId, 5);
      if (!res.ok) throw new Error(res.error);
      return res.data.items;
    },
    retry: 1,
  });

  const items: SimilarArticle[] = data ?? [];
  if (isPending || items.length === 0) return null;

  return (
    <ThemedView style={styles.wrap}>
      <ThemedText style={styles.title}>
        ✨ {t('article.similar', 'À lire aussi')}{' '}
        <ThemedText type="small" style={styles.subtitle}>
          {t('article.similar_ai', 'recommandé par IA')}
        </ThemedText>
      </ThemedText>

      {items.map((item) => {
        const publication = item.publicationName || item.authorName || 'qoe.fi';
        return (
          <Pressable
            key={item.id}
            onPress={() =>
              router.push({
                pathname: '/article/[slug]',
                params: { slug: item.slug, publicationId: item.publicationId },
              })
            }
            style={({ pressed }) => [
              styles.card,
              { borderColor: theme.border, backgroundColor: theme.background },
              pressed && styles.pressed,
            ]}
          >
            <ThemedText numberOfLines={2} style={styles.cardTitle}>
              {item.title}
            </ThemedText>
            <View style={styles.cardMeta}>
              <ThemedText type="small" numberOfLines={1} style={styles.cardSource}>
                {publication}
              </ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                ⏱ {item.readingTime} {t('article.min_read', 'min')}
              </ThemedText>
            </View>
          </Pressable>
        );
      })}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: Spacing.four,
    gap: Spacing.two,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: Spacing.one,
  },
  subtitle: {
    color: 'rgba(0,0,0,0.45)',
    fontWeight: '400',
  },
  card: {
    borderRadius: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    gap: Spacing.one,
  },
  cardTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  cardSource: {
    flexShrink: 1,
  },
  pressed: {
    opacity: 0.7,
  },
});
