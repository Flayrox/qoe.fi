// =====================================================================
// 🃏 ThoughtCard — Carte pensée du feed (port fidèle Bluesky PostFeedItem)
// =====================================================================
// Layout Bluesky :
// 1. Zone bannière / Ligne supérieure (`showThreadConnectorTop`) au-dessus
// 2. Row principale avec layoutAvi (Avatar 42px + Ligne inférieure descendante `showThreadConnectorBottom`)
//    et layoutContent (Header auteur + PostContent + Actions).
// =====================================================================

import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pin } from 'lucide-react-native';
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

export const LINEAR_AVI_WIDTH = 42;

export function ThoughtCard({
  thought,
  showThreadConnectorTop = false,
  showThreadConnectorBottom = false,
  hideBottomBorder = false,
  onPressProfile,
  onReply,
  disableNavigation = false,
}: {
  thought: AnyThought;
  showThreadConnectorTop?: boolean;
  showThreadConnectorBottom?: boolean;
  hideBottomBorder?: boolean;
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

  const hasBanner =
    isPureRepost || post.isPinned || (post.parent && !isPureRepost && post.parent.author);

  return (
    <ThemedView
      type="card"
      style={[
        styles.card,
        !hideBottomBorder && {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.border,
        },
      ]}
    >
      {/* ─── 1. Bannière de repost / épinglé / mention (si présente) ─── */}
      {hasBanner && (
        <View style={styles.topRow}>
          <View style={styles.topAviCol} />
          <View style={styles.topBannerContent}>
            {isPureRepost ? (
              <RepostBanner
                username={display.author.username}
                name={display.author.name}
                onPress={() => openProfile(display.author.username || display.author.id)}
              />
            ) : null}
            {post.isPinned ? (
              <View style={styles.pinRow}>
                <Pin size={13} color={theme.primary} />
                <ThemedText type="small" style={{ color: theme.primary }}>
                  {t('feed.pinned', 'Épinglé')}
                </ThemedText>
              </View>
            ) : null}
            {post.parent && !isPureRepost && post.parent.author ? (
              <RepliedTo
                handle={post.parent.author.username || post.parent.author.name}
                userId={post.parent.author.id}
              />
            ) : null}
          </View>
        </View>
      )}

      {/* ─── 2. Layout principal Bluesky : Avatar 42px à gauche, Contenu à droite ─── */}
      <View style={styles.layout}>
        {/* Colonne Avatar + Lignes montante et descendante de fil */}
        <View style={styles.layoutAvi}>
          {/* Connecteur montant vers le post parent (sans marge ni coupure) */}
          {showThreadConnectorTop && !hasBanner ? (
            <View
              style={[
                styles.replyLine,
                {
                  backgroundColor: theme.border,
                  height: 12,
                  marginTop: -8, // Déborde parfaitement jusqu'au bord supérieur de la carte
                  marginBottom: 0,
                },
              ]}
            />
          ) : null}

          <Pressable onPress={() => openProfile(display.author.username || display.author.id)}>
            <View style={styles.avatarWrap}>
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
            </View>
          </Pressable>

          {/* Connecteur descendant vers le post enfant */}
          {showThreadConnectorBottom ? (
            <View
              style={[
                styles.replyLine,
                {
                  backgroundColor: theme.border,
                  flexGrow: 1,
                  marginTop: 0,
                  marginBottom: -8, // Déborde parfaitement jusqu'au bord inférieur de la carte
                },
              ]}
            />
          ) : null}
        </View>

        {/* Colonne Contenu (Header + PostContent + Actions) */}
        <View style={styles.layoutContent}>
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
    paddingLeft: 10,
    paddingRight: 15,
    paddingTop: 8,
    paddingBottom: 4,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  topThreadLineRow: {
    flexDirection: 'row',
  },
  topAviCol: {
    width: LINEAR_AVI_WIDTH + 18, // Exactement 60px (8 paddingLeft + 42 avi + 10 paddingRight)
    paddingLeft: 8,
    paddingRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBannerContent: {
    flex: 1,
  },
  pinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  layout: {
    flexDirection: 'row',
  },
  layoutAvi: {
    width: LINEAR_AVI_WIDTH + 18, // Exactement 60px (8 paddingLeft + 42 avi + 10 paddingRight)
    paddingLeft: 8,
    paddingRight: 10,
    alignItems: 'center',
  },
  avatarWrap: {
    width: LINEAR_AVI_WIDTH,
    height: LINEAR_AVI_WIDTH,
    borderRadius: LINEAR_AVI_WIDTH / 2,
    overflow: 'hidden',
  },
  avatar: {
    width: LINEAR_AVI_WIDTH,
    height: LINEAR_AVI_WIDTH,
    borderRadius: LINEAR_AVI_WIDTH / 2,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 16,
    fontWeight: '700',
  },
  replyLine: {
    width: 2,
    borderRadius: 1,
    alignSelf: 'center',
  },
  layoutContent: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.one,
    paddingBottom: 4,
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
