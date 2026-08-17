// =====================================================================
// 🧵 ThreadScreen — Fil complet d'une pensée (GET /v1/posts/{id}/thread)
// =====================================================================
// Port fidèle de .reference/bluesky/src/screens/PostThread : liste plate
// avec profondeur — ancêtres (parents) au-dessus, post focus en « agrandi »
// (ThreadAnchorCard), réponses en dessous — reliés par des lignes verticales
// 2px (parent line / child line). Chaînes longues repliées (ReadMore) et
// barre de réponse « Écrire votre réponse » en bas (ThreadReplyComposer).
// =====================================================================

import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PostFeedLoadingPlaceholder } from '@/components/ui/skeleton';
import { ErrorMessage } from '@/components/ui/error-message';
import { normalizeThought, type NormalizedThought } from '@/components/thought/normalize';
import { ThreadAnchorCard } from '@/features/thread/thread-anchor-card';
import { ThreadPost, OUTER_SPACE } from '@/features/thread/thread-post';
import { ThreadReplyComposer } from '@/features/thread/thread-reply-composer';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { apiClient } from '@/lib/api';
import { t } from '@/lib/i18n';
import { feedKeys } from '@qoe/api-client/mobile';

// Ancêtres visibles par défaut avant le repli « ReadMore » (Bluesky).
const MAX_VISIBLE_ANCESTORS = 2;
// Réponses visibles par défaut avant le repli « Afficher X autres réponses ».
const MAX_VISIBLE_REPLIES = 3;

export function ThreadScreen({ postId }: { postId: string }) {
  const theme = useTheme();

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

  // Chaîne d'ancêtres (root → … → parent direct), façon Bluesky parents.
  const ancestors = useMemo(() => {
    const chain: NormalizedThought[] = [];
    let current = root?.parent ?? null;
    while (current) {
      chain.unshift(current);
      current = current.parent ?? null;
    }
    return chain;
  }, [root]);

  // Repli de la chaîne d'ancêtres : on garde les 2 plus proches du post focus.
  const hiddenAncestorCount = Math.max(0, ancestors.length - MAX_VISIBLE_ANCESTORS);
  const visibleAncestors = showAllAncestors
    ? ancestors
    : ancestors.slice(Math.max(0, ancestors.length - MAX_VISIBLE_ANCESTORS));

  // Arbre des réponses : parentId → enfants, pour le rendu récursif imbriqué
  // (les réponses du Go sont désormais RÉCURSIVES et plates, avec parentId).
  const replyTree = useMemo(() => {
    const childrenOf = new Map<string, NormalizedThought[]>();
    for (const r of replies) {
      const key = r.parentId ?? '';
      const list = childrenOf.get(key) ?? [];
      list.push(r);
      childrenOf.set(key, list);
    }
    // Tri chronologique ascendant dans chaque branche.
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

  // Erreur plein écran uniquement sans donnée en cache (le refetch échoué
  // ne doit pas faire disparaître un fil déjà affiché).
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

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.flex}>
        <ScrollView style={styles.flex} contentContainerStyle={styles.scrollContent}>
          {/* Repli « ReadMore » : chaîne d'ancêtres longue */}
          {hiddenAncestorCount > 0 && !showAllAncestors ? (
            <ReadMoreRow
              count={hiddenAncestorCount}
              label={t('thread.show_more_parents', 'Afficher les pensées précédentes')}
              onPress={() => setShowAllAncestors(true)}
            />
          ) : null}

          {/* Ancêtres (ce qu'il y a au-dessus) — reliés vers le bas */}
          {visibleAncestors.map((ancestor, index) => (
            <ThreadPost
              key={ancestor.id}
              post={ancestor}
              showParentLine={showAllAncestors || index > 0}
              showChildLine
            />
          ))}

          {/* Post focus, agrandi */}
          <ThreadAnchorCard post={root} showParentLine={hasAncestors} showChildLine={hasReplies} />

          {/* Réponses (arbre récursif) — reliées entre elles */}
          <ReplyTree
            parentId={root.id}
            childrenOf={replyTree}
            depth={0}
            isRootBranch
            expandedBranches={expandedBranches}
            onToggleBranch={toggleBranch}
          />

          {!hasReplies ? (
            <ThemedView type="backgroundElement" style={styles.empty}>
              <ThemedText type="small">
                {t('thread.no_replies', 'Aucune réponse pour le moment. Soyez le premier !')}
              </ThemedText>
            </ThemedView>
          ) : null}
        </ScrollView>

        {/* Barre de réponse (ouvre le composer plein écran) */}
        <ThreadReplyComposer
          postId={root.id}
          replyingTo={root.author.username || root.author.name}
          parentContent={root.content}
        />
      </SafeAreaView>
    </ThemedView>
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
              showParentLine={isRootBranch || index > 0 || depth > 0}
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
  scrollContent: {
    paddingBottom: Spacing.four,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  empty: {
    margin: Spacing.three,
    padding: Spacing.four,
    borderRadius: Spacing.three,
    alignItems: 'center',
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
