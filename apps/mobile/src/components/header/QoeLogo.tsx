import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

export function QoeLogo({ size = 26 }: { size?: number }) {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      <ThemedText style={[styles.brand, { fontSize: size, color: theme.text }]}>
        qoe<ThemedText style={[styles.dot, { fontSize: size, color: theme.primary }]}>.</ThemedText>
        fi
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: {
    fontWeight: '800',
    letterSpacing: -0.9,
    fontFamily: 'System',
  },
  dot: {
    fontWeight: '900',
  },
});
