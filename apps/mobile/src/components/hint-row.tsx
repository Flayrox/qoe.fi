// =====================================================================
// 💡 HintRow — Ligne « titre + code » (template Expo starter, non utilisé
//    par l'app actuelle — gardé pour référence).
// =====================================================================

import type { ReactNode } from 'react';
import { View, StyleSheet } from 'react-native';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Spacing } from '@/constants/theme';

type HintRowProps = {
  title?: string;
  hint?: ReactNode;
};

export function HintRow({ title = 'Try editing', hint = 'app/index.tsx' }: HintRowProps) {
  return (
    // Ligne pleine largeur : titre à gauche, extrait de code à droite.
    <View style={styles.stepRow}>
      <ThemedText type="small">{title}</ThemedText>
      {/* Pastille « code » : fond backgroundSelected, radius 8, padding 2/8. */}
      <ThemedView type="backgroundSelected" style={styles.codeSnippet}>
        <ThemedText themeColor="textSecondary">{hint}</ThemedText>
      </ThemedView>
    </View>
  );
}

const styles = StyleSheet.create({
  stepRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  codeSnippet: {
    borderRadius: Spacing.two, // 8
    paddingVertical: Spacing.half, // 2
    paddingHorizontal: Spacing.two, // 8
  },
});
