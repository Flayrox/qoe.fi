// =====================================================================
// 📎 getPostThreadAction — le permalien garde la citation
// =====================================================================
// 🐛 Régression couverte : le mapping du thread (GET /v1/posts/{id}/thread)
//    ignorait `quotedArticle`, `quotedAnnotation` et `quotedExcerpt`. Une
//    annotation citée s'ouvrait donc sur une carte vide sur son permalien
//    (« Annotation de … » absente, note absente), alors que le feed
//    chronologique l'affichait (mapping vector-feed).
//
//    Le test part de la charge Go réelle et vérifie la forme attendue par
//    ThoughtCard / QuotedArticleCard, type d'identité compris (un média
//    garde son carré arrondi).
// =====================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WebThreadPost } from '../actions/feed/mappers';

const goFetch = vi.fn();

vi.mock('../actions/utils/go-client', () => ({
  goFetch: (...args: unknown[]) => goFetch(...args),
}));

// safeAction est neutralisé : on teste le mapping, pas l'auth.
vi.mock('../actions/utils/safe-action', () => ({
  safeAction:
    (fn: (input: unknown, user: unknown) => Promise<unknown>) => async (input: unknown) => ({
      ok: true,
      data: await fn(input, { id: 'user_viewer' }),
    }),
}));

import { getPostThreadAction } from '../actions/feed';

beforeEach(() => {
  goFetch.mockReset();
});

function createQuoteFixtures(suffix: string) {
  return {
    quotedExcerpt: `Un billet, une auberge, un carnet (${suffix})`,
    quotedAnnotation: {
      id: `hl_citation_${suffix}`,
      note: `Le carnet compte autant que l'itinéraire (${suffix}).`,
      excerpt: `Un billet, une auberge, un carnet (${suffix})`,
      quoteOrdinal: 2,
      canonicalStart: 12,
      canonicalEnd: 44,
      contentSha: `sha_citation_${suffix}`,
      reader: {
        id: `user_camille_${suffix}`,
        name: `Camille Roux (${suffix})`,
        username: `camilleroux_${suffix}`,
        logoUrl: `/avatars/media-camille-${suffix}.svg`,
        type: 'MEDIA',
      },
    },
    quotedArticle: {
      id: `art_voyage_${suffix}`,
      title: `Organiser son premier voyage solo, sans stresser (${suffix})`,
      slug: `organiser-son-premier-voyage-solo-${suffix}`,
      isPremium: false,
      quoteContext: null,
      publication: {
        name: `Le Média Clair (${suffix})`,
        slug: `media-clair-${suffix}`,
        subdomain: `media-clair-${suffix}`,
        customDomain: null,
        type: 'MEDIA',
        logoUrl: `/avatars/media-clair-${suffix}.svg`,
        isCertified: true,
      },
      author: {
        id: `user_camille_${suffix}`,
        name: `Camille Roux (${suffix})`,
        username: `camilleroux_${suffix}`,
        logoUrl: null,
        isCertified: true,
        type: 'MEDIA',
      },
    },
  };
}

function makePostNode(id: string, suffix: string, overrides: Record<string, unknown> = {}) {
  const quote = createQuoteFixtures(suffix);
  return {
    id,
    content: `Contenu de ${id}`,
    authorId: `author_${suffix}`,
    createdAt: '2026-10-31T05:39:44Z',
    tags: [],
    imageUrl: null,
    author: {
      id: `author_${suffix}`,
      name: `Auteur ${suffix}`,
      username: `author_${suffix}`,
      logoUrl: null,
      isCertified: true,
    },
    parent: null,
    repost: null,
    attachments: null,
    poll: null,
    likes: [],
    reposts: [],
    _count: { likes: 0, replies: 0, reposts: 0 },
    liked: false,
    reposted: false,
    replies: null,
    ...quote,
    ...overrides,
  };
}

function assertCitationOnPost(post: WebThreadPost | null | undefined, suffix: string) {
  expect(post).toBeDefined();
  expect(post).not.toBeNull();
  expect(post?.quotedExcerpt).toBe(`Un billet, une auberge, un carnet (${suffix})`);

  expect(post?.annotationQuote).toMatchObject({
    id: `hl_citation_${suffix}`,
    note: `Le carnet compte autant que l'itinéraire (${suffix}).`,
    excerpt: `Un billet, une auberge, un carnet (${suffix})`,
    quoteOrdinal: 2,
    canonicalStart: 12,
    canonicalEnd: 44,
    contentSha: `sha_citation_${suffix}`,
  });
  expect(post?.annotationQuote?.reader).toMatchObject({
    id: `user_camille_${suffix}`,
    name: `Camille Roux (${suffix})`,
    username: `camilleroux_${suffix}`,
    logoUrl: `/avatars/media-camille-${suffix}.svg`,
    type: 'MEDIA',
  });

  expect(post?.articleQuote).toMatchObject({
    id: `art_voyage_${suffix}`,
    title: `Organiser son premier voyage solo, sans stresser (${suffix})`,
    slug: `organiser-son-premier-voyage-solo-${suffix}`,
    isPremium: false,
  });
  expect(post?.articleQuote?.author).toMatchObject({
    name: `Camille Roux (${suffix})`,
    username: `camilleroux_${suffix}`,
    subdomain: `media-clair-${suffix}`,
    logoUrl: `/avatars/media-clair-${suffix}.svg`,
    type: 'MEDIA',
  });
}

const goThread = {
  id: 'post_citation',
  content: '',
  authorId: 'user_reader',
  createdAt: '2026-10-31T05:39:44Z',
  tags: [],
  imageUrl: null,
  author: {
    id: 'user_reader',
    name: 'Admin Sanctuaire',
    username: 'admin',
    logoUrl: null,
    isCertified: true,
  },
  parent: null,
  repost: null,
  attachments: null,
  poll: null,
  likes: [],
  reposts: [],
  _count: { likes: 0, replies: 0, reposts: 0 },
  liked: false,
  reposted: false,
  replies: null,
  quotedExcerpt: 'Un billet, une auberge, un carnet',
  quotedAnnotation: {
    id: 'hl_citation',
    note: "Le carnet compte autant que l'itinéraire.",
    excerpt: 'Un billet, une auberge, un carnet',
    quoteOrdinal: 2,
    canonicalStart: 12,
    canonicalEnd: 44,
    contentSha: 'sha_citation',
    reader: {
      id: 'user_camille',
      name: 'Camille Roux',
      username: 'camilleroux',
      logoUrl: '/avatars/media-camille.svg',
      type: 'MEDIA',
    },
  },
  quotedArticle: {
    id: 'art_voyage',
    title: 'Organiser son premier voyage solo, sans stresser',
    slug: 'organiser-son-premier-voyage-solo',
    isPremium: false,
    quoteContext: null,
    publication: {
      name: 'Le Média Clair',
      slug: 'media-clair',
      subdomain: 'media-clair',
      customDomain: null,
      type: 'MEDIA',
      logoUrl: '/avatars/media-clair.svg',
      isCertified: true,
    },
    author: {
      id: 'user_camille',
      name: 'Camille Roux',
      username: 'camilleroux',
      logoUrl: null,
      isCertified: true,
      type: 'MEDIA',
    },
  },
};

describe('getPostThreadAction — citations', () => {
  it('conserve l’annotation citée et l’article qui la porte sur la racine', async () => {
    goFetch.mockResolvedValue({ post: goThread });

    const res = await getPostThreadAction('post_citation');
    if (!res.ok) throw new Error('Expected ok');
    const { post } = res.data;

    expect(post.annotationQuote).toMatchObject({
      id: 'hl_citation',
      note: "Le carnet compte autant que l'itinéraire.",
      excerpt: 'Un billet, une auberge, un carnet',
      quoteOrdinal: 2,
      canonicalStart: 12,
      canonicalEnd: 44,
      contentSha: 'sha_citation',
    });
    expect(post.annotationQuote?.reader).toMatchObject({
      id: 'user_camille',
      name: 'Camille Roux',
      username: 'camilleroux',
      logoUrl: '/avatars/media-camille.svg',
      type: 'MEDIA',
    });

    expect(post.articleQuote).toMatchObject({
      id: 'art_voyage',
      title: 'Organiser son premier voyage solo, sans stresser',
      slug: 'organiser-son-premier-voyage-solo',
      isPremium: false,
    });
    expect(post.articleQuote?.author).toMatchObject({
      name: 'Camille Roux',
      username: 'camilleroux',
      subdomain: 'media-clair',
      logoUrl: '/avatars/media-clair.svg',
      type: 'MEDIA',
    });
    expect(post.quotedExcerpt).toBe('Un billet, une auberge, un carnet');
  });

  it('conserve les citations et l’identité média sur toute l’arborescence (racine, parent, repost, réponses imbriquées)', async () => {
    const ancestor = makePostNode('post_ancestor', 'ancestor');
    const repost = makePostNode('post_repost', 'repost');
    const directReply = makePostNode('reply_direct', 'reply_direct', { parentId: 'post_root' });
    const nestedReply = makePostNode('reply_nested', 'reply_nested', { parentId: 'reply_direct' });

    const rootPost = makePostNode('post_root', 'root', {
      parent: ancestor,
      repost: repost,
      replies: [directReply, nestedReply],
    });

    goFetch.mockResolvedValue({ post: rootPost });

    const res = await getPostThreadAction('post_root');
    if (!res.ok) throw new Error('Expected ok');
    const { post } = res.data;

    // 1. Root post
    assertCitationOnPost(post, 'root');
    expect(post.annotationQuote?.reader.type).toBe('MEDIA');

    // 2. post.parent (ancestor)
    assertCitationOnPost(post.parent, 'ancestor');
    expect(post.parent?.annotationQuote?.reader.type).toBe('MEDIA');

    // 3. post.repost
    assertCitationOnPost(post.repost, 'repost');
    expect(post.repost?.annotationQuote?.reader.type).toBe('MEDIA');

    // 4. post.replies[0] (direct reply)
    expect(post.replies).toHaveLength(1);
    const directReplyNode = post.replies[0];
    assertCitationOnPost(directReplyNode, 'reply_direct');
    expect(directReplyNode?.annotationQuote?.reader.type).toBe('MEDIA');

    // 5. post.replies[0].replies[0] (nested reply)
    expect(directReplyNode?.replies).toHaveLength(1);
    const nestedReplyNode = directReplyNode?.replies[0];
    assertCitationOnPost(nestedReplyNode, 'reply_nested');
    expect(nestedReplyNode?.annotationQuote?.reader.type).toBe('MEDIA');
  });

  it('conserve la chaîne de citations et la nature du compte à chaque maillon', async () => {
    const deepest = makePostNode('post_deepest', 'deepest');
    const middle = makePostNode('post_middle', 'middle', {
      repost: deepest,
      author: {
        id: 'author_middle',
        name: 'Le Journal Éco',
        username: 'journaleco',
        logoUrl: null,
        isCertified: true,
        type: 'MEDIA',
      },
    });
    const outer = makePostNode('post_outer', 'outer', { repost: middle });

    goFetch.mockResolvedValue({ post: outer });

    const res = await getPostThreadAction('post_outer');
    if (!res.ok) throw new Error('Expected ok');
    const { post } = res.data;

    // Le maillon intermédiaire garde son identité média — sinon son avatar
    // redevient un cercle dès qu'il traverse un fil.
    expect(post.repost?.author.type).toBe('MEDIA');
    expect(post.repost?.repost?.id).toBe('post_deepest');
    expect(post.repost?.repost?.annotationQuote?.reader.type).toBe('MEDIA');
  });

  it('laisse les citations nulles sur une pensée ordinaire', async () => {
    goFetch.mockResolvedValue({
      post: {
        ...goThread,
        quotedExcerpt: undefined,
        quotedAnnotation: undefined,
        quotedArticle: undefined,
      },
    });

    const res = await getPostThreadAction('post_citation');
    if (!res.ok) throw new Error('Expected ok');
    const { post } = res.data;

    expect(post.annotationQuote).toBeNull();
    expect(post.articleQuote).toBeNull();
    expect(post.quotedExcerpt).toBeNull();
  });
});
