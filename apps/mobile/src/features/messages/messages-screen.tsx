// =====================================================================
// ✉️ MessagesScreen — Messagerie directe (DMs)
// =====================================================================
// Interface de messagerie privée et discussions chiffrées.
// =====================================================================

import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { t } from '@/lib/i18n';

export function MessagesScreen() {
  const theme = useTheme();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <View style={styles.header}>
          <ThemedText style={styles.title}>{t('messages.title', 'Messages')}</ThemedText>
        </View>

        <View style={styles.content}>
          <View style={[styles.iconCircle, { backgroundColor: theme.backgroundElement }]}>
            <SymbolView
              name={{
                ios: 'bubble.left.and.bubble.right.fill',
                android: 'chat',
                web: 'chat',
              }}
              size={48}
              tintColor={theme.primary}
            />
          </View>

          <ThemedText style={styles.mainHeading}>
            {t('messages.welcome_title', 'Discutez en direct sur Qoe')}
          </ThemedText>

          <ThemedText style={[styles.description, { color: theme.textSecondary }]}>
            {t(
              'messages.welcome_desc',
              'Échangez en privé avec vos auteurs favoris, créateurs et membres de votre communauté. La messagerie chiffrée arrive très bientôt !'
            )}
          </ThemedText>

          <View
            style={[
              styles.badge,
              { backgroundColor: theme.backgroundElement, borderColor: theme.border },
            ]}
          >
            <ThemedText style={[styles.badgeText, { color: theme.textSecondary }]}>
              🚀 {t('messages.in_progress_badge', 'Fonctionnalité en cours de déploiement')}
            </ThemedText>
          </View>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  header: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  mainHeading: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  description: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 320,
  },
  badge: {
    marginTop: Spacing.three,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
