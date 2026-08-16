import { useCallback, useMemo, type PropsWithChildren } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Sidebar } from '@/features/sidebar/sidebar';
import { useTheme } from '@/hooks/use-theme';

import { DrawerContext } from './drawer-context';

// Drawer deck (façon X) : la sidebar vit en arrière-plan (zIndex 1) et
// c'est l'écran principal qui se décale pour la révéler. Pas d'échelle ni
// de spring : le deck garde sa taille, les coins sont arrondis en permanence
// et le mouvement se termine sans rebond (withTiming).
const TIMING_CONFIG = { duration: 250 } as const;
const EDGE_SWIPE_WIDTH = 40;
const DECK_RADIUS = 32;
const SHADOW_OPEN = 0.25;
const PARALLAX_OFFSET = -40;

function clamp(value: number, min: number, max: number) {
  'worklet';
  return Math.min(Math.max(value, min), max);
}

export function AppDrawer({ children }: PropsWithChildren) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const progress = useSharedValue(0);
  const startProgress = useSharedValue(0);

  const drawerOffset = width * 0.72;

  // Note : la règle react-hooks/immutability ne connaît pas les shared
  // values de reanimated — les mutations de `.value` ci-dessous sont
  // légitimes (worklets), d'où les désactivations ciblées.
  const openDrawer = useCallback(() => {
    // eslint-disable-next-line react-hooks/immutability -- mutation de shared value reanimated
    progress.value = withTiming(1, TIMING_CONFIG);
  }, [progress]);

  const closeDrawer = useCallback(() => {
    // eslint-disable-next-line react-hooks/immutability -- mutation de shared value reanimated
    progress.value = withTiming(0, TIMING_CONFIG);
  }, [progress]);

  const value = useMemo(() => ({ openDrawer, closeDrawer }), [openDrawer, closeDrawer]);

  // L'écran principal : translation + ombre portée qui apparaît à
  // l'ouverture. Tout s'exécute sur le thread UI (reanimated), sans bridge.
  const canvasStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(progress.value, [0, 1], [0, drawerOffset]) }],
    shadowOpacity: interpolate(progress.value, [0, 1], [0, SHADOW_OPEN]),
    elevation: interpolate(progress.value, [0, 1], [0, 20]),
  }));

  // Parallaxe du menu : il glisse de -40 → 0 et apparaît en fondu.
  const sidebarStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, 1]),
    transform: [{ translateX: interpolate(progress.value, [0, 1], [PARALLAX_OFFSET, 0]) }],
  }));

  const panGesture = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .onTouchesDown((event, manager) => {
      // Fermé : seul un swipe depuis le bord gauche ouvre le drawer.
      // Ouvert : le geste est actif partout sur le canvas pour le refermer.
      const touchX = event.allTouches[0]?.x ?? 0;
      if (progress.value < 0.5 && touchX > EDGE_SWIPE_WIDTH) {
        manager.fail();
      }
    })
    .onStart(() => {
      'worklet';
      startProgress.value = progress.value;
    })
    .onUpdate((event) => {
      'worklet';
      // eslint-disable-next-line react-hooks/immutability -- mutation de shared value reanimated
      progress.value = clamp(startProgress.value + event.translationX / drawerOffset, 0, 1);
    })
    .onEnd((event) => {
      'worklet';
      const shouldOpen = event.velocityX > 500 || progress.value > 0.4;
      // eslint-disable-next-line react-hooks/immutability -- mutation de shared value reanimated
      progress.value = withTiming(shouldOpen ? 1 : 0, TIMING_CONFIG);
    });

  return (
    <DrawerContext.Provider value={value}>
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        {/* 1. Sidecar en arrière-plan. Taper en dehors du deck ferme le drawer :
            les Pressables du menu (enfants) captent leurs propres taps. */}
        <View style={styles.sidecarContainer}>
          <Pressable style={styles.sidecarPressable} onPress={closeDrawer}>
            <Animated.View style={[styles.sidecarInner, sidebarStyle]} pointerEvents="box-none">
              <Sidebar />
            </Animated.View>
          </Pressable>
        </View>

        {/* 2. Écran principal interactif (le deck) — coins arrondis en
            permanence ; l'ombre vit sur la couche externe, le contenu est
            clippé par la couche interne au même rayon. */}
        <Animated.View style={[styles.deckShadow, canvasStyle]}>
          <Animated.View style={[styles.deck, { backgroundColor: theme.background }]}>
            <GestureDetector gesture={panGesture}>
              <View style={styles.deckSurface}>{children}</View>
            </GestureDetector>
          </Animated.View>
        </Animated.View>
      </View>
    </DrawerContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  sidecarContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1,
  },
  sidecarPressable: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  sidecarInner: {
    flex: 1,
  },
  deckShadow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2,
    borderRadius: DECK_RADIUS,
    shadowColor: '#000000',
    shadowOffset: { width: -8, height: 0 },
    shadowRadius: 16,
  },
  deck: {
    flex: 1,
    borderRadius: DECK_RADIUS,
    overflow: 'hidden',
  },
  deckSurface: {
    flex: 1,
  },
});
