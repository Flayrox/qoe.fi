import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Ionicons } from '@expo/vector-icons';
import { Bookmark, Crown } from 'lucide-react-native';
import Animated, {
  runOnUI,
  scrollTo,
  useAnimatedRef,
  useSharedValue,
} from 'react-native-reanimated';

import { ArticleHighlights } from '@/components/article/article-highlights';
import { ArticleBody } from '@/components/article/ArticleBody';
import type { SelectionInfo } from '@/components/article/html-blocks';
import { SelectionPopover } from '@/components/article/selection-popover';
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

// Header flottant (padding haut du contenu) — sert aussi au calcul du
// scroll deep-link (6-d) : le passage doit apparaître SOUS le header.
const CONTENT_TOP_PADDING = 105;

export function ArticleScreen({
  slug,
  publicationId,
  spotlight = null,
}: {
  slug: string;
  publicationId: string;
  /** 🔦 Passage à mettre en avant (deep-link citation → article, 6-d). */
  spotlight?: { start: number; end: number; sha: string } | null;
}) {
  const theme = useTheme();
  const scrollY = useSharedValue(0);
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  // Ref sur le wrapper du contenu (mesure WINDOW pour le scroll deep-link).
  const contentNodeRef = useRef<View | null>(null);
  const contentRef = useCallback((node: View | null) => {
    contentNodeRef.current = node;
  }, []);

  // 🔦 Deep-link (6-d) : ArticleHtml signale la position window du passage
  // peint → on la convertit en position dans le contenu scrollable et on
  // scrolle dessus (sous le header flottant).
  const onSpotlightMeasured = useCallback(
    (tokenWindowY: number) => {
      const contentNode = contentNodeRef.current;
      if (!contentNode) return;
      contentNode.measureInWindow((_x, contentWindowY) => {
        const yInContent = CONTENT_TOP_PADDING + (tokenWindowY - contentWindowY) + scrollY.value;
        // scrollTo est un worklet (reanimated) — appel via runOnUI, jamais
        // de synchronisation UI↔JS (piège « Remote Function » déjà croisé).
        runOnUI(() => {
          'worklet';
          scrollTo(scrollRef, 0, Math.max(0, yInContent - 150), true);
        })();
      });
    },
    [scrollY, scrollRef]
  );

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

  // Passage sélectionné par appui long (popover Surligner/Citer/Annoter/Copier).
  const [selection, setSelection] = useState<SelectionInfo | null>(null);

  // Pendant le geste de sélection, on verrouille le scroll de la ScrollView
  // (sinon elle vole le drag après l'appui long).
  const [scrollLock, setScrollLock] = useState(false);

  // Surlignages inline (publics + les miens) — MÊME cache que la section
  // ArticleHighlights ci-dessous : un seul fetch, deux consommateurs.
  const { data: highlights } = useQuery({
    queryKey: ['highlights', data?.id ?? ''],
    queryFn: async () => {
      if (!data?.id) return [];
      const res = await apiClient.getArticleHighlights(data.id);
      if (!res.ok) return [];
      return res.data;
    },
    enabled: Boolean(data?.id),
  });

  // Tranche 1-d — document canonique (blocs serveur + marques par offsets).
  // Jamais pour un article verrouillé : le document complet n'est pas
  // téléchargé si le contenu a été tronqué (zéro-fuite du paywall).
  const { data: canonicalDocument } = useQuery({
    queryKey: ['article-document', data?.id ?? ''],
    queryFn: async () => {
      if (!data?.id) return null;
      const res = await apiClient.getArticleDocument(data.id);
      if (!res.ok) return null;
      return res.data;
    },
    enabled: Boolean(data?.id) && !data?.isTruncated && data?.accessGranted !== false,
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
        ref={scrollRef}
        contentContainerStyle={[styles.content, { paddingTop: CONTENT_TOP_PADDING }]}
        onScroll={onScrollHandler}
        scrollEventThrottle={16}
        scrollEnabled={!scrollLock}
      >
        {/* Wrapper de contenu (ref pour la mesure window du deep-link 6-d) :
            le gap inter-enfants vit ici (un seul enfant dans la ScrollView). */}
        <View ref={contentRef} style={styles.contentInner} collapsable={false}>
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
                <Crown size={13} color={theme.textSecondary} />
                <ThemedText
                  type="small"
                  style={[styles.premiumText, { color: theme.textSecondary }]}
                >
                  {t('article.premium', 'Premium')}
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
              <Bookmark
                size={18}
                color={bookmarked ? theme.primary : theme.textSecondary}
                fill={bookmarked ? theme.primary : 'transparent'}
              />
            </Pressable>
          </View>

          {/* Séparateur sous l'en-tête (comme le web) */}
          <View style={[styles.headerDivider, { backgroundColor: theme.border }]} />

          {/* Contenu (tronqué côté serveur si paywall). */}
          {data.content ? (
            <View style={styles.body}>
              <View style={styles.articleWrap}>
                <ArticleBody
                  html={data.content}
                  highlights={highlights ?? []}
                  document={canonicalDocument ?? undefined}
                  selection={selection}
                  onSelect={setSelection}
                  onScrollLock={setScrollLock}
                  spotlight={spotlight}
                  onSpotlightMeasured={onSpotlightMeasured}
                />
                {selection && data.id ? (
                  <>
                    <Pressable style={StyleSheet.absoluteFill} onPress={() => setSelection(null)} />
                    <SelectionPopover
                      selection={selection}
                      articleId={data.id}
                      onClose={() => setSelection(null)}
                    />
                  </>
                ) : null}
              </View>
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
        </View>
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
  },
  /** Wrapper du contenu : le gap inter-éléments (ex-contentContainer). */
  contentInner: {
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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
  articleWrap: {
    position: 'relative',
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
