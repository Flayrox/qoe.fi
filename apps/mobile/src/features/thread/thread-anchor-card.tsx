// =====================================================================
// 🎯 ThreadAnchorCard — Le post focus d'un fil, en « agrandi » (port
//    fidèle de .reference/bluesky/src/screens/PostThread/components/
//    ThreadItemAnchor.tsx)
// =====================================================================
// Avatar 42 + nom/handle empilés + bouton suivre, texte en grand
// (PostContent big, sans troncature), rangée de stats (reposts · j'aime ·
// réponses), actions « big », puis date absolue + qui peut répondre.
// =====================================================================

import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Avatar } from '@/components/thought/avatar';
import { resolveDisplay } from '@/components/thought/normalize';
import { PostContent } from '@/components/thought/post-content';
import { ThoughtActions } from '@/components/thought/thought-actions';
import { ThreadFollowButton } from '@/features/thread/thread-follow-button';
import { niceDate, formatCount } from '@/lib/format';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { NormalizedThought } from '@/components/thought/normalize';
import { LINEAR_AVI_WIDTH, REPLY_LINE_WIDTH, OUTER_SPACE } from './thread-post';

export function ThreadAnchorCard({
  post,
  showParentLine = false,
  showChildLine = false,
  onReply,
}: {
  post: NormalizedThought;
  showParentLine?: boolean;
  showChildLine?: boolean;
  onReply?: (postId: string) => void;
}) {
  const theme = useTheme();
  const { display } = resolveDisplay(post);

  const openProfile = () => {
    const username = display.author.username || display.author.id;
    router.push({ pathname: '/user/[username]', params: { username } });
  };

  const stats: Array<{ count: number; label: string }> = [
    { count: display.repostCount, label: 'reposts' },
    { count: display.likeCount, label: 'j’aime' },
    { count: display.replyCount, label: 'réponses' },
  ].filter((s) => s.count > 0);

  return (
    <View style={{ paddingHorizontal: OUTER_SPACE }}>
      {/* Ligne de parent (si le post a des ancêtres au-dessus) */}
      {showParentLine ? (
        <View style={styles.parentLineRow}>
          <View style={{ width: LINEAR_AVI_WIDTH }}>
            <View style={[styles.parentLine, { backgroundColor: theme.border }]} />
          </View>
        </View>
      ) : null}

      <View style={styles.bodyRow}>
        {/* Avatar + ligne d'enfant */}
        <View style={styles.aviCol}>
          <Avatar
            user={{
              name: display.author.name,
              username: display.author.username,
              logoUrl: display.author.logoUrl,
            }}
            sizeNumber={LINEAR_AVI_WIDTH}
            showCertified={display.author.isCertified}
          />
          {showChildLine ? (
            <View style={[styles.childLine, { backgroundColor: theme.border }]} />
          ) : null}
        </View>

        {/* Contenu agrandi */}
        <View style={styles.content}>
          {' '}
          {/* Nom + handle empilés + bouton Suivre (parité Bluesky) */}
          <View style={styles.authorRow}>
            <View style={styles.authorBlock}>
              <ThemedText style={styles.displayName} numberOfLines={1} onPress={openProfile}>
                {display.author.name || display.author.username || '?'}
              </ThemedText>
              {display.author.username ? (
                <ThemedText
                  style={{ color: theme.textSecondary }}
                  numberOfLines={1}
                  onPress={openProfile}
                >
                  @{display.author.username}
                </ThemedText>
              ) : null}
            </View>
            {display.author.username ? (
              <ThreadFollowButton authorId={display.author.id} username={display.author.username} />
            ) : null}
          </View>
          {/* Corps en grand, sans troncature */}
          <PostContent post={display} quoted={resolveDisplay(post).quoted} big truncate={false} />
          {/* Stats */}
          {stats.length > 0 ? (
            <View
              style={[
                styles.statsRow,
                { borderTopColor: theme.border, borderBottomColor: theme.border },
              ]}
            >
              {stats.map((s) => (
                <ThemedText key={s.label} style={{ color: theme.textSecondary }}>
                  <ThemedText style={[styles.statCount, { color: theme.text }]}>
                    {formatCount(s.count)}
                  </ThemedText>{' '}
                  {s.label}
                </ThemedText>
              ))}
            </View>
          ) : null}
          {/* Actions big */}
          <View style={styles.controls}>
            <ThoughtActions post={display} size="lg" onReply={onReply} />
          </View>
          {/* Date absolue */}
          <View style={styles.footerMeta}>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              {niceDate(display.createdAt)}
            </ThemedText>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  parentLineRow: {
    flexDirection: 'row',
    height: 12,
    marginTop: 4,
  },
  parentLine: {
    width: REPLY_LINE_WIDTH,
    flex: 1,
    marginLeft: 'auto',
    marginRight: 'auto',
    borderRadius: 1,
  },
  bodyRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingTop: Spacing.three,
  },
  aviCol: {
    width: LINEAR_AVI_WIDTH,
    alignItems: 'center',
  },
  childLine: {
    width: REPLY_LINE_WIDTH,
    flex: 1,
    marginTop: 4,
    borderRadius: 1,
  },
  content: {
    flex: 1,
    minWidth: 0,
    paddingBottom: Spacing.three,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.two,
    marginBottom: Spacing.two,
  },
  authorBlock: {
    flex: 1,
    gap: 1,
  },
  displayName: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 22,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginTop: Spacing.three,
    paddingVertical: Spacing.two,
  },
  statCount: {
    fontWeight: '700',
  },
  controls: {
    marginTop: Spacing.one,
  },
  footerMeta: {
    gap: Spacing.one,
    marginTop: Spacing.two,
  },
});
