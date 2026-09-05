// =====================================================================
// 🧪 GlassComposer — Boîte de saisie Liquid Glass morphante (réutilisable)
// =====================================================================
// Composant partagé : la coquille animée du composer de commentaire/note/
// citation (ex-ThreadReplyComposer). Deux modes :
//   - `bottom`  : barre ancrée en bas (réponse à une pensée) — suit le clavier.
//   - `floating`: positionnée à un `floatingTop` donné (popover de sélection
//     dans un article) — morphe d'une barre d'actions repliée (`collapsedSlot`)
//     vers un composer développé (chip de citation + input + envoi).
// Physique identique partout : expansion 50→120px, radius 25→18, scale
// spring, verre adaptatif, haptiques, respect de reduceMotion.
// =====================================================================

import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedKeyboard,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Feather, Ionicons } from '@expo/vector-icons';

import { AdaptiveGlassView } from '@/components/liquid-tab-bar/AdaptiveGlassView';
import { LiquidElasticButton } from '@/components/liquid-tab-bar/LiquidElasticButton';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useReduceMotion } from '@/hooks/use-user-settings';
import { playHaptic } from '@/lib/haptics';
import { t } from '@/lib/i18n';

const SPRING_PHYSICS = { damping: 20, stiffness: 240, mass: 0.5 };

export interface GlassComposerProps {
  /** Placeholder de l'input une fois développé. */
  placeholder: string;
  /**
   * Envoi : `await onSubmit(text)`. Si la promesse rejette → Alert + on
   * reste ouvert. Si elle résout → input vidé, repli, clavier fermé.
   */
  onSubmit: (text: string) => Promise<void> | void;
  /** Contenu du bouton avatar de gauche (mode bottom uniquement). */
  avatar?: React.ReactNode;
  /** Action du bouton avatar (ex: ouvrir le drawer). */
  onAvatarPress?: () => void;
  /** Label d'accessibilité du bouton avatar. */
  avatarAccessibilityLabel?: string;
  /** Aperçu (extrait cité, note…) affiché au-dessus de l'input développé. */
  quotedChip?: React.ReactNode;
  /**
   * Mode `floating` : rendu personnalisé de l'état replié (ex: barre
   * d'actions de sélection). `expand()` morphe la boîte en composer.
   */
  collapsedSlot?: (api: { expand: () => void }) => React.ReactNode;
  /**
   * false → l'overlay du slot ne réagit pas au tap (seuls les éléments du
   * slot le font, ex: chips de la barre de sélection). Défaut : true
   * (n'importe quel tap sur l'overlay développe, comportement composer).
   */
  slotExpandable?: boolean;
  position?: 'bottom' | 'floating';
  /** Démarre immédiatement développé (utile quand ouvert depuis un bouton dédié comme Citer/Annoter). */
  initialExpanded?: boolean;
  /** Top en pixels du mode floating (au-dessus de la sélection). */
  floatingTop?: number;
  /** Hauteur développée (défaut 120 — prévoir plus si quotedChip). */
  expandedHeight?: number;
}

export function GlassComposer({
  placeholder,
  onSubmit,
  avatar,
  onAvatarPress,
  avatarAccessibilityLabel,
  quotedChip,
  collapsedSlot,
  slotExpandable = true,
  position = 'bottom',
  initialExpanded = false,
  floatingTop = 0,
  expandedHeight = 120,
}: GlassComposerProps) {
  const theme = useTheme();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const reduceMotion = useReduceMotion();
  const inputRef = useRef<TextInput>(null);

  const [text, setText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Miroir React de l'état replié en mode slot (le contenu composer reste
  // monté, caché par l'overlay — réactivité ≠ shared values).
  const [slotCollapsed, setSlotCollapsed] = useState(() => Boolean(collapsedSlot));

  // Suivi du clavier (mode bottom uniquement — le floating reste en place).
  const keyboard = useAnimatedKeyboard({ isStatusBarTranslucentAndroid: true });
  const isExpanded = useSharedValue(initialExpanded ? 1 : 0);
  const boxScale = useSharedValue(1);
  const avatarScale = useSharedValue(1);

  useEffect(() => {
    if (initialExpanded) {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [initialExpanded]);

  const collapse = () => {
    if (reduceMotion) {
      isExpanded.value = 0;
      boxScale.value = 1;
    } else {
      isExpanded.value = withTiming(0, {
        duration: 200,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1.0),
      });
      boxScale.value = withSpring(1.0, SPRING_PHYSICS);
    }
    if (collapsedSlot) setSlotCollapsed(true);
  };

  const expand = () => {
    if (reduceMotion) {
      isExpanded.value = 1;
      boxScale.value = 1;
    } else {
      isExpanded.value = withTiming(1, {
        duration: 220,
        easing: Easing.bezier(0.16, 1, 0.3, 1),
      });
    }
    if (collapsedSlot) setSlotCollapsed(false);
    // Focus différé : laisser le morph se poser avant de montrer le clavier.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    });
  };

  const handleFocus = () => {
    if (reduceMotion) {
      isExpanded.value = 1;
      boxScale.value = 1;
    } else {
      isExpanded.value = withTiming(1, {
        duration: 220,
        easing: Easing.bezier(0.16, 1, 0.3, 1),
      });
      boxScale.value = withSpring(1.015, SPRING_PHYSICS, () => {
        boxScale.value = withSpring(1.0, SPRING_PHYSICS);
      });
    }
    playHaptic('Light');
  };

  const handleBlur = () => {
    if (!text.trim()) {
      collapse();
    }
  };

  const handleSubmit = async () => {
    const trimmed = text.trim();
    if (!trimmed || isSubmitting) return;

    setIsSubmitting(true);
    playHaptic('Light');

    try {
      await onSubmit(trimmed);
      setText('');
      collapse();
      Keyboard.dismiss();
      playHaptic('Success');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Une erreur est survenue';
      Alert.alert(t('common.error_title', 'Erreur'), message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const animatedOuterStyle = useAnimatedStyle(() => {
    if (position !== 'bottom') return {};
    return {
      transform: [{ translateY: -keyboard.height.value }],
    };
  });

  const animatedBoxStyle = useAnimatedStyle(() => {
    return {
      height: interpolate(isExpanded.value, [0, 1], [50, expandedHeight]),
      borderRadius: interpolate(isExpanded.value, [0, 1], [25, 18]),
      transform: [{ scale: boxScale.value }],
    };
  });

  const animatedWrapperStyle = useAnimatedStyle(() => {
    return {
      width: interpolate(isExpanded.value, [0, 1], [50, 0], Extrapolation.CLAMP),
      marginRight: interpolate(isExpanded.value, [0, 1], [8, 0], Extrapolation.CLAMP),
    };
  });

  const animatedSideButtonStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          translateX: interpolate(isExpanded.value, [0, 1], [0, -40], Extrapolation.CLAMP),
        },
        { scale: avatarScale.value },
      ],
      opacity: interpolate(isExpanded.value, [0, 0.8], [1, 0], Extrapolation.CLAMP),
    };
  });

  const animatedCollapsedMicStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(isExpanded.value, [0, 0.4], [1, 0], Extrapolation.CLAMP),
      transform: [
        {
          scale: interpolate(isExpanded.value, [0, 0.4], [1, 0.8], Extrapolation.CLAMP),
        },
      ],
    };
  });

  const animatedToolbarStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(isExpanded.value, [0.3, 1], [0, 1], Extrapolation.CLAMP),
      transform: [
        {
          translateY: interpolate(isExpanded.value, [0.3, 1], [10, 0], Extrapolation.CLAMP),
        },
      ],
    };
  });

  // Fondu du contenu composer sous l'overlay du slot (révélation au morph).
  const animatedContentStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(isExpanded.value, [0, 0.5], [0, 1], Extrapolation.CLAMP),
      transform: [
        {
          translateY: interpolate(isExpanded.value, [0, 0.5], [8, 0], Extrapolation.CLAMP),
        },
      ],
    };
  });

  const canSubmit = text.trim().length > 0 && !isSubmitting;
  const glassTint = isDark ? 'rgba(20, 20, 26, 0.45)' : 'rgba(255, 255, 255, 0.45)';
  const inputMaxHeight = quotedChip ? 44 : 60;

  return (
    <Animated.View
      style={[
        position === 'bottom' ? styles.outerContainer : styles.floatingContainer,
        position === 'floating' && { top: floatingTop },
        animatedOuterStyle,
      ]}
      pointerEvents="box-none"
    >
      <View style={styles.inputRow} pointerEvents="box-none">
        {/* Bouton Avatar latéral Liquid Glass à GAUCHE (mode bottom) */}
        {avatar ? (
          <Animated.View
            style={[styles.sideButtonWrapper, animatedWrapperStyle]}
            pointerEvents="box-none"
          >
            <Animated.View
              style={[styles.sideButton, animatedSideButtonStyle]}
              pointerEvents="box-none"
            >
              <LiquidElasticButton
                size={50}
                borderRadius={25}
                onPress={onAvatarPress ?? (() => {})}
                accessibilityLabel={avatarAccessibilityLabel}
              >
                {avatar}
              </LiquidElasticButton>
            </Animated.View>
          </Animated.View>
        ) : null}

        {/* Boîte principale Liquid Glass */}
        <Animated.View style={[styles.mainBoxWrapper, animatedBoxStyle]}>
          <AdaptiveGlassView
            style={StyleSheet.absoluteFill}
            intensity={32}
            borderRadius={25}
            refraction={true}
            thickness={1.35}
            edgeReflectionStrength={1.0}
            tilt={false}
            tintColor={glassTint}
          />

          {/* Liseré supérieur doux sur le verre */}
          <View
            style={[
              styles.softTopHighlight,
              {
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.70)',
              },
            ]}
            pointerEvents="none"
          />

          <View style={styles.mainContentContainer}>
            {collapsedSlot ? (
              /* ── Mode slot (floating) : le contenu composer reste monté, ──
                 masqué par l'overlay replié ; le morph anime la boîte. */
              <>
                <Animated.View style={[styles.composerContent, animatedContentStyle]}>
                  {quotedChip ? <View style={styles.chipContainer}>{quotedChip}</View> : null}
                  <TextInput
                    ref={inputRef}
                    value={text}
                    onChangeText={setText}
                    placeholder={placeholder}
                    placeholderTextColor={
                      isDark ? 'rgba(255, 255, 255, 0.45)' : 'rgba(0, 0, 0, 0.45)'
                    }
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    multiline
                    style={[styles.textInput, { color: theme.text, maxHeight: inputMaxHeight }]}
                  />
                  <Animated.View style={[styles.bottomToolbar, animatedToolbarStyle]}>
                    <View style={styles.leftActions}>
                      <TouchableOpacity
                        style={[
                          styles.circleButton,
                          {
                            backgroundColor: isDark
                              ? 'rgba(255, 255, 255, 0.10)'
                              : 'rgba(0, 0, 0, 0.05)',
                          },
                        ]}
                        activeOpacity={0.7}
                        onPress={() => playHaptic('Light')}
                      >
                        <Ionicons name="add" size={18} color={theme.textSecondary} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.circleButton,
                          {
                            backgroundColor: isDark
                              ? 'rgba(255, 255, 255, 0.10)'
                              : 'rgba(0, 0, 0, 0.05)',
                          },
                        ]}
                        activeOpacity={0.7}
                        onPress={() => playHaptic('Light')}
                      >
                        <Ionicons name="at" size={16} color={theme.textSecondary} />
                      </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                      style={[
                        styles.sendButton,
                        {
                          backgroundColor: canSubmit
                            ? theme.primary
                            : isDark
                              ? 'rgba(255, 255, 255, 0.10)'
                              : 'rgba(0, 0, 0, 0.05)',
                        },
                      ]}
                      disabled={!canSubmit}
                      onPress={() => void handleSubmit()}
                      activeOpacity={0.8}
                    >
                      {isSubmitting ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Ionicons
                          name="arrow-up"
                          size={18}
                          color={canSubmit ? '#FFFFFF' : theme.textSecondary}
                        />
                      )}
                    </TouchableOpacity>
                  </Animated.View>
                </Animated.View>

                {slotCollapsed ? (
                  slotExpandable ? (
                    <Pressable
                      style={styles.slotOverlay}
                      onPress={expand}
                      accessibilityLabel={t('article.selection_title', 'Actions sur le passage')}
                    >
                      {collapsedSlot({ expand })}
                    </Pressable>
                  ) : (
                    <View style={styles.slotOverlay}>{collapsedSlot({ expand })}</View>
                  )
                ) : null}
              </>
            ) : (
              <>
                {quotedChip ? <View style={styles.chipContainer}>{quotedChip}</View> : null}

                <TextInput
                  ref={inputRef}
                  value={text}
                  onChangeText={setText}
                  placeholder={placeholder}
                  placeholderTextColor={
                    isDark ? 'rgba(255, 255, 255, 0.45)' : 'rgba(0, 0, 0, 0.45)'
                  }
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                  multiline
                  style={[styles.textInput, { color: theme.text, maxHeight: inputMaxHeight }]}
                />

                {/* Icône de coin en mode replié (pas en mode slot : la barre custom la remplace) */}
                {!collapsedSlot ? (
                  <Animated.View
                    pointerEvents="none"
                    style={[styles.collapsedMicContainer, animatedCollapsedMicStyle]}
                  >
                    <View
                      style={[
                        styles.micCircle,
                        {
                          backgroundColor: isDark
                            ? 'rgba(255, 255, 255, 0.10)'
                            : 'rgba(0, 0, 0, 0.05)',
                        },
                      ]}
                    >
                      <Feather name="corner-down-left" size={16} color={theme.textSecondary} />
                    </View>
                  </Animated.View>
                ) : null}

                {/* Actions en bas de la boîte une fois ouverte */}
                <Animated.View style={[styles.bottomToolbar, animatedToolbarStyle]}>
                  <View style={styles.leftActions}>
                    <TouchableOpacity
                      style={[
                        styles.circleButton,
                        {
                          backgroundColor: isDark
                            ? 'rgba(255, 255, 255, 0.10)'
                            : 'rgba(0, 0, 0, 0.05)',
                        },
                      ]}
                      activeOpacity={0.7}
                      onPress={() => playHaptic('Light')}
                    >
                      <Ionicons name="add" size={18} color={theme.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.circleButton,
                        {
                          backgroundColor: isDark
                            ? 'rgba(255, 255, 255, 0.10)'
                            : 'rgba(0, 0, 0, 0.05)',
                        },
                      ]}
                      activeOpacity={0.7}
                      onPress={() => playHaptic('Light')}
                    >
                      <Ionicons name="at" size={16} color={theme.textSecondary} />
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.sendButton,
                      {
                        backgroundColor: canSubmit
                          ? theme.primary
                          : isDark
                            ? 'rgba(255, 255, 255, 0.10)'
                            : 'rgba(0, 0, 0, 0.05)',
                      },
                    ]}
                    disabled={!canSubmit}
                    onPress={() => void handleSubmit()}
                    activeOpacity={0.8}
                  >
                    {isSubmitting ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Ionicons
                        name="arrow-up"
                        size={18}
                        color={canSubmit ? '#FFFFFF' : theme.textSecondary}
                      />
                    )}
                  </TouchableOpacity>
                </Animated.View>
              </>
            )}
          </View>

          {/* Bordure externe 360° ultra-fine */}
          <View
            style={[
              styles.seamlessBorder,
              {
                borderColor: isDark ? 'rgba(255, 255, 255, 0.11)' : 'rgba(0, 0, 0, 0.08)',
              },
            ]}
            pointerEvents="none"
          />
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Platform.OS === 'ios' ? 34 : Spacing.three,
    backgroundColor: 'transparent',
    zIndex: 99,
  },
  floatingContainer: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    // Le conteneur floating ne doit JAMAIS s'effondrer à 0 : sur Android
    // (Fabric), un conteneur absolu sans hauteur (le wrap de
    // SelectionPopover n'en a pas — c'est son top qui le positionne) dont
    // le seul enfant est lui-même absolu n'est pas mesuré → la pill ne se
    // rend pas. minHeight force la mesure (hauteur repliée du composer).
    minHeight: 50,
    backgroundColor: 'transparent',
    zIndex: 99,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: 'transparent',
  },
  mainBoxWrapper: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 6,
  },
  mainContentContainer: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: Platform.OS === 'ios' ? 14 : 8,
    paddingBottom: 8,
    position: 'relative',
    zIndex: 2,
  },
  slotPressable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 5,
  },
  composerContent: {
    flex: 1,
  },
  chipContainer: {
    marginBottom: 6,
  },
  softTopHighlight: {
    position: 'absolute',
    top: 0,
    left: 16,
    right: 16,
    height: 1,
    borderBottomLeftRadius: 1,
    borderBottomRightRadius: 1,
    zIndex: 5,
  },
  seamlessBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 25,
    borderWidth: StyleSheet.hairlineWidth,
    zIndex: 10,
  },
  textInput: {
    fontSize: 15,
    paddingRight: 36,
    paddingTop: 0,
    paddingBottom: 0,
    minHeight: 24,
    textAlignVertical: 'top',
  },
  collapsedMicContainer: {
    position: 'absolute',
    right: 8,
    top: 9,
  },
  micCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomToolbar: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 8,
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leftActions: {
    flexDirection: 'row',
    gap: 8,
  },
  circleButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideButtonWrapper: {
    height: 50,
    overflow: 'hidden',
  },
  sideButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    position: 'relative',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 6,
  },
});
