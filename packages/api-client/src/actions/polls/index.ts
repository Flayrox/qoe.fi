'use server';

// =====================================================================
// 📊 actions/polls — Server Actions des sondages dans les pensées
// =====================================================================
// Lecture d'un sondage lié à une pensée + vote (idempotent, un vote par
// utilisateur). ⚠️ Fichier serveur — pas encore d'endpoint Go mobile.
// =====================================================================

import { revalidatePath } from 'next/cache';
import { safeAction } from '../utils/safe-action';
import { goFetch } from '../utils/go-client';

/** 🗳️ Sondage (shape Go Poll, imbriqué dans FeedPost). */
export interface PollDTO {
  id: string;
  thoughtId: string;
  expiresAt: string;
  isExpired: boolean;
  totalVotes: number;
  userVotedOptionId: string | null;
  options: Array<{
    id: string;
    text: string;
    order: number;
    voteCount: number;
    percentage: number;
  }>;
}

export const getPollAction = safeAction<{ thoughtId: string }, { poll: PollDTO }>(async (input) => {
  // Go-only : le poll est imbriqué dans le post (GET /v1/posts/{id}).
  const post = await goFetch<{ poll: PollDTO | null }>(
    `/v1/posts/${encodeURIComponent(input.thoughtId)}`
  );
  if (!post.poll) {
    throw new Error('Poll introuvable');
  }
  return { poll: post.poll };
});

export const votePollAction = safeAction<
  { thoughtId: string; optionId: string },
  { poll: PollDTO }
>(async (input) => {
  // Go-only : vote idempotent (POST /v1/posts/{thoughtId}/poll/vote).
  const updatedPoll = await goFetch<PollDTO>(
    `/v1/posts/${encodeURIComponent(input.thoughtId)}/poll/vote`,
    { method: 'POST', body: { optionId: input.optionId } }
  );
  if (updatedPoll?.thoughtId) {
    revalidatePath(`/post/${updatedPoll.thoughtId}`);
  }
  return { poll: updatedPoll };
});
