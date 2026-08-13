'use client';

import { useState, useEffect } from 'react';
import { useNotificationsQuery, useMarkNotificationsAsReadMutation } from '@qoe/api-client';
import { NotificationItem } from './NotificationItem';
import { createClient } from '@qoe/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { notificationKeys } from '@qoe/api-client';
import { CheckCheck, BellOff, Loader2 } from 'lucide-react';

export function NotificationList() {
  const [filter, setFilter] = useState<'all' | 'mentions' | 'replies' | 'likes'>('all');
  const queryClient = useQueryClient();

  const { data: notifications = [], isLoading } = useNotificationsQuery(filter);
  const markAsReadMutation = useMarkNotificationsAsReadMutation();

  // Écouteur Supabase Realtime pour recevoir les notifications instantanément
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('public:Notification')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'Notification',
        },
        () => {
          // Invalider les notifications et le compteur unread
          queryClient.invalidateQueries({ queryKey: notificationKeys.all });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const handleMarkAllRead = () => {
    markAsReadMutation.mutate(undefined);
  };

  const tabs: Array<{ id: 'all' | 'mentions' | 'replies' | 'likes'; label: string }> = [
    { id: 'all', label: 'Toutes' },
    { id: 'mentions', label: 'Mentions' },
    { id: 'replies', label: 'Réponses' },
    { id: 'likes', label: "J'aime" },
  ];

  return (
    <div className="w-full">
      {/* Barre d'onglets & Actions */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="flex gap-1 overflow-x-auto no-scrollbar">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${
                filter === tab.id
                  ? 'border-primary text-foreground font-semibold'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <button
          onClick={handleMarkAllRead}
          disabled={markAsReadMutation.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors shrink-0"
          title="Tout marquer comme lu"
        >
          <CheckCheck className="w-3.5 h-3.5 text-primary" />
          <span className="hidden sm:inline">Tout marquer comme lu</span>
        </button>
      </div>

      {/* État de chargement */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center p-12 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin mb-2 text-primary" />
          <p className="text-sm">Chargement de vos notifications...</p>
        </div>
      ) : notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-16 text-center text-muted-foreground">
          <div className="p-4 bg-muted/50 rounded-full mb-3">
            <BellOff className="w-8 h-8 text-muted-foreground/60" />
          </div>
          <h3 className="font-semibold text-foreground text-base mb-1">
            Aucune notification pour le moment
          </h3>
          <p className="text-sm max-w-xs text-muted-foreground">
            {filter === 'all'
              ? "Lorsque d'autres membres aimeront vos pensées, vous répondronnt ou s'abonneront, les alertes apparaîtront ici."
              : `Aucune notification de type "${filter}" trouvée.`}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {notifications.map((notif) => (
            <NotificationItem key={notif.id} notification={notif} />
          ))}
        </div>
      )}
    </div>
  );
}
