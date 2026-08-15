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
 * la liste à chaque INSERT / UPDATE / DELETE.
 *
 * ⚠️ Le filtre `recipientId=eq.<uid>` est appliqué côté serveur : la table
 * doit avoir la Replication Realtime activée ET une RLS `select` sur
 * `authenticated` autorisant le lecteur à ne voir que ses propres lignes.
 */

type Listener = (payload: unknown) => void;

/**
 * Un SEUL canal partagé au niveau du module.
 *
 * `useRealtimeNotificationSync` est appelé par plusieurs composants montés
 * en parallèle (`UnreadBadge`, `useUnreadNotificationCount`, sidebar,
 * header…). `createClient()` renvoie un client singleton et
 * `client.channel(topic)` RÉUTILISE le canal existant pour un même topic :
 * appeler `.on()` une seconde fois sur un canal déjà `subscribe()` lève
 * « cannot add postgres_changes callbacks … after subscribe() ».
 *
 * On souscrit donc une seule fois (avec un garde anti-course) et on
 * dispatche chaque payload à tous les listeners actifs. On ne fait plus
 * `removeAllChannels()` au unmount : ça coupait le canal des autres
 * instances encore montées.
 */
const listeners = new Set<Listener>();

type SupabaseClient = ReturnType<typeof createClient>;
type RealtimeChannel = ReturnType<SupabaseClient['channel']>;

let channel: RealtimeChannel | null = null;
let channelUserId: string | null = null;
let channelPromise: Promise<void> | null = null;

function dispatch(payload: unknown) {
  for (const listener of listeners) {
    listener(payload);
  }
}

function ensureChannel(): Promise<void> {
  if (channel) return Promise.resolve();
  if (channelPromise) return channelPromise;

  channelPromise = (async () => {
    const client = createClient();
    const {
      data: { user },
    } = await client.auth.getUser();

    // Pas de session : on ne souscrit pas, mais on laisse la main à une
    // future instance du hook (channel reste null → nouvel essai).
    if (!user) {
      channelPromise = null;
      return;
    }

    // Un changement de session ne doit jamais laisser l'ancien utilisateur
    // écouter le canal temps réel.
    if (channel && channelUserId !== user.id) {
      await client.removeChannel(channel);
      channel = null;
      channelUserId = null;
    }
    if (channel) return;

    channel = client.channel('public:Notification').on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'Notification',
        filter: `recipientId=eq.${user.id}`,
      },
      (payload) => dispatch(payload)
    );

    channelUserId = user.id;
    channel.subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        channel = null;
        channelUserId = null;
        channelPromise = null;
        if (listeners.size > 0) {
          window.setTimeout(() => void ensureChannel(), 1000);
        }
      }
    });
  })();

  return channelPromise;
}

export function useRealtimeNotificationSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const listener: Listener = () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.unreadCount() });
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    };

    listeners.add(listener);
    void ensureChannel();

    return () => {
      listeners.delete(listener);
    };
  }, [queryClient]);
}
