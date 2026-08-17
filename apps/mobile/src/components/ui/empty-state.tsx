// =====================================================================
// 🫥 EmptyState — État vide centré (port de
//    .reference/bluesky/src/view/com/util/EmptyState.tsx)
// =====================================================================
// Icône (ou placeholder) + message + bouton d'action optionnel.
// =====================================================================

import type { ReactElement } from 'react';
import { StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { SymbolView, type SymbolViewProps } from 'expo-symbols';

import { Button, ButtonIcon, ButtonText } from '@/components/ui/button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function EmptyState({
  icon = { ios: 'pencil.line', android: 'edit', web: 'edit' },
  message,
  style,
  textStyle,
  button,
}: {
  icon?: SymbolViewProps['name'] | null;
  message: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  button?: { label: string; text: string; icon?: SymbolViewProps['name']; onPress: () => void };
}) {
  const theme = useTheme();

  return (
    <View style={[styles.wrap, style]}>
      <View style={[styles.iconCircle, { backgroundColor: theme.backgroundElement }]}>
        {icon ? (
          <SymbolView name={icon} size={32} tintColor={theme.textSecondary} weight="regular" />
        ) : null}
      </View>
      <ThemedText style={[styles.message, { color: theme.text }, textStyle]}>{message}</ThemedText>
      {button ? (
        <View style={styles.btn}>
          <Button label={button.label} color="secondary" size="medium" onPress={button.onPress}>
            {button.icon ? <ButtonIcon name={button.icon} /> : null}
            <ButtonText>{button.text}</ButtonText>
          </Button>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 32,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.three,
  },
  message: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '500',
    textAlign: 'center',
    maxWidth: 320,
  },
  btn: {
    marginTop: Spacing.three,
  },
});
