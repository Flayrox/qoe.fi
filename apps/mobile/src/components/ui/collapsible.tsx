// =====================================================================
// 🗂️ Collapsible — Accordéon (template Expo starter, utilisé dans
//    explore.tsx pour les sections « docs »).
// =====================================================================

import { SymbolView } from 'expo-symbols';
import { PropsWithChildren, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function Collapsible({ children, title }: PropsWithChildren & { title: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const theme = useTheme();

  return (
    <ThemedView>
      {/* En-tête pressable : chevron + titre. */}
      <Pressable
        style={({ pressed }) => [styles.heading, pressed && styles.pressedHeading]}
        onPress={() => setIsOpen((value) => !value)}
      >
        {/* Pastille chevron : 24×24, radius 12, fond backgroundElement.
            Le chevron pointe vers la droite à l'état fermé (rotate 90°)
            et vers le bas à l'état ouvert (rotate -90°). */}
        <ThemedView type="backgroundElement" style={styles.button}>
          <SymbolView
            name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
            size={14}
            weight="bold"
            tintColor={theme.text}
            style={{ transform: [{ rotate: isOpen ? '-90deg' : '90deg' }] }}
          />
        </ThemedView>

        <ThemedText type="small">{title}</ThemedText>
      </Pressable>
      {/* Contenu : fondu 200ms (FadeIn). */}
      {isOpen && (
        <Animated.View entering={FadeIn.duration(200)}>
          <ThemedView type="backgroundElement" style={styles.content}>
            {children}
          </ThemedView>
        </Animated.View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two, // 8
  },
  pressedHeading: {
    opacity: 0.7,
  },
  button: {
    width: Spacing.four, // 24
    height: Spacing.four, // 24
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    marginTop: Spacing.three, // 16
    borderRadius: Spacing.three, // 16
    marginLeft: Spacing.four, // 24 (indenté sous le chevron)
    padding: Spacing.four, // 24
  },
});
