'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@qoe/supabase/client';
import { notificationKeys } from '@qoe/api-client';

/**
 * 📡 Synchronisation temps réel des notifications (badge + liste).
 *
 * Ouvre un canal Supabase Realtime sur `public:Notification` filtré par
 * `recipientId` et invalide les queries react-query du badge non-lu et de
 * la liste à chaque INSERT. Fonctionne aussi pour les mises à jour (isRead)
 * via UPDATE.
 *
 * ⚠️ Le filtre `recipientId=eq.<uid>` est appliqué côté serveur : la table
 * doit avoir la Replication Realtime activée ET une RLS `select` sur
 * `authenticated` autorisant le lecteur à ne voir que ses propres lignes.
 */
export function useRealtimeNotificationSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let supabase: ReturnType<typeof createClient> | null = null;
    let cancelled = false;

    async function subscribe() {
      const client = createClient();
      supabase = client;
      const {
        data: { user },
      } = await client.auth.getUser();

      if (cancelled || !user) return;

      client
        .channel('public:Notification')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'Notification',
            filter: `recipientId=eq.${user.id}`,
          },
          () => {
            queryClient.invalidateQueries({ queryKey: notificationKeys.unreadCount() });
            queryClient.invalidateQueries({ queryKey: notificationKeys.all });
          }
        )
        .subscribe();
    }

    subscribe();

    return () => {
      cancelled = true;
      if (supabase) {
        supabase.removeAllChannels();
      }
    };
  }, [queryClient]);
}
