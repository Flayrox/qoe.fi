import { useCallback, useEffect, useMemo, type PropsWithChildren } from 'react';
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

import { DrawerContext, drawerController } from './drawer-context';

// Drawer deck (façon X) : la sidebar vit en arrière-plan (zIndex 1) et
// c'est l'écran principal qui se décale pour la révéler. Pas d'échelle ni
// de spring : le deck garde sa taille, les coins sont arrondis en permanence
// (façon iPhone) et le mouvement se termine sans rebond (withTiming).
// Au repos, la sidebar est à peine transparente / à peine « reculée » et
// fait un mini-pop doux à l'ouverture — pas agressif du tout.
const TIMING_CONFIG = { duration: 250 } as const;
const EDGE_SWIPE_WIDTH = 40;
const DECK_RADIUS = 60; // arrondi iPhone, un poil plus marqué
const SHADOW_OPEN = 0.12;
const SHADOW_RADIUS = 8;
const SHADOW_OFFSET_X = -4;
const SIDEBAR_REST_OPACITY = 0.45;
const SIDEBAR_REST_SCALE = 0.97;
// Progression où le pop se termine : un poil après mi-parcours (0.65)
// pour laisser l'opacité monter un tout petit peu plus longtemps.
const POP_END = 0.65;

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

  useEffect(() => {
    drawerController.openDrawer = openDrawer;
    drawerController.closeDrawer = closeDrawer;
  }, [openDrawer, closeDrawer]);

  const value = useMemo(
    () => ({ openDrawer, closeDrawer, progress }),
    [openDrawer, closeDrawer, progress]
  );

  // L'écran principal : translation seule. L'ombre est statique (déjà là),
  // pas d'animation. Tout s'exécute sur le thread UI (reanimated).
  const canvasStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(progress.value, [0, 1], [0, drawerOffset]) }],
  }));

  // Mini-pop de la sidebar : au début du scroll elle est nettement plus
  // transparente et à peine reculée ; elle revient à 100% / échelle 1 un
  // poil après mi-parcours (POP_END), en douceur, sans rebond ni slide
  // latéral.
  const sidebarStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, POP_END], [SIDEBAR_REST_OPACITY, 1]),
    transform: [{ scale: interpolate(progress.value, [0, POP_END], [SIDEBAR_REST_SCALE, 1]) }],
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
              <View style={styles.deckSurface}>
                {children}

                {/* Overlay qui bloque toute manipulation du feed et de la tabbar quand la sidebar est ouverte */}
                <Animated.View
                  style={[
                    styles.deckBlockerOverlay,
                    useAnimatedStyle(() => ({
                      opacity: progress.value > 0.05 ? 1 : 0,
                      pointerEvents: progress.value > 0.05 ? 'auto' : 'none',
                    })),
                  ]}
                >
                  <Pressable style={StyleSheet.absoluteFill} onPress={closeDrawer} />
                </Animated.View>
              </View>
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
  deckBlockerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999,
    backgroundColor: 'transparent',
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
    shadowOffset: { width: SHADOW_OFFSET_X, height: 0 },
    shadowOpacity: SHADOW_OPEN,
    shadowRadius: SHADOW_RADIUS,
    elevation: 12,
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
