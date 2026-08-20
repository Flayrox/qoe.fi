import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Platform,
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
import { useQueryClient } from '@tanstack/react-query';

import { AdaptiveGlassView } from '@/components/liquid-tab-bar/AdaptiveGlassView';
import { Avatar } from '@/components/thought/avatar';
import { useDrawer } from '@/components/drawer/drawer-context';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-provider';
import { useMe } from '@/hooks/use-me';
import { useTheme } from '@/hooks/use-theme';
import { apiClient } from '@/lib/api';
import { playHaptic } from '@/lib/haptics';
import { t } from '@/lib/i18n';
import { feedKeys } from '@qoe/api-client/mobile';

const SPRING_PHYSICS = { damping: 20, stiffness: 240, mass: 0.5 };

export function ThreadReplyComposer({
  postId,
  replyingTo,
  parentContent,
}: {
  /** ID de la pensée à laquelle on répond */
  postId: string;
  /** Auteur de la pensée ciblée */
  replyingTo?: string | null;
  /** Contenu de la pensée ciblée */
  parentContent?: string | null;
}) {
  const theme = useTheme();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const queryClient = useQueryClient();
  const inputRef = useRef<TextInput>(null);
  const { openDrawer } = useDrawer();

  const { session } = useAuth();
  const { data: me } = useMe();
  const user = session?.user;
  const userAvatarProps = {
    name: me?.name || (user?.user_metadata?.full_name as string) || 'Utilisateur',
    username: me?.username || (user?.user_metadata?.username as string) || 'user',
    logoUrl: me?.logoUrl || (user?.user_metadata?.avatar_url as string | undefined),
  };

  const [text, setText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Détection 120fps sur le thread UI natif de la hauteur du clavier
  const keyboard = useAnimatedKeyboard({ isStatusBarTranslucentAndroid: true });
  const isExpanded = useSharedValue(0);

  // Micro-physique d'interaction
  const boxScale = useSharedValue(1);
  const avatarScale = useSharedValue(1);

  const handleFocus = () => {
    isExpanded.value = withTiming(1, {
      duration: 220,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    });
    boxScale.value = withSpring(1.015, SPRING_PHYSICS, () => {
      boxScale.value = withSpring(1.0, SPRING_PHYSICS);
    });
    playHaptic('Light');
  };

  const handleBlur = () => {
    if (!text.trim()) {
      isExpanded.value = withTiming(0, {
        duration: 200,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1.0),
      });
      boxScale.value = withSpring(1.0, SPRING_PHYSICS);
    }
  };

  const handleSubmit = async () => {
    const trimmed = text.trim();
    if (!trimmed || isSubmitting) return;

    setIsSubmitting(true);
    playHaptic('Light');

    try {
      const res = await apiClient.createThought(trimmed, {
        parentId: postId,
      });

      if (!res.ok) {
        Alert.alert('Erreur', res.error || t('compose.error', "Impossible d'envoyer la réponse"));
        return;
      }

      setText('');
      isExpanded.value = withTiming(0, {
        duration: 200,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1.0),
      });
      Keyboard.dismiss();
      playHaptic('Success');

      // Actualisation des données
      await queryClient.invalidateQueries({ queryKey: feedKeys.all });
      await queryClient.invalidateQueries({ queryKey: feedKeys.thread(postId) });
    } catch (err: any) {
      Alert.alert('Erreur', err?.message || t('compose.error', 'Une erreur est survenue'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Suivi 100% continu de la position verticale du clavier
  const animatedOuterStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: -keyboard.height.value }],
    };
  });

  // Expansion et physique de la boîte principale
  const animatedBoxStyle = useAnimatedStyle(() => {
    return {
      height: interpolate(isExpanded.value, [0, 1], [50, 120]),
      borderRadius: interpolate(isExpanded.value, [0, 1], [25, 18]),
      transform: [{ scale: boxScale.value }],
    };
  });

  // Le wrapper du bouton avatar à gauche se rétracte en douceur
  const animatedWrapperStyle = useAnimatedStyle(() => {
    return {
      width: interpolate(isExpanded.value, [0, 1], [50, 0], Extrapolation.CLAMP),
      marginRight: interpolate(isExpanded.value, [0, 1], [8, 0], Extrapolation.CLAMP),
    };
  });

  // Glissement vers la gauche et fondu de l'avatar avec micro-scale
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

  // Réapparition/disparition progressive de l'icône de coin droite
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

  // Apparition/disparition progressive de la barre d'outils inférieure
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

  const canSubmit = text.trim().length > 0 && !isSubmitting;
  const glassTint = isDark ? 'rgba(20, 20, 26, 0.45)' : 'rgba(255, 255, 255, 0.45)';

  return (
    <Animated.View style={[styles.outerContainer, animatedOuterStyle]} pointerEvents="box-none">
      <View style={styles.inputRow} pointerEvents="box-none">
        {/* Bouton Avatar latéral Liquid Glass à GAUCHE */}
        <Animated.View
          style={[styles.sideButtonWrapper, animatedWrapperStyle]}
          pointerEvents="box-none"
        >
          <Animated.View style={[styles.sideButton, animatedSideButtonStyle]}>
            <TouchableOpacity
              style={styles.touchArea}
              activeOpacity={0.85}
              onPressIn={() => {
                avatarScale.value = withSpring(0.92, SPRING_PHYSICS);
              }}
              onPressOut={() => {
                avatarScale.value = withSpring(1.0, SPRING_PHYSICS);
              }}
              onPress={() => {
                playHaptic('Light');
                openDrawer();
              }}
            >
              {/* Fond Verre Liquide */}
              <AdaptiveGlassView
                style={StyleSheet.absoluteFill}
                intensity={35}
                borderRadius={25}
                refraction={true}
                thickness={1.4}
                edgeReflectionStrength={1.0}
                tilt={false}
                tintColor={glassTint}
              />

              {/* Liseré supérieur doux */}
              <View
                style={[
                  styles.softTopHighlightCircle,
                  {
                    backgroundColor: isDark
                      ? 'rgba(255, 255, 255, 0.20)'
                      : 'rgba(255, 255, 255, 0.75)',
                  },
                ]}
                pointerEvents="none"
              />

              {/* Avatar au premier plan */}
              <View style={styles.avatarInnerWrapper} pointerEvents="none">
                <Avatar user={userAvatarProps} sizeNumber={32} />
              </View>

              {/* Bordure externe 360° ultra-fine */}
              <View
                style={[
                  styles.seamlessCircleBorder,
                  {
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)',
                  },
                ]}
                pointerEvents="none"
              />
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>

        {/* Boîte principale Liquid Glass */}
        <Animated.View style={[styles.mainBoxWrapper, animatedBoxStyle]}>
          {/* Fond Verre Liquide */}
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
            <TextInput
              ref={inputRef}
              value={text}
              onChangeText={setText}
              placeholder={
                replyingTo
                  ? t('thread.reply_to_user', 'Répondre à @{user}…', { user: replyingTo })
                  : t('thread.write_reply', 'Écrire votre réponse…')
              }
              placeholderTextColor={isDark ? 'rgba(255, 255, 255, 0.45)' : 'rgba(0, 0, 0, 0.45)'}
              onFocus={handleFocus}
              onBlur={handleBlur}
              multiline
              style={[styles.textInput, { color: theme.text }]}
            />

            {/* Icône de coin en mode replié */}
            <Animated.View
              pointerEvents="none"
              style={[styles.collapsedMicContainer, animatedCollapsedMicStyle]}
            >
              <View
                style={[
                  styles.micCircle,
                  {
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(0, 0, 0, 0.05)',
                  },
                ]}
              >
                <Feather name="corner-down-left" size={16} color={theme.textSecondary} />
              </View>
            </Animated.View>

            {/* Actions en bas de la boîte une fois ouverte */}
            <Animated.View style={[styles.bottomToolbar, animatedToolbarStyle]}>
              <View style={styles.leftActions}>
                <TouchableOpacity
                  style={[
                    styles.circleButton,
                    {
                      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(0, 0, 0, 0.05)',
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
                      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(0, 0, 0, 0.05)',
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
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Platform.OS === 'ios' ? 24 : Spacing.two,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
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
  avatarInnerWrapper: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    zIndex: 2,
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
  softTopHighlightCircle: {
    position: 'absolute',
    top: 1,
    left: 10,
    right: 10,
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
  seamlessCircleBorder: {
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
    maxHeight: 60,
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
  touchArea: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 25,
  },
});
