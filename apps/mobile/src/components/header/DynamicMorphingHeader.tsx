import React, { useEffect } from 'react';
import { Appearance, Platform, Pressable, StyleSheet, useColorScheme, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';

import { ThemedText } from '@/components/themed-text';
import { QoeLogo } from '@/components/header/QoeLogo';
import { LiquidElasticButton } from '@/components/liquid-tab-bar/LiquidElasticButton';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { t } from '@/lib/i18n';

export type FeedTab = 'for_you' | 'following';

interface DynamicMorphingHeaderProps {
  activeTab: FeedTab;
  onSelectTab: (tab: FeedTab) => void;
  scrollY: SharedValue<number>;
  isScrollingDown: SharedValue<boolean>;
  onPressNotifications?: () => void;
  onPressMessages?: () => void;
}

export function DynamicMorphingHeader({
  activeTab,
  onSelectTab,
  scrollY,
  isScrollingDown,
  onPressNotifications,
  onPressMessages,
}: DynamicMorphingHeaderProps) {
  const theme = useTheme();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark' || Appearance.getColorScheme() === 'dark';

  // ⏳ Temporisation automatique fluide sans rebond
  const autoMorph = useSharedValue(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      autoMorph.value = withTiming(1, {
        duration: 350,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      });
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  // ─── Style Animé pour l'Ensemble du Header (Slide Up / Down fluide sans bounce) ───
  const headerContainerAnimatedStyle = useAnimatedStyle(() => {
    const isAtTop = scrollY.value <= 10;
    const isVisible = isAtTop || !isScrollingDown.value;

    return {
      transform: [
        {
          translateY: withTiming(isVisible ? 0 : -70, {
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
  });

  // ─── Style Animé pour le Logo « qoe.fi » (Transition douce linéaire/cubique) ───
  const logoAnimatedStyle = useAnimatedStyle(() => {
    const scrollProgress = interpolate(scrollY.value, [0, 35], [0, 1], 'clamp');
    const effectiveProgress = Math.max(scrollProgress, autoMorph.value);

    return {
      opacity: interpolate(effectiveProgress, [0, 0.7], [1, 0], 'clamp'),
      transform: [
        {
          translateY: interpolate(effectiveProgress, [0, 1], [0, -8], 'clamp'),
        },
        {
          scale: interpolate(effectiveProgress, [0, 1], [1, 0.9], 'clamp'),
        },
      ],
      pointerEvents: effectiveProgress >= 0.7 ? 'none' : 'auto',
    };
  });

  // ─── Style Animé pour les Onglets « Pour vous / Suivis » ───
  const tabsAnimatedStyle = useAnimatedStyle(() => {
    const scrollProgress = interpolate(scrollY.value, [0, 35], [0, 1], 'clamp');
    const effectiveProgress = Math.max(scrollProgress, autoMorph.value);

    return {
      opacity: interpolate(effectiveProgress, [0.3, 1], [0, 1], 'clamp'),
      transform: [
        {
          translateY: interpolate(effectiveProgress, [0, 1], [8, 0], 'clamp'),
        },
        {
          scale: interpolate(effectiveProgress, [0, 1], [0.92, 1], 'clamp'),
        },
      ],
      pointerEvents: effectiveProgress <= 0.3 ? 'none' : 'auto',
    };
  });

  const handleTabPress = (tab: FeedTab) => {
    if (tab !== activeTab) {
      if (Platform.OS === 'ios') {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      onSelectTab(tab);
    }
  };

  const handleLogoPress = () => {
    autoMorph.value = withTiming(autoMorph.value >= 0.5 ? 0 : 1, {
      duration: 300,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    });
  };

  return (
    <Animated.View
      style={[styles.headerContainer, headerContainerAnimatedStyle]}
      pointerEvents="box-none"
    >
      {/* ─── Côté Gauche : Morphing Logo qoe.fi ↔ Onglets « Pour vous ⌵ / Suivis ⌵ » ─── */}
      <View style={styles.leftSection}>
        {/* Logo qoe.fi au repos */}
        <Animated.View style={[styles.absoluteLeft, logoAnimatedStyle]}>
          <Pressable onPress={handleLogoPress}>
            <QoeLogo size={24} />
          </Pressable>
        </Animated.View>

        {/* Sélecteur d'onglets « Pour vous ⌵ / Suivis » (Parité Instagram) */}
        <Animated.View style={[styles.absoluteLeft, styles.tabsRow, tabsAnimatedStyle]}>
          <Pressable
            onPress={() => handleTabPress('for_you')}
            hitSlop={6}
            style={({ pressed }) => [styles.tabItem, pressed && styles.tabPressed]}
          >
            <View style={styles.tabTextRow}>
              <ThemedText
                style={[
                  styles.tabText,
                  {
                    color: activeTab === 'for_you' ? theme.text : theme.textSecondary,
                    fontWeight: activeTab === 'for_you' ? '800' : '600',
                    opacity: activeTab === 'for_you' ? 1 : 0.6,
                  },
                ]}
              >
                {t('feed.tabs.for_you', 'Pour vous')}
              </ThemedText>
              {activeTab === 'for_you' && (
                <ThemedText style={[styles.chevron, { color: theme.text }]}>⌄</ThemedText>
              )}
            </View>
            {activeTab === 'for_you' && (
              <View style={[styles.tabIndicator, { backgroundColor: theme.primary }]} />
            )}
          </Pressable>

          <Pressable
            onPress={() => handleTabPress('following')}
            hitSlop={6}
            style={({ pressed }) => [styles.tabItem, pressed && styles.tabPressed]}
          >
            <View style={styles.tabTextRow}>
              <ThemedText
                style={[
                  styles.tabText,
                  {
                    color: activeTab === 'following' ? theme.text : theme.textSecondary,
                    fontWeight: activeTab === 'following' ? '800' : '600',
                    opacity: activeTab === 'following' ? 1 : 0.6,
                  },
                ]}
              >
                {t('feed.tabs.following', 'Suivis')}
              </ThemedText>
            </View>
            {activeTab === 'following' && (
              <View style={[styles.tabIndicator, { backgroundColor: theme.primary }]} />
            )}
          </Pressable>
        </Animated.View>
      </View>

      {/* ─── Côté Droit : Boutons d'action en Verre Liquide Élastique (Liquid Glass 53px) ─── */}
      <View style={styles.actionsRow}>
        {/* Bouton Notifications / Likes 🔔 / ♡ */}
        <LiquidElasticButton
          size={53}
          borderRadius={26.5}
          onPress={onPressNotifications}
          accessibilityLabel={t('nav.notifications', 'Notifications')}
          icon={
            <SymbolView
              name={{ ios: 'heart', android: 'favorite_border', web: 'favorite_border' }}
              size={22}
              tintColor={theme.text}
              weight="semibold"
            />
          }
        />

        {/* Bouton Messages / Direct 💬 / ✈️ */}
        <LiquidElasticButton
          size={53}
          borderRadius={26.5}
          onPress={onPressMessages}
          accessibilityLabel={t('nav.messages', 'Messages')}
          icon={
            <SymbolView
              name={{
                ios: 'paperplane',
                android: 'send',
                web: 'send',
              }}
              size={21}
              tintColor={theme.text}
              weight="semibold"
            />
          }
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    height: 54,
    paddingHorizontal: Spacing.four,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 100,
  },
  leftSection: {
    flex: 1,
    height: 54,
    justifyContent: 'center',
    position: 'relative',
  },
  absoluteLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
  },
  tabItem: {
    position: 'relative',
    paddingVertical: 6,
  },
  tabTextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tabText: {
    fontSize: 18,
    letterSpacing: -0.4,
  },
  chevron: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: -2,
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2.5,
    borderRadius: 2,
  },
  tabPressed: {
    opacity: 0.7,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
});
