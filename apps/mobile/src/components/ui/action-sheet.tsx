// =====================================================================
// 📋 ActionSheet — Menu/feuille d'actions (adapté de Bluesky Menu/Dialog)
// =====================================================================
// Modal bottom-sheet avec groupes, items (icône + label), séparateurs,
// bouton annuler. Utilisé par le menu « ⋯ » des posts, repost, etc.
// =====================================================================

import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { playHaptic } from '@/lib/haptics';

export interface ActionSheetItem {
  key: string;
  label: string;
  icon?: SymbolViewProps['name'];
  /** destructive = texte rouge (supprimer, bloquer…). */
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
}: {
  visible: boolean;
  title?: string;
  groups: ActionSheetGroup[];
  onClose: () => void;
}) {
  const theme = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fermer" />
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={[styles.sheet, { backgroundColor: theme.background }]}>
          {title ? (
            <ThemedText type="small" style={[styles.title, { color: theme.textSecondary }]}>
              {title}
            </ThemedText>
          ) : null}
          <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
            {groups.map((group, gi) => (
              <View key={gi}>
                {gi > 0 ? <View style={[styles.sep, { backgroundColor: theme.border }]} /> : null}
                {group.items.map((item) => (
                  <Pressable
                    key={item.key}
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
                      <SymbolView
                        name={item.icon}
                        size={20}
                        tintColor={item.destructive ? theme.destructive : theme.text}
                        weight="regular"
                      />
                    ) : (
                      <View style={styles.iconSpacer} />
                    )}
                    <ThemedText
                      style={[styles.label, item.destructive && { color: theme.destructive }]}
                      numberOfLines={1}
                    >
                      {item.label}
                    </ThemedText>
                    {item.right}
                  </Pressable>
                ))}
              </View>
            ))}
          </ScrollView>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [
              styles.cancel,
              { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement },
            ]}
          >
            <ThemedText style={styles.cancelText}>Annuler</ThemedText>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  safe: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: Spacing.two,
    paddingBottom: Spacing.three,
    maxHeight: '80%',
  },
  title: {
    textAlign: 'center',
    paddingVertical: Spacing.two,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: 14,
    paddingHorizontal: Spacing.three,
    borderRadius: 12,
  },
  iconSpacer: {
    width: 20,
  },
  label: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
  },
  disabled: {
    opacity: 0.4,
  },
  sep: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: Spacing.three,
  },
  cancel: {
    marginTop: Spacing.two,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
