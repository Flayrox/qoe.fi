import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { t } from '@/lib/i18n';

// =====================================================================
// ↩️ RepliedTo — ligne « En réponse à @x » (port de
//    .reference/bluesky/src/components/Post/PostRepliedTo.tsx)
// =====================================================================
// Bluesky : flèche coudée `ArrowCornerDownRight` (xs) + texte muted
// « Replied to X » sur une seule ligne. Ici adapté : icône SF Symbol
// `arrow.turn.down.right` (iOS) / `subdirectory_arrow_right` (Android),
// libellé « En réponse à @handle » en textSecondary.
// =====================================================================

export function RepliedTo({ handle }: { handle: string }) {
  const theme = useTheme();
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
        weight="regular"
      />
      <ThemedText
        type="small"
        numberOfLines={1}
        style={[styles.label, { color: theme.textSecondary }]}
      >
        {t('feed.in_reply_to', 'En réponse à')}{' '}
        <ThemedText type="small" style={styles.strong}>
          @{handle}
        </ThemedText>
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
