// =====================================================================
// 🃏 ThoughtCard — Carte pensée du feed (port de
//    .reference/bluesky/src/view/com/posts/PostFeedItem.tsx)
// =====================================================================
// Layout Bluesky : colonne avatar 42px à gauche (LINEAR_AVI_WIDTH),
// contenu à droite (header sans avatar + PostContent partagé + actions).
// Repost pur → bannière « a repartagé » + contenu d'origine ; citation →
// carte citée sous le texte (résolu via `resolveDisplay`).
// =====================================================================

import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { normalizeThought, resolveDisplay } from '@/components/thought/normalize';
import { PostContent } from '@/components/thought/post-content';
import { PostMenuButton } from '@/components/thought/post-menu';
import { RepliedTo } from '@/components/thought/replied-to';
import { RepostBanner } from '@/components/thought/repost-banner';
import { ThoughtActions } from '@/components/thought/thought-actions';
import { ThoughtHeader } from '@/components/thought/thought-header';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { t } from '@/lib/i18n';
import type { AnyThought } from './normalize';

export function ThoughtCard({
  thought,
  showThreadConnectorTop = false,
  showThreadConnectorBottom = false,
  onPressProfile,
  onReply,
  disableNavigation = false,
}: {
  thought: AnyThought;
  showThreadConnectorTop?: boolean;
  showThreadConnectorBottom?: boolean;
  onPressProfile?: (username: string) => void;
  onReply?: (postId: string) => void;
  /** Ne pas naviguer quand on tape sur la carte (post focus d'un fil). */
  disableNavigation?: boolean;
}) {
  const theme = useTheme();
  const post = normalizeThought(thought);
  const { display, quoted, isPureRepost } = resolveDisplay(post);

  const openThread = () => {
    if (disableNavigation) return;
    router.push({ pathname: '/thought/[id]', params: { id: post.id } });
  };

  const openProfile = (username?: string | null) => {
    if (!username) return;
    router.push({ pathname: '/user/[username]', params: { username } });
  };

  return (
    <ThemedView type="card" style={[styles.card, { borderBottomColor: theme.border }]}>
      {/* Bannières (alignées sous l'avatar, façon Bluesky) */}
      {isPureRepost ? (
        <View style={styles.banner}>
          <RepostBanner
            username={display.author.username}
            name={display.author.name}
            onPress={() => openProfile(display.author.username || display.author.id)}
          />
        </View>
      ) : null}
      {post.isPinned ? (
        <View style={styles.banner}>
          <ThemedText type="small" style={{ color: theme.primary }}>
            📌 {t('feed.pinned', 'Épinglé')}
          </ThemedText>
        </View>
      ) : null}
      {post.parent && !isPureRepost && post.parent.author ? (
        <View style={styles.banner}>
          <RepliedTo
            handle={post.parent.author.username || post.parent.author.name}
            userId={post.parent.author.id}
          />
        </View>
      ) : null}

      <View style={styles.contentRow}>
        {/* Colonne avatar + connecteurs de fil */}
        <View style={styles.avatarColumn}>
          {showThreadConnectorTop ? (
            <View style={[styles.connector, { backgroundColor: theme.border }]} />
          ) : null}
          <Pressable onPress={() => openProfile(display.author.username || display.author.id)}>
            <ThemedView style={styles.avatarWrap}>
              {display.author.logoUrl ? (
                <Image
                  source={{ uri: display.author.logoUrl }}
                  style={styles.avatar}
                  contentFit="cover"
                  transition={150}
                />
              ) : (
                <ThemedView
                  type="backgroundSelected"
                  style={[styles.avatar, styles.avatarFallback]}
                >
                  <ThemedText style={styles.avatarInitial}>
                    {(display.author.name || display.author.username || '?')
                      .charAt(0)
                      .toUpperCase()}
                  </ThemedText>
                </ThemedView>
              )}
            </ThemedView>
          </Pressable>
          {showThreadConnectorBottom ? (
            <View style={[styles.connector, { backgroundColor: theme.border }]} />
          ) : null}
        </View>

        {/* Colonne contenu */}
        <View style={styles.contentColumn}>
          <View style={styles.headerRow}>
            <View style={styles.headerMeta}>
              <ThoughtHeader
                author={display.author}
                createdAt={display.createdAt}
                size="sm"
                showAvatar={false}
                onPressProfile={onPressProfile}
              />
            </View>
            <PostMenuButton post={display} />
          </View>

          <PostContent post={display} quoted={quoted} onPress={openThread} />

          <ThoughtActions post={display} size="sm" onReply={onReply} />
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    // Parité web (ThoughtCardContainer) : carte blanche sur page grise,
    // séparée par une hairline en bas — pas de carte grise arrondie.
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    gap: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    // Aligné sous l'avatar : 42 (LINEAR_AVI_WIDTH) + gap 8 + paddingLeft 8.
    paddingLeft: 50,
  },
  contentRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  avatarColumn: {
    alignItems: 'center',
    width: 42, // LINEAR_AVI_WIDTH (Bluesky)
    paddingLeft: 8,
  },
  avatarWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    overflow: 'hidden',
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 15,
    fontWeight: '600',
  },
  connector: {
    width: 2,
    flex: 1,
    minHeight: 8,
    borderRadius: 1,
    marginVertical: 2,
  },
  contentColumn: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.one,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.one,
  },
  headerMeta: {
    flex: 1,
    minWidth: 0,
  },
});
