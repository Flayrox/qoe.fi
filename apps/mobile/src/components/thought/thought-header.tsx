import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Avatar, type AvatarUser } from '@/components/thought/avatar';
import { CertifiedBadge } from '@/components/ui/badge';
import { TimeElapsed } from '@/components/thought/time-elapsed';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// =====================================================================
// 🧑 ThoughtHeader — Ligne d'auteur d'une carte pensée.
// Avatar (pressable → profil) + nom + handle @username + temps relatif.
// =====================================================================

export function ThoughtHeader({
  author,
  createdAt,
  size = 'md',
  showAvatar = true,
  onPressProfile,
}: {
  author: AvatarUser & { username?: string | null; id?: string; isCertified?: boolean };
  createdAt: string;
  size?: 'sm' | 'md';
  /** L'avatar est rendu dans la colonne de gauche de ThoughtCard — on peut
   *  le masquer ici pour éviter un double affichage (fix bug « photo 2× »). */
  showAvatar?: boolean;
  onPressProfile?: (username: string) => void;
}) {
  const theme = useTheme();
  const handle = author?.username ? `@${author.username}` : null;
  const avatarSize = size === 'sm' ? 'sm' : 'md';

  const openProfile = () => {
    const username = author?.username || author?.id;
    if (!username) return;
    if (onPressProfile) {
      onPressProfile(username);
      return;
    }
    router.push({ pathname: '/user/[username]', params: { username } });
  };

  return (
    <View style={styles.row}>
      {showAvatar ? (
        <Pressable onPress={openProfile} hitSlop={6}>
          <Avatar user={author} size={avatarSize} />
        </Pressable>
      ) : null}
      <Pressable onPress={openProfile} style={styles.meta} hitSlop={6}>
        <View style={styles.nameRow}>
          <ThemedText type="small" numberOfLines={1} style={styles.name}>
            {author?.name || author?.username || '?'}
          </ThemedText>
          {author?.isCertified ? <CertifiedBadge size={13} /> : null}
          {author?.name && handle ? (
            <ThemedText
              type="small"
              style={[styles.handle, { color: theme.textSecondary }]}
              numberOfLines={1}
            >
              {handle}
            </ThemedText>
          ) : null}
        </View>
        <TimeElapsed timestamp={createdAt} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  meta: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  name: {
    fontWeight: '700',
  },
  handle: {
    opacity: 0.6,
  },
  time: {
    opacity: 0.6,
  },
});
