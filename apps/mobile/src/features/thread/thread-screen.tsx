// =====================================================================
// 🧵 ThreadScreen — Fil complet d'une pensée (GET /v1/posts/{id}/thread)
// =====================================================================
// Header flottant Liquid Glass avec bouton retour + options ⋯,
// disparition complète au scroll, surface surélevée avec coins arrondis
// subtils (22px), flou progressif zénithal et fond 100% blanc pur.
// =====================================================================

import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Appearance, Platform, Pressable, StyleSheet, useColorScheme, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { EdgeFadeView } from 'react-native-edge-fade';

import { LiquidElasticButton } from '@/components/liquid-tab-bar/LiquidElasticButton';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PostFeedLoadingPlaceholder } from '@/components/ui/skeleton';
import { ErrorMessage } from '@/components/ui/error-message';
import { PostMenuButton } from '@/components/thought/post-menu';
import { ViewFullThread } from '@/components/thought/view-full-thread';
import { normalizeThought, type NormalizedThought } from '@/components/thought/normalize';
import { ThreadAnchorCard } from '@/features/thread/thread-anchor-card';
import { ThreadPost, OUTER_SPACE } from '@/features/thread/thread-post';
import { ThreadReplyComposer } from '@/features/thread/thread-reply-composer';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { apiClient } from '@/lib/api';
import { t } from '@/lib/i18n';
import { feedKeys } from '@qoe/sdk/mobile';

// Ancêtres visibles par défaut avant le repli « ReadMore » (Bluesky).
const MAX_VISIBLE_ANCESTORS = 2;
// Réponses visibles par défaut avant le repli « Afficher X autres réponses ».
const MAX_VISIBLE_REPLIES = 3;

export function ThreadScreen({ postId }: { postId: string }) {
  const theme = useTheme();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark' || Appearance.getColorScheme() === 'dark';
  const scrollY = useSharedValue(0);

  const onScrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  // Animation de disparition complète du header flottant au scroll
  const headerContainerAnimatedStyle = useAnimatedStyle(() => {
    const progress = interpolate(scrollY.value, [0, 45], [0, 1], 'clamp');
    return {
      opacity: interpolate(progress, [0, 0.75], [1, 0], 'clamp'),
      transform: [
        {
          translateY: interpolate(progress, [0, 1], [0, -14], 'clamp'),
        },
      ],
      pointerEvents: progress >= 0.75 ? 'none' : 'auto',
    };
  });

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: feedKeys.thread(postId),
    queryFn: async () => {
      const res = await apiClient.getThread(postId);
      if (!res.ok) throw new Error(res.error);
      return res.data.post;
    },
  });

  const [showAllAncestors, setShowAllAncestors] = useState(false);
  const [expandedBranches, setExpandedBranches] = useState<Set<string>>(() => new Set());

  const root = data ? normalizeThought(data) : null;
  const replies: NormalizedThought[] = useMemo(
    () => (data?.replies ?? []).map((r) => normalizeThought(r)),
    [data]
  );

  // Chaîne d'ancêtres (root → … → parent direct)
  const ancestors = useMemo(() => {
    const chain: NormalizedThought[] = [];
    let current = root?.parent ?? null;
    while (current) {
      chain.unshift(current);
      current = current.parent ?? null;
    }
    return chain;
  }, [root]);

  // Repli de la chaîne d'ancêtres
  const hiddenAncestorCount = Math.max(0, ancestors.length - MAX_VISIBLE_ANCESTORS);
  const visibleAncestors = showAllAncestors
    ? ancestors
    : ancestors.slice(Math.max(0, ancestors.length - MAX_VISIBLE_ANCESTORS));

  // Arbre des réponses
  const replyTree = useMemo(() => {
    const childrenOf = new Map<string, NormalizedThought[]>();
    for (const r of replies) {
      const key = r.parentId ?? '';
      const list = childrenOf.get(key) ?? [];
      list.push(r);
      childrenOf.set(key, list);
    }
    for (const list of childrenOf.values()) {
      list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    }
    return childrenOf;
  }, [replies]);

  const toggleBranch = (parentId: string) => {
    setExpandedBranches((prev) => {
      const next = new Set(prev);
      if (next.has(parentId)) next.delete(parentId);
      else next.add(parentId);
      return next;
    });
  };

  if (isPending) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView edges={['top']} style={styles.flex}>
          <PostFeedLoadingPlaceholder count={4} />
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (isError && !data) {
    return (
      <SafeAreaView style={styles.center}>
        <ErrorMessage
          message={t('thread.error', 'Impossible de charger la pensée')}
          onPressTryAgain={() => void refetch()}
        />
      </SafeAreaView>
    );
  }
  if (!root) {
    return (
      <SafeAreaView style={styles.center}>
        <ErrorMessage
          message={t('thread.error', 'Impossible de charger la pensée')}
          onPressTryAgain={() => void refetch()}
        />
      </SafeAreaView>
    );
  }

  const hasAncestors = ancestors.length > 0;
  const hasReplies = replies.length > 0;

  const bgPure = isDark ? '#000000' : '#FFFFFF';

  return (
    <View style={[styles.container, { backgroundColor: bgPure }]}>
      {/* ─── Header Flottant Moderne : Bouton Retour + Titre + Bouton ⋯ Liquid Glass ─── */}
      <Animated.View
        style={[styles.headerContainer, headerContainerAnimatedStyle]}
        pointerEvents="box-none"
      >
        {/* Bouton Retour Liquid Glass (gauche) */}
        <View style={styles.headerSideButton}>
          <LiquidElasticButton
            size={42}
            borderRadius={21}
            onPress={() => router.back()}
            accessibilityLabel={t('common.back', 'Retour')}
            icon={<Ionicons name="arrow-back" size={22} color={theme.text} />}
          />
        </View>

        {/* Titre centré « Pensée » */}
        <View style={styles.headerCenterSection} pointerEvents="box-none">
          <ThemedText style={[styles.headerTitle, { color: theme.text }]}>
            {t('thread.title', 'Pensée')}
          </ThemedText>
        </View>

        {/* Bouton Options ⋯ Liquid Glass (droite) */}
        <View style={styles.headerSideButton}>
          <PostMenuButton
            post={root}
            customButton={({ onPress }) => (
              <LiquidElasticButton
                size={42}
                borderRadius={21}
                onPress={onPress}
                accessibilityLabel={t('post.more', 'Plus d’options')}
                icon={<Ionicons name="ellipsis-horizontal" size={20} color={theme.text} />}
              />
            )}
          />
        </View>
      </Animated.View>

      {/* ─── Flou progressif zénithal (EdgeFadeView - Metal / AGSL) ─── */}
      <EdgeFadeView
        mode="blur"
        top={98}
        blurRadius={18}
        curve={{ type: 'stops', values: [1, 0.7, 0.38, 0.14, 0.04, 0] }}
        style={[styles.flex, { backgroundColor: bgPure }]}
      >
        <Animated.ScrollView
          style={[styles.flex, { backgroundColor: bgPure }]}
          contentContainerStyle={[styles.scrollContent, { backgroundColor: bgPure }]}
          onScroll={onScrollHandler}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}
        >
          {/* ─── Surface de la pensée principale (Fond + Coins bas arrondis 22px + Ombre) ─── */}
          <View
            style={[
              styles.mainPostSurface,
              {
                backgroundColor: bgPure,
                borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(0, 0, 0, 0.06)',
              },
            ]}
          >
            {/* Repli « ViewFullThread » : chaîne d'ancêtres longue (pointillés SVG Bluesky) */}
            {hiddenAncestorCount > 0 && !showAllAncestors ? (
              <ViewFullThread
                label={`${t('thread.show_more_parents', 'Afficher les pensées précédentes')} (${hiddenAncestorCount})`}
                onPress={() => setShowAllAncestors(true)}
              />
            ) : null}

            {/* Ancêtres */}
            {visibleAncestors.map((ancestor, index) => (
              <ThreadPost
                key={ancestor.id}
                post={ancestor}
                showParentLine={index > 0 || (hiddenAncestorCount > 0 && !showAllAncestors)}
                showChildLine
              />
            ))}

            {/* Post focus, agrandi */}
            <ThreadAnchorCard post={root} showParentLine={hasAncestors} />
          </View>

          {/* ─── Section Réponses (en dessous de la carte flottante) ─── */}
          <View style={[styles.repliesSection, { backgroundColor: bgPure }]}>
            <ReplyTree
              parentId={root.id}
              childrenOf={replyTree}
              depth={0}
              isRootBranch
              expandedBranches={expandedBranches}
              onToggleBranch={toggleBranch}
            />

            {!hasReplies ? (
              <View style={styles.emptyContainer}>
                <ThemedText style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
                  {t('thread.no_replies', 'Aucune réponse pour le moment. Soyez le premier !')}
                </ThemedText>
              </View>
            ) : null}
          </View>
        </Animated.ScrollView>
      </EdgeFadeView>

      {/* Barre de réponse morphique */}
      <ThreadReplyComposer
        postId={root.id}
        replyingTo={root.author.username || root.author.name}
        parentContent={root.content}
      />
    </View>
  );
}

/** Lien « Afficher les N pensées précédentes » (port ThreadItemReadMore). */
function ReadMoreRow({
  count,
  label,
  onPress,
}: {
  count: number;
  label: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} style={styles.readMore} hitSlop={6}>
      <View style={[styles.readMoreGlyph, { borderColor: theme.textSecondary }]}>
        <ThemedText type="small" style={{ color: theme.textSecondary, lineHeight: 14 }}>
          +
        </ThemedText>
      </View>
      <ThemedText
        type="small"
        style={{ color: theme.textSecondary, textDecorationLine: 'underline' }}
      >
        {count} {label}
      </ThemedText>
    </Pressable>
  );
}

/** Rend récursivement une branche de réponses (parité arbre Bluesky). */
function ReplyTree({
  parentId,
  childrenOf,
  depth,
  isRootBranch = false,
  expandedBranches,
  onToggleBranch,
}: {
  parentId: string;
  childrenOf: Map<string, NormalizedThought[]>;
  depth: number;
  isRootBranch?: boolean;
  expandedBranches: Set<string>;
  onToggleBranch: (parentId: string) => void;
}) {
  const theme = useTheme();
  const children = childrenOf.get(parentId) ?? [];
  if (children.length === 0) return null;

  const isExpanded = expandedBranches.has(parentId);
  const visible = isExpanded ? children : children.slice(0, MAX_VISIBLE_REPLIES);
  const hiddenCount = children.length - visible.length;

  return (
    <>
      {visible.map((child, index) => {
        const grandChildren = childrenOf.get(child.id) ?? [];
        const hasChild = grandChildren.length > 0;
        return (
          <View key={child.id}>
            <ThreadPost
              post={child}
              showParentLine={index > 0 || depth > 0}
              showChildLine={hasChild}
              indent={depth}
            />
            <ReplyTree
              parentId={child.id}
              childrenOf={childrenOf}
              depth={depth + 1}
              expandedBranches={expandedBranches}
              onToggleBranch={onToggleBranch}
            />
          </View>
        );
      })}

      {hiddenCount > 0 ? (
        <Pressable
          onPress={() => onToggleBranch(parentId)}
          style={[styles.showMoreReplies, { borderTopColor: theme.border }]}
          hitSlop={6}
        >
          <ThemedText type="small" style={{ color: theme.primary }}>
            {t('thread.show_more_replies', 'Afficher')} {hiddenCount}{' '}
            {t('thread.other_replies', 'autres réponses')}
          </ThemedText>
        </Pressable>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  headerContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 48 : 20,
    left: 0,
    right: 0,
    height: 48,
    paddingHorizontal: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 100,
  },
  headerSideButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenterSection: {
    flex: 1,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  scrollContent: {
    paddingBottom: Platform.OS === 'ios' ? 110 : 90,
  },
  mainPostSurface: {
    marginTop: -500,
    paddingTop: (Platform.OS === 'ios' ? 106 : 82) + 500,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    paddingBottom: 17,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    overflow: 'visible',
    zIndex: 2,
  },
  repliesSection: {
    paddingTop: Spacing.two,
    paddingBottom: Spacing.four,
    zIndex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  emptyContainer: {
    paddingVertical: Spacing.four,
    paddingHorizontal: OUTER_SPACE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    opacity: 0.8,
  },
  readMore: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: OUTER_SPACE,
    paddingVertical: Spacing.two,
  },
  readMoreGlyph: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  showMoreReplies: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: OUTER_SPACE,
    paddingVertical: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
