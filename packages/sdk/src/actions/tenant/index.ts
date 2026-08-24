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

import { safeAction } from '../utils/safe-action';
import { goFetch } from '../utils/go-client';
import type { HighlightDTO, AnnotationCommentDTO } from '../highlights';

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

    // Go-only : POST /v1/home/subscribe (idempotent, backend-of-record).
    await goFetch<{ success: boolean }>('/v1/home/subscribe', {
      method: 'POST',
      body: JSON.stringify({ email: cleanEmail, publicationId }),
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
  async (articleId) => {
    // Go-only : ToggleBookmark cible les articles (miroir Hono targetId).
    const res = await goFetch<{ bookmarked: boolean }>(
      `/v1/posts/${encodeURIComponent(articleId)}/bookmark`,
      { method: 'POST' }
    );
    return { bookmarked: res.bookmarked };
  }
);

export const createHighlightAction = safeAction<
  { articleId: string; text: string; note?: string; isPublic?: boolean },
  { highlight: HighlightDTO }
>(async (data) => {
  const { articleId, text, note, isPublic = true } = data;
  const highlight = await goFetch<HighlightDTO>(
    `/v1/articles/${encodeURIComponent(articleId)}/highlights`,
    { method: 'POST', body: { text, note: note || null, isPublic } }
  );
  return { highlight };
});

export const toggleHighlightPrivacyAction = safeAction<
  { highlightId: string; isPublic: boolean },
  { highlight: HighlightDTO }
>(async (data) => {
  const highlight = await goFetch<HighlightDTO>(
    `/v1/highlights/${encodeURIComponent(data.highlightId)}`,
    { method: 'PATCH', body: { isPublic: data.isPublic } }
  );
  return { highlight };
});

export const updateHighlightNoteAction = safeAction<
  { highlightId: string; note: string | null },
  { highlight: HighlightDTO }
>(async (data) => {
  const highlight = await goFetch<HighlightDTO>(
    `/v1/highlights/${encodeURIComponent(data.highlightId)}`,
    { method: 'PATCH', body: { note: data.note } }
  );
  return { highlight };
});

export const upvoteHighlightAction = safeAction<
  string,
  { upvotesCount: number; hasUpvoted: boolean }
>(async (highlightId) => {
  const res = await goFetch<{ upvoted: boolean; upvotesCount: number }>(
    `/v1/highlights/${encodeURIComponent(highlightId)}/upvote`,
    { method: 'POST' }
  );
  return { upvotesCount: res.upvotesCount ?? 0, hasUpvoted: res.upvoted ?? false };
});

export const deleteHighlightAction = safeAction<string, { success: boolean }>(
  async (highlightId) => {
    await goFetch(`/v1/highlights/${encodeURIComponent(highlightId)}`, { method: 'DELETE' });
    return { success: true };
  }
);

export const createAnnotationCommentAction = safeAction<
  { highlightId: string; content: string },
  { comment: AnnotationCommentDTO }
>(async (data) => {
  const comment = await goFetch<AnnotationCommentDTO>(
    `/v1/highlights/${encodeURIComponent(data.highlightId)}/comments`,
    { method: 'POST', body: { content: data.content } }
  );
  return { comment };
});

export interface QuotePassageInput {
  articleId: string;
  text: string;
  commentary?: string;
}

export type QuotePassageOutput = { post: Record<string, unknown> };

export const quotePassageToFeedAction = safeAction<QuotePassageInput, QuotePassageOutput>(
  async (data) => {
    const { articleId, text, commentary } = data;
    // Go-only : résolution de l'article via /v1/articles/by-id/{id}.
    const article = await goFetch<{
      id: string;
      title: string;
      slug: string;
      publication: {
        subdomain: string | null;
        customDomain: string | null;
        name: string | null;
      } | null;
    }>(`/v1/articles/by-id/${encodeURIComponent(articleId)}`);
    if (!article) throw new Error('ARTICLE_NOT_FOUND');

    const subdomain = article.publication?.subdomain || article.publication?.customDomain;
    const articleUrl = subdomain
      ? `https://${subdomain}.qoe.fi/article/${article.slug}`
      : `https://qoe.fi/article/${article.slug}`;

    const quoteContent = commentary
      ? `« ${text} »\n\n${commentary}\n\n${articleUrl}`
      : `« ${text} »\n\n${articleUrl}`;

    const post = await goFetch<Record<string, unknown>>('/v1/posts', {
      method: 'POST',
      body: {
        content: quoteContent,
        quotedArticleId: articleId,
        quotedExcerpt: text,
      },
    });

    return { post: post as QuotePassageOutput['post'] };
  }
);

export const unlockArticleWithWalletAction = safeAction<
  { creatorId: string; costCents?: number },
  { success: boolean }
>(async ({ creatorId, costCents = 100 }) => {
  // Go-only : transaction wallet atomique côté backend (POST /v1/me/wallet/unlock).
  const res = await goFetch<{ success: boolean }>('/v1/me/wallet/unlock', {
    method: 'POST',
    body: { creatorId, costCents },
  });
  if (!res.success) {
    throw new Error('TRANSACTION_FAILED');
  }
  return { success: true };
});

export interface UserWalletDTO {
  id: string;
  email: string;
  name: string | null;
  role: string;
  walletBalanceCents: number;
}

export const getCurrentUserWalletAction = safeAction<void, UserWalletDTO>(async () => {
  // Go-only : GET /v1/me/billing (wallet + historique).
  const billing = await goFetch<{
    id: string;
    email: string;
    name: string | null;
    role: string;
    walletBalanceCents: number;
  }>('/v1/me/billing');
  return {
    id: billing.id,
    email: billing.email,
    name: billing.name,
    role: billing.role,
    walletBalanceCents: billing.walletBalanceCents,
  };
});
