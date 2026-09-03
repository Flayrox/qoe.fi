// =====================================================================
// ✉️ MessagesScreen — Messagerie directe (DMs) : liste des conversations
// =====================================================================

import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { t } from '@/lib/i18n';
import { ConversationList } from '@/features/messages/conversation-list';

export function MessagesScreen() {
  const theme = useTheme();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <View style={styles.header}>
          <ThemedText style={styles.title}>{t('messages.title', 'Messages')}</ThemedText>
        </View>
        <View style={[styles.hint, { borderBottomColor: theme.border }]} pointerEvents="none">
          <ThemedText type="small" style={{ color: theme.textSecondary, fontSize: 11 }}>
            {t('messages.privacy_note', 'Messages privés entre vous et l’autre personne.')}
          </ThemedText>
        </View>
        <ConversationList style={styles.list} />
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
  hint: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.one,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  list: {
    flex: 1,
  },
});
