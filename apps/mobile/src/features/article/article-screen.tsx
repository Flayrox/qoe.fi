import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Ionicons } from '@expo/vector-icons';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';

import { ArticleHighlights } from '@/components/article/article-highlights';
import { ArticleHtml } from '@/components/article/html-blocks';
import { SimilarArticles } from '@/components/article/similar-articles';
import { CustomSubHeader } from '@/components/header/CustomSubHeader';
import { LiquidElasticButton } from '@/components/liquid-tab-bar/LiquidElasticButton';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { apiClient } from '@/lib/api';
import { t } from '@/lib/i18n';
import { feedKeys } from '@qoe/sdk/mobile';

// =====================================================================
// 📖 ArticleScreen — Lecteur d'article mobile (GET /v1/articles/{slug})
// =====================================================================
// Nécessite `slug` + `publicationId` (le Go renvoie 400 sinon). Le contenu
// est rendu via le mini-renderer HTML maison. Paywall : si le serveur a
// tronqué le contenu (`isTruncated`) ou que l'accès est refusé, on affiche
// un panneau d'abonnement (CTA) — le contenu payant n'est JAMAIS servi
// côté client (zéro-fuite, troncature serveur).
// =====================================================================

export function ArticleScreen({ slug, publicationId }: { slug: string; publicationId: string }) {
  const theme = useTheme();
  const scrollY = useSharedValue(0);

  const onScrollHandler = (event: any) => {
    scrollY.value = event.nativeEvent.contentOffset.y;
  };

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: [...feedKeys.all, 'article', slug, publicationId],
    queryFn: async () => {
      const res = await apiClient.getArticle(slug, publicationId);
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
  });

  // État bookmark (optimiste local). Le Go ne renvoie pas l'état initial —
  // on le déduit de la bibliothèque au chargement.
  const [bookmarked, setBookmarked] = useState(false);
  const [bookmarkLoaded, setBookmarkLoaded] = useState(false);
  const queryClient = useQueryClient();
  const bookmark = useMutation({
    mutationFn: async (articleId: string) => {
      const res = await apiClient.toggleBookmark(articleId, 'article');
      if (!res.ok) throw new Error(res.error);
      return res.data.bookmarked;
    },
    onMutate: () => setBookmarked((v) => !v),
    onError: () => setBookmarked((v) => !v),
    onSuccess: (next) => {
      setBookmarked(next);
      void queryClient.invalidateQueries({ queryKey: ['library', 'bookmarks'] });
    },
  });

  // Au chargement de l'article, on vérifie s'il est déjà sauvegardé.
  void (async () => {
    if (bookmarkLoaded || !data?.id) return;
    try {
      const b = await apiClient.getBookmarks({ limit: 100 });
      if (b.ok) {
        setBookmarked(b.data.some((item) => item.articleId === data.id));
      }
    } finally {
      setBookmarkLoaded(true);
    }
  })();

  if (isPending) {
    return (
      <ThemedView style={styles.container}>
        <CustomSubHeader title={t('article.title', 'Article')} />
        <SafeAreaView style={styles.center}>
          <ActivityIndicator color={theme.text} />
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (isError || !data) {
    return (
      <ThemedView style={styles.container}>
        <CustomSubHeader title={t('article.title', 'Article')} />
        <SafeAreaView style={styles.center}>
          <ThemedText type="small">
            {t('article.error', 'Impossible de charger l’article')}
          </ThemedText>
          <Pressable onPress={() => void refetch()} style={{ marginTop: 8 }}>
            <ThemedText type="smallBold" style={{ color: theme.primary }}>
              {t('common.retry', 'Réessayer')}
            </ThemedText>
          </Pressable>
        </SafeAreaView>
      </ThemedView>
    );
  }

  const isLocked = data.isTruncated || !data.accessGranted;
  const authorName =
    data.author?.name || data.author?.username || data.publication?.name || 'Auteur';
  const dateLabel = new Date(data.createdAt).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <ThemedView style={styles.container}>
      {/* ─── Header Custom Flottant Liquid Glass ─── */}
      <CustomSubHeader
        title={data.title}
        subtitle={authorName}
        scrollY={scrollY}
        showTitleOnScrollOnly={true}
        scrollThreshold={80}
        rightComponent={
          <LiquidElasticButton
            size={42}
            borderRadius={21}
            onPress={() => bookmark.mutate(data.id)}
            accessibilityLabel={t('article.bookmark', 'Sauvegarder')}
            icon={
              <Ionicons
                name={bookmarked ? 'bookmark' : 'bookmark-outline'}
                size={20}
                color={bookmarked ? theme.primary : theme.text}
              />
            }
          />
        }
      />

      <Animated.ScrollView
        contentContainerStyle={[styles.content, { paddingTop: 105 }]}
        onScroll={onScrollHandler}
        scrollEventThrottle={16}
      >
        {/* Meta (même hiérarchie que l'écran principal web) */}
        <View style={styles.byline}>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            {t('article.by', 'Par')}{' '}
            <ThemedText type="smallBold" style={{ color: theme.text }}>
              {authorName}
            </ThemedText>
            {'  '}•{'  '}
            {data.readingTime} {t('article.min_read', 'min de lecture')}
            {'  '}•{'  '}
            {dateLabel}
          </ThemedText>
        </View>

        <ThemedText style={styles.title}>{data.title}</ThemedText>

        <View style={styles.metaRow}>
          {data.category ? (
            <View style={[styles.categoryBadge, { backgroundColor: theme.backgroundSelected }]}>
              <ThemedText type="small" style={{ color: theme.primary }}>
                {data.category.name}
              </ThemedText>
            </View>
          ) : null}
          {data.isPremium ? (
            <View style={[styles.premiumBadge, { backgroundColor: theme.backgroundSelected }]}>
              <ThemedText type="small" style={[styles.premiumText, { color: theme.textSecondary }]}>
                👑 {t('article.premium', 'Premium')}
              </ThemedText>
            </View>
          ) : null}

          {/* Bookmark (sauvegarder l'article) */}
          <Pressable
            onPress={() => bookmark.mutate(data.id)}
            hitSlop={8}
            style={({ pressed }) => [styles.bookmarkButton, pressed && styles.pressed]}
            accessibilityLabel={t('article.bookmark', 'Sauvegarder')}
          >
            <ThemedText
              style={{ fontSize: 18, color: bookmarked ? theme.primary : theme.textSecondary }}
            >
              {bookmarked ? '🔖' : '🔖'}
            </ThemedText>
          </Pressable>
        </View>

        {/* Séparateur sous l'en-tête (comme le web) */}
        <View style={[styles.headerDivider, { backgroundColor: theme.border }]} />

        {/* Contenu (tronqué côté serveur si paywall). */}
        {data.content ? (
          <View style={styles.body}>
            <ArticleHtml html={data.content} />
          </View>
        ) : null}

        {/* Surlignages (publics + les miens) */}
        {data.id ? <ArticleHighlights articleId={data.id} /> : null}

        {/* 🧠 À lire aussi — recommandations sémantiques (pgvector) */}
        {data.id ? <SimilarArticles articleId={data.id} /> : null}

        {/* Panneau paywall */}
        {isLocked ? (
          <ThemedView type="card" style={styles.paywall}>
            <ThemedText style={styles.paywallTitle}>
              {t('article.paywall_title', 'Contenu réservé aux abonnés')}
            </ThemedText>
            <ThemedText type="small" style={styles.paywallBody}>
              {t(
                'article.paywall_body',
                'Abonnez-vous pour lire la suite de cet article et soutenir l’auteur.'
              )}
            </ThemedText>
            <Pressable
              style={({ pressed }) => [
                styles.subscribeButton,
                { backgroundColor: pressed ? theme.backgroundSelected : theme.primary },
              ]}
            >
              {({ pressed }) => (
                <ThemedText type="smallBold" style={{ color: pressed ? theme.text : '#ffffff' }}>
                  {t('article.subscribe', 'S’abonner')}
                </ThemedText>
              )}
            </Pressable>
          </ThemedView>
        ) : null}
      </Animated.ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
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
    paddingBottom: Spacing.six,
    gap: Spacing.two,
  },
  byline: {
    marginBottom: Spacing.two,
  },
  title: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  categoryBadge: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: 999,
  },
  headerDivider: {
    height: StyleSheet.hairlineWidth,
    marginTop: Spacing.three,
  },
  premiumBadge: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: 999,
  },
  premiumText: {
    fontSize: 12,
    fontWeight: '600',
  },
  bookmarkButton: {
    marginLeft: 'auto',
    paddingHorizontal: Spacing.one,
  },
  pressed: {
    opacity: 0.6,
  },
  body: {
    marginTop: Spacing.two,
  },
  paywall: {
    marginTop: Spacing.four,
    padding: Spacing.four,
    borderRadius: Spacing.three,
    alignItems: 'center',
    gap: Spacing.two,
  },
  paywallTitle: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  paywallBody: {
    textAlign: 'center',
    lineHeight: 20,
  },
  subscribeButton: {
    marginTop: Spacing.two,
    borderRadius: 999,
    paddingHorizontal: Spacing.five,
    paddingVertical: Spacing.two,
    alignItems: 'center',
    minWidth: 200,
  },
});
