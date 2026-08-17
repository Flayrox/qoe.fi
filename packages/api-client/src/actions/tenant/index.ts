'use server';

// =====================================================================
// 🏠 actions/tenant — Server Actions des sites créateurs (blogs multi-tenant)
// =====================================================================
// Actions utilisées par les pages publiques des blogs (apps/web) et le
// widget tenant : inscription newsletter, follow créateur, bookmarks,
// surlignages/annotations, « citer un passage dans le feed », et
// déblocage d'article par wallet.
// 🔗 Proxy Go partiel (follow) ; le reste passe par les dépôts Prisma.
// ⚠️ Fichier serveur — non exposé au mobile.
// =====================================================================

import { prisma } from '@qoe/db/client';
import { bookmarks, highlights, posts, wallet } from '@qoe/db';
import { safeAction } from '../utils/safe-action';
import { goFetch } from '../utils/go-client';

export const subscribeToNewsletterAction = safeAction<
  { email: string; publicationId: string },
  { success: boolean }
>(
  async ({ email, publicationId }) => {
    const cleanEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      throw new Error('Veuillez saisir une adresse email valide.');
    }

    await prisma.subscriber.upsert({
      where: {
        email_publicationId: {
          email: cleanEmail,
          publicationId,
        },
      },
      update: {
        isActive: true,
      },
      create: {
        publicationId,
        email: cleanEmail,
        isActive: true,
      },
    });

    return { success: true };
  },
  { requireAuth: false }
);

export const toggleFollowCreatorAction = safeAction<string, { followed: boolean }>(
  async (publicationId) => {
    const res = await goFetch<{ data: { following: boolean } }>(
      `/v1/users/${encodeURIComponent(publicationId)}/follow`,
      { method: 'POST' }
    );
    return { followed: res.data.following };
  }
);

export const toggleBookmarkArticleAction = safeAction<string, { bookmarked: boolean }>(
  async (articleId, user) => {
    return bookmarks.toggleBookmark(user.id, articleId);
  }
);

export const createHighlightAction = safeAction<
  { articleId: string; text: string; note?: string; isPublic?: boolean },
  Awaited<ReturnType<typeof highlights.createHighlight>>
>(async (data, user) => {
  const { articleId, text, note, isPublic = true } = data;
  return highlights.createHighlight({
    articleId,
    readerId: user.id,
    text,
    note: note || null,
    isPublic,
  });
});

export const toggleHighlightPrivacyAction = safeAction<
  { highlightId: string; isPublic: boolean },
  Awaited<ReturnType<typeof highlights.toggleHighlightPrivacy>>
>(async (data, user) => {
  return highlights.toggleHighlightPrivacy(data.highlightId, user.id, data.isPublic);
});

export const updateHighlightNoteAction = safeAction<
  { highlightId: string; note: string | null },
  Awaited<ReturnType<typeof highlights.updateHighlightNote>>
>(async (data, user) => {
  return highlights.updateHighlightNote(data.highlightId, user.id, data.note);
});

export const upvoteHighlightAction = safeAction<
  string,
  Awaited<ReturnType<typeof highlights.upvoteHighlight>>
>(async (highlightId, user) => {
  return highlights.upvoteHighlight(highlightId, user.id);
});

export const deleteHighlightAction = safeAction<string, { success: boolean }>(
  async (highlightId, user) => {
    const deleted = await highlights.deleteHighlight(highlightId, user.id);
    if (!deleted) throw new Error('UNAUTHORIZED');
    return { success: true };
  }
);

export const createAnnotationCommentAction = safeAction<
  { highlightId: string; content: string },
  Awaited<ReturnType<typeof highlights.createAnnotationComment>>
>(async (data, user) => {
  return highlights.createAnnotationComment(data.highlightId, user.id, data.content);
});

export interface QuotePassageInput {
  articleId: string;
  text: string;
  commentary?: string;
}

export type QuotePassageOutput = { post: Awaited<ReturnType<typeof posts.createThought>> };

export const quotePassageToFeedAction = safeAction<QuotePassageInput, QuotePassageOutput>(
  async (data, user) => {
    const { articleId, text, commentary } = data;
    const article = await prisma.article.findUnique({
      where: { id: articleId },
      select: {
        id: true,
        title: true,
        slug: true,
        publication: {
          select: {
            subdomain: true,
            customDomain: true,
            name: true,
          },
        },
      },
    });
    if (!article) throw new Error('ARTICLE_NOT_FOUND');

    const subdomain = article.publication?.subdomain || article.publication?.customDomain;
    const articleUrl = subdomain
      ? `https://${subdomain}.qoe.fi/article/${article.slug}`
      : `https://qoe.fi/article/${article.slug}`;

    const quoteContent = commentary
      ? `« ${text} »\n\n${commentary}\n\n${articleUrl}`
      : `« ${text} »\n\n${articleUrl}`;

    const post = await posts.createThought({
      content: quoteContent,
      authorId: user.id,
    });

    return { post };
  }
);

export const unlockArticleWithWalletAction = safeAction<
  { creatorId: string; costCents?: number },
  { success: boolean }
>(async ({ creatorId, costCents = 100 }, user) => {
  const result = await wallet.unlockArticleWithWallet(user.id, creatorId, costCents);
  if (!result.success) {
    throw new Error(result.error || 'TRANSACTION_FAILED');
  }
  return { success: true };
});

export const getCurrentUserWalletAction = safeAction<
  void,
  Awaited<ReturnType<typeof wallet.getUserWallet>>
>(async (_, user) => {
  const userWallet = await wallet.getUserWallet(user.id);
  return userWallet;
});
