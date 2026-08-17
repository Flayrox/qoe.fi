import React, { useContext, useEffect, useRef, useState } from 'react';
import { Image, LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { DrawerContext } from '@/components/drawer/drawer-context';
import { Avatar } from '@/components/thought/avatar';
import { useAuth } from '@/features/auth/auth-provider';
import { useMe } from '@/hooks/use-me';
import { AdaptiveGlassView } from './AdaptiveGlassView';
import { LiquidTabBarProps, NavigationRoute, TabIconConfig } from './LiquidTabBar.types';

const SPRING_SETTLE = { damping: 20, stiffness: 220, mass: 0.5 };
const SPRING_DRAG = { damping: 24, stiffness: 280, mass: 0.35 };

const DRAG_THRESHOLD = 5;
const TRACK_PADDING = 6;
const PILL_VERTICAL_PADDING = 5;

// Paramètres de résistance et de percée (slow margin destroy)
const BREACH_DEADZONE = 16;
const MAX_MARGIN_BREACH = 5.2;
const BRAKING_COEFFICIENT = 42;

const computeBrakingBreach = (overdrag: number) => {
  'worklet';
  if (overdrag <= BREACH_DEADZONE) return 0;
  const excess = overdrag - BREACH_DEADZONE;
  return MAX_MARGIN_BREACH * (excess / (excess + BRAKING_COEFFICIENT));
};

function TabIcon({
  name,
  isFocused,
  activeColor = '#FFFFFF',
  inactiveColor = 'rgba(255, 255, 255, 0.72)',
  userAvatarProps,
}: {
  name: string;
  isFocused: boolean;
  activeColor?: string;
  inactiveColor?: string;
  userAvatarProps?: {
    name: string;
    username: string;
    logoUrl?: string;
  };
}) {
  const color = isFocused ? activeColor : inactiveColor;

  switch (name) {
    case 'profile':
      return (
        <View
          style={[styles.avatarWrapper, isFocused ? styles.avatarFocused : styles.avatarInactive]}
        >
          <Avatar
            user={{
              name: userAvatarProps?.name || 'Utilisateur',
              username: userAvatarProps?.username || 'user',
              logoUrl: userAvatarProps?.logoUrl,
            }}
            sizeNumber={26}
          />
          <View style={styles.notificationDot} />
        </View>
      );

    case 'index':
      return <Ionicons name={isFocused ? 'home' : 'home-outline'} size={25} color={color} />;

    case 'explore':
      return (
        <View style={styles.iconWrapper}>
          <Image
            source={require('@/assets/images/tabIcons/explore.png')}
            style={[
              styles.customTabIcon,
              {
                tintColor: color,
                opacity: isFocused ? 1 : 0.78,
              },
            ]}
            resizeMode="contain"
          />
        </View>
      );

    case 'notifications':
      return (
        <View style={styles.iconWrapper}>
          <Ionicons
            name={isFocused ? 'notifications' : 'notifications-outline'}
            size={25}
            color={color}
          />
          <View style={styles.notificationsBadgeDot} />
        </View>
      );

    case 'messages':
      return (
        <View style={styles.iconWrapper}>
          {isFocused ? (
            <Ionicons name="paper-plane" size={23} color={color} />
          ) : (
            <Feather
              name="send"
              size={22}
              color={color}
              style={{ transform: [{ rotate: '10deg' }] }}
            />
          )}
          <View style={styles.messagesDot} />
        </View>
      );

    default:
      return <Ionicons name="ellipse-outline" size={25} color={color} />;
  }
}

function TabItem({
  name,
  isFocused,
  iconConfig,
  activeColor,
  inactiveColor,
  userAvatarProps,
}: {
  name: string;
  isFocused: boolean;
  iconConfig?: TabIconConfig;
  activeColor: string;
  inactiveColor: string;
  userAvatarProps?: {
    name: string;
    username: string;
    logoUrl?: string;
  };
}) {
  if (iconConfig?.customRender) {
    return (
      <View style={styles.tabItem}>
        {iconConfig.customRender({
          isFocused,
          color: isFocused ? activeColor : inactiveColor,
          size: 26,
        })}
      </View>
    );
  }

  return (
    <View style={styles.tabItem}>
      <TabIcon
        name={name}
        isFocused={isFocused}
        activeColor={activeColor}
        inactiveColor={inactiveColor}
        userAvatarProps={userAvatarProps}
      />
    </View>
  );
}

export function LiquidTabBar({
  state,
  navigation,
  variant = 'regular',
  iconsMap,
  glassProps,
  activeTintColor = '#FFFFFF',
  inactiveTintColor = 'rgba(255, 255, 255, 0.72)',
  glassTintColor,
  bottomOffset = 24,
  maxWidth = 392,
  containerStyle,
  onProfilePress,
}: LiquidTabBarProps) {
  const drawerContext = useContext(DrawerContext);
  const drawerProgress = drawerContext?.progress;

  const { session } = useAuth();
  const { data: me } = useMe();
  const user = session?.user;
  const userAvatarProps = {
    name: me?.name || (user?.user_metadata?.full_name as string) || 'Utilisateur',
    username: me?.username || (user?.user_metadata?.username as string) || 'user',
    logoUrl: me?.logoUrl || (user?.user_metadata?.avatar_url as string | undefined),
  };

  const [trackWidth, setTrackWidth] = useState(0);
  const tabCount = state?.routes?.length || 0;
  const tabWidth = trackWidth > 0 && tabCount > 0 ? trackWidth / tabCount : 0;
  const isInitialized = useRef(false);

  // Pilule active : matière douce et feutrée
  const pillTranslateX = useSharedValue(0);
  const pillOpacity = useSharedValue(0.14);

  // Éclosion de l'aura (déclenchée après 300ms à 100% de déploiement)
  const auraBloomProgress = useSharedValue(0);

  // Grossissement et déformation 100% solidaire de toute la NavBar et son contenu
  const barScale = useSharedValue(1);
  const barTranslateX = useSharedValue(0);
  const barScaleX = useSharedValue(1);

  // Gestion des gestes
  const isInteracting = useSharedValue(false);
  const hasMoved = useSharedValue(false);
  const startX = useSharedValue(0);
  const activeHoverIndex = useSharedValue(state?.index ?? 1);

  // Déclenchement de l'aura uniquement quand le drawer est à 100% avec 300ms de suspense
  useAnimatedReaction(
    () => drawerProgress?.value ?? 0,
    (currentProgress, previousProgress) => {
      if (currentProgress >= 0.98) {
        if (!previousProgress || previousProgress < 0.98) {
          auraBloomProgress.value = withDelay(
            300,
            withTiming(1, {
              duration: 450,
              easing: Easing.out(Easing.cubic),
            })
          );
        }
      } else {
        if (auraBloomProgress.value > 0) {
          auraBloomProgress.value = withTiming(0, { duration: 150 });
        }
      }
    }
  );

  const triggerHoverFeedback = () => {
    Haptics.selectionAsync();
  };

  const triggerNavigation = (targetIndex: number) => {
    if (state && targetIndex >= 0 && targetIndex < tabCount) {
      const route = state.routes[targetIndex];
      if (route.name === 'profile' && onProfilePress) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onProfilePress();
        return;
      }
      if (targetIndex !== state.index) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        navigation.navigate(route.name);
      }
    }
  };

  useEffect(() => {
    if (tabWidth > 0 && !isInteracting.value && state) {
      pillTranslateX.value = withSpring(state.index * tabWidth, SPRING_SETTLE);
    }
  }, [state?.index, tabWidth]);

  const panGesture = Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => {
      isInteracting.value = true;
      hasMoved.value = false;
      startX.value = e.x;
      activeHoverIndex.value = state?.index ?? 1;

      barScale.value = withSpring(1.04, SPRING_SETTLE);
      pillOpacity.value = withTiming(0.22, { duration: 80 });
    })
    .onUpdate((e) => {
      const distance = Math.abs(e.x - startX.value);
      if (distance > DRAG_THRESHOLD) {
        hasMoved.value = true;
      }

      if (hasMoved.value && tabCount > 0) {
        const relativeX = e.x - TRACK_PADDING;
        const targetCenter = relativeX - tabWidth / 2;
        const maxBound = (tabCount - 1) * tabWidth;

        if (targetCenter < 0) {
          const overdrag = Math.abs(targetCenter);
          const breach = computeBrakingBreach(overdrag);
          pillTranslateX.value = withSpring(-breach, SPRING_DRAG);

          barTranslateX.value = withSpring(-Math.pow(overdrag, 0.62) * 0.45, SPRING_DRAG);
          barScaleX.value = withSpring(1 + (overdrag / 360) * 0.06, SPRING_DRAG);
        } else if (targetCenter > maxBound) {
          const overdrag = targetCenter - maxBound;
          const breach = computeBrakingBreach(overdrag);
          pillTranslateX.value = withSpring(maxBound + breach, SPRING_DRAG);

          barTranslateX.value = withSpring(Math.pow(overdrag, 0.62) * 0.45, SPRING_DRAG);
          barScaleX.value = withSpring(1 + (overdrag / 360) * 0.06, SPRING_DRAG);
        } else {
          pillTranslateX.value = withSpring(targetCenter, SPRING_DRAG);
          barTranslateX.value = withSpring(0, SPRING_DRAG);
          barScaleX.value = withSpring(1, SPRING_DRAG);
        }

        const hoveredIndex = Math.max(
          0,
          Math.min(Math.floor((relativeX / (trackWidth || 1)) * tabCount), tabCount - 1)
        );
        if (hoveredIndex !== activeHoverIndex.value) {
          activeHoverIndex.value = hoveredIndex;
          runOnJS(triggerHoverFeedback)();
        }
      }
    })
    .onFinalize((e) => {
      isInteracting.value = false;

      barScale.value = withSpring(1.0, SPRING_SETTLE);
      barScaleX.value = withSpring(1.0, SPRING_SETTLE);
      barTranslateX.value = withSpring(0, SPRING_SETTLE);

      pillOpacity.value = withTiming(0.14, { duration: 140 });

      const relativeX = e.x - TRACK_PADDING;
      const releaseIndex = Math.max(
        0,
        Math.min(Math.floor((relativeX / (trackWidth || 1)) * tabCount), tabCount - 1)
      );
      const targetRoute = state.routes[releaseIndex];

      // Si on relâche sur le profil, on conserve la position de l'onglet actif où on était !
      if (targetRoute?.name === 'profile') {
        pillTranslateX.value = withSpring(state.index * tabWidth, SPRING_SETTLE);
      } else {
        pillTranslateX.value = withSpring(releaseIndex * tabWidth, SPRING_SETTLE);
      }

      runOnJS(triggerNavigation)(releaseIndex);

      hasMoved.value = false;
    });

  const barContainerStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: barTranslateX.value },
      { scale: barScale.value },
      { scaleX: barScaleX.value },
    ],
  }));

  const pillAnimatedStyle = useAnimatedStyle(() => {
    let currentX = pillTranslateX.value;
    if (drawerProgress && !isInteracting.value) {
      // Inertie physique avec retard d'entraînement
      const laggedProgress = interpolate(
        drawerProgress.value,
        [0, 0.22, 0.65, 0.92, 1],
        [0, 0.04, 0.68, 0.98, 1],
        Extrapolation.CLAMP
      );

      currentX = interpolate(laggedProgress, [0, 1], [pillTranslateX.value, 0]);
    }

    return {
      transform: [{ translateX: currentX }],
      backgroundColor: `rgba(255, 255, 255, ${pillOpacity.value})`,
    };
  });

  // Aura radiale chaleureuse qui éclot depuis la PP vers les bords après 300ms d'ouverture à 100%
  const auraAnimatedStyle = useAnimatedStyle(() => {
    const scale = interpolate(auraBloomProgress.value, [0, 1], [0.45, 1.15], Extrapolation.CLAMP);

    const opacity = interpolate(auraBloomProgress.value, [0, 1], [0, 0.52], Extrapolation.CLAMP);

    return {
      opacity,
      transform: [{ scale }],
    };
  });

  const onLayout = (event: LayoutChangeEvent) => {
    const { width } = event.nativeEvent.layout;
    setTrackWidth(width);

    if (!isInitialized.current && width > 0 && state) {
      pillTranslateX.value = state.index * (width / tabCount);
      isInitialized.current = true;
    }
  };

  if (!state || !state.routes) {
    return null;
  }

  return (
    <View style={[styles.wrapper, { bottom: bottomOffset }, containerStyle]}>
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.barWrapper, { maxWidth }, barContainerStyle]}>
          <AdaptiveGlassView
            style={styles.blurContainer}
            variant={variant}
            interactive={false}
            intensity={45}
            borderRadius={999}
            refraction={true}
            thickness={1.2}
            edgeReflectionStrength={0.85}
            tilt={true}
            tintColor={glassTintColor ?? 'rgba(20, 20, 26, 0.40)'}
            {...glassProps}
          >
            {/* Liseré supérieur doux et feutré */}
            <View style={styles.softTopHighlight} />

            <View style={styles.trackContainer} onLayout={onLayout}>
              {tabWidth > 0 && (
                <Animated.View
                  style={[
                    styles.activePill,
                    {
                      width: tabWidth,
                      top: PILL_VERTICAL_PADDING,
                      bottom: PILL_VERTICAL_PADDING,
                    },
                    pillAnimatedStyle,
                  ]}
                >
                  {/* Aura radiale dense à ~50% autour de la PP qui éclot doucement et s'estompe aux bords */}
                  <Animated.View
                    style={[styles.avatarAuraContainer, auraAnimatedStyle]}
                    pointerEvents="none"
                  >
                    {/* Épicentre dense autour de la PP */}
                    <View style={styles.avatarAuraCore} />
                    {/* Halo de diffusion gaussienne */}
                    {userAvatarProps?.logoUrl ? (
                      <Image
                        source={{ uri: userAvatarProps.logoUrl }}
                        style={styles.avatarBlurredImage}
                        blurRadius={20}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.avatarBlurredFallback} />
                    )}
                  </Animated.View>
                </Animated.View>
              )}

              <View style={styles.tabsRow}>
                {state.routes.map((route: NavigationRoute, index: number) => {
                  const isFocused = state.index === index;
                  return (
                    <TabItem
                      key={route.key}
                      name={route.name}
                      isFocused={isFocused}
                      iconConfig={iconsMap?.[route.name]}
                      activeColor={activeTintColor}
                      inactiveColor={inactiveTintColor}
                      userAvatarProps={userAvatarProps}
                    />
                  );
                })}
              </View>
            </View>
          </AdaptiveGlassView>

          {/* Bordure externe 360° discrète et sobre */}
          <View style={styles.seamlessOuterBorder} pointerEvents="none" />
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
  },
  barWrapper: {
    position: 'relative',
    width: '100%',
  },
  blurContainer: {
    position: 'relative',
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'transparent',
    paddingHorizontal: TRACK_PADDING,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 8,
  },
  softTopHighlight: {
    position: 'absolute',
    top: 0,
    left: 32,
    right: 32,
    height: 0.75,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 999,
    zIndex: 2,
  },
  seamlessOuterBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 999,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.11)',
    zIndex: 10,
  },
  trackContainer: {
    position: 'relative',
    width: '100%',
    borderRadius: 999,
  },
  activePill: {
    position: 'absolute',
    left: 0,
    borderRadius: 26,
    zIndex: 1,
    borderWidth: 0,
    overflow: 'hidden',
  },
  avatarAuraContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 26,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarAuraCore: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(238, 75, 43, 0.45)',
    shadowColor: '#ee4b2b',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 18,
    zIndex: 2,
  },
  avatarBlurredImage: {
    width: '180%',
    height: '180%',
    transform: [{ scale: 1.3 }],
    opacity: 0.65,
  },
  avatarBlurredFallback: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#ee4b2b',
    opacity: 0.45,
  },
  tabsRow: {
    flexDirection: 'row',
    width: '100%',
    zIndex: 3,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15.5,
    position: 'relative',
  },
  iconWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  customTabIcon: {
    width: 23,
    height: 23,
  },
  notificationsBadgeDot: {
    position: 'absolute',
    top: -1,
    right: -2,
    width: 6.5,
    height: 6.5,
    borderRadius: 3.25,
    backgroundColor: '#FF2D55',
    borderWidth: 1.5,
    borderColor: '#18181E',
  },
  messagesDot: {
    position: 'absolute',
    bottom: -1,
    right: -4,
    width: 6.5,
    height: 6.5,
    borderRadius: 3.25,
    backgroundColor: '#FF2D55',
    borderWidth: 1.5,
    borderColor: '#18181E',
  },
  avatarWrapper: {
    position: 'relative',
    padding: 1.5,
    borderRadius: 999,
  },
  avatarInactive: {
    borderWidth: 1,
    borderColor: 'transparent',
    opacity: 0.85,
  },
  avatarFocused: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.85)',
    opacity: 1,
  },
  notificationDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 6.5,
    height: 6.5,
    borderRadius: 3.25,
    backgroundColor: '#FF2D55',
    borderWidth: 1.5,
    borderColor: '#18181E',
  },
});
