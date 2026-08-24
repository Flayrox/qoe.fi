// =====================================================================
// 🧵 ViewFullThread — Indicateur « Afficher la suite du fil » (Bluesky)
// =====================================================================
// Ligne verticale avec 3 points de suspension et texte de lien interactif.
// Rendu fluide en composants View natifs (parité SVG Bluesky).
// =====================================================================

import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { playHaptic } from '@/lib/haptics';

export function ViewFullThread({ onPress, label }: { onPress: () => void; label: string }) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={() => {
        playHaptic('Light');
        onPress();
      }}
      style={({ pressed }) => [styles.container, pressed && { opacity: 0.7 }]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={styles.lineContainer}>
        {/* Ligne haute */}
        <View style={[styles.topLine, { backgroundColor: theme.border }]} />
        {/* 3 points verticaux Bluesky */}
        <View style={styles.dotsGroup}>
          <View style={[styles.dot, { backgroundColor: theme.textSecondary }]} />
          <View style={[styles.dot, { backgroundColor: theme.textSecondary }]} />
          <View style={[styles.dot, { backgroundColor: theme.textSecondary }]} />
        </View>
      </View>
      <ThemedText style={[styles.text, { color: theme.primary }]}>{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 8,
    paddingVertical: 2,
  },
  lineContainer: {
    width: 42,
    alignItems: 'center',
    justifyContent: 'center',
    height: 38,
  },
  topLine: {
    width: 2,
    height: 14,
    borderRadius: 1,
  },
  dotsGroup: {
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    opacity: 0.5,
  },
  text: {
    fontSize: 14,
    fontWeight: '600',
    paddingVertical: 8,
    letterSpacing: -0.1,
  },
});
