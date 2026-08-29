import { describe, it, expect } from 'vitest';
import { normalizeThought, resolveDisplay, type NormalizedThought } from './normalize';

describe('normalizeThought', () => {
  it('laisse intacte une pensée déjà normalisée', () => {
    const already: NormalizedThought = {
      id: 'n1',
      content: 'salut',
      createdAt: '2026-08-01',
      author: {
        id: 'a',
        name: 'A',
        username: 'a',
        logoUrl: null,
        isCertified: false,
        isFollowing: false,
      },
      liked: true,
      reposted: false,
      likeCount: 3,
      repostCount: 0,
      replyCount: 1,
      imageUrl: null,
      isPinned: false,
      isHiddenByAuthor: false,
      replyRestriction: 'everyone',
      parentId: null,
      rootId: null,
      repostId: null,
      parent: null,
      repost: null,
      poll: null,
      attachments: [],
      tags: [],
    };
    expect(normalizeThought(already)).toBe(already);
  });

  it('normalise une FeedPost (shape _count) en remplissant les defaults', () => {
    const fp: any = {
      id: 'p1',
      content: 'hello',
      createdAt: '2026-08-02',
      author: { id: 'a', username: 'u', logoUrl: null, isCertified: true },
      _count: { likes: 5, replies: 2, reposts: 1 },
      tags: ['tech'],
    };
    const n = normalizeThought(fp);
    expect(n.content).toBe('hello');
    expect(n.liked).toBe(false);
    expect(n.reposted).toBe(false);
    expect(n.likeCount).toBe(5);
    expect(n.replyCount).toBe(2);
    expect(n.repostCount).toBe(1);
    expect(n.author.isCertified).toBe(true);
    expect(n.author.isFollowing).toBe(false);
    expect(n.tags).toEqual(['tech']);
    expect(n.parentId).toBeNull();
    expect(n.replyRestriction).toBe('everyone');
  });

  it('normalise une ThoughtData legacy (isLiked/isReposted)', () => {
    const td: any = {
      id: 't1',
      content: 'legacy',
      createdAt: '2026-08-03',
      author: { id: 'a' },
      isLiked: true,
      likeCount: 9,
      isReposted: true,
      repostCount: 4,
    };
    const n = normalizeThought(td);
    expect(n.liked).toBe(true);
    expect(n.reposted).toBe(true);
    expect(n.likeCount).toBe(9);
    expect(n.attachments).toEqual([]);
    expect(n.poll).toBeNull();
  });

  it('normalise une FeedPost sans _count via l’objet autorisé (isNormalized bascule sur _count manquant)', () => {
    // Objet non-normalisé disposant d'un authorChain : type ThoughtData mais
    // sans _count → passe par normLegacy (likeCount défaut 0).
    const n: any = { id: 'x', content: 'x', createdAt: '2026-08-04', author: {} };
    const out = normalizeThought(n);
    expect(out.likeCount).toBe(0);
    expect(out.id).toBe('x');
  });
});

describe('resolveDisplay', () => {
  function base(overrides: Partial<NormalizedThought>): NormalizedThought {
    return {
      id: 'base',
      content: '',
      createdAt: '2026-08-01',
      author: {
        id: 'a',
        name: null,
        username: null,
        logoUrl: null,
        isCertified: false,
        isFollowing: false,
      },
      liked: false,
      reposted: false,
      likeCount: 0,
      repostCount: 0,
      replyCount: 0,
      imageUrl: null,
      isPinned: false,
      isHiddenByAuthor: false,
      replyRestriction: 'everyone',
      parentId: null,
      rootId: null,
      repostId: null,
      parent: null,
      repost: null,
      poll: null,
      attachments: [],
      tags: [],
      ...overrides,
    };
  }

  it('repost pur (texte vide) → affiche le post d’origine', () => {
    const reposted = base({ id: 'post', content: 'origine', repostId: 'orig' });
    const { display, quoted, isPureRepost } = resolveDisplay(
      base({ id: 'repost', repost: reposted })
    );
    expect(isPureRepost).toBe(true);
    expect(quoted).toBeNull();
    expect(display.id).toBe('post');
  });

  it('citation (texte + repost) → affiche son texte + la carte citée', () => {
    const reposted = base({ id: 'orig', content: 'citation' });
    const post = base({ id: 'quote', content: 'mon avis', repostId: 'orig', repost: reposted });
    const { display, quoted, isPureRepost } = resolveDisplay(post);
    expect(isPureRepost).toBe(false);
    expect(display.id).toBe('quote');
    expect(quoted?.id).toBe('orig');
  });

  it('post simple sans repost → s’affiche tel quel', () => {
    const post = base({ id: 'plain', content: 'bonjour' });
    const { display, quoted, isPureRepost } = resolveDisplay(post);
    expect(isPureRepost).toBe(false);
    expect(quoted).toBeNull();
    expect(display.id).toBe('plain');
  });
});
