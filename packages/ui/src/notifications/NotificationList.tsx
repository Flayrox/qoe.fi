'use client';

import { useState } from 'react';
import {
  useNotificationsInfiniteQuery,
  useMarkNotificationsAsReadMutation,
  type NotificationFilter,
} from '@qoe/api-client';
import { CheckCheck, BellOff, Loader2, ChevronDown } from 'lucide-react';
import { NotificationItem } from './NotificationItem';
import { useRealtimeNotificationSync } from './useRealtimeNotificationSync';
import { cn } from '@qoe/utils';

const TABS: Array<{ id: NotificationFilter; label: string }> = [
  { id: 'all', label: 'Toutes' },
  { id: 'mentions', label: 'Mentions' },
  { id: 'replies', label: 'Réponses' },
  { id: 'likes', label: "J'aime" },
  { id: 'collaborations', label: 'Collaborations' },
];

export function NotificationList() {
  const [filter, setFilter] = useState<NotificationFilter>('all');

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useNotificationsInfiniteQuery(filter);
  const notifications = (data?.pages ?? []).flatMap((p) => p.notifications);
  const markAsReadMutation = useMarkNotificationsAsReadMutation();

  // 📡 Realtime : reçoit les INSERT/UPDATE de Notification en direct
  // (badge non-lu + liste) — canal filtré par recipientId.
  useRealtimeNotificationSync();

  const handleMarkAllRead = () => {
    markAsReadMutation.mutate(undefined);
  };

  const handleMarkOneRead = (ids: string[]) => {
    markAsReadMutation.mutate(ids);
  };

  return (
    <div className="w-full">
      {/* Barre d'onglets & Actions */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="flex gap-1 overflow-x-auto no-scrollbar">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={cn(
                'px-4 py-3 text-sm font-medium transition-colors border-b-2 whitespace-nowrap',
                filter === tab.id
                  ? 'border-primary text-foreground font-semibold'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <button
          onClick={handleMarkAllRead}
          disabled={markAsReadMutation.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors shrink-0 cursor-pointer"
          title="Tout marquer comme lu"
        >
          <CheckCheck className="size-3.5 text-primary" strokeWidth={1.5} />
          <span className="hidden sm:inline">Tout marquer comme lu</span>
        </button>
      </div>

      {/* État de chargement */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center p-12 text-muted-foreground">
          <Loader2 className="size-6 animate-spin mb-2 text-primary" />
          <p className="text-sm">Chargement de vos notifications...</p>
        </div>
      ) : notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-16 text-center text-muted-foreground">
          <div className="p-4 bg-muted/50 rounded-full mb-3">
            <BellOff className="size-8 text-muted-foreground/60" strokeWidth={1.5} />
          </div>
          <h3 className="font-semibold text-foreground text-base mb-1">
            Aucune notification pour le moment
          </h3>
          <p className="text-sm max-w-xs text-muted-foreground">
            {filter === 'all'
              ? "Lorsque d'autres membres aimeront vos pensées, vous répondront ou s'abonneront, les alertes apparaîtront ici."
              : `Aucune notification de type "${filter}" trouvée.`}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {notifications.map((notif) => (
            <NotificationItem key={notif.id} notification={notif} onMarkRead={handleMarkOneRead} />
          ))}
        </div>
      )}

      {/* Charger plus (pagination) */}
      {hasNextPage && (
        <div className="flex justify-center py-4">
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors cursor-pointer disabled:opacity-60"
          >
            {isFetchingNextPage ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <ChevronDown className="size-3.5" strokeWidth={1.5} />
            )}
            Charger plus
          </button>
        </div>
      )}
    </div>
  );
}
