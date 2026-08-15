import { I18nProvider } from '@lingui/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useMemo, type PropsWithChildren } from 'react';
import { Platform } from 'react-native';

import { AuthProvider } from '@/features/auth/auth-provider';
import { initI18n } from '@/lib/i18n';
import { queryClient } from '@/lib/query-client';

/**
 * Providers globaux de l'app mobile.
 * Ordre : i18n (enveloppe tout) → query → auth.
 * React Query DevTools n'est monté qu'en développement (__DEV__).
 */
export function AppProviders({ children }: PropsWithChildren) {
  const i18n = useMemo(() => initI18n(), []);

  return (
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>{children}</AuthProvider>
        {/* @tanstack/react-query-devtools rend du DOM (web uniquement) —
            sur natif, utiliser le menu dev d'Expo Go (cmd+d). */}
        {Platform.OS === 'web' && __DEV__ ? <ReactQueryDevtools initialIsOpen={false} /> : null}
      </QueryClientProvider>
    </I18nProvider>
  );
}
