// =====================================================================
// 🧵 ThreadPost — Un post parent/réponse dans un fil (port fidèle de
//    .reference/bluesky/src/screens/PostThread/components/ThreadItemPost.tsx)
// =====================================================================
// Layout « linear » Bluesky : ligne de parent au-dessus (gap 12px) si
// `showParentLine`, avatar 42px avec ligne d'enfant en dessous si
// `showChildLine`, contenu à droite (PostMeta + PostContent + actions).
// Utilise le PostContent partagé → sondages/images/citations identiques
// au feed.
// =====================================================================

import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Avatar } from '@/components/thought/avatar';
import { resolveDisplay } from '@/components/thought/normalize';
import { PostContent } from '@/components/thought/post-content';
import { ThoughtActions } from '@/components/thought/thought-actions';
import { TimeElapsed } from '@/components/thought/time-elapsed';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { NormalizedThought } from '@/components/thought/normalize';

export const LINEAR_AVI_WIDTH = 42;
export const REPLY_LINE_WIDTH = 2;
export const OUTER_SPACE = 10;

export function ThreadPost({
  post,
  showParentLine = false,
  showChildLine = false,
  indent = 0,
  onReply,
}: {
  post: NormalizedThought;
  showParentLine?: boolean;
  showChildLine?: boolean;
  /** Profondeur d'imbrication (réponses de réponses) → retrait gauche. */
  indent?: number;
  onReply?: (postId: string) => void;
}) {
  const theme = useTheme();
  const { display, quoted } = resolveDisplay(post);

  const openProfile = () => {
    const username = display.author.username || display.author.id;
    router.push({ pathname: '/user/[username]', params: { username } });
  };

  const openThread = () => {
    router.push({ pathname: '/thought/[id]', params: { id: post.id } });
  };

  return (
    <View style={{ paddingHorizontal: OUTER_SPACE, paddingLeft: OUTER_SPACE + indent * 30 }}>
      {/* Ligne de parent (gap vertical au-dessus, relié au post précédent) */}
      <View style={styles.parentLineRow}>
        <View style={{ width: LINEAR_AVI_WIDTH }}>
          {showParentLine ? (
            <View style={[styles.parentLine, { backgroundColor: theme.border }]} />
          ) : null}
        </View>
      </View>

      <View style={styles.bodyRow}>
        {/* Colonne avatar + ligne d'enfant */}
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

        {/* Colonne contenu */}
        <View style={styles.content}>
          {/* PostMeta (petit) : nom + handle + temps */}
          <View style={styles.metaRow}>
            <View style={styles.metaText}>
              <Pressable onPress={openProfile} style={styles.metaText}>
                <ThemedText type="small" numberOfLines={1} style={styles.name}>
                  {display.author.name || display.author.username || '?'}
                </ThemedText>
                {display.author.username ? (
                  <ThemedText type="small" numberOfLines={1} style={{ color: theme.textSecondary }}>
                    @{display.author.username}
                  </ThemedText>
                ) : null}
              </Pressable>
              <TimeElapsed timestamp={display.createdAt} />
            </View>
          </View>

          <PostContent post={display} quoted={quoted} onPress={openThread} />

          <ThoughtActions post={display} size="sm" onReply={onReply} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  parentLineRow: {
    flexDirection: 'row',
    height: 12,
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
    paddingBottom: Spacing.one,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaText: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  name: {
    fontWeight: '700',
  },
});
