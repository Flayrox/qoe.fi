'use server';

// =====================================================================
// 🚪 actions/threadgates — Restrictions de réponse aux fils
// =====================================================================
// Vérifie si l'utilisateur peut répondre à une pensée (threadgate : tout
// le monde / abonnés / mentionnés) et permet à l'auteur de masquer une
// réponse. ⚠️ Fichier serveur — le mobile a déjà un endpoint Go
//    (/v1/posts threadgate via apps/api/internal/modules/posts).
// =====================================================================

import { revalidatePath } from 'next/cache';
import { safeAction } from '../utils/safe-action';
import { goFetch } from '../utils/go-client';

export type CanReplyResult = {
  canReply: boolean;
  reason?: string;
  restriction: string;
};

export const canUserReplyAction = safeAction<{ thoughtId: string }, CanReplyResult>(
  async (input) => {
    // Go-only : threadgate vérifié côté backend (GET /v1/posts/{id}/can-reply).
    return goFetch<CanReplyResult>(`/v1/posts/${encodeURIComponent(input.thoughtId)}/can-reply`);
  }
);

export const hideReplyAction = safeAction<{ replyId: string }, { isHiddenByAuthor: boolean }>(
  async (input) => {
    // Go-only : seul l'auteur de la pensée parente peut masquer (403 sinon).
    const result = await goFetch<{ isHiddenByAuthor: boolean }>(
      `/v1/posts/${encodeURIComponent(input.replyId)}/hide`,
      { method: 'POST' }
    );
    revalidatePath('/post');
    return result;
  }
);
