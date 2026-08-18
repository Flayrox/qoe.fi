import React from 'react';
import {
  Platform,
  StyleSheet,
  ViewStyle,
  StyleProp,
  useColorScheme,
  UIManager,
} from 'react-native';
import { BlurView } from 'expo-blur';
import {
  LiquidGlassView as NativeLiquidGlassView,
  LiquidGlassViewProps,
} from 'react-native-liquid-glassmorphism';

export type AdaptiveColorScheme = 'auto' | 'light' | 'dark';

export interface AdaptiveGlassViewProps extends LiquidGlassViewProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  colorScheme?: AdaptiveColorScheme;
  forceBlurFallback?: boolean;
}

export const AdaptiveGlassView: React.FC<AdaptiveGlassViewProps> = ({
  children,
  style,
  variant = 'regular',
  colorScheme = 'auto',
  interactive = false,
  intensity = 45,
  borderRadius = 999,
  refraction = true,
  thickness = 1.2,
  edgeReflectionStrength = 0.85,
  tilt = true,
  tintColor,
  forceBlurFallback = false,
  ...restProps
}) => {
  const systemColorScheme = useColorScheme();
  const isDark = colorScheme === 'auto' ? systemColorScheme === 'dark' : colorScheme === 'dark';

  // Teinte sombre à 40%
  const defaultTintColor = isDark ? 'rgba(20, 20, 26, 0.40)' : 'rgba(255, 255, 255, 0.30)';
  const activeTintColor = tintColor ?? defaultTintColor;

  // Fallback uniquement pour Web ou si forcé
  if (Platform.OS === 'web' || forceBlurFallback) {
    return (
      <BlurView
        intensity={intensity}
        tint={isDark ? 'systemUltraThinMaterialDark' : 'systemUltraThinMaterialLight'}
        style={[
          styles.baseFallback,
          isDark ? styles.darkFallback : styles.lightFallback,
          { borderRadius },
          style,
        ]}
      >
        {children}
      </BlurView>
    );
  }

  // Native Liquid Glass (UIGlassEffect sur iOS, AGSL Shader optique sur Android API 33+)
  return (
    <NativeLiquidGlassView
      variant={variant}
      interactive={interactive}
      intensity={intensity}
      borderRadius={borderRadius}
      refraction={refraction}
      thickness={thickness}
      edgeReflectionStrength={edgeReflectionStrength}
      tilt={tilt}
      tintColor={activeTintColor}
      style={style}
      {...restProps}
    >
      {children}
    </NativeLiquidGlassView>
  );
};

const styles = StyleSheet.create({
  baseFallback: {
    overflow: 'hidden',
  },
  lightFallback: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  darkFallback: {
    backgroundColor: 'rgba(20, 20, 26, 0.40)',
  },
});
