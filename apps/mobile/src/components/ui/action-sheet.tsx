// =====================================================================
// 📋 ActionSheet — Menu flottant / Bottom sheet (Pixel-Perfect Bluesky)
// =====================================================================

import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { playHaptic } from '@/lib/haptics';

export interface ActionSheetItem {
  key: string;
  label: string;
  icon?: SymbolViewProps['name'];
  /** destructive = texte et icône rouges (supprimer, déconnecter…). */
  destructive?: boolean;
  onPress: () => void;
  disabled?: boolean;
  right?: ReactNode;
}

export interface ActionSheetGroup {
  items: ActionSheetItem[];
}

export function ActionSheet({
  visible,
  title,
  groups,
  onClose,
  showCancel = false,
}: {
  visible: boolean;
  title?: string;
  groups: ActionSheetGroup[];
  onClose: () => void;
  showCancel?: boolean;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);

  // Animation values : backdrop opacity (0 -> 1) et sheet translateY (300 -> 0)
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const sheetAnim = useRef(new Animated.Value(400)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.parallel([
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(sheetAnim, {
          toValue: 0,
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(backdropAnim, {
          toValue: 0,
          duration: 180,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(sheetAnim, {
          toValue: 400,
          duration: 220,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) {
          setMounted(false);
        }
      });
    }
  }, [visible, backdropAnim, sheetAnim]);

  if (!mounted) return null;

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        {/* ─── Backdrop obscurcissant qui fade-in (et ne slide pas du bas !) ─── */}
        <Animated.View
          style={[
            styles.backdrop,
            {
              opacity: backdropAnim,
            },
          ]}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              playHaptic('Light');
              onClose();
            }}
            accessibilityLabel="Fermer"
          />
        </Animated.View>

        {/* ─── Floating Sheet façon Bluesky (coins arrondis tout autour, marge latérale & basse) ─── */}
        <Animated.View
          style={[
            styles.sheetWrapper,
            {
              paddingBottom: Math.max(insets.bottom, 16),
              transform: [{ translateY: sheetAnim }],
            },
          ]}
        >
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: theme.background,
                borderColor: theme.border,
              },
            ]}
          >
            {/* ─── Drag Handle supérieur façon Bluesky ─── */}
            <View style={styles.handleContainer}>
              <View
                style={[
                  styles.handle,
                  {
                    backgroundColor: theme.textSecondary,
                  },
                ]}
              />
            </View>

            {/* ─── Titre optionnel centré ─── */}
            {title ? (
              <ThemedText style={[styles.title, { color: theme.textSecondary }]}>
                {title}
              </ThemedText>
            ) : null}

            <ScrollView
              bounces={false}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
              style={styles.scrollView}
            >
              {groups.map((group, gi) => (
                <View
                  key={gi}
                  style={[
                    styles.groupCard,
                    {
                      backgroundColor: theme.backgroundElement,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  {group.items.map((item, ii) => (
                    <View key={item.key}>
                      {ii > 0 ? (
                        <View style={[styles.itemDivider, { backgroundColor: theme.border }]} />
                      ) : null}
                      <Pressable
                        disabled={item.disabled}
                        onPress={() => {
                          playHaptic('Light');
                          item.onPress();
                        }}
                        style={({ pressed }) => [
                          styles.item,
                          pressed && { backgroundColor: theme.backgroundSelected },
                          item.disabled && styles.disabled,
                        ]}
                      >
                        {item.icon ? (
                          <View style={styles.iconWrapper}>
                            <SymbolView
                              name={item.icon}
                              size={21}
                              tintColor={item.destructive ? theme.destructive : theme.text}
                              weight="medium"
                            />
                          </View>
                        ) : null}

                        <ThemedText
                          style={[
                            styles.label,
                            { color: item.destructive ? theme.destructive : theme.text },
                          ]}
                          numberOfLines={1}
                        >
                          {item.label}
                        </ThemedText>

                        {item.right ? <View style={styles.rightWrapper}>{item.right}</View> : null}
                      </Pressable>
                    </View>
                  ))}
                </View>
              ))}

              {showCancel ? (
                <Pressable
                  onPress={() => {
                    playHaptic('Light');
                    onClose();
                  }}
                  style={({ pressed }) => [
                    styles.cancelButton,
                    {
                      backgroundColor: pressed ? theme.backgroundSelected : 'transparent',
                    },
                  ]}
                >
                  <ThemedText style={[styles.cancelText, { color: theme.textSecondary }]}>
                    Annuler
                  </ThemedText>
                </Pressable>
              ) : null}
            </ScrollView>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.48)',
  },
  sheetWrapper: {
    width: '100%',
    maxWidth: 500,
    alignSelf: 'center',
    paddingHorizontal: 12,
  },
  sheet: {
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
    paddingBottom: 14,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 20,
    overflow: 'hidden',
  },
  handleContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    marginBottom: 4,
  },
  handle: {
    width: 38,
    height: 4.5,
    borderRadius: 3,
    opacity: 0.25,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    paddingHorizontal: Spacing.four,
    paddingBottom: 10,
    letterSpacing: -0.1,
  },
  scrollView: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: 14,
    paddingTop: 2,
    paddingBottom: 4,
    gap: 12,
  },
  groupCard: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 52,
    gap: 14,
  },
  iconWrapper: {
    width: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  rightWrapper: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
  },
  disabled: {
    opacity: 0.35,
  },
  cancelButton: {
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
