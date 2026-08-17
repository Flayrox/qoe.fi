'use server';

// =====================================================================
// 🖍️ actions/highlights — Server Actions des surlignages & annotations
// =====================================================================
// Surlignage de passages d'articles, notes, visibilité publique, upvotes,
// commentaires d'annotation, et « citer dans le feed » (quotePassageToFeed).
// ⚠️ Fichier serveur (dépôts Prisma @qoe/db) — non exposé au mobile pour
//    l'instant ; un endpoint Go équivalent serait nécessaire pour l'app.
// =====================================================================

import { highlights } from '@qoe/db';
import { revalidatePath } from 'next/cache';
import { safeAction } from '../utils/safe-action';

export const getArticleHighlightsAction = safeAction<
  { articleId: string },
  { highlights: Awaited<ReturnType<typeof highlights.getArticleHighlights>> }
>(async (input, user) => {
  const list = await highlights.getArticleHighlights(input.articleId, user?.id);
  return { highlights: list };
});

export const createHighlightAction = safeAction<
  {
    articleId: string;
    text: string;
    note?: string | null;
    isPublic?: boolean;
    isOfficial?: boolean;
  },
  { highlight: Awaited<ReturnType<typeof highlights.createHighlight>> }
>(async (input, user) => {
  const result = await highlights.createHighlight({
    articleId: input.articleId,
    readerId: user.id,
    text: input.text,
    note: input.note,
    isPublic: input.isPublic,
    isOfficial: input.isOfficial,
  });
  revalidatePath('/article');
  return { highlight: result };
});

export const toggleHighlightPrivacyAction = safeAction<
  { highlightId: string; isPublic: boolean },
  { highlight: Awaited<ReturnType<typeof highlights.toggleHighlightPrivacy>> }
>(async (input, user) => {
  const result = await highlights.toggleHighlightPrivacy(
    input.highlightId,
    user.id,
    input.isPublic
  );
  revalidatePath('/article');
  return { highlight: result };
});

export const upvoteHighlightAction = safeAction<
  { highlightId: string },
  { upvotesCount: number; hasUpvoted: boolean }
>(async (input, user) => {
  const result = await highlights.upvoteHighlight(input.highlightId, user.id);
  revalidatePath('/article');
  return result;
});

export const createAnnotationCommentAction = safeAction<
  { highlightId: string; content: string },
  { comment: Awaited<ReturnType<typeof highlights.createAnnotationComment>> }
>(async (input, user) => {
  const result = await highlights.createAnnotationComment(
    input.highlightId,
    user.id,
    input.content
  );
  revalidatePath('/article');
  return { comment: result };
});

export const deleteHighlightAction = safeAction<{ highlightId: string }, { success: boolean }>(
  async (input, user) => {
    await highlights.deleteHighlight(input.highlightId, user.id);
    revalidatePath('/article');
    return { success: true };
  }
);

import { quotePassageToFeedAction as quotePassageToFeedActionImpl } from '../tenant';
import type { QuotePassageInput } from '../tenant';

export async function quotePassageToFeedAction(input: QuotePassageInput) {
  return quotePassageToFeedActionImpl(input);
}
