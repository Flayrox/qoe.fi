// =====================================================================
// ⚠️ ErrorMessage — Bandeau d'erreur + retry (port de
//    .reference/bluesky/src/view/com/util/error/ErrorMessage.tsx)
// =====================================================================
// Fond destructif, message + bouton « Réessayer ».
// =====================================================================

import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { SymbolView } from 'expo-symbols';

import { Button } from '@/components/ui/button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function ErrorMessage({
  message,
  onPressTryAgain,
  style,
}: {
  message: string;
  onPressTryAgain?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.wrap, { backgroundColor: theme.destructive }, style]}>
      <SymbolView
        name={{ ios: 'exclamationmark.triangle.fill', android: 'warning', web: 'warning' }}
        size={20}
        tintColor="#ffffff"
        weight="regular"
      />
      <ThemedText style={styles.message} numberOfLines={3}>
        {message}
      </ThemedText>
      {onPressTryAgain ? (
        <Button
          label="Réessayer"
          size="small"
          color="primary"
          shape="round"
          onPress={onPressTryAgain}
        >
          <SymbolView
            name={{ ios: 'arrow.clockwise', android: 'refresh', web: 'refresh' }}
            size={16}
            tintColor={theme.destructive}
            weight="semibold"
          />
        </Button>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    margin: Spacing.three,
    borderRadius: Spacing.two,
  },
  message: {
    flex: 1,
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 19,
  },
});
