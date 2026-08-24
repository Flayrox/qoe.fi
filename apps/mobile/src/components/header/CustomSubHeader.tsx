import React from 'react';
import { Appearance, StyleProp, StyleSheet, useColorScheme, View, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { EdgeFadeView } from 'react-native-edge-fade';

import { ThemedText } from '@/components/themed-text';
import { LiquidElasticButton } from '@/components/liquid-tab-bar/LiquidElasticButton';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { t } from '@/lib/i18n';

export interface CustomSubHeaderProps {
  /** Titre central fixe (ex: "Profil", "Bibliothèque", "Notifications") */
  title?: string;
  /** Sous-titre ou handle optionnel affiché sous le titre */
  subtitle?: string;
  /** Rendu personnalisé de la section centrale (pour morphing, dropdown, onglets, logos, etc.) */
  centerComponent?: React.ReactNode;
  /** Bouton ou élément d'action à droite (ex: menu ⋯, bouton partage, bouton marquer comme lu) */
  rightComponent?: React.ReactNode;
  /** Callback optionnel pour le bouton retour (défaut: router.back()) */
  onBackPress?: () => void;
  /** Masquer le bouton retour à gauche */
  hideBackButton?: boolean;
  /** SharedValue du scrollY si l'écran souhaite synchroniser l'opacité ou la translation */
  scrollY?: SharedValue<number>;
  /** SharedValue de direction de scroll si on souhaite cacher le header au scroll vers le bas */
  isScrollingDown?: SharedValue<boolean>;
  /** Seuil de scroll à partir duquel le header s'anime (défaut: 30) */
  scrollThreshold?: number;
  /** Si true, le titre apparaît au scroll (ex: profil quand l'avatar quitte l'écran) */
  showTitleOnScrollOnly?: boolean;
  /** Activer ou désactiver le flou zénithal EdgeFadeView (défaut: true) */
  enableBlur?: boolean;
  /** Style additionnel pour le conteneur */
  style?: StyleProp<ViewStyle>;
}

export function CustomSubHeader({
  title,
  subtitle,
  centerComponent,
  rightComponent,
  onBackPress,
  hideBackButton = false,
  scrollY,
  isScrollingDown,
  scrollThreshold = 35,
  showTitleOnScrollOnly = false,
  enableBlur = true,
  style,
}: CustomSubHeaderProps) {
  const theme = useTheme();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark' || Appearance.getColorScheme() === 'dark';

  // Animation conditionnelle au scroll
  const containerAnimatedStyle = useAnimatedStyle(() => {
    if (!scrollY && !isScrollingDown) {
      return {};
    }

    if (isScrollingDown) {
      const isAtTop = scrollY ? scrollY.value <= 10 : true;
      const isVisible = isAtTop || !isScrollingDown.value;

      return {
        transform: [
          {
            translateY: withTiming(isVisible ? 0 : -65, {
              duration: 250,
              easing: Easing.bezier(0.25, 0.1, 0.25, 1),
            }),
          },
        ],
        opacity: withTiming(isVisible ? 1 : 0, {
          duration: 200,
          easing: Easing.bezier(0.25, 0.1, 0.25, 1),
        }),
      };
    }

    return {};
  });

  // Animation spécifique pour le titre si showTitleOnScrollOnly est activé
  const centerAnimatedStyle = useAnimatedStyle(() => {
    if (!showTitleOnScrollOnly || !scrollY) {
      return { opacity: 1 };
    }

    const progress = interpolate(
      scrollY.value,
      [scrollThreshold, scrollThreshold + 40],
      [0, 1],
      'clamp'
    );

    return {
      opacity: progress,
      transform: [
        {
          translateY: interpolate(progress, [0, 1], [6, 0], 'clamp'),
        },
      ],
    };
  });

  const handleBack = () => {
    if (onBackPress) {
      onBackPress();
    } else {
      router.back();
    }
  };

  return (
    <>
      {/* ─── Flou progressif zénithal (EdgeFadeView - Metal / AGSL) ─── */}
      {enableBlur ? (
        <EdgeFadeView
          mode="blur"
          top={108}
          blurRadius={18}
          curve={{ type: 'stops', values: [1, 0.7, 0.38, 0.14, 0.04, 0] }}
          style={styles.blurBackground}
          pointerEvents="none"
        />
      ) : null}

      <Animated.View
        style={[styles.headerContainer, containerAnimatedStyle, style]}
        pointerEvents="box-none"
      >
        {/* ─── Côté Gauche : Bouton Retour Liquid Glass ─── */}
        <View style={styles.sideSection} pointerEvents="box-none">
          {!hideBackButton ? (
            <LiquidElasticButton
              size={42}
              borderRadius={21}
              onPress={handleBack}
              accessibilityLabel={t('common.back', 'Retour')}
              icon={<Ionicons name="arrow-back" size={21} color={theme.text} />}
            />
          ) : (
            <View style={styles.sidePlaceholder} />
          )}
        </View>

        {/* ─── Section Centrale : Titre / Morphing Component ─── */}
        <View style={styles.centerSection} pointerEvents="box-none">
          {centerComponent ? (
            centerComponent
          ) : title ? (
            <Animated.View
              style={[styles.titleWrapper, centerAnimatedStyle]}
              pointerEvents="box-none"
            >
              <ThemedText style={[styles.titleText, { color: theme.text }]} numberOfLines={1}>
                {title}
              </ThemedText>
              {subtitle ? (
                <ThemedText
                  style={[styles.subtitleText, { color: theme.textSecondary }]}
                  numberOfLines={1}
                >
                  {subtitle}
                </ThemedText>
              ) : null}
            </Animated.View>
          ) : null}
        </View>

        {/* ─── Côté Droit : Action personnalisée (Liquid Glass 42px) ─── */}
        <View style={styles.sideSection} pointerEvents="box-none">
          {rightComponent ? rightComponent : <View style={styles.sidePlaceholder} />}
        </View>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  blurBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 115,
    zIndex: 90,
  },
  headerContainer: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    height: 52,
    paddingHorizontal: Spacing.four,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 100,
  },
  sideSection: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sidePlaceholder: {
    width: 42,
    height: 42,
  },
  centerSection: {
    flex: 1,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
  },
  titleWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleText: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  subtitleText: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: -0.2,
    marginTop: -1,
  },
});
