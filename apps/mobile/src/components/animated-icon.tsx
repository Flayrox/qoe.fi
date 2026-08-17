// =====================================================================
// ✨ AnimatedSplashOverlay / AnimatedIcon — Splash animé (version NATIVE)
// =====================================================================
// Deux exports :
//  1. `AnimatedSplashOverlay` : masque plein écran (fond #208AEF) monté
//     par-dessus l'app (zIndex 1000) tant que la session se charge. Au
//     premier layout il cache le splash natif (SplashScreen.hideAsync)
//     puis anime sa propre disparition (fade + scale élastic).
//  2. `AnimatedIcon` : le logo animé (utilisé par le splash screen natif
//     via app.json — pas monté dans l'app actuellement).
//
// ⚠️ PIXELS : le logo est 76×71 px, la carte 128×128 px (radius 40), le
//    glow 201×201 px. Durées : 600 ms (DURATION), glow = 4 min (long).
// =====================================================================

import { Image } from 'expo-image';
import * as SplashScreen from 'expo-splash-screen';
import { useState } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Animated, { Easing, Keyframe } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

// Le dégradé de fond démarre à une échelle proportionnelle à la hauteur
// d'écran (hauteur/90) pour couvrir tout l'écran au départ, puis zoome
// vers 1 (la carte 128px).
const INITIAL_SCALE_FACTOR = Dimensions.get('screen').height / 90;
const DURATION = 600; // ms — durée de la disparition du splash

export function AnimatedSplashOverlay() {
  // `animate` : true une fois le splash natif caché (on anime alors la
  // disparition du masque). `visible` : false après la fin de l'animation
  // (on démonte le composant → `return null`).
  const [animate, setAnimate] = useState(false);
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  // Keyframe de disparition du masque :
  //   0%   → opaque (scale 1)
  //   20%  → toujours opaque (le logo reste visible 120ms)
  //   70%  → opacité 0 avec easing ELASTIC (léger rebond à la disparition)
  //   100% → invisible, scale 1
  const splashKeyframe = new Keyframe({
    0: {
      transform: [{ scale: 1 }],
      opacity: 1,
    },
    20: {
      opacity: 1,
    },
    70: {
      opacity: 0,
      easing: Easing.elastic(0.7),
    },
    100: {
      opacity: 0,
      transform: [{ scale: 1 }],
      easing: Easing.elastic(0.7),
    },
  });

  const image = <Image style={styles.image} source={require('@/assets/images/expo-logo.png')} />;

  return animate ? (
    // Phase 2 : on anime la disparition du masque (600ms), puis on
    // démonte le composant via scheduleOnRN (retour sur le thread JS).
    <Animated.View
      entering={splashKeyframe.duration(DURATION).withCallback((finished) => {
        'worklet';
        if (finished) {
          scheduleOnRN(setVisible, false);
        }
      })}
      style={styles.splashOverlay}
    >
      {image}
    </Animated.View>
  ) : (
    // Phase 1 : masque statique. Dès que la vue est mesurée (onLayout),
    // on cache le splash natif (évite le flash du splash système) puis on
    // passe en phase 2.
    <View
      onLayout={() => {
        SplashScreen.hideAsync().finally(() => {
          setAnimate(true);
        });
      }}
      style={styles.splashOverlay}
    >
      {image}
    </View>
  );
}

// ── Animations du logo (AnimatedIcon, splash natif) ──────────────

// Le dégradé bleu : part d'une échelle géante (couvre l'écran) et zoome
// vers la carte 128px avec un easing elastic — effet « zoom caméra ».
const keyframe = new Keyframe({
  0: {
    transform: [{ scale: INITIAL_SCALE_FACTOR }],
  },
  100: {
    transform: [{ scale: 1 }],
    easing: Easing.elastic(0.7),
  },
});

// Le logo Expo : invisible et légèrement surdimensionné (1.3), apparaît
// en fondu à partir de 40% et se redimensionne à 1 avec elastic.
const logoKeyframe = new Keyframe({
  0: {
    transform: [{ scale: 1.3 }],
    opacity: 0,
  },
  40: {
    transform: [{ scale: 1.3 }],
    opacity: 0,
    easing: Easing.elastic(0.7),
  },
  100: {
    opacity: 1,
    transform: [{ scale: 1 }],
    easing: Easing.elastic(0.7),
  },
});

// Le glow (halo lumineux) : rotation continue de 0° à 7200° (= 20 tours)
// sur 4 minutes (60s × 4) — effet « anneau de lumière en rotation lente ».
const glowKeyframe = new Keyframe({
  0: {
    transform: [{ rotateZ: '0deg' }],
  },
  100: {
    transform: [{ rotateZ: '7200deg' }],
  },
});

export function AnimatedIcon() {
  return (
    <View style={styles.iconContainer}>
      <Animated.View entering={glowKeyframe.duration(60 * 1000 * 4)} style={styles.glow}>
        <Image style={styles.glow} source={require('@/assets/images/logo-glow.png')} />
      </Animated.View>

      <Animated.View entering={keyframe.duration(DURATION)} style={styles.background} />
      <Animated.View style={styles.imageContainer} entering={logoKeyframe.duration(DURATION)}>
        <Image style={styles.image} source={require('@/assets/images/expo-logo.png')} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  imageContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Halo lumineux 201×201 (dépasse la carte de 36.5px de chaque côté).
  glow: {
    width: 201,
    height: 201,
    position: 'absolute',
  },
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 128,
    height: 128,
    zIndex: 100,
  },
  // Logo Expo : 76×71 (ratio ~1.07).
  image: {
    width: 76,
    height: 71,
  },
  // Carte bleue 128×128, radius 40, dégradé vertical #3C9FFE → #0274DF.
  background: {
    borderRadius: 40,
    experimental_backgroundImage: `linear-gradient(180deg, #3C9FFE, #0274DF)`,
    width: 128,
    height: 128,
    position: 'absolute',
  },
  // Masque plein écran : fond bleu #208AEF, centré, au-dessus de tout.
  splashOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#208AEF',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
});
