import { QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';

import { queryClient } from '@/lib/query-client';

/**
 * Providers globaux de l'app mobile.
 * On empilera ici au fil du temps : Lingui (i18n), Sentry, etc.
 */
export function AppProviders({ children }: PropsWithChildren) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
