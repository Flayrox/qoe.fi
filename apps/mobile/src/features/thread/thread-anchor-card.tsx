// =====================================================================
// 🎯 ThreadAnchorCard — Le post focus d'un fil (Proportions Twitter / X)
// =====================================================================
// Header auteur (Avatar 44px + Nom raffiné semi-bold/Handle + Suivre),
// Traduction orange/vermillon aérée, Corps de texte 18px, Date Twitter,
// et barre d'actions 5 icônes.
// =====================================================================

import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Avatar } from '@/components/thought/avatar';
import { resolveDisplay } from '@/components/thought/normalize';
import { PostContent } from '@/components/thought/post-content';
import { ThoughtActions } from '@/components/thought/thought-actions';
import { ThreadFollowButton } from '@/features/thread/thread-follow-button';
import { formatPostDetailDate } from '@/lib/format';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-provider';
import { useMe } from '@/hooks/use-me';
import { useTheme } from '@/hooks/use-theme';
import { t } from '@/lib/i18n';
import type { NormalizedThought } from '@/components/thought/normalize';
import { OUTER_SPACE, REPLY_LINE_WIDTH, LINEAR_AVI_WIDTH } from './thread-post';

export function ThreadAnchorCard({
  post,
  showParentLine = false,
  onReply,
}: {
  post: NormalizedThought;
  showParentLine?: boolean;
  onReply?: (postId: string) => void;
}) {
  const theme = useTheme();
  const { display } = resolveDisplay(post);
  const { data: me } = useMe();
  const { session } = useAuth();
  const user = session?.user;

  const openProfile = () => {
    const username = display.author.username || display.author.id;
    router.push({ pathname: '/user/[username]', params: { username } });
  };

  const isOwn =
    (me?.id && display.author.id && me.id === display.author.id) ||
    (user?.id && display.author.id && user.id === display.author.id) ||
    (me?.username &&
      display.author.username &&
      me.username.toLowerCase() === display.author.username.toLowerCase()) ||
    (user?.user_metadata?.username &&
      display.author.username &&
      (user.user_metadata.username as string).toLowerCase() ===
        display.author.username.toLowerCase());

  const onTranslate = () => {
    void WebBrowser.openBrowserAsync(
      `https://translate.google.com/?sl=auto&tl=fr&text=${encodeURIComponent(display.content.slice(0, 900))}`
    );
  };

  return (
    <View style={styles.container}>
      {/* Ligne de parent (si ancêtres au-dessus) */}
      {showParentLine ? (
        <View style={styles.parentLineRow}>
          <View style={{ width: LINEAR_AVI_WIDTH }}>
            <View style={[styles.parentLine, { backgroundColor: theme.border }]} />
          </View>
        </View>
      ) : null}

      {/* ─── 1. En-tête Auteur : Avatar 44px + Nom fin semi-bold / Handle + Suivre ─── */}
      <View style={styles.headerRow}>
        <Pressable onPress={openProfile} style={styles.authorTouchArea}>
          <Avatar
            user={{
              name: display.author.name,
              username: display.author.username,
              logoUrl: display.author.logoUrl,
            }}
            sizeNumber={44}
            showCertified={display.author.isCertified}
          />
          <View style={styles.authorBlock}>
            <ThemedText style={styles.displayName} numberOfLines={1}>
              {display.author.name || display.author.username || '?'}
            </ThemedText>
            {display.author.username ? (
              <ThemedText style={[styles.handle, { color: theme.textSecondary }]} numberOfLines={1}>
                @{display.author.username}
              </ThemedText>
            ) : null}
          </View>
        </Pressable>

        {/* Côté droit : Bouton Suivre si autre utilisateur */}
        {!isOwn && display.author.username ? (
          <View style={styles.headerRight}>
            <ThreadFollowButton authorId={display.author.id} username={display.author.username} />
          </View>
        ) : null}
      </View>

      {/* ─── 2. Traduire la pensée (Orange / Vermillon aéré) ─── */}
      <Pressable onPress={onTranslate} style={styles.translateRow} hitSlop={6}>
        <Ionicons name="globe-outline" size={13} color="#EE4B2B" />
        <ThemedText style={styles.translateText}>
          {t('post.show_translation', 'Traduire la pensée')}
        </ThemedText>
      </Pressable>

      {/* ─── 3. Corps du texte en pleine largeur (18px) ─── */}
      <View style={styles.bodyContent}>
        <PostContent post={display} quoted={resolveDisplay(post).quoted} big truncate={false} />
      </View>

      {/* ─── 4. Date & Heure format Twitter : 18:19 · 18/08/2026 ─── */}
      <View style={styles.dateRow}>
        <ThemedText style={[styles.dateText, { color: theme.textSecondary }]}>
          {formatPostDetailDate(display.createdAt)}
        </ThemedText>
      </View>

      {/* ─── 5. Ligne de séparation supérieure ─── */}
      <View style={[styles.hairline, { backgroundColor: theme.border }]} />

      {/* ─── 6. Barre d'actions Twitter (5 icônes spacieuses) ─── */}
      <View style={styles.controlsRow}>
        <ThoughtActions post={display} size="lg" onReply={onReply} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: OUTER_SPACE,
    paddingTop: 4,
  },
  parentLineRow: {
    flexDirection: 'row',
    height: 12,
    marginTop: 2,
    marginBottom: 4,
  },
  parentLine: {
    width: REPLY_LINE_WIDTH,
    flex: 1,
    marginLeft: 'auto',
    marginRight: 'auto',
    borderRadius: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  authorTouchArea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    flex: 1,
    minWidth: 0,
  },
  authorBlock: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  displayName: {
    fontSize: 16.5,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  handle: {
    fontSize: 14.5,
    marginTop: 1,
  },
  headerRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginLeft: 8,
  },
  translateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    marginBottom: 6,
  },
  translateText: {
    color: '#EE4B2B',
    fontSize: 13,
    fontWeight: '500',
  },
  bodyContent: {
    marginTop: 2,
    marginBottom: 10,
  },
  dateRow: {
    marginTop: 2,
    marginBottom: 12,
  },
  dateText: {
    fontSize: 14,
  },
  controlsRow: {
    paddingTop: 8,
    paddingBottom: 2,
  },
  hairline: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
  },
});
