'use server';

// =====================================================================
// 💬 actions/messages — Messagerie directe (web uniquement)
// =====================================================================
// 🔗 GO-ONLY : le backend Go (apps/api, module conversations) est la
//    source de vérité — ces actions sont des proxies fins via `goFetch()`.
//    Le mobile appelle directement l'API Go (QoeApiClient.createConversation,
//    getConversations, sendMessage…) — mêmes contrats (`@qoe/sdk/types`).
// =====================================================================

import { goFetch } from '../utils/go-client';
import { safeAction } from '../utils/safe-action';
import type { Conversation, DirectMessage, MessagePage } from '../../types';

/** GET /v1/conversations — conversations de l'utilisateur (tri activité). */
export const getConversationsAction = safeAction<void, Conversation[]>(async () => {
  const res = await goFetch<{ conversations: Conversation[] }>('/v1/conversations');
  return res.conversations ?? [];
});

/** GET /v1/conversations/unread-count — badge non-lus. */
export const getUnreadConversationsCountAction = safeAction<void, number>(async () => {
  const res = await goFetch<{ count: number }>('/v1/conversations/unread-count');
  return res.count ?? 0;
});

/**
 * POST /v1/conversations — crée (ou récupère) la conversation directe avec
 * un participant (déterministe : une seule conversation par paire).
 */
export const createConversationAction = safeAction<string, Conversation>(async (participantId) => {
  return goFetch<Conversation>('/v1/conversations', {
    method: 'POST',
    body: { participantId },
  });
});

/**
 * GET /v1/conversations/{id}/messages — messages ascendants. Pagination
 * arrière : `before` = createdAt du message le plus ancien de la page
 * courante (RFC3339, exclusif).
 */
export const getConversationMessagesAction = safeAction<
  { conversationId: string; before?: string },
  MessagePage
>(async ({ conversationId, before }) => {
  const query = new URLSearchParams();
  if (before) query.set('before', before);
  const qs = query.toString() ? `?${query.toString()}` : '';
  return goFetch<MessagePage>(
    `/v1/conversations/${encodeURIComponent(conversationId)}/messages${qs}`
  );
});

/** POST /v1/conversations/{id}/messages — envoie un message. */
export const sendMessageAction = safeAction<
  { conversationId: string; content: string },
  DirectMessage
>(async ({ conversationId, content }) => {
  return goFetch<DirectMessage>(
    `/v1/conversations/${encodeURIComponent(conversationId)}/messages`,
    { method: 'POST', body: { content } }
  );
});

/** POST /v1/conversations/{id}/read — marque tous les messages comme lus. */
export const markConversationReadAction = safeAction<string, { success: boolean }>(
  async (conversationId) => {
    return goFetch<{ success: boolean }>(
      `/v1/conversations/${encodeURIComponent(conversationId)}/read`,
      { method: 'POST' }
    );
  }
);
