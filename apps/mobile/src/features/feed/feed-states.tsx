// =====================================================================
// 🗂️ feed-states — États vide / fin / erreur du feed (port de
//    .reference/bluesky/src/view/com/posts/FollowingEmptyState.tsx,
//    FollowingEndOfFeed.tsx, PostFeedErrorMessage.tsx)
// =====================================================================

import { StyleSheet, View } from 'react-native';

import { SymbolView } from 'expo-symbols';

import { EmptyState } from '@/components/ui/empty-state';
import { ErrorMessage } from '@/components/ui/error-message';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { t } from '@/lib/i18n';

/** Feed vide : invite à suivre des comptes / découvrir. */
export function FeedEmptyState({ onExplore }: { onExplore: () => void }) {
  return (
    <EmptyState
      icon={{ ios: 'magnifyingglass', android: 'search', web: 'search' }}
      message={t(
        'feed.empty',
        'Votre fil est vide ! Suivez des publications pour voir leurs pensées.'
      )}
      button={{
        label: t('feed.find', 'Trouver des comptes'),
        text: t('feed.find', 'Trouver des comptes'),
        icon: { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' },
        onPress: onExplore,
      }}
    />
  );
}

/** Fin de feed. */
export function FeedEndOfFeed() {
  const theme = useTheme();
  return (
    <View style={[styles.end, { borderTopColor: theme.border }]}>
      <SymbolView
        name={{ ios: 'checkmark.circle', android: 'check_circle', web: 'check_circle' }}
        size={28}
        tintColor={theme.textSecondary}
        weight="regular"
      />
      <ThemedText type="small" style={{ color: theme.textSecondary }}>
        {t('feed.end_long', 'Vous avez tout vu ! Suivez plus de comptes pour enrichir votre fil.')}
      </ThemedText>
    </View>
  );
}

/** Erreur de chargement du feed avec retry. */
export function FeedErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <ErrorMessage message={message} onPressTryAgain={onRetry} />;
}

const styles = StyleSheet.create({
  end: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.five,
    paddingHorizontal: Spacing.four,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
