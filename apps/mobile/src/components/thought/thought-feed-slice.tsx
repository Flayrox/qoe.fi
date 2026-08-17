import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThoughtCard } from '@/components/thought/thought-card';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { t } from '@/lib/i18n';
import type { FeedSlice } from '@qoe/api-client/mobile';

// =====================================================================
// 🧵 ThoughtFeedSlice — Rendu d'un élément du feed (port de
//    apps/feed/.../ThoughtFeedSlice.tsx)
// =====================================================================
// 4 cas :
//   1. Post isolé (pas de parent/root) → ThoughtCard simple.
//   2. Fil multi-posts : Root → [séparateur pointillé si incomplet] →
//      Parent → Target (la réponse), reliés par connecteurs verticaux.
// =====================================================================

export function ThoughtFeedSlice({ slice }: { slice: FeedSlice }) {
  const theme = useTheme();
  const { rootPost, parentPost, targetPost, isIncompleteThread, hiddenIntermediateCount } = slice;

  const openRootThread = () => {
    const targetId = rootPost?.id || parentPost?.id || targetPost.id;
    router.push({ pathname: '/thought/[id]', params: { id: targetId } });
  };

  // Cas 1 : post isolé.
  if (!parentPost && !rootPost) {
    return <ThoughtCard thought={targetPost} />;
  }

  // Cas 2 : fil multi-posts.
  return (
    <View style={[styles.slice, { borderColor: theme.border }]}>
      {/* Root */}
      {rootPost ? (
        <ThoughtCard thought={rootPost} showThreadConnectorBottom={!!parentPost || true} />
      ) : null}

      {/* Séparateur « Afficher la suite du fil » si incomplet */}
      {isIncompleteThread ? (
        <Pressable onPress={openRootThread} style={styles.incompleteRow}>
          <View style={styles.incompleteLine}>
            <View style={[styles.dashed, { backgroundColor: theme.border }]} />
          </View>
          <ThemedText type="small" style={[styles.incompleteText, { color: theme.primary }]}>
            {t('feed.show_thread', 'Afficher la suite du fil')} ({hiddenIntermediateCount || 1}{' '}
            {hiddenIntermediateCount && hiddenIntermediateCount > 1
              ? t('feed.messages', 'messages')
              : t('feed.message', 'message')}{' '}
            {t('feed.more', 'de plus')})
          </ThemedText>
        </Pressable>
      ) : null}

      {/* Parent */}
      {parentPost ? (
        <ThoughtCard
          thought={parentPost}
          showThreadConnectorTop={!!rootPost}
          showThreadConnectorBottom
        />
      ) : null}

      {/* Target (la réponse) */}
      <ThoughtCard thought={targetPost} showThreadConnectorTop={!!(parentPost || rootPost)} />
    </View>
  );
}

const styles = StyleSheet.create({
  slice: {
    gap: Spacing.two,
  },
  incompleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingLeft: Spacing.three,
    paddingVertical: Spacing.one,
  },
  incompleteLine: {
    width: 36,
    alignItems: 'center',
  },
  // Connecteur plein (RN ne supporte pas borderStyle dashed en natif).
  dashed: {
    width: 2,
    height: 24,
    borderRadius: 1,
  },
  incompleteText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
