import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ShareMenuButton } from '@/components/thought/share-menu';
import { ActionSheet, type ActionSheetGroup } from '@/components/ui/action-sheet';
import { Toast } from '@/components/ui/toast';
import { useTheme } from '@/hooks/use-theme';
import { apiClient } from '@/lib/api';
import { formatCount } from '@/lib/format';
import { playHaptic } from '@/lib/haptics';
import { t } from '@/lib/i18n';
import { updatePostShadow, usePostShadow, type ApiResult, type PostShadow } from '@qoe/sdk/mobile';

// =====================================================================
// ⚡ ThoughtActions — Barre d'actions Twitter / X (5 icônes vectorielles)
// =====================================================================
// Reply, Repost, Like, Bookmark, Share avec icônes vectorielles ultra-nettes.
// =====================================================================

export interface ThoughtActionsPost {
  id: string;
  liked?: boolean;
  reposted?: boolean;
  bookmarked?: boolean;
  likeCount?: number;
  repostCount?: number;
  replyCount?: number;
  bookmarkCount?: number;
  author?: { id: string; username?: string | null; subdomain?: string | null } | null;
  content?: string;
}

export function ThoughtActions({
  post,
  size = 'md',
  onReply,
}: {
  post: ThoughtActionsPost;
  size?: 'sm' | 'md' | 'lg';
  onReply?: (postId: string) => void;
}) {
  const theme = useTheme();
  const shadow = usePostShadow(post as ThoughtActionsPost & { id?: string });
  const [busy, setBusy] = useState<null | 'like' | 'repost' | 'bookmark'>(null);
  const [repostMenu, setRepostMenu] = useState(false);

  const liked = !!shadow.liked;
  const reposted = !!shadow.reposted;
  const bookmarked = !!(shadow as any).bookmarked;

  const likeCount = shadow.likeCount ?? 0;
  const repostCount = shadow.repostCount ?? 0;
  const replyCount = shadow.replyCount ?? 0;
  const bookmarkCount = (shadow as any).bookmarkCount ?? 0;

  const iconSize = size === 'lg' ? 20 : size === 'sm' ? 16 : 18;
  const labelSize = size === 'lg' ? 13 : 12;

  async function runToggle(
    kind: 'like' | 'repost' | 'bookmark',
    next: boolean,
    api: () => Promise<ApiResult<any>>
  ) {
    const patch: PostShadow =
      kind === 'like'
        ? { liked: next }
        : kind === 'repost'
          ? { reposted: next }
          : { bookmarked: next };

    updatePostShadow(post.id, patch);
    setBusy(kind);
    playHaptic('Light');

    try {
      const res = await api();
      if (res.ok) {
        const confirmed: PostShadow =
          kind === 'like'
            ? { liked: !!res.data?.liked }
            : kind === 'repost'
              ? { reposted: !!res.data?.reposted }
              : { bookmarked: !!res.data?.bookmarked };
        updatePostShadow(post.id, confirmed);
      } else {
        updatePostShadow(
          post.id,
          kind === 'like' ? { liked } : kind === 'repost' ? { reposted } : { bookmarked }
        );
      }
    } catch {
      updatePostShadow(
        post.id,
        kind === 'like' ? { liked } : kind === 'repost' ? { reposted } : { bookmarked }
      );
    } finally {
      setBusy(null);
    }
  }

  const handleLike = () => {
    if (busy) return;
    void runToggle('like', !liked, () => apiClient.toggleLike(post.id));
  };

  const handleRepost = () => {
    if (busy) return;
    setRepostMenu(true);
  };

  const runRepost = () => {
    setRepostMenu(false);
    void runToggle('repost', !reposted, () => apiClient.toggleRepost(post.id));
  };

  const handleBookmark = () => {
    if (busy) return;
    void runToggle('bookmark', !bookmarked, async () => {
      const res = await apiClient.toggleBookmark(post.id, 'thought');
      if (res.ok) {
        Toast.show(
          !bookmarked
            ? t('post.bookmarked', 'Ajouté à vos signets')
            : t('post.unbookmarked', 'Retiré de vos signets'),
          'success'
        );
      }
      return res;
    });
  };

  const handleReply = () => {
    if (onReply) {
      onReply(post.id);
      return;
    }
    const handle = post.author?.username || post.author?.subdomain || undefined;
    router.push({
      pathname: '/compose',
      params: { parentId: post.id, replyingTo: handle ?? '' },
    });
  };

  const handleQuote = () => {
    setRepostMenu(false);
    const handle = post.author?.username || post.author?.subdomain || undefined;
    router.push({
      pathname: '/compose',
      params: {
        repostId: post.id,
        quotedAuthor: handle ?? '',
        quotedText: (post.content ?? '').slice(0, 140),
      },
    });
  };

  const repostGroups: ActionSheetGroup[] = [
    {
      items: [
        {
          key: 'repost',
          label: reposted
            ? t('feed.remove_repost', 'Retirer le repost')
            : t('feed.repost', 'Repartager'),
          icon: { ios: 'arrow.2.squarepath', android: 'repeat', web: 'repeat' },
          onPress: runRepost,
          disabled: busy !== null,
        },
        {
          key: 'quote',
          label: t('feed.quote_post', 'Citer la pensée'),
          icon: { ios: 'text.quote', android: 'format_quote', web: 'format_quote' },
          onPress: handleQuote,
        },
      ],
    },
  ];

  const shareUrl = `https://qoe.fi/thought/${post.author?.username || post.author?.subdomain || post.author?.id || 'author'}/${post.id}`;

  return (
    <View style={styles.row}>
      {/* 1. Reply (Bulle Twitter) */}
      <Pressable
        onPress={handleReply}
        hitSlop={8}
        style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        accessibilityLabel={t('feed.reply', 'Répondre')}
      >
        <Ionicons name="chatbubble-outline" size={iconSize} color={theme.textSecondary} />
        {replyCount > 0 ? (
          <ThemedText
            type="small"
            style={[styles.count, { color: theme.textSecondary, fontSize: labelSize }]}
          >
            {formatCount(replyCount)}
          </ThemedText>
        ) : null}
      </Pressable>

      {/* 2. Repost (Flèches cycle Twitter) */}
      <Pressable
        onPress={handleRepost}
        onLongPress={handleQuote}
        delayLongPress={350}
        hitSlop={8}
        style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        accessibilityLabel={t('feed.repost', 'Repartager')}
      >
        <Ionicons
          name="repeat"
          size={iconSize + 2}
          color={reposted ? '#00BA7C' : theme.textSecondary}
        />
        {repostCount > 0 ? (
          <ThemedText
            type="small"
            style={[
              styles.count,
              { color: reposted ? '#00BA7C' : theme.textSecondary, fontSize: labelSize },
            ]}
          >
            {formatCount(repostCount)}
          </ThemedText>
        ) : null}
      </Pressable>

      <ActionSheet
        visible={repostMenu}
        title={t('feed.repost_menu', 'Repartager ou citer')}
        groups={repostGroups}
        onClose={() => setRepostMenu(false)}
      />

      {/* 3. Like (Cœur Twitter) */}
      <Pressable
        onPress={handleLike}
        hitSlop={8}
        style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        accessibilityLabel={t('feed.like', 'J’aime')}
      >
        <Ionicons
          name={liked ? 'heart' : 'heart-outline'}
          size={iconSize + 1}
          color={liked ? '#F91880' : theme.textSecondary}
        />
        {likeCount > 0 ? (
          <ThemedText
            type="small"
            style={[
              styles.count,
              { color: liked ? '#F91880' : theme.textSecondary, fontSize: labelSize },
            ]}
          >
            {formatCount(likeCount)}
          </ThemedText>
        ) : null}
      </Pressable>

      {/* 4. Bookmark (Signet Twitter) */}
      <Pressable
        onPress={handleBookmark}
        hitSlop={8}
        style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        accessibilityLabel={t('post.bookmark', 'Enregistrer')}
      >
        <Ionicons
          name={bookmarked ? 'bookmark' : 'bookmark-outline'}
          size={iconSize}
          color={bookmarked ? '#1D9BF0' : theme.textSecondary}
        />
        {bookmarkCount > 0 ? (
          <ThemedText
            type="small"
            style={[
              styles.count,
              { color: bookmarked ? '#1D9BF0' : theme.textSecondary, fontSize: labelSize },
            ]}
          >
            {formatCount(bookmarkCount)}
          </ThemedText>
        ) : null}
      </Pressable>

      {/* 5. Share (Partage Twitter) */}
      <View style={styles.action}>
        <ShareMenuButton url={shareUrl} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 14,
    paddingVertical: 2,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    minHeight: 32,
    paddingHorizontal: 4,
  },
  pressed: {
    opacity: 0.6,
  },
  count: {
    fontWeight: '500',
    lineHeight: 18,
  },
});
