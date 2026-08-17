import { router } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ShareMenuButton } from '@/components/thought/share-menu';
import { ActionSheet, type ActionSheetGroup } from '@/components/ui/action-sheet';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { apiClient } from '@/lib/api';
import { t } from '@/lib/i18n';
import {
  updatePostShadow,
  usePostShadow,
  type ApiResult,
  type PostShadow,
} from '@qoe/api-client/mobile';

// =====================================================================
// ⚡ ThoughtActions — Barre d'actions d'une pensée (mobile)
// =====================================================================
// Like / Reply / Repost / Share, avec optimistic UI via le shadow store
// (@qoe/api-client/mobile) : on bascule l'état immédiatement, on appelle
// l'API, et on rollback si l'appel échoue (ou on confirme l'état serveur).
// ⚠️ L'API Go ne renvoie pas les compteurs sur toggleLike/Repost — les
//    compteurs sont dérivés du delta serveur/shadow (cf. shadow.ts).
// =====================================================================

export interface ThoughtActionsPost {
  id: string;
  liked?: boolean;
  reposted?: boolean;
  likeCount?: number;
  repostCount?: number;
  replyCount?: number;
  author?: { id: string; username?: string | null; subdomain?: string | null } | null;
  content?: string;
}

type IconName = SymbolViewProps['name'];

const ICONS: Record<
  'like' | 'likeOn' | 'reply' | 'repost' | 'repostOn' | 'quote' | 'share',
  IconName
> = {
  like: { ios: 'heart', android: 'favorite', web: 'favorite' },
  likeOn: { ios: 'heart.fill', android: 'favorite', web: 'favorite' },
  reply: { ios: 'bubble.right', android: 'chat_bubble_outline', web: 'chat_bubble_outline' },
  repost: { ios: 'arrow.2.squarepath', android: 'repeat', web: 'repeat' },
  repostOn: { ios: 'arrow.2.squarepath', android: 'repeat', web: 'repeat' },
  quote: { ios: 'text.quote', android: 'format_quote', web: 'format_quote' },
  share: { ios: 'square.and.arrow.up', android: 'share', web: 'share' },
};

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
  // Fusionne l'état serveur (post) avec l'état optimiste (shadow).
  const shadow = usePostShadow(post as ThoughtActionsPost & { id?: string });
  const [busy, setBusy] = useState<null | 'like' | 'repost'>(null);
  const [repostMenu, setRepostMenu] = useState(false);

  const liked = !!shadow.liked;
  const reposted = !!shadow.reposted;
  const likeCount = shadow.likeCount ?? 0;
  const repostCount = shadow.repostCount ?? 0;
  const replyCount = shadow.replyCount ?? 0;

  const iconSize = size === 'lg' ? 22 : size === 'sm' ? 18 : 20;
  const labelSize = size === 'sm' ? 12 : 13;

  async function runToggle(
    kind: 'like' | 'repost',
    next: boolean,
    api: () => Promise<ApiResult<{ liked?: boolean; reposted?: boolean }>>
  ) {
    // Optimistic : applique le shadow immédiatement.
    const patch: PostShadow = kind === 'like' ? { liked: next } : { reposted: next };
    updatePostShadow(post.id, patch);
    setBusy(kind);
    try {
      const res = await api();
      if (res.ok) {
        // Confirme l'état serveur (peut différer du shadow en cas de course).
        const confirmed: PostShadow =
          kind === 'like' ? { liked: !!res.data.liked } : { reposted: !!res.data.reposted };
        updatePostShadow(post.id, confirmed);
      } else {
        // Rollback.
        updatePostShadow(post.id, kind === 'like' ? { liked: liked } : { reposted: reposted });
      }
    } catch {
      updatePostShadow(post.id, kind === 'like' ? { liked: liked } : { reposted: reposted });
    } finally {
      setBusy(null);
    }
  }

  const handleLike = () => {
    if (busy) return;
    void runToggle('like', !liked, () => apiClient.toggleLike(post.id));
  };

  // Tap → menu Repost/Quote (parité Bluesky RepostButton) ; long-press → citer.
  const handleRepost = () => {
    if (busy) return;
    setRepostMenu(true);
  };

  const runRepost = () => {
    setRepostMenu(false);
    void runToggle('repost', !reposted, () => apiClient.toggleRepost(post.id));
  };

  const quoteFromMenu = () => {
    setRepostMenu(false);
    handleQuote();
  };

  const repostGroups: ActionSheetGroup[] = [
    {
      items: [
        {
          key: 'repost',
          label: reposted
            ? t('feed.remove_repost', 'Retirer le repost')
            : t('feed.repost', 'Repartager'),
          icon: ICONS.repost,
          onPress: runRepost,
          disabled: busy !== null,
        },
        {
          key: 'quote',
          label: t('feed.quote_post', 'Citer la pensée'),
          icon: ICONS.quote,
          onPress: quoteFromMenu,
        },
      ],
    },
  ];

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
    // Citer : ouvre le composer avec repostId (la pensée est référencée).
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

  const shareUrl = `https://qoe.fi/thought/${post.author?.username || post.author?.subdomain || post.author?.id || 'author'}/${post.id}`;

  return (
    <View style={styles.row}>
      {/* Actions primaires (gauche) — parité Bluesky : Reply, Repost, Like */}
      <View style={styles.primary}>
        {/* Reply */}
        <Pressable
          onPress={handleReply}
          hitSlop={8}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
          accessibilityLabel={t('feed.reply', 'Répondre')}
        >
          <SymbolView
            name={ICONS.reply}
            size={iconSize}
            tintColor={theme.textSecondary}
            weight="regular"
          />
          {replyCount > 0 ? (
            <ThemedText
              type="small"
              style={[styles.count, { color: theme.textSecondary, fontSize: labelSize }]}
            >
              {replyCount}
            </ThemedText>
          ) : null}
        </Pressable>

        {/* Repost — tap : menu Repost/Quote ; long-press : citer (parité Bluesky) */}
        <Pressable
          onPress={handleRepost}
          onLongPress={handleQuote}
          delayLongPress={350}
          hitSlop={8}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
          accessibilityLabel={t('feed.repost', 'Repartager')}
        >
          <SymbolView
            name={reposted ? ICONS.repostOn : ICONS.repost}
            size={iconSize}
            tintColor={reposted ? theme.success : theme.textSecondary}
            weight={reposted ? 'bold' : 'regular'}
          />
          {repostCount > 0 ? (
            <ThemedText
              type="small"
              style={[
                styles.count,
                { color: reposted ? theme.success : theme.textSecondary, fontSize: labelSize },
              ]}
            >
              {repostCount}
            </ThemedText>
          ) : null}
        </Pressable>

        <ActionSheet
          visible={repostMenu}
          title={t('feed.repost_menu', 'Repartager ou citer')}
          groups={repostGroups}
          onClose={() => setRepostMenu(false)}
        />

        {/* Like */}
        <Pressable
          onPress={handleLike}
          hitSlop={8}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
          accessibilityLabel={t('feed.like', 'J’aime')}
        >
          <SymbolView
            name={liked ? ICONS.likeOn : ICONS.like}
            size={iconSize}
            tintColor={liked ? theme.primary : theme.textSecondary}
            weight="regular"
          />
          {likeCount > 0 ? (
            <ThemedText
              type="small"
              style={[
                styles.count,
                { color: liked ? theme.primary : theme.textSecondary, fontSize: labelSize },
              ]}
            >
              {likeCount}
            </ThemedText>
          ) : null}
        </Pressable>
      </View>

      {/* Actions secondaires (droite) — Share (Quote est dans le menu Repost, parité Bluesky) */}
      <View style={styles.secondary}>
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
    marginTop: Spacing.two,
  },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
  },
  secondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  pressed: {
    opacity: 0.5,
  },
  count: {
    lineHeight: 18,
  },
});
