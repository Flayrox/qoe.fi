import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { t } from '@/lib/i18n';

// =====================================================================
// 🔁 RepostBanner — bannière « X a repartagé » (port de
//    .reference/bluesky/src/view/com/posts/PostFeedReason.tsx, cas ReasonRepost)
// =====================================================================
// Bluesky : icône repost 13×13 + « Reposted by X » en text_contrast_medium,
// cliquable (ouvre le profil du repartageur). Ici : SF Symbol repeat +
// « X a repartagé », aligné sous l'avatar (paddingLeft 44).
// =====================================================================

export function RepostBanner({
  username,
  name,
  onPress,
}: {
  username?: string | null;
  name?: string | null;
  onPress?: () => void;
}) {
  const theme = useTheme();
  const label = name || username || '…';
  return (
    <View style={styles.row}>
      <SymbolView
        name={{ ios: 'arrow.2.squarepath', android: 'repeat', web: 'repeat' }}
        size={13}
        tintColor={theme.textSecondary}
        weight="regular"
      />
      <ThemedText
        type="small"
        numberOfLines={1}
        style={[styles.label, { color: theme.textSecondary }]}
      >
        <ThemedText type="small" style={styles.strong} onPress={onPress}>
          {label}
        </ThemedText>{' '}
        {t('feed.reposted', 'a repartagé')}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  label: {
    flexShrink: 1,
  },
  strong: {
    fontWeight: '700',
  },
});
