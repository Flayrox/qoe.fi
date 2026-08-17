// =====================================================================
// 🙈 ContentHider — Masque le contenu sensible/masqué (port de
//    .reference/bluesky/src/components/moderation/ContentHider.tsx)
// =====================================================================
// Si un post est masqué par l'auteur (`isHiddenByAuthor`), on affiche un
// bandeau flouté avec un bouton « Afficher » au lieu du contenu.
// =====================================================================

import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { SymbolView } from 'expo-symbols';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { t } from '@/lib/i18n';

export function ContentHider({
  hidden,
  reason,
  children,
}: {
  hidden: boolean;
  reason?: string;
  children: ReactNode;
}) {
  const theme = useTheme();
  const [revealed, setRevealed] = useState(false);

  if (!hidden || revealed) {
    return <>{children}</>;
  }

  return (
    <View style={[styles.wrap, { borderColor: theme.border }]}>
      <View style={styles.iconRow}>
        <SymbolView
          name={{ ios: 'eye.slash', android: 'visibility_off', web: 'visibility_off' }}
          size={18}
          tintColor={theme.textSecondary}
          weight="regular"
        />
        <ThemedText type="small" style={{ color: theme.textSecondary }}>
          {reason ?? t('post.hidden_reason', 'Contenu masqué par l’auteur')}
        </ThemedText>
      </View>
      <Pressable onPress={() => setRevealed(true)} hitSlop={8}>
        <ThemedText type="small" style={{ color: theme.primary, fontWeight: '600' }}>
          {t('post.reveal', 'Afficher')}
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 8,
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
});
