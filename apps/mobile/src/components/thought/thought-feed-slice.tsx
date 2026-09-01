import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ThoughtCard } from '@/components/thought/thought-card';
import { ViewFullThread } from '@/components/thought/view-full-thread';
import { t } from '@/lib/i18n';
import type { FeedSlice } from '@qoe/sdk/mobile';

// =====================================================================
// 🧵 ThoughtFeedSlice — Rendu d'un élément du feed (port de
//    apps/core/.../ThoughtFeedSlice.tsx)
// =====================================================================
// 4 cas :
//   1. Post isolé (pas de parent/root) → ThoughtCard simple.
//   2. Fil multi-posts : Root → [séparateur pointillé si incomplet] →
//      Parent → Target (la réponse), reliés par connecteurs verticaux.
// =====================================================================

export function ThoughtFeedSlice({ slice }: { slice: FeedSlice }) {
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
    <View style={styles.slice}>
      {/* Root */}
      {rootPost ? (
        <ThoughtCard
          thought={rootPost}
          showThreadConnectorBottom={!!parentPost || true}
          hideBottomBorder={true}
        />
      ) : null}

      {/* Séparateur « Afficher la suite du fil » avec pointillés SVG Bluesky si incomplet */}
      {isIncompleteThread ? (
        <ViewFullThread
          onPress={openRootThread}
          label={`${t('feed.show_thread', 'Afficher la suite du fil')} (${hiddenIntermediateCount || 1} ${(hiddenIntermediateCount ?? 1) > 1 ? t('feed.messages', 'messages') : t('feed.message', 'message')} ${t('feed.more', 'de plus')})`}
        />
      ) : null}

      {/* Parent */}
      {parentPost ? (
        <ThoughtCard
          thought={parentPost}
          showThreadConnectorTop={!!rootPost}
          showThreadConnectorBottom
          hideBottomBorder={true}
        />
      ) : null}

      {/* Target (la réponse) */}
      <ThoughtCard
        thought={targetPost}
        showThreadConnectorTop={!!(parentPost || rootPost)}
        hideBottomBorder={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  slice: {
    gap: 0,
  },
});
