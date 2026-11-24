// =====================================================================
// 🧩 Contexte d'article d'un commentaire (L44)
// =====================================================================
// Un commentaire entre dans un flux avec l'article qu'il commente. Si le
// mapping perdait `rootArticle`, la carte afficherait une pensée orpheline :
// le serveur l'a résolu, le client doit le transporter.
// =====================================================================

import { describe, it, expect } from 'vitest';
import { mapFeedPostToThreadThought } from '../actions/feed/mappers';

const raw = {
  id: 'c1',
  content: 'Très juste.',
  createdAt: '2026-01-02T10:00:00.000Z',
  author: { id: 'u1', name: 'Ada', username: 'ada', logoUrl: null, isCertified: false },
  rootArticleId: 'art-1',
  rootArticle: {
    id: 'art-1',
    title: 'Le sujet',
    slug: 'le-sujet',
    isPremium: false,
    author: { id: 'u2', name: 'Bob', username: 'bob', isCertified: true },
    publisher: { id: 'pub-1', name: 'Qoe', slug: 'qoe', subdomain: 'qoe', isCertified: true },
  },
};

describe('mapFeedPostToThreadThought — contexte d’article', () => {
  it('transporte l’article commenté et son id', () => {
    const mapped = mapFeedPostToThreadThought(raw as never);
    expect(mapped?.rootArticleId).toBe('art-1');
    expect(mapped?.rootArticle?.id).toBe('art-1');
    expect(mapped?.rootArticle?.title).toBe('Le sujet');
    expect(mapped?.rootArticle?.slug).toBe('le-sujet');
  });

  it('laisse le contexte nul pour une pensée ordinaire', () => {
    const mapped = mapFeedPostToThreadThought({
      ...raw,
      rootArticle: null,
      rootArticleId: null,
    } as never);
    expect(mapped?.rootArticle).toBeNull();
    expect(mapped?.rootArticleId).toBeNull();
  });
});
