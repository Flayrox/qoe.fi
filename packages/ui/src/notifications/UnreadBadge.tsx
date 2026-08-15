'use client';

import { useUnreadNotificationCountQuery } from '@qoe/api-client';

/**
 * 🔴 Compteur non-lu (pour badge sidebar / cloche).
 */
export function useUnreadNotificationCount() {
  const { data: count = 0 } = useUnreadNotificationCountQuery();
  return count;
}
