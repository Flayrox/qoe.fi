// =====================================================================
// 💀 Skeleton — Placeholders de chargement (port de
//    .reference/bluesky/src/components/Skeleton.tsx et
//    view/com/util/LoadingPlaceholder.tsx)
// =====================================================================
// Text/Circle/Pill + placeholders composés : post, feed, notification,
// profil. Utilisés comme état de chargement initial du feed.
// =====================================================================

import { useEffect } from 'react';
import {
  StyleSheet,
  View,
  type DimensionValue,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';

import { useTheme } from '@/hooks/use-theme';
import { useReduceMotion } from '@/hooks/use-user-settings';

function Block({
  width,
  height = 6,
  radius = 6,
  blend = false,
  style,
}: {
  width: DimensionValue;
  height?: DimensionValue;
  radius?: number;
  blend?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (reduceMotion) return;
    pulse.value = withRepeat(
      withTiming(0.45, {
        duration: 850,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true
    );
  }, [pulse, reduceMotion]);

  const animatedPulseStyle = useAnimatedStyle(() => {
    return {
      opacity: pulse.value * (blend ? 0.6 : 1),
    };
  });

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: theme.backgroundSelected,
        },
        animatedPulseStyle,
        style,
      ]}
    />
  );
}

export function SkeletonText({
  width,
  style,
}: {
  width: DimensionValue;
  style?: StyleProp<ViewStyle>;
}) {
  return <Block width={width} height={12} style={[{ marginVertical: 3 }, style]} />;
}

export function SkeletonCircle({
  size = 42,
  style,
}: {
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return <Block width={size} height={size} radius={size / 2} style={style} />;
}

export function SkeletonPill({
  size = 20,
  blend = false,
  style,
}: {
  size?: number;
  blend?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return <Block width={size * 1.618} height={size} radius={size / 2} blend={blend} style={style} />;
}

/** Placeholder d'une carte pensée (avatar + lignes + actions). */
export function PostLoadingPlaceholder({ style }: { style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return (
    <View style={[styles.post, style]}>
      <SkeletonCircle size={42} style={{ marginRight: 10 }} />
      <View style={{ flex: 1 }}>
        <Block width={100} height={8} style={{ marginBottom: 10 }} />
        <Block width="95%" height={8} style={{ marginBottom: 8 }} />
        <Block width="95%" height={8} style={{ marginBottom: 8 }} />
        <Block width="80%" height={8} style={{ marginBottom: 12 }} />
        <View style={[styles.postCtrls, { borderColor: theme.border }]}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={styles.postCtrl}>
              <SkeletonPill size={18} blend />
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

export function PostFeedLoadingPlaceholder({ count = 6 }: { count?: number }) {
  return (
    <View>
      {Array.from({ length: count }).map((_, i) => (
        <PostLoadingPlaceholder key={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  post: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  postCtrls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    opacity: 0.6,
  },
  postCtrl: {
    flex: 1,
    alignItems: 'flex-start',
  },
});
