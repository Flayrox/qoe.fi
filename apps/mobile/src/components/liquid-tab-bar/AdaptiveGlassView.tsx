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

const isNativeModuleAvailable =
  Platform.OS !== 'web' &&
  (UIManager.hasViewManagerConfig('LiquidGlassmorphismView') ||
    (UIManager as any).getViewManagerConfig?.('LiquidGlassmorphismView') != null);

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

  // Fallback sécurisé pour Web, Expo Go ou avant compilation du binaire
  if (Platform.OS === 'web' || forceBlurFallback || !isNativeModuleAvailable) {
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

  // Native Apple Liquid Glass (UIGlassEffect on iOS, AGSL on Android)
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
