'use client';

import { useUnreadNotificationCountQuery } from '@qoe/api-client';
import { useRealtimeNotificationSync } from './useRealtimeNotificationSync';
import { cn } from '@qoe/utils';

/**
 * 🔴 Pastille de notifications non lues (sidebar / cloche).
 */
export function UnreadBadge({ className }: { className?: string }) {
  useRealtimeNotificationSync();
  const { data: count = 0 } = useUnreadNotificationCountQuery();

  if (count <= 0) return null;

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold tabular-nums',
        className
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

/**
 * 🔴 Compteur non-lu sous forme de texte (pour badge sidebar sans bulle).
 * Active aussi la synchro Realtime pour une mise à jour en direct.
 */
export function useUnreadNotificationCount() {
  useRealtimeNotificationSync();
  const { data: count = 0 } = useUnreadNotificationCountQuery();
  return count;
}
