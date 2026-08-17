import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { t } from '@/lib/i18n';

// =====================================================================
// 🔽 ShowMoreTextButton — bouton « Voir plus / Voir moins » (port de
//    .reference/bluesky/src/components/Post/ShowMoreTextButton.tsx)
// =====================================================================
// Bluesky tronque les posts longs à MAX_POST_LINES (25) et affiche un lien
// « Show more ». Ici : texte link (couleur primaire), souligné au press,
// opacity 0.6 pressé, LayoutAnimation côté Bluesky est remplacé par le
// re-render React simple (le contenu se déplie instantanément).
// =====================================================================

export function ShowMoreTextButton({
  expanded,
  onPress,
}: {
  expanded: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={10} style={styles.selfStart}>
      {({ pressed }) => (
        <ThemedText
          type="small"
          style={[styles.text, { color: theme.primary }, pressed && styles.pressed]}
        >
          {expanded ? t('feed.show_less', 'Voir moins') : t('feed.show_more', 'Voir plus')}
        </ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  selfStart: {
    alignSelf: 'flex-start',
  },
  text: {
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.6,
    textDecorationLine: 'underline',
  },
});
