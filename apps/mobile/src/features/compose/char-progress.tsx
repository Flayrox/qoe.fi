// =====================================================================
// ⭕ CharProgress — Compteur de caractères (port de
//    .reference/bluesky/src/view/com/composer/char-progress/CharProgress.tsx)
// =====================================================================
// Pastille circulaire : reste de caractères, colorée en primaire, puis
// ambre à l'approche de la limite, rouge au-delà. (react-native-svg n'est
// pas installé → pastille pleine plutôt qu'anneau de progression.)
// =====================================================================

import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

const SIZE = 30;

export function CharProgress({ count, max = 280 }: { count: number; max?: number }) {
  const theme = useTheme();
  const remaining = max - count;
  const overLimit = remaining < 0;
  const nearLimit = remaining <= 20;

  const color = overLimit ? theme.destructive : nearLimit ? '#f59e0b' : theme.primary;
  const bg = overLimit
    ? 'rgba(220,38,38,0.12)'
    : nearLimit
      ? 'rgba(245,158,11,0.12)'
      : theme.backgroundElement;

  return (
    <View style={[styles.wrap, { backgroundColor: bg, borderColor: color }]}>
      <ThemedText style={[styles.count, { color }]}>{remaining}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  count: {
    fontSize: 11,
    fontWeight: '700',
  },
});
