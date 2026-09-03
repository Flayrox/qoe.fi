'use client';

// =====================================================================
// 💬 useConversations — Hooks React Query pour la messagerie directe (web)
// =====================================================================
// - useUnreadConversationCountQuery : badge non-lus du tab Messages
//   (poll 15 s — le temps réel Supabase Realtime est une tranche ultérieure).
// - useConversationsQuery : liste des conversations (poll 10 s).
// ⚠️ Côté mobile, la messagerie appelle l'API Go via QoeApiClient
//    (createConversation, getConversations, sendMessage…).
// =====================================================================

import { useQuery } from '@tanstack/react-query';
import { conversationKeys } from '../query-keys';
import { getConversationsAction, getUnreadConversationsCountAction } from '../actions/messages';

export function useUnreadConversationCountQuery() {
  return useQuery({
    queryKey: conversationKeys.unreadCount(),
    queryFn: async () => {
      const res = await getUnreadConversationsCountAction();
      if (res.ok) return res.data;
      return 0;
    },
    refetchInterval: 1000 * 15,
    staleTime: 1000 * 8,
  });
}

export function useConversationsQuery() {
  return useQuery({
    queryKey: conversationKeys.list(),
    queryFn: async () => {
      const res = await getConversationsAction();
      if (res.ok) return res.data;
      return [];
    },
    refetchInterval: 1000 * 10,
    staleTime: 1000 * 6,
  });
}
