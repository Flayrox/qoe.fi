'use client';

import { useUnreadNotificationCountQuery } from '@qoe/api-client';

export function UnreadBadge() {
  const { data: count = 0 } = useUnreadNotificationCountQuery();

  if (count <= 0) return null;

  return (
    <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 text-xs font-bold text-primary-foreground bg-primary rounded-full shadow-sm animate-in zoom-in-50 duration-200">
      {count > 99 ? '99+' : count}
    </span>
  );
}
