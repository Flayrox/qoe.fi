import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import type { FeedSlice, FeedPoll, FeedPost } from './feed-types';
import {
  mapPublicationToAuthor,
  mapQuotedArticle,
  mapPostToFeedItem,
  mapArticleToFeedItem,
  mapSliceToFeedItem,
  buildVectorFeedPage,
  type FeedPostRecord,
  type ArticleWithDetails,
} from './vector-feed';

vi.mock('@qoe/sdk/actions/utils/go-client', () => ({
  goFetch: vi.fn(),
}));

const goFetchMock = vi.mocked(goFetch);

// ── Fixtures ────────────────────────────────────────────────────────────────

const baseAuthor = {
  id: 'u1',
  name: 'Alice',
  username: 'alice',
  logoUrl: 'alice.png',
  isCertified: true,
};

const basePublication = {
  id: 'pub1',
  type: 'MEDIA' as const,
  name: 'La Gazette',
  slug: 'la-gazette',
  subdomain: 'gazette',
  customDomain: null,
  logoUrl: 'gazette.png',
  heroText: 'Toute l’actu',
  isCertified: true,
};

function post(overrides: Partial<FeedPostRecord> = {}): FeedPostRecord {
  return {
    id: 'post_1',
    content: 'Salut le monde',
    imageUrl: null,
    createdAt: new Date('2026-08-01T10:00:00Z'),
    author: { ...baseAuthor },
    parent: null,
    repost: null,
    quotedExcerpt: null,
    quotedArticle: null,
    likes: [],
    reposts: [],
    _count: { likes: 0, replies: 0, reposts: 0 },
    poll: null,
    ...overrides,
  };
}

function article(overrides: Partial<ArticleWithDetails> = {}): ArticleWithDetails {
  return {
    id: 'art1',
    title: 'Titre',
    slug: 'titre',
    content: 'Contenu',
    imageUrl: 'img.png',
    published: true,
    isPremium: false,
    visibility: 'PUBLIC',
    readingTime: 4,
    status: 'PUBLISHED',
    completionRate: 0.5,
    semanticTags: ['foot', 'liga'],
    allowPublicAnnotations: true,
    allowComments: true,
    scheduledAt: null,
    publicationId: 'pub1',
    authorId: 'u1',
    categoryId: 'c1',
    tierId: null,
    seoTitle: null,
    seoDescription: null,
    createdAt: '2026-08-01T10:00:00Z',
    updatedAt: '2026-08-01T10:00:00Z',
    author: { ...baseAuthor },
    publication: { ...basePublication },
    coAuthors: [],
    attributions: [],
    category: { name: 'Sport' },
    ...overrides,
  };
}

// FeedSlice attend des FeedPost (content non-nullable) : la fixture post()
// produit des FeedPostRecord — le cast reflète le contrat du JSON Go.
const toFeedPost = (p: FeedPostRecord): FeedPost => p as unknown as FeedPost;

function slice(overrides: Partial<FeedSlice> = {}): FeedSlice {
  return {
    id: 'slice_1',
    rootPost: null,
    parentPost: null,
    targetPost: toFeedPost(post({ id: 'target_1', content: 'Pensée cible' })),
    isIncompleteThread: false,
    hiddenIntermediateCount: 0,
    ...overrides,
  };
}

function pollFixture(): FeedPoll {
  return {
    id: 'poll_1',
    thoughtId: 'post_1',
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    options: [
      { id: 'opt_a', text: 'A', order: 0, _count: { votes: 60 } },
      { id: 'opt_b', text: 'B', order: 1, _count: { votes: 40 } },
    ],
    votes: [{ optionId: 'opt_a', userId: 'u1' }],
  };
}

// Le cache moteur est module-level : on isole chaque test avec des clés
// (offset) distinctes pour éviter les interférences.
let engineCalls = 0;
let hydrateCalls = 0;

function engineOk(items: unknown[], hasMore = false) {
  return async (path: string) => {
    if (path.startsWith('/v1/feed/personalized')) {
      engineCalls += 1;
      return { items, hasMore };
    }
    if (path === '/v1/feed/hydrate') {
      hydrateCalls += 1;
      return { articles: [], thoughts: [] };
    }
    throw new Error(`path inattendu: ${path}`);
  };
}

beforeEach(() => {
  engineCalls = 0;
  hydrateCalls = 0;
  goFetchMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── mapPublicationToAuthor ──────────────────────────────────────────────────

describe('mapPublicationToAuthor', () => {
  it('PERSONAL : l’avatar de l’auteur prime sur le logo de la publication', () => {
    const out = mapPublicationToAuthor(
      { ...basePublication, type: 'PERSONAL' },
      'Alice',
      'author-avatar.png'
    );
    expect(out.logoUrl).toBe('author-avatar.png');
    expect(out.name).toBe('La Gazette');
    expect(out.username).toBe('la-gazette');
    expect(out.authorName).toBe('Alice');
    expect(out.type).toBe('PERSONAL');
  });

  it('PERSONAL sans avatar auteur : repli sur le logo de la publication', () => {
    const out = mapPublicationToAuthor({ ...basePublication, type: 'PERSONAL' });
    expect(out.logoUrl).toBe('gazette.png');
    expect(out.authorName).toBeNull();
    expect(out.heroText).toBe('Toute l’actu');
  });

  it('MEDIA : le logo de la publication est toujours utilisé', () => {
    const out = mapPublicationToAuthor(basePublication, 'Alice', 'author-avatar.png');
    expect(out.logoUrl).toBe('gazette.png');
    expect(out.isCertified).toBe(true);
  });

  it('défauts : isCertified false et heroText null quand absents', () => {
    const out = mapPublicationToAuthor({
      ...basePublication,
      isCertified: undefined as unknown as boolean,
      heroText: null,
    });
    expect(out.isCertified).toBe(false);
    expect(out.heroText).toBeNull();
  });
});

// ── mapQuotedArticle ────────────────────────────────────────────────────────

describe('mapQuotedArticle', () => {
  it('null → null', () => {
    expect(mapQuotedArticle(null)).toBeNull();
  });

  it('mappe l’article cité (auteur depuis publication)', () => {
    const quoted = {
      id: 'qa1',
      title: 'Un titre',
      slug: 'un-titre',
      content: 'Contenu cité',
      isPremium: true,
      publication: { ...basePublication, subdomain: null, logoUrl: 'pub-logo.png' },
      author: { id: 'ua1', name: 'Bob', username: 'bob', logoUrl: null, isCertified: false },
    } as NonNullable<FeedPostRecord['quotedArticle']>;
    const out = mapQuotedArticle(quoted);
    expect(out).toMatchObject({
      id: 'qa1',
      title: 'Un titre',
      slug: 'un-titre',
      content: 'Contenu cité',
      isPremium: true,
    });
    expect(out?.author).toEqual({
      id: 'ua1',
      name: 'Bob',
      username: 'bob',
      subdomain: null,
      logoUrl: 'pub-logo.png',
      // isCertified vient de la publication (parité avec le mapping).
      isCertified: true,
    });
  });
});

// ── mapPostToFeedItem ───────────────────────────────────────────────────────

describe('mapPostToFeedItem', () => {
  it('mappe un micro-post simple', () => {
    const out = mapPostToFeedItem(post());
    expect(out).toMatchObject({
      id: 'post_1',
      title: '',
      slug: 'post-post_1',
      content: 'Salut le monde',
      imageUrl: null,
      published: true,
      isPremium: false,
      readingTime: 1,
      createdAt: '2026-08-01T10:00:00.000Z',
      category: { name: 'Micro-post' },
      tags: [],
      likesCount: 0,
      repliesCount: 0,
      repostsCount: 0,
      liked: false,
      reposted: false,
    });
    expect(out.author.isCertified).toBe(true);
    expect(out.parent).toBeNull();
    expect(out.repost).toBeNull();
    expect(out.poll).toBeNull();
  });

  it('normalise les dates Date ET string, et imageUrl vide → null', () => {
    const asDate = mapPostToFeedItem(post());
    expect(asDate.createdAt).toBe('2026-08-01T10:00:00.000Z');

    const asString = mapPostToFeedItem(post({ createdAt: '2026-08-02T10:00:00Z' }));
    expect(asString.createdAt).toBe('2026-08-02T10:00:00.000Z');

    const emptyImage = mapPostToFeedItem(post({ imageUrl: '' }));
    expect(emptyImage.imageUrl).toBeNull();
  });

  it('sans createdAt (runtime) → chaîne vide', () => {
    const out = mapPostToFeedItem(post({ createdAt: undefined as unknown as Date }));
    expect(out.createdAt).toBe('');
  });

  it('liked quand la liste de likes du post (ou du repost canonique) est non vide', () => {
    expect(mapPostToFeedItem(post({ likes: [{ userId: 'u9' }] })).liked).toBe(true);

    const repostedPost = post({
      likes: [],
      repost: post({ id: 'r1', content: 'original', likes: [{ userId: 'u9' }] }),
    });
    expect(mapPostToFeedItem(repostedPost).liked).toBe(true);
  });

  it('reposted quand un repost sans contenu existe sur le post ou le canonique', () => {
    expect(mapPostToFeedItem(post({ reposts: [{ id: 'rr1', content: '' }] })).reposted).toBe(true);
    expect(mapPostToFeedItem(post({ reposts: [{ id: 'rr1', content: '   ' }] })).reposted).toBe(
      true
    );
    expect(
      mapPostToFeedItem(post({ reposts: [{ id: 'rr1', content: 'avec commentaire' }] })).reposted
    ).toBe(false);

    const viaRepost = post({
      reposts: [],
      repost: post({ id: 'r1', content: 'orig', reposts: [{ id: 'rr2', content: null }] }),
    });
    expect(mapPostToFeedItem(viaRepost).reposted).toBe(true);
  });

  it('les compteurs viennent du repost canonique quand présent', () => {
    const out = mapPostToFeedItem(
      post({
        _count: { likes: 1, replies: 1, reposts: 1 },
        repost: post({
          id: 'r1',
          content: 'original',
          _count: { likes: 42, replies: 7, reposts: 3 },
        }),
      })
    );
    expect(out.likesCount).toBe(42);
    expect(out.repliesCount).toBe(7);
    expect(out.repostsCount).toBe(3);
    expect(out.repost?.id).toBe('r1');
    expect(out.repost?.createdAt).toBe('2026-08-01T10:00:00.000Z');
  });

  it('repost sans createdAt → repli sur la date du post', () => {
    const out = mapPostToFeedItem(
      post({
        createdAt: '2026-08-03T10:00:00Z',
        repost: post({ id: 'r1', content: 'orig', createdAt: undefined as unknown as Date }),
      })
    );
    expect(out.repost?.createdAt).toBe('2026-08-03T10:00:00.000Z');
  });

  it('parent mappé avec dates et isCertified par défaut', () => {
    const out = mapPostToFeedItem(
      post({
        parent: {
          id: 'parent_1',
          content: 'parent content',
          createdAt: new Date('2026-07-01T10:00:00Z'),
          author: { id: 'u2', name: null, username: null, logoUrl: null, isCertified: false },
        },
      })
    );
    expect(out.parent).toMatchObject({
      id: 'parent_1',
      content: 'parent content',
      createdAt: '2026-07-01T10:00:00.000Z',
    });
    expect(out.parent?.author.isCertified).toBe(false);
  });

  it('quotedExcerpt : celui du post prime, sinon celui du repost canonique', () => {
    expect(mapPostToFeedItem(post({ quotedExcerpt: 'extrait' })).quotedExcerpt).toBe('extrait');
    expect(
      mapPostToFeedItem(
        post({
          quotedExcerpt: null,
          repost: post({ id: 'r1', content: 'orig', quotedExcerpt: 'extrait canonique' }),
        })
      ).quotedExcerpt
    ).toBe('extrait canonique');
    expect(mapPostToFeedItem(post()).quotedExcerpt).toBeUndefined();
  });

  it('article cité mappé (post ou canonique)', () => {
    const quoted = {
      id: 'qa1',
      title: 'Titre cité',
      slug: 'titre-cite',
      content: '…',
      isPremium: false,
      publication: { ...basePublication },
      author: { ...baseAuthor },
    } as NonNullable<FeedPostRecord['quotedArticle']>;
    const fromPost = mapPostToFeedItem(post({ quotedArticle: quoted }));
    expect(fromPost.articleQuote?.id).toBe('qa1');

    const fromRepost = mapPostToFeedItem(
      post({
        quotedArticle: null,
        repost: post({ id: 'r1', content: 'orig', quotedArticle: quoted }),
      })
    );
    expect(fromRepost.articleQuote?.id).toBe('qa1');
  });

  it('poll formaté (canonique d’abord) avec le vote de l’utilisateur courant', () => {
    const p = pollFixture();
    const onPost = mapPostToFeedItem(post({ poll: p }), 'u1');
    expect(onPost.poll?.totalVotes).toBe(100);
    expect(onPost.poll?.userVotedOptionId).toBe('opt_a');

    const onRepost = mapPostToFeedItem(
      post({ poll: null, repost: post({ id: 'r1', content: 'orig', poll: p }) }),
      'u1'
    );
    expect(onRepost.poll?.id).toBe('poll_1');

    const noVote = mapPostToFeedItem(post({ poll: p }), 'someone_else');
    expect(noVote.poll?.userVotedOptionId).toBeNull();
  });

  it('tags null → []', () => {
    expect(mapPostToFeedItem(post({ tags: null })).tags).toEqual([]);
    expect(mapPostToFeedItem(post({ tags: ['a'] })).tags).toEqual(['a']);
  });
});

// ── mapArticleToFeedItem ────────────────────────────────────────────────────

describe('mapArticleToFeedItem', () => {
  it('mappe un article complet', () => {
    const out = mapArticleToFeedItem(article());
    expect(out).toMatchObject({
      id: 'art1',
      title: 'Titre',
      slug: 'titre',
      isPremium: false,
      tags: ['foot', 'liga'],
      createdAt: '2026-08-01T10:00:00.000Z',
    });
    expect(out.author.username).toBe('la-gazette');
    expect(out.author.logoUrl).toBe('gazette.png');
    expect(out.author.journalist).toEqual({ ...baseAuthor });
    expect(out.author.contributors).toEqual([]);
    expect(out.author.coAuthors).toEqual([]);
  });

  it('normalise une createdAt Date', () => {
    const out = mapArticleToFeedItem(article({ createdAt: new Date('2026-08-05T10:00:00Z') }));
    expect(out.createdAt).toBe('2026-08-05T10:00:00.000Z');
  });

  it('PERSONAL : logo auteur prioritaire', () => {
    const out = mapArticleToFeedItem(
      article({
        publication: { ...basePublication, type: 'PERSONAL', logoUrl: 'pub.png' },
        author: { ...baseAuthor, logoUrl: 'author.png' },
      })
    );
    expect(out.author.logoUrl).toBe('author.png');
  });

  it('journalist null quand author est absent (runtime)', () => {
    const out = mapArticleToFeedItem(article({ author: undefined }));
    expect(out.author.journalist).toBeNull();
  });

  it('coAuthors : gardés quand aucune attribution, filtrés sinon (ACCEPTED + visible)', () => {
    const ca1 = { id: 'ca1', name: 'CoA', username: 'coa', logoUrl: null, isCertified: false };
    const ca2 = { id: 'ca2', name: 'CoB', username: 'cob', logoUrl: null, isCertified: false };
    const noAttributions = mapArticleToFeedItem(article({ coAuthors: [ca1, ca2] }));
    expect(noAttributions.author.coAuthors).toHaveLength(2);

    const withAttributions = mapArticleToFeedItem(
      article({
        coAuthors: [ca1, ca2],
        attributions: [
          {
            user: ca1,
            role: 'EDITOR',
            order: 1,
            isVisible: true,
            consentStatus: 'ACCEPTED',
          },
          {
            user: ca2,
            role: 'EDITOR',
            order: 2,
            isVisible: true,
            consentStatus: 'PENDING',
          },
        ],
      })
    );
    expect(withAttributions.author.coAuthors.map((c) => c.id)).toEqual(['ca1']);
  });

  it('contributors : seulement ACCEPTED + isVisible, avec rôle et ordre', () => {
    const uA = { id: 'ua1', name: 'A', username: 'a', logoUrl: null, isCertified: false };
    const uB = { id: 'ua2', name: 'B', username: 'b', logoUrl: null, isCertified: false };
    const out = mapArticleToFeedItem(
      article({
        attributions: [
          { user: uA, role: 'AUTHOR', order: 0, isVisible: true, consentStatus: 'ACCEPTED' },
          { user: uB, role: 'AUTHOR', order: 1, isVisible: true, consentStatus: 'PENDING' },
          { user: uB, role: 'GHOST', order: 2, isVisible: false, consentStatus: 'ACCEPTED' },
        ],
      })
    );
    expect(out.author.contributors).toHaveLength(1);
    expect(out.author.contributors[0]).toMatchObject({
      id: 'ua1',
      role: 'AUTHOR',
      order: 0,
      isVisible: true,
      consentStatus: 'ACCEPTED',
    });
  });
});

// ── mapSliceToFeedItem ──────────────────────────────────────────────────────

describe('mapSliceToFeedItem', () => {
  it('mappe un slice avec targetPost et threads optionnels', () => {
    const out = mapSliceToFeedItem(slice());
    expect(out).toMatchObject({
      id: 'slice_1',
      title: '',
      slug: 'post-slice_1',
      createdAt: '2026-08-01T10:00:00.000Z',
      isIncompleteThread: false,
      hiddenIntermediateCount: 0,
    });
    expect(out.targetPost.id).toBe('target_1');
    expect(out.parentPost).toBeNull();
    expect(out.rootPost).toBeNull();
  });

  it('thread complet : parentPost et rootPost mappés, createdAt string conservée', () => {
    const out = mapSliceToFeedItem(
      slice({
        parentPost: toFeedPost(post({ id: 'parent_1', content: 'parent' })),
        rootPost: toFeedPost(post({ id: 'root_1', content: 'root' })),
        isIncompleteThread: true,
        hiddenIntermediateCount: 3,
      })
    );
    // La cible a une Date → ISO ; les autres posts du slice aussi.
    expect(out.createdAt).toBe('2026-08-01T10:00:00.000Z');
    expect(out.parentPost?.id).toBe('parent_1');
    expect(out.rootPost?.id).toBe('root_1');
    expect(out.isIncompleteThread).toBe(true);
    expect(out.hiddenIntermediateCount).toBe(3);
  });

  it('targetPost createdAt string → conservée telle quelle', () => {
    const out = mapSliceToFeedItem(
      slice({ targetPost: toFeedPost(post({ id: 't2', createdAt: '2026-08-01T10:00:00Z' })) })
    );
    expect(out.createdAt).toBe('2026-08-01T10:00:00Z');
  });
});

// ── buildVectorFeedPage ─────────────────────────────────────────────────────

describe('buildVectorFeedPage', () => {
  it('moteur indisponible → repli feed vide + nextOffset inchangé + warn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    goFetchMock.mockImplementation(async () => {
      throw new Error('engine down');
    });
    return buildVectorFeedPage({ offset: 5 }).then((res) => {
      expect(res).toEqual({ items: [], hasMore: false, nextOffset: 5 });
      expect(warn).toHaveBeenCalled();
    });
  });

  it('hydratation indisponible → items vides mais hasMore préservé + warn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    goFetchMock.mockImplementation(async (path: string) => {
      if (path.startsWith('/v1/feed/personalized')) return { items: [], hasMore: true };
      throw new Error('hydrate down');
    });
    return buildVectorFeedPage({ offset: 3 }).then((res) => {
      expect(res).toEqual({ items: [], hasMore: true, nextOffset: 3 });
      expect(warn).toHaveBeenCalled();
    });
  });

  it('résout articles + pensées dans l’ordre du moteur, isDiscovery transporté, ids inconnus ignorés', async () => {
    const fullArticle = article({ id: 'a1', title: 'Article A' });
    const thoughtSlice = slice({
      id: 't1',
      targetPost: toFeedPost(post({ id: 'tp1', content: 'Pensée 1' })),
    });
    goFetchMock.mockImplementation(async (path: string) => {
      if (path.startsWith('/v1/feed/personalized')) {
        engineCalls += 1;
        return {
          items: [
            { itemType: 'ARTICLE', id: 'a1', isDiscovery: true },
            { itemType: 'ARTICLE', id: 'missing' },
            { itemType: 'THOUGHT', id: 't1' },
          ],
          hasMore: false,
        };
      }
      return { articles: [fullArticle], thoughts: [thoughtSlice] };
    });

    const res = await buildVectorFeedPage({ userId: 'u1', offset: 0 });
    expect(res.items).toHaveLength(2);
    expect(res.items[0].id).toBe('a1');
    expect(res.items[0]).toMatchObject({ title: 'Article A', isDiscovery: true });
    expect(res.items[1].id).toBe('t1');
    expect(res.items[1]).toMatchObject({ slug: 'post-t1' });
    expect(res.nextOffset).toBe(2);
  });

  it('ne renvoie jamais plus de `limit` items et hydrate seulement la page tronquée', async () => {
    goFetchMock.mockImplementation(async (path: string) => {
      if (path.startsWith('/v1/feed/personalized')) {
        engineCalls += 1;
        return {
          items: [
            { itemType: 'ARTICLE', id: 'a1' },
            { itemType: 'ARTICLE', id: 'a2' },
          ],
          hasMore: true,
        };
      }
      return { articles: [article({ id: 'a1' }), article({ id: 'a2' })], thoughts: [] };
    });

    const res = await buildVectorFeedPage({ limit: 1, offset: 10 });
    expect(res.items).toHaveLength(1);
    expect(res.items[0].id).toBe('a1');
    expect(res.hasMore).toBe(true);
    expect(res.nextOffset).toBe(11);

    const hydrateCall = goFetchMock.mock.calls.find(([p]) => p === '/v1/feed/hydrate');
    expect(hydrateCall?.[1]?.body).toEqual({
      items: [{ itemType: 'ARTICLE', id: 'a1' }],
    });
  });

  it('params par défaut : limit 20, offset 0, pas de userId dans la requête', async () => {
    goFetchMock.mockImplementation(engineOk([]));
    await buildVectorFeedPage({});
    const engineCall = goFetchMock.mock.calls.find(([p]) => p.startsWith('/v1/feed/personalized'));
    expect(engineCall?.[0]).toContain('limit=20');
    expect(engineCall?.[0]).toContain('offset=0');
    expect(engineCall?.[0]).toContain('userHour=');
    expect(engineCall?.[0]).not.toContain('userId=');
  });

  it('userId transmis au moteur', async () => {
    goFetchMock.mockImplementation(engineOk([]));
    await buildVectorFeedPage({ userId: 'user1' });
    const engineCall = goFetchMock.mock.calls.find(([p]) => p.startsWith('/v1/feed/personalized'));
    expect(engineCall?.[0]).toContain('userId=user1');
  });

  it('cache moteur : une seconde requête identique ne refait pas l’appel Go', async () => {
    goFetchMock.mockImplementation(engineOk([]));
    await buildVectorFeedPage({ userId: 'cache-u', limit: 5, offset: 40 });
    await buildVectorFeedPage({ userId: 'cache-u', limit: 5, offset: 40 });
    expect(engineCalls).toBe(1);
    expect(hydrateCalls).toBe(2);
  });

  it('cache moteur : entrée expirée après 60 s → re-fetch', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      goFetchMock.mockImplementation(engineOk([]));
      await buildVectorFeedPage({ userId: 'ttl-u', limit: 5, offset: 41 });
      expect(engineCalls).toBe(1);
      await vi.advanceTimersByTimeAsync(61_000);
      await buildVectorFeedPage({ userId: 'ttl-u', limit: 5, offset: 41 });
      expect(engineCalls).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cache moteur : éviction LRU au-delà de 500 entrées (l’ancienne est re-fetchée)', async () => {
    goFetchMock.mockImplementation(engineOk([]));
    // 501 clés distinctes → la plus ancienne (offset 100) est évincée.
    for (let offset = 100; offset <= 600; offset += 1) {
      await buildVectorFeedPage({ limit: 1, offset });
    }
    expect(engineCalls).toBe(501);
    // Re-demander la clé la plus ancienne → miss → nouvel appel Go.
    await buildVectorFeedPage({ limit: 1, offset: 100 });
    expect(engineCalls).toBe(502);
  });
});
