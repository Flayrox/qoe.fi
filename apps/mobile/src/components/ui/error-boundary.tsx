// =====================================================================
// 🛡️ ErrorBoundary — Filet de sécurité React (port de
//    .reference/bluesky/src/view/com/util/ErrorBoundary.tsx +
//    error/ErrorScreen.tsx)
// =====================================================================
// Capture les erreurs de rendu d'un sous-arbre et affiche un écran
// d'erreur avec bouton « Réessayer » au lieu de crasher l'app.
// =====================================================================

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { SymbolView } from 'expo-symbols';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { t } from '@/lib/i18n';

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode; onRetry?: () => void }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log centralisé à brancher (Sentry…) — console pour le moment.
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <ErrorScreen
          message={this.state.error.message}
          onRetry={() => {
            this.setState({ error: null });
            this.props.onRetry?.();
          }}
        />
      );
    }
    return this.props.children;
  }
}

export function ErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  const theme = useTheme();
  return (
    <View style={styles.wrap}>
      <SymbolView
        name={{ ios: 'exclamationmark.triangle', android: 'warning', web: 'warning' }}
        size={40}
        tintColor={theme.textSecondary}
        weight="regular"
      />
      <ThemedText style={styles.title}>{t('error.title', 'Oups !')}</ThemedText>
      <ThemedText type="small" style={{ color: theme.textSecondary, textAlign: 'center' }}>
        {message || t('error.generic', 'Une erreur inattendue est survenue.')}
      </ThemedText>
      <Pressable onPress={onRetry} style={[styles.btn, { backgroundColor: theme.primary }]}>
        <ThemedText style={{ color: '#fff', fontWeight: '600' }}>
          {t('error.retry', 'Réessayer')}
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    padding: Spacing.five,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  btn: {
    marginTop: Spacing.two,
    borderRadius: 999,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
});
