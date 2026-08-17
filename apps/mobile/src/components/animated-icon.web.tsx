// =====================================================================
// ✨ AnimatedIcon — VARIANTE WEB (remplace animated-icon.tsx sur web)
// =====================================================================
// ⚠️ Sur le web, `AnimatedSplashOverlay` renvoie `null` : pas de masque
//    plein écran (le splash natif n'existe pas). Seul le logo animé reste.
//    Durées plus courtes (300ms vs 600ms natif) car le rendu web est plus
//    rapide à hydrater.
// =====================================================================

import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import Animated, { Keyframe, Easing } from 'react-native-reanimated';

import classes from './animated-icon.module.css';
const DURATION = 300; // ms — durée d'entrée du logo sur web

export function AnimatedSplashOverlay() {
  return null;
}

// La carte : part de scale 0 (invisible) → dépasse à 1.2 (60%) → revient à
// 1, avec un elastic plus prononcé (1.2) que la version native (0.7).
const keyframe = new Keyframe({
  0: {
    transform: [{ scale: 0 }],
  },
  60: {
    transform: [{ scale: 1.2 }],
    easing: Easing.elastic(1.2),
  },
  100: {
    transform: [{ scale: 1 }],
    easing: Easing.elastic(1.2),
  },
});

// Le logo : fondu + scale 0 → 1.2 → 1 (elastic 1.2).
const logoKeyframe = new Keyframe({
  0: {
    opacity: 0,
  },
  60: {
    transform: [{ scale: 1.2 }],
    opacity: 0,
    easing: Easing.elastic(1.2),
  },
  100: {
    transform: [{ scale: 1 }],
    opacity: 1,
    easing: Easing.elastic(1.2),
  },
});

// Le glow web : démarre à -180° (rotation inversée) + scale 0.8 + invisible,
// se stabilise à 0°/scale 1/opaque dès le début, puis tourne 20 tours (7200°)
// sur 4 minutes.
const glowKeyframe = new Keyframe({
  0: {
    transform: [{ rotateZ: '-180deg' }, { scale: 0.8 }],
    opacity: 0,
  },
  [DURATION / 1000]: {
    transform: [{ rotateZ: '0deg' }, { scale: 1 }],
    opacity: 1,
    easing: Easing.elastic(0.7),
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

      <Animated.View style={styles.background} entering={keyframe.duration(DURATION)}>
        <div className={classes.expoLogoBackground} />
      </Animated.View>

      <Animated.View style={styles.imageContainer} entering={logoKeyframe.duration(DURATION)}>
        <Image style={styles.image} source={require('@/assets/images/expo-logo.png')} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Position du logo sur web : centré horizontalement, à `128/2 + 138` =
  // 202px du haut (sous la barre d'onglets web, cf. app-tabs.web).
  container: {
    alignItems: 'center',
    width: '100%',
    zIndex: 1000,
    position: 'absolute',
    top: 128 / 2 + 138,
  },
  imageContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
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
  },
  // Le logo est ABSOLUTEMENT positionné sur web (surcharge la version
  // native qui est en flux normal) — 76×71.
  image: {
    position: 'absolute',
    width: 76,
    height: 71,
  },
  background: {
    width: 128,
    height: 128,
    position: 'absolute',
  },
});
