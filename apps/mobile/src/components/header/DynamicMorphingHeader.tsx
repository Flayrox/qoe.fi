import React, { useEffect, useState } from 'react';
import { Appearance, Modal, Pressable, StyleSheet, useColorScheme, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
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
import { AdaptiveGlassView } from '@/components/liquid-tab-bar/AdaptiveGlassView';
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

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

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
  }, [autoMorph]);

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

  // ─── Style Animé pour le Sélecteur « Pour vous ⌵ » ───
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

  const toggleDropdown = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsDropdownOpen((prev) => !prev);
  };

  const handleSelectFeedOption = (tab: FeedTab) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsDropdownOpen(false);
    if (tab !== activeTab) {
      onSelectTab(tab);
    }
  };

  const handleLogoPress = () => {
    autoMorph.value = withTiming(autoMorph.value >= 0.5 ? 0 : 1, {
      duration: 300,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    });
  };

  const currentTabLabel =
    activeTab === 'for_you'
      ? t('feed.tabs.for_you', 'Pour vous')
      : t('feed.tabs.following', 'Suivis');

  return (
    <>
      <Animated.View
        style={[styles.headerContainer, headerContainerAnimatedStyle]}
        pointerEvents="box-none"
      >
        {/* ─── Spacer Gauche (53px) pour équilibrer parfaitement le bouton Messages à droite ─── */}
        <View style={styles.sideSpacer} />

        {/* ─── Section Centrale : Morphing Logo qoe.fi ↔ Sélecteur « Pour vous ⌵ » ─── */}
        <View style={styles.centerSection}>
          {/* Logo qoe.fi centré au repos */}
          <Animated.View style={[styles.absoluteCenter, logoAnimatedStyle]}>
            <Pressable onPress={handleLogoPress} hitSlop={10}>
              <QoeLogo height={28} color={isDark ? '#FFFFFF' : '#000000'} />
            </Pressable>
          </Animated.View>

          {/* Sélecteur Déroulant centré « Pour vous ⌵ » ou « Suivis ⌵ » */}
          <Animated.View style={[styles.absoluteCenter, tabsAnimatedStyle]}>
            <Pressable
              onPress={toggleDropdown}
              hitSlop={10}
              style={({ pressed }) => [styles.dropdownTrigger, pressed && styles.tabPressed]}
            >
              <View style={styles.tabTextRow}>
                <ThemedText style={[styles.tabText, { color: theme.text }]}>
                  {currentTabLabel}
                </ThemedText>
                <SymbolView
                  name={{ ios: 'chevron.down', android: 'expand_more', web: 'expand_more' }}
                  size={12}
                  tintColor={theme.text}
                  weight="bold"
                  style={[styles.chevronIcon, isDropdownOpen && styles.chevronIconOpen]}
                />
              </View>
            </Pressable>
          </Animated.View>
        </View>

        {/* ─── Côté Droit : Bouton unique Messages / Direct (Liquid Glass 53px) ─── */}
        <View style={styles.actionsRow}>
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

      {/* ─── Menu Déroulant Flottant Liquid Glass (Pop-over) ─── */}
      <Modal
        visible={isDropdownOpen}
        transparent
        animationType="none"
        onRequestClose={() => setIsDropdownOpen(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setIsDropdownOpen(false)}>
          <Animated.View
            entering={FadeIn.duration(180)}
            exiting={FadeOut.duration(140)}
            style={styles.dropdownModalAnchor}
          >
            <AdaptiveGlassView
              intensity={65}
              borderRadius={22}
              thickness={1.3}
              tintColor={isDark ? 'rgba(24, 24, 30, 0.75)' : 'rgba(255, 255, 255, 0.75)'}
              style={[
                styles.dropdownCard,
                {
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)',
                },
              ]}
            >
              {/* Option 1: Pour vous */}
              <Pressable
                onPress={() => handleSelectFeedOption('for_you')}
                style={({ pressed }) => [
                  styles.dropdownOption,
                  pressed && (isDark ? styles.optionPressedDark : styles.optionPressedLight),
                ]}
              >
                <ThemedText
                  style={[
                    styles.optionLabel,
                    {
                      color: theme.text,
                      fontWeight: activeTab === 'for_you' ? '800' : '500',
                    },
                  ]}
                >
                  {t('feed.tabs.for_you', 'Pour vous')}
                </ThemedText>
                {activeTab === 'for_you' && (
                  <SymbolView
                    name={{ ios: 'checkmark', android: 'check', web: 'check' }}
                    size={16}
                    tintColor={theme.primary}
                    weight="bold"
                  />
                )}
              </Pressable>

              {/* Ligne séparatrice feutrée */}
              <View
                style={[
                  styles.optionDivider,
                  {
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
                  },
                ]}
              />

              {/* Option 2: Suivis */}
              <Pressable
                onPress={() => handleSelectFeedOption('following')}
                style={({ pressed }) => [
                  styles.dropdownOption,
                  pressed && (isDark ? styles.optionPressedDark : styles.optionPressedLight),
                ]}
              >
                <ThemedText
                  style={[
                    styles.optionLabel,
                    {
                      color: theme.text,
                      fontWeight: activeTab === 'following' ? '800' : '500',
                    },
                  ]}
                >
                  {t('feed.tabs.following', 'Suivis')}
                </ThemedText>
                {activeTab === 'following' && (
                  <SymbolView
                    name={{ ios: 'checkmark', android: 'check', web: 'check' }}
                    size={16}
                    tintColor={theme.primary}
                    weight="bold"
                  />
                )}
              </Pressable>
            </AdaptiveGlassView>
          </Animated.View>
        </Pressable>
      </Modal>
    </>
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
  sideSpacer: {
    width: 53,
    height: 53,
  },
  centerSection: {
    flex: 1,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  absoluteCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropdownTrigger: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  tabTextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  tabText: {
    fontSize: 18,
    letterSpacing: -0.4,
    fontWeight: '800',
  },
  chevronIcon: {
    marginTop: 1,
  },
  chevronIconOpen: {
    transform: [{ rotate: '180deg' }],
  },
  tabPressed: {
    opacity: 0.7,
  },
  actionsRow: {
    width: 53,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Modal & Dropdown Popover
  modalOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  dropdownModalAnchor: {
    position: 'absolute',
    top: 108,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  dropdownCard: {
    width: 210,
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
    elevation: 12,
  },
  dropdownOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
  },
  optionLabel: {
    fontSize: 15,
    letterSpacing: -0.3,
  },
  optionDivider: {
    height: 1,
    marginHorizontal: 10,
    marginVertical: 2,
  },
  optionPressedLight: {
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
  },
  optionPressedDark: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
});
