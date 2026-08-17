'use server';

// =====================================================================
// 🚪 actions/threadgates — Restrictions de réponse aux fils
// =====================================================================
// Vérifie si l'utilisateur peut répondre à une pensée (threadgate : tout
// le monde / abonnés / mentionnés) et permet à l'auteur de masquer une
// réponse. ⚠️ Fichier serveur — le mobile a déjà un endpoint Go
//    (/v1/posts threadgate via apps/api-go/internal/modules/posts).
// =====================================================================

import { threadgates } from '@qoe/db';
import { revalidatePath } from 'next/cache';
import { safeAction } from '../utils/safe-action';

export const canUserReplyAction = safeAction<{ thoughtId: string }, threadgates.CanReplyResult>(
  async (input, user) => {
    return threadgates.canUserReplyToThought(input.thoughtId, user.id);
  }
);

export const hideReplyAction = safeAction<{ replyId: string }, { isHiddenByAuthor: boolean }>(
  async (input, user) => {
    const result = await threadgates.toggleHideReplyByAuthor(input.replyId, user.id);
    revalidatePath('/post');
    return result;
  }
);
