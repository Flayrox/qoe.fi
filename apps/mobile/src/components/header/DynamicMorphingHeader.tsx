import React, { useEffect, useState } from 'react';
import { Appearance, Platform, Pressable, StyleSheet, useColorScheme, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';

import { ThemedText } from '@/components/themed-text';
import { QoeLogo } from '@/components/header/QoeLogo';
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

  // ⏳ Temporisation automatique : le logo qoe.fi s'affiche au début,
  // puis après 2.5 secondes se transforme automatiquement en « Pour vous » !
  const [autoMorphProgress, setAutoMorphProgress] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setAutoMorphProgress(1);
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  // ─── Style Animé pour l'Ensemble du Header (Slide Up / Down Instagram-Style) ───
  const headerContainerAnimatedStyle = useAnimatedStyle(() => {
    const isAtTop = scrollY.value <= 10;
    const isVisible = isAtTop || !isScrollingDown.value;

    return {
      transform: [
        {
          translateY: withSpring(isVisible ? 0 : -70, {
            damping: 24,
            stiffness: 260,
          }),
        },
      ],
      opacity: withTiming(isVisible ? 1 : 0, { duration: 200 }),
    };
  });

  // ─── Style Animé pour le Logo « qoe.fi » ───
  const logoAnimatedStyle = useAnimatedStyle(() => {
    const scrollProgress = interpolate(scrollY.value, [0, 35], [0, 1], 'clamp');
    const effectiveProgress = Math.max(scrollProgress, autoMorphProgress);

    return {
      opacity: withTiming(1 - effectiveProgress, { duration: 300 }),
      transform: [
        {
          translateY: withSpring(1 - effectiveProgress ? 0 : -8, {
            damping: 20,
            stiffness: 220,
          }),
        },
        {
          scale: withSpring(1 - effectiveProgress * 0.1, {
            damping: 20,
            stiffness: 220,
          }),
        },
      ],
      pointerEvents: effectiveProgress >= 0.8 ? 'none' : 'auto',
    };
  });

  // ─── Style Animé pour les Onglets « Pour vous / Suivis » ───
  const tabsAnimatedStyle = useAnimatedStyle(() => {
    const scrollProgress = interpolate(scrollY.value, [0, 35], [0, 1], 'clamp');
    const effectiveProgress = Math.max(scrollProgress, autoMorphProgress);

    return {
      opacity: withTiming(effectiveProgress, { duration: 300 }),
      transform: [
        {
          translateY: withSpring(effectiveProgress ? 0 : 8, {
            damping: 20,
            stiffness: 220,
          }),
        },
        {
          scale: withSpring(0.92 + effectiveProgress * 0.08, {
            damping: 20,
            stiffness: 220,
          }),
        },
      ],
      pointerEvents: effectiveProgress <= 0.2 ? 'none' : 'auto',
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

  const glassButtonStyle = [
    styles.glassButton,
    {
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)',
      borderColor: isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(0, 0, 0, 0.08)',
    },
  ];

  return (
    <Animated.View
      style={[styles.headerContainer, headerContainerAnimatedStyle]}
      pointerEvents="box-none"
    >
      {/* ─── Côté Gauche : Morphing Logo qoe.fi ↔ Onglets « Pour vous ⌵ / Suivis ⌵ » ─── */}
      <View style={styles.leftSection}>
        {/* Logo qoe.fi au repos */}
        <Animated.View style={[styles.absoluteLeft, logoAnimatedStyle]}>
          <Pressable onPress={() => setAutoMorphProgress((v) => (v === 1 ? 0 : 1))}>
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

      {/* ─── Côté Droit : Boutons d'action en Verre Liquide (Liquid Glass) ─── */}
      <View style={styles.actionsRow}>
        {/* Bouton Notifications / Likes 🔔 / ♡ */}
        <Pressable
          onPress={onPressNotifications}
          style={({ pressed }) => [glassButtonStyle, pressed && styles.buttonPressed]}
          accessibilityLabel={t('nav.notifications', 'Notifications')}
          hitSlop={4}
        >
          <SymbolView
            name={{ ios: 'heart', android: 'favorite_border', web: 'favorite_border' }}
            size={18}
            tintColor={theme.text}
            weight="semibold"
          />
        </Pressable>

        {/* Bouton Messages / Direct 💬 / ✈️ */}
        <Pressable
          onPress={onPressMessages}
          style={({ pressed }) => [glassButtonStyle, pressed && styles.buttonPressed]}
          accessibilityLabel={t('nav.messages', 'Messages')}
          hitSlop={4}
        >
          <SymbolView
            name={{
              ios: 'paperplane',
              android: 'send',
              web: 'send',
            }}
            size={17}
            tintColor={theme.text}
            weight="semibold"
          />
        </Pressable>
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
    height: 48,
    paddingHorizontal: Spacing.four,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 100,
  },
  leftSection: {
    flex: 1,
    height: 48,
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
    gap: Spacing.two,
  },
  glassButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  buttonPressed: {
    transform: [{ scale: 0.92 }],
    opacity: 0.8,
  },
});
