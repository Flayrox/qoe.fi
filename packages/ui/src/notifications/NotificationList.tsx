'use client';

import { useState, useEffect, useRef } from 'react';
import {
  useNotificationsInfiniteQuery,
  useMarkNotificationsAsReadMutation,
  useUnreadNotificationCountQuery,
  type NotificationFilter,
} from '@qoe/sdk';
import { CheckCheck, BellOff, Loader2, ChevronDown } from 'lucide-react';
import { NotificationItem } from './NotificationItem';
import { useRealtimeNotificationSync } from './useRealtimeNotificationSync';
import { cn } from '@qoe/utils';
import { t } from '@lingui/core/macro';

const TABS: Array<{ id: NotificationFilter; label: () => string }> = [
  { id: 'all', label: () => t`Toutes` },
  { id: 'mentions', label: () => t`Mentions` },
  { id: 'replies', label: () => t`Réponses` },
  { id: 'likes', label: () => t`J'aime` },
  { id: 'collaborations', label: () => t`Collaborations` },
];

export function NotificationList() {
  const [filter, setFilter] = useState<NotificationFilter>('all');

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useNotificationsInfiniteQuery(filter);
  const notifications = (data?.pages ?? [])
    .flatMap((p) => p?.notifications ?? [])
    .filter((n): n is NonNullable<typeof n> => Boolean(n && n.id));
  const { data: unreadCount = 0 } = useUnreadNotificationCountQuery();
  const { mutate: markAsRead, isPending: isMarkingRead } = useMarkNotificationsAsReadMutation();
  const autoMarkedRef = useRef(false);
  const unreadCountRef = useRef(0);
  const markAsReadRef = useRef(markAsRead);
  useEffect(() => {
    markAsReadRef.current = markAsRead;
  }, [markAsRead]);

  // 🔔 Dès l'ouverture du panneau, tout marquer comme lu (une seule fois par
  // visite) pour que le badge de la sidebar disparaisse — les notifications
  // restent dans la liste.
  useEffect(() => {
    if (autoMarkedRef.current || unreadCount <= 0) return;
    autoMarkedRef.current = true;
    markAsRead(undefined);
  }, [unreadCount, markAsRead]);

  useEffect(() => {
    unreadCountRef.current = unreadCount;
  }, [unreadCount]);

  // 🔔 À la fermeture du panneau : marquer comme lu ce qui est arrivé pendant
  // la visite, pour que le badge ne réapparaisse que pour les nouvelles
  // notifications reçues après être revenu sur le fil.
  useEffect(() => {
    return () => {
      if (unreadCountRef.current > 0) {
        markAsReadRef.current(undefined);
      }
    };
  }, []);

  // 📡 Realtime : reçoit les INSERT/UPDATE de Notification en direct
  // (badge non-lu + liste) — canal filtré par recipientId.
  useRealtimeNotificationSync();

  const handleMarkAllRead = () => {
    markAsRead(undefined);
  };

  const handleMarkOneRead = (ids: string[]) => {
    markAsRead(ids);
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
              {tab.label()}
            </button>
          ))}
        </div>

        <button
          onClick={handleMarkAllRead}
          disabled={isMarkingRead}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors shrink-0 cursor-pointer"
          title={t`Tout marquer comme lu`}
        >
          <CheckCheck className="size-3.5 text-primary" strokeWidth={1.5} />
          <span className="hidden sm:inline">{t`Tout marquer comme lu`}</span>
        </button>
      </div>

      {/* État de chargement */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center p-12 text-muted-foreground">
          <Loader2 className="size-6 animate-spin mb-2 text-primary" />
          <p className="text-sm">{t`Chargement de vos notifications...`}</p>
        </div>
      ) : notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-16 text-center text-muted-foreground">
          <div className="p-4 bg-muted/50 rounded-full mb-3">
            <BellOff className="size-8 text-muted-foreground/60" strokeWidth={1.5} />
          </div>
          <h3 className="font-semibold text-foreground text-base mb-1">
            {t`Aucune notification pour le moment`}
          </h3>
          <p className="text-sm max-w-xs text-muted-foreground">
            {filter === 'all'
              ? t`Lorsque d'autres membres aimeront vos pensées, vous répondront ou s'abonneront, les alertes apparaîtront ici.`
              : t`Aucune notification de type "${filter}" trouvée.`}
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
            {t`Charger plus`}
          </button>
        </div>
      )}
    </div>
  );
}
