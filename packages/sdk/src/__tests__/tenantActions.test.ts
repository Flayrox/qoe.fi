// =====================================================================
// 📜 Contrat des server actions tenant (packages/sdk/actions/tenant)
// =====================================================================
// Ces tests verrouillent le contrat réseau des actions publiques des sites
// créateurs : chemin, méthode HTTP et FORME DU BODY.
//
// 🐛 Régression couverte : `goFetch` sérialise lui-même son `body`. Lui
// repasser une chaîne (ex. `JSON.stringify({...})`) provoquait un DOUBLE
// encodage → le backend Go recevait un string littéral → 400 « JSON invalide »
// → l'abonnement newsletter de tous les sites tenants échouait silencieusement.
// =====================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const goFetch = vi.fn();

vi.mock('../actions/utils/go-client', () => ({
  goFetch: (...args: unknown[]) => goFetch(...args),
}));

// safeAction est neutralisé : on teste le contrat de l'action, pas l'auth.
vi.mock('../actions/utils/safe-action', () => ({
  safeAction: (fn: (input: unknown, user: unknown) => unknown) => (input: unknown) =>
    fn(input, { id: 'user_contract' }),
}));

import {
  subscribeToNewsletterAction,
  toggleFollowCreatorAction,
  toggleBookmarkArticleAction,
  createHighlightAction,
  toggleHighlightPrivacyAction,
  updateHighlightNoteAction,
  upvoteHighlightAction,
  deleteHighlightAction,
  createAnnotationCommentAction,
  quotePassageToFeedAction,
  unlockArticleWithWalletAction,
  getCurrentUserWalletAction,
} from '../actions/tenant';

type Call = [path: string, init?: { method?: string; body?: unknown }];

function calls(): Call[] {
  return goFetch.mock.calls as unknown as Call[];
}

beforeEach(() => {
  goFetch.mockReset();
  goFetch.mockResolvedValue({});
});

describe('🔒 Contrat global : goFetch reçoit toujours un body NON sérialisé', () => {
  it('aucune action ne sérialise le body avant goFetch (anti double-encodage)', async () => {
    goFetch.mockResolvedValue({
      success: true,
      id: 'hl_1',
      data: { following: true },
      bookmarked: true,
    });
    await subscribeToNewsletterAction({ email: 'a@b.co', publicationId: 'pub_1' });
    await createHighlightAction({ articleId: 'art_1', text: 'passage', note: 'note' });
    await unlockArticleWithWalletAction({ creatorId: 'creator_1' });

    for (const [path, init] of calls()) {
      if (init?.body === undefined) continue;
      expect(
        typeof init.body,
        `le body de ${path} ne doit pas être une chaîne (double encodage JSON)`
      ).not.toBe('string');
    }
  });
});

describe('📮 subscribeToNewsletterAction', () => {
  it('poste un body objet vers /v1/home/subscribe, email normalisé', async () => {
    goFetch.mockResolvedValue({ success: true });

    const result = await subscribeToNewsletterAction({
      email: '  Reader@Example.COM  ',
      publicationId: 'pub_1',
    });

    expect(result).toEqual({ success: true });
    expect(goFetch).toHaveBeenCalledTimes(1);
    expect(calls()[0][0]).toBe('/v1/home/subscribe');
    expect(calls()[0][1]?.method).toBe('POST');
    expect(calls()[0][1]?.body).toEqual({
      email: 'reader@example.com',
      publicationId: 'pub_1',
    });
  });

  it('rejette un email invalide sans appeler le backend', async () => {
    await expect(
      subscribeToNewsletterAction({ email: 'pas-un-email', publicationId: 'pub_1' })
    ).rejects.toThrow(/email valide/i);
    expect(goFetch).not.toHaveBeenCalled();
  });
});

describe('💬 Interactions de lecture', () => {
  it('toggleBookmarkArticleAction → POST /v1/posts/{id}/bookmark', async () => {
    goFetch.mockResolvedValue({ bookmarked: true });
    const res = await toggleBookmarkArticleAction('art/1');
    expect(calls()[0][0]).toBe('/v1/posts/art%2F1/bookmark');
    expect(calls()[0][1]?.method).toBe('POST');
    expect(calls()[0][1]?.body).toBeUndefined();
    expect(res).toEqual({ bookmarked: true });
  });

  it('toggleFollowCreatorAction → POST /v1/users/{id}/follow, résultat mappé', async () => {
    goFetch.mockResolvedValue({ data: { following: true } });
    const res = await toggleFollowCreatorAction('pub_1');
    expect(calls()[0][0]).toBe('/v1/users/pub_1/follow');
    expect(res).toEqual({ followed: true });
  });

  it('unlockArticleWithWalletAction → body {creatorId, costCents}', async () => {
    goFetch.mockResolvedValue({ success: true });
    await unlockArticleWithWalletAction({ creatorId: 'creator_1', costCents: 250 });
    expect(calls()[0][0]).toBe('/v1/me/wallet/unlock');
    expect(calls()[0][1]?.body).toEqual({ creatorId: 'creator_1', costCents: 250 });
  });

  it('unlockArticleWithWalletAction lève si la transaction échoue', async () => {
    goFetch.mockResolvedValue({ success: false });
    await expect(unlockArticleWithWalletAction({ creatorId: 'creator_1' })).rejects.toThrow(
      'TRANSACTION_FAILED'
    );
  });

  it('getCurrentUserWalletAction → GET /v1/me/billing', async () => {
    goFetch.mockResolvedValue({
      id: 'u1',
      email: 'a@b.co',
      name: null,
      role: 'user',
      walletBalanceCents: 42,
    });
    // safeAction enveloppe le résultat dans ActionResult : on déballe ici.
    const wallet = (await getCurrentUserWalletAction(undefined as never)) as unknown as {
      walletBalanceCents: number;
    };
    expect(calls()[0][0]).toBe('/v1/me/billing');
    expect(wallet.walletBalanceCents).toBe(42);
  });
});

describe('🖍️ Surlignages & annotations', () => {
  it('createHighlightAction → POST /v1/articles/{id}/highlights', async () => {
    goFetch.mockResolvedValue({ id: 'hl_1' });
    await createHighlightAction({ articleId: 'art_1', text: 'passage' });
    expect(calls()[0][0]).toBe('/v1/articles/art_1/highlights');
    expect(calls()[0][1]?.body).toEqual({ text: 'passage', note: null, isPublic: true });
  });

  it('toggleHighlightPrivacyAction → PATCH /v1/highlights/{id}', async () => {
    goFetch.mockResolvedValue({ id: 'hl_1' });
    await toggleHighlightPrivacyAction({ highlightId: 'hl_1', isPublic: false });
    expect(calls()[0][0]).toBe('/v1/highlights/hl_1');
    expect(calls()[0][1]?.method).toBe('PATCH');
    expect(calls()[0][1]?.body).toEqual({ isPublic: false });
  });

  it('updateHighlightNoteAction → PATCH body {note}', async () => {
    goFetch.mockResolvedValue({ id: 'hl_1' });
    await updateHighlightNoteAction({ highlightId: 'hl_1', note: null });
    expect(calls()[0][1]?.body).toEqual({ note: null });
  });

  it('upvoteHighlightAction → POST /upvote, résultat normalisé', async () => {
    goFetch.mockResolvedValue({ upvoted: true, upvotesCount: 7 });
    const res = await upvoteHighlightAction('hl_1');
    expect(calls()[0][0]).toBe('/v1/highlights/hl_1/upvote');
    expect(res).toEqual({ upvotesCount: 7, hasUpvoted: true });
  });

  it('deleteHighlightAction → DELETE /v1/highlights/{id}', async () => {
    await deleteHighlightAction('hl_1');
    expect(calls()[0][0]).toBe('/v1/highlights/hl_1');
    expect(calls()[0][1]?.method).toBe('DELETE');
  });

  it('createAnnotationCommentAction → POST /v1/highlights/{id}/comments', async () => {
    goFetch.mockResolvedValue({ id: 'cmt_1' });
    await createAnnotationCommentAction({ highlightId: 'hl_1', content: 'Bravo' });
    expect(calls()[0][0]).toBe('/v1/highlights/hl_1/comments');
    expect(calls()[0][1]?.body).toEqual({ content: 'Bravo' });
  });
});

describe('🔗 quotePassageToFeedAction', () => {
  it('résout l’article (by-id) puis poste une citation avec body objet', async () => {
    goFetch
      .mockResolvedValueOnce({
        id: 'art_1',
        title: 'Titre',
        slug: 'slug-1',
        publication: { subdomain: 'media', customDomain: null, name: 'Média' },
      })
      .mockResolvedValueOnce({ id: 'post_1' });

    await quotePassageToFeedAction({ articleId: 'art_1', text: 'Passage cité' });

    expect(calls()[0][0]).toBe('/v1/articles/by-id/art_1');
    expect(calls()[1][0]).toBe('/v1/posts');
    expect(calls()[1][1]?.method).toBe('POST');
    const body = calls()[1][1]?.body as Record<string, unknown>;
    expect(typeof body).toBe('object');
    expect(body.quotedArticleId).toBe('art_1');
    expect(body.quotedExcerpt).toBe('Passage cité');
    expect(String(body.content)).toContain('https://media.qoe.fi/article/slug-1');
  });
});
