import React from 'react';
import {
  Appearance,
  Platform,
  StyleProp,
  StyleSheet,
  useColorScheme,
  View,
  ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { AdaptiveGlassView } from './AdaptiveGlassView';

export interface LiquidElasticButtonProps {
  size?: number;
  borderRadius?: number;
  onPress?: () => void;
  accessibilityLabel?: string;
  children?: React.ReactNode;
  icon?: React.ReactNode;
  intensity?: number;
  thickness?: number;
  refraction?: boolean;
  interactive?: boolean;
  tintColor?: string;
  style?: StyleProp<ViewStyle>;
}

const SPRING_DRAG = { damping: 26, stiffness: 280, mass: 0.35 };
const SPRING_SNAP = { damping: 20, stiffness: 260 };

export function LiquidElasticButton({
  size = 53,
  borderRadius = 26.5,
  onPress,
  accessibilityLabel,
  children,
  icon,
  intensity = 35,
  thickness = 1.4,
  refraction = true,
  interactive = true,
  tintColor,
  style,
}: LiquidElasticButtonProps) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark' || Appearance.getColorScheme() === 'dark';

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const isPressed = useSharedValue(false);

  const triggerLightHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const triggerPressHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const panGesture = Gesture.Pan()
    .minDistance(0)
    .onBegin(() => {
      isPressed.value = true;
      scale.value = withSpring(1.06, { damping: 22, stiffness: 240, mass: 0.5 });
      runOnJS(triggerLightHaptic)();
    })
    .onUpdate((e) => {
      const dist = Math.sqrt(e.translationX * e.translationX + e.translationY * e.translationY);
      const rubberBand = 1 / (1 + dist / 40);

      const dx = e.translationX * rubberBand * 0.65;
      const dy = e.translationY * rubberBand * 0.65;

      translateX.value = withSpring(dx, SPRING_DRAG);
      translateY.value = withSpring(dy, SPRING_DRAG);
    })
    .onFinalize((e) => {
      isPressed.value = false;
      const dist = Math.sqrt(e.translationX * e.translationX + e.translationY * e.translationY);

      // Rebond spring d'origine
      translateX.value = withSpring(0, SPRING_SNAP);
      translateY.value = withSpring(0, SPRING_SNAP);
      scale.value = withSpring(1.0, SPRING_SNAP);

      // Si tap ou relâchement dans la zone d'action
      if (dist < 38 && onPress) {
        runOnJS(triggerPressHaptic)();
        runOnJS(onPress)();
      }
    });

  const animatedContainerStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { scale: scale.value },
      ],
    };
  });

  const resolvedTintColor =
    tintColor ?? (isDark ? 'rgba(20, 20, 26, 0.40)' : 'rgba(255, 255, 255, 0.40)');

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View
        style={[
          styles.pressableContainer,
          { width: size, height: size, borderRadius },
          style,
          animatedContainerStyle,
        ]}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
      >
        <AdaptiveGlassView
          style={[
            styles.circleGlass,
            { width: size, height: size, borderRadius },
            isDark ? styles.blurContainerDark : styles.blurContainerLight,
          ]}
          variant="regular"
          interactive={interactive}
          intensity={intensity}
          borderRadius={borderRadius}
          refraction={refraction}
          thickness={thickness}
          edgeReflectionStrength={1.0}
          tilt={false}
          tintColor={resolvedTintColor}
        >
          {/* Liseré supérieur lumineux */}
          <View
            style={[
              styles.softTopHighlightCircle,
              {
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.22)' : 'rgba(255, 255, 255, 0.75)',
              },
            ]}
          />
          {icon ?? children}
        </AdaptiveGlassView>

        {/* Bordure externe 360° discrète */}
        <View
          style={[
            styles.seamlessCircleBorder,
            {
              borderRadius,
              borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)',
            },
          ]}
          pointerEvents="none"
        />
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  pressableContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleGlass: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 18,
  },
  blurContainerDark: {
    shadowColor: '#000000',
    shadowOpacity: 0.35,
  },
  blurContainerLight: {
    shadowColor: '#000000',
    shadowOpacity: 0.12,
  },
  softTopHighlightCircle: {
    position: 'absolute',
    top: 0,
    left: 8,
    right: 8,
    height: 0.75,
    borderRadius: 999,
    zIndex: 2,
  },
  seamlessCircleBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 0.5,
    zIndex: 10,
  },
});
