import React, { useContext, useEffect, useMemo } from 'react';
import {
  Appearance,
  Image,
  Platform,
  StyleSheet,
  useColorScheme,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
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
import { useScrollCoordination } from '@/components/scroll/scroll-context';

const SPRING_SETTLE = { damping: 22, stiffness: 240, mass: 0.5 };
const SPRING_DRAG = { damping: 26, stiffness: 280, mass: 0.35 };

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
  activeColor,
  inactiveColor,
  userAvatarProps,
}: {
  name: string;
  isFocused: boolean;
  activeColor: string;
  inactiveColor: string;
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

// 6 tranches étagées de flou pour créer le véritable flou progressif exponentiel d'Apple
const PROGRESSIVE_BLUR_STEPS = [
  { bottom: 0, height: 135, intensity: 10, opacity: 0.3 },
  { bottom: 0, height: 110, intensity: 22, opacity: 0.5 },
  { bottom: 0, height: 88, intensity: 40, opacity: 0.7 },
  { bottom: 0, height: 68, intensity: 62, opacity: 0.85 },
  { bottom: 0, height: 48, intensity: 82, opacity: 0.95 },
  { bottom: 0, height: 32, intensity: 98, opacity: 1 },
];

export function LiquidTabBar({
  state,
  navigation,
  insets,
  variant = 'regular',
  iconsMap,
  glassProps,
  activeTintColor,
  inactiveTintColor,
  glassTintColor,
  bottomOffset: customBottomOffset,
  containerStyle,
  onProfilePress,
}: LiquidTabBarProps) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark' || Appearance.getColorScheme() === 'dark';

  const bottomOffset =
    customBottomOffset ??
    (Platform.OS === 'ios' ? (insets?.bottom && insets.bottom > 0 ? insets.bottom - 16 : 14) : 16);

  const defaultActiveTint = isDark ? '#FFFFFF' : '#111113';
  const defaultInactiveTint = isDark ? 'rgba(255, 255, 255, 0.72)' : 'rgba(0, 0, 0, 0.58)';

  const resolvedActiveColor = activeTintColor ?? defaultActiveTint;
  const resolvedInactiveColor = inactiveTintColor ?? defaultInactiveTint;

  const drawerContext = useContext(DrawerContext);
  const drawerProgress = drawerContext?.progress;
  const { scrollY, isScrollingDown, isDragging, hasTriggeredCompact, forceExpandTabBar } =
    useScrollCoordination();

  const { session } = useAuth();
  const { data: me } = useMe();
  const user = session?.user;
  const displayName =
    me?.name ||
    (user?.user_metadata?.full_name as string | undefined) ||
    me?.username ||
    user?.email?.split('@')[0] ||
    '';
  const displayUsername =
    me?.username ||
    (user?.user_metadata?.username as string | undefined) ||
    user?.email?.split('@')[0] ||
    '';

  const userAvatarProps = {
    name: displayName,
    username: displayUsername,
    logoUrl: me?.logoUrl || (user?.user_metadata?.avatar_url as string | undefined),
  };

  const { width: screenWidth } = useWindowDimensions();

  // 4 onglets principaux (profile, explore, index, notifications)
  const visibleRoutes =
    state?.routes?.filter((r) => r.name !== 'messages' && r.name !== 'search') || [];
  const tabCount = visibleRoutes.length;

  const currentVisibleIndex = Math.max(
    0,
    visibleRoutes.findIndex((r) => r.name === state?.routes?.[state.index]?.name)
  );

  // ── Géométrie ultra-précise pleine largeur avec Home (index 2) calé au centre avec correction optique ──
  const tabMetrics = useMemo(() => {
    // Largeur totale utilisable de la rangée (wrapper left: 14, right: 14)
    // Row = [ mainBar (flex: 1) ] (gap: 10) ( composeBtn: 53 )
    const rowWidth = screenWidth - 28;
    const barWidth = rowWidth - 10 - 53;
    const trackWidth = Math.max(0, barWidth - 2 * TRACK_PADDING);

    if (tabCount !== 4 || trackWidth <= 0) {
      const avg = trackWidth > 0 && tabCount > 0 ? trackWidth / tabCount : 70;
      return {
        widths: Array(tabCount || 4).fill(avg),
        offsets: Array.from({ length: tabCount || 4 }, (_, i) => i * avg),
      };
    }

    // Correction optique (-6px) pour compenser la perception visuelle de la capsule asymétrique
    const OPTICAL_SHIFT = -6;
    const screenCenterInTrack = screenWidth / 2 - 14 - TRACK_PADDING + OPTICAL_SHIFT;
    const homeWidth = 70; // Largeur optimisée pour l'icône Home

    // Position x du bord gauche de l'onglet Home (index 2) pour que son centre soit EXACTEMENT sur screenCenterInTrack
    const homeLeft = screenCenterInTrack - homeWidth / 2;

    // Distribution des 2 onglets de gauche (0: Profil, 1: Explore)
    const leftTabWidth = homeLeft / 2;

    // Distribution de l'onglet de droite (3: Notifications)
    const rightTabWidth = trackWidth - (homeLeft + homeWidth);

    const widths = [leftTabWidth, leftTabWidth, homeWidth, rightTabWidth];
    const offsets = [0, leftTabWidth, homeLeft, homeLeft + homeWidth];
    const centers = offsets.map((off, idx) => off + widths[idx] / 2);

    return { widths, offsets, centers };
  }, [screenWidth, tabCount]);

  // Initialisation immédiate des shared values avec les offsets calibrés (évite tout saut au 1er rendu)
  const initialOffset = tabMetrics.offsets[currentVisibleIndex] ?? 0;
  const initialWidth = tabMetrics.widths[currentVisibleIndex] ?? 70;

  // Lueur liquide traînante avec retard de suivi sous le doigt
  const glowX = useSharedValue(initialOffset + initialWidth / 2);
  const glowOpacity = useSharedValue(0);
  const glowScale = useSharedValue(0.85);

  // Pilule active : matière douce et feutrée
  const pillTranslateX = useSharedValue(initialOffset);
  const pillWidth = useSharedValue(initialWidth);
  const pillScale = useSharedValue(1);
  const pillOpacity = useSharedValue(isDark ? 0.14 : 0.09);

  // Onde de propagation liquide (déclenchée après 320ms à 100% de déploiement)
  const auraWaveProgress = useSharedValue(0);

  // Focus actif pour la superposition dynamique (0: neutre, 1: barre active, 2: compose actif)
  const activeFocus = useSharedValue(0);

  // Physique de la barre principale
  const barScale = useSharedValue(1);
  const barTranslateX = useSharedValue(0);
  const barScaleX = useSharedValue(1);

  // Physique du bouton circulaire Compose (+)
  const composeTranslateX = useSharedValue(0);
  const composeTranslateY = useSharedValue(0);
  const composeScale = useSharedValue(1);

  // Flags de collision pour les haptiques de choc
  const hasCollidedBar = useSharedValue(false);
  const hasCollidedCompose = useSharedValue(false);

  // Gestion des gestes sur la barre
  const isInteracting = useSharedValue(false);
  const hasMoved = useSharedValue(false);
  const startX = useSharedValue(0);
  const activeHoverIndex = useSharedValue(state?.index ?? 1);

  const triggerCollisionHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
  };

  useAnimatedReaction(
    () => drawerProgress?.value ?? 0,
    (currentProgress, previousProgress) => {
      if (currentProgress >= 0.98) {
        if (!previousProgress || previousProgress < 0.98) {
          auraWaveProgress.value = withDelay(
            320,
            withTiming(1, {
              duration: 650,
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            })
          );
        }
      } else {
        if (auraWaveProgress.value > 0) {
          auraWaveProgress.value = withTiming(0, { duration: 160 });
        }
      }
    }
  );

  const triggerHoverFeedback = () => {
    Haptics.selectionAsync();
  };

  const triggerNavigation = (targetIndex: number) => {
    forceExpandTabBar();
    if (visibleRoutes && targetIndex >= 0 && targetIndex < tabCount) {
      const route = visibleRoutes[targetIndex];
      if (route.name === 'profile' && onProfilePress) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onProfilePress();
        return;
      }
      const actualIndex = state.routes.findIndex((r) => r.name === route.name);
      if (actualIndex !== state.index) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        navigation.navigate(route.name);
      } else {
        // Clic sur l'onglet déjà actif : émission de tabPress pour scroll-to-top et refresh
        navigation.emit?.({
          type: 'tabPress',
          target: route.key,
          canPreventDefault: true,
        });
      }
    }
  };

  useEffect(() => {
    forceExpandTabBar();
    if (!isInteracting.value && state) {
      const targetOffset = tabMetrics.offsets[currentVisibleIndex] ?? 0;
      const targetWidth = tabMetrics.widths[currentVisibleIndex] ?? 70;
      pillTranslateX.value = withSpring(targetOffset, SPRING_SETTLE);
      pillWidth.value = withSpring(targetWidth, SPRING_SETTLE);
    }
  }, [currentVisibleIndex, tabMetrics, forceExpandTabBar]);

  // Geste Pan sur la barre principale avec détection de collision sur le bouton (+)
  const panGesture = Gesture.Pan()
    .minDistance(0)
    .onTouchesDown((event, manager) => {
      if (drawerProgress && drawerProgress.value > 0.05) {
        manager.fail();
      }
    })
    .onBegin((e) => {
      if (drawerProgress && drawerProgress.value > 0.05) return;

      activeFocus.value = 1; // La barre passe au-dessus
      isInteracting.value = true;
      hasMoved.value = false;
      hasCollidedBar.value = false;
      startX.value = e.x;
      activeHoverIndex.value = currentVisibleIndex;

      // Déclenchement de la lueur liquide sous le point de contact
      glowX.value = e.x;
      glowOpacity.value = withTiming(isDark ? 0.35 : 0.45, { duration: 120 });
      glowScale.value = withSpring(1.0, SPRING_SETTLE);

      barScale.value = withSpring(1.03, SPRING_SETTLE);
      pillScale.value = withSpring(1.02, SPRING_DRAG);
      pillOpacity.value = withTiming(isDark ? 0.22 : 0.16, { duration: 80 });
    })
    .onUpdate((e) => {
      if (drawerProgress && drawerProgress.value > 0.05) return;

      // Suivi de la lueur avec retard et inertie liquide fluide
      glowX.value = withSpring(e.x, {
        damping: 18,
        stiffness: 110,
        mass: 0.85,
      });

      const distance = Math.abs(e.x - startX.value);
      if (distance > DRAG_THRESHOLD) {
        hasMoved.value = true;
        pillScale.value = withSpring(1.05, SPRING_DRAG);
      }

      if (hasMoved.value && tabCount > 0) {
        const relativeX = e.x - TRACK_PADDING;
        const centers = tabMetrics.centers ?? [];
        const offsets = tabMetrics.offsets;
        const widths = tabMetrics.widths;

        const firstCenter = centers[0] ?? 0;
        const lastCenter = centers[tabCount - 1] ?? offsets[tabCount - 1] ?? 0;

        let idealPillX = 0;
        let idealPillW = widths[0] ?? 70;
        let hoveredIndex = 0;

        if (relativeX <= firstCenter) {
          idealPillX = (offsets[0] ?? 0) + (relativeX - firstCenter);
          idealPillW = widths[0] ?? 70;
          hoveredIndex = 0;
        } else if (relativeX >= lastCenter) {
          idealPillX = (offsets[tabCount - 1] ?? 0) + (relativeX - lastCenter);
          idealPillW = widths[tabCount - 1] ?? 70;
          hoveredIndex = tabCount - 1;
        } else {
          for (let i = 0; i < tabCount - 1; i++) {
            const c0 = centers[i] ?? 0;
            const c1 = centers[i + 1] ?? 0;
            if (relativeX >= c0 && relativeX <= c1) {
              const span = c1 - c0;
              const p = span > 0 ? (relativeX - c0) / span : 0;
              const off0 = offsets[i] ?? 0;
              const off1 = offsets[i + 1] ?? 0;
              const w0 = widths[i] ?? 70;
              const w1 = widths[i + 1] ?? 70;

              idealPillX = off0 + p * (off1 - off0);
              idealPillW = w0 + p * (w1 - w0);
              hoveredIndex = p < 0.5 ? i : i + 1;
              break;
            }
          }
        }

        pillWidth.value = withSpring(idealPillW, SPRING_DRAG);

        const minBound = offsets[0] ?? 0;
        const maxBound = offsets[tabCount - 1] ?? 0;

        if (idealPillX < minBound) {
          const overdrag = Math.abs(idealPillX - minBound);
          const breach = computeBrakingBreach(overdrag);
          pillTranslateX.value = withSpring(-breach, SPRING_DRAG);

          barTranslateX.value = withSpring(-Math.pow(overdrag, 0.62) * 0.45, SPRING_DRAG);
          barScaleX.value = withSpring(1 + (overdrag / 360) * 0.04, SPRING_DRAG);
          composeTranslateX.value = withSpring(0, SPRING_DRAG);
        } else if (idealPillX > maxBound) {
          const overdrag = idealPillX - maxBound;
          const breach = computeBrakingBreach(overdrag);
          pillTranslateX.value = withSpring(maxBound + breach, SPRING_DRAG);

          const barPush = Math.pow(overdrag, 0.62) * 0.45;
          barTranslateX.value = withSpring(barPush, SPRING_DRAG);
          barScaleX.value = withSpring(1 + (overdrag / 360) * 0.04, SPRING_DRAG);

          // Collision contre le bouton compose si la barre pousse vers la droite
          if (barPush > 6) {
            const pushCompose = (barPush - 6) * 0.65;
            composeTranslateX.value = withSpring(pushCompose, SPRING_DRAG);
            if (!hasCollidedBar.value) {
              hasCollidedBar.value = true;
              runOnJS(triggerCollisionHaptic)();
            }
          } else {
            composeTranslateX.value = withSpring(0, SPRING_DRAG);
            hasCollidedBar.value = false;
          }
        } else {
          pillTranslateX.value = withSpring(idealPillX, SPRING_DRAG);
          barTranslateX.value = withSpring(0, SPRING_DRAG);
          barScaleX.value = withSpring(1, SPRING_DRAG);
          composeTranslateX.value = withSpring(0, SPRING_DRAG);
          hasCollidedBar.value = false;
        }

        if (hoveredIndex !== activeHoverIndex.value) {
          activeHoverIndex.value = hoveredIndex;
          runOnJS(triggerHoverFeedback)();
        }
      }
    })
    .onFinalize((e) => {
      if (drawerProgress && drawerProgress.value > 0.05) return;

      activeFocus.value = 0;
      isInteracting.value = false;

      barScale.value = withSpring(1.0, SPRING_SETTLE);
      barScaleX.value = withSpring(1.0, SPRING_SETTLE);
      pillScale.value = withSpring(1.0, SPRING_SETTLE);
      barTranslateX.value = withSpring(0, SPRING_SETTLE);
      composeTranslateX.value = withSpring(0, SPRING_SETTLE);

      pillOpacity.value = withTiming(isDark ? 0.14 : 0.09, { duration: 140 });

      const relativeX = e.x - TRACK_PADDING;
      let releaseIndex = 0;
      for (let i = 0; i < tabMetrics.offsets.length; i++) {
        const offset = tabMetrics.offsets[i];
        const w = tabMetrics.widths[i];
        if (
          relativeX >= offset &&
          (i === tabMetrics.offsets.length - 1 || relativeX < offset + w)
        ) {
          releaseIndex = i;
          break;
        }
      }
      releaseIndex = Math.max(0, Math.min(releaseIndex, tabCount - 1));
      const targetRoute = visibleRoutes[releaseIndex];

      const targetOffset = tabMetrics.offsets[releaseIndex] ?? 0;
      const targetWidth = tabMetrics.widths[releaseIndex] ?? 70;

      if (targetRoute?.name === 'profile') {
        const curOffset = tabMetrics.offsets[currentVisibleIndex] ?? 0;
        const curWidth = tabMetrics.widths[currentVisibleIndex] ?? 70;
        pillTranslateX.value = withSpring(curOffset, SPRING_SETTLE);
        pillWidth.value = withSpring(curWidth, SPRING_SETTLE);
      } else {
        pillTranslateX.value = withSpring(targetOffset, SPRING_SETTLE);
        pillWidth.value = withSpring(targetWidth, SPRING_SETTLE);
      }

      runOnJS(triggerNavigation)(releaseIndex);

      // Extinction douce de la lueur liquide
      glowOpacity.value = withTiming(0, { duration: 380, easing: Easing.out(Easing.quad) });
      glowScale.value = withTiming(0.85, { duration: 380 });

      hasMoved.value = false;
    });

  // Geste Pan sur le bouton compose (+) avec collision physique sur la barre
  const composePanGesture = Gesture.Pan()
    .minDistance(0)
    .onBegin(() => {
      activeFocus.value = 2; // Le bouton compose passe au-dessus
      hasCollidedCompose.value = false;
      composeScale.value = withSpring(1.06, SPRING_SETTLE);
      runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Light);
    })
    .onUpdate((e) => {
      const distance = Math.sqrt(e.translationX * e.translationX + e.translationY * e.translationY);
      const rubberBandFactor = 1 / (1 + distance / 40);

      const dx = e.translationX * rubberBandFactor * 0.65;
      const dy = e.translationY * rubberBandFactor * 0.65;

      composeTranslateX.value = withSpring(dx, SPRING_DRAG);
      composeTranslateY.value = withSpring(dy, SPRING_DRAG);

      // Collision physique contre la barre principale (vers la gauche)
      // L'écartement initial est de 10px : dès que dx < -8, le bouton cogne et pousse la barre
      if (dx < -8) {
        const penetration = Math.abs(dx) - 8;
        barTranslateX.value = withSpring(-penetration * 0.45, SPRING_DRAG);
        if (!hasCollidedCompose.value) {
          hasCollidedCompose.value = true;
          runOnJS(triggerCollisionHaptic)();
        }
      } else {
        barTranslateX.value = withSpring(0, SPRING_DRAG);
        hasCollidedCompose.value = false;
      }
    })
    .onFinalize((e) => {
      const distance = Math.sqrt(e.translationX * e.translationX + e.translationY * e.translationY);

      activeFocus.value = 0;
      composeTranslateX.value = withSpring(0, { damping: 20, stiffness: 260 });
      composeTranslateY.value = withSpring(0, { damping: 20, stiffness: 260 });
      composeScale.value = withSpring(1.0, { damping: 20, stiffness: 260 });
      barTranslateX.value = withSpring(0, { damping: 20, stiffness: 260 });

      // Si tap ou relâchement dans la zone, ouvrir le compose
      if (distance < 38) {
        runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Medium);
        runOnJS(router.push)('/compose');
      }
    });

  const barContainerStyle = useAnimatedStyle(() => {
    const isAbove = activeFocus.value === 1;
    return {
      zIndex: isAbove ? 30 : 10,
      elevation: isAbove ? 16 : 8,
      transform: [
        { translateX: barTranslateX.value },
        { scale: barScale.value },
        { scaleX: barScaleX.value },
      ],
    };
  });

  const composeContainerStyle = useAnimatedStyle(() => {
    const isAbove = activeFocus.value === 2;
    return {
      zIndex: isAbove ? 30 : 10,
      elevation: isAbove ? 16 : 8,
      transform: [
        { translateX: composeTranslateX.value },
        { translateY: composeTranslateY.value },
        { scale: composeScale.value },
      ],
    };
  });

  const pillAnimatedStyle = useAnimatedStyle(() => {
    let currentX = pillTranslateX.value;
    if (drawerProgress && !isInteracting.value) {
      const laggedProgress = interpolate(
        drawerProgress.value,
        [0, 0.22, 0.65, 0.92, 1],
        [0, 0.04, 0.68, 0.98, 1],
        Extrapolation.CLAMP
      );

      currentX = interpolate(laggedProgress, [0, 1], [pillTranslateX.value, 0]);
    }

    const pillBgColor = isDark
      ? `rgba(255, 255, 255, ${pillOpacity.value})`
      : `rgba(0, 0, 0, ${pillOpacity.value})`;

    return {
      transform: [{ translateX: currentX }, { scale: pillScale.value }],
      width: pillWidth.value > 0 ? pillWidth.value : (tabMetrics.widths[currentVisibleIndex] ?? 70),
      backgroundColor: pillBgColor,
    };
  });

  const auraRippleStyle = useAnimatedStyle(() => {
    const scale = interpolate(auraWaveProgress.value, [0, 1], [0.2, 1.45], Extrapolation.CLAMP);

    const opacity = interpolate(
      auraWaveProgress.value,
      [0, 0.35, 1],
      [0, 0.52, 0.5],
      Extrapolation.CLAMP
    );

    return {
      opacity,
      transform: [{ scale }],
    };
  });

  // Réduction d'échelle centrée et fluide au scroll-down (scale 0.90) sans altérer les shaders de verre
  const islandScrollAnimatedStyle = useAnimatedStyle(() => {
    // Si l'utilisateur est en train d'interagir directement avec la tab bar, on maintient l'échelle 1.0 normale
    if (isInteracting.value || activeFocus.value > 0) {
      return {
        transform: [{ scale: withSpring(1.0, SPRING_SETTLE) }],
      };
    }

    const isAtTop = scrollY.value <= 20;
    // La barre reste compacte tant qu'on scrolle vers le bas OU tant que le doigt est maintenu posé sur l'écran après déclenchement
    const shouldCompact =
      !isAtTop && (isScrollingDown.value || (hasTriggeredCompact.value && isDragging.value));
    const targetScale = shouldCompact ? 0.9 : 1.0;

    return {
      transform: [
        {
          scale: withSpring(targetScale, {
            damping: 22,
            stiffness: 240,
            mass: 0.4,
          }),
        },
      ],
    };
  });

  // Lueur liquide traînante avec retard de suivi sous le doigt
  const trailingGlowAnimatedStyle = useAnimatedStyle(() => {
    return {
      opacity: glowOpacity.value,
      transform: [{ translateX: glowX.value - 45 }, { scale: glowScale.value }],
    };
  });

  if (!state || !state.routes) {
    return null;
  }

  return (
    <View
      style={[styles.wrapper, { bottom: bottomOffset }, containerStyle]}
      pointerEvents="box-none"
    >
      {/* Véritable fond de flou progressif étagé Apple Music / iOS (réservé à iOS pour éviter les artefacts rectangulaires sur Android) */}
      {Platform.OS === 'ios' && (
        <View style={styles.appleBottomBackdrop} pointerEvents="none">
          {PROGRESSIVE_BLUR_STEPS.map((step, idx) => (
            <BlurView
              key={idx}
              intensity={step.intensity}
              tint={isDark ? 'systemUltraThinMaterialDark' : 'systemUltraThinMaterialLight'}
              style={[
                styles.blurSlice,
                {
                  height: step.height,
                  opacity: step.opacity,
                },
              ]}
            />
          ))}
          <View
            style={[
              styles.fadingTintBackdrop,
              {
                backgroundColor: isDark ? 'rgba(0, 0, 0, 0.45)' : 'rgba(255, 255, 255, 0.45)',
              },
            ]}
          />
        </View>
      )}

      {/* Row principale alignée : [ Barre 4 onglets ]  (gap 10px)  ( Bouton rond + 53px ) */}
      <Animated.View style={[styles.islandRow, islandScrollAnimatedStyle]} pointerEvents="box-none">
        {/* 1. Barre Principale Liquid Glass (4 onglets calibrés dynamiquement) */}
        <GestureDetector gesture={panGesture}>
          <Animated.View style={[styles.mainBarWrapper, barContainerStyle]}>
            <AdaptiveGlassView
              style={[
                styles.blurContainer,
                isDark ? styles.blurContainerDark : styles.blurContainerLight,
              ]}
              variant={variant}
              interactive={false}
              intensity={30}
              borderRadius={36}
              refraction={true}
              thickness={1.35}
              edgeReflectionStrength={1.0}
              tilt={false}
              tintColor={
                glassTintColor ?? (isDark ? 'rgba(20, 20, 26, 0.40)' : 'rgba(255, 255, 255, 0.40)')
              }
              {...glassProps}
            >
              {/* Liseré supérieur doux */}
              <View
                style={[
                  styles.softTopHighlight,
                  {
                    backgroundColor: isDark
                      ? 'rgba(255, 255, 255, 0.15)'
                      : 'rgba(255, 255, 255, 0.65)',
                  },
                ]}
              />

              <View style={styles.trackContainer}>
                {/* Lueur liquide traînante qui suit le doigt avec retard fluide */}
                <Animated.View
                  style={[
                    styles.trailingGlowLight,
                    {
                      backgroundColor: isDark
                        ? 'rgba(255, 255, 255, 0.24)'
                        : 'rgba(255, 255, 255, 0.65)',
                    },
                    trailingGlowAnimatedStyle,
                  ]}
                  pointerEvents="none"
                />

                <Animated.View
                  style={[
                    styles.activePill,
                    {
                      top: PILL_VERTICAL_PADDING,
                      bottom: PILL_VERTICAL_PADDING,
                    },
                    pillAnimatedStyle,
                  ]}
                >
                  {/* Onde de propagation liquide rayonnante depuis la PP */}
                  <Animated.View
                    style={[styles.avatarPropagationContainer, auraRippleStyle]}
                    pointerEvents="none"
                  >
                    <View style={styles.avatarCoreEpicenter} />
                    {userAvatarProps?.logoUrl ? (
                      <Image
                        source={{ uri: userAvatarProps.logoUrl }}
                        style={styles.avatarDiffusionImage}
                        blurRadius={22}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.avatarDiffusionFallback} />
                    )}
                  </Animated.View>
                </Animated.View>

                <View style={styles.tabsRow}>
                  {visibleRoutes.map((route: NavigationRoute, index: number) => {
                    const isFocused = currentVisibleIndex === index;
                    const cellWidth = tabMetrics.widths[index] ?? 70;
                    return (
                      <View key={route.key} style={[styles.tabItemCell, { width: cellWidth }]}>
                        <TabItem
                          name={route.name}
                          isFocused={isFocused}
                          iconConfig={iconsMap?.[route.name]}
                          activeColor={resolvedActiveColor}
                          inactiveColor={resolvedInactiveColor}
                          userAvatarProps={userAvatarProps}
                        />
                      </View>
                    );
                  })}
                </View>
              </View>
            </AdaptiveGlassView>

            {/* Bordure externe 360° discrète */}
            <View
              style={[
                styles.seamlessOuterBorder,
                {
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.11)' : 'rgba(0, 0, 0, 0.08)',
                },
              ]}
              pointerEvents="none"
            />
          </Animated.View>
        </GestureDetector>

        {/* 2. Bouton d'action circulaire séparé (+) Flottant à droite avec physique de choc & superposition */}
        <GestureDetector gesture={composePanGesture}>
          <Animated.View style={[styles.composeButtonWrapper, composeContainerStyle]}>
            <View style={styles.composePressable}>
              <AdaptiveGlassView
                style={[
                  styles.composeCircleGlass,
                  isDark ? styles.blurContainerDark : styles.blurContainerLight,
                ]}
                variant={variant}
                interactive={true}
                intensity={35}
                borderRadius={26.5}
                refraction={true}
                thickness={1.4}
                edgeReflectionStrength={1.0}
                tilt={false}
                tintColor={
                  glassTintColor ??
                  (isDark ? 'rgba(20, 20, 26, 0.40)' : 'rgba(255, 255, 255, 0.40)')
                }
                {...glassProps}
              >
                <View
                  style={[
                    styles.softTopHighlightCircle,
                    {
                      backgroundColor: isDark
                        ? 'rgba(255, 255, 255, 0.20)'
                        : 'rgba(255, 255, 255, 0.75)',
                    },
                  ]}
                />
                <Ionicons name="add" size={26} color={resolvedActiveColor} />
              </AdaptiveGlassView>

              {/* Bordure externe 360° du bouton rond */}
              <View
                style={[
                  styles.seamlessCircleBorder,
                  {
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.11)' : 'rgba(0, 0, 0, 0.08)',
                  },
                ]}
                pointerEvents="none"
              />
            </View>
          </Animated.View>
        </GestureDetector>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 14,
    right: 14,
    alignItems: 'center',
  },
  islandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    maxWidth: 420,
    gap: 10,
  },
  mainBarWrapper: {
    flex: 1,
    position: 'relative',
  },
  composeButtonWrapper: {
    position: 'relative',
  },
  composePressable: {
    width: 53,
    height: 53,
    borderRadius: 26.5,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  composeCircleGlass: {
    width: 53,
    height: 53,
    borderRadius: 26.5,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 20,
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
    borderRadius: 26.5,
    borderCurve: 'continuous',
    borderWidth: 0.5,
    zIndex: 10,
  },
  appleBottomBackdrop: {
    position: 'absolute',
    bottom: -34,
    left: -40,
    right: -40,
    height: 135,
    overflow: 'hidden',
    zIndex: -1,
  },
  blurSlice: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  fadingTintBackdrop: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 90,
  },
  blurContainer: {
    position: 'relative',
    borderRadius: 36,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: 'transparent',
    paddingHorizontal: TRACK_PADDING,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 20,
  },
  blurContainerDark: {
    shadowColor: '#000000',
    shadowOpacity: 0.35,
  },
  blurContainerLight: {
    shadowColor: '#000000',
    shadowOpacity: 0.12,
  },
  softTopHighlight: {
    position: 'absolute',
    top: 0,
    left: 36,
    right: 36,
    height: 0.75,
    borderRadius: 36,
    borderCurve: 'continuous',
    zIndex: 2,
  },
  seamlessOuterBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 36,
    borderCurve: 'continuous',
    borderWidth: 0.5,
    zIndex: 10,
  },
  trackContainer: {
    position: 'relative',
    width: '100%',
    borderRadius: 36,
    borderCurve: 'continuous',
  },
  trailingGlowLight: {
    position: 'absolute',
    top: 2,
    bottom: 2,
    width: 90,
    borderRadius: 45,
    borderCurve: 'continuous',
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 18,
    zIndex: 0,
  },
  activePill: {
    position: 'absolute',
    left: 0,
    borderRadius: 30,
    borderCurve: 'continuous',
    zIndex: 1,
    borderWidth: 0,
    overflow: 'hidden',
  },
  avatarPropagationContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 28,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarCoreEpicenter: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(238, 75, 43, 0.50)',
    shadowColor: '#ee4b2b',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 18,
    zIndex: 2,
  },
  avatarDiffusionImage: {
    width: '160%',
    height: '160%',
    transform: [{ scale: 1.2 }],
    opacity: 0.65,
  },
  avatarDiffusionFallback: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#ee4b2b',
    opacity: 0.5,
  },
  tabsRow: {
    flexDirection: 'row',
    width: '100%',
    zIndex: 3,
  },
  tabItemCell: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabItem: {
    width: '100%',
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
