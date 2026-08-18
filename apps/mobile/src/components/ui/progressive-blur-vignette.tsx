import React from 'react';
import { Appearance, StyleSheet, useColorScheme, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface ProgressiveTopVignetteProps {
  height?: number;
}

/**
 * Fondu progressif supérieur doux pour estomper les éléments
 * sous la barre de statut (sans coupure ni artefacts).
 */
export function ProgressiveBlurVignette({ height = 90 }: ProgressiveTopVignetteProps) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark' || Appearance.getColorScheme() === 'dark';

  // Dégradé multi-points calculé pour une courbe d'estompement soyeuse
  const gradientColors = isDark
    ? ([
        'rgba(0, 0, 0, 0.95)',
        'rgba(0, 0, 0, 0.75)',
        'rgba(0, 0, 0, 0.40)',
        'rgba(0, 0, 0, 0.12)',
        'rgba(0, 0, 0, 0)',
      ] as const)
    : ([
        'rgba(255, 255, 255, 0.98)',
        'rgba(255, 255, 255, 0.80)',
        'rgba(255, 255, 255, 0.45)',
        'rgba(255, 255, 255, 0.15)',
        'rgba(255, 255, 255, 0)',
      ] as const);

  return (
    <View style={[styles.container, { height }]} pointerEvents="none">
      <LinearGradient
        colors={gradientColors}
        locations={[0, 0.3, 0.6, 0.85, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
    zIndex: 5,
  },
});
