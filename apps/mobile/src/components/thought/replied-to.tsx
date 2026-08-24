import { SymbolView } from 'expo-symbols';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-provider';
import { useTheme } from '@/hooks/use-theme';
import { t } from '@/lib/i18n';

// =====================================================================
// ↩️ RepliedTo — ligne « En réponse à @x » (port Bluesky PostRepliedTo)
// =====================================================================
// Bluesky : flèche coudée `ArrowCornerDownRight` (xs) + texte muted
// « Replied to X » / « Replied to you » sur une seule ligne.
// =====================================================================

export function RepliedTo({
  handle,
  userId,
  isBlocked,
  isNotFound,
}: {
  handle?: string | null;
  userId?: string | null;
  isBlocked?: boolean;
  isNotFound?: boolean;
}) {
  const theme = useTheme();
  const { session } = useAuth();
  const currentUserId = session?.user?.id;

  const isMe = !!(userId && currentUserId && userId === currentUserId);

  const openProfile = () => {
    if (handle) {
      router.push({ pathname: '/user/[username]', params: { username: handle } });
    } else if (userId) {
      router.push({ pathname: '/user/[username]', params: { username: userId } });
    }
  };

  let labelNode = null;
  if (isBlocked) {
    labelNode = (
      <ThemedText type="small" style={{ color: theme.textSecondary }}>
        {t('feed.replied_blocked', 'En réponse à une pensée masquée')}
      </ThemedText>
    );
  } else if (isNotFound) {
    labelNode = (
      <ThemedText type="small" style={{ color: theme.textSecondary }}>
        {t('feed.replied_unknown', 'En réponse à une pensée')}
      </ThemedText>
    );
  } else if (isMe) {
    labelNode = (
      <ThemedText type="small" style={{ color: theme.textSecondary }}>
        {t('feed.replied_to_you', 'En réponse à votre pensée')}
      </ThemedText>
    );
  } else if (handle) {
    labelNode = (
      <Pressable onPress={openProfile} hitSlop={4}>
        <ThemedText type="small" numberOfLines={1} style={{ color: theme.textSecondary }}>
          {t('feed.in_reply_to', 'En réponse à')}{' '}
          <ThemedText type="small" style={[styles.strong, { color: theme.textSecondary }]}>
            @{handle}
          </ThemedText>
        </ThemedText>
      </Pressable>
    );
  } else {
    return null;
  }

  return (
    <View style={styles.row}>
      <SymbolView
        name={{
          ios: 'arrow.turn.down.right',
          android: 'subdirectory_arrow_right',
          web: 'subdirectory_arrow_right',
        }}
        size={12}
        tintColor={theme.textSecondary}
        weight="medium"
        style={styles.icon}
      />
      <View style={styles.labelContainer}>{labelNode}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingBottom: 2,
  },
  icon: {
    marginTop: -1,
  },
  labelContainer: {
    flexShrink: 1,
  },
  strong: {
    fontWeight: '600',
  },
});
