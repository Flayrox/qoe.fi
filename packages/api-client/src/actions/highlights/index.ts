'use server';

// =====================================================================
// 🖍️ actions/highlights — Server Actions des surlignages & annotations
// =====================================================================
// Surlignage de passages d'articles, notes, visibilité publique, upvotes,
// commentaires d'annotation, et « citer dans le feed » (quotePassageToFeed).
// 🔗 Go-only : tous les endpoints highlights sont servis par l'API Go
//    (apps/api/internal/modules/highlights).
// =====================================================================

import { revalidatePath } from 'next/cache';
import { safeAction } from '../utils/safe-action';
import { goFetch } from '../utils/go-client';

/** 🖍️ Surlignage (shape Go /v1/articles/{id}/highlights). */
export interface HighlightDTO {
  id: string;
  text: string;
  note: string | null;
  isPublic: boolean;
  isOfficial: boolean;
  upvotesCount: number;
  readerId: string;
  articleId: string;
  createdAt: string;
  reader: { id: string; name: string | null; username: string | null; logoUrl: string | null };
  viewerUpvoted: boolean;
  commentsCount: number;
}

export interface AnnotationCommentDTO {
  id: string;
  content: string;
  createdAt: string;
  highlightId: string;
  author: { id: string; name: string | null; username: string | null; logoUrl: string | null };
}

export const getArticleHighlightsAction = safeAction<
  { articleId: string },
  { highlights: HighlightDTO[] }
>(async (input) => {
  // Go-only : auth optionnelle côté Go (public + siens).
  const list = await goFetch<HighlightDTO[]>(
    `/v1/articles/${encodeURIComponent(input.articleId)}/highlights`
  );
  return { highlights: list ?? [] };
});

export const createHighlightAction = safeAction<
  {
    articleId: string;
    text: string;
    note?: string | null;
    isPublic?: boolean;
    isOfficial?: boolean;
  },
  { highlight: HighlightDTO }
>(async (input) => {
  const result = await goFetch<HighlightDTO>(
    `/v1/articles/${encodeURIComponent(input.articleId)}/highlights`,
    {
      method: 'POST',
      body: {
        text: input.text,
        note: input.note ?? null,
        isPublic: input.isPublic ?? true,
      },
    }
  );
  revalidatePath('/article');
  return { highlight: result };
});

export const toggleHighlightPrivacyAction = safeAction<
  { highlightId: string; isPublic: boolean },
  { highlight: HighlightDTO }
>(async (input) => {
  const result = await goFetch<HighlightDTO>(
    `/v1/highlights/${encodeURIComponent(input.highlightId)}`,
    { method: 'PATCH', body: { isPublic: input.isPublic } }
  );
  revalidatePath('/article');
  return { highlight: result };
});

export const updateHighlightNoteAction = safeAction<
  { highlightId: string; note: string | null },
  { highlight: HighlightDTO }
>(async (input) => {
  const result = await goFetch<HighlightDTO>(
    `/v1/highlights/${encodeURIComponent(input.highlightId)}`,
    { method: 'PATCH', body: { note: input.note } }
  );
  revalidatePath('/article');
  return { highlight: result };
});

export const upvoteHighlightAction = safeAction<
  { highlightId: string },
  { upvotesCount: number; hasUpvoted: boolean }
>(async (input) => {
  const res = await goFetch<{ upvoted: boolean; upvotesCount: number }>(
    `/v1/highlights/${encodeURIComponent(input.highlightId)}/upvote`,
    { method: 'POST' }
  );
  revalidatePath('/article');
  return { upvotesCount: res.upvotesCount ?? 0, hasUpvoted: res.upvoted ?? false };
});

export const createAnnotationCommentAction = safeAction<
  { highlightId: string; content: string },
  { comment: AnnotationCommentDTO }
>(async (input) => {
  const result = await goFetch<AnnotationCommentDTO>(
    `/v1/highlights/${encodeURIComponent(input.highlightId)}/comments`,
    { method: 'POST', body: { content: input.content } }
  );
  revalidatePath('/article');
  return { comment: result };
});

export const deleteHighlightAction = safeAction<{ highlightId: string }, { success: boolean }>(
  async (input) => {
    await goFetch(`/v1/highlights/${encodeURIComponent(input.highlightId)}`, {
      method: 'DELETE',
    });
    revalidatePath('/article');
    return { success: true };
  }
);

import { quotePassageToFeedAction as quotePassageToFeedActionImpl } from '../tenant';
import type { QuotePassageInput } from '../tenant';

export async function quotePassageToFeedAction(input: QuotePassageInput) {
  return quotePassageToFeedActionImpl(input);
}
