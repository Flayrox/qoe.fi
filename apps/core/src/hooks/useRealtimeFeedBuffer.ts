'use client';

// =====================================================================
// 📡 useRealtimeFeedBuffer — pastille « N nouvelles pensées » du fil
// =====================================================================
// 📖 Compte les pensées publiées qui arrivent pendant que le lecteur fait
//    défiler le fil, et rafraîchit le fil quand il clique sur la pastille.
//
// ⚠️ Un payload `postgres_changes` contient **la ligne seule** : ni auteur
//    joint, ni droits calculés, ni compteurs recalculés. On ne reconstruit
//    donc AUCUNE pensée côté client (l'ancienne version fabriquait un auteur
//    « Creator » pour chaque ligne) : on compte des identifiants éligibles,
//    et le contenu réel revient du serveur au rafraîchissement.
//
// 🔒 Éligibilité vérifiable dans la ligne seule : publiée (pas de brouillon,
//    pas de programmation future), visible de tous, non supprimée, non
//    masquée par son auteur, de premier niveau. Tout le reste est ignoré :
//    une pastille qui annonce une pensée invisible est un mensonge.
// =====================================================================

import { useCallback, useEffect, useState } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { createClient } from '@qoe/supabase/client';
import { feedKeys } from '@qoe/sdk';

export type RealtimeFeedType = 'for-you' | 'following' | 'highlights';

export interface UseRealtimeFeedBufferOptions {
  enabled?: boolean;
  type?: RealtimeFeedType;
}

/** Ligne `public.Post` telle que livrée par Realtime (colonnes seules). */
export interface RealtimePostRecord {
  id?: string | null;
  visibility?: string | null;
  contentVisibility?: string | null;
  isDraft?: boolean | null;
  scheduledAt?: string | null;
  deletedAt?: string | null;
  isHiddenByAuthor?: boolean | null;
  parentId?: string | null;
  likeCount?: number | null;
  replyCount?: number | null;
  repostCount?: number | null;
}

interface FeedQueryPost {
  id?: string;
  likeCount?: number;
  replyCount?: number;
  repostCount?: number;
}

interface FeedQueryPage {
  data?: FeedQueryPost[];
}

interface FeedQueryData {
  pages?: FeedQueryPage[];
}

/** Plafond de la pastille : au-delà, le nombre n'apporte plus d'information. */
export const MAX_BUFFERED_FEED_POSTS = 50;

/**
 * Cette ligne compte-t-elle comme une nouvelle pensée du fil ?
 *
 * `postgres_changes` ne porte aucune jointure : la décision se prend sur les
 * colonnes réellement présentes. Une date de programmation illisible est
 * traitée comme « pas encore publiée » (fail-closed).
 */
export function isBufferedFeedPost(
  record: RealtimePostRecord | null | undefined,
  nowMs: number = Date.now()
): record is RealtimePostRecord & { id: string } {
  if (!record || typeof record.id !== 'string' || record.id.length === 0) return false;
  if (record.isDraft === true) return false;
  if (record.deletedAt) return false;
  if (record.isHiddenByAuthor === true) return false;
  if (record.visibility && record.visibility !== 'public') return false;
  if (record.contentVisibility && record.contentVisibility !== 'PUBLIC') return false;
  // Une réponse n'est pas une nouvelle pensée du fil : elle vit dans son fil.
  if (record.parentId) return false;
  if (record.scheduledAt) {
    const publishedAt = Date.parse(record.scheduledAt);
    if (!Number.isFinite(publishedAt) || publishedAt > nowMs) return false;
  }
  return true;
}

/**
 * Répercute les compteurs d'une ligne mise à jour (like/repost/réponse) dans
 * les pages déjà chargées. Les pages qui ne contiennent pas cet identifiant
 * sont rendues telles quelles.
 */
export function applyPostCountUpdates(queryClient: QueryClient, record: RealtimePostRecord): void {
  const id = record.id;
  if (!id) return;

  queryClient.setQueriesData({ queryKey: feedKeys.all }, (oldData: unknown) => {
    if (!oldData || typeof oldData !== 'object') return oldData;
    const data = oldData as FeedQueryData;
    if (!Array.isArray(data.pages)) return oldData;

    let touched = false;
    const pages = data.pages.map((page) => {
      if (!Array.isArray(page?.data)) return page;
      const rows = page.data.map((post) => {
        if (post?.id !== id) return post;
        touched = true;
        return {
          ...post,
          likeCount: record.likeCount ?? post.likeCount,
          replyCount: record.replyCount ?? post.replyCount,
          repostCount: record.repostCount ?? post.repostCount,
        };
      });
      return { ...page, data: rows };
    });

    // Aucune page ne contient cette pensée : on rend la donnée inchangée pour
    // ne pas réveiller inutilement les abonnés de la query.
    return touched ? { ...data, pages } : oldData;
  });
}

type FeedPostListener = (record: RealtimePostRecord, event: 'insert' | 'update') => void;

type SupabaseClient = ReturnType<typeof createClient>;
type RealtimeChannel = ReturnType<SupabaseClient['channel']>;

interface FeedChannelEntry {
  client: SupabaseClient;
  channel: RealtimeChannel;
  listeners: Set<FeedPostListener>;
}

/**
 * Un canal Realtime par type de fil, partagé par toutes les instances du hook.
 *
 * `createClient()` rend un client singleton et `client.channel(topic)` RÉUTILISE
 * le canal existant pour un même topic : un second `.on()` après `subscribe()`
 * lève « cannot add postgres_changes callbacks … after subscribe() », et le
 * `removeChannel()` du premier démontage couperait le second abonné. On
 * souscrit donc une seule fois par topic et on dispatche aux abonnés actifs ;
 * le canal est retiré quand le dernier abonné est parti.
 */
const feedChannels = new Map<RealtimeFeedType, FeedChannelEntry>();

export function subscribeToFeedChanges(
  type: RealtimeFeedType,
  listener: FeedPostListener
): () => void {
  let entry = feedChannels.get(type);

  if (!entry) {
    const client = createClient();
    const listeners = new Set<FeedPostListener>();
    const channel = client
      .channel(`realtime-feed:${type}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'Post' }, (payload) => {
        const record = payload.new as RealtimePostRecord;
        for (const active of listeners) active(record, 'insert');
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'Post' }, (payload) => {
        const record = payload.new as RealtimePostRecord;
        for (const active of listeners) active(record, 'update');
      })
      .subscribe();

    entry = { client, channel, listeners };
    feedChannels.set(type, entry);
  }

  entry.listeners.add(listener);

  return () => {
    const current = feedChannels.get(type);
    if (!current) return;
    current.listeners.delete(listener);
    if (current.listeners.size > 0) return;
    feedChannels.delete(type);
    void current.client.removeChannel(current.channel);
  };
}

export function useRealtimeFeedBuffer({
  enabled = true,
  type = 'for-you',
}: UseRealtimeFeedBufferOptions = {}) {
  const queryClient = useQueryClient();
  const [unreadIds, setUnreadIds] = useState<readonly string[]>([]);

  useEffect(() => {
    if (!enabled) return;

    return subscribeToFeedChanges(type, (record, event) => {
      if (event === 'update') {
        applyPostCountUpdates(queryClient, record);
        return;
      }
      if (!isBufferedFeedPost(record)) return;
      setUnreadIds((previous) =>
        previous.includes(record.id)
          ? previous
          : [record.id, ...previous].slice(0, MAX_BUFFERED_FEED_POSTS)
      );
    });
  }, [enabled, type, queryClient]);

  // Flush = « montre-moi ce qui est arrivé » : le contenu vient du serveur,
  // jamais de lignes reconstruites côté client.
  const flushBuffer = useCallback(() => {
    if (unreadIds.length === 0) return;
    void queryClient.invalidateQueries({ queryKey: feedKeys.timeline(type) });
    setUnreadIds([]);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [unreadIds.length, queryClient, type]);

  return { unreadCount: unreadIds.length, flushBuffer };
}
