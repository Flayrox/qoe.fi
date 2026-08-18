import React from 'react';
import { Appearance, Platform, StyleSheet, useColorScheme, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

interface ProgressiveBlurVignetteProps {
  position?: 'top' | 'bottom';
  height?: number;
  intensity?: number;
}

export function ProgressiveBlurVignette({
  position = 'top',
  height,
  intensity = 25,
}: ProgressiveBlurVignetteProps) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark' || Appearance.getColorScheme() === 'dark';

  const defaultHeight = position === 'top' ? 105 : 130;
  const resolvedHeight = height ?? defaultHeight;

  // Dégradé de couleurs adapté au mode sombre et clair
  const gradientColors = isDark
    ? position === 'top'
      ? (['rgba(0, 0, 0, 0.92)', 'rgba(0, 0, 0, 0.45)', 'rgba(0, 0, 0, 0)'] as const)
      : (['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0.45)', 'rgba(0, 0, 0, 0.92)'] as const)
    : position === 'top'
      ? ([
          'rgba(255, 255, 255, 0.95)',
          'rgba(255, 255, 255, 0.55)',
          'rgba(255, 255, 255, 0)',
        ] as const)
      : ([
          'rgba(255, 255, 255, 0)',
          'rgba(255, 255, 255, 0.55)',
          'rgba(255, 255, 255, 0.95)',
        ] as const);

  return (
    <View
      style={[
        styles.container,
        position === 'top' ? styles.topPosition : styles.bottomMargin,
        { height: resolvedHeight },
      ]}
      pointerEvents="none"
    >
      {/* Léger flou gaussien sous-jacent sur iOS */}
      {Platform.OS === 'ios' && (
        <BlurView
          intensity={intensity}
          tint={isDark ? 'systemUltraThinMaterialDark' : 'systemUltraThinMaterialLight'}
          style={StyleSheet.absoluteFill}
        />
      )}

      {/* Dégradé progressif avec fondu d'opacité en haut et en bas */}
      <LinearGradient
        colors={gradientColors}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    overflow: 'hidden',
    zIndex: 5,
  },
  topPosition: {
    top: 0,
  },
  bottomMargin: {
    bottom: 0,
  },
});
