// =====================================================================
// 🔘 FAB — Bouton d'action flottant (port du « New Post » de Bluesky)
// =====================================================================
// Bouton circulaire brand (vermillon) en bas à droite, au-dessus du feed.
// Ouvre le composer quand on le tape.
// =====================================================================

import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function FAB({
  onPress,
  icon = '✚',
  label,
  style,
}: {
  onPress: () => void;
  icon?: string;
  label?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.fab,
        { backgroundColor: theme.primary, opacity: pressed ? 0.85 : 1 },
        style,
      ]}
    >
      <ThemedText style={styles.icon}>{icon}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: Spacing.four,
    bottom: Spacing.five,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  icon: {
    color: '#ffffff',
    fontSize: 22,
    lineHeight: 26,
  },
});
