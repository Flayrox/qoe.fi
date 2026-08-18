import React from 'react';
import { Appearance, Platform, StyleSheet, useColorScheme, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

interface ProgressiveTopVignetteProps {
  height?: number;
}

/**
 * 🌫️ ProgressiveBlurVignette — Flou gaussien progressif multi-paliers
 * Combine 5 micro-étages optiques dégressifs de BlurView et un dégradé
 * d'opacité multi-points soyeux (LinearGradient) pour un estompement
 * naturel sans aucune coupure nette.
 */
export function ProgressiveBlurVignette({ height = 100 }: ProgressiveTopVignetteProps) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark' || Appearance.getColorScheme() === 'dark';

  const blurTint = isDark ? 'systemUltraThinMaterialDark' : 'systemUltraThinMaterialLight';

  // Dégradé de teinte pour parfaire la disparition optique
  const gradientColors = isDark
    ? ([
        'rgba(0, 0, 0, 0.88)',
        'rgba(0, 0, 0, 0.65)',
        'rgba(0, 0, 0, 0.35)',
        'rgba(0, 0, 0, 0.10)',
        'rgba(0, 0, 0, 0)',
      ] as const)
    : ([
        'rgba(255, 255, 255, 0.92)',
        'rgba(255, 255, 255, 0.70)',
        'rgba(255, 255, 255, 0.40)',
        'rgba(255, 255, 255, 0.10)',
        'rgba(255, 255, 255, 0)',
      ] as const);

  return (
    <View style={[styles.container, { height }]} pointerEvents="none">
      {/* ── 5 Paliers de flou gaussien optique progressif ── */}
      <BlurView intensity={12} tint={blurTint} style={[styles.blurSlice, { height: '100%' }]} />
      <BlurView intensity={20} tint={blurTint} style={[styles.blurSlice, { height: '80%' }]} />
      <BlurView intensity={30} tint={blurTint} style={[styles.blurSlice, { height: '62%' }]} />
      <BlurView intensity={45} tint={blurTint} style={[styles.blurSlice, { height: '44%' }]} />
      <BlurView intensity={60} tint={blurTint} style={[styles.blurSlice, { height: '26%' }]} />

      {/* ── Dégradé soyeux par-dessus pour unir le flou à la couleur de fond ── */}
      <LinearGradient
        colors={gradientColors}
        locations={[0, 0.28, 0.58, 0.82, 1]}
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
  blurSlice: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
  },
});
